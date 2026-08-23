/** 标题页 —— 开始 / 读档 / 设置 / 图鉴 */

import { useGame } from '../game/store'
import { listSlots } from '../game/save'
import { Panel } from './Panel'

export function TitleScreen() {
  const { toScreen, continueFromSave } = useGame()
  const slots = listSlots()
  const anySave = slots.some((s) => s !== null)

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-10">
      <Panel theme="qingyu" title="问道长生 · 修仙模拟器" subtitle="作者：wobuaixc@163.com" className="w-full text-center">
        <p className="leading-relaxed text-ink">
          高自由修仙 · 全性向 · 真实修仙界
          <br />
          <span className="text-muted text-sm">会死。非龙傲天。天地不仁，大道无亲。</span>
        </p>
        <p className="cmdline text-xs mt-2">致谢 · 雾见川（原作设定）</p>
      </Panel>

      <div className="flex w-full flex-col gap-3">
        <button
          onClick={() => toScreen('create')}
          className="rounded-xl bg-[color:var(--theme-color)] px-4 py-3 font-bold text-white shadow-md hover:opacity-90"
        >
          开始新游戏
        </button>
        {anySave && (
          <button
            onClick={() => {
              const newest = slots.filter(Boolean).sort((a, b) => (b?.meta.savedAt ?? '').localeCompare(a?.meta.savedAt ?? ''))[0]
              if (newest) continueFromSave(newest)
            }}
            className="rounded-xl border-2 border-[color:var(--theme-color)] px-4 py-3 font-bold text-[color:var(--theme-color)] hover:bg-white/95"
          >
            继续游戏（最近存档）
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => toScreen('settings')} className="rounded-xl border border-[color:var(--ink-muted)]/40 px-4 py-2 text-sm hover:bg-white/95">
            叙事引擎设置
          </button>
          <button onClick={() => toScreen('lore')} className="rounded-xl border border-[color:var(--ink-muted)]/40 px-4 py-2 text-sm hover:bg-white/95">
            设定图鉴
          </button>
        </div>
      </div>
    </div>
  )
}
