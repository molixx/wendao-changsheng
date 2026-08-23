/** 设定图鉴 —— 势力 / 人物 / 境界 / 功法 / 地图 / 事件 / 结局 / 开局 */

import { useState } from 'react'
import { useGame } from '../game/store'
import { Panel, GoldLine } from './Panel'
import { SECTORS, NPCS, MAP_REGIONS, SECRET_REALMS } from '../game/data/world'
import { REALMS, LIFESPAN } from '../game/data/realms'
import { GONGFAS, TECHNIQUES, ENLIGHTENMENT_BRANCHES, FATE_CHANGES, PRICES, CAVE_FACILITIES, SECT_RANKS, COMBAT_COMMANDS, INJURIES } from '../game/data/systems'
import { RANDOM_EVENTS, QIYUS, MAJOR_EVENTS, OPENING_SCRIPTS, ENDINGS } from '../game/data/events'
import { ORIGINS, SPIRIT_ROOTS, PHYSIQUES, TALENTS, DAO_PATHS } from '../game/data/creation'

type Tab = '势力' | '人物' | '境界' | '功法' | '地图' | '事件' | '结局' | '开局'

const TABS: Tab[] = ['势力', '人物', '境界', '功法', '地图', '事件', '结局', '开局']

export function LoreBrowser() {
  const { toScreen } = useGame()
  const [tab, setTab] = useState<Tab>('势力')

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">设定图鉴</h1>
        <button onClick={() => toScreen('title')} className="rounded-lg border border-[color:var(--theme-color)]/40 px-3 py-1 text-sm">
          返回
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-sm ${tab === t ? 'bg-[color:var(--theme-color)] text-white' : 'border border-[color:var(--theme-color)]/40'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === '势力' && (
        <div className="flex flex-col gap-3">
          {SECTORS.map((s) => (
            <Panel key={s.id} theme={s.camp === '魔道' ? 'xuanzi' : s.camp === '正道' ? 'tianqing' : 'zhuqing'} title={`${s.name} · ${s.camp}`} className="text-sm">
              <p>{s.desc}</p>
            </Panel>
          ))}
        </div>
      )}

      {tab === '人物' && (
        <div className="flex flex-col gap-3">
          {NPCS.map((n) => (
            <Panel key={n.id} theme="taofen" title={`${n.name} · ${n.identity}`} subtitle={`${n.gender} · ${n.age}`} className="text-sm">
              <p className="mt-1">{n.traits.join('、')}</p>
              <p className="cmdline mt-1">喜好：{n.likes.join('、')}</p>
              <p className="cmdline mt-1">攻略要点：{n.tips}</p>
            </Panel>
          ))}
        </div>
      )}

      {tab === '境界' && (
        <div className="flex flex-col gap-3">
          {REALMS.map((r) => (
            <Panel key={r.name} theme="xuanzi" title={`${r.name} · 寿元 ${LIFESPAN[r.name] ?? '?'}`} className="text-sm">
              <p className="cmdline">{r.stages.join(' → ')}</p>
            </Panel>
          ))}
        </div>
      )}

      {tab === '功法' && (
        <div className="flex flex-col gap-3">
          <Panel theme="qingyu" title="技艺" subtitle="6 种 · 5 级" className="text-sm">
            <p>{TECHNIQUES.map((t) => `${t.name}（${t.levels[0]}→${t.levels[4]}）`).join('、')}</p>
          </Panel>
          <Panel theme="qingyu" title="功法与神通" subtitle="附录 A · 12 项" className="text-sm">
            <div className="flex flex-col gap-2">
              {GONGFAS.map((g) => (
                <div key={g.id} className="rounded-lg bg-white/90 px-3 py-2">
                  <b>[{g.grade}] {g.name}</b> <span className="cmdline text-xs">· {g.type}{g.element ? ` · ${g.element}` : ''}</span>
                  <p className="text-xs text-muted">{g.effect}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel theme="zhuqing" title="悟道分支" subtitle="9 支" className="text-sm">
            <p>{ENLIGHTENMENT_BRANCHES.join('、')}</p>
          </Panel>
          <Panel theme="xuanzi" title="逆天改命" subtitle="12 项" className="text-sm">
            <p>{FATE_CHANGES.join('、')}</p>
          </Panel>
        </div>
      )}

      {tab === '地图' && (
        <div className="flex flex-col gap-3">
          {MAP_REGIONS.map((m) => (
            <Panel key={m.id} theme={m.danger.includes('高') ? 'zhusha' : 'ziqi'} title={`${m.name} · ${m.danger}`} subtitle={`建议 ${m.suggested}`} className="text-sm">
              <p>{m.desc}</p>
              {m.places && <p className="cmdline mt-1">地点：{m.places.join('、')}</p>}
            </Panel>
          ))}
          <Panel theme="ziqi" title="秘境" subtitle="4 处" className="text-sm">
            <p>{SECRET_REALMS.map((s) => `${s.name}（${s.risk}）`).join('、')}</p>
          </Panel>
        </div>
      )}

      {tab === '事件' && (
        <div className="flex flex-col gap-3">
          <Panel theme="ziqi" title="随机事件" subtitle="每回合 1d100 · 20% 触发" className="text-sm">
            <p>{RANDOM_EVENTS.map((e) => `${e.name}：${e.desc}`).join('；')}</p>
          </Panel>
          <Panel theme="ziqi" title="经典奇遇" subtitle="6 种" className="text-sm">
            <p>{QIYUS.map((q) => `${q.name}：${q.desc}`).join('；')}</p>
          </Panel>
          <Panel theme="tianqing" title="修仙大事" className="text-sm">
            <p>{MAJOR_EVENTS.map((m) => `${m.name}（${m.cycle}）`).join('、')}</p>
          </Panel>
          <Panel theme="zhusha" title="受伤等级" subtitle="如实压属性" className="text-sm">
            <p>{INJURIES.map((i) => `${i.name}（${i.penalty}）`).join('、')}</p>
          </Panel>
        </div>
      )}

      {tab === '结局' && (
        <div className="flex flex-col gap-3">
          {ENDINGS.map((e) => (
            <Panel key={e.id} theme={e.type === '死亡' ? 'zhusha' : 'xuanzi'} title={`${e.name} · ${e.type}`} className="text-sm">
              <p>{e.desc}</p>
            </Panel>
          ))}
        </div>
      )}

      {tab === '开局' && (
        <div className="flex flex-col gap-3">
          {OPENING_SCRIPTS.map((s) => (
            <Panel key={s.id} theme="ziqi" title={s.name} className="text-sm">
              <p>{s.desc}</p>
              <GoldLine />
              <p className="cmdline">{s.start}</p>
            </Panel>
          ))}
        </div>
      )}

      {/* 底部补充 */}
      <div className="mt-6 flex flex-col gap-3">
        <Panel theme="liujin" title="坊市物价参考" className="text-sm">
          <p>{PRICES.join('；')}</p>
        </Panel>
        <Panel theme="tianqing" title="宗门阶级" subtitle="12 势力 · 阶级链" className="text-sm">
          <p>阶级：{SECT_RANKS.join(' → ')}</p>
        </Panel>
        <Panel theme="qingyu" title="洞府设施" className="text-sm">
          <p>{CAVE_FACILITIES.join('、')}</p>
        </Panel>
        <Panel theme="zhusha" title="战斗指令" subtitle="回合制" className="text-sm">
          <p>{COMBAT_COMMANDS.join('、')}</p>
        </Panel>
        <Panel theme="zhuqing" title="创角备查" className="text-sm">
          <p>出身：{ORIGINS.map((o) => o.name).join('、')}</p>
          <p className="mt-1">灵根：{SPIRIT_ROOTS.map((r) => r.name).join('、')}</p>
          <p className="mt-1">体质：{PHYSIQUES.map((p) => p.name).join('、')}</p>
          <p className="mt-1">天赋：{TALENTS.map((t) => t.name).join('、')}</p>
          <p className="mt-1">道途：{DAO_PATHS.map((p) => p.name).join('、')}</p>
        </Panel>
      </div>
    </div>
  )
}
