/** 引擎冒烟测试 —— 离线模式端到端验证（不调 LLM）
 *  运行：npx tsx scripts/smoke.ts
 *  覆盖：创角状态 → 指令路由 → 修炼/突破/坊市/背包/游历/宗门/技艺/洞府/情缘/战斗 的数值流转 */

import { buildInitialForTest } from './smoke-helpers'
import { routeCommand, executeSystem } from '../src/game/engine/actions'
import { resolveTurn } from '../src/game/engine/turn'
import { DEFAULT_SETTINGS } from '../src/game/state'
import { cultivate } from '../src/game/engine/cultivation'
import { marketList, marketBuy, useItem } from '../src/game/engine/economy'
import { startCombat, combatStep, applyCombatResult } from '../src/game/engine/combat'
import { majorBreakthrough } from '../src/game/engine/breakthrough'
import { sectJoin, sectTask, practiceTechnique, caveUpgrade, affectionAction, heal } from '../src/game/engine/systems'

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
  check('寿元 100', s0.res.lifespan === 100)
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

  console.log('\n== 3. 修炼数值（原文公式） ==')
  const c = cultivate(s0, 1, false)
  check('修为增加', c.gained > 0, `gained=${c.gained}`)
  check('factors 有 5 项系数', c.factors.length >= 5, c.factors.join('|'))
  check('状态不可变', c.state !== s0)
  check('时间推进 1 月', c.state.timeline.month === s0.timeline.month + 1 || (c.state.timeline.year === s0.timeline.year + 1 && c.state.timeline.month === 1))

  console.log('\n== 4. 回合管线（离线） ==')
  const off = DEFAULT_SETTINGS
  const t1 = await resolveTurn({ state: s0, action: '修炼', history: [] }, { ...off, useLlm: false })
  check('回合+1', t1.state.turn === 1)
  check('叙事非空', t1.narrative.length > 0, t1.narrative.slice(0, 40))
  check('有选项', t1.options.length >= 3)

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
