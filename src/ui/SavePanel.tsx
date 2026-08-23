/** 存档面板 —— 3 槽（含剧情流）+ 自动存档 + 事件快照说明 + JSON 导入导出
 *  防误操作：覆盖确认 / 删除确认 / 读档覆盖当前进度确认 / 成功提示 */

import { useRef, useState } from 'react'
import { useGame } from '../game/store'
import {
  saveToSlot, loadFromSlot, clearSlot, exportJson, importJson, listSlots, fmtSavedAt,
} from '../game/save'
import { Panel } from './Panel'
import { ConfirmDialog } from './ConfirmDialog'

export function SavePanel({ onClose }: { onClose: () => void }) {
  const { game, log, pendingOptions } = useGame()
  const [slots, setSlots] = useState(listSlots())
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'overwrite' | 'delete' | 'load'; slot: number; title: string; message: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = () => setSlots(listSlots())

  const lastScene = [...log].reverse().find((e) => e.scene)?.scene
  const extras = game ? { log, pendingOptions, scene: lastScene } : undefined

  const tip = (text: string, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  const requestSave = (i: number) => {
    if (!game) return
    if (slots[i]) {
      setConfirm({
        kind: 'overwrite', slot: i, title: '覆盖存档',
        message: `槽位 ${i + 1} 已有存档（${slots[i]!.meta.summary}，${fmtSavedAt(slots[i]!.meta.savedAt)}）。确定覆盖？`,
      })
    } else {
      doSave(i)
    }
  }

  const doSave = (i: number) => {
    if (!game) return
    const p = game.player
    const r = saveToSlot(game, i + 1, `${p.daoName} · ${p.realm}·${p.stage} · 回合${game.turn}`, extras)
    if (r.ok) tip(`已存入第 ${i + 1} 槽（含剧情流）`)
    else tip(r.error ?? '存档失败', false)
    setConfirm(null)
    refresh()
  }

  const requestLoad = (i: number) => {
    const f = loadFromSlot(i + 1)
    if (!f) return
    if (game && log.length > 0) {
      setConfirm({
        kind: 'load', slot: i, title: '读档',
        message: `读档将覆盖当前进度，确定载入槽位 ${i + 1}（${f.meta.summary}）？`,
      })
    } else {
      doLoad(f)
    }
  }

  const doLoad = (f: NonNullable<ReturnType<typeof loadFromSlot>>) => {
    useGame.setState({
      screen: 'play',
      game: f.state,
      log: (f.log as typeof log | undefined) ?? [],
      pendingOptions: (f.pendingOptions as typeof pendingOptions | undefined) ?? [],
      error: null,
      snapshotOffer: null,
      restoredTurn: null,
    })
    tip('读档成功')
    setConfirm(null)
    onClose()
  }

  const requestDelete = (i: number) => {
    setConfirm({
      kind: 'delete', slot: i, title: '删除存档',
      message: `确定删除槽位 ${i + 1}（${slots[i]?.meta.summary}）？此操作不可撤销。`,
    })
  }

  const doDelete = (i: number) => {
    clearSlot(i + 1)
    tip('已删除')
    setConfirm(null)
    refresh()
  }

  const doExport = () => {
    if (!game) return
    const blob = new Blob([exportJson(game, '存档', extras)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `问道长生-存档-回合${game.turn}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    tip('已导出 JSON 存档（含剧情流）')
  }

  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const f = importJson(String(reader.result))
      if (f) {
        useGame.setState({
          screen: 'play',
          game: f.state,
          log: (f.log as typeof log | undefined) ?? [],
          pendingOptions: (f.pendingOptions as typeof pendingOptions | undefined) ?? [],
          error: null,
          snapshotOffer: null,
          restoredTurn: null,
        })
        tip('导入成功')
        onClose()
      } else {
        tip('导入失败：不是有效的存档文件', false)
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
                {game && (
                  <button onClick={() => requestSave(i)} className="rounded bg-[color:var(--theme-color)] px-2 py-1 text-xs text-white">
                    存
                  </button>
                )}
                {s && (
                  <>
                    <button onClick={() => requestLoad(i)} className="rounded border border-[color:var(--theme-color)] px-2 py-1 text-xs">
                      读
                    </button>
                    <button onClick={() => requestDelete(i)} className="rounded border border-[color:var(--val-hp)]/50 px-2 py-1 text-xs text-[color:var(--val-hp)]">
                      删
                    </button>
                  </>
                )}
              </div>
            ))}
            <p className="cmdline text-xs">自动存档：每 30 回合 · 事件快照：突破/战斗前（失败可回退）· 现场会话：每回合（刷新恢复）</p>
            <div className="flex gap-2">
              <button onClick={doExport} disabled={!game} className="flex-1 rounded-lg border border-[color:var(--theme-color)] px-3 py-2 text-sm disabled:opacity-40">
                导出 JSON
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex-1 rounded-lg border border-[color:var(--theme-color)] px-3 py-2 text-sm">
                导入存档
              </button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
            </div>
            {msg && (
              <p className={`text-xs ${msg.ok ? '' : 'danger-line'}`} style={msg.ok ? { color: 'var(--val-merit)' } : undefined}>
                {msg.ok ? '✅ ' : '❌ '}{msg.text}
              </p>
            )}
            <button onClick={onClose} className="rounded-lg bg-[color:var(--theme-color)] px-3 py-2 text-sm text-white">
              关闭
            </button>
          </div>
        </Panel>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          danger={confirm.kind === 'delete'}
          confirmText={confirm.kind === 'overwrite' ? '覆盖' : confirm.kind === 'delete' ? '删除' : '读档'}
          onConfirm={() => {
            if (confirm.kind === 'overwrite') doSave(confirm.slot)
            else if (confirm.kind === 'delete') doDelete(confirm.slot)
            else {
              const f = loadFromSlot(confirm.slot + 1)
              if (f) doLoad(f)
            }
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
