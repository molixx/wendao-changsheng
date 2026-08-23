// ============================================================
// creation.ts —— 创角数据
// 数据来源章节：第六章（创角系统，含 6.1~6.7）
// ============================================================
import type { Origin, SpiritRoot, Physique, Talent, DaoPath } from './types'

/** 性别（原文 6.1，全性向） */
export const GENDERS: string[] = ['男', '女', '自定义']

/** 出身（原文 6.2，十选一）。bonus 在六维分配后结算 */
export const ORIGINS: Origin[] = [
  { id: 'farmer', name: '农家子', desc: '心性坚韧（道心+2），无依无靠', bonus: { 道心: 2 } },
  { id: 'hunter', name: '猎户之后', desc: '气血+20，熟悉山林', bonus: { 气血: 20 } },
  { id: 'merchant', name: '商贾之家', desc: '灵石+300，仙缘+1', bonus: { 灵石: 300, 仙缘: 1 } },
  { id: 'official', name: '官宦子弟', desc: '声望+20，可走大夏国师线', bonus: { 声望: 20 } },
  { id: 'general', name: '将门之后', desc: '道心+1、悟性+1', bonus: { 道心: 1, 悟性: 1 } },
  { id: 'fallen-family', name: '没落世家', desc: '携先祖残卷（随机玄阶功法）' },
  { id: 'orphan', name: '市井孤儿', desc: '遁速+2，三教九流皆识', bonus: { 遁速: 2 } },
  { id: 'scholar', name: '书香门第', desc: '悟性+3，过目不忘', bonus: { 悟性: 3 } },
  { id: 'hermit-orphan', name: '方外遗孤', desc: '自幼随师（资质+2），无牵无挂', bonus: { 资质: 2 } },
  { id: 'yao-blood', name: '妖族后裔', desc: '半妖之身，可走妖修线', rare: true },
]

/**
 * 灵根（原文 6.3 / 9.1）。
 * 系数：天灵根 2.0 / 地灵根 1.6 / 真灵根 1.3 / 伪灵根 1.0 / 变异灵根 1.8；
 * 变异灵根（雷/风/冰/阴/阳）修对应系功法再 +20%。
 * elements：天/地/真/伪的具体系别由玩家自选（原文仅说明系数），故按原文写 单/双/三/四、五系；
 * 变异灵根的雷/风/冰/阴/阳为原文明确给出。
 */
export const SPIRIT_ROOTS: SpiritRoot[] = [
  { id: 'tian', name: '天灵根', desc: '单系，万中无一：修炼极快，专精一系', kind: 'tian', elements: ['单系'], coefficient: 2.0 },
  { id: 'di', name: '地灵根', desc: '双系，主次分明', kind: 'di', elements: ['双系'], coefficient: 1.6 },
  { id: 'zhen', name: '真灵根', desc: '三系，均衡', kind: 'zhen', elements: ['三系'], coefficient: 1.3 },
  { id: 'wei', name: '伪灵根', desc: '四/五系，杂而不精：修炼慢，但可修多系法术', kind: 'wei', elements: ['四系', '五系'], coefficient: 1.0 },
  { id: 'bianyi-lei', name: '变异灵根·雷', desc: '机缘所得，特殊功法适配；修对应系功法再 +20%', kind: 'bianyi', elements: ['雷'], coefficient: 1.8 },
  { id: 'bianyi-feng', name: '变异灵根·风', desc: '机缘所得，特殊功法适配；修对应系功法再 +20%', kind: 'bianyi', elements: ['风'], coefficient: 1.8 },
  { id: 'bianyi-bing', name: '变异灵根·冰', desc: '机缘所得，特殊功法适配；修对应系功法再 +20%', kind: 'bianyi', elements: ['冰'], coefficient: 1.8 },
  { id: 'bianyi-yin', name: '变异灵根·阴', desc: '机缘所得，特殊功法适配；修对应系功法再 +20%', kind: 'bianyi', elements: ['阴'], coefficient: 1.8 },
  { id: 'bianyi-yang', name: '变异灵根·阳', desc: '机缘所得，特殊功法适配；修对应系功法再 +20%', kind: 'bianyi', elements: ['阳'], coefficient: 1.8 },
]

/** 先天体质（原文 6.4，可选或随机） */
export const PHYSIQUES: Physique[] = [
  { id: 'xiantian-dao', name: '先天道体', desc: '修炼+50%' },
  { id: 'jian-ling', name: '剑灵体', desc: '剑道亲和' },
  { id: 'jiuyang', name: '九阳圣体', desc: '火系威力+30%' },
  { id: 'bingpo', name: '冰魄灵体', desc: '冰系威力+30%' },
  { id: 'xuanyin', name: '玄阴体', desc: '双修增益，情缘线' },
  { id: 'chunyang', name: '纯阳体', desc: '双修增益，情缘线' },
  { id: 'hundun', name: '混沌体', desc: '传说，五行皆通' },
  { id: 'fan-ti', name: '凡体', desc: '无特殊' },
]

/**
 * 天赋（原文 6.6，11 项，默认 5 点天赋点；出身/道途可增减）。
 * 原文未逐项标 cost，按默认 5 点计：正常天赋各 1 点；
 * 负面天赋「体弱多病」气血-50，换回 2 点（cost 记 2、negative 标记）。
 */
export const TALENTS: Talent[] = [
  { id: 'congming', name: '天资聪颖', desc: '资质+3', cost: 1, bonus: { 资质: 3 } },
  { id: 'guomu', name: '过目不忘', desc: '悟性+3', cost: 1, bonus: { 悟性: 3 } },
  { id: 'shenqing', name: '身轻如燕', desc: '遁速+3', cost: 1, bonus: { 遁速: 3 } },
  { id: 'tiansheng-daoxin', name: '天生道心', desc: '道心+3', cost: 1, bonus: { 道心: 3 } },
  { id: 'qiyun', name: '气运加身', desc: '仙缘+3', cost: 1, bonus: { 仙缘: 3 } },
  { id: 'shenshi', name: '神识过人', desc: '神识+3', cost: 1, bonus: { 神识: 3 } },
  { id: 'baimai', name: '百脉俱通', desc: '灵力上限+50', cost: 1, bonus: { 灵力上限: 50 } },
  { id: 'gangjin', name: '钢筋铁骨', desc: '气血上限+80', cost: 1, bonus: { 气血上限: 80 } },
  { id: 'yaoli', name: '药理通神', desc: '炼丹+1 级', cost: 1, bonus: { 炼丹: 1 } },
  { id: 'taohua', name: '桃花运', desc: '初始好感+20%', cost: 1 },
  { id: 'ti-ruo', name: '体弱多病', desc: '负面天赋：气血-50，换回 2 点', cost: 2, negative: true, bonus: { 气血上限: -50 } },
]

/** 道途追求（原文 6.7 六选一；主线钩子见 5.2b） */
export const DAO_PATHS: DaoPath[] = [
  { id: 'wendao', name: '问道飞升', desc: '问鼎大道，求飞升之路', hook: '自创功法、参悟天机，寻飞升之路' },
  { id: 'chang-sheng', name: '逍遥长生', desc: '超然物外，长生于世', hook: '护住所爱之人，渡百年千年' },
  { id: 'en-chou', name: '快意恩仇', desc: '恩怨分明，快意恩仇', hook: '血亲/故人旧怨，寻仇亦被仇寻' },
  { id: 'shou-hu', name: '守护所爱', desc: '守护挚友道侣，生死相随', hook: '某挚友/道侣身负隐疾或寿元大限' },
  { id: 'wen-ding', name: '问鼎天下', desc: '图谋霸业，问鼎天下', hook: '从外门弟子爬到一宗之主、乃至一州霸主' },
  { id: 'sui-xin', name: '随心所欲', desc: '逍遥自在，随心而行', hook: '每次随机奇遇拼机缘，自由散修' },
]

/** 六维分配规则（原文 6.5）：初始共 60 点自由分配，单项上限 15、下限 1；出身修正在分配后结算；最终值不超过 20、不低于 1 */
export const STAT_LIMITS: { total: number; perMax: number; perMin: number; finalMax: number; finalMin: number } = {
  total: 60,
  perMax: 15,
  perMin: 1,
  finalMax: 20,
  finalMin: 1,
}
