/** 回合处理管线：玩家输入 → 动作路由（系统指令代码结算 / 自由行动 LLM）→ 新状态 + 剧情条目
 *  代码是数值的唯一权威；LLM 只负责自由行动叙事与选项。 */

import type { GameState } from '../state'
import type { NarratorSettings } from '../state'
import type { SceneThemeKey } from '../../ui/theme'
import { callNarrator, narrateSystem, sanitizeOptions, buildSystemPrompt, isOfflineError } from '../narrator/llm'
import { routeCommand, executeSystem, resolveOpening } from './actions'
import { advanceTime, fmtTimeShort } from './time'
import { WORLD_BIBLE } from '../data/worldview'
import { NPCS } from '../data/world'
import { ENLIGHTENMENT_BRANCHES, TECHNIQUES } from '../data/systems'

export interface LogEntry {
  id: number
  time: string
  narrative: string
  options: { text: string; tag?: string }[]
  scene?: SceneThemeKey
  deltas?: string[]
  /** 玩家本回合的输入（供 LLM 历史重建） */
  action?: string
  /** 处理引擎：llm=AI 演绎 / code=代码模板 / offline=离线兜底 */
  engine?: 'llm' | 'code' | 'offline'
  /** 本回合流逝月数（0=未流逝；供 UI 展示，便于核对时间来源） */
  passedMonths?: number
}

export interface TurnInput {
  state: GameState
  action: string
  history: { role: 'user' | 'assistant'; content: string }[]
  /** 当前剧情流（事件快照需要写入事件前的剧情） */
  log?: LogEntry[]
}

export interface TurnOutput {
  state: GameState
  narrative: string
  options: { text: string; tag?: string }[]
  scene?: SceneThemeKey
  deltas?: string[]
  timePassedMonths: number
  engine: 'llm' | 'code' | 'offline'
}

let seq = 0
export function nextId(): number {
  return ++seq
}

/** 世界快照：压缩成 LLM 可读的上下文（对应原文「世界进度备忘录」） */
export function buildWorldSnapshot(state: GameState): string {
  const p = state.player
  const r = state.res
  const t = state.timeline
  return [
    `回合#${state.turn} 天玄历${t.calendarYear}年${t.month}月（入道${t.year}年）`,
    `道号${p.daoName}（${p.name}）· ${p.gender} · ${p.age}岁`,
    `境界 ${p.realm}·${p.stage} · ${p.sect} · 仙姿${p.appearance}`,
    `六维 资质${p.stats.zizhi} 悟性${p.stats.wuxing} 神识${p.stats.shenshi} 遁速${p.stats.dunsu} 道心${p.stats.daoxin} 仙缘${p.stats.xianyuan}`,
    `气血${r.hp}/${r.hpMax} 灵力${r.mp}/${r.mpMax} 修为${r.cult}/${r.cultMax} 寿元${r.lifespan}/${r.lifespanMax}`,
    `灵石${r.spirit} 功德${r.merit} 业力${r.karma}${r.injury ? ` 受伤:${r.injury}` : ''}`,
    `所在地 ${state.flags.location ?? '东洲·青岳'} · 时节${t.month}月 · 主线：${state.mainQuest || '无'}`,
    `功法：${state.gongfaIds.join('、') || '无'} 技艺：${Object.entries(state.techniqueLevels).map(([k, v]) => `${k}${v}`).join('、') || '无'}`,
    `关系：${Object.entries(state.relationships).map(([k, v]) => `${k}:${v}`).join('、') || '无'}`,
  ].join('\n')
}

/** deltas 字段别名（模型常输出拼音/中文键）与标签 */
const DELTA_ALIASES: Record<string, string> = {
  hp: 'hp', 气血: 'hp', qi: 'hp', qixue: 'hp',
  mp: 'mp', 灵力: 'mp', lingli: 'mp', fa: 'mp',
  cult: 'cult', 修为: 'cult', xiwei: 'cult', xiuwei: 'cult',
  spirit: 'spirit', 灵石: 'spirit', lingshi: 'spirit',
  merit: 'merit', 功德: 'merit', gongde: 'merit',
  karma: 'karma', 业力: 'karma', yeli: 'karma',
  lifespan: 'lifespan', 寿元: 'lifespan', shouyuan: 'lifespan',
}
const DELTA_LABELS: Record<string, string> = { hp: '气血', mp: '灵力', cult: '修为', spirit: '灵石', merit: '功德', karma: '业力', lifespan: '寿元' }
/** 0~max 型字段（支持绝对值语义） */
const RANGED_FIELDS = new Set(['hp', 'mp', 'cult', 'lifespan'])

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return n
  }
  return null
}

/** 校验并应用 LLM 的数值变更：字段别名映射、增量/绝对值双语义、钳制、上限封顶、不为负 */
export function applyDeltas(state: GameState, deltas?: Record<string, unknown>): { state: GameState; applied: string[] } {
  if (!deltas) return { state, applied: [] }
  const res = { ...state.res }
  const applied: string[] = []
  for (const [key, raw] of Object.entries(deltas)) {
    const field = DELTA_ALIASES[key.toLowerCase ? key.toLowerCase() : key] ?? DELTA_ALIASES[key]
    if (!field || typeof field !== 'string') continue
    const v = toNumber(raw)
    if (v === null || v === 0) continue
    const before = res[field as keyof typeof res] as number
    const max = (res[`${field}Max` as keyof typeof res] ?? Infinity) as number
    let next: number
    if (RANGED_FIELDS.has(field)) {
      // 0~max 字段：负值=增量减；正值>当前=增量加（封顶）；0<=正值<=当前=绝对值（设为该值，模型常把"剩余值"写成绝对值）
      next = v < 0 ? before + v : v > before ? Math.min(before + v, max) : v
      next = Math.max(0, Math.min(next, max))
    } else {
      // 无上限字段（灵石/功德/业力）：增量语义（负减正加）
      next = Math.max(0, before + v)
    }
    if (next !== before) {
      res[field as keyof typeof res] = next as never
      const label = DELTA_LABELS[field] ?? field
      applied.push(`${label} ${before}→${next}`)
    }
  }
  let s = { ...state, res }
  // ── 六维属性（资质/悟性/神识/遁速/道心/仙缘，1~20）──
  const STAT_ALIASES: Record<string, keyof GameState['player']['stats']> = {
    资质: 'zizhi', zizhi: 'zizhi', 悟性: 'wuxing', wuxing: 'wuxing',
    神识: 'shenshi', shenshi: 'shenshi', 遁速: 'dunsu', dunsu: 'dunsu',
    道心: 'daoxin', daoxin: 'daoxin', 仙缘: 'xianyuan', xianyuan: 'xianyuan',
  }
  const rawStats = deltas.stats ?? deltas.属性
  if (rawStats && typeof rawStats === 'object') {
    const stats = { ...s.player.stats }
    for (const [k, rv] of Object.entries(rawStats as Record<string, unknown>)) {
      const key = k.toLowerCase ? k.toLowerCase() : k
      const f = STAT_ALIASES[key] ?? STAT_ALIASES[k]
      if (!f) continue
      const v = toNumber(rv)
      if (v === null || v === 0) continue
      const before = stats[f]
      const next = Math.max(1, Math.min(20, before + Math.round(v)))
      if (next !== before) {
        stats[f] = next
        applied.push(`${f} ${before}→${next}`)
      }
    }
    s = { ...s, player: { ...s.player, stats } }
  }
  // ── 好感（relationships，0~100，按 NPC 名/id）──
  const rawAff = deltas.affinity ?? deltas.好感 ?? deltas.relationships
  if (rawAff && typeof rawAff === 'object') {
    const rel = { ...s.relationships }
    for (const [k, rv] of Object.entries(rawAff as Record<string, unknown>)) {
      const npc = NPCS.find((n) => n.id === k || n.name === k || k.includes(n.name))
      if (!npc) continue
      const v = toNumber(rv)
      if (v === null || v === 0) continue
      const before = rel[npc.id] ?? 0
      const next = Math.max(0, Math.min(100, before + Math.round(v)))
      if (next !== before) {
        rel[npc.id] = next
        applied.push(`${npc.name}好感 ${before}→${next}`)
      }
    }
    s = { ...s, relationships: rel }
  }
  // ── 背包物品（bag：正加负减，不为负）──
  const rawBag = deltas.bag ?? deltas.物品 ?? deltas.items
  if (rawBag && typeof rawBag === 'object') {
    const bag = { ...s.bag }
    for (const [k, rv] of Object.entries(rawBag as Record<string, unknown>)) {
      const v = toNumber(rv)
      if (v === null || v === 0) continue
      const n = Math.round(v)
      const before = bag[k] ?? 0
      const next = Math.max(0, before + n)
      if (next !== before) {
        bag[k] = next
        if (next === 0) delete bag[k]
        applied.push(`${k} ×${before}→${next}`)
      }
    }
    s = { ...s, bag }
  }
  // ── 异常状态（injury：字符串或 null 清除；status：附加/清空）──
  if ('injury' in deltas || '伤势' in deltas) {
    const raw = deltas.injury ?? deltas.伤势
    const next = raw === null || raw === undefined || raw === '无' || raw === 'none' ? null : String(raw).slice(0, 20)
    if (next !== s.res.injury) {
      s = { ...s, res: { ...s.res, injury: next } }
      applied.push(`状态 ${s.res.injury ?? '无'}→${next ?? '无'}`)
    }
  }
  if ('status' in deltas || '异常' in deltas) {
    const raw = deltas.status ?? deltas.异常
    if (Array.isArray(raw)) {
      const next = raw.map((x) => String(x).slice(0, 12)).filter(Boolean)
      s = { ...s, res: { ...s.res, statusEffects: [...new Set(next)] } }
      applied.push(`异常 ${next.join('、') || '无'}`)
    }
  }
  // ── 心境（mood：0.5/1.0/1.2）──
  if ('mood' in deltas || '心境' in deltas) {
    const v = toNumber(deltas.mood ?? deltas.心境)
    if (v !== null) {
      const next = v >= 1.1 ? 1.2 : v <= 0.7 ? 0.5 : 1.0
      if (next !== s.res.mood) {
        s = { ...s, res: { ...s.res, mood: next } }
        applied.push(`心境 ${s.res.mood}→${next}`)
      }
    }
  }
  // ── 悟道（enlightenment：1~9）／技艺（technique：1~5）──
  const rawEnl = deltas.enlightenment ?? deltas.悟道
  if (rawEnl && typeof rawEnl === 'object') {
    const enl = { ...s.enlightenment }
    for (const [k, rv] of Object.entries(rawEnl as Record<string, unknown>)) {
      const branch = ENLIGHTENMENT_BRANCHES.find((b) => b === k || k.includes(b) || b.includes(k))
      if (!branch) continue
      const v = toNumber(rv)
      if (v === null || v === 0) continue
      const before = enl[branch] ?? 0
      const next = Math.max(1, Math.min(9, before + Math.round(v)))
      if (next !== before) {
        enl[branch] = next
        applied.push(`${branch}悟道 ${before}→${next}`)
      }
    }
    s = { ...s, enlightenment: enl }
  }
  const rawTech = deltas.technique ?? deltas.技艺
  if (rawTech && typeof rawTech === 'object') {
    const tech = { ...s.techniqueLevels }
    for (const [k, rv] of Object.entries(rawTech as Record<string, unknown>)) {
      const t = TECHNIQUES.find((x) => x.id === k || x.name === k || k.includes(x.name))
      if (!t) continue
      const v = toNumber(rv)
      if (v === null || v === 0) continue
      const before = tech[t.id] ?? 0
      const next = Math.max(1, Math.min(5, before + Math.round(v)))
      if (next !== before) {
        tech[t.id] = next
        applied.push(`${t.name} ${before}→${next}`)
      }
    }
    s = { ...s, techniqueLevels: tech }
  }
  return applied.length ? { state: s, applied } : { state, applied: [] }
}

/** 中文数字（一~九十九/阿拉伯数字）转数值 */
function cnToNum(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s)
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  if (s === '十') return 10
  if (s.length === 2 && s[0] === '十') return 10 + (digits[s[1]] ?? 0)
  if (s.length === 2 && s[1] === '十') return (digits[s[0]] ?? 0) * 10
  if (s.length === 3 && s[1] === '十') return (digits[s[0]] ?? 0) * 10 + (digits[s[2]] ?? 0)
  return digits[s] ?? null
}

/** 从 AI 叙事中推断流逝月数：AI 叙述提到「几日/数日/半月/旬/数月/月余/半年/一年」等时间表述时，
 *  自动折算成小额月数（小数月会跨回合累积，见 applyAging）。多表述并存时取最大（避免重复计数）。
 *  绝对纪年（天玄历 N 年 / 入道 N 年 / 境界 N 年 / N 年一度）与回溯锚点（三年前/半月前）不计入。 */
export function inferTimeFromNarrative(narrative: string): number {
  if (!narrative) return 0
  // 先掩蔽绝对纪年/时间行（叙事开头必带，属当前时刻而非流逝）：
  // 天玄历 387 年 / 天玄历三百八十八年、入道三年 · 五月 / 入道第三年 · 五月、筑基元年 · 冬、炼气五年等。
  // 中文数字纪年必须覆盖（百/千/十/两），否则「三百八十八年」会被当成流逝 388 年 → 封顶 12 个月
  const CN_YEAR_NUM = '[一二三四五六七八九十百千万两\\d]+'
  const t = narrative
    .replace(new RegExp(`天玄历\\s*${CN_YEAR_NUM}\\s*年`, 'g'), '天玄历N年')
    .replace(new RegExp(`入道\\s*第?\\s*[元一二三四五六七八九十百千万两\\d]+\\s*年\\s*[·,，]?\\s*[一二三四五六七八九十两\\d]+\\s*月`, 'g'), '入道N年N月')
    .replace(new RegExp(`入道\\s*第?\\s*[元一二三四五六七八九十百千万两\\d]+\\s*年`, 'g'), '入道N年')
    .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*年/g, '第N年')
    .replace(/[\u4e00-\u9fa5]{1,4}元\s*年/g, 'X元年')
    // 仅掩蔽「境界名 + N年」的状态表述（炼气五年 = 当前境界年限，非流逝）；
    // 「闭关十年」「苦修五年」等行为性表述保留（是真实流逝）
    .replace(/(炼气|练气|筑基|结晶|金丹|具灵|元婴|化神|悟道|羽化|登仙)\s*[一二三四五六七八九十百千万两\d]+\s*年/g, 'X境界年')
  const candidates: number[] = []
  /** 跳过回溯锚点：表述后紧跟「前」字（三年前/半月前/一月之前…） */
  const isFlashback = (endIdx: number) => {
    const after = t.slice(endIdx, endIdx + 2)
    return after.includes('前')
  }
  // 年/载：N年 → N×12（N=1~12）；「N年一度」为频率表述（升仙大会五年一度）不计入
  for (const m of t.matchAll(/([一二三四五六七八九十两\d]+)\s*(?:年|载)(?!一度|一次|一回)/g)) {
    if (isFlashback(m.index! + m[0].length)) continue
    const n = cnToNum(m[1])
    if (n && n >= 1) candidates.push(Math.min(12, n * 12))
  }
  // 月：半年=6、半月=0.5、月余≈1.2、数月≈2.5、N月/N个月=N（1~12）
  const pushPhrase = (re: RegExp, v: number) => {
    for (const m of t.matchAll(re)) {
      if (isFlashback(m.index! + m[0].length)) continue
      candidates.push(v)
      break // 同一短语只计一次
    }
  }
  pushPhrase(/半年/g, 6)
  pushPhrase(/半月/g, 0.5)
  pushPhrase(/月余|月许|一月有余/g, 1.2)
  pushPhrase(/数月|几月|几个月/g, 2.5)
  // 裸「N月」有歧义：「五月端午」「三月桃花」是时节，「闭关三月」「三月后」才是流逝。
  // 策略：带「个」的「N个月」一定流逝；裸「N月」仅当前有行为/流逝语境词才算（否则视为时节不计）
  const DURATION_BEFORE = /(闭关|苦修|修炼|打坐|参悟|悟道|疗伤|养伤|赶路|游历|历练|云游|静养|守候|等待|滞留|炼丹|炼器|外出|跋涉|耗费|耗时|整整|足足|一晃|转眼)/
  const DURATION_AFTER = /(后|之后|过去|光景|之久|流逝|倏忽|弹指|眨眼)/
  for (const m of t.matchAll(/([一二三四五六七八九十两\d]+)\s*(?:个)?月/g)) {
    if (isFlashback(m.index! + m[0].length)) continue
    const n = cnToNum(m[1])
    if (!n || n < 1 || n > 12) continue
    const bare = !m[0].includes('个') // 裸 N月：无「个」字
    if (bare) {
      const before = t.slice(Math.max(0, m.index! - 2), m.index!)
      const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + 2)
      if (!DURATION_BEFORE.test(before) && !DURATION_AFTER.test(after)) continue // 时节（三月桃花）不计
    }
    candidates.push(n)
  }
  // 日/天/旬：旬≈1/3、N日/N天≈N/30（封顶1）、数日/几日/几天≈0.3
  pushPhrase(/旬|十来天/g, 1 / 3)
  pushPhrase(/数日|几日|几天|数天|些许时日/g, 0.3)
  for (const m of t.matchAll(/([一二三四五六七八九十两\d]+)\s*(?:日|天)/g)) {
    if (isFlashback(m.index! + m[0].length)) continue
    const n = cnToNum(m[1])
    if (n && n >= 1) candidates.push(Math.min(1, n / 30))
  }
  if (candidates.length === 0) return 0
  return Math.min(12, Math.max(...candidates))
}

/** 模糊时间迹象：叙事未写明确数字、但暗示时间流逝（许久/多日/光阴荏苒/春去秋来…）。
 *  有迹象时采信 AI 月数（AI 是语义权威）；无任何迹象时 AI 给的月数一律作废归 0（挡模型惯性 +1/+12） */
const VAGUE_TIME_RE =
  /许久|良久|多日|一段时|一段岁月|不知岁月|光阴荏苒|时光飞|岁月流|日月如梭|转瞬|倏忽|日久|些时日|不少时|时光匆匆|弹指|眨眼|寒来暑往|冬去春来|春去秋来/

/** 时间仲裁（统一口径）：① 明确数字短语 → 叙事折算（文本铁证）；② 模糊迹象 → 信 AI（AI 未给按 1 月）；③ 无迹象 → 0 */
function settleTime(narrative: string, aiMonths: number): number {
  const inferred = inferTimeFromNarrative(narrative)
  if (inferred > 0) return inferred
  if (VAGUE_TIME_RE.test(narrative)) return aiMonths > 0 ? aiMonths : 1
  return 0
}

/** 寿元对账：剩余寿元 = min(当前, 寿元上限 - 年龄)（修复旧档/创角期满寿元的偏差） */
export function reconcileLifespan(state: GameState): GameState {
  const cap = Math.max(0, state.res.lifespanMax - state.player.age)
  if (state.res.lifespan <= cap) return state
  return { ...state, res: { ...state.res, lifespan: cap } }
}

/** 衰老结算：每回合按流逝月数统一计算年龄/寿元（跨回合用 flags.ageMonths 累加余数），寿元耗尽 → 坐化
 *  与时间线推进共用同一累积口径：整月进时间线，不足一月的余数留 flags.ageMonths，避免「年龄涨了年份不动」的脱节 */
export function applyAging(state: GameState, months: number): GameState {
  if (months <= 0 || state.flags.dead) return state
  const acc = (typeof state.flags.ageMonths === 'number' ? state.flags.ageMonths : 0) + months
  const years = Math.floor(acc / 12)
  // 只留不足一个整月的小数余数（整月部分已由调用方推入时间线）
  const ageMonths = acc - Math.floor(acc)
  if (years <= 0) return { ...state, flags: { ...state.flags, ageMonths } }
  const age = state.player.age + years
  const lifespan = Math.max(0, state.res.lifespan - years)
  let flags: GameState['flags'] = { ...state.flags, ageMonths }
  let res = { ...state.res, lifespan }
  if (lifespan <= 0) {
    res = { ...res, lifespan: 0 }
    flags = { ...flags, dead: '坐化' }
  }
  return { ...state, player: { ...state.player, age }, res, flags }
}

/** 主入口：执行一个回合（LLM 失败即抛出，由调用方停留+重试，绝不生成替代内容） */
export async function resolveTurn(input: TurnInput, settings: NarratorSettings): Promise<TurnOutput> {
  const cmd = routeCommand(input.action)
  const useLlm = settings.useLlm && settings.apiKey.length > 0
  const isStoryResume = /回到主剧情|回到主线|继续剧情/.test(input.action)
  let isFree = cmd.kind === 'free'
  let narrative = ''
  let options: { text: string; tag?: string }[] = []
  let scene: SceneThemeKey | undefined
  // 时间流逝默认 0：只有明确的时间流逝（代码结算 / 叙事推理 / 叙事短语）才会推进，绝不默认 +1
  let timePassedMonths = 0
  let deltas: string[] = []
  let engine: TurnOutput['engine'] = 'code'
  let nextState = input.state

  if (!isFree) {
    const sys = executeSystem(cmd, input.state, input.log)
    if (sys) {
      nextState = sys.state
      const codeNarrative = sys.narrative
      if (!useLlm) throw new Error('未配置叙事引擎：请到「叙事引擎设置」配置 API Key 后继续')
      const system = buildSystemPrompt(WORLD_BIBLE, buildWorldSnapshot(input.state))
      let aiMonths = 0
      try {
        const narrated = await narrateSystem(settings, system, input.history, input.action, codeNarrative)
        narrative = narrated.narrative || codeNarrative
        options = sanitizeOptions(narrated.options)
        if (options.length === 0) options = sys.options
        aiMonths = typeof narrated.timePassedMonths === 'number' ? Math.max(0, Math.min(12, narrated.timePassedMonths)) : 0
        engine = 'llm'
      } catch (e) {
        // 真断网 → 离线冻结（抛给调用方停留+重试）；AI 业务失败（空内容/超时/服务错误）→ 系统指令回退代码结算叙事（数值一致，不编剧情）
        if (isOfflineError(e)) throw e
        narrative = codeNarrative
        options = sys.options
        engine = 'code'
      }
      scene = sys.scene
      deltas = []
      // 时间仲裁：仅显式「闭关 N 月/N 年」用代码时长；其余系统指令由 AI 叙事决定——
      // 明确短语折算 / 模糊迹象信 AI / 无迹象归 0（绝不每回合 +1）
      if (cmd.kind === 'cultivate' && typeof cmd.months === 'number') {
        timePassedMonths = sys.timePassedMonths
      } else {
        timePassedMonths = settleTime(narrative, aiMonths)
      }
    } else {
      isFree = true
    }
  }

  if (isFree) {
    if (!useLlm) throw new Error('未配置叙事引擎：请到「叙事引擎设置」配置 API Key 后继续')
    const system = buildSystemPrompt(WORLD_BIBLE, buildWorldSnapshot(input.state))
    // 「回到主剧情」等指令：提示 AI 自然接续主线
    const llmAction = isStoryResume ? `${input.action}（你已处理完手头事务，请自然接续当前主线剧情，不要新开一条剧情线）` : input.action
    try {
      const result = await callNarrator(settings, system, input.history, llmAction)
      narrative = result.narrative
      options = sanitizeOptions(result.options)
      scene = result.scene as SceneThemeKey | undefined
      const applied = applyDeltas(nextState, result.deltas)
      nextState = applied.state
      deltas = applied.applied
      // 时间仲裁（AI 是语义权威，代码只守一条铁律）：
      // ① 叙事有明确数字时间短语（数日/半月/三月/一年…）→ 按叙事折算（文本是铁证）；
      // ② 叙事只有模糊时间迹象（许久/多日/光阴荏苒…）→ 采信 AI 月数（AI 未给按 1 月）；
      // ③ 叙事完全没有时间迹象 → 0（AI 惯性给的 1/12 一律作废，绝不每回合 +1）
      const aiMonths = typeof result.timePassedMonths === 'number' ? Math.max(0, Math.min(12, result.timePassedMonths)) : 0
      timePassedMonths = settleTime(result.narrative, aiMonths)
      engine = 'llm'
    } catch (e) {
      // 真断网 → 冻结（抛给调用方停留+重试）；业务失败（多次重试仍空白/报错）→ 最小化续行，保证游戏可继续
      if (isOfflineError(e)) throw e
      narrative = `你依言而行：「${input.action}」。天道暂未细述此事（叙事引擎响应异常），天光流转，岁月如常。`
      options = [
        { text: '重试演绎', tag: '平和' },
        { text: '回到主剧情', tag: '平和' },
      ]
      // 失败续行回合不流逝时间（叙事未展开，无时间流逝依据）
      timePassedMonths = 0
      engine = 'code'
    }
  }

  // 叙事兜底：任何路径都不允许空白叙事（否则会污染后续 LLM 历史）
  if (!narrative || !narrative.trim()) narrative = '天道静默不语，只是静静注视着你。'

  // 时间推进（代码权威；战斗回合不流逝时间）。小数月（如「数日」折算的 0.3）跨回合累积在
  // flags.ageMonths：攒满的整月同步推进时间线 + 年龄/寿元，只留不足一月的余数，
  // 保证「入道第几年」与「年龄」始终一致（不会出现年龄涨了年份不动的脱节）
  const acc = (typeof nextState.flags.ageMonths === 'number' ? nextState.flags.ageMonths : 0) + timePassedMonths
  const wholeMonths = Math.floor(acc)
  const newTimeline = advanceTime(input.state.timeline, wholeMonths)
  // 每个回合固定提供「回到主剧情」入口（未在选项中时追加）
  if (!options.some((o) => o.text.includes('回到主剧情'))) {
    options = [...options, { text: '回到主剧情', tag: '平和' }]
  }
  // 衰老结算：年龄/寿元随流逝月数统一更新（所有回合类型都生效），寿元耗尽 → 坐化
  const aged = applyAging(nextState, timePassedMonths)
  const newState: GameState = {
    ...aged,
    timeline: newTimeline,
    turn: nextState.turn + 1,
    log: [...nextState.log, fmtTimeShort(newTimeline)],
  }

  // 坐化提示附到叙事末尾
  if (aged.flags.dead && !nextState.flags.dead) {
    narrative = `${narrative}\n\n【寿元耗尽——你于${fmtTimeShort(newTimeline)}油尽灯枯，坐化归尘。】`
  }

  return {
    state: newState,
    narrative,
    options,
    scene,
    deltas,
    timePassedMonths,
    engine,
  }
}

/** 创角完成后的开局回合 */
export function openingTurn(state: GameState): { state: GameState; entry: Omit<LogEntry, 'id'> } {
  const { state: s, narrative, options, scene } = resolveOpening(state)
  return {
    state: { ...s, turn: 0, log: [...s.log, fmtTimeShort(s.timeline)] },
    entry: { time: fmtTimeShort(s.timeline), narrative, options, scene, engine: 'code' },
  }
}
