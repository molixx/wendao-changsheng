/** 存档系统 —— localStorage 3 槽 + 自动存档 + 事件快照 + JSON 导入导出
 *  手动存档含剧情流（最近 50 回合），读档后无缝续玩（对应原文「存档/读档/死亡自动回档/存档压缩包」） */

import type { GameState, SaveFile } from './state'
import type { LogEntry } from './engine/turn'
import type { SceneThemeKey } from '../ui/theme'
import { isValidGameState } from './session'

export const SAVE_SCHEMA = 'wendao-changsheng'
export const SAVE_VERSION = 2
export const SLOT_COUNT = 3

const slotKey = (i: number) => `wdcd.slot.${i}`
const AUTO_KEY = 'wdcd.auto'
const SNAPSHOT_KEY = 'wdcd.snapshot'

export interface SaveExtras {
  log?: LogEntry[]
  pendingOptions?: { text: string; tag?: string }[]
  scene?: SceneThemeKey
}

export function makeSaveFile(state: GameState, summary: string, extras: SaveExtras = {}): SaveFile {
  return {
    meta: {
      schema: SAVE_SCHEMA,
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      turn: state.turn,
      summary,
    },
    state,
    ...(extras.log ? { log: extras.log } : {}),
    ...(extras.pendingOptions ? { pendingOptions: extras.pendingOptions } : {}),
    ...(extras.scene ? { scene: extras.scene } : {}),
  }
}

/** 从当前游戏状态 + 剧情流生成存档（含剧情流；log 裁剪到 50） */
export function makeSaveFromState(state: GameState, summary: string, log: LogEntry[], pendingOptions: { text: string; tag?: string }[], scene?: SceneThemeKey): SaveFile {
  return makeSaveFile(state, summary, {
    log: log.length > 50 ? log.slice(-50) : log,
    pendingOptions,
    scene,
  })
}

function write(key: string, file: SaveFile): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(key, JSON.stringify(file))
    return { ok: true }
  } catch (e) {
    console.error('存档写入失败', e)
    return { ok: false, error: '存档空间不足（localStorage 已满），请删除部分存档或导出备份后清理' }
  }
}

function read(key: string): SaveFile | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const file = JSON.parse(raw) as SaveFile
    if (file?.meta?.schema !== SAVE_SCHEMA) return null
    if (!isValidGameState(file.state)) return null
    return file
  } catch {
    return null
  }
}

/** 存入指定槽位（1-based） */
export function saveToSlot(state: GameState, slot: number, summary: string, extras?: SaveExtras): { ok: boolean; error?: string } {
  return write(slotKey(slot), makeSaveFile(state, summary, extras))
}

/** 读取指定槽位 */
export function loadFromSlot(slot: number): SaveFile | null {
  return read(slotKey(slot))
}

/** 自动存档（每 30 回合 / 死亡兜底） */
export function saveAuto(state: GameState, summary: string, extras?: SaveExtras): { ok: boolean; error?: string } {
  return write(AUTO_KEY, makeSaveFile(state, summary, extras))
}

export function loadAuto(): SaveFile | null {
  return read(AUTO_KEY)
}

/** 事件快照（突破/渡劫/战斗前，覆盖式只留最新） */
export function saveSnapshot(state: GameState, summary: string, extras?: SaveExtras): void {
  write(SNAPSHOT_KEY, makeSaveFile(state, summary, extras))
}

export function loadSnapshot(): SaveFile | null {
  return read(SNAPSHOT_KEY)
}

/** 列出所有槽位（标题页/存档面板用） */
export function listSlots(): (SaveFile | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => read(slotKey(i + 1)))
}

/** 导出为 JSON 字符串（含剧情流） */
export function exportJson(state: GameState, summary: string, extras?: SaveExtras): string {
  return JSON.stringify(makeSaveFile(state, summary, extras), null, 2)
}

/** 从 JSON 字符串导入（校验 schema），失败返回 null */
export function importJson(text: string): SaveFile | null {
  try {
    const file = JSON.parse(text) as SaveFile
    if (file?.meta?.schema !== SAVE_SCHEMA || !file.state) return null
    return file
  } catch {
    return null
  }
}

/** 删除槽位 */
export function clearSlot(slot: number): void {
  localStorage.removeItem(slotKey(slot))
}

/** 槽位时间展示（本地时间） */
export function fmtSavedAt(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return iso
  }
}
