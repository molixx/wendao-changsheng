/** 叙事引擎设置页 —— 可配置 OpenAI 兼容端点（默认 DeepSeek），key 存 localStorage
 *  含「测试连接」：校验端点 / Key / 模型是否调得通；「查询余额」：DeepSeek 余额 */

import { useState } from 'react'
import { useGame } from '../game/store'
import { testConnection, type ConnTestResult } from '../game/narrator/llm'
import { queryBalance, clearBalanceCache, isLowBalance, type BalanceResult } from '../game/narrator/balance'
import { Panel } from './Panel'

/** 清除本游戏全部本地数据（设置/现场进度/手动存档/自动存档/快照/余额缓存） */
function clearAllLocalData(): boolean {
  const keys = Object.keys(localStorage).filter((k) => k === 'wendao-changsheng' || k.startsWith('wdcd.'))
  keys.forEach((k) => localStorage.removeItem(k))
  return keys.length > 0
}

export function SettingsPanel() {
  const { settings, setSettings, toScreen } = useGame()
  const [form, setForm] = useState(settings)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnTestResult | null>(null)
  const [balLoading, setBalLoading] = useState(false)
  const [balResult, setBalResult] = useState<BalanceResult | null>(null)

  const save = () => {
    setSettings(form)
    toScreen('title')
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    const r = await testConnection(form.baseUrl, form.apiKey, form.model)
    setTestResult(r)
    setTesting(false)
  }

  const runBalance = async () => {
    setBalLoading(true)
    setBalResult(null)
    clearBalanceCache()
    const r = await queryBalance(form.baseUrl, form.apiKey)
    setBalResult(r)
    setBalLoading(false)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <Panel theme="qingyu" title="叙事引擎设置" subtitle="OpenAI 兼容" className="w-full">
        <div className="flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="cmdline">API Base URL</span>
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              className="rounded-lg border border-[color:var(--theme-color)]/40 bg-white/95 px-3 py-2 outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="cmdline">API Key（仅存本机浏览器）</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="sk-…"
              className="rounded-lg border border-[color:var(--theme-color)]/40 bg-white/95 px-3 py-2 outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="cmdline">模型</span>
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="rounded-lg border border-[color:var(--theme-color)]/40 bg-white/95 px-3 py-2 outline-none"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.useLlm}
              onChange={(e) => setForm({ ...form, useLlm: e.target.checked })}
            />
            <span>使用 LLM 叙事（关闭则离线模式）</span>
          </label>

          {/* 测试连接 */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={runTest}
              disabled={testing || !form.apiKey.trim()}
              className="rounded-xl border border-[color:var(--theme-color)] px-4 py-2 font-bold text-[color:var(--theme-color)] disabled:opacity-40"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult?.ok && (
              <span className="text-sm font-bold" style={{ color: 'var(--val-merit)' }}>
                ✅ 连接成功 · {testResult.model} · {testResult.latencyMs}ms
              </span>
            )}
            {testResult && !testResult.ok && (
              <span className="danger-line text-sm">❌ {testResult.error}</span>
            )}
          </div>

          {/* 查询余额 */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={runBalance}
              disabled={balLoading || !form.apiKey.trim()}
              className="rounded-xl border border-[color:var(--theme-color)] px-4 py-2 font-bold text-[color:var(--theme-color)] disabled:opacity-40"
            >
              {balLoading ? '查询中…' : '查询余额'}
            </button>
            {balResult?.ok && balResult.infos?.[0] && (
              <span
                className={`text-sm font-bold ${isLowBalance(balResult) ? 'danger-line' : ''}`}
                style={!isLowBalance(balResult) ? { color: 'var(--val-merit)' } : undefined}
              >
                ✅ {balResult.infos[0].currency} 余额 ¥{Number(balResult.infos[0].totalBalance).toFixed(2)}
                {isLowBalance(balResult) ? '（⚠ 低于 ¥10）' : ''}
                {' · '}赠送 {Number(balResult.infos[0].grantedBalance).toFixed(2)} · 充值 {Number(balResult.infos[0].toppedUpBalance).toFixed(2)}
              </span>
            )}
            {balResult && !balResult.ok && (
              <span className="danger-line text-sm">❌ {balResult.error}</span>
            )}
          </div>

          <p className="cmdline">
            未配置 Key 或调用失败时自动降级为离线叙事库，游戏不会卡死。
          </p>
          <div className="flex gap-3">
            <button onClick={save} className="flex-1 rounded-xl bg-[color:var(--theme-color)] px-4 py-2.5 font-bold text-white">
              保存
            </button>
            <button onClick={() => toScreen('title')} className="rounded-xl border border-[color:var(--ink-muted)]/40 px-4 py-2.5 text-sm">
              返回
            </button>
          </div>

          {/* 清除全部本地数据（危险区） */}
          <div className="mt-2 border-t border-[color:var(--ink-muted)]/30 pt-4">
            <button
              onClick={() => {
                if (!window.confirm('确定清除全部本地数据？\n\n将删除：叙事引擎设置（API Key）、现场进度、全部手动存档、自动存档与快照，且不可恢复。\n\n确认后请刷新页面。')) return
                const cleared = clearAllLocalData()
                window.alert(cleared ? '已清除全部本地数据，请刷新页面（F5）以全新状态开始。' : '没有发现本地数据。')
              }}
              className="w-full rounded-xl border border-red-600/60 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-600/10"
            >
              ⚠ 清除全部本地数据（存档 / 进度 / API Key）
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
