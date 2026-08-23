// ============================================================
// systems.ts —— 系统模块引擎（技艺 / 洞府 / 宗门 / 情缘 / 随机事件 / 奇遇 / 疗伤）
// 数据来源章节：
//   第十章（技艺：6 技艺 × 5 级；炼丹/炼器需材料 + 神识判定，失败炸炉毁材料）
//   第十一章（宗门：入门→外门弟子→内门→真传→长老→掌门；贡献任务：采药/巡逻/猎妖/护送/镇守）
//   第十三章（洞府：灵气浓度五档 + 丹房/器坊等设施加成）
//   第十四章（情缘：好感 0~100 六档区间；送礼查喜好；道侣 80~99；修罗场/情劫）
//   第十五章（奇遇与秘境：每回合 1d100 20% 随机事件；低概率经典奇遇）
//   第七章 7.1（受伤等级表 6 级与恢复手段）
//   第九章 9.3（丹道：炼丹成功率+5%/级；有情道：情缘好感收益+10%/级）
// 原则：纯函数、不可变更新（绝不 mutate 入参）。时间推进由回合管线（turn.ts）负责，
//       本模块只结算数值，「耗时一月」等以 msg 提示，由调用方决定是否推进时间。
// ============================================================

import type { GameState, Resources } from '../state'
import { d100, roll, chance, pick, die } from './dice'
import { TECHNIQUES, SECT_RANKS, INJURIES, GONGFAS, CAVE_FACILITIES } from '../data/systems'
import { RANDOM_EVENTS, QIYUS } from '../data/events'
import { NPCS } from '../data/world'

// ---------------- 通用不可变工具 ----------------

function withRes(state: GameState, patch: Partial<Resources>): GameState {
  return { ...state, res: { ...state.res, ...patch } }
}

function withBag(state: GameState, key: string, delta: number): GameState {
  const bag = { ...state.bag }
  const next = (bag[key] ?? 0) + delta
  if (next <= 0) delete bag[key]
  else bag[key] = next
  return { ...state, bag }
}

function withLog(state: GameState, entry: string): GameState {
  return { ...state, log: [...state.log, entry] }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 悟道分支等级（兼容「丹道」与「丹道（炼丹成功率+5%/级）」两种键名写法） */
function enlightenmentLevel(state: GameState, branch: string): number {
  const direct = state.enlightenment[branch]
  if (direct !== undefined) return direct
  for (const [k, v] of Object.entries(state.enlightenment)) {
    if (k === branch || k.startsWith(branch)) return v
  }
  return 0
}

/** 受伤等级 id → 中文名（写入 state.res.injury 时用原文名） */
function injuryName(id: string): string {
  return INJURIES.find(i => i.id === id)?.name ?? id
}

/** 受伤名称 → id（兼容 7.1 表「中毒/蛊」与状态卡注释「中毒蛊」两种写法） */
function injuryIdOf(name: string): string | null {
  const found = INJURIES.find(i => i.name === name)
  if (found) return found.id
  if (name === '中毒蛊') return 'poison'
  return null
}

/** 从候选池随机取一门未学过的功法；已全学会则返回 null */
function pickUnlearnedGongfa(state: GameState, pool?: string[]): string | null {
  const learned = new Set(state.gongfaIds)
  const candidates = (pool ?? GONGFAS.map(g => g.id)).filter(id => !learned.has(id))
  return candidates.length > 0 ? pick(candidates) : null
}

/** 洞府是否已建某设施（cave.facilities 存原文全名，如「丹房（炼丹成功率+）」） */
function caveHasFacility(state: GameState, prefix: string): boolean {
  return state.cave.facilities.some(f => f.startsWith(prefix))
}

// ============================================================
// 一、技艺修炼（原文第十章）
// 原文要点：炼丹/炼器需「丹方/器谱 + 材料 + 神识判定」；失败炸炉毁材料；等级越高成功越高。
// 取舍说明：
//  - 丹方/器谱校验从简不查（开局未设初始丹方，硬校验会开局死锁），只校验材料；
//  - 原文只规定炼丹/炼器用神识判定，其余四门判定属性按常理取舍（符箓/阵法→悟性，御兽→道心，灵植→资质）；
//  - 灵石消耗、成功率基数原文未给，此处按「20 + 等级×10 灵石、基础 45 + 等级×10 + 属性×2（上限 95）」取舍；
//  - 炼丹按丹道悟道 +5%/级（原文 9.3）、丹房 +5%（原文 13 章）；炼器器坊 +5%。
// ============================================================

const TECH_STAT: Record<string, keyof GameState['player']['stats']> = {
  'lian-dan': 'shenshi',
  'lian-qi': 'shenshi',
  'fu-lu': 'wuxing',
  'zhen-fa': 'wuxing',
  'yu-shou': 'daoxin',
  'ling-zhi': 'zizhi',
}

/** 炼丹/炼器所需材料（原文 10 章；其余四门无材料要求） */
const TECH_MATERIAL: Record<string, string> = { 'lian-dan': '灵药', 'lian-qi': '精铁' }
const TECH_MATERIAL_COUNT = 2

/** 设施加成（取 data/systems.ts CAVE_FACILITIES 第 2/3 项首词：「丹房」「器坊」） */
const TECH_FACILITY: Record<string, string> = {
  'lian-dan': CAVE_FACILITIES[1].slice(0, 2),
  'lian-qi': CAVE_FACILITIES[2].slice(0, 2),
}

export function practiceTechnique(
  state: GameState,
  techniqueId: string,
): { state: GameState; ok: boolean; msg: string } {
  const tech = TECHNIQUES.find(t => t.id === techniqueId)
  if (!tech) return { state, ok: false, msg: '并无此技艺。' }

  const cur = state.techniqueLevels[techniqueId] ?? 0
  if (cur >= tech.levels.length) {
    return { state, ok: false, msg: `你的${tech.name}已臻「${tech.levels[tech.levels.length - 1]}」之境，非寻常练习可再进。` }
  }

  // 灵石消耗（原文未给数值，取舍：少量）
  const spiritCost = 20 + cur * 10
  if (state.res.spirit < spiritCost) {
    return { state, ok: false, msg: `灵石不足（练习需 ${spiritCost} 灵石）。` }
  }

  // 材料检查（仅炼丹/炼器）
  const material = TECH_MATERIAL[techniqueId]
  if (material && (state.bag[material] ?? 0) < TECH_MATERIAL_COUNT) {
    return { state, ok: false, msg: `材料不足：${tech.name}需${material}×${TECH_MATERIAL_COUNT}，先备齐材料再动手。` }
  }

  // 成功率：基础 45 + 等级×10 + 判定属性×2（上限 95）；炼丹再加丹道悟道与丹房加成，炼器加器坊
  const stat = state.player.stats[TECH_STAT[techniqueId]]
  let rate = 45 + cur * 10 + stat * 2
  if (techniqueId === 'lian-dan') rate += enlightenmentLevel(state, '丹道') * 5
  const facility = TECH_FACILITY[techniqueId]
  if (facility && caveHasFacility(state, facility)) rate += 5
  rate = Math.min(95, rate)

  const r = roll(rate)

  // 灵石与材料一经投入即消耗（成功亦消耗：材料化为成品，产出结算由炼丹/炼器产出系统另行负责）
  let next = withRes(state, { spirit: state.res.spirit - spiritCost })
  if (material) next = withBag(next, material, -TECH_MATERIAL_COUNT)

  if (!r.ok) {
    // 失败惩罚：炸炉毁材料（炼丹/炼器，材料已扣除）；其余技艺仅灵石白费
    return {
      state: next,
      ok: false,
      msg: `这次${tech.name}尝试失败了（判定 ${r.roll} / 成功率 ${rate}）。${material ? `${material}尽毁于炉鼎之中，损失惨重。` : '灵石白费，只得下次再试。'}耗时约一月。`,
    }
  }

  const newLevel = cur + 1
  const techniqueLevels = { ...next.techniqueLevels, [techniqueId]: newLevel }
  const upgraded = newLevel >= tech.levels.length
  const s2 = upgraded
    ? withLog({ ...next, techniqueLevels }, `技艺大成：${tech.name}晋至「${tech.levels[newLevel - 1]}」`)
    : { ...next, techniqueLevels }
  return {
    state: s2,
    ok: true,
    msg: `${tech.name}练习有成（判定 ${r.roll} / 成功率 ${rate}），熟练度提升。${upgraded ? `技艺晋入「${tech.levels[newLevel - 1]}」之境！` : `当前「${tech.levels[newLevel - 1]}」（${newLevel}/${tech.levels.length}）。`}耗时约一月。`,
  }
}

// ============================================================
// 二、洞府（原文第十三章）
// 原文要点：灵气浓度决定修炼灵气系数（9.1：贫瘠0.6/普通1.0/浓郁1.5/福地2.0/洞天2.5），
//          可用灵石/材料/灵脉升级；设施：静室/丹房/器坊/灵田/聚灵阵/禁制。
// 取舍说明：原文未给升级价格，此处按 200/800/3000/12000（约 4 倍递增）取舍；仅实现灵石路径。
// ============================================================

const CAVE_LEVELS: readonly string[] = ['贫瘠', '普通', '浓郁', '福地', '洞天']
const CAVE_UPGRADE_COSTS: readonly number[] = [200, 800, 3000, 12000]

export function caveUpgrade(state: GameState): { state: GameState; ok: boolean; msg: string } {
  const lv = state.cave.level
  if (lv >= CAVE_LEVELS.length - 1) {
    return { state, ok: false, msg: '洞府已是「洞天」福地，灵气无可再升。' }
  }
  const cost = CAVE_UPGRADE_COSTS[lv]
  if (state.res.spirit < cost) {
    return { state, ok: false, msg: `灵石不足（升级需 ${cost} 灵石，现仅 ${state.res.spirit}）。` }
  }
  const newLevel = lv + 1
  const next: GameState = {
    ...state,
    res: { ...state.res, spirit: state.res.spirit - cost },
    cave: { ...state.cave, level: newLevel, spiritConcentration: CAVE_LEVELS[newLevel] },
  }
  const s2 = newLevel >= CAVE_LEVELS.length - 1 ? withLog(next, '洞府升至「洞天」') : next
  return {
    state: s2,
    ok: true,
    msg: `洞府灵气从「${CAVE_LEVELS[lv]}」升至「${CAVE_LEVELS[newLevel]}」（灵气系数 ${[0.6, 1.0, 1.5, 2.0, 2.5][newLevel]}），耗灵石 ${cost}。`,
  }
}

// ============================================================
// 三、宗门（原文第十一章）
// 原文要点：入门→外门弟子→内门→真传→长老→掌门；贡献任务（采药/巡逻/猎妖/护送/镇守）；
//          叛宗扣声望、可能被追杀；自立山头需声望+境界（此处不实现）。
// 取舍说明：任务成功率、贡献/灵石奖励、各阶贡献阈值原文未给，此处按
//          「成功率 = 60 + 神识×2（猎妖/镇守 -10，上限 90）、成功 +10 贡献 +21~50 灵石、
//          失败 +2 苦劳、晋升阈值 50/150/400/1000/3000」取舍；
//          长老/掌门原文需宗门大比等大事件，此处按贡献简化晋升。
// ============================================================

const SECT_TASKS: readonly string[] = ['采药', '巡逻', '猎妖', '护送', '镇守']
const SECT_RANK_REQ: readonly number[] = [0, 50, 150, 400, 1000, 3000]

export function sectJoin(
  state: GameState,
  sectName: string,
): { state: GameState; ok: boolean; msg: string } {
  // 初始状态 sectInfo.sect 为「散修」哨兵值，视为未入宗门
  const current = state.sectInfo.sect
  if (current && current !== '散修' && current !== sectName) {
    return { state, ok: false, msg: `你已是${current}之人，改投他宗需先叛宗（扣声望、或遭追杀）。` }
  }
  if (current === sectName) {
    return { state, ok: false, msg: `你已在${sectName}门下。` }
  }
  const rank = SECT_RANKS[0] // 「入门」
  const next: GameState = {
    ...state,
    player: { ...state.player, sect: `${sectName}·${rank}` },
    sectInfo: { sect: sectName, rank, contribution: 0 },
  }
  return { state: withLog(next, `拜入${sectName}，为${rank}`), ok: true, msg: `你通过入门考验，拜入${sectName}，从「${rank}」做起。` }
}

export function sectTask(state: GameState): { state: GameState; ok: boolean; msg: string } {
  // 初始状态 sectInfo.sect 为「散修」哨兵值，视为未入宗门
  if (!state.sectInfo.sect || state.sectInfo.sect === '散修') {
    return { state, ok: false, msg: '你尚未加入宗门，先去寻一处仙门拜入吧。' }
  }

  const task = pick(SECT_TASKS)
  const danger = task === '猎妖' || task === '镇守'
  const rate = Math.min(90, 60 + state.player.stats.shenshi * 2 - (danger ? 10 : 0))
  const r = roll(rate)

  let contribution = state.sectInfo.contribution
  let spiritGain: number
  let detail: string
  if (r.ok) {
    contribution += 10
    spiritGain = 20 + die(30) // 21~50 灵石
    detail = `圆满完成任务，宗门记功 10 点，赐灵石 ${spiritGain}。`
  } else {
    contribution += 2
    spiritGain = 5
    detail = `任务波折无功，只算苦劳 +2 贡献，得灵石 ${spiritGain} 慰劳。`
  }

  let next = withRes(state, { spirit: state.res.spirit + spiritGain })
  if (!r.ok && danger && chance(0.1)) {
    // 猎妖/镇守失败小概率负伤
    next = withRes(next, { hp: Math.max(1, next.res.hp - 5), injury: next.res.injury ?? injuryName('light') })
    detail += ' 与妖兽缠斗负了轻伤。'
  }
  next = { ...next, sectInfo: { ...next.sectInfo, contribution } }

  // 贡献达标晋升（SECT_RANKS 阶级链）
  const oldIdx = SECT_RANKS.indexOf(next.sectInfo.rank)
  let newIdx = oldIdx
  while (newIdx < SECT_RANKS.length - 1 && contribution >= SECT_RANK_REQ[newIdx + 1]) newIdx++
  let promoMsg = ''
  if (newIdx > oldIdx) {
    const newRank = SECT_RANKS[newIdx]
    next = {
      ...next,
      player: { ...next.player, sect: `${next.sectInfo.sect}·${newRank}` },
      sectInfo: { ...next.sectInfo, rank: newRank },
    }
    promoMsg = ` 贡献达标，晋升为「${newRank}」！`
    next = withLog(next, `${next.sectInfo.sect}晋升：${newRank}`)
  }
  return { state: next, ok: true, msg: `你接下「${task}」任务（成功率 ${rate}，判定 ${r.roll}）。${detail}当前贡献 ${contribution}。${promoMsg}` }
}

// ============================================================
// 四、情缘（原文第十四章，全性向）
// 原文要点：好感 0~100：陌生(0-19)→相识(20-39)→知己(40-59)→暧昧(60-79)→道侣(80-99)→生死相许(100+)；
//          送礼查喜好（示例角色库 likes）、论道、同游等提升；失信/伤害亲友/立场冲突下降；
//          多线并行触发修罗场（吃醋/情劫）；情劫（道侣陨落/背叛）触发道心考验。
// 取舍说明：单次好感增减数值原文未给，此处按「投其所好 +12、寻常赠礼 +4、论道 +4~6、同游 +5~8、
//          表白失败 -10、疏远 -10（断缘 -20）」取舍；表白门槛取 80（= 道侣区间下限，原文 14 章）；
//          有情道悟道好感收益 +10%/级（原文 9.3）。
// ============================================================

export const AFFECTION_DAO_PARTNER = 80

function affectionStage(v: number): string {
  if (v >= 100) return '生死相许'
  if (v >= 80) return '道侣'
  if (v >= 60) return '暧昧'
  if (v >= 40) return '知己'
  if (v >= 20) return '相识'
  return '陌生'
}

export function affectionAction(
  state: GameState,
  npcId: string,
  kind: '赠礼' | '论道' | '同游' | '表白' | '疏远',
): { state: GameState; ok: boolean; msg: string } {
  const npc = NPCS.find(n => n.id === npcId)
  if (!npc) return { state, ok: false, msg: '查无此人。' }

  const cur = state.relationships[npcId] ?? 0
  const mult = 1 + 0.1 * enlightenmentLevel(state, '有情道') // 有情道：情缘好感收益+10%/级

  if (kind === '表白') {
    if (state.daoPartner === npcId) return { state, ok: false, msg: `你与${npc.name}已是道侣。` }
    if (state.daoPartner) {
      return { state, ok: false, msg: `你已有道侣，再向${npc.name}表白恐生修罗场（原文 14 章：多线并行触发吃醋/情劫）。` }
    }
    if (cur < AFFECTION_DAO_PARTNER) {
      const after = clamp(cur - 10, 0, 100)
      const relationships = { ...state.relationships, [npcId]: after }
      return {
        state: { ...state, relationships },
        ok: false,
        msg: `${npc.name}婉拒了你：「时机未到」。好感降至 ${after}（${affectionStage(after)}），言谈间多了几分疏离。`,
      }
    }
    const relationships = { ...state.relationships, [npcId]: 100 }
    const s2 = withLog({ ...state, relationships, daoPartner: npcId }, `与${npc.name}结为道侣`)
    return { state: s2, ok: true, msg: `你向${npc.name}表明心迹，两情相悦，结为道侣！好感 100（生死相许）。` }
  }

  if (kind === '疏远') {
    let after = clamp(cur - 10, 0, 100)
    let daoPartner = state.daoPartner
    let note = ''
    if (daoPartner === npcId) {
      after = clamp(cur - 20, 0, 100)
      daoPartner = null
      note = ' 缘尽情断，道侣之约就此作罢（情劫自此埋下）。'
    }
    const relationships = { ...state.relationships, [npcId]: after }
    return { state: { ...state, relationships, daoPartner }, ok: true, msg: `你与${npc.name}日渐疏远，好感降至 ${after}（${affectionStage(after)}）。${note}` }
  }

  // 赠礼 / 论道 / 同游
  let gain = 0
  let cost = 0
  let likedGift: string | null = null
  let detail = ''
  if (kind === '赠礼') {
    // 送礼查喜好（原文 14 章）：背包中有其喜爱之物（likes）→ 投其所好 +12 并消耗一份；否则购寻常礼物 +4
    likedGift = npc.likes.find(k => (state.bag[k] ?? 0) > 0) ?? null
    if (likedGift) {
      gain = 12
      detail = `投其所好，奉上${likedGift}一份`
    } else {
      gain = 4
      cost = 5
      detail = '以灵石购置寻常礼物相赠'
      if (state.res.spirit < cost) return { state, ok: false, msg: `灵石不足，连份像样的见面礼都备不起（需 ${cost} 灵石）。` }
    }
  } else if (kind === '论道') {
    gain = 4 + (state.player.stats.wuxing >= 7 ? 2 : 0)
    detail = '坐而论道，互有启发'
  } else {
    // 同游
    cost = 10
    if (state.res.spirit < cost) return { state, ok: false, msg: `灵石不足，出游需 ${cost} 灵石。` }
    gain = 5 + (npc.likes.some(k => k === '山水' || k === '自由' || k === '奇闻') ? 3 : 0)
    detail = '结伴同游，看遍山川风物'
  }

  const after = clamp(cur + Math.round(gain * mult), 0, 100)
  const relationships = { ...state.relationships, [npcId]: after }
  let next: GameState = { ...state, relationships }
  if (cost > 0) next = withRes(next, { spirit: next.res.spirit - cost })
  if (likedGift) next = withBag(next, likedGift, -1)
  return { state: next, ok: true, msg: `${detail}，${npc.name}好感 +${Math.round(gain * mult)} → ${after}（${affectionStage(after)}）。` }
}

// ============================================================
// 五、随机事件（原文第十五章）
// 原文要点：每回合 1d100，20% 触发；事件池 8 种。
// 取舍说明：各事件数值效果原文未给，按事件名合理设定（赠丹回血、袭村扣血、灵雨涨修为等）；
//          袭村气血归零按原文 16.4 结算为重伤昏迷；心魔暗生按原文 7.1「道心 <40」判心魔缠身；
//          纯信息类事件（被认错人）applied=false。
// ============================================================

export function randomEventRoll(
  state: GameState,
): { state: GameState; event: string; applied: boolean; msg: string } | null {
  if (d100() > 20) return null // 原文 15 章：每回合 20% 触发
  const evt = pick(RANDOM_EVENTS)
  switch (evt.id) {
    case 'elder-gives-pill': {
      const heal = Math.max(1, Math.round(state.res.hpMax * 0.3))
      const next = withRes(state, { hp: Math.min(state.res.hpMax, state.res.hp + heal) })
      return { state: next, event: evt.name, applied: true, msg: `神秘老者赠你一枚丹药，服下后气血恢复 ${heal} 点。` }
    }
    case 'secret-realm-opens': {
      const next = { ...state, flags: { ...state.flags, secretRealmOpen: true } }
      return { state: next, event: evt.name, applied: true, msg: '一处秘境入口在近旁现世，机缘与凶险并存，或可前往一探。' }
    }
    case 'spirit-rain': {
      const gain = Math.max(1, Math.round(state.res.cultMax * 0.1))
      const next = withRes(state, { cult: Math.min(state.res.cultMax, state.res.cult + gain) })
      return { state: next, event: evt.name, applied: true, msg: `天降灵雨润泽道体，修为增长 ${gain} 点。` }
    }
    case 'ancient-stela': {
      const next = {
        ...state,
        player: { ...state.player, stats: { ...state.player.stats, wuxing: state.player.stats.wuxing + 1 } },
      }
      return { state: next, event: evt.name, applied: true, msg: '参悟上古残碑，若有所得，悟性 +1。' }
    }
    case 'beast-attacks': {
      const dmg = Math.max(1, Math.round(state.res.hpMax * 0.15))
      const hp = state.res.hp - dmg
      if (hp > 0) {
        const next = withRes(state, { hp })
        return { state: next, event: evt.name, applied: true, msg: `妖兽袭村，你出手击退妖物，却也受了 ${dmg} 点伤。` }
      }
      // 气血归零 → 重伤昏迷（原文 16.4）
      const next = withRes(state, { hp: 1, injury: state.res.injury ?? injuryName('severe') })
      return { state: next, event: evt.name, applied: true, msg: '妖兽袭村，你苦战不敌，重伤昏迷——好在被村民救回，需静养疗伤。' }
    }
    case 'message-talisman': {
      const next = withRes(state, { spirit: state.res.spirit + 10 })
      return { state: next, event: evt.name, applied: true, msg: '传音符报讯：故人捎来灵石 10 与问候，言说近日修真界将有大事。' }
    }
    case 'mistaken-identity': {
      return { state, event: evt.name, applied: false, msg: '有修士将你认作旁人，你顺势支应几句，虚惊一场，并无所得。' }
    }
    case 'heart-demon-rising': {
      if (state.player.stats.daoxin < 40) {
        const next = withRes(state, { injury: state.res.injury ?? injuryName('heart-demon') })
        return { state: next, event: evt.name, applied: true, msg: '心魔暗生，道心不固，心魔缠身（原文 7.1：道心 <40 或情劫所致）。' }
      }
      return { state, event: evt.name, applied: false, msg: '心魔暗生，幸而道心坚定，运功压下，并无大碍。' }
    }
    default:
      return { state, event: evt.name, applied: false, msg: evt.desc }
  }
}

// ============================================================
// 六、奇遇（原文第十五章）
// 原文要点：奇遇经典 6 种；低概率触发。
// 取舍说明：原文未给概率数值，按规格固定 5%（仙缘本应影响奇遇概率，此处不叠加，见任务规格）；
//          各奇遇收益按奇遇名合理设定（传承/玉简 → 附录 A 功法，遗蜕/捡漏 → 灵石，仙人授法 → 修为，
//          灵兽认主 → 记入 flags.spiritBeast，因状态卡暂无战宠字段）。
// ============================================================

/** 悬崖古洞传承可出的玄阶功法池（附录 A） */
const CLIFF_CAVE_GONGFAS: readonly string[] = ['changchun-gong', 'liuhuo-jianjue', 'bingpo-jue']

export function qiyuRoll(state: GameState): { state: GameState; qiyu: string; msg: string } | null {
  if (!chance(0.05)) return null
  const q = pick(QIYUS)
  switch (q.id) {
    case 'cliff-cave': {
      const id = pickUnlearnedGongfa(state, [...CLIFF_CAVE_GONGFAS])
      if (id) {
        const g = GONGFAS.find(x => x.id === id)
        const next = withLog({ ...state, gongfaIds: [...state.gongfaIds, id] }, `奇遇：悬崖古洞得传承「${g?.name ?? id}」`)
        return { state: next, qiyu: q.name, msg: `悬崖古洞中得前辈传承，参悟得功法「${g?.name ?? id}」（${g?.grade ?? ''}阶）！` }
      }
      const next = withLog(withRes(state, { spirit: state.res.spirit + 300 }), '奇遇：悬崖古洞得传承（功法已尽通，折为灵石）')
      return { state: next, qiyu: q.name, msg: '悬崖古洞中得前辈传承，然所藏功法你已尽通，遂将传承折为灵石 300。' }
    }
    case 'auction-bargain': {
      const gain = 80 + die(120) // 81~200 灵石
      const next = withLog(withRes(state, { spirit: state.res.spirit + gain }), '奇遇：拍卖会捡漏')
      return { state: next, qiyu: q.name, msg: `拍卖会上无人识货，你以极低价捡漏一件宝贝，转手获利灵石 ${gain}。` }
    }
    case 'dream-immortal': {
      const gain = Math.max(1, Math.round(state.res.cultMax * 0.2))
      const next = withLog(withRes(state, { cult: Math.min(state.res.cultMax, state.res.cult + gain) }), '奇遇：梦中仙人授法')
      return { state: next, qiyu: q.name, msg: `梦中仙人授法，一夜顿悟，修为增长 ${gain} 点。` }
    }
    case 'spirit-beast-bond': {
      const next = withLog({ ...state, flags: { ...state.flags, spiritBeast: true } }, '奇遇：灵兽认主')
      return { state: next, qiyu: q.name, msg: '一只灵兽主动认你为主，从此多了一头战宠相伴（记入 flags.spiritBeast）。' }
    }
    case 'senior-remains': {
      const gain = 250
      const next = withLog(withRes(state, { spirit: state.res.spirit + gain }), '奇遇：前辈坐化留遗蜕')
      return { state: next, qiyu: q.name, msg: `得前辈坐化遗蜕与储物袋，获灵石 ${gain}。` }
    }
    case 'mystic-jade-slip': {
      const id = pickUnlearnedGongfa(state)
      if (id) {
        const g = GONGFAS.find(x => x.id === id)
        const next = withLog({ ...state, gongfaIds: [...state.gongfaIds, id] }, `奇遇：捡到神秘玉简（得「${g?.name ?? id}」）`)
        return { state: next, qiyu: q.name, msg: `路边捡到神秘玉简，神识探入，竟是一门功法——「${g?.name ?? id}」（${g?.grade ?? ''}阶）！` }
      }
      const next = withLog(withRes(state, { spirit: state.res.spirit + 500 }), '奇遇：捡到神秘玉简（功法已尽通，折为灵石）')
      return { state: next, qiyu: q.name, msg: '捡到神秘玉简，然其中功法你已尽数通晓，玉简售出得灵石 500。' }
    }
    default:
      return { state, qiyu: q.name, msg: q.desc }
  }
}

// ============================================================
// 七、疗伤（原文第七章 7.1 受伤等级表）
// 原文要点：轻伤——丹药或疗养数日恢复；重伤——疗伤药 + 月余静养，可能留暗疾；
//          垂死——续命丹药 + 高阶医修/灵药；内伤——特殊丹药、长时间闭关；
//          中毒/蛊——解毒丹、药王谷；心魔缠身——渡心魔、论道、清心。
// 取舍说明：寻医价格、丹药名称原文未给，此处按伤势轻重定价格（20~300 灵石）、
//          并定「聚气丹（气血伤）/疗伤丹（内伤）/解毒丹（中毒）/清心丹（心魔）」为对症丹药；
//          垂死以聚气丹逐级缓复为简化处理（原文需续命丹药）。
// ============================================================

/** 气血类伤势逐级恢复链：垂死 → 重伤 → 轻伤 → 无（闭关疗伤 / 丹药各恢复一级） */
const HP_INJURIES: readonly string[] = ['dying', 'severe', 'light']

/** 寻医花费（灵石），按伤势轻重取舍 */
const HEAL_COSTS: Record<string, number> = {
  light: 20,
  severe: 80,
  dying: 300,
  inner: 150,
  poison: 100,
  'heart-demon': 200,
}

/** 各伤势对症丹药 */
const HEAL_PILLS: Record<string, string> = {
  light: '聚气丹',
  severe: '聚气丹',
  dying: '聚气丹',
  inner: '疗伤丹',
  poison: '解毒丹',
  'heart-demon': '清心丹',
}

export function heal(
  state: GameState,
  method: '闭关疗伤' | '寻医' | '丹药',
): { state: GameState; msg: string } {
  const injury = state.res.injury
  if (!injury) {
    if (method === '闭关疗伤') {
      const gain = Math.max(1, Math.round(state.res.hpMax * 0.1))
      const next = withRes(state, { hp: Math.min(state.res.hpMax, state.res.hp + gain) })
      return { state: next, msg: `你并无伤势，闭目调息一月，气血恢复 ${gain} 点。` }
    }
    return { state, msg: method === '寻医' ? '你并无伤势，不必寻医破费。' : '你并无伤势，丹药不必浪费。' }
  }

  const id = injuryIdOf(injury)
  if (!id) return { state, msg: `「${injury}」为未知伤势，寻常手段难以处置。` }

  /** 恢复一级（垂死→重伤→轻伤→无；内伤→轻伤），并回补气血 30% */
  const stepDown = (): GameState => {
    let nextInjury: string | null = null
    if (id === 'inner') {
      nextInjury = injuryName('light')
    } else {
      const idx = HP_INJURIES.indexOf(id)
      if (idx >= 0) nextInjury = idx + 1 < HP_INJURIES.length ? injuryName(HP_INJURIES[idx + 1]) : null
    }
    const hpGain = Math.max(1, Math.round(state.res.hpMax * 0.3))
    return withRes(state, { hp: Math.min(state.res.hpMax, state.res.hp + hpGain), injury: nextInjury })
  }

  if (method === '闭关疗伤') {
    // 按月恢复（一次调用 = 一月）：气血伤/内伤恢复一级；中毒与心魔闭关无效
    if (id === 'poison') return { state, msg: '闭关难以解毒，需寻医（药王谷）或解毒丹。' }
    if (id === 'heart-demon') return { state, msg: '心魔缠身时闭关效率暴跌，愈闭关愈陷愈深，需论道化解或清心丹。' }
    const next = stepDown()
    const cured = next.res.injury === null
    return { state: next, msg: `你闭关静养一月，${injuryName(id)}${cured ? '已然痊愈' : '稍有好转'}（原文 7.1：重伤需月余静养，内伤需长时间闭关）。` }
  }

  if (method === '寻医') {
    // 花灵石快速恢复（高阶医修/药王谷）
    const cost = HEAL_COSTS[id] ?? 100
    if (state.res.spirit < cost) return { state, msg: `灵石不足（寻医需 ${cost} 灵石）。` }
    const next = withRes(state, { spirit: state.res.spirit - cost, hp: state.res.hpMax, injury: null })
    return { state: withLog(next, '寻医疗伤'), msg: `你遍寻医修/药王谷，花费灵石 ${cost}，${injuryName(id)}尽愈，气血回满。` }
  }

  // 丹药：立即部分恢复（对症丹药消耗 1 粒）
  const pill = HEAL_PILLS[id]
  if (!pill) return { state, msg: '此伤势暂无对症丹药。' }
  if ((state.bag[pill] ?? 0) < 1) return { state, msg: `你并无${pill}，对症丹药欠缺。` }
  const consumed = withBag(state, pill, -1)
  if (id === 'poison' || id === 'inner' || id === 'heart-demon') {
    const next = withRes(consumed, {
      hp: Math.min(consumed.res.hpMax, consumed.res.hp + Math.max(1, Math.round(consumed.res.hpMax * 0.3))),
      injury: null,
    })
    return { state: withLog(next, `服${pill}疗伤`), msg: `服下${pill}，${injuryName(id)}尽愈。` }
  }
  // 气血伤：一粒聚气丹恢复一级
  const after = stepDown()
  const next = { ...after, bag: consumed.bag }
  const cured = next.res.injury === null
  return { state: withLog(next, '服丹药疗伤'), msg: `服下${pill}，${injuryName(id)}${cured ? '尽愈' : '好转一级'}。` }
}
