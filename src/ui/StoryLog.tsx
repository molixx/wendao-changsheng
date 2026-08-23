/** 剧情流 —— 回合记录 + 选项钮 + 错误提示 */

import { useGame } from '../game/store'
import { GoldLine, Tag } from './Panel'

export function StoryLog() {
  const { log, busy, error, submitAction, clearError } = useGame()

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
          {entry.options.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {entry.options.map((opt, i) => (
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

      <GoldLine />
    </div>
  )
}
