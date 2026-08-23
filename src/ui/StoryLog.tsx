/** 剧情流 —— 只显示当前回合卡片 + 「历史回合」模态弹窗（只读，选项不可重复触发） */

import { useState } from 'react'
import { useGame } from '../game/store'
import type { LogEntry } from '../game/engine/turn'
import { hasLatexMarkup, sanitizeNarrative } from '../game/narrator/llm'
import { GoldLine, Tag } from './Panel'

function EngineTag({ engine }: { engine?: LogEntry['engine'] }) {
  if (engine === 'llm') return <span className="rounded px-1.5 text-xs font-bold" style={{ background: '#8B6FA8', color: '#fff' }}>天道</span>
  if (engine === 'code') return <span className="rounded px-1.5 text-xs font-bold" style={{ background: '#8C8578', color: '#fff' }}>结算</span>
  if (engine === 'offline') return <span className="rounded px-1.5 text-xs font-bold" style={{ background: '#C4675C', color: '#fff' }}>离线</span>
  return null
}

/** 回合卡片：interactive=true 可点击选项推进；false 为历史只读（选项置灰） */
function EntryCard({
  entry,
  interactive,
  busy,
  onPick,
  onFreeAction,
}: {
  entry: LogEntry
  interactive: boolean
  busy?: boolean
  onPick?: (text: string) => void
  onFreeAction?: () => void
}) {
  const narr = hasLatexMarkup(entry.narrative) ? sanitizeNarrative(entry.narrative) : entry.narrative
  return (
    <article className="panel shrink-0 px-4 py-3">
      <p className="cmdline flex items-center gap-2">
        <span>{entry.time}</span>
        {entry.action && <span className="text-[color:var(--ink-muted)]/80">「{entry.action.slice(0, 24)}」</span>}
        <EngineTag engine={entry.engine} />
      </p>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{narr}</p>
      {entry.deltas && entry.deltas.length > 0 && (
        <p className="cmdline mt-1">【数值变化】{entry.deltas.join(' · ')}</p>
      )}
      {entry.options && entry.options.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {(entry.options ?? []).map((opt, i) =>
            interactive ? (
              <button
                key={i}
                disabled={busy}
                onClick={() => onPick?.(opt.text)}
                className="text-left flex items-start gap-2 rounded-lg border border-[color:var(--theme-color)]/40 bg-white/90 px-3 py-2 hover:bg-white disabled:opacity-50 transition-colors"
              >
                <span className="opt-btn">{String.fromCharCode(65 + i)}</span>
                {opt.tag && <Tag text={opt.tag} />}
                <span>{opt.text}</span>
              </button>
            ) : (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-[color:var(--ink-muted)]/25 bg-white/50 px-3 py-2 opacity-60"
              >
                <span className="opt-btn" style={{ background: 'var(--ink-muted)' }}>{String.fromCharCode(65 + i)}</span>
                {opt.tag && <Tag text={opt.tag} />}
                <span>{opt.text}</span>
              </div>
            ),
          )}
        </div>
      )}
      {interactive && (
        <button
          disabled={busy}
          onClick={onFreeAction}
          className="mt-2 w-full rounded-lg border border-dashed border-[color:var(--theme-color)]/50 px-3 py-1.5 text-sm text-[color:var(--ink-muted)] hover:bg-white/80 disabled:opacity-50"
        >
          ✎ 自由行动（输入任意行为）…
        </button>
      )}
    </article>
  )
}

export function StoryLog() {
  const { log, busy, error, submitAction, clearError } = useGame()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [freeOpen, setFreeOpen] = useState(false)
  const [freeText, setFreeText] = useState('')

  const current = log[log.length - 1]

  const sendFree = () => {
    const v = freeText.trim()
    if (!v || busy) return
    setFreeOpen(false)
    setFreeText('')
    void submitAction(v)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 当前回合信息 + 历史入口 */}
      {current && (
        <div className="flex items-center justify-between px-1">
          <span className="cmdline">当前回合 · {current.time}</span>
          <button
            onClick={() => setHistoryOpen(true)}
            className="rounded-lg border border-[color:var(--theme-color)]/40 px-3 py-1 text-sm"
          >
            历史回合（{log.length}）
          </button>
        </div>
      )}

      {/* 当前回合卡片（可交互） */}
      {current && (
        <EntryCard entry={current} interactive busy={busy} onPick={submitAction} onFreeAction={() => setFreeOpen(true)} />
      )}

      {busy && (
        <div className="panel px-4 py-3 text-center cmdline">
          <span className="animate-pulse">天道推演中……</span>
        </div>
      )}

      {error && (
        <div className="panel panel--warn px-4 py-3">
          <p className="danger-line">⚠ {error}</p>
          <button className="mt-2 text-sm underline" onClick={clearError}>
            关闭
          </button>
        </div>
      )}

      {log.length === 0 && !busy && (
        <div className="panel px-4 py-6 text-center cmdline">天地初开，道途未启。</div>
      )}

      {/* 历史回合模态弹窗（只读） */}
      {historyOpen && (
        <div className="fixed inset-0 z-[60] flex overflow-y-auto bg-black/30 p-4" onClick={() => setHistoryOpen(false)}>
          <div className="m-auto w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <section className="panel">
              <header className="panel-title flex items-center justify-between">
                <span>历史回合 · 共 {log.length} 回合</span>
                <span className="text-sm font-normal opacity-90">仅可查看，不可重复触发</span>
              </header>
              <div className="max-h-[60vh] overflow-y-auto space-y-3 p-4">
                {log.map((e) => (
                  <EntryCard key={e.id} entry={e} interactive={false} />
                ))}
                {log.length === 0 && <p className="cmdline text-center py-6">尚无历史回合。</p>}
              </div>
              <footer className="px-4 pb-3">
                <GoldLine />
                <div className="flex items-center justify-between">
                  <p className="cmdline">当前回合 #{log.length}</p>
                  <button
                    onClick={() => setHistoryOpen(false)}
                    className="rounded-lg bg-[color:var(--theme-color)] px-4 py-1.5 text-sm font-bold text-white"
                  >
                    关闭
                  </button>
                </div>
              </footer>
            </section>
          </div>
        </div>
      )}

      {/* 自由行动输入弹窗 */}
      {freeOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setFreeOpen(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <section className="panel">
              <header className="panel-title">自由行动</header>
              <div className="px-4 py-3">
                <input
                  autoFocus
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendFree()}
                  placeholder="如：夜探藏经阁 / 给师兄下情蛊 / 闭关百年…"
                  className="w-full rounded-lg border border-[color:var(--theme-color)]/40 px-3 py-2.5 text-sm outline-none"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={sendFree}
                    disabled={!freeText.trim() || busy}
                    className="flex-1 rounded-lg bg-[color:var(--theme-color)] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                  >
                    行动
                  </button>
                  <button onClick={() => setFreeOpen(false)} className="rounded-lg border border-[color:var(--ink-muted)]/40 px-4 py-2 text-sm">
                    取消
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      <GoldLine />
    </div>
  )
}
