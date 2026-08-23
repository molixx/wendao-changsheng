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

/** 寿元对账：剩余寿元 = min(当前, 寿元上限 - 年龄)（修复旧档/创角期满寿元的偏差） */
export function reconcileLifespan(state: GameState): GameState {
  const cap = Math.max(0, state.res.lifespanMax - state.player.age)
  if (state.res.lifespan <= cap) return state
  return { ...state, res: { ...state.res, lifespan: cap } }
}

/** 衰老结算：每回合按流逝月数统一计算年龄/寿元（跨回合用 flags.ageMonths 累加余数），寿元耗尽 → 坐化 */
export function applyAging(state: GameState, months: number): GameState {
  if (months <= 0 || state.flags.dead) return state
  const total = (typeof state.flags.ageMonths === 'number' ? state.flags.ageMonths : 0) + months
  const years = Math.floor(total / 12)
  const ageMonths = total % 12
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
  let timePassedMonths = 1
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
      try {
        const narrated = await narrateSystem(settings, system, input.history, input.action, codeNarrative)
        narrative = narrated.narrative || codeNarrative
        options = sanitizeOptions(narrated.options)
        if (options.length === 0) options = sys.options
        engine = 'llm'
      } catch (e) {
        // 真断网 → 离线冻结（抛给调用方停留+重试）；AI 业务失败（空内容/超时/服务错误）→ 系统指令回退代码结算叙事（数值一致，不编剧情）
        if (isOfflineError(e)) throw e
        narrative = codeNarrative
        options = sys.options
        engine = 'code'
      }
      scene = sys.scene
      timePassedMonths = sys.timePassedMonths
      deltas = []
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
      timePassedMonths = Math.max(1, Math.min(12, result.timePassedMonths ?? 1))
      const applied = applyDeltas(nextState, result.deltas)
      nextState = applied.state
      deltas = applied.applied
      engine = 'llm'
    } catch (e) {
      // 真断网 → 冻结（抛给调用方停留+重试）；业务失败（多次重试仍空白/报错）→ 最小化续行，保证游戏可继续
      if (isOfflineError(e)) throw e
      narrative = `你依言而行：「${input.action}」。天道暂未细述此事（叙事引擎响应异常），天光流转，岁月如常。`
      options = [
        { text: '重试演绎', tag: '平和' },
        { text: '回到主剧情', tag: '平和' },
      ]
      engine = 'code'
    }
  }

  // 叙事兜底：任何路径都不允许空白叙事（否则会污染后续 LLM 历史）
  if (!narrative || !narrative.trim()) narrative = '天道静默不语，只是静静注视着你。'

  // 时间推进（代码权威；战斗回合不流逝时间）
  const newTimeline = advanceTime(input.state.timeline, timePassedMonths)
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
