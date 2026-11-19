# 给 Connect 4 网站加"Google 登录 + 评论"

站点是 GitHub Pages 上的纯静态页面，不能跑服务端代码。所以评论后端放在
**Cloudflare Worker + D1**（免费额度内），前端只是多了一个评论区块。

```
浏览器  ──Google ID token──►  Worker /login   ──► 用 Google 公钥验签
                                              └──► 发一个 7 天有效的会话令牌
浏览器  ──Bearer 令牌 + 评论──►  Worker /comments ──► 写入 D1
```

**为什么不用 Cookie？** 页面在 `*.github.io`，接口在 `*.workers.dev`，属于跨站。
跨站 Cookie 会被 Safari、Firefox 直接拦截。所以前端把令牌存在 `localStorage`，
用 `Authorization: Bearer` 发送——这样所有浏览器都能用，你的网址也不用变。

## 改了哪些文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | 加了评论区块的 HTML、两份新资源引用 |
| `comments.css` | 评论区块样式，沿用 `styles.css` 里的配色变量 |
| `comment-section.js` | 登录按钮、发评论、渲染列表（**只有这里需要你填两个值**） |
| `api/src/index.js` | Cloudflare Worker：验 Google 令牌、读写评论 |
| `api/schema.sql` | D1 建表语句 |
| `api/test/smoke.mjs` | 本地冒烟测试，14 个用例 |

游戏本身的 `script.js` 一行没动。

---

## 第一步：Google Cloud Console

1. 打开 <https://console.cloud.google.com>，新建项目。
2. **APIs & Services → OAuth consent screen**（新版叫 *Google Auth Platform*）：
   - User type 选 **External**
   - 填应用名、你的邮箱、支持邮箱
   - **Scopes 保持默认**（`openid` / `email` / `profile`），不要再加。基础 scope 属于非敏感范围，不需要 Google 审核
   - Publishing status 点 **Publish app**，发布为 *In production*
3. **Credentials → Create credentials → OAuth client ID**：
   - Application type: **Web application**
   - **Authorized JavaScript origins** 填：

     ```
     https://davidbai20100918-glitch.github.io
     ```

     ⚠️ 只填到域名，**不要**加 `/first-folder/`，末尾也不要加斜杠。
   - Authorized redirect URIs 留空
4. 复制 **Client ID**（形如 `1234-abc.apps.googleusercontent.com`）。

---

## 第二步：部署 Worker（全程网页操作，不用装任何东西）

1. Cloudflare 控制台 → **Workers & Pages → Create → Worker**，名字填
   `connect4-comments`，创建后点 **Edit code**。
2. 把 `api/src/index.js` 的**全部内容**粘贴进去，覆盖默认代码，点 **Deploy**。
3. 回到控制台 → **Storage & Databases → D1 SQL Database → Create**，
   名字 `connect4-comments`。创建完打开它的 **Console** 标签页，
   把 `api/schema.sql` 的内容粘进去执行。
4. 回到这个 Worker → **Settings → Bindings**，逐个添加（每加完一个点一次 Save/Deploy）：

   | 类型 | 变量名 | 值 |
   | --- | --- | --- |
   | D1 Database | `DB` | 选刚建的 `connect4-comments` |
   | Plain text | `GOOGLE_CLIENT_ID` | 第一步复制的 Client ID |
   | Plain text | `ALLOWED_ORIGINS` | `https://davidbai20100918-glitch.github.io` |
   | Secret | `SESSION_SECRET` | 一串 48 位以上的随机字符 |

   `SESSION_SECRET` 可以用 PowerShell 生成：

   ```powershell
   -join ((48..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
   ```

5. 记下 Worker 地址，形如 `https://connect4-comments.你的子域.workers.dev`。
   浏览器直接打开它，应该看到 `{"ok":true,"service":"connect4-comments"}`。

> 顺带一提：绑定改了之后**必须重新 Deploy 一次**才会生效。

---

## 第三步：填两个值，推到 GitHub

打开 `comment-section.js`，改最上面两行：

```js
const API_BASE = "https://connect4-comments.你的子域.workers.dev";
const GOOGLE_CLIENT_ID = "1234-abc.apps.googleusercontent.com";
```

然后提交：

```bash
git add .
git commit -m "Add Google sign-in comment section"
git push
```

等 GitHub Pages 重新构建（约 1 分钟），刷新
<https://davidbai20100918-glitch.github.io/first-folder/>。

---

## 完成后的效果

- 右上角出现 "Sign in with Google"（黑色胶囊按钮，和暗色主题一致）
- 登录后显示头像 + 名字 + Sign out，评论框出现
- 未登录也能看评论，但发不了（服务端返回 401）
- 评论按时间倒序，最近 100 条

---

## 排查

| 现象 | 原因 |
| --- | --- |
| 提示 "Comments are not configured yet" | `comment-section.js` 里两个占位值没换 |
| 点击 Google 按钮报 `origin_mismatch` | Google Console 的 Authorized JavaScript origins 没填或多了路径 |
| 浏览器控制台 CORS 报错 | Worker 的 `ALLOWED_ORIGINS` 和实际访问域名不一致（注意 `https://`，不能有结尾斜杠） |
| 登录后发评论 401 | 前端 `GOOGLE_CLIENT_ID` 和 Worker 变量里的 Client ID 不是同一个 |
| 登录后 500，日志显示 `SESSION_SECRET is not set` | Secret 没加，或加了没重新 Deploy |
| Google 按钮不显示 | 广告拦截插件拦了 `accounts.google.com/gsi/client`，或浏览器禁用了第三方 Cookie |

Worker 的实时日志在控制台 **Logs** 标签页（`wrangler tail` 也行）。

## 安全性说明

- 服务端**从不相信前端自称的身份**：先验 Google 的 RS256 签名，再校验
  `aud`（必须是你的 Client ID）、`iss`、`exp`、`email_verified`
- 明确拒绝 `alg: none` 之类的算法混淆攻击（测试里有用例）
- 会话令牌是 Worker 自己用 HMAC-SHA256 签的，过期时间 7 天
- 所有评论渲染走 `textContent` / `esc()`，不会触发 XSS
- 每人 10 秒内只能发一条

## 可选：以后想更稳

- **迁移托管到 Cloudflare Pages**：同一个 GitHub 仓库直接连，push 就自动部署。
  这样就可以把接口和页面放同源，改用 `HttpOnly` Cookie，令牌不再进 JS。
  代价是网址会变成 `*.pages.dev`（或绑自定义域名）。
- **加审核**：`comments` 表加 `hidden INTEGER DEFAULT 0`，列表查询加
  `WHERE hidden = 0`，后台直接改数据库。
- **本地开发**：`cd api && npx wrangler dev`，把 `ALLOWED_ORIGINS` 临时加上
  `http://localhost:8788`。

## 本地测试

改完 `api/src/index.js` 后跑一遍（不需要 Google 账号，也不需要联网）：

```bash
node api/test/smoke.mjs
```

它会自建 RSA 密钥对冒充 Google 的 JWKS，覆盖登录、鉴权、发帖、篡改令牌等 14 个用例。
