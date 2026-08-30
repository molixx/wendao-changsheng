// ============================================================
// balance.ts —— 经济 / 奖励数值集中表（单源，便于脚本化平衡测试）
// 数据来源章节：第十二章（坊市物价）、第十一章（宗门）、第十三章（洞府）、第十六章（战斗战利品）
// 原文未给精确值的推算依据见各条注释；集中在此便于统一调参（配合 scripts/test-validate.ts）
// ============================================================

/** 洞府升级价格（原文 13 章未给价格，按「约 4 倍递增」推算：200 → 800 → 3000 → 12000） */
export const CAVE_UPGRADE_COSTS: readonly number[] = [200, 800, 3000, 12000]

/** 宗门任务奖励（原文 11 章未给精确值）：
 *  圆满：记功 10 点 + 基础 20 + 随机 0~30 灵石；波折：苦劳 2 点 + 5 灵石 */
export const SECT_TASK_REWARD = {
  contributionOk: 10,
  contributionFail: 2,
  baseSpirit: 20,
  bonusSpirit: 30,
  failSpirit: 5,
} as const

/** 战斗战利品（原文 16.4：灵石随敌方境界浮动）：(敌方境界+1)×30 + 随机 0~40 */
export const COMBAT_LOOT = {
  basePerRealm: 30,
  randomMax: 40,
} as const
