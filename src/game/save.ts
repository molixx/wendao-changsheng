/** 存档系统 —— localStorage 3 槽 + 自动存档 + JSON 导入导出（对应原文「存档/读档/死亡自动回档/存档压缩包」） */

import type { GameState, SaveFile } from './state'

export const SAVE_SCHEMA = 'wendao-changsheng'
export const SAVE_VERSION = 1
export const SLOT_COUNT = 3

const slotKey = (i: number) => `wdcd.slot.${i}`
const AUTO_KEY = 'wdcd.auto'

export function makeSaveFile(state: GameState, summary: string): SaveFile {
  return {
    meta: {
      schema: SAVE_SCHEMA,
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      turn: state.turn,
      summary,
    },
    state,
  }
}

function write(key: string, file: SaveFile): void {
  try {
    localStorage.setItem(key, JSON.stringify(file))
  } catch (e) {
    console.error('存档写入失败', e)
  }
}

function read(key: string): SaveFile | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const file = JSON.parse(raw) as SaveFile
    if (file?.meta?.schema !== SAVE_SCHEMA) return null
    return file
  } catch {
    return null
  }
}

/** 存入指定槽位（1-based） */
export function saveToSlot(state: GameState, slot: number, summary: string): void {
  write(slotKey(slot), makeSaveFile(state, summary))
}

/** 读取指定槽位 */
export function loadFromSlot(slot: number): SaveFile | null {
  return read(slotKey(slot))
}

/** 自动存档（死亡回档 / 每 30 回合） */
export function saveAuto(state: GameState, summary: string): void {
  write(AUTO_KEY, makeSaveFile(state, summary))
}

export function loadAuto(): SaveFile | null {
  return read(AUTO_KEY)
}

/** 列出所有槽位摘要（标题页用） */
export function listSlots(): (SaveFile | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => read(slotKey(i + 1)))
}

/** 导出为 JSON 字符串 */
export function exportJson(state: GameState, summary: string): string {
  return JSON.stringify(makeSaveFile(state, summary), null, 2)
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
