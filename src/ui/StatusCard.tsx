/** 常驻状态卡 —— 全量展示游戏设定（基础/属性/资源/修行/身份/人际/背包/状态） */

import type { GameState } from '../game/state'
import { fmtTimeShort, seasonOf } from '../game/engine/time'
import { Panel, Bar, Chip, GoldLine } from './Panel'
import { VALUE_COLORS, ELEMENT_COLORS } from './theme'
import { GONGFAS, TECHNIQUES, FATE_CHANGES, INJURIES } from '../game/data/systems'
import { ORIGINS, TALENTS, PHYSIQUES, DAO_PATHS, SPIRIT_ROOTS } from '../game/data/creation'
import { NPCS } from '../game/data/world'
import { itemNameOf } from '../game/engine/economy'

interface Props {
  game: GameState
  spiritRootElements?: string[]
  location?: string
}

const MOOD_LABEL: Record<number, string> = { 1.2: '极佳', 1: '平稳', 0.5: '低落' }

export function StatusCard({ game, spiritRootElements = [], location = '未知' }: Props) {
  const p = game.player
  const r = game.res
  const t = game.timeline
  const lifeColor = r.lifespan / Math.max(1, r.lifespanMax) < 0.2 ? VALUE_COLORS.hp : VALUE_COLORS.life

  const origin = ORIGINS.find((o) => o.id === p.originId)
  const path = DAO_PATHS.find((d) => d.id === p.daoPathId)
  const root = SPIRIT_ROOTS.find((x) => x.id === p.spiritRootId)
  const physique = PHYSIQUES.find((q) => q.id === p.physiqueId)
  const talents = p.talentIds.map((id) => TALENTS.find((x) => x.id === id)?.name).filter(Boolean)
  const gongfas = game.gongfaIds
    .map((id) => {
      const g = GONGFAS.find((x) => x.id === id)
      return g ? `${g.name}（${g.grade}阶）` : id
    })
    .filter(Boolean)
  const techniques = Object.entries(game.techniqueLevels)
    .map(([id, lv]) => `${TECHNIQUES.find((x) => x.id === id)?.name ?? id}${lv}级`)
    .join('、')
  const enlightenments = Object.entries(game.enlightenment)
    .map(([k, lv]) => `${k.replace(/（.*）/, '')}${lv}级`)
    .join('、')
  const bag = Object.entries(game.bag)
    .map(([k, v]) => `${itemNameOf(k)}×${v}`)
    .join('、')
  const rels = Object.entries(game.relationships)
    .map(([k, v]) => `${NPCS.find((n) => n.id === k)?.name ?? k} ${v}`)
    .join('、')

  // 动态状态（flags）
  const fate = FATE_CHANGES.filter((f) => typeof game.flags[`fate:${f}`] === 'number').map((f) => f.replace(/（.*）/, ''))
  const dyn: string[] = []
  if (typeof game.flags.breakCooldown === 'number' && game.flags.breakCooldown > 0) dyn.push(`突破冷却（${game.flags.breakCooldown}月）`)
  if (game.flags.hiddenInjury) dyn.push('暗伤（部分属性永久压制）')
  if (game.flags.modao) dyn.push('入魔')
  if (game.flags.spiritBeast) dyn.push('灵兽认主')
  if (game.flags.secretRealmOpen) dyn.push('秘境现世')
  if (game.flags.combat) dyn.push('战斗中')
  if (r.injury) dyn.push(INJURIES.find((i) => i.id === r.injury)?.name ?? r.injury)
  dyn.push(...r.statusEffects)

  // 战斗派生属性（与战斗模块口径一致）
  const atk = p.stats.zizhi * 2 + p.stats.wuxing
  const def = p.stats.daoxin + Math.floor(r.hpMax / 25)
  const spd = p.stats.dunsu * 2 + Math.floor(p.stats.xianyuan / 2)

  const row = (label: string, value: string | undefined) =>
    value ? (
      <p className="flex gap-2">
        <span className="cmdline shrink-0">{label}</span>
        <span>{value}</span>
      </p>
    ) : null

  return (
    <Panel theme="qingyu" title={`状态卡 · ${fmtTimeShort(t)}`} className="text-sm">
      <div className="space-y-1.5">
        {/* 基础 */}
        <p className="text-ink-strong">
          <b>{p.daoName}</b>（{p.name}）· {p.gender} · {p.age} 岁 · 寿元{' '}
          <Bar value={r.lifespan} max={r.lifespanMax} color={lifeColor} width="4.5em" />
          <span className="ml-1" style={{ color: lifeColor }}>{r.lifespan}/{r.lifespanMax}</span>
        </p>
        <p>
          <b>{p.realm}·{p.stage}</b> · {p.sect}
        </p>
        <p>
          仙姿 {p.appearance} · 灵根 {spiritRootElements.map((el) => <Chip key={el} text={el} color={ELEMENT_COLORS[el] ?? 'var(--theme-color)'} />)}
          {root && <span className="cmdline">（{root.name}）</span>}
        </p>
        {row('体质', physique?.name && `${physique.name}（${physique.desc}）`)}
        {row('出身', origin?.name)}
        {row('道途', path?.name)}
        {talents.length > 0 && row('天赋', talents.join('、'))}

        <GoldLine />

        {/* 属性 */}
        <p>
          资质 {p.stats.zizhi} · 悟性 {p.stats.wuxing} · 神识 {p.stats.shenshi} · 遁速 {p.stats.dunsu} · 道心 {p.stats.daoxin} · 仙缘{' '}
          {p.stats.xianyuan}
        </p>
        {row('心境', MOOD_LABEL[r.mood] ?? String(r.mood))}

        <GoldLine />

        {/* 资源 */}
        <p>
          气血 <Bar value={r.hp} max={r.hpMax} color={VALUE_COLORS.hp} width="4em" />
          <span className="ml-1" style={{ color: VALUE_COLORS.hp }}>{r.hp}/{r.hpMax}</span>
        </p>
        <p>
          灵力 <Bar value={r.mp} max={r.mpMax} color={VALUE_COLORS.mp} width="4em" />
          <span className="ml-1" style={{ color: VALUE_COLORS.mp }}>{r.mp}/{r.mpMax}</span>
        </p>
        <p>
          修为 <Bar value={r.cult} max={r.cultMax} color={VALUE_COLORS.cult} width="4em" />
          <span className="ml-1" style={{ color: VALUE_COLORS.cult }}>{r.cult}/{r.cultMax}</span>
        </p>
        <p>
          灵石 <b style={{ color: VALUE_COLORS.spirit }}>{r.spirit}</b> · 功德 <b style={{ color: VALUE_COLORS.merit }}>{r.merit}</b> · 业力{' '}
          <b style={{ color: VALUE_COLORS.karma }}>{r.karma}</b>
        </p>

        <GoldLine />

        {/* 修行 */}
        {gongfas.length > 0 && row('功法', gongfas.join('、'))}
        {row('技艺', techniques || undefined)}
        {row('悟道', enlightenments || undefined)}
        {fate.length > 0 && row('逆天改命', fate.join('、'))}

        {/* 身份 */}
        {row('洞府', game.cave ? `灵气${game.cave.spiritConcentration}（Lv.${game.cave.level}）${game.cave.facilities.length ? `· ${game.cave.facilities.join('、')}` : ''}` : undefined)}
        {game.sectInfo.sect !== '散修' && row('宗门', `${game.sectInfo.sect} · ${game.sectInfo.rank} · 贡献 ${game.sectInfo.contribution}`)}
        {row('战力', `攻击 ${atk} · 防御 ${def} · 遁速 ${spd}`)}

        {/* 人际 */}
        {game.daoPartner && row('道侣', game.daoPartner)}
        {row('好感', rels || undefined)}

        <GoldLine />

        {/* 背包 */}
        {row('背包', bag || undefined)}

        {/* 动态状态（情缘好感/受伤/入魔/灵兽/秘境等实时刷新） */}
        {dyn.length > 0 && (
          <p className="danger-line">异常：{dyn.join('、')}</p>
        )}
        <p className="cmdline">所在地 {location} · 时节 {seasonOf(t.month)}</p>
        {game.mainQuest && <p className="cmdline">主线：{game.mainQuest}</p>}
        <p className="cmdline">回合 #{game.turn}</p>
      </div>
    </Panel>
  )
}
