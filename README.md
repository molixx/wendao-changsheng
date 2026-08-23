# 《问道长生》修仙模拟器 · HTML 交互版

将 [雾见川](https://github.com/MeteorNOX) 的《修仙模拟器 · 问道长生》设定文档（原为 AI 主持的 LaTeX 文字游戏）改编为可在浏览器中游玩的交互式网页游戏。

> 真实修仙界，会死，非龙傲天。——本作灵魂

## 技术栈

- **Vite + React + TypeScript**（Vite 8 / React 19 / TS 7 原生版）
- **Zustand**（全局状态 + localStorage 持久化）
- **Tailwind CSS v4 + 自研宣纸设计系统**（100% 复刻原文 LaTeX 配色体系与组件库）

## 架构

```
src/
├── game/
│   ├── state.ts           # 游戏状态模型（状态卡 19 字段 / 存档格式）
│   ├── store.ts           # Zustand 全局状态（屏幕路由 / 回合管线）
│   ├── save.ts            # 存档（3 槽 + 自动 + JSON 导入导出）
│   ├── narrator/llm.ts    # LLM 叙事客户端（OpenAI 兼容，JSON Output）
│   ├── data/              # 内容数据模块（设定文档 21 章 + 附录忠实转写）
│   │   ├── types.ts  realms.ts  creation.ts  world.ts
│   │   ├── systems.ts  events.ts  worldview.ts
│   └── engine/
│       ├── dice.ts  time.ts  state.ts
│       ├── cultivation.ts  breakthrough.ts   # 修炼/突破/悟道（原文公式）
│       ├── combat.ts                          # 回合制战斗（境界压制/五行灵气）
│       ├── economy.ts                         # 坊市经济
│       ├── systems.ts                         # 技艺/宗门/洞府/情缘/奇遇
│       ├── actions.ts                         # 动作路由（系统指令 vs 自由行动）
│       └── turn.ts                            # 回合管线（代码结算 + LLM 叙事）
└── ui/                     # 宣纸设计系统组件 + 各界面
```

## 核心设计（与用户确认的 15 项决策）

- **混合引擎**：代码管全部数值结算（原文公式 100%），LLM 管叙事与自由行动判定
- **LLM 可配置**：设置页填 OpenAI 兼容端点（默认 DeepSeek `api.deepseek.com` / `deepseek-v4-flash`），Key 存浏览器 localStorage
- **每回合 = 游戏内 1 个月**，时间行、1 事件节点、指令行常驻（原文铁律）
- **自由输入行动**：选项只是快捷方式，任何输入都在世界逻辑内响应
- **离线降级**：无 Key / 断网时系统指令仍可玩（代码结算），自由行动有基础兜底库

## 背景图（水墨修仙风）

`public/bg/` 下 10 张背景（PNG 优先，SVG 兜底；`npm run gen-bg` 生成 SVG 版，`npm run verify-bg` 像素验证）。**用 AI 绘图工具替换背景时**，提示词见 [BACKGROUND-PROMPTS.md](BACKGROUND-PROMPTS.md)——按文件名（`title.png`/`qingyu.png`…）保存到 `public/bg/` 即生效：

| 文件名 | 场景 | 画面 |
|---|---|---|
| `title` | 标题页 | 圆月 + 远山 + 飞鹤 |
| `paper-mist` | 创角/设置 | 极淡云山留白 |
| `qingyu` | 主界面/修炼 | 青玉色山水 + 双鹤 |
| `xuanzi` | 突破/渡劫 | 玄紫 + 闪电 |
| `zhusha` | 战斗/危机 | 朱砂残阳 + 红雾 |
| `taofen` | 情缘 | 桃粉春山 + 落花 |
| `liujin` | 坊市 | 鎏金古镇灯火 |
| `ziqi` | 机缘/秘境 | 紫气东来祥光 |
| `tianqing` | 宗门 | 天青云海 + 仙阙 |
| `zhuqing` | 悟道 | 竹青竹林月影 |

背景随界面/场景自动切换（标题页/创角/图鉴固定，游戏内跟随当前剧情场景主题，带淡入过渡）。

## 运行

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 产出 dist/ 静态文件
npm run preview
```

## 玩法速览

1. 标题页 → 开始新游戏（或读档 / 进设置页配 API Key / 翻设定图鉴）
2. 创角向导：基础信息（署名「作者：wobuaixc@163.com」）→ 出身 → 道途 → 灵根·体质 → 六维·天赋 → 开局剧本
3. 主界面：左侧常驻状态卡（手机端抽屉），中央剧情流，底部指令栏
4. 指令：`修炼` `突破`（人道/地道/天道）`悟道` `坊市` `宗门` `技艺` `情缘` `洞府` `背包` `游历` `疗伤` `存档` `帮助`，或自由输入任意行动
5. 会死。陨落后可读档或轮回。

## 致谢

- 作者：**wobuaixc@163.com**（本交互版的改编与实现）
- 设定与世界观：**雾见川**（`修仙模拟器.docx` 原作设定）
- 灵感参考：《鬼谷八荒》《觅长生》《凡人修仙传》
- 本项目为个人学习用途的改编作品

## 全局功能（游玩体验保障）

- **现场恢复**：每回合自动持久化完整现场（剧情流/当前选项/状态卡/场景），刷新浏览器直接无缝续玩，顶部短暂提示「已恢复 · 回合 #N」
- **放弃进度**：标题页提供「放弃进度 · 重新开始」入口（带确认）
- **多标签防冲突**：另一标签页更新进度时，当前标签弹出「接管 / 忽略」提示（最后写入生效）
- **性能**：背景图提供压缩 WebP 副本（`npm run opt-bg` 生成，约 75MB → 3MB），游戏按 WebP → PNG → SVG 链加载；页面关闭前兜底保存现场
- 现场会话独立存储（`wdcd.session`），不占用 3 个手动存档槽位
