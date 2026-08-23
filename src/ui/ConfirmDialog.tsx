/** 宣纸风格确认弹窗 —— 覆盖/删除/读档等防误操作统一使用 */

import { Panel } from './Panel'
import type { SceneThemeKey } from './theme'

interface Props {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（红色确认钮） */
  danger?: boolean
  theme?: SceneThemeKey
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmText = '确认', cancelText = '取消', danger, theme = 'qingyu', onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <Panel theme={danger ? 'zhusha' : theme} variant={danger ? 'warn' : 'normal'} title={title} className="w-full">
          <p className="text-sm leading-relaxed">{message}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={onConfirm}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold text-white ${
                danger ? 'bg-[color:var(--val-hp)]' : 'bg-[color:var(--theme-color)]'
              }`}
            >
              {confirmText}
            </button>
            <button onClick={onCancel} className="rounded-lg border border-[color:var(--ink-muted)]/40 px-4 py-2 text-sm">
              {cancelText}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
