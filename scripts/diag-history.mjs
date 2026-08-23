/** 历史弹窗布局验证：多屏幕高度下，关闭按钮始终可见、滚动区自适应 */
import { chromium } from 'playwright'

const REAL_KEY = process.env.DS_KEY ?? ''
const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const sizes = [
  [1280, 900],
  [1280, 600], // 矮窗口
  [390, 844], // 手机
]

async function buildGame(p) {
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: '叙事引擎设置', exact: true }).click()
  await p.waitForTimeout(400)
  await p.locator('input[type="password"]').fill(REAL_KEY)
  await p.getByRole('button', { name: '保存', exact: true }).click()
  await p.waitForTimeout(500)
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
  await p.waitForTimeout(700)
}

let pass = 0
let fail = 0
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${d}`) } }

for (const [w, h] of sizes) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } })
  const p = await ctx.newPage()
  await buildGame(p)
  for (const a of ['修炼', '我想去坊市逛逛', '游历', '我想去后山练剑']) {
    await p.fill('input[placeholder*="输入你的行动"]', a)
    await p.keyboard.press('Enter')
    await p.waitForTimeout(11000)
  }
  await p.getByRole('button', { name: /历史回合（\d+）/ }).click()
  await p.waitForTimeout(500)
  const geo = await p.evaluate(() => {
    const modal = [...document.querySelectorAll('div.fixed')].find((d) => d.textContent?.includes('历史回合'))
    if (!modal) return null
    const section = modal.querySelector('section')
    const scrollDiv = modal.querySelector('.overflow-y-auto')
    const footer = modal.querySelector('footer')
    const s = section?.getBoundingClientRect()
    const sd = scrollDiv?.getBoundingClientRect()
    const f = footer?.getBoundingClientRect()
    return {
      sectionTop: s ? Math.round(s.top) : null,
      sectionBottom: s ? Math.round(s.bottom) : null,
      footerBottom: f ? Math.round(f.bottom) : null,
      footerVisible: f ? f.bottom <= innerHeight && f.top >= 0 : false,
      scrollable: sd ? sd.scrollHeight > sd.clientHeight : null,
      scrollH: sd ? sd.scrollHeight : null,
      clientH: sd ? sd.clientHeight : null,
      entries: modal.querySelectorAll('article').length,
    }
  })
  console.log(`== 视口 ${w}×${h} ==`)
  console.log(`  弹窗 ${geo?.sectionTop}~${geo?.sectionBottom} | 底部按钮 ${geo?.footerBottom}（视口高 ${h}）| 滚动区 ${geo?.clientH}/${geo?.scrollH}${geo?.scrollable ? '（可滚动）' : ''} | 条目 ${geo?.entries}`)
  check(`[${w}×${h}] 关闭按钮完整可见`, geo?.footerVisible === true && (geo?.footerBottom ?? 0) <= h - 4)
  check(`[${w}×${h}] 弹窗未超出视口`, (geo?.sectionTop ?? 0) >= 0 && (geo?.sectionBottom ?? 0) <= h)
  await ctx.close()
}

console.log(`\n${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail > 0 ? 1 : 0)
