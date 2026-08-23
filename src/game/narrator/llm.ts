/** LLM 叙事客户端 —— OpenAI 兼容 /chat/completions，JSON Output */

import type { NarratorSettings } from '../state'

/** 叙事引擎每回合返回的结构化结果（前端校验后应用，代码是数值唯一权威） */
export interface NarratorTurn {
  /** 剧情推进（篇幅不限，AI 自由发挥） */
  narrative: string
  /** 本回合事件摘要（可选，20~40 字；用于历史快速浏览） */
  summary?: string
  /** 选项（数量/长度不限，AI 按情境生成） */
  options: { text: string; tag?: string; note?: string }[]
  /** 本回合推进月数（默认 1；闭关等可大于 1） */
  timePassedMonths?: number
  /** 场景主题（qingyu/xuanzi/zhusha/taofen/ziqi/liujin/tianqing/zhuqing） */
  scene?: string
  /** 可选数值变化建议（仅参考，前端按世界规则校验后决定是否采纳） */
  deltas?: Record<string, number>
}

/** 剥离 Markdown 代码块围栏（DeepSeek 常用 ```json ... ``` 包裹 JSON，直接 parse 必失败）后解析 JSON */
export function parseJsonContent(content: string): unknown {
  let t = (content ?? '').trim()
  // ```json\n...\n``` 或 ```\n...\n```
  const fence = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/)
  if (fence) t = fence[1].trim()
  return JSON.parse(t)
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

/** 选项基本卫生：去空 / 去重 / 软上限 8 个（AI 自由发挥）；保留可选备注 note */
export function sanitizeOptions(list: { text?: string; tag?: string; note?: string }[] | undefined): { text: string; tag?: string; note?: string }[] {
  if (!list) return []
  const seen = new Set<string>()
  const out: { text: string; tag?: string; note?: string }[] = []
  for (const o of list) {
    const text = (o?.text ?? '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push({
      text,
      tag: o.tag,
      note: typeof o.note === 'string' && o.note.trim() ? o.note.trim().slice(0, 40) : undefined,
    })
    if (out.length >= 4) break
  }
  return out
}

export interface NarratorMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 清洗 summary：剥掉开头可能混入的时间行（「入道一年·三月，」「天玄历387年 · 春，」等），截 60 字 */
export function sanitizeSummary(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  let t = s.trim()
  // 剥开头时间行（可带括号/全角括号）：入道X年[·X月][·X季]、天玄历X年[·X季]
  t = t.replace(
    /^[（(]?\s*(?:(?:入道|天玄历)\s*[一二三四五六七八九十百千万两元\d]+\s*年)\s*(?:[·,，]?\s*[一二三四五六七八九十两\d]+\s*月)?\s*(?:[·,，]?\s*[季春秋夏冬])?\s*[·,，、:：]?\s*[)）]?\s*/,
    '',
  )
  t = t.trim().slice(0, 60)
  return t || undefined
}

/** 组装 system 提示：世界观 + 压缩世界快照 + 输出协议 */
export function buildSystemPrompt(worldBible: string, worldSnapshot: string): string {
  return `${worldBible}

【当前世界状态快照】
${worldSnapshot}

【输出协议】
你每回合必须且只能输出一个 JSON 对象（不要输出任何 JSON 之外的内容），格式：
{
  "summary": "本回合事件简述（**必填，第一字段，先写它**！20~40 字一句话概括：发生了什么事、结果如何，如「闭关突破成功」「坊市购入聚气丹」「遭妖兽袭击重伤」。铁律：**禁止写「入道X年·X月」「天玄历X年」这类当前时间行**——时间行由前端自动显示；禁止截取 narrative 开头）",
  "narrative": "剧情推进，篇幅不限，可充分展开情境、心理、对话与细节；必须是纯中文文字",
  "options": [ {"text": "选项文字（长度、数量不限，3~4 个）", "tag": "可选简短语义标签，自由发挥，如 平和/机缘/风险/情缘/魔道/凶险/隐秘", "note": "可选备注，仅在你认为玩家需要关键补充信息时添加，如 价格/成功率/风险提示；否则省略该字段"} ],
  "timePassedMonths": 0,
  "deltas": {}
}
timePassedMonths（0~12，**必填数字，时间的唯一来源**）：你返回多少，游戏时间就推进多少；返回 0 表示本回合不流逝。**铁律：只要 narrative 中描述了任何时间流逝（赶路、闭关、疗伤、等待、修炼、赶集、养伤、云游…），timePassedMonths 就必须返回对应的正数，严禁叙事写了时间却返回 0 或漏掉该字段**。参照：瞬时事件（说话/闲逛/思索）→ 0；数日 → 0.3；半月 → 0.5；一月 → 1；数月 → 2~6；半年 → 6；一年 → 12。
（场景主题由前端按系统指令自动管理，你无需输出 scene 字段。）
选项必须贴合【当前世界状态快照】：结合玩家当前境界/修为/伤势/背包/灵石/冷却/关系等实际情况给出针对性建议（如修为将满时提示突破、有伤提示疗伤、灵石充足提示坊市、冷却中不提示突破），并在叙事中自然衔接当前状态，不要给出与状态矛盾的选项（如垂死时让玩家去探险）。
deltas 规则（可选，影响玩家状态卡）：前端会校验并钳制到合法范围：
- 数值：hp(气血)/mp(灵力)/cult(修为)/spirit(灵石)/merit(功德)/karma(业力)/lifespan(寿元)。**增量请写字符串带 + 号（如 "hp": "+20" 表示气血+20）；写负数为减；裸数字会被当作绝对值（直接设为该值）**
- stats（六维）：{"stats": {"悟性": 1, "道心": -1}}，范围 1~20
- affinity（好感）：{"affinity": {"顾清玄": 5}}，范围 0~100，NPC 用名字
- bag（物品）：{"bag": {"聚气丹": 1, "灵药": -1}}，正加负减，不能为负
- injury（伤势）：{"injury": "轻伤"} 或 {"injury": null} 清除
- status（附加异常）：{"status": ["中毒", "心魔缠身"]}，[] 清除
- mood（心境）：{"mood": 1.2}（0.5/1.0/1.2）
- enlightenment（悟道）：{"enlightenment": {"剑道": 1}}，1~9
- technique（技艺）：{"technique": {"炼丹": 1}}，1~5
- location（所在地）：{"location": "南疆·赤炎"}——玩家移动后必须同步（五洲名/宗门/秘境名，中文）
- mainQuest（主线）：{"mainQuest": "追寻上古洞府的线索"}——主线推进时更新（空字符串清除）
境界突破、宗门、修炼成长等重大系统变化请引导玩家使用对应指令，不要通过 deltas 声称。
铁律：narrative 禁止输出任何 LaTeX / Markdown / HTML 标记（\fcolorbox、\textcolor、\colorbox、\begin{array}、\(...\)、#FFFFFF、代码块、加粗星号等一律禁止），界面由前端渲染，你只负责纯文字叙事；只推进 1 个事件节点；不替玩家决定重大事件（只以选项呈现）；玩家可自由输入任意行动，你必须在世界逻辑内响应；真实修仙界会死、不暗中放水；剧情必须与上一回合结尾无缝衔接——保持所在场所、在场人物、进行中的事件完全一致，不得无端更换场景或另起剧情线（只有玩家行动明确导致场景变化时才变化）。`
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

/** 网络级错误：断网/请求发不出/超时 → 触发"离线冻结" */
export class OfflineError extends Error {
  constructor(msg = '网络离线，无法连接叙事引擎') {
    super(msg)
    this.name = 'OfflineError'
  }
}

export function isOfflineError(e: unknown): boolean {
  return e instanceof OfflineError
}

/** 发起一次补全请求并取回 content 文本；空内容（模型偶发）自动重试一次 */
async function fetchContent(settings: NarratorSettings, body: Record<string, unknown>): Promise<string> {
  const base = settings.baseUrl.replace(/\/+$/, '')
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}：${(await res.text()).slice(0, 200)}`)
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const content = data.choices?.[0]?.message?.content ?? ''
      if (content.trim()) return content
      lastErr = new Error('LLM 返回为空内容')
    } catch (e) {
      clearTimeout(timer)
      // TypeError = 网络断（fetch 发不出）→ 离线冻结；AbortError = 超时 → 业务错误（可重试，不算离线）
      if (e instanceof TypeError) lastErr = new OfflineError()
      else if (e instanceof DOMException && e.name === 'AbortError') lastErr = new Error('叙事引擎响应超时（30 秒），请重试')
      else if (e instanceof OfflineError) lastErr = e
      else lastErr = e instanceof Error ? e : new Error(String(e))
      if (!(lastErr instanceof OfflineError) && !/返回为空|超时/.test(lastErr.message)) {
        throw lastErr // HTTP 业务错误不重试
      }
      if (lastErr instanceof OfflineError) break // 断网重试无意义
    }
  }
  throw lastErr ?? new Error('LLM 请求失败')
}

/** 系统指令的 AI 演绎 + 选项生成：代码结算结果 → AI 写成叙事 + 情境选项（JSON） */
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
        content: `${system}\n\n【本轮任务】玩家刚刚执行了一个行动，系统已按世界规则结算数值（玩家行动与结算结果见最后一条 user 消息）。请：
1. 用修仙文风把结算结果演绎成剧情叙述：不要罗列数字清单、不要重复结算原文，直接写出情境、人物动作与细节，篇幅不限。
2. 依据当前情境生成下一步选项（数量、长度不限（3~4 个）；可带简短语义标签，自由发挥）。
3. 给出本回合流逝月数 timePassedMonths（0~12，**必填数字，时间的唯一来源**）：你返回多少，游戏时间就推进多少；返回 0 表示本回合不流逝。**铁律：narrative 中描述了时间流逝（闭关/赶路/疗伤/修炼/等待…），就必须返回对应正数，严禁叙事写了时间却返回 0 或漏填**（瞬时事件 0、数日 0.3、半月 0.5、一月 1、数月 2~6、半年 6、一年 12）。
4. 状态变化用 deltas 声明（可选）：系统已结算数值，你**不要**给 hp/mp/cult/spirit/merit/karma/lifespan 等数值字段（防双加）；但可以给非数值字段——{"injury": "轻伤"}（中文名：轻伤/重伤/垂死/内伤/中毒/心魔缠身，null 清除）、{"status": ["中毒"]}（字符串数组，[] 清除）、{"mood": 1.2}（0.5/1.0/1.2）、{"affinity": {"顾清玄": 5}}、{"bag": {"聚气丹": 1}}、{"enlightenment": {"剑道": 1}}、{"technique": {"炼丹": 1}}、{"location": "南疆·赤炎"}（玩家移动后必须同步）、{"mainQuest": "..."}。
5. 给出 summary（**必填**）：20~40 字一句话概述本回合剧情（发生什么/结果如何），禁止截取 narrative 开头。
只输出一个 JSON 对象：{"narrative": "...", "summary": "...", "options": [{"text": "...", "tag": "平和"}], "timePassedMonths": 0, "deltas": {}}，narrative 必须为纯中文文字，不要输出 JSON 之外的任何内容。`,
      },
      ...history,
      // 玩家选项作为独立 user 消息（让 AI 明确看到玩家做了什么）
      { role: 'user', content: `玩家行动：「${action}」\n结算结果：${resultSummary}` },
    ],
    response_format: { type: 'json_object' },
    temperature: settings.temperature,
    max_tokens: 4096,
  }
  if (isDeepSeek) body.thinking = { type: 'disabled' }
  const content = await fetchContent(settings, body)
  try {
    const parsed = parseJsonContent(content) as NarratorTurn
    const rawNarrative = typeof parsed.narrative === 'string' ? parsed.narrative : ''
    const narrative = sanitizeNarrative(rawNarrative)
    const months = typeof parsed.timePassedMonths === 'number' ? Math.max(0, Math.min(12, parsed.timePassedMonths)) : undefined
    return {
      narrative,
      summary: sanitizeSummary(parsed.summary),
      options: sanitizeOptions(parsed.options),
      timePassedMonths: months,
      deltas: parsed.deltas,
    }
  } catch {
    // 内容非 JSON：若可读则当纯文本叙事（系统指令侧由调用方回退模板叙事）
    return { narrative: content.trim() ? sanitizeNarrative(content).slice(0, 1200) : '', options: [] }
  }
}

/** 开局演绎：创角后第一回合由天道（AI）展开入世情境（JSON） */
export async function narrateOpening(
  settings: NarratorSettings,
  system: string,
  characterSummary: string,
  scriptDesc: string,
): Promise<NarratorTurn> {
  const isDeepSeek = /deepseek\.com$/i.test(settings.baseUrl.replace(/\/+$/, ''))
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: [
      {
        role: 'system',
        content: `${system}\n\n【开局演绎】玩家刚刚创角完毕，等待你展开入世的第一幕。请以天道系统的口吻，依据玩家创角信息与所选开局剧本，用修仙文风自由展开开局情境（篇幅不限，充分写出氛围、细节与人物状态），并生成下一步选项（数量、长度不限（3~4 个）；可带简短语义标签，自由发挥）。
只输出一个 JSON 对象：{"narrative": "...", "summary": "20~40字概述开局情境，必填", "options": [{"text": "...", "tag": "平和"}]}，narrative 必须是纯中文文字，禁止任何 LaTeX / Markdown / HTML 标记。`,
      },
      { role: 'user', content: `创角信息：${characterSummary}\n开局剧本：${scriptDesc}` },
    ],
    response_format: { type: 'json_object' },
    temperature: settings.temperature,
    max_tokens: 4096,
  }
  if (isDeepSeek) body.thinking = { type: 'disabled' }
  const content = await fetchContent(settings, body)
  const parsed = parseJsonContent(content) as NarratorTurn
  const rawNarrative = typeof parsed.narrative === 'string' ? parsed.narrative : ''
  const narrative = sanitizeNarrative(rawNarrative)
  if (!narrative) throw new Error('开局演绎返回空')
  return {
    narrative,
    summary: sanitizeSummary(parsed.summary),
    options: sanitizeOptions(parsed.options),
  }
}

/** 纯文本兜底：剥离可能的 JSON 壳（如 "narrative": "…" 或 {"narrative": "…"}）后取叙事文本 */
export function fallbackNarrative(text: string): string {
  let t = (text ?? '').trim()
  t = t.replace(/^\s*\{?\s*"narrative"\s*:\s*"?/, '')
  // 在下一个 JSON 结构边界截断（如 ", "} 或 "options" 等）
  const cut = t.search(/"?\s*,?\s*[,}\]]|"options"/)
  if (cut > 0) t = t.slice(0, cut)
  t = t.replace(/"?\s*[,}\]]?\s*$/, '')
  t = sanitizeNarrative(t).trim().slice(0, 1200)
  return t || '天道静默不语。'
}

/** 调用 OpenAI 兼容端点（带降级重试：完整 → 去历史纯文本；空白/业务失败自动降级） */
export async function callNarrator(
  settings: NarratorSettings,
  system: string,
  history: NarratorMessage[],
  userAction: string,
): Promise<NarratorTurn> {
  const isDeepSeek = /deepseek\.com$/i.test(settings.baseUrl.replace(/\/+$/, ''))
  const variants: { messages: { role: string; content: string }[]; json: boolean }[] = [
    { messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: userAction }], json: true },
    // 降级：去掉历史（可能触发模型空白）+ 纯文本
    { messages: [{ role: 'system', content: `${system}\n\n（注：此前对话暂缺，请直接回应本轮。）` }, { role: 'user', content: userAction }], json: false },
  ]
  let lastErr: Error | null = null
  for (const v of variants) {
    const body: Record<string, unknown> = {
      model: settings.model,
      messages: v.messages,
      temperature: settings.temperature,
      max_tokens: 4096,
    }
    if (v.json) body.response_format = { type: 'json_object' }
    if (isDeepSeek) body.thinking = { type: 'disabled' }
    try {
      const content = await fetchContent(settings, body)
      if (v.json) {
        const parsed = parseJsonContent(content) as NarratorTurn
        const rawNarrative = typeof parsed.narrative === 'string' ? parsed.narrative : ''
        const narrative = sanitizeNarrative(rawNarrative) || '天道静默不语。'
        return {
          ...parsed,
          narrative,
          summary: sanitizeSummary(parsed.summary),
          options: sanitizeOptions(parsed.options),
        }
      }
      // 纯文本档：模型可能仍输出 JSON 形态文本 → 先尝试解析，失败再当纯文本
      const trimmed = content.trim()
      let narrative = ''
      let summary: string | undefined
      let months: number | undefined
      let opts: { text: string; tag?: string }[] = []
      try {
        const parsed = parseJsonContent(trimmed) as NarratorTurn
        if (parsed && typeof parsed.narrative === 'string') {
          narrative = sanitizeNarrative(parsed.narrative)
          summary = sanitizeSummary(parsed.summary)
          months = typeof parsed.timePassedMonths === 'number' ? Math.max(0, Math.min(12, parsed.timePassedMonths)) : undefined
          opts = sanitizeOptions(parsed.options)
        }
      } catch {
        /* 非 JSON → 走纯文本 */
      }
      if (!narrative) narrative = fallbackNarrative(trimmed)
      return { narrative, summary, options: opts, timePassedMonths: months }
    } catch (e) {
      if (isOfflineError(e)) throw e // 真断网：不降级，交给调用方冻结
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('LLM 请求失败')
}
