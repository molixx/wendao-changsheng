/** 现场会话存档 —— 每回合自动持久化完整现场（剧情流/选项/场景），刷新后可静默恢复
 *  独立键 wdcd.session，不占 3 个手动存档槽 */

import type { GameState } from './state'
import type { LogEntry } from './engine/turn'
import type { SceneThemeKey } from '../ui/theme'

export interface Session {
  state: GameState
  log: LogEntry[]
  pendingOptions: { text: string; tag?: string }[]
  scene?: SceneThemeKey
  savedAt: number
  turn: number
}

export const SESSION_KEY = 'wdcd.session'
/** 剧情流保留上限（现场会话与手动存档共用；200 回合 ≈ 数百 KB，localStorage 容量内尽量多留历史） */
export const SESSION_LOG_LIMIT = 200
/** 现场会话的剧情流上限（每回合全量重写，比手动存档更轻量，避免频繁大 JSON 写入卡顿） */
export const SESSION_SESSION_LIMIT = 80

export function saveSession(s: Session): void {
  // 先按会话上限写入；配额不足（旧浏览器/超大叙事）时降级到最近 30 条
  const write = (log: LogEntry[]): boolean => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, log }))
      return true
    } catch {
      return false
    }
  }
  if (write(s.log)) return
  if (write(s.log.slice(-30))) {
    console.warn('现场存档空间紧张，已降级只保留最近 30 回合')
    return
  }
  console.error('现场存档写入失败（localStorage 空间不足）')
}

/** 校验 GameState 关键字段（防御旧版/损坏的本地数据） */
export function isValidGameState(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false
  const g = s as Record<string, unknown>
  if (typeof g.turn !== 'number') return false
  const p = g.player as Record<string, unknown> | undefined
  const r = g.res as Record<string, unknown> | undefined
  const t = g.timeline as Record<string, unknown> | undefined
  if (!p || typeof p !== 'object' || typeof p.daoName !== 'string') return false
  if (!r || typeof r !== 'object' || typeof r.hp !== 'number') return false
  if (!t || typeof t !== 'object' || typeof t.year !== 'number') return false
  if (!Array.isArray(g.log)) return false
  if (!g.flags || typeof g.flags !== 'object') return false
  return true
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (!s?.state || !isValidGameState(s.state)) return null
    if (!Array.isArray(s.log)) return null
    return s
  } catch {
    return null
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function hasSession(): boolean {
  return loadSession() !== null
}

/** 裁剪剧情流到上限（默认手动存档/快照上限；现场会话传 SESSION_SESSION_LIMIT） */
export function trimLog(log: LogEntry[], limit: number = SESSION_LOG_LIMIT): LogEntry[] {
  return log.length > limit ? log.slice(-limit) : log
}
