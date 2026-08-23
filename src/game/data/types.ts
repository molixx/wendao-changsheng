// ============================================================
// types.ts —— 修仙模拟器《问道长生》游戏数据类型定义
// 数据来源章节：《修仙模拟器》设定文档（21 章 + 附录 A/B/C）
// 本文件仅定义接口，不含数据；数据文件只允许从 './types' 导入类型。
// ============================================================

/** 大境界 + 4 小阶名（原文 8.1：每境四阶 初期/中期/后期/圆满） */
export interface RealmType {
  name: string
  stages: string[]
}

/** 出身（原文 6.2，十选一）。bonus 为出身修正，在六维分配后结算 */
export interface Origin {
  id: string
  name: string
  desc: string
  bonus?: Record<string, number>
  rare?: boolean
}

/** 灵根（原文 6.3）。kind：天/地/真/伪/变异；coefficient 为修炼速度系数 */
export interface SpiritRoot {
  id: string
  name: string
  desc: string
  kind: 'tian' | 'di' | 'zhen' | 'wei' | 'bianyi'
  elements: string[]
  coefficient: number
}

/** 先天体质（原文 6.4） */
export interface Physique {
  id: string
  name: string
  desc: string
}

/** 天赋（原文 6.6，默认 5 点天赋点；negative 为负面天赋，cost 为负向返还点数） */
export interface Talent {
  id: string
  name: string
  desc: string
  cost: number
  negative?: boolean
}

/** 道途（原文 6.7 / 5.2b，六选一）+ 主线钩子 */
export interface DaoPath {
  id: string
  name: string
  desc: string
  hook: string
}

/** 势力（原文 5.3）。camp：正道/魔道/中立/皇朝 */
export interface Sector {
  id: string
  name: string
  camp: '正道' | '魔道' | '中立' | '皇朝'
  desc: string
}

/** NPC（原文 14 章示例角色库）。age 原文未给出的条目省略该字段（如墨尘） */
export interface Npc {
  id: string
  name: string
  identity: string
  gender: string
  age?: number
  traits: string[]
  likes: string[]
  tips: string
}

/** 地图区域（原文 5.2）。danger 为原文危险描述，suggested 为建议境界 */
export interface MapRegion {
  id: string
  name: string
  danger: string
  suggested: string
  desc: string
  places?: string[]
}

/** 秘境（原文 5.2 / 15 章）。risk 为原文括号标注的风险等级 */
export interface SecretRealm {
  id: string
  name: string
  risk: string
  desc: string
}

/**
 * 功法与神通（附录 A）。
 * type 原文类型为：功法 / 法术 / 身法 / 丹方 / 丹道（原文无「神通」类示例，
 * 故 type 用 string 而非枚举，避免臆造）。
 */
export interface Gongfa {
  id: string
  name: string
  grade: '黄' | '玄' | '地' | '天' | '仙'
  element?: string
  type: string
  effect: string
}

/** 技艺（原文 10 章，6 种 × 5 级） */
export interface Technique {
  id: string
  name: string
  levels: string[]
}

/** 随机事件（原文 15 章，每回合 1d100、20% 触发） */
export interface RandomEvent {
  id: string
  name: string
  desc: string
}

/** 奇遇（原文 15 章经典奇遇） */
export interface Qiyu {
  id: string
  name: string
  desc: string
}

/** 修仙大事（原文 5.4）。cycle 为周期 */
export interface MajorEvent {
  id: string
  name: string
  cycle: string
  desc: string
}

/** 开局剧本（附录 C）。start 为开局时间行（原文 5.4：开局天玄历 387 年 · 春） */
export interface OpeningScript {
  id: string
  name: string
  desc: string
  start: string
}

/** 结局路线（附录 B + 特殊线）。type：正常/死亡/特殊 */
export interface Ending {
  id: string
  name: string
  type: '正常' | '死亡' | '特殊'
  desc: string
}

/** 受伤等级（原文 7.1 受伤等级表） */
export interface InjuryLevel {
  id: string
  name: string
  penalty: string
  desc: string
}

/** 修炼公式系数档位（原文 9.1）。statName 为系数名（含档位），coefficient 为该档系数 */
export interface CultivationFormula {
  statName: string
  coefficient: number
  note?: string
}
