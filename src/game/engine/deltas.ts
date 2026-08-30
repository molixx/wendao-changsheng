/** deltas 校验与落地 —— LLM 状态提案的语义校验（validateProposedStateChanges）与增量落地（applyDeltas）
 *  从 turn.ts 拆出：别名表 / 钳制 / 归一化逻辑单源，两函数共用，消除重复与语义分歧 */

import type { GameState } from '../state'
import { itemIdOf } from './economy'
import { NPCS } from '../data/world'
import { ENLIGHTENMENT_BRANCHES, TECHNIQUES, INJURIES } from '../data/systems'

/** 通用钳制 */
export function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** 心境归一化（0.5 / 1.0 / 1.2，校验与落地共用同一口径，不再各写一份） */
export function normalizeMood(v: number): 1.2 | 1.0 | 0.5 {
  return v >= 1.1 ? 1.2 : v <= 0.7 ? 0.5 : 1.0
}

/** deltas 字段别名（模型常输出拼音/中文键）与标签 */
export const DELTA_ALIASES: Record<string, string> = {
  hp: 'hp', 气血: 'hp', qi: 'hp', qixue: 'hp',
  mp: 'mp', 灵力: 'mp', lingli: 'mp', fa: 'mp',
  cult: 'cult', 修为: 'cult', xiwei: 'cult', xiuwei: 'cult',
  spirit: 'spirit', 灵石: 'spirit', lingshi: 'spirit',
  merit: 'merit', 功德: 'merit', gongde: 'merit',
  karma: 'karma', 业力: 'karma', yeli: 'karma',
  lifespan: 'lifespan', 寿元: 'lifespan', shouyuan: 'lifespan',
}
export const DELTA_LABELS: Record<string, string> = { hp: '气血', mp: '灵力', cult: '修为', spirit: '灵石', merit: '功德', karma: '业力', lifespan: '寿元' }
/** 0~max 型字段（支持绝对值语义） */
export const RANGED_FIELDS = new Set(['hp', 'mp', 'cult', 'lifespan'])

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return n
  }
  return null
}

/** 语义级校验：AI 的状态提案只有在符合当前行动语境时才允许落地。
 *  这样 AI 仍能“推动剧情意图”，但不能无条件直接改写世界事实。 */
export function validateProposedStateChanges(
  state: GameState,
  proposed: Record<string, unknown> | undefined,
  action: string,
): { accepted?: Record<string, unknown>; rejected?: Record<string, { proposed: unknown; reason: string }> } {
  // 返回 { accepted, rejected }：accepted 为可采纳的字段映射，rejected 为不可采纳字段及中文短原因
  if (!proposed || typeof proposed !== 'object') return {}
  const accepted: Record<string, unknown> = {}
  const rejected: Record<string, { proposed: unknown; reason: string }> = {}
  const actionText = (action ?? '').trim()
  const travelLike = /(去|前往|游历|云游|赶路|出发|寻访|拜访|探访|追踪|寻找|调查|探索|探秘|回到|回去)/.test(actionText)
  const currentLocation = state.flags.location ?? '东洲·青岳'
  const statusList = Array.isArray(state.res.statusEffects) ? state.res.statusEffects : []

  // 模块化检查：location
  if ('location' in proposed) {
    const val = String(proposed.location ?? '').trim()
    if (!val) {
      rejected.location = { proposed: proposed.location, reason: '地点为空' }
    } else if (val.length > 20) {
      rejected.location = { proposed: proposed.location, reason: '地点名称过长' }
    } else if (val === currentLocation) {
      // 与当前一致，接受为冗余（但不必要应用）
      accepted.location = val
    } else if (travelLike) {
      accepted.location = val
    } else {
      rejected.location = { proposed: proposed.location, reason: '未经移动指令，不能改变所在地' }
    }
  }

  // mainQuest
  if ('mainQuest' in proposed) {
    const val = String(proposed.mainQuest ?? '').trim()
    if (!val) {
      rejected.mainQuest = { proposed: proposed.mainQuest, reason: '主线内容为空' }
    } else if (val.length > 40) {
      rejected.mainQuest = { proposed: proposed.mainQuest, reason: '主线描述过长' }
    } else {
      const isQuestLike = /(找|寻|追|调查|探|访|问|找寻|寻找|追查|追寻|寻访)/.test(actionText)
      if (!state.mainQuest || val !== state.mainQuest || isQuestLike) accepted.mainQuest = val
      else rejected.mainQuest = { proposed: proposed.mainQuest, reason: '主线无变化或未体现任务相关行动' }
    }
  }

  // injury
  if ('injury' in proposed) {
    const val = proposed.injury
    if (val === null || val === undefined || val === '无' || val === 'none' || String(val).trim() === '') {
      accepted.injury = null
    } else {
      const text = String(val).trim().slice(0, 20)
      const hit = INJURIES.find((i) => i.id === text || i.name === text || i.name.split('/').includes(text))
      if (hit) accepted.injury = hit.id
      else accepted.injury = text
    }
  }

  // status
  if ('status' in proposed) {
    const raw = proposed.status
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : null
    if (list) {
      const next = list.map((x) => String(x).slice(0, 12)).filter(Boolean)
      if (next.length > 0 || (Array.isArray(raw) && raw.length === 0)) accepted.status = next
      else rejected.status = { proposed: raw, reason: '异常状态格式不被识别' }
    } else {
      rejected.status = { proposed: raw, reason: '异常状态需为字符串或数组' }
    }
  }

  // mood
  if ('mood' in proposed) {
    const v = toNumber(proposed.mood)
    if (v === null) rejected.mood = { proposed: proposed.mood, reason: '心境需为数字' }
    else {
      const normalized = normalizeMood(v)
      accepted.mood = normalized
    }
  }

  // affinity（增量语义：正加负减；仅校验类型，符号/最终值由 applyDeltas 钳制 0~100——修复负数被钳死）
  if ('affinity' in proposed && proposed.affinity && typeof proposed.affinity === 'object') {
    const nextAff: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(proposed.affinity as Record<string, unknown>)) {
      const n = toNumber(v)
      if (n === null) {
        rejected[`affinity.${k}`] = { proposed: v, reason: '好感值需为数字' }
        continue
      }
      nextAff[k] = Math.round(n)
    }
    if (Object.keys(nextAff).length > 0) accepted.affinity = nextAff
  }

  // bag（增量语义：正加负减，消耗写负值；仅校验类型，符号保留，applyDeltas 保证不为负）
  if ('bag' in proposed && proposed.bag && typeof proposed.bag === 'object') {
    const nextBag: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(proposed.bag as Record<string, unknown>)) {
      const n = toNumber(v)
      if (n === null) {
        rejected[`bag.${k}`] = { proposed: v, reason: '物品数量需为数字' }
        continue
      }
      nextBag[k] = Math.round(n)
    }
    if (Object.keys(nextBag).length > 0) accepted.bag = nextBag
  }

  // stats（增量语义：负值=减；符号保留，applyDeltas 钳制 1~20）
  if ('stats' in proposed && proposed.stats && typeof proposed.stats === 'object') {
    const nextStats: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(proposed.stats as Record<string, unknown>)) {
      const n = toNumber(v)
      if (n === null) {
        rejected[`stats.${k}`] = { proposed: v, reason: '属性值需为数字' }
        continue
      }
      nextStats[k] = Math.round(n)
    }
    if (Object.keys(nextStats).length > 0) accepted.stats = nextStats
  }

  // enlightenment（增量语义：负值=减；符号保留，applyDeltas 钳制 1~9）
  if ('enlightenment' in proposed && proposed.enlightenment && typeof proposed.enlightenment === 'object') {
    const nextEnl: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(proposed.enlightenment as Record<string, unknown>)) {
      const n = toNumber(v)
      if (n === null) {
        rejected[`enlightenment.${k}`] = { proposed: v, reason: '悟道值需为数字' }
        continue
      }
      nextEnl[k] = Math.round(n)
    }
    if (Object.keys(nextEnl).length > 0) accepted.enlightenment = nextEnl
  }

  // technique（增量语义：负值=减；符号保留，applyDeltas 钳制 1~5）
  if ('technique' in proposed && proposed.technique && typeof proposed.technique === 'object') {
    const nextTech: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(proposed.technique as Record<string, unknown>)) {
      const n = toNumber(v)
      if (n === null) {
        rejected[`technique.${k}`] = { proposed: v, reason: '技艺值需为数字' }
        continue
      }
      nextTech[k] = Math.round(n)
    }
    if (Object.keys(nextTech).length > 0) accepted.technique = nextTech
  }

  // statusList interference: if player already has statuses and proposed.status isn't array/string, reject
  if (statusList.length > 0 && 'status' in proposed && !Array.isArray(proposed.status) && typeof proposed.status !== 'string') {
    delete accepted.status
    rejected.status = { proposed: proposed.status, reason: '当前存在异常，新的异常格式需为数组或字符串' }
  }

  return { accepted: Object.keys(accepted).length ? accepted : undefined, rejected: Object.keys(rejected).length ? rejected : undefined }
}

/** 校验并应用 LLM 的数值变更：字段别名映射、增量/绝对值双语义、钳制、上限封顶、不为负
 *  mode='status'：系统指令回合专用——数值已由代码结算，跳过数值与六维（防双加），
 *  但好感/背包/悟道/技艺/伤势/异常/心境/所在地/主线仍采纳（这些无双加风险） */
export function applyDeltas(
  state: GameState,
  deltas?: Record<string, unknown>,
  mode: 'full' | 'status' = 'full',
): { state: GameState; applied: string[] } {
  if (!deltas) return { state, applied: [] }
  const res = { ...state.res }
  const applied: string[] = []
  // 已知字段集合（含别名与子对象键）：用于识别「AI 写了但代码未采纳」的字段，避免静默丢失
  const KNOWN_KEYS = new Set([
    ...Object.keys(DELTA_ALIASES),
    'stats', '属性', 'affinity', '好感', 'relationships',
    'bag', '物品', 'items', 'injury', '伤势', 'status', '异常',
    'mood', '心境', 'enlightenment', '悟道', 'technique', '技艺',
    'location', '所在地', 'mainQuest', '主线',
  ])
  const unknownKeys = Object.keys(deltas).filter((k) => !KNOWN_KEYS.has(k))
  if (unknownKeys.length > 0) {
    applied.push(`⚠ 未采纳字段：${unknownKeys.slice(0, 5).join('、')}`)
  }
  for (const [key, raw] of Object.entries(deltas)) {
    if (mode === 'status') break // 状态模式不处理数值字段
    const field = DELTA_ALIASES[key.toLowerCase ? key.toLowerCase() : key] ?? DELTA_ALIASES[key]
    if (!field || typeof field !== 'string') continue
    const v = toNumber(raw)
    if (v === null || v === 0) continue
    // 字符串带「+」前缀 = 显式增量（如 "+20"），无论大小一律按增量处理，
    // 避免「当前 100 时 AI 想 +20 写 hp:20 被当成绝对值设为 20」的误判
    const explicitIncrement = typeof raw === 'string' && /^\s*\+/.test(raw)
    const before = res[field as keyof typeof res] as number
    const max = (res[`${field}Max` as keyof typeof res] ?? Infinity) as number
    let next: number
    if (RANGED_FIELDS.has(field)) {
      // 0~max 字段：负值=增量减；显式 "+N"=增量加（封顶）；
      // 裸正值>当前=增量加（封顶）；裸 0<=正值<=当前=绝对值（设为该值，模型常把"剩余值"写成绝对值）
      next = v < 0 || explicitIncrement ? before + v : v > before ? Math.min(before + v, max) : v
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
  if (mode === 'full' && rawStats && typeof rawStats === 'object') {
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
  // ── 背包物品（bag：正加负减，不为负；中文名键经物品表反查映射回 id）──
  const rawBag = deltas.bag ?? deltas.物品 ?? deltas.items
  if (rawBag && typeof rawBag === 'object') {
    const bag = { ...s.bag }
    for (const [k, rv] of Object.entries(rawBag as Record<string, unknown>)) {
      const v = toNumber(rv)
      if (v === null || v === 0) continue
      const id = itemIdOf(k) ?? k // AI 常写中文名（如「聚气丹」），统一映射回 id
      const n = Math.round(v)
      const before = bag[id] ?? 0
      const next = Math.max(0, before + n)
      if (next !== before) {
        bag[id] = next
        if (next === 0) delete bag[id]
        applied.push(`${id} ×${before}→${next}`)
      }
    }
    s = { ...s, bag }
  }
  // ── 异常状态（injury：中文名/id 或 null 清除；status：数组/字符串，附加/清空）──
  if ('injury' in deltas || '伤势' in deltas) {
    const raw = deltas.injury ?? deltas.伤势
    // 中文名/别名 → id（代码内部存 id，状态卡显示中文名）
    let next: string | null = null
    if (raw !== null && raw !== undefined && raw !== '无' && raw !== 'none' && raw !== '') {
      const s = String(raw).slice(0, 20)
      const hit = INJURIES.find((i) => i.id === s || i.name === s || i.name.split('/').includes(s) || (s === '中毒蛊' && i.id === 'poison') || (s === '心魔' && i.id === 'heart-demon'))
      next = hit?.id ?? s // 未识别的名字原样保留（至少显示出来）
    }
    if (next !== s.res.injury) {
      s = { ...s, res: { ...s.res, injury: next } }
      applied.push(`伤势 ${s.res.injury ?? '无'}→${next ?? '无'}`)
    }
  }
  if ('status' in deltas || '异常' in deltas) {
    const raw = deltas.status ?? deltas.异常
    // 数组或单个字符串都接受；对象忽略
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : null
    if (list) {
      const next = list.map((x) => String(x).slice(0, 12)).filter(Boolean)
      s = { ...s, res: { ...s.res, statusEffects: [...new Set(next)] } }
      applied.push(`异常 ${next.join('、') || '无'}`)
    }
  }
  // ── 心境（mood：0.5/1.0/1.2）──
  if ('mood' in deltas || '心境' in deltas) {
    const v = toNumber(deltas.mood ?? deltas.心境)
    if (v !== null) {
      const next = normalizeMood(v)
      if (next !== s.res.mood) {
        s = { ...s, res: { ...s.res, mood: next } }
        applied.push(`心境 ${s.res.mood}→${next}`)
      }
    }
  }
  // ── 所在地（location：中文地名，如「南疆·赤炎」「青云宗」；状态卡与快照同步）──
  const rawLoc = deltas.location ?? deltas.所在地
  if (typeof rawLoc === 'string' && rawLoc.trim()) {
    const next = rawLoc.trim().slice(0, 20)
    const cur = s.flags.location ?? '东洲·青岳'
    if (next !== cur) {
      s = { ...s, flags: { ...s.flags, location: next } }
      applied.push(`所在地 ${cur}→${next}`)
    }
  }
  // ── 主线（mainQuest：主剧情提示，AI 推进主线时更新）──
  const rawQuest = deltas.mainQuest ?? deltas.主线
  if (typeof rawQuest === 'string') {
    const next = rawQuest.trim() ? rawQuest.trim().slice(0, 40) : ''
    if (next !== (s.mainQuest ?? '')) {
      s = { ...s, mainQuest: next }
      applied.push(`主线 ${next || '无'}`)
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
