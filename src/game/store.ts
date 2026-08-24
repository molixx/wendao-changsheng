/** 全局状态（Zustand）—— 屏幕路由 / 游戏状态 / 剧情流 / 设置 / 现场会话 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameState, NarratorSettings, SaveFile } from './state'
import { DEFAULT_SETTINGS } from './state'
import { resolveTurn, openingTurn, buildWorldSnapshot, reconcileLifespan, nextId, type LogEntry } from './engine/turn'
import { fmtTimeShort } from './engine/time'
import { saveAuto, loadSnapshot } from './save'
import { saveSession, loadSession, clearSession, trimLog, type Session } from './session'
import { narrateOpening, sanitizeOptions, buildSystemPrompt, isOfflineError, hasLatexMarkup, sanitizeNarrative } from './narrator/llm'
import { WORLD_BIBLE } from './data/worldview'
import { OPENING_SCRIPTS } from './data/events'
import { ORIGINS, SPIRIT_ROOTS, PHYSIQUES, DAO_PATHS } from './data/creation'

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
  /** 回合执行失败（AI 报错/离线/未配置）→ 停留当前卡片，等待手动重试 */
  turnError: { message: string; offline: boolean; action: string } | null

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

function makeLogEntry(
  state: GameState,
  narrative: string,
  options: { text: string; tag?: string }[],
  scene?: string,
  deltas?: string[],
  action?: string,
  engine?: LogEntry['engine'],
  passedMonths?: number,
  aiDeltas?: Record<string, unknown>,
  summary?: string,
): LogEntry {
  return {
    id: nextId(),
    time: fmtTimeShort(state.timeline),
    narrative,
    options,
    scene: scene as LogEntry['scene'],
    deltas,
    action,
    engine,
    passedMonths,
    aiDeltas,
    summary,
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

/** 归一化历史条目：空白叙事 → 占位、LaTeX 污染 → 清洗，并**重新分配唯一 id**
 *  （旧版 nextId 每次刷新从 1 计数，导致旧日志 id 与新回合冲突 → React key 重复、历史弹窗渲染错乱） */
function normalizeLog(log: LogEntry[]): LogEntry[] {
  const seen = new Set<number>()
  return log.map((e) => {
    let narr = e.narrative ?? ''
    if (hasLatexMarkup(narr)) narr = sanitizeNarrative(narr)
    if (!narr.trim()) narr = `（${e.time ?? ''}，天道静默）`
    let id = e.id
    if (typeof id !== 'number' || seen.has(id)) id = nextId()
    seen.add(id)
    return { ...e, id, narrative: narr }
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
      turnError: null,

      toScreen: (s) => set({ screen: s }),

      setSettings: (patch) => set((st) => ({ settings: { ...st.settings, ...patch } })),

      startNewGame: (state) => {
        const { state: s, entry } = openingTurn(state)
        const entryId = nextId()
        const log = [{ id: entryId, ...entry }]
        set({
          screen: 'play',
          game: s,
          log,
          pendingOptions: entry.options,
          error: null,
          restoredTurn: null,
          snapshotOffer: null,
          turnError: null,
        })
        persistCurrentSession(s, log, entry.options)
        // 开局第一回合触发天道：LLM 可用时用 AI 演绎开局并原位替换第一张卡片
        const cur = get()
        if (cur.settings.useLlm && cur.settings.apiKey.trim().length > 0) {
          void (async () => {
            try {
              const p = s.player
              const scriptId = typeof s.flags.openingScript === 'string' ? s.flags.openingScript : OPENING_SCRIPTS[0].id
              const script = OPENING_SCRIPTS.find((x) => x.id === scriptId) ?? OPENING_SCRIPTS[0]
              const characterSummary = [
                `道号${p.daoName}（${p.name}）· ${p.gender} · ${p.age}岁 · 仙姿${p.appearance}`,
                `出身：${ORIGINS.find((o) => o.id === p.originId)?.name ?? '未知'}`,
                `灵根：${SPIRIT_ROOTS.find((r) => r.id === p.spiritRootId)?.name ?? '未知'}`,
                `体质：${PHYSIQUES.find((q) => q.id === p.physiqueId)?.name ?? '未知'}`,
                `道途：${DAO_PATHS.find((d) => d.id === p.daoPathId)?.name ?? '未知'}`,
                `六维：资质${p.stats.zizhi} 悟性${p.stats.wuxing} 神识${p.stats.shenshi} 遁速${p.stats.dunsu} 道心${p.stats.daoxin} 仙缘${p.stats.xianyuan}`,
              ].join('\n')
              const system = buildSystemPrompt(WORLD_BIBLE, buildWorldSnapshot(s))
              const narrated = await narrateOpening(cur.settings, system, characterSummary, `${script.name}：${script.desc}`)
              const upgraded: LogEntry = {
                ...entry,
                id: entryId,
                narrative: narrated.narrative,
                summary: narrated.summary,
                options: sanitizeOptions(narrated.options),
                engine: 'llm',
              }
              const st = useGame.getState()
              const newLog = st.log.map((e) => (e.id === entryId ? upgraded : e))
              set({ log: newLog, pendingOptions: upgraded.options })
              if (!st.game?.flags.dead) persistCurrentSession(st.game!, newLog, upgraded.options)
            } catch {
              // AI 开局失败：保持代码版开局（现状）
            }
          })()
        }
      },

      continueFromSave: (file) => {
        const fLog = file.log as LogEntry[] | undefined
        const fOpts = file.pendingOptions as { text: string; tag?: string }[] | undefined
        set({
          screen: 'play',
          game: reconcileLifespan(file.state),
          log: normalizeLog(fLog ?? []),
          pendingOptions: fOpts ?? [],
          error: null,
          restoredTurn: null,
          snapshotOffer: null,
          turnError: null,
        })
        persistCurrentSession(file.state, fLog ?? [], fOpts ?? [])
      },

      restoreSession: () => {
        const s = loadSession()
        if (!s) return false
        set({
          screen: 'play',
          game: reconcileLifespan(s.state),
          log: normalizeLog(s.log),
          pendingOptions: s.pendingOptions,
          error: null,
          restoredTurn: s.turn,
          turnError: null,
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
          game: reconcileLifespan(s.state),
          log: normalizeLog(s.log),
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
          game: reconcileLifespan(clean),
          log: normalizeLog(fLog ?? []),
          pendingOptions: fOpts ?? [],
          error: null,
          restoredTurn: snap.meta.turn,
          snapshotOffer: null,
          turnError: null,
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
        set({ busy: true, error: null, turnError: null })
        try {
          // 重建对话历史：玩家输入 + AI 回答成对回传，AI 才能记得自己说过什么（40 条=最近 20 回合，防止剧情断片乱跳）
          const history = log.slice(-40).flatMap((e) => {
            const narr = (e.narrative ?? '').trim() ? e.narrative : `（回合 ${e.time}，天道静默）`
            // assistant 消息附上选项，让模型持续看到「自己每回合都给了选项」，避免几回合后模仿纯叙事而省略 options
            const opts = (e.options ?? []).map((o) => o.text).filter(Boolean)
            const assistant = opts.length > 0 ? `${narr}\n（选项：${opts.join(' / ')}）` : narr
            return [
              { role: 'user' as const, content: e.action ?? `（回合 ${e.time}）` },
              { role: 'assistant' as const, content: assistant },
            ]
          })
          history.push({ role: 'user' as const, content: input })
          const out = await resolveTurn({ state: game, action: input, history, log }, settings)
          const entry = makeLogEntry(out.state, out.narrative, out.options, out.scene, out.deltas, input, out.engine, out.timePassedMonths, out.rawDeltas, out.summary)
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
            turnError: null,
          })
          // 每回合持久化现场（刷新可无缝恢复）；死亡回合不覆盖，保留死前现场供回档
          if (!s2.flags.dead) persistCurrentSession(s2, newLog, out.options)
          // 每 30 回合自动存档（3 槽之外的安全网）
          if (s2.turn % 30 === 0) {
            const p = s2.player
            saveAuto(s2, `${p.daoName} · ${p.realm}·${p.stage} · 回合${s2.turn}`, { log: newLog, pendingOptions: out.options, scene: out.scene })
          }
        } catch (e) {
          // 失败即停留：不推进、不生成替代内容，等待手动重试
          const offline = isOfflineError(e)
          set({
            busy: false,
            turnError: {
              message: e instanceof Error ? e.message : String(e),
              offline,
              action: input,
            },
          })
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
          turnError: null,
        }),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'wendao-changsheng',
      partialize: (st) => ({ settings: st.settings }),
      // 旧版/残缺数据兜底：缺失字段补默认值，防止白屏
      merge: (persisted, current) => {
        const p = persisted as Partial<GameStore> | undefined
        return {
          ...current,
          ...(p ?? {}),
          settings: { ...DEFAULT_SETTINGS, ...(p?.settings ?? {}) },
        }
      },
    },
  ),
)
