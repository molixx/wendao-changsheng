/** 离线叙事引擎（降级库）—— 无 key / 断网 / LLM 失败时处理自由行动
 *  系统指令（修炼/坊市/战斗等）由 actions.ts 代码结算，此模块只兜底自由输入 */

import type { GameState } from '../state'
import { fmtTimeShort } from './time'
import type { SceneThemeKey } from '../../ui/theme'
import { RANDOM_EVENTS, QIYUS } from '../data/events'
import { NPCS } from '../data/world'

export interface OfflineResult {
  narrative: string
  options: { text: string; tag?: string }[]
  scene?: SceneThemeKey
  timePassedMonths: number
}

const FALLBACK_OPTIONS = [
  { text: '修炼', tag: '平和' },
  { text: '外出游历', tag: '机缘' },
  { text: '坊市', tag: '平和' },
  { text: '自由行动…', tag: '平和' },
]

/** 自由行动的离线兜底：按关键词给出有限但合理的演绎 */
export function resolveOffline(state: GameState, action: string): OfflineResult {
  const t = fmtTimeShort(state.timeline)
  const p = state.player
  const a = action.trim()

  // 情缘相关
  const npc = NPCS.find((n) => a.includes(n.name))
  if (npc) {
    return {
      narrative: `（${t}）你与${npc.name}相处片刻。他/她似乎对你印象不错。好感系统接入后，可在此增进情谊。`,
      options: FALLBACK_OPTIONS,
      scene: 'taofen',
      timePassedMonths: 1,
    }
  }

  // 随机事件 / 奇遇占位
  if (/探秘|寻宝|探索.*洞|闯.*秘境/.test(a)) {
    const qy = QIYUS[Math.floor(Math.random() * QIYUS.length)]
    return {
      narrative: `（${t}）${qy.desc}（离线模式：奇遇数值接入中）`,
      options: FALLBACK_OPTIONS,
      scene: 'ziqi',
      timePassedMonths: 1,
    }
  }
  if (/打听|闲逛|夜探|潜入/.test(a)) {
    const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)]
    return {
      narrative: `（${t}）你四处走动，${ev.name}。${ev.desc}（离线模式：事件结算接入中）`,
      options: FALLBACK_OPTIONS,
      scene: 'ziqi',
      timePassedMonths: 1,
    }
  }

  // 通用兜底
  return {
    narrative: `（${t}）${p.daoName}，你「${a.slice(0, 40)}」。离线叙事引擎尚在演化此等行径——配置 DeepSeek API Key 后即可获得完整自由演绎。`,
    options: FALLBACK_OPTIONS,
    scene: 'qingyu',
    timePassedMonths: 1,
  }
}
