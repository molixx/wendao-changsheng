/** 离线冻结验证：网络断 → 停留当前卡片 + 离线横幅；恢复网络后手动重试成功 */
import { chromium } from 'playwright'

const REAL_KEY = process.env.DS_KEY ?? ''
const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
let pass = 0
let fail = 0
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${d}`) } }

// 配置 Key 但指向不可达地址（模拟断网）
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: '叙事引擎设置', exact: true }).click()
await p.waitForTimeout(400)
await p.locator('input[type="password"]').fill(REAL_KEY)
await p.locator('input').nth(0).fill('http://127.0.0.1:1') // 不可达 baseUrl
await p.getByRole('button', { name: '保存', exact: true }).click()
await p.waitForTimeout(600)

await p.click('button:has-text("开始新游戏")')
await p.waitForTimeout(400)
const inputs = p.locator('input')
await inputs.nth(0).fill('清微')
await inputs.nth(1).fill('沈清微')
const nb = p.locator('button:has-text("下一步")')
await nb.click(); await p.waitForTimeout(200); await p.click('button:has-text("农家子")')
await nb.click(); await p.waitForTimeout(200); await p.click('button:has-text("问道飞升")')
await nb.click(); await p.waitForTimeout(200); await p.click('button:has-text("天灵根")'); await p.click('button:has-text("先天道体")')
await nb.click(); await p.waitForTimeout(200); await nb.click(); await p.waitForTimeout(200)
await p.click('button:has-text("踏入修仙界")')
await p.waitForTimeout(800)

const beforeCount = await p.locator('main article').count()
// 点选项/输入 → 网络失败 → 停留 + 离线横幅
await p.fill('input[placeholder*="输入你的行动"]', '修炼')
await p.keyboard.press('Enter')
await p.waitForTimeout(4000)
const body1 = (await p.textContent('body')) ?? ''
check('离线时显示「网络离线」横幅', body1.includes('网络离线'))
check('离线时回合未推进（卡片数不变）', (await p.locator('main article').count()) === beforeCount)
check('离线时出现重试按钮', body1.includes('重试'))
await p.screenshot({ path: '/tmp/offline-banner.png' })

// 恢复网络（回标题 → 改回正确 baseUrl → 保存 → 继续游戏 → 重试）
await p.locator('button:has-text("标题")').first().click()
await p.waitForTimeout(600)
await p.getByRole('button', { name: '叙事引擎设置', exact: true }).click()
await p.waitForTimeout(400)
await p.locator('input').nth(0).fill('https://api.deepseek.com')
await p.getByRole('button', { name: '保存', exact: true }).click()
await p.waitForTimeout(600)
// 继续游戏（现场会话恢复）
await p.getByRole('button', { name: /继续游戏/ }).click().catch(() => {})
await p.waitForTimeout(1500)
// 恢复网络后，人为重试（重新提交刚才的行动）
const turnBefore = (await p.textContent('body'))?.match(/回合 #(\d+)/)?.[1] ?? '0'
const beforeCount2 = await p.locator('main article').count()
console.log('  [诊断] 恢复后卡片数:', beforeCount2, '回合#', turnBefore)
await p.fill('input[placeholder*="输入你的行动"]', '修炼')
await p.keyboard.press('Enter')
let broke = false
for (let i = 0; i < 25; i++) {
  await p.waitForTimeout(1000)
  const cur = (await p.locator('main article').textContent().catch(() => '')) ?? ''
  if (cur.includes('「修炼」') && cur.trim().length > 30) { broke = true; break }
  const retry = await p.locator('button:has-text("重试")').count()
  if (retry > 0) await p.locator('button:has-text("重试")').first().click()
}
const turnAfter = (await p.textContent('body'))?.match(/回合 #(\d+)/)?.[1] ?? '0'
console.log('  [诊断] 卡含修炼:', broke, '| 回合#', turnBefore, '→', turnAfter)
const body3 = (await p.textContent('body')) ?? ''
const advanced = broke && Number(turnAfter) > Number(turnBefore)
check('恢复网络并重试后回合推进', advanced)
await p.screenshot({ path: '/tmp/offline-recovered.png' })
console.log(`\n${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail > 0 ? 1 : 0)
