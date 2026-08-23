/** 全局状态（Zustand）—— 屏幕路由 / 游戏状态 / 剧情流 / 设置 / 现场会话 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameState, NarratorSettings, SaveFile } from './state'
import { DEFAULT_SETTINGS } from './state'
import { resolveTurn, openingTurn, nextId, type LogEntry } from './engine/turn'
import { fmtTimeShort } from './engine/time'
import { saveAuto } from './save'
import { saveSession, loadSession, clearSession, trimLog, type Session } from './session'

export type Screen = 'title' | 'create' | 'play' | 'settings' | 'lore'

interface GameStore {
  screen: Screen
  game: GameState | null
  settings: NarratorSettings
  log: LogEntry[]
  pendingOptions: { text: string; tag?: string }[]
  busy: boolean
  error: string | null
  /** 是否刚从现场会话恢复（用于展示轻提示） */
  restoredTurn: number | null

  toScreen: (s: Screen) => void
  setSettings: (patch: Partial<NarratorSettings>) => void
  startNewGame: (state: GameState) => void
  continueFromSave: (file: SaveFile) => void
  /** 静默恢复现场会话；成功返回 true */
  restoreSession: () => boolean
  /** 放弃当前进度（清现场会话回标题页） */
  abandonSession: () => void
  /** 外部（另一标签）写入的会话：接管为当前进度 */
  takeOverSession: (s: Session) => void
  submitAction: (input: string) => Promise<void>
  resetGame: () => void
  clearError: () => void
}

function makeLogEntry(state: GameState, narrative: string, options: { text: string; tag?: string }[], scene?: string, deltas?: string[]): LogEntry {
  return {
    id: nextId(),
    time: fmtTimeShort(state.timeline),
    narrative,
    options,
    scene: scene as LogEntry['scene'],
    deltas,
  }
}

/** 由当前状态生成会话并落盘（剧情流裁剪到 50 回合） */
function persistCurrentSession(state: GameState, log: LogEntry[], pendingOptions: { text: string; tag?: string }[]): void {
  const lastScene = [...log].reverse().find((e) => e.scene)?.scene
  saveSession({
    state,
    log: trimLog(log),
    pendingOptions,
    scene: lastScene,
    savedAt: Date.now(),
    turn: state.turn,
  })
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      screen: 'title',
      game: null,
      settings: DEFAULT_SETTINGS,
      log: [],
      pendingOptions: [],
      busy: false,
      error: null,
      restoredTurn: null,

      toScreen: (s) => set({ screen: s }),

      setSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch } })),

      startNewGame: (state) => {
        const { state: s, entry } = openingTurn(state)
        set({
          screen: 'play',
          game: s,
          log: [{ id: nextId(), ...entry }],
          pendingOptions: entry.options,
          error: null,
          restoredTurn: null,
        })
        persistCurrentSession(s, [{ id: nextId(), ...entry }], entry.options)
      },

      continueFromSave: (file) => {
        set({
          screen: 'play',
          game: file.state,
          log: [],
          pendingOptions: [],
          error: null,
          restoredTurn: null,
        })
        persistCurrentSession(file.state, [], [])
      },

      restoreSession: () => {
        const s = loadSession()
        if (!s) return false
        set({
          screen: 'play',
          game: s.state,
          log: s.log,
          pendingOptions: s.pendingOptions,
          error: null,
          restoredTurn: s.turn,
        })
        return true
      },

      abandonSession: () => {
        clearSession()
        set({
          screen: 'title',
          game: null,
          log: [],
          pendingOptions: [],
          error: null,
          restoredTurn: null,
        })
      },

      takeOverSession: (s) => {
        set({
          screen: 'play',
          game: s.state,
          log: s.log,
          pendingOptions: s.pendingOptions,
          error: null,
          restoredTurn: s.turn,
        })
      },

      submitAction: async (input) => {
        const { game, settings, log, busy } = get()
        if (!game || busy) return
        set({ busy: true, error: null })
        try {
          const history = log.slice(-8).map((e) => ({
            role: 'user' as const,
            content: `（回合 ${e.time}）`,
          }))
          history.push({ role: 'user', content: input })
          const out = await resolveTurn({ state: game, action: input, history }, settings)
          const entry = makeLogEntry(out.state, out.narrative, out.options, out.scene, out.deltas)
          const newLog = [...log, entry]
          set({
            game: out.state,
            log: newLog,
            pendingOptions: out.options,
            busy: false,
          })
          // 每回合持久化现场（刷新可无缝恢复）
          persistCurrentSession(out.state, newLog, out.options)
          // 每 30 回合自动存档（3 槽之外的安全网）
          if (out.state.turn % 30 === 0) {
            const p = out.state.player
            saveAuto(out.state, `${p.daoName} · ${p.realm}·${p.stage} · 回合${out.state.turn}`)
          }
        } catch (e) {
          set({ busy: false, error: e instanceof Error ? e.message : String(e) })
        }
      },

      resetGame: () =>
        set({
          screen: 'title',
          game: null,
          log: [],
          pendingOptions: [],
          error: null,
          restoredTurn: null,
        }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'wendao-changsheng',
      partialize: (st) => ({ settings: st.settings }),
    },
  ),
)
