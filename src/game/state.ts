/** 游戏状态模型 —— 对应原文状态卡 19 字段 + 存档压缩包格式 */

export type Gender = string // 男 / 女 / 自定义（如「不辨雌雄的妖」）

export interface Stats {
  /** 六维：资质/悟性/神识/遁速/道心/仙缘 */
  zizhi: number
  wuxing: number
  shenshi: number
  dunsu: number
  daoxin: number
  xianyuan: number
}

export interface Player {
  daoName: string // 道号
  name: string // 姓名
  gender: Gender
  age: number
  originId: string // 出身
  realm: string // 大境界（炼气…登仙）
  stage: string // 小境界（初期/中期/后期/圆满）
  sect: string // 宗门职位（如 青云宗·外门弟子 / 散修）
  spiritRootId: string // 灵根
  physiqueId: string // 体质
  appearance: string // 仙姿 5 档（凡姿/清秀/出众/超凡/仙姿）
  daoPathId: string // 道途
  talentIds: string[] // 天赋
  stats: Stats
}

export interface Resources {
  hp: number
  hpMax: number
  mp: number
  mpMax: number
  /** 修为：当前小阶进度 */
  cult: number
  cultMax: number
  lifespan: number
  lifespanMax: number
  spirit: number // 灵石
  merit: number // 功德
  karma: number // 业力
  /** 心境档：1.2 / 1.0 / 0.5 */
  mood: 1.2 | 1.0 | 0.5
  /** 受伤状态（存 id：light/severe/dying/inner/poison/heart-demon，见 data/systems.ts INJURIES 表），null 为无 */
  injury: string | null
  statusEffects: string[]
}

export interface Timeline {
  /** 入道第几年（1 起） */
  year: number
  /** 1~12 月 */
  month: number
  /** 天玄历年份（开局 387） */
  calendarYear: number
}

export interface Cave {
  level: number
  spiritConcentration: string // 贫瘠/普通/浓郁/福地/洞天
  facilities: string[] // 6 类设施
}

export interface SectInfo {
  sect: string
  rank: string // 入门→外门→内门→真传→长老→掌门
  contribution: number
}

/**
 * flags 魔法键收编：已知键全部类型化（消灭「键表示漂移」类 bug 的根源，如 injury id/中文名漂移）。
 * fate:* 逆天改命计数与未来扩展键由索引签名兜底。
 */
export interface GameFlags {
  /** 不足一年的月数余数（跨回合累积，攒满 12 折算 1 年） */
  ageMonths?: number
  /** 大突破失败后的禁破冷却（月） */
  breakCooldown?: number
  /** 暗伤：突破失败倒退一阶留下（AI 结算时全属性 −10%） */
  hiddenInjury?: boolean
  /** 入魔 */
  modao?: boolean
  /** 灵兽认主 */
  spiritBeast?: boolean
  /** 秘境现世 */
  secretRealmOpen?: boolean
  /** 战斗现场（CombatState JSON；单键强类型，不再散落 combat.result/combat.enemy 等子键） */
  combat?: string
  /** 声望（创角出身 bonus 落地，状态卡展示） */
  fame?: number
  /** 死亡原因（坐化/战死/渡劫陨落…） */
  dead?: string
  /** 所在地（五洲/宗门/秘境名） */
  location?: string
  /** 开局剧本 id */
  openingScript?: string
  /** 心如磐石已消耗（挡过一次心魔） */
  heartStoneUsed?: boolean
  /** 突破失败标记（快照回退提示用） */
  lastBreakFailed?: boolean
  /** 战斗失利标记（快照回退提示用） */
  combatLost?: boolean
  /** 逆天改命持有计数（fate:名称 → 次数）及其它扩展键 */
  [key: string]: string | number | boolean | undefined
}

export interface GameState {
  version: number
  turn: number // 回合数（1 回合 = 1 个月）
  player: Player
  res: Resources
  timeline: Timeline
  bag: Record<string, number> // 物品 → 数量
  gongfaIds: string[] // 已学功法
  techniqueLevels: Record<string, number> // 技艺 → 等级 1~5
  enlightenment: Record<string, number> // 悟道分支 → 等级
  relationships: Record<string, number> // NPC id → 好感
  daoPartner: string | null // 道侣 NPC id
  cave: Cave
  sectInfo: SectInfo
  mainQuest: string
  flags: GameFlags
  log: string[] // 大事记（存档压缩包）
  lastSaveTurn: number
}

/** 存档格式（3 槽 + 自动 + JSON 导入导出 + 事件快照） */
export interface SaveFile {
  meta: {
    schema: 'wendao-changsheng'
    version: number
    savedAt: string
    turn: number
    summary: string // 道号 · 境界 · 天玄历
  }
  state: GameState
  /** 剧情流（最近 50 回合）——手动存档也含剧情流，读档后无缝续玩；旧存档无此字段自动兼容 */
  log?: { id: number; time: string; narrative: string; options: { text: string; tag?: string }[]; scene?: string; deltas?: string[] }[]
  pendingOptions?: { text: string; tag?: string }[]
  scene?: string
}

/** LLM 叙事设置（可配置 OpenAI 兼容端点） */
export interface NarratorSettings {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  /** 每回合是否调用 LLM；false 时系统指令降级为代码结算可玩，自由行动需配置 */
  useLlm: boolean
}

export const DEFAULT_SETTINGS: NarratorSettings = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash',
  temperature: 0.9,
  useLlm: true,
}
