/** 余额查询 —— 默认 DeepSeek 模板（GET /user/balance），带 localStorage 缓存 */

export interface BalanceInfo {
  currency: string
  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
}

export interface BalanceResult {
  ok: boolean
  isAvailable?: boolean
  infos?: BalanceInfo[]
  queriedAt?: number
  error?: string
}

const CACHE_KEY = 'wdcd.balance'
/** 缓存/自动刷新周期：10 分钟 */
export const BALANCE_TTL = 10 * 60 * 1000
/** 低余额预警阈值（元） */
export const LOW_BALANCE_WARN = 10

/** 是否 DeepSeek 官方端点（余额接口模板以此识别） */
export function isDeepSeekBase(baseUrl: string): boolean {
  return /deepseek\.com$/i.test(baseUrl.replace(/\/+$/, ''))
}

function readCache(): BalanceResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const r = JSON.parse(raw) as BalanceResult
    if (!r || !r.queriedAt) return null
    return r
  } catch {
    return null
  }
}

function writeCache(r: BalanceResult): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(r))
  } catch {
    /* 缓存失败不影响查询 */
  }
}

/** 读取未过期的缓存余额（无/过期返回 null） */
export function getCachedBalance(): BalanceResult | null {
  const c = readCache()
  if (c && c.ok && c.queriedAt && Date.now() - c.queriedAt < BALANCE_TTL) return c
  return null
}

export function clearBalanceCache(): void {
  localStorage.removeItem(CACHE_KEY)
}

/** 查询余额（缓存未过期时直接返回缓存） */
export async function queryBalance(baseUrl: string, apiKey: string): Promise<BalanceResult> {
  const cached = getCachedBalance()
  if (cached) return cached

  const base = baseUrl.replace(/\/+$/, '')
  if (!isDeepSeekBase(base)) {
    return { ok: false, error: '该服务商无标准余额接口（当前仅支持 DeepSeek 的 /user/balance）' }
  }
  if (!apiKey.trim()) return { ok: false, error: '未配置 API Key' }

  try {
    const res = await fetch(`${base}/user/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300)
      return { ok: false, error: `HTTP ${res.status}：${text}` }
    }
    const data = (await res.json()) as {
      is_available?: boolean
      balance_infos?: { currency?: string; total_balance?: string; granted_balance?: string; topped_up_balance?: string }[]
    }
    const infos: BalanceInfo[] = (data.balance_infos ?? []).map((b) => ({
      currency: b.currency ?? 'CNY',
      totalBalance: b.total_balance ?? '0',
      grantedBalance: b.granted_balance ?? '0',
      toppedUpBalance: b.topped_up_balance ?? '0',
    }))
    const result: BalanceResult = { ok: true, isAvailable: !!data.is_available, infos, queriedAt: Date.now() }
    writeCache(result)
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const err = /Failed to fetch|NetworkError|load failed/i.test(msg)
      ? '无法连接到该地址（网络不通或跨域被拦截）'
      : msg
    return { ok: false, error: err }
  }
}

/** 计算单个币种的总余额数值 */
export function totalBalanceOf(r: BalanceResult): number {
  const first = r.infos?.[0]
  return first ? Number(first.totalBalance) || 0 : 0
}

/** 是否存在低余额预警（首个币种 < 阈值） */
export function isLowBalance(r: BalanceResult): boolean {
  const t = totalBalanceOf(r)
  return t >= 0 && t < LOW_BALANCE_WARN
}
