/** 标题页 —— 开始 / 读档（3 槽详情）/ 继续（现场进度优先）/ 放弃进度 / 设置 / 图鉴 */

import { useState } from 'react'
import { useGame } from '../game/store'
import { listSlots, clearSlot, fmtSavedAt } from '../game/save'
import type { SaveFile } from '../game/state'
import { hasSession } from '../game/session'
import { Panel } from './Panel'
import { ConfirmDialog } from './ConfirmDialog'

export function TitleScreen() {
  const { toScreen, continueFromSave, restoreSession, abandonSession } = useGame()
  const [showLoad, setShowLoad] = useState(false)
  const [slots, setSlots] = useState(listSlots())
  const [delSlot, setDelSlot] = useState<{ i: number; summary: string } | null>(null)
  const anySave = slots.some((s) => s !== null)
  const hasPending = hasSession()

  const refresh = () => setSlots(listSlots())

  const loadSlot = (f: SaveFile) => {
    continueFromSave(f)
    setShowLoad(false)
  }

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

        {(hasPending || anySave) && (
          <button
            onClick={() => {
              // 优先恢复现场会话（未完成的进度），否则读最近手动存档
              if (!restoreSession() && anySave) {
                const newest = slots.filter(Boolean).sort((a, b) => (b?.meta.savedAt ?? '').localeCompare(a?.meta.savedAt ?? ''))[0]
                if (newest) continueFromSave(newest)
              }
            }}
            className="rounded-xl border-2 border-[color:var(--theme-color)] px-4 py-3 font-bold text-[color:var(--theme-color)] hover:bg-white/95"
          >
            继续游戏{hasPending ? '（未完成进度）' : '（最近存档）'}
          </button>
        )}

        {anySave && (
          <button
            onClick={() => {
              refresh()
              setShowLoad(true)
            }}
            className="rounded-xl border border-[color:var(--theme-color)] px-4 py-2 text-sm text-[color:var(--theme-color)] hover:bg-white/95"
          >
            读档（{slots.filter(Boolean).length}/{slots.length} 槽）
          </button>
        )}

        {hasPending && (
          <button
            onClick={() => {
              if (window.confirm('放弃当前未完成进度，重新开始？（此操作不可撤销）')) {
                abandonSession()
                toScreen('create')
              }
            }}
            className="rounded-xl border border-[color:var(--val-hp)]/50 px-4 py-2 text-sm text-[color:var(--val-hp)] hover:bg-white/95"
          >
            放弃进度 · 重新开始
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

      {/* 读档面板 */}
      {showLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowLoad(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Panel theme="qingyu" title="读档" subtitle={`${slots.filter(Boolean).length}/${slots.length} 槽`} className="w-full">
              <div className="flex flex-col gap-2">
                {slots.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-[color:var(--theme-color)]/30 bg-white/60 px-3 py-2">
                    <span className="cmdline w-10 shrink-0">槽{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      {s ? (
                        <>
                          <p className="truncate text-sm font-bold">{s.meta.summary}</p>
                          <p className="cmdline text-xs">{fmtSavedAt(s.meta.savedAt)} · {s.log ? '含剧情流' : '旧版存档'}</p>
                        </>
                      ) : (
                        <p className="cmdline text-sm">空</p>
                      )}
                    </div>
                    {s && (
                      <>
                        <button onClick={() => loadSlot(s)} className="rounded bg-[color:var(--theme-color)] px-2.5 py-1 text-xs text-white">
                          读档
                        </button>
                        <button
                          onClick={() => setDelSlot({ i, summary: s.meta.summary })}
                          className="rounded border border-[color:var(--val-hp)]/50 px-2 py-1 text-xs text-[color:var(--val-hp)]"
                        >
                          删
                        </button>
                      </>
                    )}
                  </div>
                ))}
                <button onClick={() => setShowLoad(false)} className="rounded-lg bg-[color:var(--theme-color)] px-3 py-2 text-sm text-white">
                  关闭
                </button>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {delSlot && (
        <ConfirmDialog
          title="删除存档"
          message={`确定删除槽位 ${delSlot.i + 1}（${delSlot.summary}）？此操作不可撤销。`}
          danger
          confirmText="删除"
          onConfirm={() => {
            clearSlot(delSlot.i + 1)
            setDelSlot(null)
            refresh()
          }}
          onCancel={() => setDelSlot(null)}
        />
      )}
    </div>
  )
}
