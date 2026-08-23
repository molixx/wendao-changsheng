# 《问道长生》背景图生成提示词

> 共 10 张。**文件名必须与下表完全一致**（不含扩展名的部分），生成后保存为 PNG 到 `wendao-changsheng/public/bg/` 即可——游戏代码已是 **PNG 优先、SVG 兜底**，刷新浏览器立刻生效，无需改代码。

## 通用要求（每张都要满足）

- **风格**：中国水墨淡彩山水画（Traditional Chinese ink-wash with light color washes），宣纸质感，**浅色明亮基调**，大面积留白
- **构图**：天占上 2/3、山峦层叠于下 1/3，云雾缭绕，远景模糊近景清晰（层次感）
- **用途约束（重要）**：这是网页浅色背景，游戏面板是白色，所以**画面要明亮通透**，中心区域避免大面积深色；无人物、无文字、无水印
- **比例**：16:10（对应 1600×1000，推荐 `--ar 16:10`）；16:9 也行（左右会被裁一点）；如果工具只能出 1:1 也能用，但上下会被裁
- **分辨率**：尽量高（≥1536 宽，Midjourney 默认 1024 够用）
- **负向提示（Negative）**：`text, watermark, signature, people, face, modern objects, high contrast, heavy shadows, noise, border, frame, oversaturated`

---

## 1. `title.png` — 标题页（月夜仙鹤）

**中文**：中国水墨淡彩山水画，深秋月夜，一轮圆月高悬于画面右上，层叠远山如黛色水墨，山间云雾缭绕，三只仙鹤展翅飞过夜空，暖米色宣纸底色，整体明亮、空灵悠远、大量留白，无文字

**English（Midjourney 用）**：traditional Chinese ink-wash landscape, autumn moonlit night, full moon in upper right, layered misty mountains in ink, three white cranes flying across the sky, warm rice-paper beige tones, bright airy ethereal composition, generous negative space, no text

**主色**：米白 + 淡墨 + 金色圆月

---

## 2. `paper-mist.png` — 创角/设置页（晨雾极简）

**中文**：极简水墨画，晨雾中若隐若现的远山轮廓，近乎纯白的宣纸底，极淡的墨色笔触，大量留白，安静素雅，无文字

**English**：minimalist Chinese ink wash, faint distant mountain silhouettes in morning mist, almost pure white rice paper, extremely light ink strokes, vast negative space, serene and quiet, no text

**主色**：纯白 + 极淡灰墨

---

## 3. `qingyu.png` — 主界面/修炼（青玉山水）

**中文**：青玉色调的淡彩水墨山水，碧绿青翠的群山起伏层叠，云雾如纱缭绕山腰，一条溪流蜿蜒而下，两只仙鹤点缀其间，画面明亮通透，宣纸质感，留白，无文字

**English**：jade-teal light ink-wash landscape, verdant layered mountains, gauzy mist around the ridges, a winding mountain stream, two cranes in flight, bright translucent atmosphere, rice-paper texture, negative space, no text

**主色**：#6FA698 青玉

---

## 4. `xuanzi.png` — 突破/渡劫（紫霄雷劫）

**中文**：紫色调水墨山水，紫气从山巅升腾翻涌，乌云之间一道耀眼闪电划破天际，山势险峻，神秘而威严，浅紫宣纸底色，留白，无文字

**English**：purple ink-wash landscape, purple mist rising and swirling from a mountain peak, a dramatic lightning bolt striking through storm clouds, rugged cliffs, mysterious and majestic, light lavender rice-paper tones, negative space, no text

**主色**：#8B6FA8 玄紫

---

## 5. `zhusha.png` — 战斗/危机（朱砂残阳）

**中文**：朱砂红色的水墨山峦，残阳如血低垂天际，山间弥漫暗红色雾气，肃杀紧张的氛围，红金与淡墨交织，浅色纸底，留白，无文字

**English**：cinnabar-red ink-wash mountains, blood-red setting sun low on the horizon, dark crimson mist drifting through the valleys, tense and dramatic atmosphere, red-gold with light ink on pale paper, negative space, no text

**主色**：#C4675C 朱砂

---

## 6. `taofen.png` — 情缘（桃粉春山）

**中文**：桃粉色春山水墨画，漫山桃花盛开如霞，花瓣随风飘落，一对仙鹤相伴而飞，柔和浪漫，粉白基调，画面明亮，留白，无文字

**English**：peach-pink spring ink-wash landscape, mountains covered in blooming peach blossoms, petals drifting in the wind, a pair of cranes flying together, soft romantic mood, pink-white palette, bright, negative space, no text

**主色**：#D88FA5 桃粉

---

## 7. `liujin.png` — 坊市（鎏金古镇）

**中文**：鎏金色黄昏的水墨古镇，层层飞檐宝塔与市集建筑鳞次栉比，灯笼灯火初上，暖金色光线洒落，远山朦胧，热闹而古雅，无文字

**English**：golden-dusk ink-wash ancient Chinese town, tiered pagodas and market buildings with upturned eaves, lanterns just lighting up, warm golden light, hazy distant mountains, bustling yet classical, no text

**主色**：#C9A45C 鎏金

---

## 8. `ziqi.png` — 机缘/秘境（紫气东来）

**中文**：黎明时分的紫色祥光自山间石洞/山门向外透出，紫气东来，瑞气祥云翻涌，仙鹤盘旋，神秘机缘感，浅紫宣纸底色，留白，无文字

**English**：purple auspicious light at dawn, a radiant violet glow emanating from a cave entrance in the mountains, auspicious clouds swirling, cranes circling above, mysterious and promising atmosphere, light violet paper, negative space, no text

**主色**：#A98FD9 紫气

---

## 9. `tianqing.png` — 宗门（天青仙阙）

**中文**：天青色晴空水墨画，云海翻涌如浪，仙山之上宫阙殿宇依崖而建，飞檐翘角，仙鹤翱翔，开阔庄严，画面明亮，无文字

**English**：azure-clear sky ink-wash painting, rolling sea of clouds, celestial palace pavilions with upturned eaves built on mountain cliffs, cranes soaring above, grand and open, bright, no text

**主色**：#7FA8C9 天青

---

## 10. `zhuqing.png` — 悟道（竹青月影）

**中文**：竹青色水墨竹林，月光下疏朗的竹影随风轻摇，一轮淡月挂于空中，雾气轻笼，静谧禅意，竹青与淡墨配色，留白，无文字

**English**：bamboo-green ink-wash bamboo grove, sparse bamboo shadows swaying in moonlight, a pale moon in the sky, light mist, quiet zen atmosphere, bamboo-green with faint ink on pale paper, negative space, no text

**主色**：#8FBFA0 竹青

---

## 替换步骤

1. 用上面的提示词在任意绘图工具生成图片（即梦/通义万相/Midjourney/Stable Diffusion 均可）
2. 保存为 **PNG**，文件名与上表一致（如 `title.png`）
3. 放入 `wendao-changsheng/public/bg/`（覆盖或与 svg 共存均可）
4. 刷新浏览器 → 生效（无需改任何代码）

> 若你的工具只能输出 JPG/WebP：把文件名扩展名保持 `.png` 会无法显示——此时把文件另存为 .png 即可（工具一般支持导出 PNG），或告诉我你输出的格式，我改一行引用。
