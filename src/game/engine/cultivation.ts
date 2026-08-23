// ============================================================
// cultivation.ts —— 修炼 / 小境界突破 数值引擎
// 数据来源章节：第八章（8.2 突破规则）、第九章（9.1 修炼公式 / 9.1b 成长曲线）、
//               第七章（7.1 受伤等级表）、第六章（6.4 体质表）、8.3（逆天改命·聚灵体）
// 硬性约束：纯 TypeScript 无 React 依赖；不可变更新（永远返回新 GameState，绝不修改入参）
// ============================================================

import type { GameState } from '../state'
import { roll } from './dice'
import { fmtTimeShort } from './time'
import { REALMS, GROWTH_BASE } from '../data/realms'
import { GONGFAS, FATE_CHANGES } from '../data/systems'
import { SPIRIT_ROOTS } from '../data/creation'

/** 修炼结果 */
export interface CultivateResult {
  state: GameState
  /** 期间总修为进益（各月单月增长之和） */
  gained: number
  /** 各系数说明字符串（展示用，取起始月系数） */
  factors: string[]
  msg: string
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** 系数展示：整数不带小数，其余去尾零（1.5 / 1.15 / 2） */
function fmtCoef(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n
    .toFixed(2)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
}

// ------------------------------------------------------------
// 成长基数（9.1b）：原文明确 炼气10→筑基9→金丹8→元婴7→化神6→悟道5→羽化4→登仙3。
// 结晶、具灵两境原文未给精确值，按相邻两境中值线性推算，以保持「逐境递减」的成长曲线。
// ------------------------------------------------------------
const GROWTH_INTERPOLATED: Record<string, number> = {
  结晶: 8.5, // = (筑基 9 + 金丹 8) / 2（推算，原文未给）
  具灵: 7.5, // = (金丹 8 + 元婴 7) / 2（推算，原文未给）
}

export function growthBaseOf(realm: string): number {
  const g = GROWTH_BASE[realm]
  if (typeof g === 'number') return g
  const i = GROWTH_INTERPOLATED[realm]
  if (typeof i === 'number') return i
  return 10 // 兜底：未收录时按炼气基础值
}

/**
 * 小境界所需修为（每阶，即 cultMax 基础值）。
 * 原文 9.1b 明确：炼气每阶 100 点、元婴每阶 1000+ 点、羽化/登仙每阶数千点；
 * 其余各境原文未给精确值，按「境界越高所需修为越多」的累加曲线推算（增量逐段翻倍）。
 * 注意：本表与 breakthrough.ts 中同名表保持一致（按约束两文件互不 import）。
 */
export const STAGE_COST_BASE: Record<string, number> = {
  炼气: 100, // 原文明确：每阶 100 点
  筑基: 200, // 推算
  结晶: 350, // 推算
  金丹: 500, // 推算
  具灵: 750, // 推算
  元婴: 1000, // 原文明确：每阶 1000+ 点（取下限）
  化神: 1500, // 推算
  悟道: 2000, // 推算
  羽化: 3000, // 原文明确：每阶数千点（取 3000）
  登仙: 5000, // 原文明确：每阶数千点（取 5000）
}

export function stageCostOf(realm: string): number {
  const c = STAGE_COST_BASE[realm]
  return typeof c === 'number' ? c : 100
}

// ------------------------------------------------------------
// 公式系数（原文 9.1，与 CULTIVATION_FORMULA 表一致）
// ------------------------------------------------------------
/** 功法品级系数：黄1.0 / 玄1.3 / 地1.7 / 天2.2 / 仙3.0 */
const GONGFA_COEF: Record<string, number> = { 黄: 1.0, 玄: 1.3, 地: 1.7, 天: 2.2, 仙: 3.0 }

/** 灵气浓度系数：贫瘠0.6 / 普通1.0 / 浓郁1.5 / 福地2.0 / 洞天2.5 */
const LINGQI_COEF: Record<string, number> = { 贫瘠: 0.6, 普通: 1.0, 浓郁: 1.5, 福地: 2.0, 洞天: 2.5 }

function moodLabel(m: number): string {
  if (m >= 1.2) return '心境超预期（≥境界要求）'
  if (m > 0.5) return '心境达标'
  return '心境不达标'
}

/**
 * 主功法：状态卡暂无「装备主功法」字段，按原文 9.4「可装备 1 主 2 辅」约定——
 * gongfaIds 中最后一门 type 为「功法」者为当前主功法（后学新功即视为切换主修）。
 */
function mainGongfa(state: GameState): { name: string; grade: string } | null {
  for (let i = state.gongfaIds.length - 1; i >= 0; i--) {
    const g = GONGFAS.find((x) => x.id === state.gongfaIds[i])
    if (g && g.type === '功法') return { name: g.name, grade: g.grade }
  }
  return null
}

/**
 * 变异灵根适配（原文 6.3/9.1：变异灵根修对应系功法再 +20%）。
 * 已学功法（含法术/身法等任一同系武技）中存在与灵根同系者即算适配——
 * 因当前 GONGFAS 数据中并无「变异系·功法」类条目（如雷系仅有紫霄雷法·法术），
 * 若仅限功法类，此加成在现有数据下永远不触发，故放宽为「任一同系已学」。
 */
function variantBonus(state: GameState, rootElements: string[]): number {
  const matched = state.gongfaIds.some((id) => {
    const g = GONGFAS.find((x) => x.id === id)
    return !!g && g.element !== undefined && rootElements.includes(g.element)
  })
  return matched ? 1.2 : 1.0
}

/** 逆天改命 flag 键（与 breakthrough.ts 保持一致）：以 FATE_CHANGES 数据条目为准 */
function fateKey(prefix: string): string {
  const entry = FATE_CHANGES.find((f) => f.startsWith(prefix))
  return 'fate:' + (entry ?? prefix)
}

/**
 * 月修为增长（原文 9.1 + 9.1b）：
 *   月修为 = 10 × 资质系数（每点 +5%）× 灵根系数（变异灵根修同系功法再 ×1.2）
 *            × 功法系数（黄1.0/玄1.3/地1.7/天2.2/仙3.0，无功法默认黄阶）
 *            × 灵气系数（贫瘠0.6/普通1.0/浓郁1.5/福地2.0/洞天2.5）
 *            × 心境系数（res.mood：1.2/1.0/0.5）× 成长基数（GROWTH_BASE，逐境递减）
 *            × 闭关 ×2（原文 9.1；心魔缠身时闭关效率暴跌，倍率降为 ×1，原文 7.1）
 *            × 内伤 ×0.5（原文 7.1：修为增长 -50%）
 *            × 逆天改命·聚灵体 ×1.15（原文 8.3：修炼+15%）
 *            × 先天道体 ×1.5（原文 6.4：修炼+50%）
 */
export function monthlyCultivationGain(state: GameState, closedDoor = false): { gain: number; factors: string[] } {
  const p = state.player
  const r = state.res
  const factors: string[] = []

  const zizhiCoef = 1 + p.stats.zizhi * 0.05 // 资质每点 +5%（资质 10 → 系数 1.5）
  factors.push(`资质 ×${fmtCoef(zizhiCoef)}（资质 ${p.stats.zizhi}，每点+5%）`)

  const root = SPIRIT_ROOTS.find((x) => x.id === p.spiritRootId)
  const rootCoef = root?.coefficient ?? 1.0
  factors.push(`灵根 ×${fmtCoef(rootCoef)}（${root?.name ?? '未知'}）`)
  let variant = 1
  if (root && root.kind === 'bianyi') {
    variant = variantBonus(state, root.elements)
    if (variant > 1) factors.push('变异灵根适配同系功法 ×1.20')
  }

  const main = mainGongfa(state)
  const gongfaCoef = main ? (GONGFA_COEF[main.grade] ?? 1.0) : 1.0
  factors.push(`功法 ×${fmtCoef(gongfaCoef)}（${main ? `${main.grade}阶·${main.name}` : '无功法，默认黄阶'}）`)

  const lingqiCoef = LINGQI_COEF[state.cave.spiritConcentration] ?? 1.0
  factors.push(`灵气 ×${fmtCoef(lingqiCoef)}（${state.cave.spiritConcentration}）`)

  const moodCoef = r.mood
  factors.push(`心境 ×${fmtCoef(moodCoef)}（${moodLabel(moodCoef)}）`)

  const growth = growthBaseOf(p.realm)
  factors.push(`成长基数 ×${fmtCoef(growth)}（${p.realm}境）`)

  let closedCoef = 1
  if (closedDoor) {
    closedCoef = r.injury === 'heart-demon' ? 1 : 2 // 原文 7.1：心魔缠身 → 闭关效率暴跌
    factors.push(closedCoef === 2 ? '闭关 ×2' : '闭关 ×1（心魔缠身，效率暴跌）')
  }

  let injuryCoef = 1
  if (r.injury === 'inner') {
    injuryCoef = 0.5 // 原文 7.1：内伤 → 修为增长 -50%
    factors.push('内伤 −50%')
  }

  let fateCoef = 1
  if (typeof state.flags[fateKey('聚灵体')] === 'number') {
    fateCoef = 1.15 // 逆天改命·聚灵体（原文 8.3：修炼+15%）
    factors.push('聚灵体 +15%')
  }

  let physiqueCoef = 1
  if (p.physiqueId === 'xiantian-dao') {
    physiqueCoef = 1.5 // 先天道体（原文 6.4：修炼+50%）
    factors.push('先天道体 +50%')
  }

  const gain = Math.round(
    10 * zizhiCoef * rootCoef * variant * gongfaCoef * lingqiCoef * moodCoef * growth * closedCoef * injuryCoef * fateCoef * physiqueCoef,
  )
  factors.push(`本月修为 +${gain}`)
  return { gain, factors }
}

/**
 * 小境界突破（阶内升阶：炼气·初期→中期…，原文 8.2）。
 * 修为满 100% + 悟性判定；原文未给精确成功率，按任务约定取「悟性×3%」（上限 95%），
 * 另按原文「道心影响突破成功率」每点道心 +0.5%；失败修为跌回 70%，可重试（原文 8.2）。
 */
export function minorBreakthrough(state: GameState): { state: GameState; ok: boolean; msg: string } {
  if (state.flags.dead) return { state, ok: false, msg: '尘缘已了，此身已殁。' }
  const p = state.player
  const r = state.res
  if (r.cult < r.cultMax) {
    return { state, ok: false, msg: `修为未满（${r.cult}/${r.cultMax}），尚不足以冲击小阶。` }
  }
  const realmIdx = REALMS.findIndex((x) => x.name === p.realm)
  if (realmIdx < 0) return { state, ok: false, msg: '境界信息有误，无法突破。' }
  const realm = REALMS[realmIdx]
  const stageIdx = realm.stages.indexOf(p.stage)
  if (stageIdx < 0) return { state, ok: false, msg: '小阶信息有误，无法突破。' }
  if (stageIdx >= realm.stages.length - 1) {
    return { state, ok: false, msg: `你已修至${p.realm}·${p.stage}，小阶已至尽头，须择道破境（人道/地道/天道）。` }
  }

  const rate = clamp(p.stats.wuxing * 3 + p.stats.daoxin * 0.5, 1, 95)
  const { ok } = roll(rate)
  if (!ok) {
    const cult = Math.round(r.cultMax * 0.7) // 原文 8.2：失败修为跌回 70%
    return {
      state: { ...state, res: { ...r, cult } },
      ok: false,
      msg: `冲击${realm.stages[stageIdx + 1]}失败！灵力反噬，修为跌回七成（${cult}/${r.cultMax}），可择日再试。`,
    }
  }

  const newStage = realm.stages[stageIdx + 1]
  const cultMax = stageCostOf(realm.name)
  return {
    state: {
      ...state,
      player: { ...p, stage: newStage },
      res: { ...r, cult: 0, cultMax },
    },
    ok: true,
    msg: `灵台清明，气机一转——你突破至${realm.name}·${newStage}！修为归零，再行积累（0/${cultMax}）。`,
  }
}

/**
 * 修炼（逐月结算，原文 1 回合 = 1 月）：
 * 逐月累加修为到 res.cult；修为满 cultMax 时自动尝试小突破（悟性判定，可重试）；
 * 每满 12 个月寿元 −1、年龄 +1（寿元以年计，原文 5.4/状态卡）；寿元耗尽 → flags.dead='坐化'；
 * 时间/年龄/寿元由回合管线统一推进（本模块只处理修为与突破）；「短期无法再突破」冷却随月递减。
 */
export function cultivate(state: GameState, months = 1, closedDoor = false): CultivateResult {
  if (state.flags.dead) {
    return { state, gained: 0, factors: [], msg: `你已${state.flags.dead}，尘缘已了，此身归于尘土。` }
  }
  const n = Math.max(0, Math.floor(months))
  if (n === 0) return { state, gained: 0, factors: [], msg: '岁月并未流逝。' }

  // 已圆满且修为满：闭关无益，立即提醒破境（原文 9.2：破境时机自动停止提醒）
  const realm0 = REALMS.find((x) => x.name === state.player.realm)
  if (realm0 && state.player.stage === realm0.stages[realm0.stages.length - 1] && state.res.cult >= state.res.cultMax) {
    return { state, gained: 0, factors: [], msg: `你已修至${state.player.realm}·${state.player.stage}，修为圆满，须择道破境（人道/地道/天道）。闭关无法再精进半分。` }
  }

  let s: GameState = state
  let gained = 0
  let factors: string[] = []
  const msgs: string[] = []
  const closedLabel = closedDoor ? '闭关' : '修炼'

  for (let i = 0; i < n; i++) {
    if (s.flags.dead) break

    const m = monthlyCultivationGain(s, closedDoor)
    if (i === 0) factors = m.factors
    gained += m.gain

    // 逐月累加修为（修为进度 0~100%，封顶 cultMax）
    const cult = Math.min(s.res.cultMax, s.res.cult + m.gain)
    let next: GameState = { ...s, res: { ...s.res, cult } }

    // 突破冷却（大突破失败所致「短期无法再突破」）随时间递减
    const cooldown = typeof next.flags.breakCooldown === 'number' ? next.flags.breakCooldown : 0
    if (cooldown > 0) next = { ...next, flags: { ...next.flags, breakCooldown: cooldown - 1 } }

    // 修为满 → 自动尝试小突破
    if (next.res.cult >= next.res.cultMax) {
      const realm = REALMS.find((x) => x.name === next.player.realm)
      const isPerfect = realm ? next.player.stage === realm.stages[realm.stages.length - 1] : false
      if (isPerfect) {
        msgs.push(`你已修至${next.player.realm}·${next.player.stage}，修为圆满，须择道破境（人道/地道/天道）。闭关自动停止。`)
        s = next
        break
      }
      const bp = minorBreakthrough(next)
      next = bp.state
      msgs.push(bp.msg)
    }
    s = next
  }

  // 时间/年龄/寿元由回合管线统一推进（cultivate 不掌管岁月流逝）
  const log = msgs.length > 0 ? [...s.log, fmtTimeShort(s.timeline), ...msgs] : s.log
  const final: GameState = { ...s, log }

  const head = `（${fmtTimeShort(final.timeline)}）你${closedLabel}${n} 个月，修为进益 ${gained} 点，现修为 ${final.res.cult}/${final.res.cultMax}。`
  return { state: final, gained, factors, msg: [head, ...msgs].join('\n') }
}
