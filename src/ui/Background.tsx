/** 场景背景层 —— 按屏幕/当前场景自动切换背景（PNG 优先，SVG 兜底，淡入过渡） */

import { useGame } from '../game/store'

/** 固定屏幕背景（不含扩展名，PNG 优先 / SVG 兜底） */
const SCREEN_BG: Partial<Record<string, string>> = {
  title: '/bg/title',
  create: '/bg/paper-mist',
  settings: '/bg/paper-mist',
  lore: '/bg/tianqing',
}

/** 场景主题 → 背景（对应宣纸设计系统 8 主题色） */
const SCENE_BG: Record<string, string> = {
  qingyu: '/bg/qingyu', // 青玉 · 主界面/修炼/状态卡
  xuanzi: '/bg/xuanzi', // 玄紫 · 突破/渡劫/天雷
  zhusha: '/bg/zhusha', // 朱砂 · 战斗/危机
  taofen: '/bg/taofen', // 桃粉 · 情缘/双修/道侣
  ziqi: '/bg/ziqi', // 紫气 · 机缘/秘境/神秘
  liujin: '/bg/liujin', // 鎏金 · 坊市/灵石/财富
  tianqing: '/bg/tianqing', // 天青 · 宗门/正式
  zhuqing: '/bg/zhuqing', // 竹青 · 悟道/论道
}

export function Background() {
  const { screen, log } = useGame()
  let src = SCREEN_BG[screen]
  if (!src && screen === 'play') {
    // 用最近一条剧情条目的场景主题决定背景
    const lastScene = [...log].reverse().find((e) => e.scene)?.scene
    src = SCENE_BG[lastScene ?? 'qingyu']
  }
  if (!src) return null
  // WebP（压缩版）优先 → PNG（原图）→ SVG（兜底），浏览器自动跳过加载失败项
  const img = `url("${src}.webp"), url("${src}.png"), url("${src}.svg")`
  return <div key={src} className="bg-layer" style={{ backgroundImage: img }} aria-hidden />
}
