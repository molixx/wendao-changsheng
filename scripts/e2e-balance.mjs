import { chromium } from 'playwright'

const REAL_KEY = process.env.DS_KEY ?? ''
const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
let pass = 0, fail = 0
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${d}`) } }

await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.getByRole('button', { name: '叙事引擎设置', exact: true }).click()
await p.waitForTimeout(500)
await p.locator('input[type="password"]').fill(REAL_KEY)

// 1. 设置页查询余额
await p.getByRole('button', { name: '查询余额', exact: true }).click()
await p.waitForSelector('text=余额 ¥', { timeout: 45000 }).catch(() => {})
const body = await p.textContent('body')
const m = body.match(/余额 ¥([\d.]+)/)
check('设置页查询成功（¥xx.xx）', !!m, m ? m[1] : '无匹配')
check('显示赠送/充值拆分', body.includes('赠送') && body.includes('充值'))
check('显示币种', body.includes('CNY'))
console.log(`  余额: ¥${m?.[1]}`)

// 2. 保存 → 标题页徽标
await p.getByRole('button', { name: '保存', exact: true }).click()
await p.waitForTimeout(800)
const titleBody = await p.textContent('body')
check('标题页余额徽标显示', /¥[\d.]+/.test(titleBody))
await p.screenshot({ path: '/tmp/balance-badge.png' })

// 3. 点击徽标 → 详情
await p.locator('button:has-text("¥")').first().click()
await p.waitForTimeout(600)
const detail = await p.textContent('body')
check('详情面板：总余额/赠送/充值', detail.includes('总余额') || (detail.includes('赠送') && detail.includes('充值')))
check('详情面板：账户状态', detail.includes('账户状态'))
check('详情面板：刷新按钮', detail.includes('刷新余额'))
await p.screenshot({ path: '/tmp/balance-detail.png' })

console.log(`\n${pass} 通过 / ${fail} 失败`)
console.log('页面错误:', errs.length ? errs : '无')
await b.close()
process.exit(fail > 0 ? 1 : 0)
