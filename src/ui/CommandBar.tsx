/** 底部指令栏 —— 自由输入 + 常驻指令行（对应原文铁律 7） */

import { useState } from 'react'
import { useGame } from '../game/store'

const QUICK_CMDS = ['修炼', '突破', '悟道', '洞府', '地图', '背包', '坊市', '宗门', '技艺', '情缘', '对话', '存档', '帮助']

export function CommandBar() {
  const [input, setInput] = useState('')
  // 选择器订阅：只订阅 busy 与提交函数，避免每回合全量重渲染
  const busy = useGame((s) => s.busy)
  const submitAction = useGame((s) => s.submitAction)

  const send = (text: string) => {
    const v = text.trim()
    if (!v || busy) return
    void submitAction(v)
    setInput('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          disabled={busy}
          placeholder="输入你的行动（也可自由描述任意行为）…"
          className="flex-1 rounded-lg border border-[color:var(--theme-color)]/50 bg-white/95 px-3 py-2 text-sm outline-none focus:border-[color:var(--theme-color)] disabled:opacity-50"
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-[color:var(--theme-color)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          行动
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_CMDS.map((c) => (
          <button
            key={c}
            disabled={busy}
            onClick={() => send(c)}
            className="rounded-md border border-[color:var(--theme-color)]/30 px-2 py-0.5 text-xs text-[color:var(--ink-muted)] hover:bg-white/95 disabled:opacity-40"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
