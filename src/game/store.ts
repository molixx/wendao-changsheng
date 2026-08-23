/** 全局状态（Zustand）—— 屏幕路由 / 游戏状态 / 剧情流 / 设置 / 现场会话 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameState, NarratorSettings, SaveFile } from './state'
import { DEFAULT_SETTINGS } from './state'
import { resolveTurn, openingTurn, nextId, type LogEntry } from './engine/turn'
import { fmtTimeShort } from './engine/time'
import { saveAuto, loadSnapshot } from './save'
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
  /** 失败回退提示（突破/战斗失败时出现）：kind + 快照回合 */
  snapshotOffer: { kind: '突破' | '战斗'; turn: number } | null

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
  /** 回退到事件前快照（突破/战斗前），清失败标记 */
  revertToSnapshot: () => boolean
  /** 忽略失败回退提示，继续当前进度 */
  dismissSnapshotOffer: () => void
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
      snapshotOffer: null,

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
          snapshotOffer: null,
        })
        persistCurrentSession(s, [{ id: nextId(), ...entry }], entry.options)
      },

      continueFromSave: (file) => {
        const fLog = file.log as LogEntry[] | undefined
        const fOpts = file.pendingOptions as { text: string; tag?: string }[] | undefined
        set({
          screen: 'play',
          game: file.state,
          log: fLog ?? [],
          pendingOptions: fOpts ?? [],
          error: null,
          restoredTurn: null,
          snapshotOffer: null,
        })
        persistCurrentSession(file.state, fLog ?? [], fOpts ?? [])
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

      revertToSnapshot: () => {
        const snap = loadSnapshot()
        if (!snap) return false
        const fLog = snap.log as LogEntry[] | undefined
        const fOpts = snap.pendingOptions as { text: string; tag?: string }[] | undefined
        const clean = { ...snap.state, flags: { ...snap.state.flags } }
        delete clean.flags.lastBreakFailed
        delete clean.flags.combatLost
        delete clean.flags.dead
        set({
          screen: 'play',
          game: clean,
          log: fLog ?? [],
          pendingOptions: fOpts ?? [],
          error: null,
          restoredTurn: snap.meta.turn,
          snapshotOffer: null,
        })
        persistCurrentSession(clean, fLog ?? [], fOpts ?? [])
        return true
      },

      dismissSnapshotOffer: () => {
        const { game } = get()
        if (game) {
          const flags = { ...game.flags }
          delete flags.lastBreakFailed
          delete flags.combatLost
          set({ game: { ...game, flags }, snapshotOffer: null })
        } else {
          set({ snapshotOffer: null })
        }
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
          const out = await resolveTurn({ state: game, action: input, history, log }, settings)
          const entry = makeLogEntry(out.state, out.narrative, out.options, out.scene, out.deltas)
          const newLog = [...log, entry]
          const s2 = out.state
          // 失败回退提示：突破失败 / 战斗失利（快照已在事件前写好）
          let offer: GameStore['snapshotOffer'] = null
          if (s2.flags.lastBreakFailed) offer = { kind: '突破', turn: s2.turn }
          else if (s2.flags.combatLost) offer = { kind: '战斗', turn: s2.turn }
          set({
            game: s2,
            log: newLog,
            pendingOptions: out.options,
            busy: false,
            snapshotOffer: offer,
          })
          // 每回合持久化现场（刷新可无缝恢复）；死亡回合不覆盖，保留死前现场供回档
          if (!s2.flags.dead) persistCurrentSession(s2, newLog, out.options)
          // 每 30 回合自动存档（3 槽之外的安全网）
          if (s2.turn % 30 === 0) {
            const p = s2.player
            saveAuto(s2, `${p.daoName} · ${p.realm}·${p.stage} · 回合${s2.turn}`, { log: newLog, pendingOptions: out.options, scene: out.scene })
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
