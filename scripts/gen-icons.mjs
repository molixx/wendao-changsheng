import sharp from 'sharp'
import { readFileSync } from 'fs'

const svg = readFileSync('public/favicon.svg')
const sizes = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
]
for (const [dpi, size] of sizes) {
  const buf = await sharp(svg).resize(size, size).png().toBuffer()
  const dir = `android/app/src/main/res/mipmap-${dpi}`
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
    await sharp(buf).toFile(`${dir}/${name}`)
  }
  console.log(`生成 mipmap-${dpi} (${size}px) 完成`)
}
console.log('全部图标生成完成')
