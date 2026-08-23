/** LLM 叙事客户端 —— OpenAI 兼容 /chat/completions，JSON Output */

import type { NarratorSettings } from '../state'

/** 叙事引擎每回合返回的结构化结果（前端校验后应用，代码是数值唯一权威） */
export interface NarratorTurn {
  /** 剧情推进 1~3 句 */
  narrative: string
  /** 选项（3~4 个） */
  options: { text: string; tag?: string }[]
  /** 本回合推进月数（默认 1；闭关等可大于 1） */
  timePassedMonths?: number
  /** 场景主题（qingyu/xuanzi/zhusha/taofen/ziqi/liujin/tianqing/zhuqing） */
  scene?: string
  /** 可选数值变化建议（仅参考，前端按世界规则校验后决定是否采纳） */
  deltas?: Record<string, number>
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
  "narrative": "剧情推进，1~3 句，符合修仙文风",
  "options": [ {"text": "选项文字（最多18字）", "tag": "平和|机缘|风险|情缘|魔道"} × 3~4 ],
  "timePassedMonths": 1,
  "scene": "qingyu|xuanzi|zhusha|taofen|ziqi|liujin|tianqing|zhuqing",
  "deltas": {}
}
铁律：只推进 1 个事件节点；不替玩家决定重大事件（只以选项呈现）；数值变动以 deltas 给出但最终由系统结算；玩家可自由输入任意行动，你必须在世界逻辑内响应；真实修仙界会死、不暗中放水。`
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

/** 系统指令的 AI 演绎：代码结算结果 → LLM 写成 1~3 句修仙文风叙事（纯文本，非 JSON） */
export async function narrateSystem(
  settings: NarratorSettings,
  system: string,
  history: NarratorMessage[],
  action: string,
  resultSummary: string,
): Promise<string> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  const isDeepSeek = /deepseek\.com$/i.test(base)
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [
      { role: 'system', content: `${system}\n\n【本轮任务】玩家执行了行动「${action}」，系统已结算数值。请用 1~3 句修仙文风，把结算结果演绎成剧情叙述：不要罗列数字清单、不要重复结算原文，直接写出情境与人物动作。只输出叙述文本，不要任何 JSON 或标记。` },
      ...history,
      { role: 'user', content: `结算结果：${resultSummary}` },
    ],
    temperature: settings.temperature,
    max_tokens: 300,
  }
  if (isDeepSeek) body.thinking = { type: 'disabled' }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`LLM 演绎失败（${res.status}）：${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('LLM 演绎返回为空')
  return content
}

/** 调用 OpenAI 兼容端点 */
export async function callNarrator(
  settings: NarratorSettings,
  system: string,
  history: NarratorMessage[],
  userAction: string,
): Promise<NarratorTurn> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  const isDeepSeek = /deepseek\.com$/i.test(base)
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
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`LLM 请求失败（${res.status}）：${(await res.text()).slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM 返回为空')
  try {
    return JSON.parse(content) as NarratorTurn
  } catch {
    // 兜底：内容不是合法 JSON 时退化为纯文本回合
    return { narrative: content.slice(0, 200), options: [], timePassedMonths: 1 }
  }
}
