# Bilibili Browser Profile

This folder contains small helper scripts for using a dedicated Chrome profile
with Bilibili. The profile stores login cookies outside the repo:

```text
C:\Users\tongying\codex-browser-profiles\bilibili
```

Start Chrome:

```powershell
npm run pw:chrome
```

或从项目根目录：

```powershell
.\tools\bilibili-browser\start-chrome.ps1
```

Then log in to Bilibili manually in the visible Chrome window. After login, keep
that Chrome window open and ask Codex to inspect the current video/comments.

Inspect the first homepage video and its comment component:

```powershell
node tools/bilibili-browser/inspect-comments.mjs --open-first-video
```

Inspect a specific video:

```powershell
node tools/bilibili-browser/inspect-comments.mjs --video https://www.bilibili.com/video/BV1Vk7M6tEgx/
```

Run the comment timing smoke from the project folder:

```powershell
npm.cmd run build
npm.cmd run pw:comment-timing -- --video https://www.bilibili.com/video/BV1Vk7M6tEgx/
```

The timing smoke injects the current `dist` userscript into the active CDP page,
derives a keyword from the first rendered comment, and checks this flow:

```text
comment hidden -> show -> still shown after refresh -> rehide -> restored after script off
```

The script activates the Chrome tab before scrolling. That matters on Bilibili:
the page can be readable through CDP while lazy-loaded comments still refuse to
load until the tab is active.

## Smoke 命令对照（重要：注入关系）

三个 `pw:*` 命令名容易误导。**只有名字里带 `timing` 的两个会注入我们构建的
`dist/bilibili_blocked_videos_by_tags.user.js`**，`pw:smoke` 不注入，验证不了任何
脚本改动。

| 命令 | 注入 userscript？ | 实际验证内容 | 能否验证脚本改动 |
|---|---|---|---|
| `npm run pw:smoke` | ❌ 不注入 | 仅探针：连 CDP、开视频页、抓 `bili-comments` 组件快照、监听 `/x/v2/reply` 接口响应 | ❌ 只测页面环境/网络，与我们的脚本无关，不能用来验脚本是否被改坏 |
| `npm run pw:comment-timing` | ✅ 注入 dist | 端到端：评论关键词屏蔽 -> hover peek -> resize 刷新后 peek 保持 -> 离开 -> 移除规则 -> 关脚本恢复 | ✅ 测评论屏蔽全流程 |
| `npm run pw:video-card-timing` | ✅ 注入 dist | 端到端：视频卡片标题规则屏蔽 overlay 时序 + 滚动 fast-path + pipeline 重跑翻转 | ✅ 测视频卡片屏蔽全流程 |

想验证"脚本改动有没有把脚本跑炸"，用 `pw:video-card-timing`（视频侧）或
`pw:comment-timing`（评论侧）。`pw:smoke` 只适合确认浏览器/页面/网络健康。

两个 `timing` 命令虽然名字只提"时序"，实际都是端到端功能 smoke，时序只是其中一环。

`pw:comment-timing` / `pw:video-card-timing` 都支持参数覆盖：

```powershell
npm run pw:comment-timing -- --video https://www.bilibili.com/video/BVxxxx/
npm run pw:comment-timing -- --no-inject          # 只跑流程不注入脚本（用于对照页面本身行为）
npm run pw:video-card-timing -- --url https://www.bilibili.com/
npm run pw:video-card-timing -- --userscript path/to/other.user.js
```

Current Bilibili comments are Web Components, not plain page-level DOM:

```text
bili-comments
  #shadow-root
    bili-comment-thread-renderer
      #shadow-root
        bili-comment-renderer
          #shadow-root
            bili-rich-text
              #shadow-root
                #contents
```

The script reads the first comment from the component data and also reports the
rendered `bili-rich-text` text from Shadow DOM.

This uses Chrome DevTools Protocol on `127.0.0.1:9223` and does not require
Playwright or browser-use.

## Tampermonkey Dev Loader

Use this when you want to install the current local build through Tampermonkey
instead of injecting it with the smoke scripts:

```powershell
npm run tm:dev
```

What it does:

```text
1. Builds dist/bilibili_blocked.dev.body.js
2. Writes dist/bilibili_blocked.dev.user.js
3. Serves dist on http://127.0.0.1:8741/
4. Opens the dev userscript install/update URL in the Bilibili Chrome profile
```

The dev userscript keeps the normal script name and namespace so it updates the
same Tampermonkey script and keeps the same GM storage. Its executable code is
loaded through:

```text
@require http://127.0.0.1:8741/bilibili_blocked.dev.body.js?v=<timestamp>
```

Keep the `tm:dev` process running until Tampermonkey has finished installing or
updating the script. For a build-only refresh:

```powershell
npm run tm:dev:build
```

Useful options:

```powershell
npm run tm:dev -- --port 8742
npm run tm:dev -- --no-open
npm run tm:dev -- --build-only
```
