/** 时间系统 —— 对应原文「1 回合 = 游戏内 1 个月」「每段输出开头带时间行」
 *  含 时间线推进 / 衰老结算 / 寿元对账（原 turn.ts 中的时间类逻辑，拆出单源） */

import type { GameState, Timeline } from '../state'

export const SEASONS = ['春', '夏', '秋', '冬'] as const

export const MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']

export function seasonOf(month: number): string {
  return SEASONS[Math.floor(((month - 1) % 12) / 3)]
}

/** 推进 n 个月（默认 1），返回新的时间 */
export function advanceTime(t: Timeline, months = 1): Timeline {
  let total = t.year * 12 + (t.month - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return {
    year,
    month,
    calendarYear: 387 + year - 1,
  }
}

/** 时间行：「入道三年 · 五月 · 天玄历 389 年 · 夏」 */
export function fmtTime(t: Timeline): string {
  const y = t.year === 1 ? '元年' : `${t.year}年`
  return `入道${y} · ${MONTH_NAMES[t.month - 1]} · 天玄历 ${t.calendarYear} 年 · ${seasonOf(t.month)}`
}

/** 短时间行：「入道三年 · 五月」 */
export function fmtTimeShort(t: Timeline): string {
  const y = t.year === 1 ? '元年' : `${t.year}年`
  return `入道${y} · ${MONTH_NAMES[t.month - 1]}`
}

/** 寿元对账：剩余寿元 = min(当前, 寿元上限 - 年龄)（修复旧档/创角期满寿元的偏差） */
export function reconcileLifespan(state: GameState): GameState {
  const cap = Math.max(0, state.res.lifespanMax - state.player.age)
  if (state.res.lifespan <= cap) return state
  return { ...state, res: { ...state.res, lifespan: cap } }
}

/** 衰老结算：每回合按流逝月数统一计算年龄/寿元（跨回合用 flags.ageMonths 累计不足一年的月数），寿元耗尽 → 坐化
 *  与时间线推进共用同一累积口径：整月进时间线并折算年龄，不足一年的余数留 flags.ageMonths，避免「年龄涨了年份不动」的脱节 */
export function applyAging(state: GameState, months: number): GameState {
  if (months <= 0 || state.flags.dead) return state
  const acc = (typeof state.flags.ageMonths === 'number' ? state.flags.ageMonths : 0) + months
  const years = Math.floor(acc / 12)
  // 只留不足一年的月数余数（整年已折算为年龄；整月与时间线推进同口径，累计进年龄）
  const ageMonths = acc - years * 12
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
