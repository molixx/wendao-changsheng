/** 常驻状态卡 —— 对应原文状态卡 19 必含字段（青玉主题） */

import type { GameState } from '../game/state'
import { fmtTimeShort, seasonOf } from '../game/engine/time'
import { Panel, Bar, Chip } from './Panel'
import { VALUE_COLORS, ELEMENT_COLORS } from './theme'

interface Props {
  game: GameState
  /** 灵根五行（如 ['木','火']） */
  spiritRootElements?: string[]
  /** 所在地 */
  location?: string
}

export function StatusCard({ game, spiritRootElements = [], location = '未知' }: Props) {
  const p = game.player
  const r = game.res
  const t = game.timeline
  const lifeColor = r.lifespan / r.lifespanMax < 0.2 ? VALUE_COLORS.hp : VALUE_COLORS.life
  const topAffinity = Object.entries(game.relationships).sort((a, b) => b[1] - a[1])[0]

  return (
    <Panel theme="qingyu" title={`状态卡 · ${fmtTimeShort(t)}`} className="text-sm">
      <div className="space-y-2">
        <p className="text-ink-strong">
          道号 <b>{p.daoName}</b> · {p.name} · {p.gender} · {p.age} 岁 · 寿元{' '}
          <Bar value={r.lifespan} max={r.lifespanMax} color={lifeColor} width="5em" />
          <span className="ml-1" style={{ color: lifeColor }}>
            {r.lifespan}/{r.lifespanMax}
          </span>
        </p>
        <p>
          境界 <b>{p.realm}·{p.stage}</b> · {p.sect}
        </p>
        <p>
          资质 {p.stats.zizhi} · 悟性 {p.stats.wuxing} · 神识 {p.stats.shenshi} · 遁速 {p.stats.dunsu} · 道心{' '}
          {p.stats.daoxin} · 仙缘 {p.stats.xianyuan}
        </p>
        <p>
          仙姿 {p.appearance} · 灵根{' '}
          {spiritRootElements.map((el) => (
            <Chip key={el} text={el} color={ELEMENT_COLORS[el] ?? 'var(--theme-color)'} />
          ))}
        </p>
        <p>
          气血 <Bar value={r.hp} max={r.hpMax} color={VALUE_COLORS.hp} width="4.5em" />
          <span className="ml-1" style={{ color: VALUE_COLORS.hp }}>{r.hp}/{r.hpMax}</span>
        </p>
        <p>
          灵力 <Bar value={r.mp} max={r.mpMax} color={VALUE_COLORS.mp} width="4.5em" />
          <span className="ml-1" style={{ color: VALUE_COLORS.mp }}>{r.mp}/{r.mpMax}</span>
        </p>
        <p>
          修为 <Bar value={r.cult} max={r.cultMax} color={VALUE_COLORS.cult} width="4.5em" />
          <span className="ml-1" style={{ color: VALUE_COLORS.cult }}>{r.cult}/{r.cultMax}</span>
        </p>
        <p>
          灵石 <b style={{ color: VALUE_COLORS.spirit }}>{r.spirit}</b> · 功德{' '}
          <b style={{ color: VALUE_COLORS.merit }}>{r.merit}</b> · 业力{' '}
          <b style={{ color: VALUE_COLORS.karma }}>{r.karma}</b>
        </p>
        {(r.injury || r.statusEffects.length > 0) && (
          <p className="danger-line">异常：{[r.injury, ...r.statusEffects].filter(Boolean).join('、')}</p>
        )}
        <hr className="gold-line" />
        <p className="text-muted">
          所在地 {location} · 时节 {seasonOf(t.month)}
        </p>
        {topAffinity && (
          <p className="text-muted">
            好感 · {topAffinity[0]} <b style={{ color: VALUE_COLORS.affinity }}>{topAffinity[1]}</b>
          </p>
        )}
        {game.mainQuest && <p className="text-muted">主线：{game.mainQuest}</p>}
        <p className="text-muted">回合 #{game.turn}</p>
      </div>
    </Panel>
  )
}
