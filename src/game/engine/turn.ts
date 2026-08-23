/** 回合处理管线：玩家输入 → 动作路由（系统指令代码结算 / 自由行动 LLM）→ 新状态 + 剧情条目
 *  代码是数值的唯一权威；LLM 只负责自由行动叙事与选项。 */

import type { GameState } from '../state'
import type { NarratorSettings } from '../state'
import type { SceneThemeKey } from '../../ui/theme'
import { callNarrator, buildSystemPrompt } from '../narrator/llm'
import { resolveOffline } from './offline'
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
}

export interface TurnInput {
  state: GameState
  action: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

export interface TurnOutput {
  state: GameState
  narrative: string
  options: { text: string; tag?: string }[]
  scene?: SceneThemeKey
  deltas?: string[]
  timePassedMonths: number
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

/** 主入口：执行一个回合 */
export async function resolveTurn(input: TurnInput, settings: NarratorSettings): Promise<TurnOutput> {
  const cmd = routeCommand(input.action)
  let isFree = cmd.kind === 'free'
  let narrative = ''
  let options: { text: string; tag?: string }[] = []
  let scene: SceneThemeKey | undefined
  let timePassedMonths = 1
  let deltas: string[] = []
  let nextState = input.state

  if (!isFree) {
    const sys = executeSystem(cmd, input.state)
    if (sys) {
      nextState = sys.state
      narrative = sys.narrative
      options = sys.options
      scene = sys.scene
      timePassedMonths = sys.timePassedMonths
      deltas = []
    } else {
      isFree = true
    }
  }

  if (isFree) {
    const useLlm = settings.useLlm && settings.apiKey.length > 0
    if (useLlm) {
      try {
        const system = buildSystemPrompt(WORLD_BIBLE, buildWorldSnapshot(input.state))
        const result = await callNarrator(settings, system, input.history, input.action)
        narrative = result.narrative
        options = result.options
        scene = result.scene as SceneThemeKey | undefined
        timePassedMonths = Math.max(1, Math.min(12, result.timePassedMonths ?? 1))
        deltas = result.deltas ? Object.entries(result.deltas).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`) : []
      } catch (e) {
        const offline = resolveOffline(input.state, input.action)
        narrative = `【叙事引擎降级为离线模式】${offline.narrative}`
        options = offline.options
        scene = offline.scene
        timePassedMonths = offline.timePassedMonths
        deltas = []
      }
    } else {
      const offline = resolveOffline(input.state, input.action)
      narrative = offline.narrative
      options = offline.options
      scene = offline.scene
      timePassedMonths = offline.timePassedMonths
      deltas = []
    }
  }

  // 时间推进（代码权威；战斗回合不流逝时间）
  const newTimeline = advanceTime(input.state.timeline, timePassedMonths)
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
  }
}

/** 创角完成后的开局回合 */
export function openingTurn(state: GameState): { state: GameState; entry: Omit<LogEntry, 'id'> } {
  const { state: s, narrative, options, scene } = resolveOpening(state)
  return {
    state: { ...s, turn: 0, log: [...s.log, fmtTimeShort(s.timeline)] },
    entry: { time: fmtTimeShort(s.timeline), narrative, options, scene },
  }
}
