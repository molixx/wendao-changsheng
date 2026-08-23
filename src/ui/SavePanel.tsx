/** 存档面板 —— 3 槽 + 自动存档 + JSON 导出/导入 */

import { useRef, useState } from 'react'
import { useGame } from '../game/store'
import { saveToSlot, loadFromSlot, clearSlot, exportJson, importJson, listSlots } from '../game/save'
import { Panel } from './Panel'

export function SavePanel({ onClose }: { onClose: () => void }) {
  const { game, toScreen } = useGame()
  const [slots, setSlots] = useState(listSlots())
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => setSlots(listSlots())

  const doSave = (i: number) => {
    if (!game) return
    const p = game.player
    saveToSlot(game, i + 1, `${p.daoName} · ${p.realm}·${p.stage} · 回合${game.turn}`)
    setMsg(`已存入第 ${i + 1} 槽`)
    refresh()
  }

  const doLoad = (i: number) => {
    const f = loadFromSlot(i + 1)
    if (f) {
      toScreen('play')
      // 通过全局状态直接载入
      useGame.setState({ screen: 'play', game: f.state, log: [], pendingOptions: [], error: null })
      setMsg(`已读档第 ${i + 1} 槽`)
    }
  }

  const doClear = (i: number) => {
    clearSlot(i + 1)
    setMsg(`已清空第 ${i + 1} 槽`)
    refresh()
  }

  const doExport = () => {
    if (!game) return
    const blob = new Blob([exportJson(game, '存档')], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `问道长生-存档-回合${game.turn}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('已导出 JSON 存档')
  }

  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const f = importJson(String(reader.result))
      if (f) {
        useGame.setState({ screen: 'play', game: f.state, log: [], pendingOptions: [], error: null })
        setMsg('导入成功')
      } else {
        setMsg('导入失败：不是有效的存档文件')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Panel theme="qingyu" title="存档" className="w-full">
          <div className="flex flex-col gap-2">
            {slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-[color:var(--theme-color)]/30 bg-white/90 px-3 py-2">
                <span className="cmdline w-10">槽{i + 1}</span>
                <span className="flex-1 truncate text-sm">{s ? s.meta.summary : '空'}</span>
                {game && (
                  <button onClick={() => doSave(i)} className="rounded bg-[color:var(--theme-color)] px-2 py-1 text-xs text-white">
                    存
                  </button>
                )}
                {s && (
                  <>
                    <button onClick={() => doLoad(i)} className="rounded border border-[color:var(--theme-color)] px-2 py-1 text-xs">
                      读
                    </button>
                    <button onClick={() => doClear(i)} className="rounded border border-[color:var(--val-hp)]/50 px-2 py-1 text-xs text-[color:var(--val-hp)]">
                      清
                    </button>
                  </>
                )}
              </div>
            ))}
            <p className="cmdline">自动存档：每 30 回合 / 死亡回档</p>
            <div className="flex gap-2">
              <button onClick={doExport} disabled={!game} className="flex-1 rounded-lg border border-[color:var(--theme-color)] px-3 py-2 text-sm">
                导出 JSON
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 rounded-lg border border-[color:var(--theme-color)] px-3 py-2 text-sm"
              >
                导入存档
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
              />
            </div>
            {msg && <p className="cmdline">{msg}</p>}
            <button onClick={onClose} className="rounded-lg bg-[color:var(--theme-color)] px-3 py-2 text-sm text-white">
              关闭
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
