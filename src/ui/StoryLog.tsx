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
  // 摘要：AI 返回的简述优先；没有则用「行动」（不截断叙事首句）
  const summary = entry.summary ?? (entry.action ? `「${entry.action.slice(0, 20)}」` : '')
  return (
    <article className="panel shrink-0 px-4 py-3">
      <p className="cmdline flex items-center gap-2">
        <span>{entry.time}</span>
        <EngineTag engine={entry.engine} />
        {typeof entry.passedMonths === 'number' && (
          <span className={`rounded px-1.5 text-xs font-bold ${entry.passedMonths > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
            {entry.passedMonths > 0 ? `⌛ 流逝 ${Number(entry.passedMonths.toFixed(1))} 月` : '⌛ 未流逝'}
          </span>
        )}
      </p>
      {summary && <p className="mt-1 text-sm font-bold text-[color:var(--theme-color)]">{summary}</p>}
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{narr}</p>
      {entry.deltas && entry.deltas.length > 0 && (
        <p className="cmdline mt-1">【数值变化】{entry.deltas.join(' · ')}</p>
      )}
      {entry.aiDeltas && Object.keys(entry.aiDeltas).length > 0 && (
        <p className="cmdline mt-1 opacity-70">
          【AI 建议】{Object.entries(entry.aiDeltas).map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(' · ')}
        </p>
      )}
      {entry.options && entry.options.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {(entry.options ?? []).map((opt, i) =>
            interactive ? (
              <button
                key={i}
                disabled={busy}
                onClick={() => onPick?.(opt.text)}
                className="text-left flex items-center gap-2 rounded-lg border border-[color:var(--theme-color)]/40 bg-white/90 px-3 py-2 hover:bg-white disabled:opacity-50 transition-colors"
              >
                {opt.tag && <Tag text={opt.tag} />}
                <span className="flex-1">
                  {opt.text}
                  {opt.note && <span className="block text-xs text-[color:var(--ink-muted)]/80 mt-0.5">📎 {opt.note}</span>}
                </span>
              </button>
            ) : (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-[color:var(--ink-muted)]/25 bg-white/50 px-3 py-2 opacity-60"
              >
                {opt.tag && <Tag text={opt.tag} />}
                <span className="flex-1">
                  {opt.text}
                  {opt.note && <span className="block text-xs text-[color:var(--ink-muted)]/80 mt-0.5">📎 {opt.note}</span>}
                </span>
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

/** 历史摘要行：紧凑显示（时间 + 事件摘要 + 流逝），点击展开该回合全文（只读） */
function SummaryRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false)
  const summary = entry.summary ?? (entry.action ? `「${entry.action.slice(0, 20)}」` : '')
  return (
    <div className="border-b border-[color:var(--ink-muted)]/15 last:border-0">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/60">
        <span className={`cmdline shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        <span className="cmdline shrink-0">{entry.time}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{summary}</span>
        <EngineTag engine={entry.engine} />
        {typeof entry.passedMonths === 'number' && entry.passedMonths > 0 && (
          <span className="shrink-0 rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-800">
            {Number(entry.passedMonths.toFixed(1))}月
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 pb-3">
          <EntryCard entry={entry} interactive={false} />
        </div>
      )}
    </div>
  )
}

export function StoryLog() {
  const { log, busy, error, submitAction, clearError, turnError } = useGame()
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
      {/* 回合执行失败（AI 报错/离线/未配置）→ 停留当前卡片，手动重试 */}
      {turnError && (
        <div className={`panel ${turnError.offline ? 'panel--warn' : 'panel--warn'} px-4 py-3`}>
          <p className="danger-line">
            {turnError.offline ? '📡 网络离线，剧情暂停' : '⚠ 天道推演失败'}：{turnError.message}
          </p>
          <p className="cmdline mt-1 text-xs">当前回合未推进，可手动重试。</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => submitAction(turnError.action)}
              disabled={busy}
              className="rounded-lg bg-[color:var(--theme-color)] px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy ? '重试中…' : '重试'}
            </button>
            {turnError.message.includes('未配置叙事引擎') && (
              <button
                onClick={() => useGame.setState({ screen: 'settings' })}
                className="rounded-lg border border-[color:var(--theme-color)] px-4 py-1.5 text-sm"
              >
                去设置
              </button>
            )}
          </div>
        </div>
      )}
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

      {/* 历史回合模态弹窗（只读；紧凑摘要列表，点击展开全文） */}
      {historyOpen && (
        <div className="fixed inset-0 z-[60] flex overflow-y-auto bg-black/30 p-4" onClick={() => setHistoryOpen(false)}>
          <div className="m-auto w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <section className="panel">
              <header className="panel-title flex items-center justify-between">
                <span>历史回合 · 共 {log.length} 回合</span>
                <span className="text-sm font-normal opacity-90">点击条目展开全文（只读）</span>
              </header>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {log.map((e) => (
                  <SummaryRow key={e.id} entry={e} />
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
