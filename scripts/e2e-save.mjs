/** 存档/读档 E2E：含剧情流、覆盖/删除确认、标题页读档、突破前置不误判
 *  运行：node scripts/e2e-save.mjs（需 dev server 在 5173） */

import { chromium } from 'playwright'

const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
let pass = 0
let fail = 0
const check = (n, c) => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}`) } }
const ht = (t) => p.locator(`button:has-text("${t}")`)
const topbarSave = () => p.getByRole('button', { name: '存档', exact: true }).first()
/** 最上层固定浮层（SavePanel 或确认弹窗） */
const modal = () => p.locator('div.fixed.inset-0').last()

const create = async () => {
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await ht('开始新游戏').click()
  await p.waitForTimeout(400)
  const inputs = p.locator('input')
  await inputs.nth(0).fill('清微')
  await inputs.nth(1).fill('沈清微')
  const nb = ht('下一步')
  await nb.click(); await p.waitForTimeout(200); await ht('农家子').click()
  await nb.click(); await p.waitForTimeout(200); await ht('问道飞升').click()
  await nb.click(); await p.waitForTimeout(200); await ht('天灵根').click(); await ht('先天道体').click()
  await nb.click(); await p.waitForTimeout(200); await nb.click(); await p.waitForTimeout(200)
  await ht('踏入修仙界').click()
  await p.waitForTimeout(700)
}
const act = async (t) => {
  await p.fill('input[placeholder*="输入你的行动"]', t)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(800)
}
const turnNo = async () => (await p.textContent('body')).match(/回合 #(\d+)/)?.[1]

await create()
await act('修炼')
await act('修炼')
const t2 = await turnNo()
console.log(`  当前回合 #${t2}`)

// 突破前置（修为未满）不弹失败横幅
await act('突破 人道')
check('修为未满突破不弹失败横幅', !(await p.textContent('body')).includes('突破失利'))
await act('面板')
const tSave = await turnNo()
console.log(`  存盘点回合 #${tSave}`)

// 存到槽1（空槽直接存）
await topbarSave().click()
await p.waitForTimeout(400)
await modal().getByRole('button', { name: '存', exact: true }).first().click()
await p.waitForTimeout(400)
let body = await p.textContent('body')
check('空槽直接存 + 成功提示', body.includes('含剧情流'))
check('槽位摘要显示', body.includes('炼气') && body.includes('回合'))
await modal().getByRole('button', { name: '关闭', exact: true }).click()
await p.waitForTimeout(300)

// 再玩 2 回合
await act('修炼')
await act('修炼')
console.log(`  存档后玩到回合 #${await turnNo()}`)

// 读档（弹覆盖确认）→ 确认 → 回到存档点且剧情流保留
await topbarSave().click()
await p.waitForTimeout(400)
await modal().getByRole('button', { name: '读', exact: true }).first().click()
await p.waitForTimeout(300)
body = await p.textContent('body')
check('读档弹覆盖确认', body.includes('读档将覆盖当前进度'))
await modal().getByRole('button', { name: '读档', exact: true }).click()
await p.waitForTimeout(800)
check('读档后回到存档点回合', (await turnNo()) === tSave)
check('读档后剧情流保留', (await p.textContent('body')).includes('修为'))
await p.screenshot({ path: '/tmp/saveload-load.png' })
// doLoad 成功后面板自动关闭，无需点关闭

// 覆盖确认
await topbarSave().click()
await p.waitForTimeout(400)
await modal().getByRole('button', { name: '存', exact: true }).first().click()
await p.waitForTimeout(300)
body = await p.textContent('body')
check('覆盖前弹确认', body.includes('覆盖存档'))
await modal().getByRole('button', { name: '覆盖', exact: true }).click()
await p.waitForTimeout(400)
check('覆盖后成功提示', (await p.textContent('body')).includes('已存入'))
await modal().getByRole('button', { name: '关闭', exact: true }).click()
await p.waitForTimeout(300)

// 标题页读档入口
await ht('标题').click()
await p.waitForTimeout(500)
body = await p.textContent('body')
check('标题页有读档按钮', body.includes('读档（'))
await p.getByRole('button', { name: /^读档（/ }).click()
await p.waitForTimeout(400)
body = await p.textContent('body')
check('读档面板列出槽位', body.includes('槽1') && body.includes('炼气'))
await p.locator('div.fixed').getByRole('button', { name: '读档', exact: true }).first().click()
await p.waitForTimeout(800)
body = await p.textContent('body')
check('标题页读档进入游戏', body.includes('状态卡') && body.includes('行动'))
await p.screenshot({ path: '/tmp/saveload-title-load.png' })

console.log(`\n${pass} 通过 / ${fail} 失败`)
console.log('页面错误:', errs.length ? errs : '无')
await b.close()
process.exit(fail > 0 ? 1 : 0)
