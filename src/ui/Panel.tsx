import type { CSSProperties, ReactNode } from 'react'
import { SCENE_THEMES, type PanelVariant, type SceneThemeKey } from './theme'

interface PanelProps {
  theme?: SceneThemeKey
  variant?: PanelVariant
  title?: string
  subtitle?: string
  /** 底部指令行 */
  cmdline?: string
  children: ReactNode
  className?: string
}

/** 大面板：对应原文 \fcolorbox{主题色}{宣纸底}{...} */
export function Panel({ theme = 'qingyu', variant = 'normal', title, subtitle, cmdline, children, className = '' }: PanelProps) {
  const themeColor = SCENE_THEMES[theme].color
  const style: CSSProperties = { ['--theme-color' as string]: themeColor }
  return (
    <section className={`panel panel--${variant} ${className}`} style={style}>
      {title && (
        <header className="panel-title">
          {title}
          {subtitle && <span className="ml-2 font-normal text-sm opacity-90 tracking-normal">{subtitle}</span>}
        </header>
      )}
      <div className="px-4 py-3">{children}</div>
      {cmdline && (
        <footer className="px-4 pb-3">
          <hr className="gold-line" />
          <p className="cmdline">指令：{cmdline}</p>
        </footer>
      )}
    </section>
  )
}

/** 鎏金分隔线 */
export function GoldLine({ className = '' }: { className?: string }) {
  return <hr className={`gold-line ${className}`} />
}

/** 双段进度条 */
export function Bar({ value, max, color, width = '6em' }: { value: number; max: number; color?: string; width?: string }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <span className="bar" style={{ width, ['--bar-color' as string]: color ?? 'var(--val-cult)' }}>
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}

/** 五行色块 */
export function Chip({ text, color }: { text: string; color?: string }) {
  return <span className="chip" style={{ background: color ?? 'var(--theme-color)' }}>{text}</span>
}

/** 语义标签（AI 自由发挥；未知标签用中性样式） */
export function Tag({ text }: { text: string }) {
  const cls: Record<string, string> = { 平和: 'pinghe', 机缘: 'jiyuan', 风险: 'fengxian', 情缘: 'qingyuan', 魔道: 'modao' }
  const known = cls[text]
  return known ? <span className={`tag tag--${known}`}>{text}</span> : <span className="tag" style={{ background: '#8C8578' }}>{text}</span>
}
