/** 时间系统 —— 对应原文「1 回合 = 游戏内 1 个月」「每段输出开头带时间行」 */

import type { Timeline } from '../state'

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
