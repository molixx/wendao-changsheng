/** 回合处理管线：玩家输入 → 动作路由（系统指令代码结算 / 自由行动 LLM）→ 新状态 + 剧情条目
 *  代码是数值的唯一权威；LLM 只负责自由行动叙事与选项。 */

import type { GameState } from '../state'
import type { NarratorSettings } from '../state'
import type { SceneThemeKey } from '../../ui/theme'
import { callNarrator, narrateSystem, sanitizeOptions, buildSystemPrompt, isOfflineError } from '../narrator/llm'
import { routeCommand, executeSystem, resolveOpening } from './actions'
import { advanceTime, fmtTimeShort } from './time'
import { WORLD_BIBLE } from '../data/worldview'

export interface LogEntry {
  id: number
  time: string
  narrative: string
  options: { text: string; tag?: string }[]
  scene?: SceneThemeKey
  deltas?: string[]
  /** 玩家本回合的输入（供 LLM 历史重建） */
  action?: string
  /** 处理引擎：llm=AI 演绎 / code=代码模板 / offline=离线兜底 */
  engine?: 'llm' | 'code' | 'offline'
}

export interface TurnInput {
  state: GameState
  action: string
  history: { role: 'user' | 'assistant'; content: string }[]
  /** 当前剧情流（事件快照需要写入事件前的剧情） */
  log?: LogEntry[]
}

export interface TurnOutput {
  state: GameState
  narrative: string
  options: { text: string; tag?: string }[]
  scene?: SceneThemeKey
  deltas?: string[]
  timePassedMonths: number
  engine: 'llm' | 'code' | 'offline'
}

let seq = 0
export function nextId(): number {
  return ++seq
}

/** 世界快照：压缩成 LLM 可读的上下文（对应原文「世界进度备忘录」） */
export function buildWorldSnapshot(state: GameState): string {
  const p = state.player
  const r = state.res
  const t = state.timeline
  return [
    `回合#${state.turn} 天玄历${t.calendarYear}年${t.month}月（入道${t.year}年）`,
    `道号${p.daoName}（${p.name}）· ${p.gender} · ${p.age}岁`,
    `境界 ${p.realm}·${p.stage} · ${p.sect} · 仙姿${p.appearance}`,
    `六维 资质${p.stats.zizhi} 悟性${p.stats.wuxing} 神识${p.stats.shenshi} 遁速${p.stats.dunsu} 道心${p.stats.daoxin} 仙缘${p.stats.xianyuan}`,
    `气血${r.hp}/${r.hpMax} 灵力${r.mp}/${r.mpMax} 修为${r.cult}/${r.cultMax} 寿元${r.lifespan}/${r.lifespanMax}`,
    `灵石${r.spirit} 功德${r.merit} 业力${r.karma}${r.injury ? ` 受伤:${r.injury}` : ''}`,
    `所在地 ${state.flags.location ?? '东洲·青岳'} · 时节${t.month}月 · 主线：${state.mainQuest || '无'}`,
    `功法：${state.gongfaIds.join('、') || '无'} 技艺：${Object.entries(state.techniqueLevels).map(([k, v]) => `${k}${v}`).join('、') || '无'}`,
    `关系：${Object.entries(state.relationships).map(([k, v]) => `${k}:${v}`).join('、') || '无'}`,
  ].join('\n')
}

/** deltas 白名单与标签 */
const DELTA_FIELDS = ['hp', 'mp', 'cult', 'spirit', 'merit', 'karma'] as const
const DELTA_LABELS: Record<string, string> = { hp: '气血', mp: '灵力', cult: '修为', spirit: '灵石', merit: '功德', karma: '业力' }

/** 校验并应用 LLM 的数值变更（白名单字段、钳制、上限封顶、不为负）；越界/非法忽略 */
export function applyDeltas(state: GameState, deltas?: Record<string, number>): { state: GameState; applied: string[] } {
  if (!deltas) return { state, applied: [] }
  const res = { ...state.res }
  const applied: string[] = []
  for (const f of DELTA_FIELDS) {
    const v = deltas[f]
    if (typeof v !== 'number' || !Number.isFinite(v) || v === 0) continue
    const before = res[f]
    let next = before + Math.round(v)
    if (f === 'hp' || f === 'mp') next = Math.max(0, Math.min(next, res[`${f}Max`] as number))
    else if (f === 'cult') next = Math.max(0, Math.min(next, res.cultMax))
    else next = Math.max(0, next)
    if (next !== before) {
      res[f] = next
      applied.push(`${DELTA_LABELS[f]} ${v > 0 ? '+' : ''}${v}`)
    }
  }
  return applied.length ? { state: { ...state, res }, applied } : { state, applied: [] }
}

/** 主入口：执行一个回合（LLM 失败即抛出，由调用方停留+重试，绝不生成替代内容） */
export async function resolveTurn(input: TurnInput, settings: NarratorSettings): Promise<TurnOutput> {
  const cmd = routeCommand(input.action)
  const useLlm = settings.useLlm && settings.apiKey.length > 0
  const isStoryResume = /回到主剧情|回到主线|继续剧情/.test(input.action)
  let isFree = cmd.kind === 'free'
  let narrative = ''
  let options: { text: string; tag?: string }[] = []
  let scene: SceneThemeKey | undefined
  let timePassedMonths = 1
  let deltas: string[] = []
  let engine: TurnOutput['engine'] = 'code'
  let nextState = input.state

  if (!isFree) {
    const sys = executeSystem(cmd, input.state, input.log)
    if (sys) {
      nextState = sys.state
      const codeNarrative = sys.narrative
      if (!useLlm) throw new Error('未配置叙事引擎：请到「叙事引擎设置」配置 API Key 后继续')
      const system = buildSystemPrompt(WORLD_BIBLE, buildWorldSnapshot(input.state))
      try {
        const narrated = await narrateSystem(settings, system, input.history, input.action, codeNarrative)
        narrative = narrated.narrative || codeNarrative
        options = sanitizeOptions(narrated.options)
        if (options.length === 0) options = sys.options
        engine = 'llm'
      } catch (e) {
        // 真断网 → 离线冻结（抛给调用方停留+重试）；AI 业务失败（空内容/超时/服务错误）→ 系统指令回退代码结算叙事（数值一致，不编剧情）
        if (isOfflineError(e)) throw e
        narrative = codeNarrative
        options = sys.options
        engine = 'code'
      }
      scene = sys.scene
      timePassedMonths = sys.timePassedMonths
      deltas = []
    } else {
      isFree = true
    }
  }

  if (isFree) {
    if (!useLlm) throw new Error('未配置叙事引擎：请到「叙事引擎设置」配置 API Key 后继续')
    const system = buildSystemPrompt(WORLD_BIBLE, buildWorldSnapshot(input.state))
    // 「回到主剧情」等指令：提示 AI 自然接续主线
    const llmAction = isStoryResume ? `${input.action}（你已处理完手头事务，请自然接续当前主线剧情，不要新开一条剧情线）` : input.action
    const result = await callNarrator(settings, system, input.history, llmAction)
    narrative = result.narrative
    options = sanitizeOptions(result.options)
    scene = result.scene as SceneThemeKey | undefined
    timePassedMonths = Math.max(1, Math.min(12, result.timePassedMonths ?? 1))
    const applied = applyDeltas(nextState, result.deltas)
    nextState = applied.state
    deltas = applied.applied
    engine = 'llm'
  }

  // 叙事兜底：任何路径都不允许空白叙事（否则会污染后续 LLM 历史）
  if (!narrative || !narrative.trim()) narrative = '天道静默不语，只是静静注视着你。'

  // 时间推进（代码权威；战斗回合不流逝时间）
  const newTimeline = advanceTime(input.state.timeline, timePassedMonths)
  // 每个回合固定提供「回到主剧情」入口（未在选项中时追加）
  if (!options.some((o) => o.text.includes('回到主剧情'))) {
    options = [...options, { text: '回到主剧情', tag: '平和' }]
  }
  const newState: GameState = {
    ...nextState,
    timeline: newTimeline,
    turn: nextState.turn + 1,
    log: [...nextState.log, fmtTimeShort(newTimeline)],
  }

  return {
    state: newState,
    narrative,
    options,
    scene,
    deltas,
    timePassedMonths,
    engine,
  }
}

/** 创角完成后的开局回合 */
export function openingTurn(state: GameState): { state: GameState; entry: Omit<LogEntry, 'id'> } {
  const { state: s, narrative, options, scene } = resolveOpening(state)
  return {
    state: { ...s, turn: 0, log: [...s.log, fmtTimeShort(s.timeline)] },
    entry: { time: fmtTimeShort(s.timeline), narrative, options, scene, engine: 'code' },
  }
}
