/** 陨落/结局浮层 —— 对应原文「真实修仙界，会死，非龙傲天」
 *  回档优先级：事件快照（突破/战斗前，可重新决策）→ 现场会话（死前现场）→ 自动存档 */

import { useGame } from '../game/store'
import { loadAuto } from '../game/save'
import { loadSnapshot } from '../game/save'
import { loadSession } from '../game/session'
import { Panel } from './Panel'

export function DeathOverlay() {
  const { game, resetGame, continueFromSave, revertToSnapshot, restoreSession } = useGame()
  const reason = game ? String(game.flags.dead ?? '陨落') : '陨落'

  const snap = loadSnapshot()
  const sess = loadSession()
  const auto = loadAuto()
  const hasOptions = Boolean(snap || sess || auto)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Panel theme="zhusha" variant="warn" title="陨落" subtitle="道途已断" className="w-full max-w-md text-center">
        <p className="leading-relaxed">{reason}</p>
        <p className="cmdline mt-2 text-xs">真实修仙界，会死。非龙傲天——此乃本作灵魂。</p>
        <hr className="gold-line mt-3" />
        <div className="mt-3 flex flex-col gap-2">
          {snap && (
            <button
              onClick={() => { if (!revertToSnapshot()) resetGame() }}
              className="rounded-xl bg-[color:var(--theme-color)] px-4 py-2.5 text-sm font-bold text-white"
            >
              回退到事件前（回合 {snap.meta.turn}）重新决策
            </button>
          )}
          {!snap && sess && !sess.state.flags.dead && (
            <button
              onClick={() => { restoreSession(); }}
              className="rounded-xl bg-[color:var(--theme-color)] px-4 py-2.5 text-sm font-bold text-white"
            >
              恢复最近现场（回合 {sess.turn}）
            </button>
          )}
          {auto && (
            <button
              onClick={() => continueFromSave(auto)}
              className="rounded-xl border-2 border-[color:var(--theme-color)] px-4 py-2.5 text-sm font-bold text-[color:var(--theme-color)]"
            >
              读最近自动存档（回合 {auto.meta.turn}）
            </button>
          )}
          {!hasOptions && (
            <p className="cmdline text-xs">无可用回档——重新开始吧。</p>
          )}
          <button onClick={resetGame} className="rounded-xl border border-[color:var(--theme-color)] px-4 py-2.5 text-sm">
            返回标题页
          </button>
        </div>
      </Panel>
    </div>
  )
}
