// ============================================================
// events.ts —— 事件与剧情（随机事件 / 奇遇 / 修仙大事 / 开局剧本 / 结局）
// 数据来源章节：第十五章（奇遇与秘境）、5.4（时间与历法·修仙大事）、
// 附录 C（开局剧本）、附录 B（结局路线一览）+ 原文 7.3（入魔线）、5.3（大夏国师/供奉线）
// ============================================================
import type { RandomEvent, Qiyu, MajorEvent, OpeningScript, Ending } from './types'

/**
 * 随机事件（原文 15 章，8 种）。
 * 触发规则：每回合 1d100，20% 触发。desc 依原文事件名转写。
 */
export const RANDOM_EVENTS: RandomEvent[] = [
  { id: 'elder-gives-pill', name: '神秘老者赠丹', desc: '神秘老者赠丹' },
  { id: 'secret-realm-opens', name: '秘境入口现世', desc: '秘境入口现世' },
  { id: 'spirit-rain', name: '天降灵雨', desc: '天降灵雨' },
  { id: 'ancient-stela', name: '上古残碑', desc: '上古残碑' },
  { id: 'beast-attacks', name: '妖兽袭村', desc: '妖兽袭村' },
  { id: 'message-talisman', name: '传音符报讯', desc: '传音符报讯' },
  { id: 'mistaken-identity', name: '被认错人', desc: '被认错人' },
  { id: 'heart-demon-rising', name: '心魔暗生', desc: '心魔暗生' },
]

/** 奇遇经典（原文 15 章，6 种） */
export const QIYUS: Qiyu[] = [
  { id: 'cliff-cave', name: '悬崖古洞得传承', desc: '悬崖古洞得传承' },
  { id: 'auction-bargain', name: '拍卖会捡漏', desc: '拍卖会捡漏' },
  { id: 'dream-immortal', name: '梦中仙人授法', desc: '梦中仙人授法' },
  { id: 'spirit-beast-bond', name: '灵兽认主', desc: '灵兽认主' },
  { id: 'senior-remains', name: '前辈坐化留遗蜕', desc: '前辈坐化留遗蜕' },
  { id: 'mystic-jade-slip', name: '捡到神秘玉简', desc: '捡到神秘玉简' },
]

/** 修仙大事（原文 5.4，5 项） */
export const MAJOR_EVENTS: MajorEvent[] = [
  { id: 'shengxian-dahui', name: '升仙大会', cycle: '5 年一度', desc: '炼气期大会' },
  { id: 'zongmen-dabi', name: '宗门大比', cycle: '10 年一度', desc: '夺魁可得长老收徒、入藏经阁' },
  { id: 'liemo-dahui', name: '猎魔大会', cycle: '20 年一度', desc: '' },
  { id: 'tianji-paimai', name: '天机拍卖会', cycle: '不定期', desc: '坊市拍卖，可喊价' },
  { id: 'lingqi-chaoxi', name: '灵气潮汐', cycle: '千年一度', desc: '灵气暴涨引来域外天魔觊觎；各大宗门争抢灵脉；上古仙人洞府陆续开启' },
]

/**
 * 开局剧本（附录 C，5 个，AI 随机选用或让玩家选）。
 * start 为开局时间行（原文 5.4：开局天玄历 387 年 · 春），全剧本通用。
 */
export const OPENING_SCRIPTS: OpeningScript[] = [
  { id: 'mountain-village', name: '山村少年', desc: '山村少年偶得仙人遗落玉简，灵根初显', start: '天玄历 387 年 · 春' },
  { id: 'market-bargain', name: '坊市捡漏', desc: '天机坊市散修摊上捡漏一枚神秘丹药', start: '天玄历 387 年 · 春' },
  { id: 'sect-trial', name: '宗门试炼', desc: '青云宗开山收徒，你挤在凡人中参加入门试炼', start: '天玄历 387 年 · 春' },
  { id: 'ancient-sword', name: '上古剑仙', desc: '捡到锈剑一把，剑中残魂自称上古剑仙', start: '天玄历 387 年 · 春' },
  { id: 'border-demon-tide', name: '边关妖潮', desc: '大夏征兵你本欲从军，却遇上妖潮来袭', start: '天玄历 387 年 · 春' },
]

/**
 * 结局路线（附录 B 8 条 + 特殊线 2 条：入魔线 / 大夏国师·供奉线）。
 * type 依结局性质：正常 / 死亡 / 特殊。
 */
export const ENDINGS: Ending[] = [
  { id: 'feisheng', name: '飞升成仙', type: '正常', desc: '登仙圆满 + 渡劫成功（天道）' },
  { id: 'xiaoyao', name: '逍遥长生', type: '正常', desc: '登仙 + 归隐，与道侣同隐更佳' },
  { id: 'yidai-xianzun', name: '一代仙尊', type: '正常', desc: '登仙 + 开宗立派 + 威望盖世' },
  { id: 'shouhu-zhiyue', name: '守护之约', type: '特殊', desc: '守护所爱之人到最后一刻（情缘线）' },
  { id: 'modao-zhizun', name: '魔道至尊', type: '特殊', desc: '入魔道统一魔道，渡劫难度大增' },
  { id: 'zuohua', name: '坐化', type: '死亡', desc: '寿元耗尽，回首一生' },
  { id: 'yunluo', name: '陨落', type: '死亡', desc: '战斗/渡劫/心魔' },
  { id: 'lunhui', name: '轮回', type: '特殊', desc: '死后可转世重开，继承部分仙缘/灵根/记忆彩蛋' },
  { id: 'rumo-line', name: '入魔线', type: '特殊', desc: '魔道将业力炼化为修为（快而险），业力积重难返将走火入魔、入魔线' },
  { id: 'daxia-line', name: '大夏国师/供奉线', type: '特殊', desc: '凡人皇朝·大夏可走「国师/供奉」线（官宦子弟出身可走国师线）' },
]
