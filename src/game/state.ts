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
  /** 受伤状态（轻伤/重伤/垂死/内伤/中毒蛊/心魔缠身），null 为无 */
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
  flags: Record<string, string | number | boolean>
  log: string[] // 大事记（存档压缩包）
  lastSaveTurn: number
}

/** 存档格式（3 槽 + 自动 + JSON 导入导出） */
export interface SaveFile {
  meta: {
    schema: 'wendao-changsheng'
    version: number
    savedAt: string
    turn: number
    summary: string // 道号 · 境界 · 天玄历
  }
  state: GameState
}

/** LLM 叙事设置（可配置 OpenAI 兼容端点） */
export interface NarratorSettings {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  /** 每回合是否调用 LLM；false 则始终离线降级 */
  useLlm: boolean
}

export const DEFAULT_SETTINGS: NarratorSettings = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash',
  temperature: 0.9,
  useLlm: true,
}
