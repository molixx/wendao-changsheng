/** 余额徽标 —— 标题页/主界面常驻：显示 ¥xx.xx，点击展开详情；每 10 分钟自动刷新（localStorage 缓存） */

import { useEffect, useState } from 'react'
import { useGame } from '../game/store'
import {
  queryBalance, getCachedBalance, clearBalanceCache,
  totalBalanceOf, isLowBalance, BALANCE_TTL, type BalanceResult,
} from '../game/narrator/balance'
import { Panel } from './Panel'

export function BalanceBadge() {
  const { settings } = useGame()
  const [result, setResult] = useState<BalanceResult | null>(getCachedBalance())
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)

  const canQuery = settings.useLlm && (settings.apiKey ?? '').trim().length > 0 && /deepseek\.com$/i.test((settings.baseUrl ?? '').replace(/\/+$/, ''))

  const refresh = async (force = false) => {
    if (!canQuery) return
    setLoading(true)
    if (force) clearBalanceCache()
    const r = await queryBalance(settings.baseUrl, settings.apiKey)
    setResult(r)
    setLastRefresh(Date.now())
    setLoading(false)
  }

  // 挂载时：无缓存/缓存过期则查询；随后每 10 分钟自动刷新
  useEffect(() => {
    if (!canQuery) return
    if (!getCachedBalance()) void refresh()
    const timer = setInterval(() => void refresh(), BALANCE_TTL)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.baseUrl, settings.apiKey, settings.useLlm])

  if (!canQuery) return null

  const total = result?.ok ? totalBalanceOf(result) : null
  const low = result?.ok ? isLowBalance(result) : false

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
          low ? 'border-[color:var(--val-hp)] bg-[color:var(--paper-warn)] text-[color:var(--val-hp)]'
          : 'border-[color:var(--theme-color)]/50 bg-[color:var(--paper)]/90 text-[color:var(--ink)]'
        }`}
        title="DeepSeek 余额（点击查看详情）"
      >
        <span aria-hidden>⛰</span>
        {loading && !total ? '余额…' : total !== null ? `¥${total.toFixed(2)}` : '余额'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <Panel theme={low ? 'zhusha' : 'liujin'} variant={low ? 'warn' : 'normal'} title="DeepSeek 余额" className="w-full">
              {result?.ok ? (
                <div className="space-y-2 text-sm">
                  {result.infos?.map((b) => (
                    <div key={b.currency} className="rounded-lg bg-white/60 px-3 py-2">
                      <p className="flex items-center justify-between">
                        <span className="cmdline">{b.currency}</span>
                        <span className={`text-lg font-bold ${low ? 'text-[color:var(--val-hp)]' : ''}`}>
                          ¥{Number(b.totalBalance).toFixed(2)}
                        </span>
                      </p>
                      <p className="cmdline text-xs mt-1">赠送 {Number(b.grantedBalance).toFixed(2)} · 充值 {Number(b.toppedUpBalance).toFixed(2)}</p>
                    </div>
                  ))}
                  <p className={`text-xs ${result.isAvailable === false ? 'danger-line' : 'cmdline'}`}>
                    账户状态：{result.isAvailable === false ? '不可用' : '可用'}
                  </p>
                  {low && <p className="danger-line text-xs">⚠ 余额已低于 ¥10，注意补充，以免游玩中断。</p>}
                  {lastRefresh && <p className="cmdline text-xs">查询于 {new Date(lastRefresh).toLocaleTimeString('zh-CN', { hour12: false })}</p>}
                </div>
              ) : (
                <p className="danger-line text-sm">❌ {result?.error ?? '查询失败'}</p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void refresh(true)}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-[color:var(--theme-color)] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {loading ? '查询中…' : '刷新余额'}
                </button>
                <button onClick={() => setOpen(false)} className="rounded-lg border border-[color:var(--ink-muted)]/40 px-4 py-2 text-sm">
                  关闭
                </button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
