/** 引擎冒烟测试 —— 离线模式端到端验证（不调 LLM）
 *  运行：npx tsx scripts/smoke.ts
 *  覆盖：创角状态 → 指令路由 → 修炼/突破/坊市/背包/游历/宗门/技艺/洞府/情缘/战斗 的数值流转 */

import type { GameState } from '../src/game/state'
import { buildInitialForTest } from './smoke-helpers'
import { routeCommand, executeSystem } from '../src/game/engine/actions'
import { resolveTurn, applyAging, applyDeltas, validateProposedStateChanges } from '../src/game/engine/turn'
import { DEFAULT_SETTINGS } from '../src/game/state'
import { cultivate } from '../src/game/engine/cultivation'
import { marketList, marketBuy, useItem, studyGongfa } from '../src/game/engine/economy'
import { startCombat, combatStep, applyCombatResult } from '../src/game/engine/combat'
import { majorBreakthrough } from '../src/game/engine/breakthrough'
import { sectJoin, sectTask, practiceTechnique, caveUpgrade, affectionAction, heal, secretRealmExplore, majorEventRoll } from '../src/game/engine/systems'
import { sanitizeOptions } from '../src/game/narrator/llm'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    console.log(`  ❌ ${name} ${detail}`)
  }
}

async function main() {
  console.log('== 1. 创角初始状态 ==')
  const s0 = buildInitialForTest()
  check('初始境界炼气·初期', s0.player.realm === '炼气' && s0.player.stage === '初期')
  check('寿元 84（100-年龄16）', s0.res.lifespan === 84)
  check('灵石 100', s0.res.spirit === 100)

  console.log('\n== 2. 指令路由 ==')
  check('修炼 → cultivate', routeCommand('修炼').kind === 'cultivate')
  check('闭关 → cultivate closedDoor', routeCommand('闭关').kind === 'cultivate')
  check('突破 天道 → breakthrough 天道', (routeCommand('突破 天道') as { path?: string }).path === '天道')
  check('坊市 → market', routeCommand('坊市').kind === 'market')
  check('买 聚气丹 → buy', (routeCommand('买 聚气丹') as { itemId?: string }).itemId.includes('聚气丹'))
  check('游历 → travel', routeCommand('游历').kind === 'travel')
  check('自由输入 → free', routeCommand('我想夜探藏经阁').kind === 'free')
  check('论道 顾清玄 → affectionAction', routeCommand('论道 顾清玄').kind === 'affectionAction')
  check('研习 玄阶功法 → study', routeCommand('研习 玄阶功法').kind === 'study')
  check('卖 聚气丹 → sell', routeCommand('卖 聚气丹').kind === 'sell')
  check('摆摊卖货 → sell', routeCommand('摆摊卖货').kind === 'sell')

  console.log('\n== 3. 修炼数值（原文公式） ==')
  const c = cultivate(s0, 1, false)
  check('修为增加', c.gained > 0, `gained=${c.gained}`)
  check('factors 有 5 项系数', c.factors.length >= 5, c.factors.join('|'))
  check('状态不可变', c.state !== s0)
  check('时间/年龄/寿元由回合管线统一推进（cultivate 不推）', c.state.timeline === s0.timeline)
  // 修复 10× 通胀：炼气（天灵根+先天道体测试配置）月修为应 ≈48，而非修复前的 480
  check('炼气月修为量级合理（修复 10× 通胀）', c.gained >= 20 && c.gained <= 80, `gained=${c.gained}`)
  // 伤势统一为 id 后，心魔缠身闭关效率暴跌（×1 而非 ×2）、内伤 −50%（修复前中文名写入不触发）
  const hdClosed = cultivate({ ...s0, res: { ...s0.res, injury: 'heart-demon' } }, 1, true)
  const okClosed = cultivate(s0, 1, true)
  check('心魔缠身闭关效率暴跌（×1 而非 ×2）', hdClosed.gained === Math.round(okClosed.gained / 2), `hd=${hdClosed.gained} ok=${okClosed.gained}`)
  const innerGain = cultivate({ ...s0, res: { ...s0.res, injury: 'inner' } }, 1, false)
  check('内伤修为增长 −50%', innerGain.gained === Math.round(c.gained * 0.5), `inner=${innerGain.gained} normal=${c.gained}`)

  console.log('\n== 3b. 衰老/寿元结算（修复后：整月累计入年龄） ==')
  let aging: GameState = s0
  for (let i = 0; i < 12; i++) aging = applyAging(aging, 1)
  check('12 个月后年龄 +1（修复前永不增长）', aging.player.age === s0.player.age + 1, `age=${aging.player.age}`)
  check('12 个月后寿元 −1', aging.res.lifespan === s0.res.lifespan - 1, `lifespan=${aging.res.lifespan}`)
  let aging2: GameState = s0
  for (let i = 0; i < 24; i++) aging2 = applyAging(aging2, 1)
  check('24 个月后年龄 +2', aging2.player.age === s0.player.age + 2, `age=${aging2.player.age}`)
  check('寿元耗尽触发坐化', applyAging({ ...s0, res: { ...s0.res, lifespan: 1 } }, 12).flags.dead === '坐化')

  console.log('\n== 4. 回合管线（无 Key → 系统指令降级可玩，自由行动拦截） ==')
  const off = DEFAULT_SETTINGS
  // 无 Key：系统指令（修炼）走代码结算降级，不再抛错死锁（作者定案：诚实的降级体验）
  const t1 = await resolveTurn({ state: s0, action: '修炼', history: [] }, { ...off, useLlm: false })
  check('无 Key 时系统指令（修炼）可玩（代码结算降级）', !(t1 instanceof Error) && t1.state.turn === s0.turn + 1, t1 instanceof Error ? t1.message : `turn=${t1.state.turn}`)
  check('无 Key 普通修炼流逝 1 个月', !(t1 instanceof Error) && t1.timePassedMonths === 1, t1 instanceof Error ? '' : `passed=${t1.timePassedMonths}`)
  // 无 Key：自由行动仍被拦截，提示配置叙事引擎
  const t2 = await resolveTurn({ state: s0, action: '我夜探藏经阁', history: [] }, { ...off, useLlm: false })
    .then(() => null)
    .catch((e) => e as Error)
  check('无 Key 时自由行动被拦截（需配置叙事引擎）', t2 instanceof Error && /自由行动需要叙事引擎/.test(t2.message), t2 instanceof Error ? t2.message : '未抛错')
  // 系统指令的代码结算仍可直接调用（引擎层不依赖 LLM）
  const sys = executeSystem(routeCommand('修炼'), s0, [])
  check('系统指令代码结算仍可用', !!sys && sys.narrative.length > 0)

  console.log('\n== 5. 坊市 ==')
  const items = marketList()
  check('商品表非空', items.length >= 4, `${items.length} 件`)
  const buy = marketBuy(s0, items[0].id, 1)
  check('购买扣灵石', buy.state.res.spirit === s0.res.spirit - items[0].price, `灵石 ${s0.res.spirit}→${buy.state.res.spirit}`)
  check('背包有货', (buy.state.bag[items[0].id] ?? 0) === 1)
  const use = useItem(buy.state, items[0].id)
  check('使用消耗品', use.ok && (use.state.bag[items[0].id] ?? 0) === 0)

  console.log('\n== 6. 突破（人道，多次尝试直到成功/失败路径覆盖） ==')
  const br = majorBreakthrough(s0, '人道')
  check('突破返回结构完整', typeof br.ok === 'boolean' && typeof br.died === 'boolean' && br.msg.length > 0)
  if (br.ok) check('成功后进入筑基·初期', br.state.player.realm === '筑基' && br.state.player.stage === '初期')

  console.log('\n== 6b. 逆天改命三选一（突破成功后可承领） ==')
  const perfect: GameState = { ...s0, player: { ...s0.player, stage: '圆满' }, res: { ...s0.res, cult: 100, cultMax: 100 } }
  const br2 = majorBreakthrough(perfect, '人道')
  if (br2.ok) {
    check('突破成功返回 3 项逆天改命候选', Array.isArray(br2.fateChoices) && br2.fateChoices.length === 3, JSON.stringify(br2.fateChoices))
    const choice = br2.fateChoices![0]
    const fateCmd = routeCommand(`承 · ${choice}`)
    check('「承 · 名称」被路由为 fateChange', fateCmd.kind === 'fateChange', JSON.stringify(fateCmd))
    const fateRes = fateCmd.kind === 'fateChange' ? executeSystem(fateCmd, br2.state, []) : null
    check('承领后 flags.fate:* 计数 +1', !!fateRes && (fateRes.state.flags['fate:' + choice] ?? 0) === 1, JSON.stringify(fateRes?.state.flags))
  } else {
    console.log('  （本局人道突破失败，跳过逆天改命断言）')
  }
  // 筑基丹（原文 8.2 人道筑基需突破丹药）：人道破境时消耗 1 枚，成功率 +15%
  const withPill = { ...perfect, bag: { 'zhuji-dan': 1 } }
  const br3 = majorBreakthrough(withPill, '人道')
  check('人道突破消耗筑基丹', (br3.state.bag['zhuji-dan'] ?? 0) === 0, JSON.stringify(br3.state.bag))

  console.log('\n== 7. 宗门/技艺/洞府/情缘 ==')
  const sj = sectJoin(s0, '青云宗')
  check('拜入宗门返回完整', typeof sj.ok === 'boolean' && sj.msg.length > 0, sj.msg.slice(0, 40))
  const task = sectTask(s0)
  check('宗门任务可执行', typeof task.ok === 'boolean' && task.msg.length > 0)
  const tp = practiceTechnique(s0, 'lian-dan')
  check('技艺修炼返回完整', typeof tp.ok === 'boolean' && tp.msg.length > 0, tp.msg.slice(0, 40))
  const cu = caveUpgrade(s0)
  check('洞府升级返回完整', typeof cu.ok === 'boolean' && cu.msg.length > 0, cu.msg.slice(0, 40))
  const aff = affectionAction(s0, 'gu-qingxuan', '论道')
  check('好感互动返回完整', typeof aff.ok === 'boolean' && aff.msg.length > 0, aff.msg.slice(0, 40))
  const h = heal(s0, '闭关疗伤')
  check('疗伤返回完整', h.msg.length > 0 && h.state.res.hp >= s0.res.hp, h.msg.slice(0, 40))

  console.log('\n== 7b. 伤势表示统一为 id（修复后） ==')
  const wounded: GameState = { ...s0, res: { ...s0.res, injury: 'severe' } }
  const h2 = heal(wounded, '寻医')
  check('id 型重伤可寻医治愈（修复前报「未知伤势」）', h2.state.res.injury === null && h2.state.res.hp === h2.state.res.hpMax, h2.msg.slice(0, 40))
  const h3 = heal(wounded, '闭关疗伤')
  check('重伤闭关一月恢复为轻伤（id 表示）', h3.state.res.injury === 'light', h3.state.res.injury ?? 'null')
  const cw = startCombat(wounded, { name: '野狼妖', realmIdx: 0, stageIdx: 0, hpMax: 100, attack: 30, defense: 10, speed: 10, elements: ['火'] })
  const expectedAttack = Math.max(1, Math.round((s0.player.stats.zizhi * 2 + s0.player.stats.wuxing) * 0.8))
  check('重伤属性压制生效（攻击 ×0.8，修复前永不触发）', cw.player.attack === expectedAttack, `attack=${cw.player.attack} expected=${expectedAttack}`)

  console.log('\n== 7c. 商品闭环（研习/卖货/背包键/战斗丹药） ==')
  const st1 = studyGongfa(s0, 'xuanjie-gongfa')
  check('无卷轴时研习被拒', st1.ok === false && /没有/.test(st1.msg), st1.msg.slice(0, 40))
  const withScroll = { ...s0, bag: { 'xuanjie-gongfa': 1 } }
  const st2 = studyGongfa(withScroll, 'xuanjie-gongfa')
  check('研习玄阶功法：成功习得长春功并耗卷轴 / 失败不耗卷轴', st2.ok ? st2.state.gongfaIds.includes('changchun-gong') && (st2.state.bag['xuanjie-gongfa'] ?? 0) === 0 : (st2.state.bag['xuanjie-gongfa'] ?? 0) === 1, st2.msg.slice(0, 60))
  const sellRes = executeSystem(routeCommand('卖 聚气丹'), { ...s0, bag: { 'juqi-dan': 2 } }, [])
  check('摆摊卖货接线（marketSell 半价回收）', !!sellRes && (sellRes.state.bag['juqi-dan'] ?? 0) === 1 && sellRes.state.res.spirit === s0.res.spirit + 10, JSON.stringify(sellRes?.state.bag))
  const bagMap = applyDeltas(s0, { bag: { 聚气丹: 1 } })
  check('AI 中文物品名背包键映射回 id', (bagMap.state.bag['juqi-dan'] ?? 0) === 1, JSON.stringify(bagMap.state.bag))
  // 战斗用丹：校验背包并消耗（与坊市/背包账目一致）
  const cs2 = startCombat({ ...s0, bag: { 'huiqi-dan': 1 } }, { name: '野狼妖', realmIdx: 0, stageIdx: 0, hpMax: 100, attack: 30, defense: 10, speed: 10, elements: ['火'] })
  const combatState = { ...s0, bag: { 'huiqi-dan': 1 }, flags: { ...s0.flags, combat: JSON.stringify(cs2) } }
  const itemStep = executeSystem(routeCommand('符丹'), combatState, [])
  check('战斗用丹消耗背包回气丹', !!itemStep && (itemStep.state.bag['huiqi-dan'] ?? 0) === 0, JSON.stringify(itemStep?.state.bag))
  const noPill = executeSystem(routeCommand('符丹'), { ...combatState, bag: {} }, [])
  check('无丹药时战斗用丹被拦截', !!noPill && /并无回血回灵的丹药/.test(noPill.narrative), noPill?.narrative.slice(0, 40))

  console.log('\n== 7d. 玩法闭环（秘境/大事件/双修） ==')
  const realmOpen = executeSystem(routeCommand('探索秘境'), { ...s0, flags: { ...s0.flags, secretRealmOpen: true } }, [])
  check('秘境探索（入口现世时）结算并消耗标记', !!realmOpen && realmOpen.narrative.length > 0 && !realmOpen.state.flags.secretRealmOpen, realmOpen?.narrative.slice(0, 40))
  const realmClosed = executeSystem(routeCommand('探索秘境'), s0, [])
  check('无秘境入口时探索被拒', !!realmClosed && /并无秘境/.test(realmClosed.narrative), realmClosed?.narrative.slice(0, 40))
  const major = majorEventRoll({ ...s0, timeline: { ...s0.timeline, year: 5 } })
  check('入道第 5 年触发升仙大会大事件', !!major && /升仙大会/.test(major.msg), major?.msg.slice(0, 40))
  const dualCmd = routeCommand('双修 顾清玄')
  check('双修 顾清玄 → affectionAction 双修', dualCmd.kind === 'affectionAction' && dualCmd.action === '双修', JSON.stringify(dualCmd))
  const dualState = { ...s0, daoPartner: 'gu-qingxuan', relationships: { 'gu-qingxuan': 90 } }
  const dual = affectionAction(dualState, 'gu-qingxuan', '双修')
  check('与道侣双修：修为进益 + 心境大定', dual.ok && dual.state.res.cult > dualState.res.cult && dual.state.res.mood === 1.2, dual.msg.slice(0, 50))
  const dualReject = affectionAction(s0, 'gu-qingxuan', '双修')
  check('非道侣不可双修', dualReject.ok === false, dualReject.msg.slice(0, 40))

  console.log('\n== 9. LLM 健壮性（负数协议 / sanitizeOptions） ==')
  // P0-1：负数提案保留符号（修复前被 validate 钳成 0/1）
  const negValid = validateProposedStateChanges({ ...s0, bag: { 'juqi-dan': 2 } }, { bag: { 聚气丹: -1 } }, 'x')
  check('负数提案保留符号（修复前被钳成 0）', !!negValid.accepted && (negValid.accepted.bag as Record<string, unknown>)['聚气丹'] === -1, JSON.stringify(negValid.accepted))
  const negApply = applyDeltas({ ...s0, bag: { 'juqi-dan': 2 } }, { bag: { 聚气丹: -1 } })
  check('负数背包增量正确消耗（2→1，修复前静默丢失）', (negApply.state.bag['juqi-dan'] ?? 0) === 1, JSON.stringify(negApply.state.bag))
  const negStats = applyDeltas(s0, { stats: { 道心: -1 } })
  check('负属性增量正确减少（道心 12→11，修复前反而 +1）', negStats.state.player.stats.daoxin === s0.player.stats.daoxin - 1, `daoxin=${negStats.state.player.stats.daoxin}`)
  // P1-1：sanitizeOptions 兼容非字符串 text 与字符串数组项
  const badOpts = sanitizeOptions([{ text: 123 as unknown as string }, '选项二', { text: '选项三' }, { text: '' }, { text: '选项二' }])
  check('sanitizeOptions 兼容非字符串/字符串项（防 TypeError 废回合）', badOpts.length === 2 && badOpts[0].text === '选项二', JSON.stringify(badOpts))

  console.log('\n== 8. 战斗 ==')
  const cs = startCombat(s0, { name: '野狼妖', realmIdx: 0, stageIdx: 0, hpMax: 100, attack: 30, defense: 10, speed: 10, elements: ['火'] })
  let cur = cs
  let steps = 0
  while (!cur.over && steps < 30) {
    cur = combatStep(cur, '攻击')
    steps++
  }
  check('战斗在 30 步内结束', cur.over, `steps=${steps}`)
  check('战斗日志非空', cur.log.length > 0, cur.log[0]?.slice(0, 40))
  const after = applyCombatResult(s0, cur)
  check('战后状态合并', typeof after.res.hp === 'number')

  console.log(`\n${pass} 通过 / ${fail} 失败`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('SMOKE CRASH:', e)
  process.exit(2)
})
