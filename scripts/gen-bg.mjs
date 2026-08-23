/**
 * 《问道长生》水墨修仙风背景图生成器
 * 生成 SVG 到 public/bg/（Vite 静态目录），供游戏各场景作为背景。
 * 风格：宣纸白底 + 主题色天光 + 水墨远山（分层模糊）+ 流云 + 场景元素（圆月/仙鹤/闪电/花瓣/宝塔/竹林…）。
 * 用法：node scripts/gen-bg.mjs
 * 所有随机均用固定种子 → 可复现；改参数后重跑即可重新生成。
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'bg')
mkdirSync(OUT, { recursive: true })

/* ── 工具 ─────────────────────────────────────────────── */

/** 可复现伪随机（mulberry32） */
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 1600
const H = 1000

/** 锯齿山脊路径：从底边向上随机起伏，配合模糊滤镜形成水墨远山 */
function ridge(rng, baseY, amp, pts = 7) {
  let d = `M 0 ${H} L 0 ${baseY}`
  for (let i = 0; i <= pts; i++) {
    const x = (W * i) / pts
    const y = baseY - rng() * amp
    d += ` L ${x} ${y}`
  }
  d += ` L ${W} ${H} Z`
  return d
}

/** 山体层（实色墨 + 组透明度 + 模糊 → 水墨远山层次） */
function mountainLayer(rng, { baseY, amp, ink, opacity, blur }) {
  const p = ridge(rng, baseY, amp)
  return `<g opacity="${opacity}" filter="url(#${blur})"><path d="${p}" fill="${ink}"/></g>`
}

/** 流云：一组模糊白椭圆 */
function cloud(rng, { cx, cy, w, h, opacity = 0.5, blur = 'blurM' }) {
  const n = 3 + Math.floor(rng() * 2)
  let g = `<g opacity="${opacity}" filter="url(#${blur})">`
  for (let i = 0; i < n; i++) {
    const x = cx + (rng() - 0.5) * w * 0.9
    const y = cy + (rng() - 0.5) * h * 0.6
    const rw = w * (0.5 + rng() * 0.5)
    const rh = h * (0.4 + rng() * 0.3)
    g += `<ellipse cx="${x}" cy="${y}" rx="${rw}" ry="${rh}" fill="#ffffff"/>`
  }
  return g + '</g>'
}

/** 圆月 */
function moon({ cx, cy, r, color = '#F4EAD2' }) {
  return `<circle cx="${cx}" cy="${cy}" r="${r * 1.9}" fill="${color}" opacity="0.25" filter="url(#blurL)"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.95"/>`
}

/** 水墨飞鹤（极简两笔 + 长颈） */
function crane(sx, sy, s, ink) {
  return `<g transform="translate(${sx} ${sy}) scale(${s})" opacity="0.85">
  <path d="M0,0 Q9,-10 20,-3 Q11,-7 15,-15" stroke="${ink}" fill="none" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M0,0 Q8,-7 13,-13" stroke="${ink}" fill="none" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M-1,2 Q-3,9 -2,16" stroke="${ink}" fill="none" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M1,3 Q4,10 3,17" stroke="${ink}" fill="none" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M20,-3 Q24,-10 30,-12" stroke="${ink}" fill="none" stroke-width="1.6" stroke-linecap="round"/>
</g>`
}

/** 桃花瓣（情缘） */
function petal(rng, ink, accent) {
  const x = rng() * W
  const y = 120 + rng() * (H - 240)
  const s = 3 + rng() * 4
  const rot = rng() * 360
  const c = rng() > 0.5 ? accent : ink
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><ellipse rx="${s}" ry="${s * 0.7}" fill="${c}" opacity="0.75"/></g>`
}

/** 宝塔剪影（坊市/宗门） */
function pagoda(x, baseY, s, ink) {
  const roof = (w, h) => `M ${-w} ${h} Q 0 ${h - 10} ${w} ${h} L ${w * 0.8} ${h + 5} L ${-w * 0.8} ${h + 5} Z`
  let g = `<g transform="translate(${x} ${baseY}) scale(${s})" opacity="0.7" fill="${ink}">
  <rect x="-7" y="-52" width="14" height="24"/>
  <path d="${roof(16, -30)}"/>
  <rect x="-9" y="-34" width="18" height="26"/>
  <path d="${roof(21, -10)}"/>
  <rect x="-11" y="-16" width="22" height="26"/>
  <path d="${roof(26, 10)}"/>
  <rect x="-13" y="2" width="26" height="18"/>
  <path d="${roof(30, 20)}"/>
  <rect x="-4" y="-64" width="8" height="10"/>
  <circle cx="0" cy="-68" r="3"/>
</g>`
  return g
}

/** 闪电（渡劫） */
function bolt(x, y, s) {
  return `<g transform="translate(${x} ${y}) scale(${s})" opacity="0.9">
  <polyline points="0,0 10,-14 4,-16 20,-44 12,-46 34,-84" fill="none" stroke="#FFF3D6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <polyline points="0,0 10,-14 4,-16 20,-44 12,-46 34,-84" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</g>`
}

/** 余烬（战斗） */
function ember(rng, accent) {
  const x = rng() * W
  const y = H * 0.35 + rng() * H * 0.5
  const r = 1.5 + rng() * 3
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${accent}" opacity="${0.4 + rng() * 0.5}"/>`
}

/** 竹林（悟道） */
function bamboo(x, groundY, s, ink, accent) {
  const stalk = `<rect x="-4" y="${-170}" width="8" height="170" fill="${ink}" opacity="0.8"/>
  <rect x="-12" y="-96" width="24" height="3" fill="${ink}" opacity="0.6"/>
  <rect x="-10" y="-48" width="20" height="3" fill="${ink}" opacity="0.6"/>`
  const leaf = (lx, ly, len, rot) =>
    `<g transform="translate(${lx} ${ly}) rotate(${rot})"><path d="M0,0 Q${len * 0.5},-${len * 0.28} ${len},0 Q${len * 0.5},${len * 0.18} 0,0 Z" fill="${accent}" opacity="0.85"/></g>`
  return `<g transform="translate(${x} ${groundY}) scale(${s})">
  ${stalk}
  ${leaf(-6, -165, 30, -30)}
  ${leaf(8, -160, 34, 25)}
  ${leaf(-4, -140, 26, -40)}
  ${leaf(10, -138, 28, 35)}
</g>`
}

/* ── 场景定义 ─────────────────────────────────────────── */

/** 每场景：天空渐变色、墨色、主题强调色、前景元素函数 */
const SCENES = {
  title: {
    sky: ['#F0E8D8', '#DFD3BA'],
    ink: '#57503F',
    accent: '#C9A45C',
    seed: 11,
    build: (rng, ink, accent) => `
  ${moon({ cx: 1210, cy: 210, r: 74 })}
  ${mountainLayer(rng, { baseY: 620, amp: 200, ink, opacity: 0.14, blur: 'blurL', id: 'g1' })}
  ${mountainLayer(rng, { baseY: 700, amp: 260, ink, opacity: 0.22, blur: 'blurM', id: 'g2' })}
  ${cloud(rng, { cx: 320, cy: 470, w: 420, h: 120, opacity: 0.55 })}
  ${mountainLayer(rng, { baseY: 800, amp: 300, ink, opacity: 0.38, blur: 'blurS', id: 'g3' })}
  ${cloud(rng, { cx: 1150, cy: 620, w: 480, h: 110, opacity: 0.5 })}
  ${crane(420, 300, 1.6, ink)}
  ${crane(520, 240, 1.15, ink)}
  ${crane(340, 380, 0.8, ink)}
  <rect x="0" y="860" width="${W}" height="140" fill="#FBF8F1" opacity="0.92"/>
`,
  },
  'paper-mist': {
    sky: ['#F7F3EA', '#EDE5D4'],
    ink: '#7D7568',
    accent: '#C9A45C',
    seed: 21,
    build: (rng, ink, accent) => `
  ${mountainLayer(rng, { baseY: 640, amp: 180, ink, opacity: 0.16, blur: 'blurL' })}
  ${mountainLayer(rng, { baseY: 760, amp: 240, ink, opacity: 0.24, blur: 'blurM' })}
  ${cloud(rng, { cx: 500, cy: 430, w: 460, h: 120, opacity: 0.6 })}
  ${cloud(rng, { cx: 1200, cy: 600, w: 420, h: 100, opacity: 0.55 })}
  <rect x="0" y="880" width="${W}" height="120" fill="#FBF8F1" opacity="0.95"/>
`,
  },
  qingyu: {
    sky: ['#EAF2EE', '#D7E6DF'],
    ink: '#4E6E63',
    accent: '#6FA698',
    seed: 31,
    build: (rng, ink, accent) => `
  ${mountainLayer(rng, { baseY: 600, amp: 190, ink, opacity: 0.12, blur: 'blurL', id: 'g1' })}
  ${mountainLayer(rng, { baseY: 690, amp: 250, ink, opacity: 0.2, blur: 'blurM', id: 'g2' })}
  ${cloud(rng, { cx: 400, cy: 400, w: 400, h: 110, opacity: 0.55 })}
  ${mountainLayer(rng, { baseY: 800, amp: 300, ink, opacity: 0.34, blur: 'blurS', id: 'g3' })}
  ${cloud(rng, { cx: 1180, cy: 560, w: 460, h: 120, opacity: 0.5 })}
  ${crane(760, 280, 1.3, ink)}
  ${crane(880, 220, 0.9, ink)}
  <rect x="0" y="872" width="${W}" height="128" fill="#FBF8F1" opacity="0.94"/>
`,
  },
  xuanzi: {
    sky: ['#EFEAF4', '#DDD3EA'],
    ink: '#5A4F70',
    accent: '#8B6FA8',
    seed: 41,
    build: (rng, ink, accent) => `
  ${mountainLayer(rng, { baseY: 620, amp: 200, ink, opacity: 0.14, blur: 'blurL', id: 'g1' })}
  ${bolt(1130, 330, 1.25)}
  ${mountainLayer(rng, { baseY: 720, amp: 260, ink, opacity: 0.24, blur: 'blurM', id: 'g2' })}
  <g opacity="0.5" filter="url(#blurM)"><ellipse cx="1150" cy="360" rx="300" ry="90" fill="#ffffff"/></g>
  ${mountainLayer(rng, { baseY: 830, amp: 300, ink, opacity: 0.4, blur: 'blurS', id: 'g3' })}
  ${bolt(470, 300, 0.8)}
  <rect x="0" y="876" width="${W}" height="124" fill="#FBF8F1" opacity="0.94"/>
`,
  },
  zhusha: {
    sky: ['#F7E9E3', '#EBD3C7'],
    ink: '#7A4A40',
    accent: '#C4675C',
    seed: 51,
    build: (rng, ink, accent) => `
  ${mountainLayer(rng, { baseY: 600, amp: 190, ink, opacity: 0.16, blur: 'blurL', id: 'g1' })}
  ${mountainLayer(rng, { baseY: 710, amp: 250, ink, opacity: 0.28, blur: 'blurM', id: 'g2' })}
  ${mountainLayer(rng, { baseY: 820, amp: 300, ink, opacity: 0.46, blur: 'blurS', id: 'g3' })}
  ${Array.from({ length: 26 }, () => ember(rng, accent)).join('')}
  ${cloud(rng, { cx: 320, cy: 420, w: 380, h: 90, opacity: 0.35 })}
  <rect x="0" y="878" width="${W}" height="122" fill="#FBF8F1" opacity="0.95"/>
`,
  },
  taofen: {
    sky: ['#FAEEF1', '#F1DCE2'],
    ink: '#8A5A66',
    accent: '#D88FA5',
    seed: 61,
    build: (rng, ink, accent) => `
  ${moon({ cx: 400, cy: 220, r: 60, color: '#F9E3EA' })}
  <g opacity="0.5" filter="url(#blurM)"><ellipse cx="400" cy="220" rx="220" ry="120" fill="#FDEFF4"/></g>
  ${mountainLayer(rng, { baseY: 640, amp: 180, ink, opacity: 0.12, blur: 'blurL', id: 'g1' })}
  ${mountainLayer(rng, { baseY: 740, amp: 240, ink, opacity: 0.2, blur: 'blurM', id: 'g2' })}
  ${Array.from({ length: 22 }, () => petal(rng, ink, accent)).join('')}
  ${crane(1000, 260, 1.2, ink)}
  ${crane(1100, 300, 0.9, ink)}
  ${cloud(rng, { cx: 1000, cy: 520, w: 420, h: 100, opacity: 0.5 })}
  <rect x="0" y="880" width="${W}" height="120" fill="#FBF8F1" opacity="0.95"/>
`,
  },
  liujin: {
    sky: ['#F8F0DD', '#EBDCB9'],
    ink: '#6E5F3E',
    accent: '#C9A45C',
    seed: 71,
    build: (rng, ink, accent) => `
  ${moon({ cx: 1180, cy: 200, r: 66, color: '#F6E7BC' })}
  ${mountainLayer(rng, { baseY: 640, amp: 200, ink, opacity: 0.14, blur: 'blurL', id: 'g1' })}
  ${mountainLayer(rng, { baseY: 730, amp: 250, ink, opacity: 0.22, blur: 'blurM', id: 'g2' })}
  ${cloud(rng, { cx: 360, cy: 420, w: 400, h: 100, opacity: 0.5 })}
  ${pagoda(760, 850, 2.4, ink)}
  ${pagoda(420, 880, 1.5, ink)}
  ${pagoda(1150, 890, 1.2, ink)}
  ${crane(300, 250, 1.1, ink)}
  <rect x="0" y="880" width="${W}" height="120" fill="#FBF8F1" opacity="0.95"/>
`,
  },
  ziqi: {
    sky: ['#F2EDF8', '#E3D8EF'],
    ink: '#5C4A78',
    accent: '#A98FD9',
    seed: 81,
    build: (rng, ink, accent) => `
  <circle cx="820" cy="470" r="260" fill="${accent}" opacity="0.3" filter="url(#blurL)"/>
  <circle cx="820" cy="470" r="130" fill="#E8DCFF" opacity="0.5" filter="url(#blurM)"/>
  <circle cx="820" cy="470" r="46" fill="#F6F0FF" opacity="0.9"/>
  ${mountainLayer(rng, { baseY: 620, amp: 200, ink, opacity: 0.14, blur: 'blurL', id: 'g1' })}
  ${mountainLayer(rng, { baseY: 730, amp: 260, ink, opacity: 0.24, blur: 'blurM', id: 'g2' })}
  ${cloud(rng, { cx: 300, cy: 460, w: 380, h: 100, opacity: 0.5 })}
  ${crane(1120, 260, 1.3, ink)}
  <rect x="0" y="876" width="${W}" height="124" fill="#FBF8F1" opacity="0.94"/>
`,
  },
  tianqing: {
    sky: ['#EAF1F7', '#D5E4F0'],
    ink: '#46607A',
    accent: '#7FA8C9',
    seed: 91,
    build: (rng, ink, accent) => `
  ${cloud(rng, { cx: 300, cy: 240, w: 400, h: 90, opacity: 0.6 })}
  ${cloud(rng, { cx: 1300, cy: 320, w: 360, h: 80, opacity: 0.55 })}
  ${mountainLayer(rng, { baseY: 600, amp: 200, ink, opacity: 0.12, blur: 'blurL', id: 'g1' })}
  ${mountainLayer(rng, { baseY: 700, amp: 250, ink, opacity: 0.2, blur: 'blurM', id: 'g2' })}
  ${pagoda(820, 700, 3.0, ink)}
  ${mountainLayer(rng, { baseY: 820, amp: 280, ink, opacity: 0.34, blur: 'blurS', id: 'g3' })}
  ${crane(560, 300, 1.2, ink)}
  ${crane(1050, 260, 1.0, ink)}
  <rect x="0" y="878" width="${W}" height="122" fill="#FBF8F1" opacity="0.94"/>
`,
  },
  zhuqing: {
    sky: ['#ECF3ED', '#D6E6DA'],
    ink: '#47604F',
    accent: '#8FBFA0',
    seed: 101,
    build: (rng, ink, accent) => `
  ${moon({ cx: 1250, cy: 240, r: 54, color: '#EAF6EC' })}
  ${mountainLayer(rng, { baseY: 660, amp: 190, ink, opacity: 0.16, blur: 'blurL' })}
  ${mountainLayer(rng, { baseY: 780, amp: 250, ink, opacity: 0.26, blur: 'blurM' })}
  ${cloud(rng, { cx: 400, cy: 430, w: 420, h: 100, opacity: 0.5 })}
  ${bamboo(330, 880, 1.15, ink, accent)}
  ${bamboo(520, 920, 1.5, ink, accent)}
  ${bamboo(700, 860, 0.9, ink, accent)}
  ${bamboo(1050, 900, 1.3, ink, accent)}
  ${bamboo(1240, 940, 1.7, ink, accent)}
  ${cloud(rng, { cx: 1150, cy: 560, w: 400, h: 90, opacity: 0.45 })}
  <rect x="0" y="884" width="${W}" height="116" fill="#FBF8F1" opacity="0.95"/>
`,
  },
}

/* ── 生成 ─────────────────────────────────────────────── */

const DEFS = `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${'$SKY0'}"/>
    <stop offset="100%" stop-color="${'$SKY1'}"/>
  </linearGradient>
  <filter id="blurS"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="blurM"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="blurL"><feGaussianBlur stdDeviation="28"/></filter>
  <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
`

for (const [name, sc] of Object.entries(SCENES)) {
  const rng = mulberry32(sc.seed)
  const body = sc.build(rng, sc.ink, sc.accent)
  const defs = DEFS.replaceAll('$SKY0', sc.sky[0]).replaceAll('$SKY1', sc.sky[1])
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${body}
</svg>
`
  writeFileSync(join(OUT, `${name}.svg`), svg)
  console.log(`✓ public/bg/${name}.svg (${svg.length} bytes)`)
}

console.log(`\n完成：${Object.keys(SCENES).length} 张背景已生成到 public/bg/`)
