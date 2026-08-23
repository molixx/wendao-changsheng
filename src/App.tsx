/** 应用路由 + 主游戏界面（双端自适应：桌面侧栏状态卡 / 手机折叠）
 *  全局功能：挂载时静默恢复现场会话 · 刷新/关闭前兜底持久化 · 多标签接管提示 */

import { useEffect, useRef, useState } from 'react'
import { useGame } from './game/store'
import { TitleScreen } from './ui/TitleScreen'
import { SettingsPanel } from './ui/SettingsPanel'
import { StoryLog } from './ui/StoryLog'
import { CommandBar } from './ui/CommandBar'
import { StatusCard } from './ui/StatusCard'
import { SavePanel } from './ui/SavePanel'
import { CreationWizard } from './ui/CreationWizard'
import { LoreBrowser } from './ui/LoreBrowser'
import { DeathOverlay } from './ui/DeathOverlay'
import { Background } from './ui/Background'
import { BalanceBadge } from './ui/BalanceBadge'
import { SPIRIT_ROOTS } from './game/data/creation'
import { SESSION_KEY, saveSession, trimLog } from './game/session'

export default function App() {
  return (
    <>
      <Background />
      <Shell />
    </>
  )
}

function Shell() {
  const { screen, game, resetGame, restoreSession, takeOverSession, restoredTurn, snapshotOffer, revertToSnapshot, dismissSnapshotOffer } = useGame()
  const [showSave, setShowSave] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [takeover, setTakeover] = useState<{ turn: number } | null>(null)
  const [restoreTip, setRestoreTip] = useState(false)
  const booted = useRef(false)

  /* 挂载时静默恢复现场会话（只做一次，且仅在标题页无游戏时） */
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const restored = restoreSession()
    if (restored) {
      setRestoreTip(true)
      const t = setTimeout(() => setRestoreTip(false), 4000)
      return () => clearTimeout(t)
    }
  }, [restoreSession])

  /* 刷新/关闭前兜底持久化当前现场（每回合已写，这里防最后一刻丢失） */
  useEffect(() => {
    const flush = () => {
      const st = useGame.getState()
      if (st.game && st.screen === 'play') {
        const lastScene = [...st.log].reverse().find((e) => e.scene)?.scene
        saveSession({
          state: st.game,
          log: trimLog(st.log),
          pendingOptions: st.pendingOptions,
          scene: lastScene,
          savedAt: Date.now(),
          turn: st.game.turn,
        })
      }
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

  /* 多标签防冲突：其他标签写入现场会话 → 提示接管 */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY || !e.newValue) return
      try {
        const s = JSON.parse(e.newValue) as { turn?: number }
        if (s?.turn !== undefined) setTakeover({ turn: s.turn })
      } catch {
        /* 忽略损坏数据 */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const handleTakeover = (yes: boolean) => {
    if (yes) {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        try {
          const s = JSON.parse(raw) as Parameters<typeof takeOverSession>[0]
          if (s?.state) takeOverSession(s)
        } catch {
          /* 忽略 */
        }
      }
    }
    setTakeover(null)
  }

  const dead = game ? Boolean(game.flags.dead) : false
  const spiritRootElements = game
    ? SPIRIT_ROOTS.find((r) => r.id === game.player.spiritRootId)?.elements ?? []
    : []
  const location = game ? String(game.flags.location ?? '东洲·青岳') : '东洲·青岳'

  if (screen === 'title') return <TitleScreen />
  if (screen === 'settings') return <SettingsPanel />
  if (screen === 'create') return <CreationWizard />
  if (screen === 'lore') return <LoreBrowser />

  // play
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6">
      {/* 恢复提示（短暂显示） */}
      {restoreTip && restoredTurn !== null && (
        <div className="rounded-lg border border-[color:var(--theme-color)] bg-[color:var(--paper)]/95 px-4 py-2 text-sm shadow">
          🌀 已恢复现场 · 回合 #{restoredTurn}（刷新前进度已接续）
        </div>
      )}

      {/* 顶部工具条 */}
      <div className="flex items-center justify-between">
        <button onClick={() => setShowStatus(true)} className="rounded-lg border border-[color:var(--theme-color)]/40 px-3 py-1 text-sm sm:hidden">
          ☰ 状态卡
        </button>
        <span className="cmdline sm:hidden">问道长生 · 回合 {game?.turn ?? 0}</span>
        <div className="ml-auto flex items-center gap-2">
          <BalanceBadge />
          <button onClick={() => setShowSave(true)} className="rounded-lg border border-[color:var(--theme-color)]/40 px-3 py-1 text-sm">
            存档
          </button>
          <button onClick={resetGame} className="rounded-lg border border-[color:var(--ink-muted)]/40 px-3 py-1 text-sm">
            标题
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-4">
        {/* 桌面侧栏状态卡 */}
        <aside className="hidden w-72 shrink-0 sm:block">
          <div className="sticky top-4">
            {game && <StatusCard game={game} spiritRootElements={spiritRootElements} location={location} />}
          </div>
        </aside>

        {/* 中央剧情流 + 底部指令 */}
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <StoryLog />
          <CommandBar />
        </main>
      </div>

      {/* 手机状态卡抽屉 */}
      {showStatus && game && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/30 p-4 sm:hidden" onClick={() => setShowStatus(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <StatusCard game={game} spiritRootElements={spiritRootElements} location={location} />
          </div>
        </div>
      )}

      {showSave && <SavePanel onClose={() => setShowSave(false)} />}
      {dead && <DeathOverlay />}

      {/* 失败回退提示（突破失败 / 战斗失利，快照已在事件前写好） */}
      {snapshotOffer && !dead && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[92%] max-w-md">
          <div className="rounded-xl border-2 border-[color:var(--theme-color)] bg-[color:var(--paper)] p-4 shadow-xl">
            <p className="text-sm font-bold">【{snapshotOffer.kind}失利】回合 #{snapshotOffer.turn} 的{snapshotOffer.kind}失败了。</p>
            <p className="cmdline mt-1 text-xs">可回退到{snapshotOffer.kind}前重新决策（自动快照），或接受结果继续前进。</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  if (!revertToSnapshot()) {
                    window.alert('未找到事件前快照')
                  }
                }}
                className="flex-1 rounded-lg bg-[color:var(--theme-color)] px-3 py-2 text-sm font-bold text-white"
              >
                回退到{snapshotOffer.kind}前
              </button>
              <button
                onClick={dismissSnapshotOffer}
                className="rounded-lg border border-[color:var(--ink-muted)]/40 px-4 py-2 text-sm"
              >
                接受结果继续
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 多标签接管提示 */}
      {takeover && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[92%] max-w-md">
          <div className="rounded-xl border-2 border-[color:var(--theme-color)] bg-[color:var(--paper)] p-4 shadow-xl">
            <p className="text-sm font-bold">检测到另一标签页更新了进度（回合 #{takeover.turn}）</p>
            <p className="cmdline mt-1 text-xs">最后写入者生效。接管后将以另一标签的进度继续。</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleTakeover(true)}
                className="flex-1 rounded-lg bg-[color:var(--theme-color)] px-3 py-2 text-sm font-bold text-white"
              >
                接管进度
              </button>
              <button
                onClick={() => handleTakeover(false)}
                className="rounded-lg border border-[color:var(--ink-muted)]/40 px-4 py-2 text-sm"
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
