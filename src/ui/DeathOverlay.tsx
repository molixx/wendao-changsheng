/** 陨落/结局浮层 —— 对应原文「真实修仙界，会死，非龙傲天」；死亡后读档或轮回 */

import { useGame } from '../game/store'
import { loadAuto } from '../game/save'
import { Panel } from './Panel'

export function DeathOverlay() {
  const { game, resetGame, continueFromSave } = useGame()
  const reason = game ? String(game.flags.dead ?? '陨落') : '陨落'
  const auto = loadAuto()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Panel theme="zhusha" variant="warn" title="陨落" subtitle="道途已断" className="w-full max-w-md text-center">
        <p className="leading-relaxed">{reason}</p>
        <p className="cmdline mt-2 text-xs">真实修仙界，会死。非龙傲天——此乃本作灵魂。</p>
        <hr className="gold-line mt-3" />
        <div className="mt-3 flex flex-col gap-2">
          {auto && (
            <button
              onClick={() => continueFromSave(auto)}
              className="rounded-xl bg-[color:var(--theme-color)] px-4 py-2.5 text-sm font-bold text-white"
            >
              读最近存档（回合 {auto.meta.turn}）
            </button>
          )}
          <button onClick={resetGame} className="rounded-xl border border-[color:var(--theme-color)] px-4 py-2.5 text-sm">
            返回标题页
          </button>
        </div>
      </Panel>
    </div>
  )
}
