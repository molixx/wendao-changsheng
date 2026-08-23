/** 全局错误边界 —— 任何组件崩溃时显示提示而不是白屏 */

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(e: unknown): State {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-lg font-bold">道途受阻（界面出错）</p>
          <p className="cmdline text-sm break-all">{this.state.error}</p>
          <button
            onClick={() => {
              // 清理本机可能损坏的残留数据后重载
              try {
                localStorage.removeItem('wendao-changsheng')
                localStorage.removeItem('wdcd.session')
                localStorage.removeItem('wdcd.snapshot')
                localStorage.removeItem('wdcd.balance')
              } catch {
                /* ignore */
              }
              location.reload()
            }}
            className="rounded-xl bg-[color:var(--theme-color)] px-4 py-2 text-sm font-bold text-white"
          >
            清理残留数据并重载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
