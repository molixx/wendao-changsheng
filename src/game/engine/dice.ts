/** 掷骰工具 —— 对应原文「AI 内部掷骰（1d100 等），不得暗改」 */

/** 1d100 */
export function d100(): number {
  return Math.floor(Math.random() * 100) + 1
}

/** 按成功率判定：返回是否成功 + 骰值 */
export function roll(successRate: number): { ok: boolean; roll: number } {
  const r = d100()
  return { ok: r <= successRate, roll: r }
}

/** 概率判定（p ∈ [0,1]） */
export function chance(p: number): boolean {
  return Math.random() < p
}

/** 随机取一 */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 加权随机取一：items 为 [值, 权重] 列表 */
export function weightedPick<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [v, w] of items) {
    r -= w
    if (r <= 0) return v
  }
  return items[items.length - 1][0]
}

/** 骰 N 面（默认 6） */
export function die(sides = 6): number {
  return Math.floor(Math.random() * sides) + 1
}
