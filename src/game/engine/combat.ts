// ============================================================
// combat.ts —— 回合制战斗引擎（第十六章：战斗系统）
// 数据来源：《问道长生》设定文档第十六章（修仙模拟器.docx）：
//   16.0 境界压制 / 16.1 五行灵气 / 16.2 回合指令 / 16.3 伤害结算 / 16.4 胜负后果；
//   受伤等级表 7.1（重伤/垂死对战斗属性的压制）。
//
// 数值取舍说明（原文 16.3 只给了公式框架与方向性描述，未给精确参数）：
//   · 六维 → 战斗数值（16.3「命中看遁速、暴击看仙缘」之外无公式，取合理映射）：
//       攻击 = 资质×2 + 悟性（资质为修为根基，悟性为招式精妙）
//       防御 = 道心 + ⌊气血上限/25⌋（道心沉稳抗压，体魄强横）
//       速度 = 遁速×2 + ⌊仙缘/2⌋（遁速为身法，仙缘为临场气运）
//       暴击率 = min(25, 5 + 仙缘)%
//   · 伤害公式（照 16.3 原文抄录）：伤害 = 基础威力 × 境界系数 × 五行相克系数 × 状态增减 − 对方防御
//       —— 基础威力：攻击 = attack；施法 = attack×1.2；绝技释放 = attack×3（威力极高）；战宠 = pet.attack
//       —— 境界系数（16.0）：敌方高 1 大境界 → 玩家打敌 ×0.4（原文「伤害×0.4、对方减伤60%」系同一规则的
//            同义复述，取单一系数 0.4），敌打玩家 ×1.5（原文只说「基本必败」，1.5 为让压制有压迫感的取值）；
//            敌方高 ≥2 大境界 → 玩家打敌 ×0.1（「全力也伤不到对方」），敌打玩家 ×2.0（碾压）；
//            例外：对方身负重伤（16.0 克制手段清单之一）→ 高一阶时玩家打敌放宽为 ×0.7
//       —— 相克系数（16.1）：克 ×1.3、被克 ×0.8、互克抵消 ×1.0；同系相生可少量回血
//       —— 状态增减：防御 ×0.5；冷静观察 → 必中 + 暴击 ×1.5；敌方战意低落（说话成功）→ 敌方伤害 ×0.5
//       —— 命中（16.3 命中看遁速）：clamp(60 + (攻方速−守方速)×5, 25, 95)%；暴击按暴击率掷骰
//   · 遁走（16.0/16.2 遁速判定）：基础 30% + (玩家速−敌方速)×5%，敌方高一大境界再 −10%；垂死（气血<33%，
//        7.1 无法遁走）→ 成功率 0；成功率区间 [5,95]
// ============================================================
import type { GameState, GameFlags } from '../state'
import { d100, roll, chance, pick } from './dice'
import { REALMS, REALM_PRESSURE } from '../data/realms'
import { COMBAT_COMMANDS } from '../data/systems'
import { COMBAT_LOOT } from '../data/balance'
import { SPIRIT_ROOTS } from '../data/creation'

export interface Combatant {
  name: string
  realmIdx: number
  stageIdx: number
  hp: number
  hpMax: number
  mp: number
  mpMax: number
  attack: number
  defense: number
  speed: number
  elements: string[]
  isPlayer: boolean
  // —— 战斗内部状态（契约必需字段之外的扩展，随战斗推进更新）——
  /** 绝技蓄势剩余回合（0 = 未蓄势；16.2 蓄势 2 回合） */
  charging?: number
  /** 本回合是否防御（减伤 50%） */
  defending?: boolean
  /** 冷静观察中：下次进攻必中 + 暴击 ×1.5 */
  observing?: boolean
  /** 战意低落（说话成功）：敌方伤害 ×0.5 */
  demoralized?: boolean
  /** 身负重伤（16.0 克制手段例外：高一阶仍可一战的先决条件） */
  wounded?: boolean
  /** 是否为妖兽（击杀不染业力；16.4 杀人夺宝才 +业力） */
  isBeast?: boolean
  /** 暴击率%（16.3 暴击看仙缘） */
  critChance?: number
  /** 已用丹药数（用符/用丹每场限 2 次） */
  itemsUsed?: number
  /** 五行灵气库存（16.1：每回合开局按灵根权重随机获得） */
  qi?: Record<string, number>
}

export interface CombatState {
  player: Combatant
  enemy: Combatant
  turn: number
  log: string[]
  over: boolean
  victory: boolean | null
  escaped: boolean
  /** 已召唤的战宠（16.2 召唤战宠，耗神识） */
  pet?: Combatant
  /** 本场是否已召唤过战宠（每场限 1 次） */
  petSummoned?: boolean
}

/** 五行（16.1） */
const WUXING = ['金', '木', '水', '火', '土'] as const

/** 五行相克：金克木、木克土、土克水、水克火、火克金（16.1） */
const COUNTER: Record<string, string> = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' }

/**
 * 变异灵根按对应五行处理（任务约定 + 16.1 五行体系）：
 * 雷火相连、风属木（八卦巽为风属木）、冰水同源、阴为太阴之水（癸水）、阳为太阳之火（丙火）。
 */
const VARIANT_TO_WUXING: Record<string, string> = { 雷: '火', 风: '木', 冰: '水', 阴: '水', 阳: '火' }

// ---------- 小工具 ----------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function cloneCombatant(c: Combatant): Combatant {
  return { ...c, qi: c.qi ? { ...c.qi } : undefined }
}

/** 变异灵根名归一到五行 */
function normalizeElement(el: string): string {
  return VARIANT_TO_WUXING[el] ?? el
}

/** 玩家灵根 → 实战五行系别（创角未持久化具体系别选择，天/地/真/伪按原文「单/双/三/五系」取文档化默认） */
function playerElementsFromState(state: GameState): string[] {
  const root = SPIRIT_ROOTS.find((r) => r.id === state.player.spiritRootId)
  if (!root) return ['火']
  switch (root.kind) {
    case 'bianyi':
      return root.elements.map(normalizeElement)
    case 'tian':
      return ['火'] // 天灵根单系：原文未记录所择系别，此处默认火系
    case 'di':
      return ['火', '木'] // 双系默认 火木
    case 'zhen':
      return ['火', '木', '水'] // 三系默认 火木水
    case 'wei':
      return ['金', '木', '水', '火', '土'] // 伪灵根四/五系：取五系皆通，杂而不精
  }
  return ['火']
}

/** 按灵根权重随机获得 n 点五行灵气（16.1：单系权重越高越易抽到该系） */
function gainQi(c: Combatant, n: number): Record<string, number> {
  const qi = { ...(c.qi ?? {}) }
  const els = c.elements.map(normalizeElement).filter((el) => (WUXING as readonly string[]).includes(el))
  if (els.length === 0) return qi
  for (let i = 0; i < n; i++) {
    const el = pick(els)
    qi[el] = (qi[el] ?? 0) + 1
  }
  return qi
}

/** 五行相克系数（16.1）：克 ×1.3、被克 ×0.8、互克抵消 ×1.0 */
function counterBonus(attackerElement: string, defenderElements: string[]): number {
  const a = normalizeElement(attackerElement)
  const ds = defenderElements.map(normalizeElement)
  const beats = ds.some((d) => COUNTER[a] === d)
  const beaten = ds.some((d) => COUNTER[d] === a)
  if (beats && beaten) return 1.0
  if (beats) return 1.3
  if (beaten) return 0.8
  return 1.0
}

/** 同系相生（16.1）：攻防同系 → 施法者可少量回复 */
function sameSystem(a: string, defenderElements: string[]): boolean {
  return defenderElements.map(normalizeElement).includes(normalizeElement(a))
}

/** 选取最能克制对方的一系（无克制则取第一系） */
function pickBestElement(attacker: Combatant, defenderElements: string[]): string | null {
  const els = attacker.elements.map(normalizeElement)
  if (els.length === 0) return null
  for (const el of els) {
    if (defenderElements.map(normalizeElement).some((d) => COUNTER[el] === d)) return el
  }
  return els[0]
}

/** 境界压制系数（16.0）。diff = 守方境界 − 攻方境界，正值 = 守方境界更高 */
function realmCoef(attacker: Combatant, defender: Combatant): number {
  const diff = defender.realmIdx - attacker.realmIdx
  if (attacker.isPlayer) {
    if (diff <= 0) return 1.0
    if (diff === 1) return defender.wounded === true ? 0.7 : 0.4 // 高一阶：伤害×0.4、对方减伤60%；身负重伤为例外
    return 0.1 // 高二阶以上：全力也伤不到对方
  }
  if (diff >= 0) return 1.0
  if (diff === -1) return 1.5
  return 2.0
}

/** 命中率（16.3 命中看遁速） */
function hitChance(attacker: Combatant, defender: Combatant): number {
  return clamp(60 + (attacker.speed - defender.speed) * 5, 25, 95)
}

/** 暴击判定（16.3 暴击看仙缘） */
function critRoll(attacker: Combatant): boolean {
  return d100() <= Math.min(25, attacker.critChance ?? 5)
}

interface AttackResult {
  dmg: number
  hit: boolean
  crit: boolean
}

/**
 * 伤害结算（16.3 原文公式）：
 * 伤害 = 基础威力 × 境界系数 × 五行相克系数 × 状态增减 − 对方防御
 */
function resolveAttack(
  attacker: Combatant,
  defender: Combatant,
  basePower: number,
  element: string | null,
  opts: { guaranteedHit?: boolean; critMult?: number } = {},
): AttackResult {
  const realm = realmCoef(attacker, defender)
  let counter = 1
  if (element) counter = counterBonus(element, defender.elements)
  let stateMult = 1
  if (attacker.demoralized) stateMult *= 0.5 // 战意低落
  if (defender.defending) stateMult *= 0.5 // 防御减伤 50%
  const raw = Math.floor(basePower * realm * counter * stateMult)
  const dmgBeforeDefense = Math.max(0, raw - defender.defense)
  const hit = opts.guaranteedHit === true || d100() <= hitChance(attacker, defender)
  if (!hit || dmgBeforeDefense <= 0) return { dmg: 0, hit, crit: false }
  let crit = false
  let final = dmgBeforeDefense
  if (opts.critMult !== undefined) {
    crit = true
    final = Math.max(1, Math.ceil(dmgBeforeDefense * opts.critMult)) // 冷静观察：下回合必中 + 暴击
  } else if (critRoll(attacker)) {
    crit = true
    final = Math.max(1, Math.ceil(dmgBeforeDefense * 1.5))
  }
  return { dmg: final, hit, crit }
}

/** 玩家/战宠命中敌方后的叙事（伤害结算后应用） */
function applyPlayerHit(e: Combatant, r: AttackResult, lines: string[], who = '你'): void {
  if (!r.hit) {
    lines.push(`『嗤——』${e.name}侧身一闪，堪堪避开了${who}这一击！`)
    return
  }
  if (r.dmg <= 0) {
    lines.push(`${who}的攻势如泥牛入海，${e.name}护体灵光一荡，毫发无伤！`)
    return
  }
  e.hp = Math.max(0, e.hp - r.dmg)
  lines.push(
    `『噗！』${r.crit ? `${who}这一击正中要害，血光迸溅——` : ''}${e.name}闷哼一声，气血再损 ${r.dmg} 点（余 ${e.hp}/${e.hpMax}）。`,
  )
}

/** 敌方命中玩家后的叙事 */
function applyEnemyHit(p: Combatant, r: AttackResult, lines: string[]): void {
  if (!r.hit) {
    lines.push('你身形一晃，堪堪避开了对方的攻势！')
    return
  }
  if (r.dmg <= 0) {
    lines.push('你护体灵光一荡，对方的攻势未能伤你分毫！')
    return
  }
  p.hp = Math.max(0, p.hp - r.dmg)
  lines.push(`『轰！』${r.crit ? '正中要害——' : ''}你闷哼一声，踉跄后退，气血再损 ${r.dmg} 点（余 ${p.hp}/${p.hpMax}）。`)
}

// ---------- 指令归一 ----------

type CommandKey = 'attack' | 'cast' | 'skill' | 'defend' | 'flee' | 'item' | 'summon' | 'talk' | 'observe' | 'absorb'

/** 9 种回合指令（16.2，含别名；16.1「吸取」为补充指令） */
function normalizeCommand(command: string): CommandKey {
  const c = command.trim()
  if (/遁|逃|跑/.test(c)) return 'flee'
  if (/施法|法术|术法/.test(c)) return 'cast'
  if (/绝技|蓄势/.test(c)) return 'skill'
  if (/防御|防守|守/.test(c)) return 'defend'
  if (/符|丹|药|疗/.test(c)) return 'item'
  if (/召唤|战宠|宠/.test(c)) return 'summon'
  if (/冷静|观察|破绽/.test(c)) return 'observe'
  if (/说话|谈判|示弱|恐吓|求饶|诈降|献宝|周旋/.test(c)) return 'talk'
  if (/吸取|聚气|凝气/.test(c)) return 'absorb'
  return 'attack' // 攻击及一切未识别指令，默认强攻
}

// ---------- 遁走成功率 ----------

function escapeChanceFrom(p: Combatant, e: Combatant): number {
  // 7.1 垂死（气血余 <33%）：无法遁走
  if (p.hp < p.hpMax * 0.33) return 0
  const diff = e.realmIdx - p.realmIdx
  // 16.0/16.2 遁速判定：基础 30 + 速度差×5，敌方高境界每阶 −10
  const c = 30 + (p.speed - e.speed) * 5 - (diff > 0 ? diff * 10 : 0)
  return clamp(c, 5, 95)
}

/** 遁走成功率（供 UI 展示；0 = 垂死无法遁走） */
export function escapeChance(cs: CombatState): number {
  return escapeChanceFrom(cs.player, cs.enemy)
}

// ---------- 开战 ----------

/**
 * 由玩家状态生成 Combatant 并创建战斗（16.0 战前必给敌情/胜算提示）。
 * 敌人默认值：hpMax=100、mpMax=50、attack=30、defense=10、speed=10、elements=['金']、critChance=5。
 */
export function startCombat(
  state: GameState,
  enemy: Partial<Combatant> & {
    name: string
    realmIdx: number
    stageIdx: number
    hpMax?: number
    attack?: number
    defense?: number
    speed?: number
    elements?: string[]
  },
): CombatState {
  const s = state.player.stats
  const r = state.res
  const realmIdx = Math.max(0, REALMS.findIndex((re) => re.name === state.player.realm))
  const stageIdx = Math.max(0, (REALMS[realmIdx]?.stages ?? []).indexOf(state.player.stage))
  // 受伤状态压制（7.1，injury 统一存 id）：severe 重伤 属性−20% 遁速减半；dying 垂死 属性−50%、无法遁走
  const inj = r.injury ?? ''
  const statMult = inj === 'dying' ? 0.5 : inj === 'severe' ? 0.8 : 1
  const speedMult = inj === 'dying' ? 0 : inj === 'severe' ? 0.5 : 1

  const player: Combatant = {
    name: state.player.daoName || state.player.name,
    realmIdx,
    stageIdx,
    hp: r.hp,
    hpMax: r.hpMax,
    mp: r.mp,
    mpMax: r.mpMax,
    // 16.3 未给六维→战斗数值公式，取合理映射（见文件头说明）
    attack: Math.max(1, Math.round((s.zizhi * 2 + s.wuxing) * statMult)),
    defense: Math.max(0, Math.round((s.daoxin + Math.floor(r.hpMax / 25)) * statMult)),
    speed: Math.max(1, Math.round((s.dunsu * 2 + Math.floor(s.xianyuan / 2)) * speedMult)),
    elements: playerElementsFromState(state),
    isPlayer: true,
    critChance: Math.min(25, 5 + s.xianyuan),
    qi: {},
    charging: 0,
    defending: false,
    observing: false,
    itemsUsed: 0,
  }
  player.qi = gainQi(player, 2)

  const enemyHpMax = Math.max(1, enemy.hpMax ?? 100)
  const enemyMpMax = Math.max(0, enemy.mpMax ?? 50)
  const enemyCombatant: Combatant = {
    name: enemy.name,
    realmIdx: Math.max(0, Math.min(REALMS.length - 1, enemy.realmIdx)),
    stageIdx: Math.max(0, Math.min(3, enemy.stageIdx)),
    hp: enemyHpMax,
    hpMax: enemyHpMax,
    mp: enemyMpMax,
    mpMax: enemyMpMax,
    attack: enemy.attack ?? 30,
    defense: enemy.defense ?? 10,
    speed: enemy.speed ?? 10,
    elements: (enemy.elements && enemy.elements.length > 0 ? enemy.elements : ['金']).map(normalizeElement),
    isPlayer: false,
    critChance: enemy.critChance ?? 5,
    qi: {},
    charging: 0,
    defending: false,
    wounded: enemy.wounded === true,
    demoralized: false,
    isBeast: enemy.isBeast === true,
  }
  enemyCombatant.qi = gainQi(enemyCombatant, 2)

  const diff = enemyCombatant.realmIdx - player.realmIdx
  const stageName = REALMS[enemyCombatant.realmIdx]?.stages[enemyCombatant.stageIdx] ?? ''
  const commandList = COMBAT_COMMANDS.map((cmd) => cmd.replace(/（.*?）$/, '')).join(' / ')
  const log: string[] = [
    `【敌情】${enemyCombatant.name}（${REALMS[enemyCombatant.realmIdx]?.name ?? '?'}·${stageName}）：气血 ${enemyCombatant.hp}/${enemyCombatant.hpMax}，攻 ${enemyCombatant.attack}，防 ${enemyCombatant.defense}，速 ${enemyCombatant.speed}。`,
  ]
  // 16.0 战前必给提示：境界、威压、胜算
  if (diff <= 0) log.push('对方与你同阶或更低，或可一战。')
  else if (diff === 1) log.push('对方境界高你一个大境界，正面交手胜算极低——除非你有克制手段。')
  else log.push('对方威压令你窒息——正面交手无异送死！能逃则逃，或寻言语周旋。')
  if (diff >= 1) log.push(diff === 1 ? REALM_PRESSURE[2] : REALM_PRESSURE[3])
  log.push(`你屏息凝神，随时准备出手。（指令：${commandList}）`)

  return { player, enemy: enemyCombatant, turn: 0, log, over: false, victory: null, escaped: false }
}

// ---------- 敌方 AI ----------

function canCast(c: Combatant): boolean {
  const qiVals = Object.values(c.qi ?? {})
  return qiVals.some((v) => v >= 1) && c.mp >= Math.max(3, Math.ceil(c.mpMax * 0.1))
}

/** 敌方简单策略：多数攻击/施法，血量低时防御，偶尔酝酿绝技（16.2） */
function enemyAct(p: Combatant, e: Combatant, lines: string[]): void {
  if ((e.charging ?? 0) > 0) {
    e.charging = (e.charging ?? 0) - 1
    if (e.charging === 0) {
      lines.push('对方蓄势已满，暴喝一声，绝技倾力而出！')
      const r = resolveAttack(e, p, e.attack * 3, null, {})
      applyEnemyHit(p, r, lines)
    } else {
      lines.push('对方仍在蓄势，周身气息翻涌不定。')
    }
    return
  }
  if (e.hp < e.hpMax * 0.3 && chance(0.4)) {
    e.defending = true
    lines.push('对方负伤，收势凝神，护体灵光大涨。')
    return
  }
  if (chance(0.35) && canCast(e)) {
    const el = pickBestElement(e, p.elements) ?? e.elements[0] ?? '火'
    const mpCost = Math.max(3, Math.ceil(e.mpMax * 0.1))
    if ((e.qi?.[el] ?? 0) >= 1 && e.mp >= mpCost) {
      e.qi = { ...e.qi, [el]: (e.qi?.[el] ?? 0) - 1 }
      e.mp -= mpCost
      lines.push(`对方掐诀诵咒，${el}系灵光暴涨，一道法术当头轰来！`)
      const r = resolveAttack(e, p, e.attack * 1.2, el, {})
      applyEnemyHit(p, r, lines)
      if (sameSystem(el, p.elements)) {
        const heal = Math.max(1, Math.floor(e.attack / 10))
        e.hp = Math.min(e.hpMax, e.hp + heal)
        lines.push(`同系相生，对方${el}气入体，伤势稍缓（回复 ${heal} 点）。`)
      }
      return
    }
  }
  if (e.hp > e.hpMax * 0.5 && chance(0.12)) {
    e.charging = 2
    lines.push('对方凝神聚气，似在酝酿某种绝技！')
    return
  }
  const r = resolveAttack(e, p, e.attack, null, {})
  applyEnemyHit(p, r, lines)
}

// ---------- 一回合结算 ----------

/** 玩家回合结算一回合（不可变更新：返回新 CombatState，绝不修改入参） */
export function combatStep(cs: CombatState, command: string): CombatState {
  if (cs.over) return cs
  const lines: string[] = []
  const p = cloneCombatant(cs.player)
  const e = cloneCombatant(cs.enemy)
  let pet = cs.pet ? cloneCombatant(cs.pet) : undefined
  let petSummoned = cs.petSummoned ?? false
  let over = false
  let victory: boolean | null = null
  let escaped = false
  let enemyActed = false

  // 16.1 每回合开局：按灵根权重随机获得五行灵气
  p.qi = gainQi(p, 2)
  if (pet && pet.hp > 0) pet.qi = gainQi(pet, 1)

  // 战宠先动
  if (pet && pet.hp > 0) {
    lines.push(`${pet.name}低吼一声，先行扑向${e.name}！`)
    const r = resolveAttack(pet, e, pet.attack, '木', {})
    applyPlayerHit(e, r, lines, '灵兽')
    if (e.hp <= 0) {
      over = true
      victory = true
      lines.push(`『轰——』${e.name}倒在血泊之中，再无声息！`)
    }
  }

  if (!over) {
    const cmd = normalizeCommand(command)
    switch (cmd) {
      case 'attack': {
        if (p.observing) lines.push('你已窥破对方破绽，这一击快若惊雷！')
        const r = resolveAttack(p, e, p.attack, null, {
          guaranteedHit: p.observing === true,
          critMult: p.observing === true ? 1.5 : undefined,
        })
        applyPlayerHit(e, r, lines, '你')
        p.observing = false
        break
      }
      case 'cast': {
        const el = pickBestElement(p, e.elements) ?? p.elements[0] ?? '火'
        const qi = p.qi ?? {}
        // 契合灵根（所选系必属玩家灵根），灵力消耗减半（16.1）
        const mpCost = Math.max(3, Math.ceil(p.mpMax * 0.05))
        if ((qi[el] ?? 0) < 1) {
          // 16.1 灵气不够 → 吸取：本回合少行动，换下回合灵气 +2
          p.qi = { ...qi, [el]: (qi[el] ?? 0) + 2 }
          lines.push(`你欲施展${el}系法术，却发现五行灵气不足，只得凝神吸取天地灵气（本回合少行动，${el}灵气 +2）。`)
        } else if (p.mp < mpCost) {
          lines.push('你强行催动灵力，奈何丹田几近枯竭，法术威势大减！')
          p.qi = { ...qi, [el]: (qi[el] ?? 0) - 1 }
          p.mp = 0
          const r = resolveAttack(p, e, p.attack * 1.2 * 0.6, el, {
            guaranteedHit: p.observing === true,
            critMult: p.observing === true ? 1.5 : undefined,
          })
          applyPlayerHit(e, r, lines, '你')
          p.observing = false
        } else {
          p.mp -= mpCost
          p.qi = { ...qi, [el]: (qi[el] ?? 0) - 1 }
          lines.push(`你掐诀诵咒，${el}系灵光在指尖汇聚，化作一道流光轰向对方！`)
          const r = resolveAttack(p, e, p.attack * 1.2, el, {
            guaranteedHit: p.observing === true,
            critMult: p.observing === true ? 1.5 : undefined,
          })
          applyPlayerHit(e, r, lines, '你')
          // 16.1 同系相生：少量回复
          if (sameSystem(el, e.elements)) {
            const heal = Math.max(1, Math.floor(p.attack / 10))
            p.hp = Math.min(p.hpMax, p.hp + heal)
            lines.push(`同系相生，${el}灵气反哺经脉，你气血回复 ${heal} 点。`)
          }
          p.observing = false
        }
        break
      }
      case 'skill': {
        const ch = p.charging ?? 0
        if (ch === 0) {
          // 16.2 绝技：蓄势 2 回合，威力极高（第 1 次开始蓄势，之后每次续势，满 2 回合倾力释放）
          p.charging = 2
          lines.push('你凝神蓄势，灵力沿经脉奔涌，静待雷霆一击！')
        } else if (ch === 1) {
          p.charging = 0
          lines.push('蓄势已满！你暴喝一声，绝技倾力而出！')
          const r = resolveAttack(p, e, p.attack * 3, null, {
            guaranteedHit: p.observing === true,
            critMult: p.observing === true ? 1.5 : undefined,
          })
          applyPlayerHit(e, r, lines, '你')
          p.observing = false
        } else {
          p.charging = ch - 1
          lines.push('你继续蓄势，周身气势节节攀升，罡风猎猎！')
        }
        break
      }
      case 'defend': {
        p.defending = true
        lines.push('你敛息收势，护体灵光凝于周身，静待对方来攻。')
        break
      }
      case 'flee': {
        const c = escapeChanceFrom(p, e)
        if (c <= 0) {
          lines.push('你身负重创，气机紊乱，竟连遁光都无法催动！')
          // 敌人正常行动
        } else {
          const rr = roll(c)
          if (rr.ok) {
            over = true
            escaped = true
            victory = null
            lines.push(`你掐动遁诀（掷骰 ${rr.roll}/${c} 成功），化作一道遁光，头也不回地远遁而去！对方追之不及，只得作罢。`)
            enemyActed = true
          } else {
            lines.push(`你转身欲遁（掷骰 ${rr.roll}/${c} 失败），却被对方死死缠住，走脱不得！`)
            lines.push('对方冷笑一声，乘势强攻！')
            const r2 = resolveAttack(e, p, e.attack * 1.2, null, {})
            applyEnemyHit(p, r2, lines)
            enemyActed = true
          }
        }
        break
      }
      case 'item': {
        const used = p.itemsUsed ?? 0
        if (used >= 2) {
          lines.push('你探手入怀，丹药早已耗尽，只得挥剑强攻！')
          const r = resolveAttack(p, e, p.attack, null, {
            guaranteedHit: p.observing === true,
            critMult: p.observing === true ? 1.5 : undefined,
          })
          applyPlayerHit(e, r, lines, '你')
          p.observing = false
        } else {
          p.itemsUsed = used + 1
          const hpHeal = Math.max(5, Math.floor(p.hpMax * 0.3))
          const mpHeal = Math.max(5, Math.floor(p.mpMax * 0.2))
          p.hp = Math.min(p.hpMax, p.hp + hpHeal)
          p.mp = Math.min(p.mpMax, p.mp + mpHeal)
          lines.push(`你吞下一枚丹药，药力在经脉中化开，气血回复 ${hpHeal} 点，灵力回复 ${mpHeal} 点。`)
        }
        break
      }
      case 'summon': {
        if (pet && pet.hp > 0) {
          lines.push('战宠已在身侧，低吼回应，蓄势待发。')
        } else if (petSummoned) {
          lines.push('你试图再唤战宠，然而神识已然枯竭，无功而返。')
        } else {
          petSummoned = true
          pet = {
            name: '灵兽',
            realmIdx: p.realmIdx,
            stageIdx: p.stageIdx,
            hp: Math.max(10, Math.floor(p.hpMax * 0.6)),
            hpMax: Math.max(10, Math.floor(p.hpMax * 0.6)),
            mp: 0,
            mpMax: 0,
            attack: Math.max(5, Math.floor(p.attack * 0.8)),
            defense: Math.max(1, Math.floor(p.defense * 0.6)),
            speed: Math.max(1, Math.floor(p.speed * 0.8)),
            elements: ['木'],
            isPlayer: true,
            critChance: 5,
            qi: {},
            charging: 0,
            defending: false,
          }
          lines.push('你分出一缕神识，唤起灵兽，它咆哮一声，当即扑向敌人！')
          const r = resolveAttack(pet, e, pet.attack, '木', {})
          applyPlayerHit(e, r, lines, '灵兽')
        }
        break
      }
      case 'talk': {
        const diff = e.realmIdx - p.realmIdx
        if (diff >= 1) {
          // 16.0 克制手段例外清单提示
          lines.push(diff === 1 ? REALM_PRESSURE[2] : REALM_PRESSURE[3])
          lines.push(REALM_PRESSURE[6])
        }
        // 成功率：基础 35 + 对方身负重伤 25 + 我方垂死 15 − 敌方每高一境界 15
        const chanceVal = clamp(35 + (e.wounded ? 25 : 0) + (p.hp < p.hpMax * 0.33 ? 15 : 0) - (diff > 0 ? diff * 15 : 0), 10, 85)
        const rr = roll(chanceVal)
        if (rr.ok) {
          e.demoralized = true
          if (e.wounded) {
            over = true
            victory = null
            lines.push(`对方身负重伤，又见你言辞恳切（掷骰 ${rr.roll}/${chanceVal} 成功），最终冷哼一声：「今日且饶你一命。」收兵而去。`)
          } else {
            lines.push(`你晓以利害（掷骰 ${rr.roll}/${chanceVal} 成功），对方目光闪动，杀意稍敛——战意大降，攻势减弱。`)
          }
          enemyActed = true
        } else {
          lines.push(`你费尽唇舌（掷骰 ${rr.roll}/${chanceVal} 失败），对方却不为所动，反而勃然大怒：「找死！」`)
          lines.push('对方恼羞成怒，攻势更急！')
          const r2 = resolveAttack(e, p, e.attack * 1.2, null, {})
          applyEnemyHit(p, r2, lines)
          enemyActed = true
        }
        break
      }
      case 'observe': {
        p.observing = true
        const diff = e.realmIdx - p.realmIdx
        lines.push('你按捺住杀意，凝神观察对方的一招一式，窥探其破绽所在。')
        if (diff >= 1) {
          lines.push(diff === 1 ? `（威压如山，正面硬拼胜算极低——${REALM_PRESSURE[2]}）` : `（${REALM_PRESSURE[3]}）`)
        }
        break
      }
      case 'absorb': {
        // 16.1 补充指令「吸取」：本回合少行动，换下回合灵气 +2
        const el = pickBestElement(p, e.elements) ?? p.elements[0] ?? '火'
        const qi = p.qi ?? {}
        p.qi = { ...qi, [el]: (qi[el] ?? 0) + 2 }
        lines.push(`你盘膝凝神，引天地${el}灵气入体（${el}灵气 +2）。`)
        break
      }
    }
    e.defending = false // 对方上一回合的防御，在本回合玩家行动后失效
  }

  // 玩家击杀判定
  if (!over && e.hp <= 0) {
    over = true
    victory = true
    lines.push(`『轰——』${e.name}轰然倒地，再无声息！`)
  }

  // 敌人回合
  if (!over && !enemyActed) {
    e.qi = gainQi(e, 1)
    enemyAct(p, e, lines)
    if (p.hp <= 0) {
      over = true
      victory = false
      lines.push('你眼前一黑，意识涣散，倒在血泊之中……')
    }
  }
  p.defending = false // 玩家防御只覆盖本回合敌人的来攻

  return {
    player: p,
    enemy: e,
    turn: cs.turn + 1,
    log: [...cs.log, ...lines],
    over,
    victory,
    escaped,
    ...(pet ? { pet, petSummoned } : petSummoned ? { petSummoned } : {}),
  }
}

// ---------- 战斗结果结算 ----------

/**
 * 战斗结束后把玩家 hp/mp 合并回状态卡（下限 1，避免直接死亡；死亡由 flags.dead 另行接管），
 * 并按 16.4 结算胜负后果：胜利 → 战利品灵石 + 杀人夺宝业力 +1（妖兽除外）+ 目击者标记；
 * 失败且 hp 归零 → flags.dead='战死'；遁走 → 位置不变、仅提示。
 */
export function applyCombatResult(state: GameState, cs: CombatState): GameState {
  const flags: GameFlags = { ...state.flags }
  const log = [...state.log]
  const hp = Math.max(1, cs.player.hp)
  const mp = Math.max(1, cs.player.mp)
  let spirit = state.res.spirit
  let karma = state.res.karma

  if (cs.over && cs.victory === true) {
    flags['combat.result'] = 'victory'
    flags['combat.enemy'] = cs.enemy.name
    // 16.4 战利品：灵石按敌方境界浮动（集中表 data/balance.ts）
    const loot = (cs.enemy.realmIdx + 1) * COMBAT_LOOT.basePerRealm + Math.floor(Math.random() * COMBAT_LOOT.randomMax)
    spirit += loot
    if (cs.enemy.isBeast !== true) {
      karma += 1 // 16.4 杀人夺宝 = 业力 +
      flags['combat.kill'] = true
    }
    // 16.4 当场有目击者 → 结仇/被通缉（交由上层剧情处理）
    if (chance(0.3)) flags['combat.witnessed'] = true
    log.push(`【战斗·胜】击杀${cs.enemy.name}，夺得灵石 ${loot}${cs.enemy.isBeast ? '' : '，业力 +1'}。`)
  } else if (cs.over && cs.victory === false) {
    flags['combat.result'] = 'defeat'
    flags['dead'] = '战死' // 16.4 气血归零 = 当场陨落（交由死亡流程处理）
    log.push(`【战斗·败】你不敌${cs.enemy.name}，血洒当场，气绝陨落。`)
  } else if (cs.escaped) {
    flags['combat.result'] = 'escaped'
    flags['combat.escaped'] = true
    log.push(`【战斗·遁】你拼死遁走，捡回一条性命（原地返回，未得战利品）。`)
  } else if (cs.over) {
    flags['combat.result'] = 'peace'
    flags['combat.peace'] = true
    log.push(`【战斗·和】与${cs.enemy.name}罢手言和，未分生死。`)
  } else {
    flags['combat.result'] = 'pending'
    log.push(`【战斗·中断】与${cs.enemy.name}的战斗被强行打断。`)
  }

  return {
    ...state,
    res: { ...state.res, hp, mp, spirit, karma },
    flags,
    log,
  }
}
