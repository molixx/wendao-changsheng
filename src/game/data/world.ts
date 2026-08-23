// ============================================================
// world.ts —— 世界观数据（势力 / 地图 / 秘境 / NPC）
// 数据来源章节：第五章（世界观总览 5.1~5.4）、第十四章（情缘系统·示例角色库）
// ============================================================
import type { Sector, MapRegion, SecretRealm, Npc } from './types'

/**
 * 主要势力（原文 5.3，共 12 条：正道 5 / 魔道 3 / 中立 3 / 皇朝 1）。
 * 注意：雪族在原文中列于「正道」名单，但括号备注「中立」，此处按名单归入正道，
 * desc 中保留原文「中立」备注。
 */
export const SECTORS: Sector[] = [
  { id: 'tianyan', name: '天衍宗', camp: '正道', desc: '玄门正统' },
  { id: 'wanjian', name: '万剑阁', camp: '正道', desc: '剑修' },
  { id: 'danding', name: '丹鼎阁', camp: '正道', desc: '丹道' },
  { id: 'futu', name: '浮屠寺', camp: '正道', desc: '佛门' },
  { id: 'xuezu', name: '雪族', camp: '正道', desc: '冰系大族（原文备注：中立）' },
  { id: 'hexuan', name: '合欢宗', camp: '魔道', desc: '双修魔功' },
  { id: 'xuemozong', name: '血魔宗', camp: '魔道', desc: '血炼' },
  { id: 'youming', name: '幽冥殿', camp: '魔道', desc: '鬼修' },
  { id: 'tianji', name: '天机坊市', camp: '中立', desc: '商盟/情报' },
  { id: 'sanxiu', name: '散修联盟', camp: '中立', desc: '散修互助组织' },
  { id: 'yaozu', name: '妖族', camp: '中立', desc: '万兽谷/古妖山' },
  { id: 'daxia', name: '大夏', camp: '皇朝', desc: '凡人皇朝，可走「国师/供奉」线' },
]

/** 地图区域（原文 5.2，5 洲 + 危险分级 + 建议境界 + 主要地点） */
export const MAP_REGIONS: MapRegion[] = [
  {
    id: 'dongzhou-qingyue',
    name: '东洲·青岳',
    danger: '新手区（相对安全，偶然的秘境只通炼气/筑基）',
    suggested: '炼气~筑基',
    desc: '散修与凡人混居，青云宗、天机坊市坐落于此',
    places: ['青云宗', '天机坊市'],
  },
  {
    id: 'nanjiang-chiyan',
    name: '南疆·赤炎',
    danger: '妖兽横行，炼气期贸入外围妖兽可杀你，深处有化形妖王',
    suggested: '筑基~金丹',
    desc: '火系灵脉、妖兽横行',
    places: ['赤阳宗', '万兽谷', '古妖山'],
  },
  {
    id: 'xima-liusha',
    name: '西漠·流沙',
    danger: '灵气紊乱，行踪难测；魔渊深处化神都惊险',
    suggested: '金丹~元婴',
    desc: '上古遗迹与佛门净土，浮屠寺镇守魔渊',
    places: ['浮屠寺', '魔渊'],
  },
  {
    id: 'beiyuan-hanyuan',
    name: '北原·寒渊',
    danger: '雪暴、寒渊裂隙吞噬来客',
    suggested: '元婴~化神',
    desc: '冰系灵脉，雪族领地，幽冥殿鬼修出没',
    places: ['雪族领地', '幽冥殿'],
  },
  {
    id: 'zhongzhou-tianque',
    name: '中州·天阙',
    danger: '卧虎藏龙、高手如云，炼气期去可能被无数人踩在脚下、被随意欺压甚至灭口',
    suggested: '筑基~登仙皆可',
    desc: '修真界中心，诸道统林立',
    places: ['天衍宗', '万剑阁', '丹鼎阁'],
  },
]

/** 秘境（原文 5.2 风险标注 + 15 章补充描述，共 4 处） */
export const SECRET_REALMS: SecretRealm[] = [
  { id: 'tongling', name: '通灵秘境', risk: '新手', desc: '新手试炼' },
  { id: 'shanggu-dongfu', name: '上古洞府', risk: '高危', desc: '传承+凶险' },
  { id: 'xinmo-huanjing', name: '心魔幻境', risk: '道心', desc: '道心试炼' },
  { id: 'xukong-liefeng', name: '虚空裂缝', risk: '极高危', desc: '高回报高危' },
]

/** 示例角色库（原文 14 章，6 人）。age：墨尘原文未给年龄，故省略该字段 */
export const NPCS: Npc[] = [
  {
    id: 'gu-qingxuan',
    name: '顾清玄',
    identity: '青云宗真传',
    gender: '男',
    age: 22,
    traits: ['温润', '剑修'],
    likes: ['剑', '清茶', '山水'],
    tips: '攻：切磋论剑、助他参悟剑意；他认死理，勿欺',
  },
  {
    id: 'yun-qi',
    name: '云栖',
    identity: '天机坊市老板娘',
    gender: '女',
    age: 25,
    traits: ['聪慧', '狡黠'],
    likes: ['灵石', '奇闻', '算计'],
    tips: '攻：陪她做局、共享情报；别在她面前说谎',
  },
  {
    id: 'xie-wujiu',
    name: '谢无咎',
    identity: '血魔宗少主',
    gender: '男',
    age: 24,
    traits: ['亦正亦邪'],
    likes: ['烈酒', '杀戮', '真心'],
    tips: '攻：以命相交、并肩作战；他忌惮背叛胜过死亡',
  },
  {
    id: 'bai-ningshuang',
    name: '白凝霜',
    identity: '北原雪族圣女',
    gender: '女',
    age: 21,
    traits: ['清冷', '孤高'],
    likes: ['雪', '冰系灵植', '独处'],
    tips: '攻：以诚相待、勿油嘴；雪原共看极光可升温',
  },
  {
    id: 'mo-chen',
    name: '墨尘',
    identity: '古妖山少主',
    gender: '男',
    traits: ['化形妖族', '傲娇少年相'],
    likes: ['灵果', '肉食', '自由'],
    tips: '攻：护他妖身秘密、带他逛人间；他口嫌体正直',
  },
  {
    id: 'luo-qianqian',
    name: '洛浅浅',
    identity: '合欢宗弟子',
    gender: '女',
    age: 20,
    traits: ['魅惑', '多情'],
    likes: ['甜食', '双修', '新鲜事'],
    tips: '攻：认真待她，勿当玩物；她看似风流实则怕寂寞',
  },
]

/** 提及型 NPC 描述（原文各处出现但未展开立卡的角色，AI 可依此扩展） */
export const EXTRA_NPCS: string[] = [
  '上古剑仙残魂（附录 C：捡到锈剑一把，剑中残魂自称上古剑仙）',
  '神秘老者（15 章随机事件：神秘老者赠丹）',
  '梦中仙人（15 章奇遇：梦中仙人授法）',
  '化形妖王（5.2 南疆·赤炎深处）',
  '幽冥殿鬼修（5.2 北原·寒渊出没）',
  '浮屠寺僧众（5.2 西漠·流沙，镇守魔渊）',
  '青云宗外门弟子等修真界众生（17 章 NPC 生态：各有境界、寿元、人生轨迹，会修炼、突破、结道侣、老去、渡劫失败、飞升）',
]
