/** 动作路由 —— 解析玩家输入 → 系统指令分派（代码结算）或自由行动（LLM/离线）
 *  对应原文「选项只是快捷方式，玩家可自由输入任意行动」 */

import type { GameState } from '../state'
import type { SceneThemeKey } from '../../ui/theme'
import { fmtTimeShort } from './time'
import { pick as pickRand, chance } from './dice'
import { cultivate } from './cultivation'
import { majorBreakthrough, enlightenment } from './breakthrough'
import { marketList, marketBuy, useItem } from './economy'
import { practiceTechnique, caveUpgrade, sectJoin, sectTask, affectionAction, heal, randomEventRoll, qiyuRoll } from './systems'
import { combatStep, applyCombatResult, startCombat, type CombatState } from './combat'
import { saveSnapshot } from '../save'
import type { LogEntry } from './turn'
import { OPENING_SCRIPTS } from '../data/events'
import { REALMS } from '../data/realms'
import { TECHNIQUES, SECT_RANKS } from '../data/systems'
import { NPCS } from '../data/world'
import { SPIRIT_ROOTS, DAO_PATHS } from '../data/creation'

export type Command =
  | { kind: 'free' }
  | { kind: 'cultivate'; closedDoor: boolean }
  | { kind: 'status' }
  | { kind: 'breakthrough'; path: '人道' | '地道' | '天道' | null }
  | { kind: 'enlighten'; branch: string | null }
  | { kind: 'market' }
  | { kind: 'buy'; itemId: string }
  | { kind: 'bag' }
  | { kind: 'use'; itemId: string }
  | { kind: 'sect' }
  | { kind: 'sectJoin'; sect: string }
  | { kind: 'sectTask' }
  | { kind: 'cave' }
  | { kind: 'caveUpgrade' }
  | { kind: 'technique' }
  | { kind: 'techniquePractice'; techniqueId: string }
  | { kind: 'affection' }
  | { kind: 'affectionAction'; npcId: string; action: '赠礼' | '论道' | '同游' | '表白' | '疏远' }
  | { kind: 'heal' }
  | { kind: 'help' }
  | { kind: 'travel' }
  | { kind: 'combat'; command: string }
  | { kind: 'robbery' }

/** 识别玩家输入对应的命令 */
export function routeCommand(input: string): Command {
  const a = input.trim()
  if (!a) return { kind: 'free' }
  if (/修炼|闭关|打坐|运功/.test(a)) return { kind: 'cultivate', closedDoor: /闭关/.test(a) }
  if (/面板|状态|属性|人物/.test(a)) return { kind: 'status' }
  if (/突破|渡劫/.test(a)) {
    const path = /天道/.test(a) ? '天道' : /地道/.test(a) ? '地道' : /人道/.test(a) ? '人道' : null
    return { kind: 'breakthrough', path }
  }
  if (/悟道|参悟/.test(a)) {
    const m = a.match(/悟道\s*(.+)/)
    return { kind: 'enlighten', branch: m ? m[1] : null }
  }
  if (/^用\s*/.test(a)) {
    return { kind: 'use', itemId: a.replace(/^用\s*/, '') }
  }
  if (/坊市|集市|买卖|买/.test(a)) {
    const item = a.match(/买\s*(.+)/)
    if (item) return { kind: 'buy', itemId: item[1] }
    return { kind: 'market' }
  }
  if (/背包|储物|物品/.test(a)) return { kind: 'bag' }
  if (/任务|贡献/.test(a)) return { kind: 'sectTask' }
  if (/宗门|门派/.test(a)) {
    if (/加入|拜入/.test(a)) return { kind: 'sectJoin', sect: '青云宗' }
    return { kind: 'sect' }
  }
  if (/升级洞府|提升灵气/.test(a)) return { kind: 'caveUpgrade' }
  if (/洞府|闭关室|住所/.test(a)) return { kind: 'cave' }
  if (/技艺|炼丹|炼器|符箓|阵法|御兽|灵植/.test(a)) {
    const t = TECHNIQUES.find((x) => a.includes(x.name))
    if (t) return { kind: 'techniquePractice', techniqueId: t.id }
    return { kind: 'technique' }
  }
  if (/疗伤|养伤|治疗/.test(a)) return { kind: 'heal' }
  if (/帮助|指令|help/.test(a)) return { kind: 'help' }
  if (/回到主剧情|回到主线|继续剧情/.test(a)) return { kind: 'free' }
  if (/游历|探索|出门|地图|秘境|下山/.test(a)) return { kind: 'travel' }
  if (/劫掠|夺宝|拦路/.test(a)) return { kind: 'robbery' }
  // 提到 NPC 名字 → 情缘互动（赠礼/论道/同游/表白/疏远）
  const npc = NPCS.find((n) => a.includes(n.name))
  if (npc) {
    const kind = /赠礼|送礼/.test(a) ? '赠礼' : /表白/.test(a) ? '表白' : /疏远/.test(a) ? '疏远' : /同游|约会/.test(a) ? '同游' : '论道'
    return { kind: 'affectionAction', npcId: npc.id, action: kind }
  }
  if (/情缘|好感|双修|道侣|赠礼/.test(a)) return { kind: 'affection' }
  if (/攻击|施法|绝技|防御|遁走|符丹|召唤|观察|冷静/.test(a)) return { kind: 'combat', command: a }
  return { kind: 'free' }
}

/** 按 id 或名称找商品 */
function findItem(idOrName: string) {
  return marketList().find((i) => i.id === idOrName || i.name.includes(idOrName) || idOrName.includes(i.name))
}

export interface SystemResult {
  state: GameState
  narrative: string
  options: { text: string; tag?: string }[]
  scene: SceneThemeKey
  timePassedMonths: number
}

const CMD_OPTIONS = (extra: { text: string; tag?: string }[] = []): { text: string; tag?: string }[] => [
  ...extra,
  { text: '回到主剧情', tag: '平和' },
]

/** 在战斗中：任何行动先进战斗指令 */
function tryCombatStep(state: GameState, command: string): SystemResult | null {
  const raw = state.flags.combat
  if (typeof raw !== 'string') return null
  let cs: CombatState
  try {
    cs = JSON.parse(raw) as CombatState
  } catch {
    return null
  }
  const step = combatStep(cs, command)
  const last = step.log[step.log.length - 1] ?? ''
  if (step.over) {
    const s2 = applyCombatResult(state, step)
    const flags = { ...s2.flags }
    delete flags.combat
    // 战斗失利（败亡或落败未死）→ 记标记，供失败回退提示（快照已在战斗前写好）
    if (!step.victory && !step.escaped) flags.combatLost = true
    const result: SystemResult = {
      state: { ...s2, flags },
      narrative: `${last}\n\n${step.victory ? '【你胜了这场争斗。】' : step.escaped ? '【你遁走了。】' : '【你败了……】'}`,
      options: CMD_OPTIONS([{ text: '查看状态', tag: '平和' }]),
      scene: 'zhusha',
      timePassedMonths: 0,
    }
    return result
  }
  return {
    state: { ...state, flags: { ...state.flags, combat: JSON.stringify(step) } },
    narrative: last,
    options: [
      { text: '攻击', tag: '风险' },
      { text: '施法', tag: '风险' },
      { text: '绝技', tag: '风险' },
      { text: '遁走', tag: '平和' },
    ],
    scene: 'zhusha',
    timePassedMonths: 0,
  }
}

/** 执行系统指令，返回代码权威的结果 */
export function executeSystem(cmd: Command, state: GameState, storyLog?: LogEntry[]): SystemResult | null {
  const t = fmtTimeShort(state.timeline)

  // 战斗会话优先
  if (cmd.kind === 'combat' && state.flags.combat) {
    return tryCombatStep(state, cmd.command)
  }

  switch (cmd.kind) {
    case 'status': {
      const p = state.player
      return {
        state,
        narrative: `${t}，${p.daoName}。你如今 ${p.realm}·${p.stage}，${p.sect}。详情尽在右侧状态卡。`,
        options: CMD_OPTIONS([{ text: '修炼', tag: '平和' }, { text: '突破', tag: '机缘' }, { text: '外出游历', tag: '机缘' }]),
        scene: 'qingyu',
        timePassedMonths: 0,
      }
    }

    case 'cultivate': {
      const r = cultivate(state, 1, cmd.closedDoor)
      const okOpts: { text: string; tag?: string }[] = [
        { text: cmd.closedDoor ? '继续闭关' : '继续修炼', tag: '平和' },
        { text: '突破', tag: '机缘' },
        { text: '洞府', tag: '平和' },
      ]
      return { state: r.state, narrative: r.msg, options: CMD_OPTIONS(okOpts), scene: 'qingyu', timePassedMonths: 1 }
    }

    case 'breakthrough': {
      if (!cmd.path) {
        return {
          state,
          narrative: '破境之路，三途可选：人道稳妥、地道中正、天道凶险而收益最高。',
          options: [
            { text: '突破 · 人道', tag: '平和' },
            { text: '突破 · 地道', tag: '机缘' },
            { text: '突破 · 天道', tag: '风险' },
            { text: '暂不突破', tag: '平和' },
          ],
          scene: 'xuanzi',
          timePassedMonths: 0,
        }
      }
      // 事件前快照：突破前自动存（供失败/陨落后回退重新决策）
      saveSnapshot(state, `${state.player.daoName} · 突破前 · 回合${state.turn}`, {
        log: storyLog ?? [],
        pendingOptions: [],
        scene: 'xuanzi',
      })
      const r = majorBreakthrough(state, cmd.path)
      if (r.died) {
        return {
          state: r.state,
          narrative: r.msg,
          options: [{ text: '查看状态', tag: '平和' }],
          scene: 'xuanzi',
          timePassedMonths: 1,
        }
      }
      // 真失败判定：前置不满足（修为未满/未圆满/冷却）时返回的是原状态引用；真失败会构造新状态
      const failed = !r.ok && !r.died && r.state !== state
      const st2 = failed ? { ...r.state, flags: { ...r.state.flags, lastBreakFailed: true } } : r.state
      const opts = r.ok
        ? CMD_OPTIONS([{ text: '查看状态', tag: '平和' }, { text: '继续修炼', tag: '平和' }])
        : CMD_OPTIONS([{ text: '闭关疗伤', tag: '平和' }, { text: '继续修炼', tag: '平和' }])
      return { state: st2, narrative: r.msg, options: opts, scene: 'xuanzi', timePassedMonths: 1 }
    }

    case 'enlighten': {
      if (!cmd.branch) {
        return {
          state,
          narrative: '大道三千，择一而悟：剑道、丹道、器道、符道、阵道、体道、御兽道、无情道、有情道。',
          options: [
            { text: '悟道 · 剑道', tag: '机缘' },
            { text: '悟道 · 丹道', tag: '机缘' },
            { text: '悟道 · 体道', tag: '平和' },
            { text: '暂不参悟', tag: '平和' },
          ],
          scene: 'zhuqing',
          timePassedMonths: 0,
        }
      }
      const branch = cmd.branch.replace(/[·\s]/g, '')
      const r = enlightenment(state, branch)
      return { state: r.state, narrative: r.msg, options: CMD_OPTIONS([{ text: '继续悟道', tag: '机缘' }]), scene: 'zhuqing', timePassedMonths: 1 }
    }

    case 'market': {
      const items = marketList().slice(0, 4)
      return {
        state,
        narrative: `你来到天机坊市，灵光满目。今日货物：${items.map((i) => `${i.name}（${i.price}灵石）`).join('、')}。`,
        options: [
          ...items.map((i) => ({ text: `买 ${i.name}`, tag: '平和' as const })),
          { text: '摆摊卖货', tag: '机缘' },
        ],
        scene: 'liujin',
        timePassedMonths: 0,
      }
    }

    case 'buy': {
      const item = findItem(cmd.itemId)
      if (!item) {
        return { state, narrative: '坊市中并无此物。', options: CMD_OPTIONS([{ text: '坊市', tag: '平和' }]), scene: 'liujin', timePassedMonths: 0 }
      }
      const r = marketBuy(state, item.id, 1)
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '坊市', tag: '平和' }, { text: '背包', tag: '平和' }]),
        scene: 'liujin',
        timePassedMonths: 0,
      }
    }

    case 'bag': {
      const entries = Object.entries(state.bag)
      if (entries.length === 0) {
        return { state, narrative: '你的储物袋空空如也。', options: CMD_OPTIONS([{ text: '坊市', tag: '平和' }]), scene: 'qingyu', timePassedMonths: 0 }
      }
      const names = entries.map(([k, v]) => {
        const item = findItem(k)
        return `${item ? item.name : k} ×${v}`
      })
      return {
        state,
        narrative: `储物袋中：${names.join('、')}。`,
        options: CMD_OPTIONS(entries.slice(0, 3).map(([k]) => ({ text: `用 ${findItem(k)?.name ?? k}`, tag: '平和' }))),
        scene: 'qingyu',
        timePassedMonths: 0,
      }
    }

    case 'use': {
      const item = findItem(cmd.itemId)
      if (!item) {
        return { state, narrative: '并无此物可用。', options: CMD_OPTIONS([{ text: '背包', tag: '平和' }]), scene: 'qingyu', timePassedMonths: 0 }
      }
      const r = useItem(state, item.id)
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '背包', tag: '平和' }, { text: '修炼', tag: '平和' }]),
        scene: 'qingyu',
        timePassedMonths: 0,
      }
    }

    case 'sect': {
      const s = state.sectInfo
      if (s.sect === '散修') {
        return {
          state,
          narrative: '你如今散修一名。东洲青云宗、南疆赤阳宗皆有仙缘，可择一拜入。',
          options: [
            { text: '拜入青云宗', tag: '平和' },
            { text: '暂不入宗门', tag: '平和' },
          ],
          scene: 'tianqing',
          timePassedMonths: 0,
        }
      }
      return {
        state,
        narrative: `${s.sect}·${s.rank}，宗门贡献 ${s.contribution}。可接宗门任务，贡献达标可晋升（${SECT_RANKS.join('→')}）。`,
        options: CMD_OPTIONS([{ text: '接宗门任务', tag: '平和' }, { text: '叛出宗门', tag: '风险' }]),
        scene: 'tianqing',
        timePassedMonths: 0,
      }
    }

    case 'sectJoin': {
      const r = sectJoin(state, cmd.sect)
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '宗门', tag: '平和' }, { text: '接宗门任务', tag: '平和' }]),
        scene: 'tianqing',
        timePassedMonths: 1,
      }
    }

    case 'sectTask': {
      const r = sectTask(state)
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '宗门', tag: '平和' }, { text: '继续接任务', tag: '平和' }]),
        scene: 'tianqing',
        timePassedMonths: 1,
      }
    }

    case 'cave': {
      const c = state.cave
      return {
        state,
        narrative: `你的洞府灵气${c.spiritConcentration}（Lv.${c.level}）${c.facilities.length ? `，设施：${c.facilities.join('、')}` : ''}。可花费灵石升级灵气浓度。`,
        options: CMD_OPTIONS([{ text: '升级洞府', tag: '机缘' }, { text: '修炼', tag: '平和' }, { text: '闭关', tag: '平和' }]),
        scene: 'qingyu',
        timePassedMonths: 0,
      }
    }

    case 'caveUpgrade': {
      const r = caveUpgrade(state)
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '洞府', tag: '平和' }, { text: '修炼', tag: '平和' }]),
        scene: 'qingyu',
        timePassedMonths: 0,
      }
    }

    case 'technique': {
      return {
        state,
        narrative: `技艺之道：${TECHNIQUES.map((t) => `${t.name}（${state.techniqueLevels[t.id] ?? 0}/5级）`).join('、')}。`,
        options: CMD_OPTIONS(TECHNIQUES.slice(0, 3).map((t) => ({ text: `修习${t.name}`, tag: '平和' }))),
        scene: 'qingyu',
        timePassedMonths: 0,
      }
    }

    case 'techniquePractice': {
      const r = practiceTechnique(state, cmd.techniqueId)
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '技艺', tag: '平和' }]),
        scene: 'qingyu',
        timePassedMonths: 1,
      }
    }

    case 'affection': {
      return {
        state,
        narrative: `有缘之人：${NPCS.map((n) => n.name).join('、')}。可赠礼、论道、同游，增进情谊。`,
        options: [
          ...NPCS.slice(0, 3).map((n) => ({ text: `论道 · ${n.name}`, tag: '情缘' as const })),
          
        ],
        scene: 'taofen',
        timePassedMonths: 0,
      }
    }

    case 'affectionAction': {
      const r = affectionAction(state, cmd.npcId, cmd.action)
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '情缘', tag: '情缘' }, { text: '赠礼', tag: '情缘' }]),
        scene: 'taofen',
        timePassedMonths: 1,
      }
    }

    case 'heal': {
      const r = heal(state, '闭关疗伤')
      return {
        state: r.state,
        narrative: r.msg,
        options: CMD_OPTIONS([{ text: '继续疗伤', tag: '平和' }, { text: '修炼', tag: '平和' }]),
        scene: 'qingyu',
        timePassedMonths: 1,
      }
    }

    case 'travel': {
      const parts: string[] = []
      let s: GameState = state
      // 奇遇（5%）
      const qy = qiyuRoll(s)
      if (qy) {
        s = qy.state
        parts.push(`奇遇：${qy.msg}`)
      }
      // 随机事件（20%）
      const ev = randomEventRoll(s)
      if (ev) {
        s = ev.state
        parts.push(`事件：${ev.msg}`)
      }
      // 遭遇战（25%）
      if (chance(0.25) && !s.flags.combat) {
        const p = s.player
        const realmIdx = Math.max(0, REALMS.findIndex((r) => r.name === p.realm))
        const enemy = {
          name: pickRand(['野狼妖', '黑风山贼', '游散魔修', '赤眼妖狐']),
          realmIdx: Math.max(0, realmIdx - (chance(0.6) ? 0 : 1)),
          stageIdx: 0,
          hpMax: 80 + realmIdx * 40,
          attack: 25 + realmIdx * 12,
          defense: 8 + realmIdx * 4,
          speed: 8 + realmIdx * 3,
          elements: ['火'],
        }
        // 战斗前快照（供败亡/失利后回退重新决策）
        saveSnapshot(s, `${s.player.daoName} · 战斗前 · 回合${s.turn}`, {
          log: storyLog ?? [],
          pendingOptions: [],
          scene: 'zhusha',
        })
        const cs = startCombat(s, enemy)
        const s2: GameState = { ...s, flags: { ...s.flags, combat: JSON.stringify(cs) } }
        s = s2
        parts.push(`遭遇：${enemy.name}拦住去路！`)
      }
      const narration = parts.length
        ? `你离开洞府，踏入山野。${parts.join(' ')}`
        : '你游历山野，只见云卷云舒，灵气缓缓流转。此番出行，平安无事。'
      return {
        state: s,
        narrative: narration,
        options: CMD_OPTIONS([
          { text: '继续游历', tag: '机缘' },
          { text: '回洞府修炼', tag: '平和' },
          { text: '坊市', tag: '平和' },
        ]),
        scene: 'ziqi',
        timePassedMonths: 1,
      }
    }

    case 'robbery': {
      return null // 交给自由行动（LLM）演绎
    }

    case 'help': {
      return {
        state,
        narrative: '指令：面板 修炼 突破 悟道 洞府 地图 背包 坊市 宗门 技艺 情缘 对话 存档 帮助。自由输入任意行动亦可。',
        options: CMD_OPTIONS([{ text: '修炼', tag: '平和' }, { text: '坊市', tag: '平和' }, { text: '宗门', tag: '平和' }]),
        scene: 'qingyu',
        timePassedMonths: 0,
      }
    }

    default:
      return null
  }
}

/** 开局剧本：创角后第一回合 */
export function resolveOpening(state: GameState): { state: GameState; narrative: string; options: { text: string; tag?: string }[]; scene: SceneThemeKey } {
  const scriptId = typeof state.flags.openingScript === 'string' ? state.flags.openingScript : OPENING_SCRIPTS[0].id
  const script = OPENING_SCRIPTS.find((s) => s.id === scriptId) ?? OPENING_SCRIPTS[0]
  const p = state.player
  const realm = REALMS.find((r) => r.name === p.realm)
  const root = SPIRIT_ROOTS.find((r) => r.id === p.spiritRootId)
  const path = DAO_PATHS.find((d) => d.id === p.daoPathId)
  const narrative = `${script.start}\n\n${script.desc}\n\n你，${p.name}（道号${p.daoName}），${root ? root.name : ''}灵根，${path ? `立志${path.name}` : ''}。${realm ? `当前境界 ${realm.name}·${p.stage}。` : ''}此界广袤，道途凶险——真实修仙界，会死，非龙傲天。`
  return {
    state,
    narrative,
    options: [
      { text: '修炼', tag: '平和' },
      { text: '外出游历', tag: '机缘' },
      { text: '坊市', tag: '平和' },
      
    ],
    scene: 'ziqi',
  }
}
