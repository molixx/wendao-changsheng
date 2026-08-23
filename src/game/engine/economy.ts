// ============================================================
// economy.ts —— 坊市经济引擎
// 数据来源章节：第十二章（坊市与经济：灵石货币、买卖、拍卖、跑商、杀人夺宝、物价参考、赚钱途径）、
// 7.3（功德与业力：杀人夺宝积业力，渡劫时业力招天罚）、第十六章（杀人夺宝 = 业力+，有目击者被通缉）。
// 物价基数取自 src/game/data/systems.ts 的 PRICES（原文 12 章物价参考）。
// 硬性约束：不可变更新（返回新对象，绝不 mutate 入参 state）。
// ============================================================
import type { GameState, Resources } from '../state'
import { PRICES } from '../data/systems'
import { REALMS } from '../data/realms'
import { roll, chance } from './dice'

/** 坊市商品（结构化商品表条目） */
export interface MarketItem {
  id: string
  name: string
  price: number
  kind: '丹药' | '符箓' | '材料' | '功法' | '杂物'
  desc: string
  effect?: {
    hp?: number
    mp?: number
    spirit?: number
    cult?: number
    merit?: number
    karma?: number
  }
}

/** PRICES 名称 → 稳定 id（手工映射，避免音译歧义） */
const PRICE_IDS: Record<string, string> = {
  聚气丹: 'juqi-dan',
  筑基丹: 'zhuji-dan',
  玄阶功法: 'xuanjie-gongfa',
  地阶功法: 'dijie-gongfa',
  灵药若干: 'lingyao',
  '洞府租/购': 'dongfu-zugou',
}

/** 商品功能描述与即时效果（按 id 补全；effect 缺省 = 无即时数值效果，如功法/突破丹药） */
const ITEM_PROFILE: Record<string, { desc: string; effect?: MarketItem['effect'] }> = {
  'juqi-dan': {
    desc: '炼气期修炼丹药：服用后修为 +3（不超过当前阶修为上限）',
    effect: { cult: 3 },
  },
  'zhuji-dan': {
    desc: '炼气大圆满突破筑基所需的辅助丹药：突破时消耗，可显著提高成功率（原文 8.2 人道筑基）',
  },
  'xuanjie-gongfa': {
    desc: '玄阶功法（如长春功，修炼 +30%）：研习入功法栏后生效',
  },
  'dijie-gongfa': {
    desc: '地阶功法（如玄元剑经，剑系威力 +40%）：研习入功法栏后生效',
  },
  lingyao: {
    desc: '品相不定的灵药（非标品，坊市参考价 50 灵石/份）：可服用回血 20，亦可作炼丹材料（原文 10 章炼丹）',
    effect: { hp: 20 },
  },
  'dongfu-zugou': {
    desc: '洞府租/购服务凭证（非标服务项，参考价 1000 灵石/年）：实际条款请到洞府面板洽谈办理（原文 13 章洞府）',
  },
}

/** 补充常用商品（2~3 个，价格参考原文 12 章「聚气丹 20 灵石」的物价水平） */
const EXTRA_ITEMS: readonly MarketItem[] = [
  {
    id: 'huiqi-dan',
    name: '回气丹',
    price: 15,
    kind: '丹药',
    desc: '低级回复丹药：服用回复气血 30 点（不超过气血上限），战斗中用符用丹可回血回灵（原文 16.2）',
    effect: { hp: 30 },
  },
  {
    id: 'juqi-san',
    name: '聚气散',
    price: 25,
    kind: '丹药',
    desc: '炼气期聚气丹药：服用修为 +5（不超过当前阶修为上限）',
    effect: { cult: 5 },
  },
  {
    id: 'diji-fulu',
    name: '低级符箓',
    price: 10,
    kind: '符箓',
    desc: '一次性法术符箓（如烈火符、风刃符）：战斗中造成一次五行法术伤害，伤害由战斗模块结算（原文 10 章符箓）',
  },
]

interface ParsedPrice {
  name: string
  price: number
  /** 价格说明（区间/上浮，仅原文给区间时存在） */
  priceNote: string | null
}

/** 解析「xx 多少灵石」：纯数字取原值；区间 300~1000 取中值；3000+ 取下限 3000 */
function parsePriceLine(line: string): ParsedPrice | null {
  const m = /^(.+?)\s+(\d+)(?:~(\d+))?\+?\s*灵石\s*$/.exec(line.trim())
  if (!m) return null
  const name = m[1]
  const lo = Number(m[2])
  const hi = m[3] ? Number(m[3]) : null
  if (hi !== null) {
    const mid = Math.round((lo + hi) / 2)
    return { name, price: mid, priceNote: `市价 ${lo}~${hi} 灵石按品质浮动，坊市按中值 ${mid} 标价` }
  }
  return { name, price: lo, priceNote: lo >= 1000 ? `市价 ${lo}+ 灵石，坊市按 ${lo} 标价` : null }
}

/** 按名称推断品类（仅对能解析出价格的条目生效） */
function inferKind(name: string): MarketItem['kind'] {
  if (/丹|散|丸|膏/.test(name)) return '丹药'
  if (/符/.test(name)) return '符箓'
  if (/功法|秘笈|秘籍|经|典|诀/.test(name)) return '功法'
  if (/灵药|材料|草|矿|果/.test(name)) return '材料'
  return '杂物'
}

/** 单条 PRICES → MarketItem；解析不了的条目保留为「杂物」并给参考价（desc 注明非标） */
function buildItem(line: string): MarketItem {
  const parsed = parsePriceLine(line)
  const name = parsed?.name ?? line.trim()
  const id = PRICE_IDS[name] ?? `za-${name}`
  const profile = ITEM_PROFILE[id]
  if (!parsed) {
    const price = id === 'lingyao' ? 50 : id === 'dongfu-zugou' ? 1000 : 10
    const desc =
      profile?.desc ?? `${name}（非标品，坊市参考价 ${price} 灵石，具体以当面议价为准）`
    return { id, name, price, kind: '杂物', desc, effect: profile?.effect }
  }
  const note = parsed.priceNote ? `（${parsed.priceNote}）` : ''
  const desc = `${profile?.desc ?? `坊市流通品：${name}`}${note}`
  return { id, name, price: parsed.price, kind: inferKind(name), desc, effect: profile?.effect }
}

/** 返回当前坊市商品表（每次调用生成全新对象，杜绝外部 mutate 污染） */
export function marketList(): MarketItem[] {
  return [...PRICES.map(buildItem), ...EXTRA_ITEMS].map((i) => ({
    ...i,
    effect: i.effect ? { ...i.effect } : undefined,
  }))
}

/** 物品 id → 中文名（背包存的是 id，展示时映射回中文；未识别原样返回） */
export function itemNameOf(id: string): string {
  const hit = marketList().find((i) => i.id === id)
  return hit?.name ?? id
}

/** 坊市购买：扣灵石、进背包；灵石不足返回 ok:false */
export function marketBuy(
  state: GameState,
  itemId: string,
  qty = 1,
): { state: GameState; ok: boolean; msg: string } {
  if (!Number.isInteger(qty) || qty < 1) {
    return { state, ok: false, msg: '购买数量必须为正整数' }
  }
  const item = marketList().find((i) => i.id === itemId)
  if (!item) {
    return { state, ok: false, msg: `坊市没有「${itemId}」这件商品` }
  }
  const cost = item.price * qty
  if (state.res.spirit < cost) {
    return { state, ok: false, msg: `灵石不足：需要 ${cost} 灵石，你只有 ${state.res.spirit} 灵石` }
  }
  const newState: GameState = {
    ...state,
    res: { ...state.res, spirit: state.res.spirit - cost },
    bag: { ...state.bag, [itemId]: (state.bag[itemId] ?? 0) + qty },
    log: [...state.log, `坊市购入 ${item.name} ×${qty}，花费 ${cost} 灵石`],
  }
  return {
    state: newState,
    ok: true,
    msg: `购入 ${item.name} ×${qty}，花费 ${cost} 灵石（余 ${newState.res.spirit} 灵石）`,
  }
}

/** 坊市出售：按半价回收灵石；背包无此物返回 ok:false */
export function marketSell(
  state: GameState,
  itemId: string,
  qty = 1,
): { state: GameState; ok: boolean; msg: string } {
  if (!Number.isInteger(qty) || qty < 1) {
    return { state, ok: false, msg: '出售数量必须为正整数' }
  }
  const held = state.bag[itemId] ?? 0
  if (held <= 0) {
    return { state, ok: false, msg: `背包里没有「${itemId}」，无可出售` }
  }
  if (qty > held) {
    return { state, ok: false, msg: `「${itemId}」只有 ${held} 件，不足以出售 ${qty} 件` }
  }
  const item = marketList().find((i) => i.id === itemId)
  if (!item) {
    return { state, ok: false, msg: `「${itemId}」不在坊市回收清单中，坊市不收这件东西` }
  }
  const price = Math.max(1, Math.floor(item.price / 2)) // 半价回收（原文未给回收折扣，取惯例半价）
  const gain = price * qty
  const newState: GameState = {
    ...state,
    res: { ...state.res, spirit: state.res.spirit + gain },
    bag: { ...state.bag, [itemId]: held - qty },
    log: [...state.log, `坊市出售 ${item.name} ×${qty}，回收 ${gain} 灵石`],
  }
  return {
    state: newState,
    ok: true,
    msg: `售出 ${item.name} ×${qty}，按半价回收 ${gain} 灵石（现 ${newState.res.spirit} 灵石）`,
  }
}

/** 描述 effect 结算前后的数值变化 */
function describeEffect(res: Resources, next: Resources, e: NonNullable<MarketItem['effect']>): string {
  const parts: string[] = []
  if (e.hp !== undefined) parts.push(`气血 ${res.hp}→${next.hp}`)
  if (e.mp !== undefined) parts.push(`灵力 ${res.mp}→${next.mp}`)
  if (e.cult !== undefined) parts.push(`修为 ${res.cult}→${next.cult}`)
  if (e.spirit !== undefined) parts.push(`灵石 ${res.spirit}→${next.spirit}`)
  if (e.merit !== undefined) parts.push(`功德 ${res.merit}→${next.merit}`)
  if (e.karma !== undefined) parts.push(`业力 ${res.karma}→${next.karma}`)
  return parts.join('，')
}

/** 使用消耗品：应用 effect（hp/mp/cult 不超过上限），从背包扣除 1 件 */
export function useItem(state: GameState, itemId: string): { state: GameState; ok: boolean; msg: string } {
  const held = state.bag[itemId] ?? 0
  if (held <= 0) {
    return { state, ok: false, msg: `背包里没有「${itemId}」，无可使用` }
  }
  const item = marketList().find((i) => i.id === itemId)
  if (!item) {
    return { state, ok: false, msg: `「${itemId}」不是坊市流通之物，无法使用` }
  }
  const e = item.effect
  if (!e) {
    return { state, ok: false, msg: `${item.name} 无需服用：功法请到功法面板研习，筑基丹请在突破时消耗` }
  }
  const res = state.res
  if (
    (e.hp !== undefined && res.hp >= res.hpMax) ||
    (e.mp !== undefined && res.mp >= res.mpMax) ||
    (e.cult !== undefined && res.cult >= res.cultMax)
  ) {
    return { state, ok: false, msg: `对应属性已满，此时服用 ${item.name} 纯属浪费` }
  }
  const next: Resources = {
    ...res,
    hp: e.hp !== undefined ? Math.min(res.hp + e.hp, res.hpMax) : res.hp,
    mp: e.mp !== undefined ? Math.min(res.mp + e.mp, res.mpMax) : res.mp,
    cult: e.cult !== undefined ? Math.min(res.cult + e.cult, res.cultMax) : res.cult,
    spirit: e.spirit !== undefined ? res.spirit + e.spirit : res.spirit,
    merit: e.merit !== undefined ? res.merit + e.merit : res.merit,
    karma: e.karma !== undefined ? res.karma + e.karma : res.karma,
  }
  const newState: GameState = {
    ...state,
    res: next,
    bag: { ...state.bag, [itemId]: held - 1 },
    log: [...state.log, `使用 ${item.name} ×1`],
  }
  return {
    state: newState,
    ok: true,
    msg: `服用 ${item.name}：${describeEffect(res, next, e)}（背包余 ${held - 1}）`,
  }
}

/** 通用灵石结算（任务奖励 / 奇遇 / 剧情用）；amount 可为负（扣灵石） */
export function earnSpirit(state: GameState, amount: number, source: string): { state: GameState; msg: string } {
  const next = state.res.spirit + amount
  const newState: GameState = {
    ...state,
    res: { ...state.res, spirit: next },
    log: [...state.log, `${source}：灵石${amount >= 0 ? '+' : ''}${amount}`],
  }
  return {
    state: newState,
    msg: `${source}：${amount >= 0 ? '获得' : '失去'} ${Math.abs(amount)} 灵石（现 ${next} 灵石）`,
  }
}

/**
 * 杀人夺宝 / 拦路劫掠（原文 12 章「可事后杀人夺宝——修仙特色，业力+」、16 章「夺宝/杀戮 = 业力+」）。
 * 成功率原文未给精确值 → 取 40%；战利品随境界递增（境界越高劫得越多）。
 * 失败：一半概率受伤（轻伤 + 气血损失），一半概率被反夺灵石。
 */
export function robbery(state: GameState): { state: GameState; ok: boolean; msg: string } {
  const { ok: won } = roll(40)
  if (won) {
    const realmIdx = Math.max(0, REALMS.findIndex((r) => r.name === state.player.realm))
    const loot = 30 + realmIdx * 40
    const newState: GameState = {
      ...state,
      res: { ...state.res, spirit: state.res.spirit + loot, karma: state.res.karma + 1 },
      log: [...state.log, `杀人夺宝得手：灵石 +${loot}，业力 +1`],
    }
    return {
      state: newState,
      ok: true,
      msg:
        `拦路劫掠得手！夺得 ${loot} 灵石。但杀戮夺宝令你业力 +1——业力缠身者渡劫必招更狠的天罚（雷劫威力大增），` +
        `若有目击者，还会被通缉追杀（原文 7.3 / 16 章）。`,
    }
  }
  if (chance(0.5)) {
    // 受伤：轻伤 + 气血损失 30%（至少 1 点，最低保 1 点气血）
    const lost = Math.max(1, Math.floor(state.res.hpMax * 0.3))
    const hp = Math.max(1, state.res.hp - lost)
    const newState: GameState = {
      ...state,
      res: { ...state.res, hp, injury: '轻伤' },
      log: [...state.log, `劫掠失手反遭重创：气血 -${state.res.hp - hp}，轻伤`],
    }
    return {
      state: newState,
      ok: false,
      msg: `劫掠失手，反被对方重创：气血 -${state.res.hp - hp}，身受轻伤（现 ${hp}/${state.res.hpMax}）。`,
    }
  }
  // 损失灵石：丢当前两成（至少 5，至多现有）
  const lost = Math.min(state.res.spirit, Math.max(5, Math.floor(state.res.spirit * 0.2)))
  if (lost === 0) {
    return { state, ok: false, msg: '劫掠失手，对方见你身无分文，只狠狠教训了你一顿。' }
  }
  const newState: GameState = {
    ...state,
    res: { ...state.res, spirit: state.res.spirit - lost },
    log: [...state.log, `劫掠失手，反被夺去 ${lost} 灵石`],
  }
  return { state: newState, ok: false, msg: `劫掠失手，反被对方夺去 ${lost} 灵石（现 ${newState.res.spirit} 灵石）。` }
}
