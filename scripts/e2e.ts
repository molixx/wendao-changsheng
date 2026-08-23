/** 端到端验证：用系统 Edge 走完整流程（标题页 → 创角向导 → 主界面 → 系统指令） */

import { chromium } from 'playwright'

const BASE = 'http://localhost:5173/'

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))

  let pass = 0
  let fail = 0
  const check = (name: string, cond: boolean) => {
    if (cond) { pass++; console.log(`  ✅ ${name}`) } else { fail++; console.log(`  ❌ ${name}`) }
  }

  // 1. 标题页
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const title = await page.textContent('body')
  check('标题页渲染（问道长生）', title?.includes('问道长生') ?? false)
  check('作者署名', title?.includes('wobuaixc@163.com') ?? false)
  check('致谢雾见川', title?.includes('雾见川') ?? false)
  check('开始新游戏按钮', title?.includes('开始新游戏') ?? false)
  check('设定图鉴按钮', title?.includes('设定图鉴') ?? false)
  await page.screenshot({ path: '/tmp/e2e-1-title.png' })

  // 2. 进入创角
  await page.click('text=开始新游戏')
  await page.waitForTimeout(600)
  let body = await page.textContent('body')
  check('创角第一步（基础信息）', body?.includes('基础信息') ?? false)
  const inputs = page.locator('input')
  await inputs.nth(0).fill('清微') // 道号
  await inputs.nth(1).fill('沈清微') // 姓名
  await page.screenshot({ path: '/tmp/e2e-2-create.png' })

  // 3. 逐步选择（出身→道途→灵根体质→六维天赋）
  const nextBtn = page.locator('button:has-text("下一步")')
  await nextBtn.click() // → 出身
  await page.waitForTimeout(300)
  await page.click('button:has-text("农家子")')
  await page.screenshot({ path: '/tmp/e2e-2b-origin.png' })
  await nextBtn.click() // → 道途
  await page.waitForTimeout(300)
  await page.click('button:has-text("问道飞升")')
  await nextBtn.click() // → 灵根·体质
  await page.waitForTimeout(300)
  await page.click('button:has-text("天灵根")')
  await page.click('button:has-text("先天道体")')
  await nextBtn.click() // → 六维·天赋
  await page.waitForTimeout(300)
  await nextBtn.click() // → 剧本·确认
  await page.waitForTimeout(300)
  body = await page.textContent('body')
  check('创角到达确认步（开局剧本）', body?.includes('开局剧本') ?? false)
  await page.screenshot({ path: '/tmp/e2e-3-confirm.png' })

  // 4. 踏入修仙界 → 主界面
  await page.click('button:has-text("踏入修仙界")')
  await page.waitForTimeout(800)
  body = await page.textContent('body')
  check('主界面渲染（状态卡）', body?.includes('状态卡') ?? false)
  check('开局剧本叙事', body?.includes('天玄历') ?? false)
  check('指令栏（修炼）', body?.includes('修炼') ?? false)
  check('剧情流选项', body?.includes('自由行动') ?? false)
  await page.screenshot({ path: '/tmp/e2e-4-play.png', fullPage: true })

  // 5. 修炼指令（离线模式，代码结算）
  await page.fill('input[placeholder*="输入你的行动"]', '修炼')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  body = await page.textContent('body')
  check('修炼回合叙事', (body?.includes('修为') ?? false) || (body?.includes('灵气') ?? false))
  check('回合推进', (body?.match(/回合 #\d+/) ?? []).length > 0)
  await page.screenshot({ path: '/tmp/e2e-5-cultivate.png', fullPage: true })

  // 6. 坊市
  await page.fill('input[placeholder*="输入你的行动"]', '坊市')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  body = await page.textContent('body')
  check('坊市面板', body?.includes('坊市') ?? false)

  // 7. 图鉴
  await page.click('button:has-text("标题")')
  await page.waitForTimeout(600)
  await page.click('button:has-text("设定图鉴")')
  await page.waitForTimeout(600)
  body = await page.textContent('body')
  check('图鉴渲染（势力）', body?.includes('势力') ?? false)
  check('图鉴数据（青云宗）', (body?.includes('青云宗') ?? false) || (body?.includes('天衍宗') ?? false))
  await page.screenshot({ path: '/tmp/e2e-6-lore.png', fullPage: true })

  console.log(`\n${pass} 通过 / ${fail} 失败`)
  if (errors.length) {
    console.log('--- 页面错误 ---')
    errors.slice(0, 8).forEach((e) => console.log(' ', e.slice(0, 200)))
  }
  await browser.close()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('E2E CRASH:', e)
  process.exit(2)
})
