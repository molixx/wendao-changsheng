/** 应用路由 + 主游戏界面（双端自适应：桌面侧栏状态卡 / 手机折叠） */

import { useState } from 'react'
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
import { SPIRIT_ROOTS } from './game/data/creation'

export default function App() {
  return (
    <>
      <Background />
      <Shell />
    </>
  )
}

function Shell() {
  const { screen, game, resetGame } = useGame()
  const [showSave, setShowSave] = useState(false)
  const [showStatus, setShowStatus] = useState(false)

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
      {/* 顶部工具条 */}
      <div className="flex items-center justify-between">
        <button onClick={() => setShowStatus(true)} className="rounded-lg border border-[color:var(--theme-color)]/40 px-3 py-1 text-sm sm:hidden">
          ☰ 状态卡
        </button>
        <span className="cmdline sm:hidden">问道长生 · 回合 {game?.turn ?? 0}</span>
        <div className="ml-auto flex gap-2">
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
    </div>
  )
}
