/** 剧情流 —— 回合记录 + 选项钮（AI 生成）+ 固定「自由行动」入口（弹输入框）+ 错误提示 */

import { useState } from 'react'
import { useGame } from '../game/store'
import { Panel, GoldLine, Tag } from './Panel'

export function StoryLog() {
  const { log, busy, error, submitAction, clearError } = useGame()
  const [freeOpen, setFreeOpen] = useState(false)
  const [freeText, setFreeText] = useState('')

  const sendFree = () => {
    const v = freeText.trim()
    if (!v || busy) return
    setFreeOpen(false)
    setFreeText('')
    void submitAction(v)
  }

  return (
    <div className="flex flex-col gap-4">
      {log.map((entry) => (
        <article key={entry.id} className="panel px-4 py-3">
          <p className="cmdline flex items-center gap-2">
            <span>{entry.time}</span>
            {entry.action && <span className="text-[color:var(--ink-muted)]/80">「{entry.action.slice(0, 20)}」</span>}
            {entry.engine === 'llm' && (
              <span className="rounded px-1.5 text-xs font-bold" style={{ background: '#8B6FA8', color: '#fff' }}>天道</span>
            )}
            {entry.engine === 'code' && (
              <span className="rounded px-1.5 text-xs font-bold" style={{ background: '#8C8578', color: '#fff' }}>结算</span>
            )}
            {entry.engine === 'offline' && (
              <span className="rounded px-1.5 text-xs font-bold" style={{ background: '#C4675C', color: '#fff' }}>离线</span>
            )}
          </p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{entry.narrative}</p>
          {entry.deltas && entry.deltas.length > 0 && (
            <p className="cmdline mt-1">【数值变化】{entry.deltas.join(' · ')}</p>
          )}
          {entry.options && entry.options.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {(entry.options ?? []).map((opt, i) => (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() => submitAction(opt.text)}
                  className="text-left flex items-start gap-2 rounded-lg border border-[color:var(--theme-color)]/40 bg-white/90 px-3 py-2 hover:bg-white disabled:opacity-50 transition-colors"
                >
                  <span className="opt-btn">{String.fromCharCode(65 + i)}</span>
                  {opt.tag && <Tag text={opt.tag} />}
                  <span>{opt.text}</span>
                </button>
              ))}
            </div>
          )}
          {/* 固定「自由行动」入口（点击弹输入框） */}
          <button
            disabled={busy}
            onClick={() => setFreeOpen(true)}
            className="mt-2 w-full rounded-lg border border-dashed border-[color:var(--theme-color)]/50 px-3 py-1.5 text-sm text-[color:var(--ink-muted)] hover:bg-white/80 disabled:opacity-50"
          >
            ✎ 自由行动（输入任意行为）…
          </button>
        </article>
      ))}

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

      {/* 自由行动输入弹窗 */}
      {freeOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setFreeOpen(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Panel theme="qingyu" title="自由行动" subtitle="想做什么，便做什么" className="w-full">
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
            </Panel>
          </div>
        </div>
      )}

      <GoldLine />
    </div>
  )
}
