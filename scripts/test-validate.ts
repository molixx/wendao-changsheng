import assert from 'assert'
import { buildInitialForTest } from './smoke-helpers'
import { validateProposedStateChanges, applyDeltas } from '../src/game/engine/turn'

function ok(cond: boolean, msg: string) {
  if (!cond) {
    console.error('❌', msg)
    process.exitCode = 1
  } else {
    console.log('✅', msg)
  }
}

async function main() {
  const s0 = buildInitialForTest()

  // Keep a counter
  let passed = 0
  let total = 0
  function check(name: string, fn: () => boolean) {
    total++
    try {
      const r = fn()
      if (r) passed++
      ok(r, name)
    } catch (e) {
      ok(false, `${name} threw ${String(e)}`)
    }
  }

  // 1. location: travel-like action accepted
  check('location accepted on travel-like action', () => {
    const res = validateProposedStateChanges(s0, { location: '南疆·赤炎' }, '游历 南疆·赤炎')
    return !!(res.accepted && res.accepted.location === '南疆·赤炎')
  })

  // 2. location: non-travel rejected
  check('location rejected without move', () => {
    const res = validateProposedStateChanges(s0, { location: '南疆·赤炎' }, '修炼')
    return !!(res.rejected && res.rejected.location && /不能改变所在地|地点/.test(res.rejected.location.reason))
  })

  // 3. mainQuest: accepted when quest-like action
  check('mainQuest accepted on quest-like action', () => {
    const res = validateProposedStateChanges(s0, { mainQuest: '寻找旧遗迹' }, '寻找 旧遗迹')
    return !!(res.accepted && res.accepted.mainQuest === '寻找旧遗迹')
  })

  // 4. affinity: numeric accepted, non-numeric rejected
  check('affinity numeric accepted', () => {
    const res = validateProposedStateChanges(s0, { affinity: { '顾清玄': 5 } }, '交谈 顾清玄')
    return !!(res.accepted && (res.accepted.affinity as any)['顾清玄'] === 5)
  })
  check('affinity non-numeric rejected', () => {
    const res = validateProposedStateChanges(s0, { affinity: { '顾清玄': '多' } }, '交谈 顾清玄')
    return !!(res.rejected && res.rejected['affinity.顾清玄'] && /需为数字/.test(res.rejected['affinity.顾清玄'].reason))
  })

  // 6. bag: negative sign preserved (增量语义，钳制在 applyDeltas)
  check('bag negative sign preserved (增量语义)', () => {
    const res = validateProposedStateChanges(s0, { bag: { '聚气丹': -1 } }, '使用 聚气丹')
    return !!(res.accepted && (res.accepted.bag as any)['聚气丹'] === -1)
  })

  // 7. mood: numeric normalized
  check('mood normalized to 1.2', () => {
    const res = validateProposedStateChanges(s0, { mood: 1.2 }, '交谈')
    return !!(res.accepted && (res.accepted.mood === 1.2))
  })

  // 8. status: array accepted
  check('status array accepted', () => {
    const res = validateProposedStateChanges(s0, { status: ['中毒'] }, '探险')
    return !!(res.accepted && Array.isArray(res.accepted.status as any) && (res.accepted.status as any)[0] === '中毒')
  })
  // status object rejected
  check('status object rejected', () => {
    const res = validateProposedStateChanges(s0, { status: { x: 1 } }, '探险')
    return !!(res.rejected && res.rejected.status && /需为字符串或数组/.test(res.rejected.status.reason))
  })

  // 10. stats: sign preserved（增量语义；最终值由 applyDeltas 钳制 1~20）
  check('stats values passed through with sign (增量语义)', () => {
    const res = validateProposedStateChanges(s0, { stats: { 悟性: 30, 道心: -5 } }, '修炼')
    return !!(res.accepted && (res.accepted.stats as any).悟性 === 30 && (res.accepted.stats as any).道心 === -5)
  })

  // 11. technique/enlightenment passed through (增量语义)
  check('technique/enlightenment passed through (增量语义)', () => {
    const res = validateProposedStateChanges(s0, { technique: { 炼丹: 10 }, enlightenment: { 剑道: 0 } }, '修炼')
    return !!(res.accepted && (res.accepted.technique as any).炼丹 === 10 && (res.accepted.enlightenment as any).剑道 === 0)
  })

  // 12. location equal to current -> accepted (redundant)
  check('location equal to current accepted', () => {
    const cur = s0.flags.location ?? '东洲·青岳'
    const res = validateProposedStateChanges(s0, { location: cur }, '修炼')
    return !!(res.accepted && res.accepted.location === cur)
  })

  // 13. location too long rejected
  check('location name too long rejected', () => {
    const long = '南疆·' + '炎'.repeat(50)
    const res = validateProposedStateChanges(s0, { location: long }, '游历')
    return !!(res.rejected && res.rejected.location && /过长/.test(res.rejected.location.reason))
  })

  // 14. mainQuest no action and same as current -> rejected
  check('mainQuest no-op rejected', () => {
    const s1: any = JSON.parse(JSON.stringify(s0))
    s1.mainQuest = '追寻旧宝'
    const res = validateProposedStateChanges(s1, { mainQuest: '追寻旧宝' }, '修炼')
    return !!(res.rejected && res.rejected.mainQuest && /主线无变化/.test(res.rejected.mainQuest.reason))
  })

  // 15. affinity unknown NPC numeric accepted
  check('affinity unknown name accepted', () => {
    const res = validateProposedStateChanges(s0, { affinity: { '陌生人': 7 } }, '交谈 陌生人')
    return !!(res.accepted && (res.accepted.affinity as any)['陌生人'] === 7)
  })

  // 16. bag non-numeric rejected
  check('bag non-numeric rejected', () => {
    const res = validateProposedStateChanges(s0, { bag: { '聚气丹': '多' } }, '盒')
    return !!(res.rejected && res.rejected['bag.聚气丹'] && /需为数字/.test(res.rejected['bag.聚气丹'].reason))
  })

  // 17. bag large positive accepted
  check('bag large positive accepted', () => {
    const res = validateProposedStateChanges(s0, { bag: { '灵药': 20 } }, '拾取 灵药')
    return !!(res.accepted && (res.accepted.bag as any)['灵药'] === 20)
  })

  // 18. stats non-numeric rejected
  check('stats non-numeric rejected', () => {
    const res = validateProposedStateChanges(s0, { stats: { 悟性: '强' } }, '修炼')
    return !!(res.rejected && res.rejected['stats.悟性'] && /需为数字/.test(res.rejected['stats.悟性'].reason))
  })

  // 19. stats fractional rounded
  check('stats fractional rounded', () => {
    const res = validateProposedStateChanges(s0, { stats: { 忍耐: 3.7 } }, '修炼')
    return !!(res.accepted && (res.accepted.stats as any).忍耐 === 4)
  })

  // 20. enlightenment non-numeric rejected
  check('enlightenment non-numeric rejected', () => {
    const res = validateProposedStateChanges(s0, { enlightenment: { 剑道: '多' } }, '修炼')
    return !!(res.rejected && res.rejected['enlightenment.剑道'] && /需为数字/.test(res.rejected['enlightenment.剑道'].reason))
  })

  // 21. technique non-numeric rejected
  check('technique non-numeric rejected', () => {
    const res = validateProposedStateChanges(s0, { technique: { 炼丹: '高' } }, '修炼')
    return !!(res.rejected && res.rejected['technique.炼丹'] && /需为数字/.test(res.rejected['technique.炼丹'].reason))
  })

  // 22. status clear with empty array accepted
  check('status clear accepted', () => {
    const res = validateProposedStateChanges(s0, { status: [] }, '清除')
    return !!(res.accepted && Array.isArray(res.accepted.status) && (res.accepted.status as any).length === 0)
  })

  // 23. injury null accepted
  check('injury null clears accepted', () => {
    const res = validateProposedStateChanges(s0, { injury: null }, '疗伤')
    return !!(res.accepted && res.accepted.injury === null)
  })

  // 24. affinity float rounded
  check('affinity float rounded', () => {
    const res = validateProposedStateChanges(s0, { affinity: { '顾清玄': 3.9 } }, '交谈 顾清玄')
    return !!(res.accepted && (res.accepted.affinity as any)['顾清玄'] === 4)
  })

  // 25. combined accepted/rejected
  check('combined accepted and rejected keys', () => {
    const payload = { location: '南疆·赤炎', bag: { '聚气丹': '多' }, affinity: { '顾清玄': 2 } }
    const res = validateProposedStateChanges(s0, payload, '游历 南疆·赤炎')
    return !!(res.accepted && res.accepted.location === '南疆·赤炎' && res.accepted.affinity && res.rejected && res.rejected['bag.聚气丹'])
  })

  // 26. mood invalid rejected
  check('mood invalid rejected', () => {
    const res = validateProposedStateChanges(s0, { mood: '高' }, '交谈')
    return !!(res.rejected && res.rejected.mood && /需为数字/.test(res.rejected.mood.reason))
  })

  // 27. travel implied by 回到 accepted
  check('travel implied by 回到 accepted', () => {
    const res = validateProposedStateChanges(s0, { location: '风陵渡口' }, '回到 风陵渡口')
    return !!(res.accepted && res.accepted.location === '风陵渡口')
  })

  // 28. mainQuest too long rejected
  check('mainQuest too long rejected', () => {
    const long = '寻找' + '遗迹'.repeat(30)
    const res = validateProposedStateChanges(s0, { mainQuest: long }, '寻找')
    return !!(res.rejected && res.rejected.mainQuest && /过长/.test(res.rejected.mainQuest.reason))
  })

  // 29. technique low passed through (增量语义；钳制在 applyDeltas)
  check('technique low passed through (增量语义)', () => {
    const res = validateProposedStateChanges(s0, { technique: { 炼丹: 0 } }, '练')
    return !!(res.accepted && (res.accepted.technique as any).炼丹 === 0)
  })

  // 30. enlightenment high passed through (增量语义；钳制在 applyDeltas)
  check('enlightenment high passed through (增量语义)', () => {
    const res = validateProposedStateChanges(s0, { enlightenment: { 剑道: 15 } }, '练')
    return !!(res.accepted && (res.accepted.enlightenment as any).剑道 === 15)
  })

  // 31. stats edge values accepted
  check('stats edge values accepted', () => {
    const res = validateProposedStateChanges(s0, { stats: { 资质: 1, 遁速: 20 } }, '修炼')
    return !!(res.accepted && (res.accepted.stats as any).资质 === 1 && (res.accepted.stats as any).遁速 === 20)
  })

  // 32. applyDeltas 侧钳制：超额增量封顶（钳制从 validate 移到 applyDeltas）
  check('applyDeltas 超额属性增量封顶 20', () => {
    const res = applyDeltas(s0, { stats: { 悟性: 30 } })
    return res.state.player.stats.wuxing === 20
  })

  // 33. applyDeltas 侧钳制：负好感不越界（0 下限）
  check('applyDeltas 负好感钳制到 0', () => {
    const s1 = { ...s0, relationships: { 'gu-qingxuan': 3 } }
    const res = applyDeltas(s1, { affinity: { '顾清玄': -5 } })
    return (res.state.relationships['gu-qingxuan'] ?? 0) === 0
  })

  console.log(`\nSummary: passed ${passed}/${total} (exitCode=${process.exitCode || 0})`)
}

main().catch((e) => { console.error(e); process.exit(2) })
