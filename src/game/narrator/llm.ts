/** LLM 叙事客户端 —— OpenAI 兼容 /chat/completions，JSON Output */

import type { NarratorSettings } from '../state'

/** 叙事引擎每回合返回的结构化结果（前端校验后应用，代码是数值唯一权威） */
export interface NarratorTurn {
  /** 剧情推进 1~3 句 */
  narrative: string
  /** 选项（3~5 个，AI 按情境生成） */
  options: { text: string; tag?: string }[]
  /** 本回合推进月数（默认 1；闭关等可大于 1） */
  timePassedMonths?: number
  /** 场景主题（qingyu/xuanzi/zhusha/taofen/ziqi/liujin/tianqing/zhuqing） */
  scene?: string
  /** 可选数值变化建议（仅参考，前端按世界规则校验后决定是否采纳） */
  deltas?: Record<string, number>
}

/** 是否含 LaTeX/Markup 特征（需要清洗） */
export function hasLatexMarkup(text: string): boolean {
  return /\\fcolorbox|\\textcolor|\\colorbox|\\begin\{array\}|\\\(|\\\[|\\texttt|\\textbf|\\textit|#[0-9A-Fa-f]{6}/.test(text)
}

/** 剥离 LaTeX 命令壳、保留语义文字：
 *  \textcolor{色}{内容} / \colorbox{底}{内容} / \fcolorbox{边}{底}{内容} → 内容
 *  \begin{array}...\end{array} → 内部（\\ 变换行）；\(...\)、{#HEX} → 剥除 */
export function sanitizeNarrative(text: string): string {
  if (!text) return ''
  let t = text
  t = t.replace(/\\\(/g, '').replace(/\\\)/g, '').replace(/\\\[/g, '').replace(/\\\]/g, '')
  t = t.replace(/\\begin\{array\}\{[^}]*\}/g, '').replace(/\\end\{array\}/g, '')
  t = t.replace(/\\\\/g, '\n')
  t = t.replace(/\{#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\}/g, '')
  // 去掉所有 \命令（含 \quad \textcolor 等），保留 {内容}
  t = t.replace(/\\(?:[a-zA-Z]+|.)/g, '')
  // 去掉残留的花括号
  t = t.replace(/[{}]/g, '')
  t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return t
}

/** 选项基本卫生：去空 / 去重 / 限 3~5 个（长度不限，AI 全生成） */
export function sanitizeOptions(list: { text?: string; tag?: string }[] | undefined): { text: string; tag?: string }[] {
  if (!list) return []
  const seen = new Set<string>()
  const out: { text: string; tag?: string }[] = []
  for (const o of list) {
    const text = (o?.text ?? '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push({ text, tag: o.tag })
    if (out.length >= 5) break
  }
  return out
}

export interface NarratorMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 组装 system 提示：世界观 + 压缩世界快照 + 输出协议 */
export function buildSystemPrompt(worldBible: string, worldSnapshot: string): string {
  return `${worldBible}

【当前世界状态快照】
${worldSnapshot}

【输出协议】
你每回合必须且只能输出一个 JSON 对象（不要输出任何 JSON 之外的内容），格式：
{
  "narrative": "剧情推进，1~3 句，符合修仙文风；必须是纯中文文字",
  "options": [ {"text": "选项文字（长度不限，一句话行动）", "tag": "平和|机缘|风险|情缘|魔道"} × 3~5 ],
  "timePassedMonths": 1,
  "scene": "qingyu|xuanzi|zhusha|taofen|ziqi|liujin|tianqing|zhuqing",
  "deltas": {}
}
铁律：narrative 禁止输出任何 LaTeX / Markdown / HTML 标记（\fcolorbox、\textcolor、\colorbox、\begin{array}、\(...\)、#FFFFFF、代码块、加粗星号等一律禁止），界面由前端渲染，你只负责纯文字叙事；只推进 1 个事件节点；不替玩家决定重大事件（只以选项呈现）；数值变动以 deltas 给出但最终由系统结算；玩家可自由输入任意行动，你必须在世界逻辑内响应；真实修仙界会死、不暗中放水。`
}

/** 连接测试结果 */
export interface ConnTestResult {
  ok: boolean
  model?: string
  latencyMs?: number
  error?: string
}

/** 测试 API 连通性：发一个最小请求，校验端点 / Key / 模型 / 延迟 */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<ConnTestResult> {
  const t0 = performance.now()
  const base = baseUrl.replace(/\/+$/, '')
  try {
    const isDeepSeek = /deepseek\.com$/i.test(base)
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: '回复 OK 即可' }],
      max_tokens: 8,
      temperature: 0,
    }
    // DeepSeek 默认开思考模式：关闭以降低延迟/成本
    if (isDeepSeek) body.thinking = { type: 'disabled' }
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const latencyMs = Math.round(performance.now() - t0)
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300)
      return { ok: false, latencyMs, error: `HTTP ${res.status}：${text}` }
    }
    const data = (await res.json()) as { model?: string }
    return { ok: true, latencyMs, model: data.model ?? model }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // 浏览器跨域被拦 / 网络不通时 fetch 抛 "Failed to fetch"
    const err = /Failed to fetch|NetworkError|load failed|ERR_/i.test(msg)
      ? '无法连接到该地址（网络不通，或浏览器跨域被拦截——可尝试换本地代理）'
      : msg
    return { ok: false, error: err }
  }
}

/** 发起一次补全请求并取回 content 文本；空内容（模型偶发）自动重试一次 */
async function fetchContent(settings: NarratorSettings, body: Record<string, unknown>): Promise<string> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}：${(await res.text()).slice(0, 200)}`)
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const content = data.choices?.[0]?.message?.content ?? ''
      if (content.trim()) return content
      lastErr = new Error('LLM 返回为空内容')
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (!/返回为空|Failed to fetch|NetworkError/i.test(lastErr.message)) throw lastErr // 网络级错误不重试
    }
  }
  throw lastErr ?? new Error('LLM 请求失败')
}

/** 系统指令的 AI 演绎 + 选项生成：代码结算结果 → AI 写成叙事 + 3~5 个情境选项（JSON） */
export async function narrateSystem(
  settings: NarratorSettings,
  system: string,
  history: NarratorMessage[],
  action: string,
  resultSummary: string,
): Promise<NarratorTurn> {
  const isDeepSeek = /deepseek\.com$/i.test(settings.baseUrl.replace(/\/+$/, ''))
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [
      {
        role: 'system',
        content: `${system}\n\n【本轮任务】玩家执行了行动「${action}」，系统已结算数值（结果见玩家消息）。请：
1. 用 1~3 句修仙文风把结算结果演绎成剧情叙述：不要罗列数字清单、不要重复结算原文，直接写出情境与人物动作。
2. 依据当前情境生成 3~5 个下一步选项（每个一句话行动，长度不限，可选语义标签：平和/机缘/风险/情缘/魔道）。
只输出一个 JSON 对象：{"narrative": "...", "options": [{"text": "...", "tag": "平和"}]}，不要输出 JSON 之外的任何内容。`,
      },
      ...history,
      { role: 'user', content: `结算结果：${resultSummary}` },
    ],
    response_format: { type: 'json_object' },
    temperature: settings.temperature,
    max_tokens: 800,
  }
  if (isDeepSeek) body.thinking = { type: 'disabled' }
  const content = await fetchContent(settings, body)
  try {
    const parsed = JSON.parse(content) as NarratorTurn
    const rawNarrative = typeof parsed.narrative === 'string' ? parsed.narrative : ''
    const narrative = sanitizeNarrative(rawNarrative)
    return { narrative, options: sanitizeOptions(parsed.options) }
  } catch {
    // 内容非 JSON：若可读则当纯文本叙事（系统指令侧由调用方回退模板叙事）
    return { narrative: content.trim() ? sanitizeNarrative(content).slice(0, 300) : '', options: [] }
  }
}

/** 调用 OpenAI 兼容端点 */
export async function callNarrator(
  settings: NarratorSettings,
  system: string,
  history: NarratorMessage[],
  userAction: string,
): Promise<NarratorTurn> {
  const isDeepSeek = /deepseek\.com$/i.test(settings.baseUrl.replace(/\/+$/, ''))
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [
      { role: 'system', content: system },
      ...history,
      { role: 'user', content: userAction },
    ],
    response_format: { type: 'json_object' },
    temperature: settings.temperature,
    max_tokens: 1024,
  }
  // DeepSeek 默认开启思考模式：关闭以降低延迟/成本并让 temperature 生效
  if (isDeepSeek) {
    body.thinking = { type: 'disabled' }
  }
  const content = await fetchContent(settings, body)
  try {
    const parsed = JSON.parse(content) as NarratorTurn
    const rawNarrative = typeof parsed.narrative === 'string' ? parsed.narrative : ''
    const narrative = sanitizeNarrative(rawNarrative)
    if (!narrative) {
      throw new Error(hasLatexMarkup(rawNarrative) ? 'LLM 返回 LaTeX 且清洗后无可用文本' : 'LLM 返回的 narrative 为空')
    }
    return { ...parsed, narrative, options: sanitizeOptions(parsed.options) }
  } catch (e) {
    if (e instanceof SyntaxError) {
      // 兜底：内容不是合法 JSON 时退化为纯文本回合
      return { narrative: sanitizeNarrative(content).slice(0, 200), options: [], timePassedMonths: 1 }
    }
    throw e
  }
}
