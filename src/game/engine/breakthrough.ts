// ============================================================
// breakthrough.ts —— 大境界突破 / 悟道 / 道心 / 逆天改命 数值引擎
// 数据来源章节：第八章（8.2 突破规则 / 8.3 逆天改命）、第九章（9.3 悟道）、
//               第七章（7.1 心魔缠身 / 7.3 功德业力）、5.4（寿元表）
// 硬性约束：纯 TypeScript 无 React 依赖；不可变更新（永远返回新 GameState，绝不修改入参）
// ============================================================

import type { GameState } from '../state'
import { roll, chance } from './dice'
import { REALMS, LIFESPAN } from '../data/realms'
import { FATE_CHANGES, ENLIGHTENMENT_BRANCHES } from '../data/systems'

export type BreakthroughPath = '人道' | '地道' | '天道'

export interface MajorBreakthroughResult {
  state: GameState
  ok: boolean
  /** 是否当场陨落（flags.dead='渡劫陨落'） */
  died: boolean
  msg: string
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * 小境界所需修为（每阶，即 cultMax 基础值）——与 cultivation.ts 中同名表保持一致
 * （按约束两文件互不 import，故各自维护一份；数据来源与推算规则见 cultivation.ts）。
 */
const STAGE_COST_BASE: Record<string, number> = {
  炼气: 100, // 原文明确：每阶 100 点
  筑基: 200, // 推算
  结晶: 350, // 推算
  金丹: 500, // 推算
  具灵: 750, // 推算
  元婴: 1000, // 原文明确：每阶 1000+ 点（取下限）
  化神: 1500, // 推算
  悟道: 2000, // 推算
  羽化: 3000, // 原文明确：每阶数千点（取 3000）
  登仙: 5000, // 原文明确：每阶数千点（取 5000）
}

function stageCostOf(realm: string): number {
  const c = STAGE_COST_BASE[realm]
  return typeof c === 'number' ? c : 100
}

/** 逆天改命 flag 键（与 cultivation.ts 保持一致）：以 FATE_CHANGES 数据条目为准 */
function fateKey(prefix: string): string {
  const entry = FATE_CHANGES.find((f) => f.startsWith(prefix))
  return 'fate:' + (entry ?? prefix)
}

/**
 * 大突破成功率（原文 8.2）。锚点按三档困难度映射（人道=区间上限、地道=区间中值、天道=区间下限）：
 *   炼气→筑基 约 70%~95% → 人道95 / 地道82.5 / 天道70
 *   金丹→元婴 约 40%~80% → 人道80 / 地道60 / 天道40
 *   化神→悟道 约 20%~60% → 人道60 / 地道40 / 天道20
 *   羽化→登仙 原文仅言「天道成功不足 10%」→ 人道9 / 地道5 / 天道2（均不足 10%）
 * 原文未列出的过渡（筑基→结晶、结晶→金丹、具灵→元婴、元婴→化神、悟道→羽化）
 * 在相邻锚点间线性插值，遵循「成功率随境界递减」。
 * 额外修正（均有原文依据）：
 *   业力天罚：每 100 业力成功率 −10%（原文 8.2/7.3：业力招来更狠的雷劫，成功率大幅下降）
 *   心魔缠身：−10%（原文 7.1：心魔缠身，渡劫更凶险）
 *   道心：每点 +0.5%（原文：道心——心魔抗性、突破成功率）
 */
const RATE_ANCHORS: ReadonlyArray<readonly [number, number, number]> = [
  [95, 82.5, 70], // 炼气→筑基
  [80, 60, 40], // 金丹→元婴
  [60, 40, 20], // 化神→悟道
  [9, 5, 2], // 羽化→登仙
]
/** 锚点对应的突破序号（0=炼气→筑基 … 8=羽化→登仙） */
const ANCHOR_T: readonly number[] = [0, 3, 6, 8]

function baseRate(transitionIndex: number, pathIdx: number): number {
  let lo = 0
  while (lo < RATE_ANCHORS.length - 2 && ANCHOR_T[lo + 1] <= transitionIndex) lo++
  const span = ANCHOR_T[lo + 1] - ANCHOR_T[lo]
  const i = transitionIndex - ANCHOR_T[lo]
  const a = RATE_ANCHORS[lo][pathIdx]
  const b = RATE_ANCHORS[lo + 1][pathIdx]
  return a + ((b - a) * i) / span
}

function finalRate(state: GameState, realmIdx: number, pathIdx: number): number {
  let r = baseRate(realmIdx, pathIdx)
  r -= Math.floor(state.res.karma / 100) * 10 // 业力天罚
  if (state.res.injury === 'heart-demon') r -= 10 // 心魔缠身
  r += state.player.stats.daoxin * 0.5 // 道心
  return clamp(r, 1, 95)
}

/** 渡劫失败后果（原文 8.2：随境界逐步加重） */
function failBreakthrough(state: GameState, realmIdx: number, rate: number, pathDesc: string): MajorBreakthroughResult {
  const p = state.player
  const r = state.res
  const base: string[] = [`天雷贯体，心魔噬心——${pathDesc}，终究功亏一篑！`, `（掷骰 ${rate.toFixed(1)}%）`]

  // 炼气/筑基/结晶期失败（原文：炼气/筑基期失败 → 重伤 + 短期无法再突破；结晶原文未列，按相邻低档归入）
  if (realmIdx <= 2) {
    const next: GameState = {
      ...state,
      res: { ...r, cult: 0, injury: 'severe' }, // 重伤：属性 −20%、遁速减半（原文 7.1）
      flags: { ...state.flags, breakCooldown: 6 }, // 「短期无法再突破」：6 个月（推算）
    }
    return {
      state: next,
      ok: false,
      died: false,
      msg: [...base, '渡劫失败，你被天雷劈成重伤（属性 −20%，遁速减半），根基受损，半年之内无法再图破境，修为亦溃散归零。'].join('\n'),
    }
  }

  // 金丹/具灵/元婴期失败（原文：金丹/元婴期失败 → 修为倒退一阶 + 留下暗伤；具灵原文未列，按相邻中档归入）
  if (realmIdx <= 5) {
    const realm = REALMS[realmIdx]
    const stageIdx = Math.max(0, realm.stages.indexOf(p.stage) - 1)
    const next: GameState = {
      ...state,
      player: { ...p, stage: realm.stages[stageIdx] },
      res: { ...r, cult: 0 },
      flags: { ...state.flags, hiddenInjury: true }, // 暗伤：永久压制部分属性（AI 结算时全属性 −10%）
    }
    return {
      state: next,
      ok: false,
      died: false,
      msg: [...base, `雷劫反噬，你修为倒退一阶（跌回${realm.name}·${realm.stages[stageIdx]}），并留下暗伤（flags.hiddenInjury，自此部分属性永久压制）。需大机缘方能再图破境。`].join('\n'),
    }
  }

  // 化神以上失败（原文：极重，可能当场陨落，或走火入魔堕落为魔物）——五五开
  if (chance(0.5)) {
    // 功德护体可挡一道天雷（原文 7.3：渡劫时功德可挡天雷；状态卡「功德护体 可挡一道」）
    if (r.merit > 0) {
      const next: GameState = {
        ...state,
        res: { ...r, merit: 0, injury: 'dying' },
        flags: { ...state.flags },
      }
      return {
        state: next,
        ok: false,
        died: false,
        msg: [...base, '天罚临头！千钧一发之际，你毕生功德化作护体金光，替你挡下这一道天雷——功德散尽，你重伤垂死，却捡回一条命。'].join('\n'),
      }
    }
    const next: GameState = { ...state, flags: { ...state.flags, dead: '渡劫陨落' } }
    return { state: next, ok: false, died: true, msg: [...base, '雷劫落下，肉身化为飞灰——你陨落于天劫之下。此世道途，到此为止。'].join('\n') }
  }

  // 走火入魔，堕落为魔物
  const realm = REALMS[realmIdx]
  const stageIdx = Math.max(0, realm.stages.indexOf(p.stage) - 1)
  const next: GameState = {
    ...state,
    player: { ...p, stage: realm.stages[stageIdx] },
    res: { ...r, cult: 0, injury: 'dying' },
    flags: { ...state.flags, modao: true },
  }
  return {
    state: next,
    ok: false,
    died: false,
    msg: [...base, `心魔反噬，你走火入魔，道基崩碎、修为倒退一阶（跌回${realm.name}·${realm.stages[stageIdx]}），自此堕入魔道（flags.modao）。重伤垂死，不知来日。`].join('\n'),
  }
}

/**
 * 大境界突破（破境，原文 8.2）。
 * 前置：须修至当前大境·圆满且修为满；成功后晋升下一大境·初期，寿元按 LIFESPAN 刷新
 * （lifespanMax 与 lifespan 均更新为新境上限，原文仅言「境界决定寿元」），cult 清零、
 * cultMax 更新；触发雷劫 + 心魔劫（msg 描述）；成功还可从 FATE_CHANGES 三选一逆天改命
 * （availableFateChanges() / applyFateChange()）。
 * 失败后果按当前大境递进（炼气/筑基重伤+短期禁破 → 金丹/元婴倒退一阶+暗伤 → 化神以上可陨落/入魔），
 * 业力招天罚降低成功率，功德可挡一道致命雷劫。
 */
export function majorBreakthrough(state: GameState, path: BreakthroughPath): MajorBreakthroughResult {
  if (state.flags.dead) return { state, ok: false, died: false, msg: '尘缘已了，此身已殁。' }
  const p = state.player
  const r = state.res

  const realmIdx = REALMS.findIndex((x) => x.name === p.realm)
  if (realmIdx < 0) return { state, ok: false, died: false, msg: '境界信息有误，无法破境。' }
  if (realmIdx >= REALMS.length - 1) return { state, ok: false, died: false, msg: '你已臻至登仙，凡间无路可破。' }
  const realm = REALMS[realmIdx]
  const nextRealm = REALMS[realmIdx + 1]
  if (p.stage !== realm.stages[realm.stages.length - 1]) {
    return { state, ok: false, died: false, msg: `破境须先修至${realm.name}·圆满，你如今${realm.name}·${p.stage}，尚差火候。` }
  }
  if (r.cult < r.cultMax) {
    return { state, ok: false, died: false, msg: `修为未满（${r.cult}/${r.cultMax}），尚不足以引动破境之劫。` }
  }
  const cooldown = typeof state.flags.breakCooldown === 'number' ? state.flags.breakCooldown : 0
  if (cooldown > 0) {
    return { state, ok: false, died: false, msg: `伤势未愈、根基未稳（还需 ${cooldown} 个月方能再图破境）。` }
  }

  const pathIdx: Record<BreakthroughPath, number> = { 人道: 0, 地道: 1, 天道: 2 }
  const rate = finalRate(state, realmIdx, pathIdx[path])
  const { ok } = roll(rate)

  const pathDesc: Record<BreakthroughPath, string> = {
    人道: '人道破境——丹香护体，稳扎稳打，所获加成略低',
    地道: '地道破境——天材地宝淬体，中正平和，所得中规中矩',
    天道: '天道破境——灵珠道韵加身，引动天雷，九死一生而所得最厚',
  }

  // 心如磐石（原文 8.3：可挡一次心魔）：心魔缠身渡劫时抵消心魔之扰，本次即消耗
  const stoneConsumed =
    state.res.injury === 'heart-demon' && typeof state.flags[fateKey('心如磐石')] === 'number' && !state.flags.heartStoneUsed

  let result: MajorBreakthroughResult
  if (!ok) {
    result = failBreakthrough(state, realmIdx, rate, pathDesc[path])
  } else {
    // 破境成功：晋升下一大境·初期；寿元按 LIFESPAN 刷新；修为清零
    const newLifespan = LIFESPAN[nextRealm.name] ?? LIFESPAN[REALMS[0].name]
    const nextCultMax = stageCostOf(nextRealm.name)
    const next: GameState = {
      ...state,
      player: { ...p, realm: nextRealm.name, stage: nextRealm.stages[0] },
      res: {
        ...r,
        cult: 0,
        cultMax: nextCultMax,
        // 剩余寿元 = 新境界上限 - 当前年龄（此前已消耗的年岁不再补回）
        lifespan: Math.max(1, newLifespan - p.age),
        lifespanMax: newLifespan,
        // 心魔劫既渡，旧有心魔亦随之消散（推算，原文未言明）
        injury: r.injury === 'heart-demon' ? null : r.injury,
      },
    }
    const choices = availableFateChanges()
    result = {
      state: next,
      ok: true,
      died: false,
      msg: [
        `雷云翻涌，天劫轰然而至！${pathDesc[path]}——`,
        `（掷骰 ${rate.toFixed(1)}%）天雷淬体、心魔临心，你咬碎银牙，硬生生挺了过来！`,
        `【突破成功】你破入 ${nextRealm.name}·初期！寿元上限更新为 ${newLifespan} 年，修为归零重新积累（0/${nextCultMax}）。`,
        `劫后灵光乍现，上天欲赐你一项逆天改命（三选一）：${choices.join('、')}。`,
        '（请调用 applyFateChange(state, 逆天改命名) 择一而受。）',
      ].join('\n'),
    }
  }

  const finalState: GameState = stoneConsumed ? { ...result.state, flags: { ...result.state.flags, heartStoneUsed: true } } : result.state
  return { state: finalState, ok: result.ok, died: result.died, msg: result.msg }
}

/** 逆天改命候选（原文 8.3：每次大境界突破成功，从 3 个随机天资中选 1，可叠加可升级） */
export function availableFateChanges(count = 3): string[] {
  const pool = [...FATE_CHANGES]
  const out: string[] = []
  while (out.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

/** 应用一项逆天改命（可叠加可升级：同项重复选择时数值效果再次生效、持有计数 +1） */
export function applyFateChange(state: GameState, id: string): { state: GameState; msg: string } {
  const entry = FATE_CHANGES.find((f) => f === id)
  if (!entry) return { state, msg: '并无此逆天改命。' }

  let s: GameState = { ...state }
  switch (entry) {
    case '丹药精通（炼丹+1 级）': {
      const tl = { ...state.techniqueLevels }
      tl['lian-dan'] = (tl['lian-dan'] ?? 0) + 1
      s = { ...s, techniqueLevels: tl }
      break
    }
    case '气运如虹（仙缘+2）': {
      s = { ...s, player: { ...s.player, stats: { ...s.player.stats, xianyuan: s.player.stats.xianyuan + 2 } } }
      break
    }
    case '肉身成圣（气血上限+20%）': {
      s = { ...s, res: { ...s.res, hpMax: Math.round(s.res.hpMax * 1.2) } }
      break
    }
    case '天眼通（神识+3，探查无死角）': {
      s = { ...s, player: { ...s.player, stats: { ...s.player.stats, shenshi: s.player.stats.shenshi + 3 } } }
      break
    }
    case '心如磐石（道心+3，可挡一次心魔）': {
      s = { ...s, player: { ...s.player, stats: { ...s.player.stats, daoxin: s.player.stats.daoxin + 3 } } }
      break
    }
    case '万里神行（遁速+3）': {
      s = { ...s, player: { ...s.player, stats: { ...s.player.stats, dunsu: s.player.stats.dunsu + 3 } } }
      break
    }
    case '灵兽亲和（御兽+1 级）': {
      const tl = { ...state.techniqueLevels }
      tl['yu-shou'] = (tl['yu-shou'] ?? 0) + 1
      s = { ...s, techniqueLevels: tl }
      break
    }
    case '大道之体（传说：全系资质+1）': {
      const st = s.player.stats
      s = {
        ...s,
        player: {
          ...s.player,
          stats: {
            ...st,
            zizhi: st.zizhi + 1,
            wuxing: st.wuxing + 1,
            shenshi: st.shenshi + 1,
            dunsu: st.dunsu + 1,
            daoxin: st.daoxin + 1,
            xianyuan: st.xianyuan + 1,
          },
        },
      }
      break
    }
    // 剑心通明 / 双修悟道 / 聚灵体 / 血魔噬魂：无直接数值，仅记录持有
    // （聚灵体在 cultivation.ts 的修炼公式中生效；其余供叙事/其它系统读取）
    default:
      break
  }

  const flagKey = 'fate:' + entry
  const prev = state.flags[flagKey]
  const count = typeof prev === 'number' ? prev : 0
  s = { ...s, flags: { ...s.flags, [flagKey]: count + 1 } }
  return { state: s, msg: `逆天改命加身：${entry}。此乃天资造化，可叠加、可随突破升级。` }
}

/**
 * 悟道（原文 9.3）：论道/观想/顿悟/实战得感悟，闭关消化为悟道点，1 点 = 点亮 1 级。
 * 原文未给消耗数值与判定，按本引擎规则：消耗修为 = 当前大境小阶所需修为 × 目标等级
 * （境界越高悟道越贵），悟性判定（悟性×3% 上限 95%，同小突破），失败修为损耗半额。
 * 分支等级上限 9（按任务约定；原文未言明上限）。
 */
export function enlightenment(state: GameState, branch: string): { state: GameState; msg: string } {
  const short = resolveBranch(branch)
  if (!short) {
    return { state, msg: `悟道之路并无「${branch}」一途。可选：${ENLIGHTENMENT_BRANCHES.map((b) => b.split('（')[0]).join('、')}。` }
  }
  const level = state.enlightenment[short] ?? 0
  if (level >= 9) return { state, msg: `${short}已臻化境（${level} 级），大道当前已无余味可参。` }

  const cost = stageCostOf(state.player.realm) * (level + 1)
  if (state.res.cult < cost) {
    return { state, msg: `参悟${short}需修为 ${cost} 点，你如今只有 ${state.res.cult} 点，不足以消化感悟。` }
  }

  const rate = clamp(state.player.stats.wuxing * 3 + state.player.stats.daoxin * 0.5, 1, 95)
  const { ok } = roll(rate)
  if (!ok) {
    const lost = Math.round(cost / 2)
    const next: GameState = { ...state, res: { ...state.res, cult: Math.max(0, state.res.cult - lost) } }
    return { state: next, msg: `你闭目参悟${short}，灵光屡现却始终差一线——感悟散了大半（修为 −${lost}）。可另寻论道、顿悟之机再来。` }
  }

  const newEnlightenment = { ...state.enlightenment, [short]: level + 1 }
  const next: GameState = { ...state, enlightenment: newEnlightenment, res: { ...state.res, cult: state.res.cult - cost } }
  return { state: next, msg: `灵台豁然开朗，你悟得${short}真意——${short} 升至 ${level + 1} 级（上限 9）。修为 −${cost}。` }
}

/** 分支解析：接受全名（'剑道（剑系威力+5%/级）'）或短名（'剑道'），返回短名作为 enlightenment 键 */
function resolveBranch(branch: string): string | null {
  const b = branch.trim()
  const entry = ENLIGHTENMENT_BRANCHES.find((e) => {
    const short = e.split('（')[0]
    return e === b || short === b || e.startsWith(b + '（')
  })
  return entry ? entry.split('（')[0] : null
}

/**
 * 道心检查（原文 7.1：心魔缠身——道心 <40 或情劫所致；渡心魔、论道、清心可解）。
 * 简化实现：道心 <40 时每次检查有 (40−道心)% 概率缠上心魔（心如磐石可挡一次，原文 8.3）；
 * 已心魔缠身且道心 ≥40 时按道心% 自渡解脱。
 */
export function daoHeartCheck(state: GameState): { state: GameState; msg: string } {
  const daoxin = state.player.stats.daoxin
  const heartStone = typeof state.flags[fateKey('心如磐石')] === 'number' && !state.flags.heartStoneUsed

  if (state.res.injury === 'heart-demon') {
    if (daoxin >= 40) {
      const rate = clamp(daoxin, 1, 95)
      const { ok } = roll(rate)
      if (ok) {
        return { state: { ...state, res: { ...state.res, injury: null } }, msg: '心魔幻境中你坚守本心，一念清明——心魔已渡，道心愈坚。' }
      }
      return { state, msg: '心魔仍在滋扰，你道心未稳，尚不能全然挣脱。' }
    }
    return { state, msg: `你道心仅 ${daoxin}，心魔缠身（闭关效率暴跌）。须渡心魔、论道、清心，或待道心过 40 再图自渡。` }
  }

  if (daoxin < 40) {
    if (chance((40 - daoxin) / 100)) {
      if (heartStone) {
        return {
          state: { ...state, flags: { ...state.flags, heartStoneUsed: true } },
          msg: '心魔悄然来袭！你胸中磐石道心轰然一响，将之镇于无形——心如磐石，挡下一次心魔。',
        }
      }
      return {
        state: { ...state, res: { ...state.res, injury: 'heart-demon' } },
        msg: `心魔趁隙而入——你道心不足（${daoxin}<40），自此心魔缠身，闭关效率暴跌，偶发失控。`,
      }
    }
    return { state, msg: `你道心仅 ${daoxin}，隐隐有魔念滋生，尚在可控之内。宜多积道心、少沾杀孽。` }
  }

  return { state, msg: '道心稳固，无魔可侵。' }
}
