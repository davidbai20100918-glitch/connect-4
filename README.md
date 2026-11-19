# Connect 4 // Pixel Arcade

一个像素街机风的网页版四子棋。玩家执红棋，与三种不同性格的 AI 对战，并可以选择三种棋盘尺寸。

## 功能

- **像素风界面**：街机面板、硬边阴影、扫描线、VT323 / Press Start 2P 字体。
- **三种 AI 对手**：
  - **Easy — Dizzy Cluck**：一只眼神呆滞的鸡，随机落子为主。
  - **Medium — Sly Whiskers**：一只精明的猫，会阻挡你的直接威胁。
  - **Hard — Rex**：一只凶狠的霸王龙，使用更深的搜索和积极的攻防。
- **三种棋盘**：
  - Small：7 列 × 6 行（42 格）
  - Medium：8 列 × 7 行（56 格）
  - Large：9 列 × 8 行（72 格）
- **落子音效**：玩家和 AI 使用不同的合成音效，不需要额外的音频文件。
- **SFX 开关**：右上角可以静音 / 恢复音效，选择会保存在浏览器中。
- **完整游戏反馈**：落子动画、悬停预览、获胜四子闪烁、AI 思考状态、重新开始。
- **响应式布局**：手机、平板和桌面均可使用。
- **评论区和 Google 登录**：保留原有评论功能，后端位于 `api/`。

## 项目文件

```text
connect-4/
├── index.html          # 页面结构、像素角色容器
├── styles.css          # 像素街机 UI、棋盘和角色动画
├── script.js           # 游戏规则、三级 AI、音效、棋盘尺寸
├── comments.css        # 评论区的像素风样式
├── comment-section.js  # Google 登录与评论逻辑
├── assets/fonts/       # 本地像素字体和 OFL 授权文件
├── api/                # Cloudflare Worker 评论后端
├── COMMENTS-SETUP.md   # 评论后端部署说明
├── privacy.html
├── terms.html
└── README.md
```

## 运行

直接双击 `index.html` 即可。

如果浏览器限制本地文件，也可以在项目目录运行：

```bash
python -m http.server 8000
```

然后打开 <http://localhost:8000>。

> 评论功能需要配置 Google OAuth 和 Cloudflare Worker，详见 `COMMENTS-SETUP.md`。不配置时，游戏本体仍然可以正常使用。

## 玩法

1. 在顶部选择 **Difficulty** 和 **Board size**。
2. 点击 **New Game** 或 **Start Game** 进入棋盘。
3. 选择一列落下红棋，AI 会在短暂思考后落黄棋。
4. 任意方向先连成四子的一方获胜。
5. 点击 **New Game** 重新开始，游戏进行中修改棋盘尺寸也会立即开始新棋局。

## AI 难度

| 难度 | 角色 | 行为 |
| --- | --- | --- |
| Easy | Dizzy Cluck | 大部分时间随机落子，只偶尔阻挡或取胜。 |
| Medium | Sly Whiskers | 使用 3 层 Minimax，会抓住胜利并阻挡直接四连。 |
| Hard | Rex | 使用 5 层 Minimax + Alpha-Beta 剪枝，会规划多步攻防。 |

如果觉得 Hard 不够强，可以在 `script.js` 中找到：

```js
const searchDepth = difficulty === "hard" ? 5 : 3;
```

将 `5` 改成 `6` 会看得更远，但 AI 思考时间也会增加。一般不建议超过 `6`。

## 调整棋盘尺寸

三种尺寸定义在 `script.js` 的 `BOARD_SIZES` 中：

```js
const BOARD_SIZES = {
  small: { cols: 7, rows: 6, maxWidth: 620, label: "Small" },
  medium: { cols: 8, rows: 7, maxWidth: 700, label: "Medium" },
  large: { cols: 9, rows: 8, maxWidth: 780, label: "Large" },
};
```

- `cols` / `rows`：实际网格尺寸
- `maxWidth`：棋盘在桌面端的最大宽度

同时需要更新 `index.html` 中 `#board-size` 的 `<option>` 文本，保持界面显示一致。

## 音效说明

音效由 Web Audio API 实时合成：

- 玩家落子：较高音的快速下坠声
- AI 落子：较低音的沉重落子声
- 浏览器要求先有用户点击才能播放音频，点击 Start Game 后会自动解锁音频上下文

因此不需要下载或维护任何 `.mp3` / `.wav` 文件。

## 像素角色

三个角色均为内嵌 SVG 像素画，由 `script.js` 中的字符网格生成，不依赖外部图片：

- 鸡：16 × 16
- 猫：16 × 16
- 霸王龙：26 × 26

如果想修改颜色，编辑对应 `AI_PROFILES` 中的 `palette` 即可。

## 字体

字体已经下载到本地 `assets/fonts/`，不依赖 Google Fonts 或网络：

- **Press Start 2P**：标题、按钮、标签
- **VT323**：正文和说明文字

两个字体均采用 SIL Open Font License 1.1，授权信息见 `assets/fonts/OFL.txt`。即使离线打开，像素字体也能正常显示。
