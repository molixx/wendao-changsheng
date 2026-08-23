/** 冒烟测试辅助：构造一个标准测试用初始状态 */

import type { GameState } from '../src/game/state'

export function buildInitialForTest(): GameState {
  return {
    version: 1,
    turn: 0,
    player: {
      daoName: '测试真人',
      name: '测试',
      gender: '男',
      age: 16,
      originId: 'farmer',
      realm: '炼气',
      stage: '初期',
      sect: '散修',
      spiritRootId: 'tian',
      physiqueId: 'xiantian-dao',
      appearance: '清秀',
      daoPathId: 'wendao',
      talentIds: [],
      stats: { zizhi: 12, wuxing: 12, shenshi: 10, dunsu: 10, daoxin: 12, xianyuan: 10 },
    },
    res: {
      hp: 100, hpMax: 100,
      mp: 80, mpMax: 80,
      cult: 0, cultMax: 100,
      lifespan: 84, lifespanMax: 100,
      spirit: 100, merit: 0, karma: 0,
      mood: 1.0, injury: null, statusEffects: [],
    },
    timeline: { year: 1, month: 3, calendarYear: 387 },
    bag: {},
    gongfaIds: [],
    techniqueLevels: {},
    enlightenment: {},
    relationships: {},
    daoPartner: null,
    cave: { level: 1, spiritConcentration: '普通', facilities: [] },
    sectInfo: { sect: '散修', rank: '散修', contribution: 0 },
    mainQuest: '',
    flags: { location: '东洲·青岳', openingScript: 'shan-cun' },
    log: [],
    lastSaveTurn: 0,
  }
}
