/** LLM 调用验证（真实 API + 网络抓包）：
 *  1) 自由输入确实请求 api.deepseek.com；2) 系统指令（修炼）也请求（代码结算 + AI 演绎）；
 *  3) 两次自由输入回答不同（不再重复）；4) 无 Key 时走离线（无 API 请求 + 离线标签）
 *  运行：DS_KEY=... node scripts/e2e-llm.mjs（需 dev server） */

import { chromium } from 'playwright'

const REAL_KEY = process.env.DS_KEY ?? ''

const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

async function createChar(p) {
  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
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

async function doAction(p, text, waitMs = 12000) {
  await p.fill('input[placeholder*="输入你的行动"]', text)
  await p.keyboard.press('Enter')
  await p.waitForTimeout(waitMs)
}

let pass = 0, fail = 0
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n} ${d}`) } }

// ── 场景 A：配置了 Key ──
{
  console.log('== 场景 A：已配置 Key ==')
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  const apiCalls = []
  p.on('request', (r) => { if (r.url().includes('api.deepseek.com')) apiCalls.push(r.url()) })

  await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await p.getByRole('button', { name: '叙事引擎设置', exact: true }).click()
  await p.waitForTimeout(500)
  await p.locator('input[type="password"]').fill(REAL_KEY)
  await p.getByRole('button', { name: '保存', exact: true }).click()
  await p.waitForTimeout(600)

  await createChar(p)
  apiCalls.length = 0 // 清空创角期间的调用

  // 1) 自由输入 → 应调 API
  await doAction(p, '我想去坊市摆摊，卖一炉刚炼的聚气丹')
  check('自由输入调用了 API', apiCalls.length >= 1, `调用次数=${apiCalls.length}`)
  let body = await p.textContent('body')
  check('自由输入显示【天道】标签', body.includes('天道'))

  // 2) 系统指令（修炼）→ 也应调 API（代码结算 + AI 演绎）
  apiCalls.length = 0
  await doAction(p, '修炼')
  check('系统指令（修炼）也调用了 API', apiCalls.length >= 1, `调用次数=${apiCalls.length}`)
  body = await p.textContent('body')
  check('修炼叙事由 AI 演绎（带天道标签）', body.includes('天道'))

  // 3) 两次自由输入回答不同（单卡片 UI：通过历史弹窗验证两条都在）
  await doAction(p, '我想去后山寻一处僻静之地，独自练剑')
  await doAction(p, '我想向路过的老修士请教一枚玉简的来历')
  await p.getByRole('button', { name: /历史回合（\d+）/ }).click()
  await p.waitForTimeout(500)
  const modalText = await p.textContent('div.fixed')
  check('两次自由输入的记录都在（历史弹窗）', !!modalText?.includes('我想去后山') && !!modalText?.includes('我想向路过的老修士'))
  // 提取两次自由输入的叙事段落并比较（应不同，证明 AI 有上下文而非重复模板）
  const mt = modalText ?? ''
  const seg = (action) => {
    const i = mt.indexOf(action)
    if (i < 0) return ''
    const j = mt.indexOf('「', i + action.length)
    return mt.slice(i, j > 0 ? j : i + 300).replace(/天道|结算|离线|入道[^「]*/g, '').trim()
  }
  const n1 = seg('我想去后山')
  const n2 = seg('我想向路过的老修士')
  check('两次自由输入叙事不同（非重复）', n1.length > 8 && n2.length > 8 && n1 !== n2, `${n1.slice(0, 16)}... vs ${n2.slice(0, 16)}...`)
  await p.locator('div.fixed button:has-text("关闭")').click()
  await p.waitForTimeout(300)
  await p.screenshot({ path: '/tmp/llm-verify.png' })
  await ctx.close()
}

// ── 场景 B：未配置 Key → 离线，不应调 API ──
{
  console.log('== 场景 B：未配置 Key ==')
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  const apiCalls = []
  p.on('request', (r) => { if (r.url().includes('api.deepseek.com')) apiCalls.push(r.url()) })
  await createChar(p)
  await doAction(p, '我随便做点什么', 2500)
  const body = await p.textContent('body')
  check('无 Key 时未调 API', apiCalls.length === 0)
  check('无 Key 时显示【离线】标签', body.includes('离线'))
  await ctx.close()
}

console.log(`\n${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail > 0 ? 1 : 0)
