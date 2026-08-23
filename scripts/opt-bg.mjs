/** 背景图压缩：public/bg/*.png → *.webp（q80 / 宽 1920，原图保留）
 *  用法：node scripts/opt-bg.mjs */

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BGDIR = join(ROOT, 'public', 'bg')

const NAMES = ['title', 'paper-mist', 'qingyu', 'xuanzi', 'zhusha', 'taofen', 'liujin', 'ziqi', 'tianqing', 'zhuqing']

let totalIn = 0
let totalOut = 0
for (const n of NAMES) {
  const png = join(BGDIR, `${n}.png`)
  const webp = join(BGDIR, `${n}.webp`)
  const inMeta = await sharp(png).metadata()
  totalIn += inMeta.size ?? 0
  const out = await sharp(png)
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(webp)
  totalOut += out.size
  const pct = inMeta.size ? (100 - (out.size / inMeta.size) * 100).toFixed(0) : '?'
  console.log(`✓ ${n}.webp  ${(out.size / 1024 / 1024).toFixed(1)}MB（较原图 -${pct}%）`)
}
console.log(`\n合计：${(totalIn / 1024 / 1024).toFixed(0)}MB → ${(totalOut / 1024 / 1024).toFixed(0)}MB`)
