import http from 'http'
import { once } from 'events'
import { buildInitialForTest } from './smoke-helpers'
import { resolveTurn } from '../src/game/engine/turn'
import { DEFAULT_SETTINGS } from '../src/game/state'

const PORT = 40124

function mkNarratorResponse(action: string, resultSummary: string) {
  const rand = Math.random()
  const proposed: any = {}
  if (rand < 0.25) {
    proposed.location = '南疆·赤炎'
  } else if (rand < 0.5) {
    proposed.affinity = { '顾清玄': Math.floor(Math.random() * 10) }
  } else if (rand < 0.75) {
    proposed.bag = { '聚气丹': 1 }
  } else {
    proposed.status = ['中毒']
  }
  const timePassedMonths = Math.random() < 0.5 ? 0 : 1
  const narrative = `（模拟叙事）玩家执行了「${action}」，结果：${resultSummary}。` + (proposed.location ? ` 到达${proposed.location}。` : '')
  const summary = `模拟：${action} → ${resultSummary}`.slice(0, 40)
  const options = [ { text: '继续' }, { text: '查看背包' }, { text: '休息' } ]
  const content = JSON.stringify({ narrative, summary, options, timePassedMonths, proposedStateChanges: proposed })
  return { choices: [{ message: { content } }], model: 'mock-model' }
}

async function main() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
      let body = ''
      for await (const chunk of req) body += chunk
      try {
        const reqJson = JSON.parse(body)
        const lastUser = Array.isArray(reqJson.messages) ? reqJson.messages[reqJson.messages.length - 1] : null
        const userContent = lastUser?.content ?? 'action'
        const m = /玩家行动：\u300c([^\u300d]+)\u300d[\s\S]*?结算结果：(.+)$/.exec(userContent)
        const action = m ? m[1] : '测试行动'
        const result = m ? m[2] : '结算结果'
        const resp = mkNarratorResponse(action, result)
        const bodyOut = JSON.stringify(resp)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(bodyOut)
      } catch (e) {
        res.writeHead(500)
        res.end('error')
      }
    } else {
      res.writeHead(404)
      res.end('not found')
    }
  })
  server.listen(PORT)
  await once(server, 'listening')
  console.log('Mock LLM listening on', PORT)

  const settings = { ...DEFAULT_SETTINGS, baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'mock', useLlm: true }

  // Polyfill localStorage for Node
  if (typeof globalThis.localStorage === 'undefined') {
    const store: Record<string, string> = {}
    globalThis.localStorage = {
      getItem(key: string) { return store[key] ?? null },
      setItem(key: string, value: string) { store[key] = String(value) },
      removeItem(key: string) { delete store[key] },
    } as any
  }

  let state = buildInitialForTest()
  const actions = [
    '交谈 顾清玄',
    '游历 城外山林',
    '修炼',
    '闭关疗伤',
    '坊市 购买 聚气丹',
    '探查古墓',
    '论道 顾清玄',
    '游历 风陵渡口',
    '炼丹',
    '寻访 门派长老',
  ]

  const iterations = 20
  const stats: any = { runs: 0, proposals: 0, accepted: 0, rejected: 0, perKey: {} }

  for (let i = 0; i < iterations; i++) {
    const action = actions[i % actions.length]
    try {
      const out = await resolveTurn({ state, action, history: [] }, settings as any)
      stats.runs++
      const deltas = out.rawDeltas ?? undefined
      const rejected = out.rejectedStateChanges ?? {}
      if (deltas && typeof deltas === 'object') {
        const keys = Object.keys(deltas)
        stats.proposals += keys.length
        for (const k of keys) {
          const accepted = !(k in rejected)
          if (accepted) stats.accepted++
          else stats.rejected++
          stats.perKey[k] = stats.perKey[k] ?? { accepted: 0, rejected: 0 }
          if (accepted) stats.perKey[k].accepted++
          else stats.perKey[k].rejected++
        }
      }
      // Update state with returned state (includes applied changes and time advance)
      state = out.state
      console.log(`Iter ${i + 1}: action='${action}' proposals=${deltas ? Object.keys(deltas).join(',') : '-'} rejected=${Object.keys(rejected).join(',')}`)
    } catch (e) {
      console.error('resolveTurn error', e)
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Runs: ${stats.runs}, proposed keys: ${stats.proposals}`)
  console.log(`Accepted: ${stats.accepted}, Rejected: ${stats.rejected}`)
  console.log('Per-key:', stats.perKey)

  server.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
