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
/** 剧情流保留上限（原文/设计确认：最近 50 回合） */
export const SESSION_LOG_LIMIT = 50

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch (e) {
    console.error('现场存档写入失败', e)
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (!s?.state?.player) return null
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

/** 裁剪剧情流到上限 */
export function trimLog(log: LogEntry[]): LogEntry[] {
  return log.length > SESSION_LOG_LIMIT ? log.slice(-SESSION_LOG_LIMIT) : log
}
