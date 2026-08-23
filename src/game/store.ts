/** 全局状态（Zustand）—— 屏幕路由 / 游戏状态 / 剧情流 / 设置 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameState, NarratorSettings, SaveFile } from './state'
import { DEFAULT_SETTINGS } from './state'
import { resolveTurn, openingTurn, nextId, type LogEntry } from './engine/turn'
import { fmtTimeShort } from './engine/time'
import { saveAuto } from './save'

export type Screen = 'title' | 'create' | 'play' | 'settings' | 'lore'

interface GameStore {
  screen: Screen
  game: GameState | null
  settings: NarratorSettings
  log: LogEntry[]
  pendingOptions: { text: string; tag?: string }[]
  busy: boolean
  error: string | null

  toScreen: (s: Screen) => void
  setSettings: (patch: Partial<NarratorSettings>) => void
  startNewGame: (state: GameState) => void
  continueFromSave: (file: SaveFile) => void
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
        })
      },

      continueFromSave: (file) =>
        set({
          screen: 'play',
          game: file.state,
          log: [],
          pendingOptions: [],
          error: null,
        }),

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
          set({
            game: out.state,
            log: [...log, entry],
            pendingOptions: out.options,
            busy: false,
          })
          // 每 30 回合自动存档
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
        }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'wendao-changsheng',
      partialize: (st) => ({ settings: st.settings }),
    },
  ),
)
