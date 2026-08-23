/** 背景图渲染验证：PNG 优先（不存在则测 SVG 兜底）
 *  检查：非透明占比（未空白）、天光主色（浅色）、墨色山体（下半部比天空暗）、色彩多样性 */

import { chromium } from 'playwright'

const NAMES = ['title', 'paper-mist', 'qingyu', 'xuanzi', 'zhusha', 'taofen', 'liujin', 'ziqi', 'tianqing', 'zhuqing']
const BASE = 'http://localhost:5173'

async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  let allOk = true

  for (const name of NAMES) {
    const r = await page.evaluate(async (n) => {
      const load = (src) => new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.onerror = () => res(null)
        img.src = src
      })
      let img = await load(`/bg/${n}.png`)
      const kind = img ? 'png' : 'svg'
      if (!img) img = await load(`/bg/${n}.svg`)
      if (!img) return { kind, error: true }
      const c = document.createElement('canvas')
      c.width = 160; c.height = 100
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, 160, 100)
      const data = ctx.getImageData(0, 0, 160, 100).data
      let opaque = 0, dark = 0, sumR = 0, sumG = 0, sumB = 0
      const colors = new Set()
      let topAvg = 0, botMin = 255
      const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 160; x++) {
          const i = (y * 160 + x) * 4
          const a = data[i + 3]
          if (a > 40) {
            opaque++
            sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]
            colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4))
            if (lum(i) < 195) dark++
            if (y < 40) topAvg += lum(i)
            if (y > 55 && lum(i) < botMin) botMin = lum(i)
          }
        }
      }
      topAvg = topAvg / (160 * 40)
      const px = 160 * 100
      return {
        kind,
        opaquePct: Math.round((opaque / px) * 100),
        darkPct: Math.round((dark / px) * 100),
        avg: [Math.round(sumR / opaque), Math.round(sumG / opaque), Math.round(sumB / opaque)],
        colorVariety: colors.size,
        skyDarker: botMin < topAvg - 22,
      }
    }, name)

    if (r.error) {
      allOk = false
      console.log(`❌ ${name.padEnd(11)} 文件缺失（png 与 svg 都不存在）`)
      continue
    }
    const ok = r.opaquePct > 60 && r.darkPct > 2 && r.skyDarker && r.colorVariety > 12
    if (!ok) allOk = false
    console.log(`${ok ? '✅' : '❌'} ${name.padEnd(11)} [${r.kind}] 不透明${r.opaquePct}% 淡墨${r.darkPct}% 山体${r.skyDarker ? '有' : '无'} 主色rgb(${r.avg}) 色种${r.colorVariety}`)
  }
  await browser.close()
  console.log(allOk ? '\n全部背景正常' : '\n存在异常背景')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => { console.error('VERIFY CRASH:', e); process.exit(2) })
