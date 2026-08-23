/** 极限验证：50 条历史时弹窗滚动、最后卡片完整可见、每卡高度正常 */
import { chromium } from 'playwright'

const REAL_KEY = process.env.DS_KEY ?? ''
const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

let pass = 0, fail = 0
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${d}`) } }

const ctx = await b.newContext({ viewport: { width: 1280, height: 700 } })
const p = await ctx.newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: '叙事引擎设置', exact: true }).click()
await p.waitForTimeout(400)
await p.locator('input[type="password"]').fill(REAL_KEY)
await p.getByRole('button', { name: '保存', exact: true }).click()
await p.waitForTimeout(500)
// 注入 50 条历史（现场会话直接写 localStorage）
await p.evaluate(() => {
  const mk = (i) => ({
    id: i,
    time: `入道元年·${(i % 12) + 1}月`,
    action: `行动 ${i}`,
    narrative: `这是第 ${i} 条历史叙事内容，讲述修士在第 ${i} 个月里的经历与际遇，字数应当足够让卡片拥有正常高度，避免卡片过矮或显示不全。`.repeat(2),
    options: [
      { text: `选项甲-${i}`, tag: '平和' },
      { text: `选项乙-${i}`, tag: '机缘' },
      { text: `选项丙-${i}`, tag: '风险' },
      { text: `选项丁-${i}`, tag: '情缘' },
    ],
    scene: 'qingyu',
    engine: 'llm',
  })
  const log = Array.from({ length: 50 }, (_, i) => mk(i + 1))
  const base = {
    version: 1, turn: 50,
    player: { daoName: '测试', name: '测试', gender: '男', age: 20, originId: 'farmer', realm: '炼气', stage: '初期', sect: '散修', spiritRootId: 'tian', physiqueId: 'xiantian-dao', appearance: '清秀', daoPathId: 'wendao', talentIds: [], stats: { zizhi: 10, wuxing: 10, shenshi: 10, dunsu: 10, daoxin: 10, xianyuan: 10 } },
    res: { hp: 100, hpMax: 100, mp: 80, mpMax: 80, cult: 50, cultMax: 100, lifespan: 100, lifespanMax: 100, spirit: 100, merit: 0, karma: 0, mood: 1.0, injury: null, statusEffects: [] },
    timeline: { year: 4, month: 3, calendarYear: 390 },
    bag: {}, gongfaIds: [], techniqueLevels: {}, enlightenment: {}, relationships: {}, daoPartner: null,
    cave: { level: 1, spiritConcentration: '普通', facilities: [] },
    sectInfo: { sect: '散修', rank: '散修', contribution: 0 },
    mainQuest: '', flags: { location: '东洲·青岳' }, log: [], lastSaveTurn: 0,
  }
  localStorage.setItem('wdcd.session', JSON.stringify({ state: base, log, pendingOptions: log[log.length - 1].options, scene: 'qingyu', savedAt: Date.now(), turn: 50 }))
})
await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(1200)

// 主界面当前卡应显示第 50 条
const mainText = (await p.locator('main article').textContent()) ?? ''
check('主界面当前卡为最新一条', mainText.includes('第 50 条历史叙事'))

// 打开历史弹窗
await p.getByRole('button', { name: /历史回合（\d+）/ }).click()
await p.waitForTimeout(500)
const before = await p.evaluate(() => {
  const modal = [...document.querySelectorAll('div.fixed')].find((d) => d.textContent?.includes('历史回合'))
  const sc = modal?.querySelector('.overflow-y-auto')
  const cards = modal ? [...modal.querySelectorAll('article')] : []
  const heights = cards.slice(0, 3).map((c) => Math.round(c.getBoundingClientRect().height))
  return {
    entries: cards.length,
    scrollable: sc ? sc.scrollHeight > sc.clientHeight : false,
    scrollH: sc ? sc.scrollHeight : 0,
    clientH: sc ? sc.clientHeight : 0,
    firstHeights: heights,
    lastCardText: cards[cards.length - 1]?.textContent?.slice(0, 30) ?? '',
  }
})
console.log(`50 条历史: 弹窗内卡片=${before.entries} | 可滚动=${before.scrollable} (${before.clientH}/${before.scrollH}) | 前三卡高=${before.firstHeights}`)
check('弹窗含全部 50 条', before.entries === 50)
check('内容超限且可滚动', before.scrollable === true)
check('卡片高度正常（>80px）', before.firstHeights.every((h) => h > 80), `${before.firstHeights}`)

// 滚动到底 → 最后一张卡（第 1 条，最旧）完整可见
await p.locator('div.fixed .overflow-y-auto').evaluate((el) => { el.scrollTop = el.scrollHeight })
await p.waitForTimeout(400)
const after = await p.evaluate(() => {
  const modal = [...document.querySelectorAll('div.fixed')].find((d) => d.textContent?.includes('历史回合'))
  const sc = modal?.querySelector('.overflow-y-auto')
  const lastCard = sc?.querySelector('article:last-of-type')?.getBoundingClientRect()
  const sb = sc?.getBoundingClientRect()
  const footer = modal?.querySelector('footer')?.getBoundingClientRect()
  return {
    lastCardBottomVisible: lastCard && sb ? lastCard.bottom <= sb.bottom + 1 && lastCard.bottom >= sb.top - 1 : false,
    lastCardText: sc?.querySelector('article:last-of-type')?.textContent?.slice(0, 20) ?? '',
    footerVisible: footer ? footer.bottom <= innerHeight : false,
    scrolledToBottom: sc ? Math.abs(sc.scrollTop + sc.clientHeight - sc.scrollHeight) < 4 : false,
  }
})
check('滚动到底后最新条（列表末尾）内容可见', after.lastCardBottomVisible === true)
check('关闭按钮可见', after.footerVisible === true)
check('确实滚到底', after.scrolledToBottom === true)
await p.screenshot({ path: '/tmp/hist-50.png' })
console.log(`\n${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail > 0 ? 1 : 0)
