// ============================================================
// systems.ts —— 系统数值（技艺 / 功法 / 悟道 / 逆天改命 / 坊市 / 洞府 / 宗门 / 战斗 / 受伤 / 修炼公式）
// 数据来源章节：第九章（修炼悟道 9.1/9.3/9.4）、第十章（技艺）、第十一章（宗门）、
// 第十二章（坊市）、第十三章（洞府）、第十六章（战斗 16.2）、
// 第七章（状态资源 7.1 受伤等级表）、第八章（8.3 逆天改命）、附录 A（功法与神通示例）
// ============================================================
import type { Technique, Gongfa, InjuryLevel, CultivationFormula } from './types'

/** 技艺（原文 10 章，6 种 × 5 级：初窥→熟练→精通→大师→宗师） */
export const TECHNIQUES: Technique[] = [
  { id: 'lian-dan', name: '炼丹', levels: ['初窥', '熟练', '精通', '大师', '宗师'] },
  { id: 'lian-qi', name: '炼器', levels: ['初窥', '熟练', '精通', '大师', '宗师'] },
  { id: 'fu-lu', name: '符箓', levels: ['初窥', '熟练', '精通', '大师', '宗师'] },
  { id: 'zhen-fa', name: '阵法', levels: ['初窥', '熟练', '精通', '大师', '宗师'] },
  { id: 'yu-shou', name: '御兽', levels: ['初窥', '熟练', '精通', '大师', '宗师'] },
  { id: 'ling-zhi', name: '灵植', levels: ['初窥', '熟练', '精通', '大师', '宗师'] },
]

/**
 * 功法与神通示例（附录 A，12 项，AI 掉落/传授参考）。
 * type 依原文：功法 / 法术 / 身法 / 丹方 / 丹道。
 * 注：造化丹经原文类别为「丹道」（非丹方），按原文转写。
 */
export const GONGFAS: Gongfa[] = [
  { id: 'juqi-jue', name: '聚气诀', grade: '黄', type: '功法', effect: '修炼+10%，入门内功' },
  { id: 'liehuo-zhang', name: '烈火掌', grade: '黄', element: '火', type: '法术', effect: '火系小威力' },
  { id: 'yufeng-shu', name: '御风术', grade: '黄', type: '身法', effect: '遁速+5%' },
  { id: 'changchun-gong', name: '长春功', grade: '玄', type: '功法', effect: '修炼+30%，气血回复+' },
  { id: 'liuhuo-jianjue', name: '流火剑诀', grade: '玄', element: '火', type: '法术', effect: '火系剑法，可灼烧' },
  { id: 'bingpo-jue', name: '冰魄诀', grade: '玄', element: '冰', type: '法术', effect: '冰系，减速' },
  { id: 'zixiao-leifa', name: '紫霄雷法', grade: '地', element: '雷', type: '法术', effect: '雷系大威力，需雷灵根' },
  { id: 'xuanyuan-jianjing', name: '玄元剑经', grade: '地', element: '剑', type: '功法', effect: '剑系威力+40%，需剑灵体/剑道' },
  { id: 'jiuzhuan-huanhun', name: '九转还魂丹方', grade: '地', type: '丹方', effect: '起死回生（材料极稀）' },
  { id: 'taixu-jiandian', name: '太虚剑典', grade: '天', element: '剑', type: '功法', effect: '修炼+120%，剑系大成' },
  { id: 'zaohua-danjing', name: '造化丹经', grade: '天', type: '丹道', effect: '炼丹大宗师之路' },
  { id: 'hongmeng-ziqi', name: '鸿蒙紫气诀', grade: '仙', type: '功法', effect: '万法归宗，需天道机缘（传说）' },
]

/** 悟道树分支（原文 9.3，9 支）。悟道点 1 点 = 点亮 1 级，每分支有永久被动 */
export const ENLIGHTENMENT_BRANCHES: string[] = [
  '剑道（剑系威力+5%/级）',
  '丹道（炼丹成功率+5%/级）',
  '器道',
  '符道',
  '阵道',
  '体道',
  '御兽道',
  '无情道',
  '有情道（情缘好感收益+10%/级）',
]

/** 逆天改命（原文 8.3，12 项：每次大境界突破成功，从 3 个随机天资中选 1，可叠加可升级） */
export const FATE_CHANGES: string[] = [
  '剑心通明（剑系威力+20%）',
  '丹药精通（炼丹+1 级）',
  '气运如虹（仙缘+2）',
  '肉身成圣（气血上限+20%）',
  '天眼通（神识+3，探查无死角）',
  '双修悟道（双修修为收益+50%）',
  '聚灵体（修炼+15%）',
  '心如磐石（道心+3，可挡一次心魔）',
  '万里神行（遁速+3）',
  '灵兽亲和（御兽+1 级）',
  '血魔噬魂（魔道：击杀回血）',
  '大道之体（传说：全系资质+1）',
]

/** 坊市物价参考（原文 12 章） */
export const PRICES: string[] = [
  '聚气丹 20 灵石',
  '筑基丹 500 灵石',
  '玄阶功法 300~1000 灵石',
  '地阶功法 3000+ 灵石',
  '灵药若干',
  '洞府租/购',
]

/** 洞府设施（原文 13 章，6 类） */
export const CAVE_FACILITIES: string[] = [
  '静室（闭关效率+）',
  '丹房（炼丹成功率+）',
  '器坊',
  '灵田（种灵药）',
  '聚灵阵',
  '禁制（防盗）',
]

/** 宗门阶级链（原文 11 章） */
export const SECT_RANKS: string[] = ['入门', '外门弟子', '内门', '真传', '长老', '掌门']

/** 战斗回合指令（原文 16.2，每回合选 1 条，共 9 种） */
export const COMBAT_COMMANDS: string[] = [
  '攻击',
  '施法（耗五行灵气+灵力）',
  '绝技（蓄势 2 回合，威力极高）',
  '防御（减伤 50%）',
  '遁走（遁速判定，失败被黏住）',
  '用符/用丹（回血回灵）',
  '召唤战宠（耗神识）',
  '说话（谈判、示弱、恐吓，可降对方战意或改变局势）',
  '冷静观察（判断对方破绽，下回合暴击）',
]

/**
 * 受伤等级表（原文 7.1，6 级）。AI 必须据此结算状态卡「异常」，并如实压在属性上
 */
export const INJURIES: InjuryLevel[] = [
  { id: 'light', name: '轻伤', penalty: '属性 -0', desc: '气血余 66~99%；行动照常；丹药或疗养数日恢复' },
  { id: 'severe', name: '重伤', penalty: '属性 -20%，遁速减半', desc: '气血余 33~65%；可能留下暗疾；疗伤药 + 月余静养' },
  { id: 'dying', name: '垂死', penalty: '属性 -50%，无法遁走', desc: '气血余 <33%；随时可能昏迷；续命丹药 + 高阶医修/灵药' },
  { id: 'inner', name: '内伤', penalty: '修为增长 -50%', desc: '灵力反噬/丹田受损；持续数月至数年；特殊丹药、长时间闭关' },
  { id: 'poison', name: '中毒/蛊', penalty: '气血速减或属性被压（视毒性）', desc: '中术所致；解毒丹、药王谷' },
  { id: 'heart-demon', name: '心魔缠身', penalty: '闭关效率暴跌，偶发失控/入魔', desc: '道心 <40 或情劫所致；渡心魔、论道、清心' },
]

/**
 * 修炼速度公式（原文 9.1）：月修为增长 = 10 × 资质系数 × 灵根系数 × 功法系数 × 灵气系数 × 心境系数；
 * 闭关修炼 = 正常速率 ×2；服丹药/双修按各自加成结算。
 * 每档一条记录（statName 为「系数·档位」）。
 */
export const CULTIVATION_FORMULA: CultivationFormula[] = [
  { statName: '月修为基数', coefficient: 10, note: '月修为 = 10 × 资质 × 灵根 × 功法 × 灵气 × 心境' },
  { statName: '资质', coefficient: 0.05, note: '每点 +5%（资质 10 → 系数 1.5）' },
  { statName: '灵根·天灵根', coefficient: 2.0 },
  { statName: '灵根·地灵根', coefficient: 1.6 },
  { statName: '灵根·真灵根', coefficient: 1.3 },
  { statName: '灵根·伪灵根', coefficient: 1.0 },
  { statName: '灵根·变异灵根', coefficient: 1.8, note: '修对应系功法再 +20%' },
  { statName: '功法·黄阶', coefficient: 1.0 },
  { statName: '功法·玄阶', coefficient: 1.3 },
  { statName: '功法·地阶', coefficient: 1.7 },
  { statName: '功法·天阶', coefficient: 2.2 },
  { statName: '功法·仙阶', coefficient: 3.0 },
  { statName: '灵气·贫瘠', coefficient: 0.6 },
  { statName: '灵气·普通', coefficient: 1.0 },
  { statName: '灵气·浓郁', coefficient: 1.5 },
  { statName: '灵气·福地', coefficient: 2.0 },
  { statName: '灵气·洞天', coefficient: 2.5 },
  { statName: '心境·超预期', coefficient: 1.2, note: '心境 ≥ 境界要求' },
  { statName: '心境·达标', coefficient: 1.0 },
  { statName: '心境·不达标', coefficient: 0.5 },
  { statName: '闭关', coefficient: 2.0, note: '闭关修炼 = 正常速率 ×2' },
]
