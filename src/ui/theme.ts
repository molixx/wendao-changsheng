/** 宣纸设计系统 · 主题映射（原文 4.5 配色体系） */

export type SceneThemeKey =
  | 'qingyu'   // 青玉 · 主界面/修炼/状态卡
  | 'xuanzi'   // 玄紫 · 突破/渡劫/天雷
  | 'zhusha'   // 朱砂 · 战斗/危机
  | 'taofen'   // 桃粉 · 情缘/双修/道侣
  | 'ziqi'     // 紫气 · 机缘/秘境/神秘
  | 'liujin'   // 鎏金 · 坊市/灵石/财富
  | 'tianqing' // 天青 · 宗门/正式
  | 'zhuqing'  // 竹青 · 悟道/论道

export type PanelVariant = 'normal' | 'warn' | 'mystic' | 'love'

export const SCENE_THEMES: Record<SceneThemeKey, { color: string; label: string }> = {
  qingyu: { color: '#6FA698', label: '青玉' },
  xuanzi: { color: '#8B6FA8', label: '玄紫' },
  zhusha: { color: '#C4675C', label: '朱砂' },
  taofen: { color: '#D88FA5', label: '桃粉' },
  ziqi: { color: '#A98FD9', label: '紫气' },
  liujin: { color: '#C9A45C', label: '鎏金' },
  tianqing: { color: '#7FA8C9', label: '天青' },
  zhuqing: { color: '#8FBFA0', label: '竹青' },
}

/** 五行灵根色（含变异） */
export const ELEMENT_COLORS: Record<string, string> = {
  金: '#C9A45C',
  木: '#6BA38E',
  水: '#5E8FAE',
  火: '#C05F55',
  土: '#B08A4E',
  雷: '#8B6FA8',
  风: '#7F9C9C',
  冰: '#7FA8C9',
}

/** 数值色 */
export const VALUE_COLORS = {
  hp: '#C05F55',
  mp: '#5E8FAE',
  cult: '#A87E2E',
  life: '#5C8C6E',
  spirit: '#A87E2E',
  merit: '#6BA38E',
  karma: '#8E8578',
  affinity: '#D88FA5',
} as const

/** 语义标签（选项面板） */
export const SEMANTIC_TAGS = {
  平和: 'pinghe',
  机缘: 'jiyuan',
  风险: 'fengxian',
  情缘: 'qingyuan',
  魔道: 'modao',
} as const
