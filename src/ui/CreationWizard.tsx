/** 创角向导 —— 分步：基础信息→出身→道途→灵根体质→六维天赋→确认（作者 wobuaixc@163.com · 致谢雾见川） */

import { useMemo, useState } from 'react'
import { useGame } from '../game/store'
import type { GameState, Stats } from '../game/state'
import { Panel, GoldLine, Chip } from './Panel'
import { ELEMENT_COLORS } from './theme'
import { GENDERS, ORIGINS, DAO_PATHS, SPIRIT_ROOTS, PHYSIQUES, TALENTS, STAT_LIMITS } from '../game/data/creation'
import { REALMS, LIFESPAN } from '../game/data/realms'
import { OPENING_SCRIPTS } from '../game/data/events'

const APPEARANCES = ['凡姿', '清秀', '出众', '超凡', '仙姿']
const STAT_KEYS: { key: keyof Stats; label: string }[] = [
  { key: 'zizhi', label: '资质' },
  { key: 'wuxing', label: '悟性' },
  { key: 'shenshi', label: '神识' },
  { key: 'dunsu', label: '遁速' },
  { key: 'daoxin', label: '道心' },
  { key: 'xianyuan', label: '仙缘' },
]

interface Draft {
  daoName: string
  name: string
  gender: string
  age: number
  appearance: string
  originId: string
  daoPathId: string
  spiritRootId: string
  physiqueId: string
  stats: Stats
  talentIds: string[]
  scriptId: string
}

const emptyDraft: Draft = {
  daoName: '',
  name: '',
  gender: '男',
  age: 16,
  appearance: '清秀',
  originId: '',
  daoPathId: '',
  spiritRootId: '',
  physiqueId: '',
  stats: { zizhi: 10, wuxing: 10, shenshi: 10, dunsu: 10, daoxin: 10, xianyuan: 10 },
  talentIds: [],
  scriptId: OPENING_SCRIPTS[0].id,
}

const STEPS = ['基础信息', '出身', '道途', '灵根·体质', '六维·天赋', '确认']

/** 中文键 → 六维键映射（出身/天赋 bonus 结算用） */
const STAT_BONUS_MAP: Record<string, keyof Stats> = {
  资质: 'zizhi', 悟性: 'wuxing', 神识: 'shenshi', 遁速: 'dunsu', 道心: 'daoxin', 仙缘: 'xianyuan',
}

/** 结算出身 + 天赋的属性加成（六维分配后结算，最终钳制 1~20） */
function applyBonuses(d: Draft): {
  stats: Stats
  hpMax: number
  mpMax: number
  spirit: number
  fame: number
  techniqueLevels: Record<string, number>
} {
  const stats: Stats = { ...d.stats }
  let hpMax = 100
  let mpMax = 80
  let spirit = 100
  let fame = 0
  const techniqueLevels: Record<string, number> = {}
  const bonusList = [
    ORIGINS.find((o) => o.id === d.originId)?.bonus,
    ...d.talentIds.map((id) => TALENTS.find((t) => t.id === id)?.bonus),
  ].filter((b): b is Record<string, number> => !!b)
  for (const b of bonusList) {
    for (const [k, v] of Object.entries(b)) {
      const statKey = STAT_BONUS_MAP[k]
      if (statKey) {
        stats[statKey] = Math.max(STAT_LIMITS.finalMin, Math.min(STAT_LIMITS.finalMax, stats[statKey] + v))
      } else if (k === '气血' || k === '气血上限') {
        hpMax = Math.max(20, hpMax + v)
      } else if (k === '灵力上限') {
        mpMax = Math.max(10, mpMax + v)
      } else if (k === '灵石') {
        spirit = Math.max(0, spirit + v)
      } else if (k === '炼丹') {
        // 统一存技艺 id（引擎用 'lian-dan'，修复中文键漂移）
        techniqueLevels['lian-dan'] = Math.max(1, v)
      } else if (k === '声望') {
        // 声望为身份型数值，存 flags.fame 由状态卡展示（原文 6.2 官宦子弟「声望+20」）
        fame = Math.max(0, fame + v)
      }
    }
  }
  return { stats, hpMax, mpMax, spirit, fame, techniqueLevels }
}

function buildInitialState(d: Draft): GameState {
  const realm = REALMS[0]
  const lifespanMax = LIFESPAN[realm.name] ?? 100
  const b = applyBonuses(d)
  return {
    version: 1,
    turn: 0,
    player: {
      daoName: d.daoName || '无名',
      name: d.name || d.daoName || '无名',
      gender: d.gender,
      age: Math.min(60, Math.max(16, Math.round(d.age) || 16)), // 年龄输入防 0/越界（min=16 只约束原生控件）
      originId: d.originId,
      realm: realm.name,
      stage: realm.stages[0],
      sect: '散修',
      spiritRootId: d.spiritRootId,
      physiqueId: d.physiqueId,
      appearance: d.appearance,
      daoPathId: d.daoPathId,
      talentIds: d.talentIds,
      stats: b.stats,
    },
    res: {
      hp: b.hpMax, hpMax: b.hpMax,
      mp: b.mpMax, mpMax: b.mpMax,
      cult: 0, cultMax: 100,
      lifespan: Math.max(0, lifespanMax - d.age), lifespanMax,
      spirit: b.spirit, merit: 0, karma: 0,
      mood: 1.0, injury: null, statusEffects: [],
    },
    timeline: { year: 1, month: 3, calendarYear: 387 },
    bag: {},
    gongfaIds: [],
    techniqueLevels: b.techniqueLevels,
    enlightenment: {},
    relationships: {},
    daoPartner: null,
    cave: { level: 1, spiritConcentration: '普通', facilities: [] },
    sectInfo: { sect: '散修', rank: '散修', contribution: 0 },
    mainQuest: '',
    flags: { openingScript: d.scriptId, location: '东洲·青岳', ...(b.fame > 0 ? { fame: b.fame } : {}) },
    log: [],
    lastSaveTurn: 0,
  }
}

export function CreationWizard() {
  const { startNewGame, toScreen } = useGame()
  const [step, setStep] = useState(0)
  const [d, setD] = useState<Draft>(emptyDraft)
  const [talentPoints, setTalentPoints] = useState(5)

  const usedStats = useMemo(() => STAT_KEYS.reduce((s, { key }) => s + d.stats[key], 0), [d.stats])
  const statRemain = STAT_LIMITS.total - usedStats

  const setStat = (key: keyof Stats, delta: number) => {
    const next = d.stats[key] + delta
    if (next < STAT_LIMITS.perMin || next > STAT_LIMITS.perMax) return
    if (usedStats + delta > STAT_LIMITS.total) return
    setD({ ...d, stats: { ...d.stats, [key]: next } })
  }

  const toggleTalent = (id: string, cost: number) => {
    const has = d.talentIds.includes(id)
    const nextPoints = has ? talentPoints + cost : talentPoints - cost
    if (!has && nextPoints < 0) return
    setTalentPoints(nextPoints)
    setD({
      ...d,
      talentIds: has ? d.talentIds.filter((t) => t !== id) : [...d.talentIds, id],
    })
  }

  const canNext =
    step !== 0 || (d.daoName.trim() && d.name.trim())
  const canConfirm =
    d.originId && d.daoPathId && d.spiritRootId && d.physiqueId &&
    statRemain >= 0 && talentPoints >= 0 && // 六维/天赋点未超支（双保险，UI 层已拦截）
    Number.isFinite(d.age) && d.age >= 16 && d.age <= 60 // 年龄输入清空得 0 时拦截

  const confirm = () => {
    startNewGame(buildInitialState(d))
  }

  const root = d.spiritRootId ? SPIRIT_ROOTS.find((r) => r.id === d.spiritRootId) : undefined

  // 确认页预览：六维分配 + 出身/天赋加成后的最终值
  const finalStats = useMemo(() => applyBonuses(d).stats, [d])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      {/* 步骤条 */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => i < step && setStep(i)}
            className={`rounded-full px-3 py-1 text-xs ${i === step ? 'bg-[color:var(--theme-color)] text-white' : 'border border-[color:var(--theme-color)]/40'}`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <Panel theme="qingyu" title="创角 · 基础信息" subtitle="作者：wobuaixc@163.com" cmdline="道号 · 姓名 · 性别 · 年龄 · 仙姿">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="cmdline">道号</span>
              <input value={d.daoName} onChange={(e) => setD({ ...d, daoName: e.target.value })} className="rounded-lg border border-[color:var(--theme-color)]/40 bg-white/95 px-3 py-2 outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="cmdline">姓名</span>
              <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="rounded-lg border border-[color:var(--theme-color)]/40 bg-white/95 px-3 py-2 outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="cmdline">性别（全性向，可自定义）</span>
              <select value={d.gender} onChange={(e) => setD({ ...d, gender: e.target.value })} className="rounded-lg border border-[color:var(--theme-color)]/40 bg-white/95 px-3 py-2 outline-none">
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
                <option value="不辨雌雄的妖">不辨雌雄的妖</option>
                <option value="只论道号不论男女">只论道号不论男女</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="cmdline">年龄（16~60）</span>
              <input type="number" min={16} max={60} value={d.age} onChange={(e) => setD({ ...d, age: Number(e.target.value) })} className="rounded-lg border border-[color:var(--theme-color)]/40 bg-white/95 px-3 py-2 outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="cmdline">仙姿</span>
              <div className="flex flex-wrap gap-2">
                {APPEARANCES.map((a) => (
                  <button key={a} onClick={() => setD({ ...d, appearance: a })} className={`rounded-lg border px-3 py-1.5 text-sm ${d.appearance === a ? 'border-[color:var(--theme-color)] bg-[color:var(--theme-color)] text-white' : 'border-[color:var(--theme-color)]/40'}`}>
                    {a}
                  </button>
                ))}
              </div>
            </label>
          </div>
        </Panel>
      )}

      {step === 1 && (
        <Panel theme="qingyu" title="出身" subtitle={`10 选 1 · 自带属性加成`} cmdline="出身决定初始根骨">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ORIGINS.map((o) => (
              <button
                key={o.id}
                onClick={() => setD({ ...d, originId: o.id })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${d.originId === o.id ? 'border-[color:var(--theme-color)] bg-[color:var(--theme-color)]/10' : 'border-[color:var(--theme-color)]/30 bg-white/90'}`}
              >
                <span className="font-bold">{o.name}</span>
                {o.rare && <Chip text="稀有" color="#A98FD9" />}
                <p className="text-xs text-muted mt-0.5">{o.desc}</p>
                {o.bonus && (
                  <p className="text-xs text-muted mt-1">{Object.entries(o.bonus).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(' ')}</p>
                )}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {step === 2 && (
        <Panel theme="qingyu" title="道途" subtitle="6 选 1 · 决定结局倾向与主线" cmdline="问道飞升 · 逍遥长生 · 快意恩仇 · 守护所爱 · 问鼎天下 · 随心所欲">
          <div className="flex flex-col gap-2">
            {DAO_PATHS.map((p) => (
              <button
                key={p.id}
                onClick={() => setD({ ...d, daoPathId: p.id })}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${d.daoPathId === p.id ? 'border-[color:var(--theme-color)] bg-[color:var(--theme-color)]/10' : 'border-[color:var(--theme-color)]/30 bg-white/90'}`}
              >
                <span className="font-bold">{p.name}</span>
                <p className="text-xs text-muted mt-0.5">{p.desc}</p>
                <p className="text-xs mt-1">主线：{p.hook}</p>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {step === 3 && (
        <>
          <Panel theme="qingyu" title="灵根" subtitle="决定修炼速度与功法适配" cmdline="天灵根 · 地灵根 · 真灵根 · 伪灵根 · 变异灵根">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SPIRIT_ROOTS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setD({ ...d, spiritRootId: r.id })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${d.spiritRootId === r.id ? 'border-[color:var(--theme-color)] bg-[color:var(--theme-color)]/10' : 'border-[color:var(--theme-color)]/30 bg-white/90'}`}
                >
                  <span className="font-bold">{r.name}</span>
                  <span className="ml-2">
                    {r.elements.map((el) => (
                      <Chip key={el} text={el} color={ELEMENT_COLORS[el]} />
                    ))}
                  </span>
                  <p className="text-xs text-muted mt-0.5">{r.desc} · 系数 {r.coefficient}</p>
                </button>
              ))}
            </div>
          </Panel>
          <div className="mt-4">
            <Panel theme="qingyu" title="体质" subtitle="先天被动">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PHYSIQUES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setD({ ...d, physiqueId: p.id })}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${d.physiqueId === p.id ? 'border-[color:var(--theme-color)] bg-[color:var(--theme-color)]/10' : 'border-[color:var(--theme-color)]/30 bg-white/90'}`}
                  >
                    <span className="font-bold">{p.name}</span>
                    <p className="text-xs text-muted mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <Panel theme="qingyu" title="六维分配" subtitle={`共 ${STAT_LIMITS.total} 点 · 单项 ${STAT_LIMITS.perMin}~${STAT_LIMITS.perMax} · 剩余 ${statRemain}`} cmdline="资质 · 悟性 · 神识 · 遁速 · 道心 · 仙缘">
            <div className="flex flex-col gap-2">
              {STAT_KEYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-12 text-sm">{label}</span>
                  <button onClick={() => setStat(key, -1)} disabled={d.stats[key] <= STAT_LIMITS.perMin} className="h-7 w-7 rounded bg-[color:var(--theme-color)]/20 disabled:opacity-30">−</button>
                  <span className="w-8 text-center font-bold">{d.stats[key]}</span>
                  <button onClick={() => setStat(key, 1)} disabled={d.stats[key] >= STAT_LIMITS.perMax || statRemain <= 0} className="h-7 w-7 rounded bg-[color:var(--theme-color)] text-white disabled:opacity-30">＋</button>
                  <div className="flex-1 h-1.5 rounded bg-[color:var(--bar-track)] overflow-hidden">
                    <div className="h-full bg-[color:var(--theme-color)]" style={{ width: `${(d.stats[key] / STAT_LIMITS.perMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <div className="mt-4">
            <Panel theme="qingyu" title="天赋" subtitle={`天赋点 ${talentPoints}（负面天赋可换点数）`}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TALENTS.map((t) => {
                  const active = d.talentIds.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTalent(t.id, t.cost)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${active ? 'border-[color:var(--theme-color)] bg-[color:var(--theme-color)]/10' : 'border-[color:var(--theme-color)]/30 bg-white/90'}`}
                    >
                      <span className="font-bold">{t.name}</span>
                      <span className="ml-1 text-xs text-muted">{t.cost > 0 ? `-${t.cost}点` : `+${-t.cost}点`}</span>
                      {t.negative && <Chip text="负面" color="#C4675C" />}
                      <p className="text-xs text-muted mt-0.5">{t.desc}</p>
                    </button>
                  )
                })}
              </div>
            </Panel>
          </div>
        </>
      )}

      {step === 5 && (
        <>
          <Panel theme="qingyu" title="开局剧本" subtitle="5 选 1 · 决定入世起点" cmdline="山村少年 · 坊市捡漏 · 青云试炼 · 锈剑残魂 · 大夏征兵">
            <div className="flex flex-col gap-2">
              {OPENING_SCRIPTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setD({ ...d, scriptId: s.id })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${d.scriptId === s.id ? 'border-[color:var(--theme-color)] bg-[color:var(--theme-color)]/10' : 'border-[color:var(--theme-color)]/30 bg-white/90'}`}
                >
                  <span className="font-bold">{s.name}</span>
                  <p className="text-xs text-muted mt-0.5">{s.desc}</p>
                </button>
              ))}
            </div>
          </Panel>
          <div className="mt-4">
            <Panel theme="qingyu" title="确认 · 问道长生" subtitle="作者：wobuaixc@163.com" cmdline="确认无误后踏入修仙界">
              <div className="space-y-1 text-sm">
                <p>道号 <b>{d.daoName}</b> · {d.name} · {d.gender} · {d.age} 岁 · 仙姿{d.appearance}</p>
                <p>出身 {ORIGINS.find((o) => o.id === d.originId)?.name} · 道途 {DAO_PATHS.find((p) => p.id === d.daoPathId)?.name}</p>
                <p>
                  灵根 {root?.name}{' '}
                  {root?.elements.map((el) => <Chip key={el} text={el} color={ELEMENT_COLORS[el]} />)}
                  {' '}· 体质 {PHYSIQUES.find((p) => p.id === d.physiqueId)?.name}
                </p>
                <p>六维 {STAT_KEYS.map(({ key, label }) => `${label}${finalStats[key]}`).join(' ')}</p>
                <p className="text-muted text-xs">（已含出身与天赋加成，单项上限 20）</p>
                <p>天赋 {d.talentIds.map((id) => TALENTS.find((t) => t.id === id)?.name).join('、') || '无'}</p>
                <p className="text-muted text-xs mt-2">初始境界：炼气·初期 · 寿元 {LIFESPAN[REALMS[0].name]} · 灵石 100 · 天玄历 387 年 · 春</p>
              </div>
              <GoldLine />
              <p className="cmdline text-xs">真实修仙界，会死，非龙傲天。此去道途，生死自负。</p>
              <p className="cmdline text-xs mt-1">致谢 · 雾见川（原作设定）</p>
            </Panel>
          </div>
        </>
      )}

      {/* 导航 */}
      <div className="mt-4 flex gap-3">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="rounded-xl border border-[color:var(--theme-color)]/40 px-4 py-2.5 text-sm">
            上一步
          </button>
        )}
        <div className="flex-1" />
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canNext && setStep(step + 1)}
            disabled={!canNext}
            className="rounded-xl bg-[color:var(--theme-color)] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            下一步
          </button>
        ) : (
          <button
            onClick={confirm}
            disabled={!canConfirm}
            className="rounded-xl bg-[color:var(--theme-color)] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            踏入修仙界
          </button>
        )}
        <button onClick={() => toScreen('title')} className="rounded-xl border border-[color:var(--ink-muted)]/40 px-4 py-2.5 text-sm">
          返回
        </button>
      </div>
    </div>
  )
}
