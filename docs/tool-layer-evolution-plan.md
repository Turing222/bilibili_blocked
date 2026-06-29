# Tool 层演进方案：CDP 探针 → Chrome DevTools MCP

> 把 `tools/` + `scripts/*-smoke.mjs` 这套「手搓 CDP + Playwright 透传」的验证工具链，按职责拆成「agent 交互」与「确定性断言」两条线，该交 MCP 的交 MCP，该留在代码里的留下并重构干净。
>
> 本文是 [`automation-playbook.md`](./automation-playbook.md) 第 2、3 节链路的演进增量，不重复其已定型的四项核心决策（CDP 连真实浏览器、持久 profile、`eval` 注入 + mock GM、recorder 双产物），只讲哪些层要换、怎么换、为什么。

**实施状态（2026-06-29）**：阶段 1–4 的代码主体已在最近提交中落地（commits `fdace96` → `d39dd12`）；本文为后续收尾状态说明。日常命令见 [`tools/bilibili-browser/README.md`](../tools/bilibili-browser/README.md) Phase 1 节与下方 §7 收尾表。

| 类别 | 命令 |
|---|---|
| 启动 Chrome | `npm run pw:chrome` |
| 本地回归 smoke | `npm run pw:comment-timing` / `pw:video-card-timing` |
| 确定性探针 oracle | `npm run pw:inspect` |
| MCP vs oracle diff | `npm run pw:oracle-compare` |
| 生成 / 刷新 smoke 基线 | `npm run pw:baseline` |

**仍可选 / 未强制验收**：阶段 2 进一步减少页面侧状态读取脚本（不强制消灭合理 `evaluate`）；**`ci:deterministic-smoke`**（§4.3.5，后续另立方案）。

## 1. 背景与现状

当前 tool 层是三层结构，全跑在 `127.0.0.1:9223` 那个**已手动登录的独立 Chrome profile** 上（见 [`tools/bilibili-browser/README.md`](../tools/bilibili-browser/README.md)）：

```
start-chrome.ps1            启动层  --remote-debugging-address=127.0.0.1 + --remote-debugging-port=9223 + 独立 profile
  └─ 手动登录一次            登录态存 repo 外,幂等复用
       │
       ▼
inspect-comments.mjs         探针层  Playwright connectOverCDP + 共享 bilibili-dom.js
       │                            输出固定结构 JSON（oracle / MCP 对照组）
       ▼
*-timing-smoke.mjs           流程层  Playwright connectOverCDP + page.evaluate
                                     带硬断言,落 result.json / events.jsonl
```

两个事实决定演进方向（**撰写时**；截至 2026-06-29 已按 §7 收口）：

1. **探针层**曾用手搓裸 CDP 客户端，现已迁到 Playwright + 共享 `bilibili-dom.js`，JSON 契约作长期 oracle。
2. **流程层** smoke 已抽公共 lib、`scrollUntil`、browser lease，并补上评论接口 `waitForResponse` 等待；关键可见交互已 Locator 化，页面侧 `evaluate` 主要保留给 Shadow DOM / `__data` / 注入脚本等非用户操作。

## 2. 目标与非目标

**目标**

- 探针层新增 Chrome DevTools MCP（full mode）作为 agent 交互入口；手搓 `CdpClient` 的底层可后续迁移到 Playwright `CDPSession`，但**确定性探针的 JSON 输出契约长期保留**，作为 oracle / 对照组 / 逃生通道。
- 流程层在 Playwright 内部做重构，消除重复代码与脆弱等待，用对 Locator / `waitForResponse` / `addInitScript`，但保持「确定性断言 + 产物落盘」形态不变。
- 启动层入口与使用方式保持现状，只补必要安全约束。

**非目标**

- **不**把流程层的硬断言 smoke 拆成 MCP 工具调用让 agent 去判断——失去可重复性。
- **不**替换 CDP 协议本身。MCP 底层仍是 CDP（Puppeteer 连 9223），换的是**控制面**（脚本 → agent），不是传输层。
- **不**把现有 smoke 当作严格 CI gate。它依赖手动登录的持久 profile + `connectOverCDP`，是**本地回归 gate / preflight gate**，不是无人工、可空环境重建的 CI gate（见 §4.3 末）。
- **不**动登录态管理、不动 recorder 双产物、不动 `harness.js` 已有导出。

## 3. 核心判断：两条轴

「交给」vs「保留」曾因没区分两条轴而看起来矛盾。方案以此定盘：

| 轴 | 两端 | 含义 |
|---|---|---|
| 轴 1：实现方式 | 手搓 CDP ↔ 封装工具 | 代码用裸 WebSocket 发 CDP 命令，还是用 Playwright/MCP 封装 |
| 轴 2：调用主体 | 代码断言 ↔ agent 交互 | 流程写死在脚本里跑断言，还是由 agent 按需调工具边看边判断 |

| 层 | 轴 1（实现方式） | 轴 2（调用主体） |
|---|---|---|
| 启动层 `start-chrome.ps1` | 手搓（保留） | 不参与，是 MCP 与 Playwright 共同的地基 |
| 探针层 `inspect-comments.mjs` | 手搓 → 可迁 Playwright `CDPSession` | **新增 agent 交互（MCP）**，但确定性 JSON 契约保留作 oracle |
| 流程层 `*-timing-smoke.mjs` | 已是 Playwright（要用地道） | **必须留在代码断言** |

## 4. 分层决策

### 4.1 启动层 — 行为保持现状，只补安全约束

`start-chrome.ps1` / `start-bilibili.cmd` 的入口与使用方式保留；只允许做最小安全参数补强。

**理由**：它就是几个 Chrome 启动参数 + HTTP 探活，引依赖反而更重。MCP（`--browser-url`）和 Playwright（`connectOverCDP`）都要靠它开的 9223 端口和已登录 profile——它是公共地基。

**边界修正**：业务行为保持现状，但安全约束必须落到启动机制里，而不是只写在风险章节。`start-chrome.ps1` 应显式传 `--remote-debugging-address=127.0.0.1` 与 `--remote-debugging-port=9223`；启动后可用本机监听检查确认 9223 没有绑定到局域网地址。

### 4.2 探针层 — 交给 Chrome DevTools MCP（full mode）

用 `chrome-devtools-mcp` 的 **full mode**（不加 `--slim`）作为 agent 交互入口。`inspect-comments.mjs` 作确定性 oracle（底层已 Playwright 化，见 §7 阶段 3）。

#### 4.2.1 MCP 配置

> 版本号以**实际验收通过**的版本为准；撰写时上游最新约 1.4.x。锁定版本、不盲目跟随 `@latest`——这属于配置本身，不是留到风险章节才做的事。

**Cursor / 通用 MCP JSON**：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.4.0",
        "--browser-url=http://127.0.0.1:9223",
        "--no-usage-statistics",
        "--no-performance-crux"
      ],
      "env": {
        "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS": "1"
      }
    }
  }
}
```

**Codex Windows（`.codex/config.toml`）**——不能直接套 Cursor JSON，需经 `cmd /c npx` 启动并放宽超时。Codex Desktop 当前实际读取用户级 `%USERPROFILE%\.codex\config.toml`，仓库内 `.codex/config.toml` 作为项目配置记录；修改后需重启 Codex 让 MCP server 重新加载：

```toml
[mcp_servers.chrome-devtools]
command = "cmd"
args = [
  "/c", "npx", "-y",
  "chrome-devtools-mcp@1.4.0",
  "--browser-url=http://127.0.0.1:9223",
  "--no-usage-statistics",
  "--no-performance-crux",
]
env = { CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS = "1" }
startup_timeout_ms = 20000
```

要点：

- `-y`：避免首次下载交互确认。
- `--no-usage-statistics`：关闭使用统计上报（官方支持）。
- `--no-performance-crux`：避免性能分析把被测 URL 发送给 CrUX API（据官方说明，review 指出）。
- `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`：关闭更新检查，防止版本漂移。
- 不加 `--slim`：我们要 `list_pages`/`select_page`/`list_network_requests` 等 full 工具集。

#### 4.2.2 工具映射表（全部 full mode 工具名）

> 【红线】full mode 与 slim mode（`--slim`）工具集不同，不可混用。slim 只有 `navigate`/`evaluate`/`screenshot` 三个工具；full 才有 `list_pages`/`select_page`/`list_network_requests` 等。执行 JS 的工具在 full mode 叫 `evaluate_script`，参数是 `function`（一个 JS 函数源码），**不是** slim 的 `evaluate({ script })`，也不要写成自执行 IIFE 字符串。

| 现状（`inspect-comments.mjs`） | full mode MCP 工具 |
|---|---|
| `requestJson('/json/list')` + 按 URL 挑页面（L109-122） | `list_pages` → `select_page({ pageId })` |
| `requestText('/json/activate/{id}')` 激活标签（L127/L138/L143/L168） | `select_page({ pageId, bringToFront: true })` |
| `cdp.send('Page.navigate', {url})`（L136/L141/L166） | `navigate_page({ type: 'url', url })` |
| `cdp.send('Page/Runtime/Network.enable')`（L130-132） | MCP 自动管理，无需手动 |
| `evaluate(cdp, expr)` 读 DOM / Shadow DOM / `__data`（L96-107） | `evaluate_script({ function: "() => { ... return x; }" })` |
| `[350,500,...] + delay(2000)` 滚动轮询评论出现（L238-298） | 带超时的 `evaluate_script` 返回结构化 JSON + 代码侧 `scrollUntil`（见 §4.3） |
| `evaluate` 内 `fetch('/x/v2/reply')`（L207-234） | 仍可 `evaluate_script`；或导航/触发后 `list_network_requests` + `get_network_request({ requestId })` |
| 看 a11y 视图 | `take_snapshot`（基于 a11y tree 的文本快照） |

`evaluate_script` 的签名（官方 `src/tools/script.ts`）：

```ts
{
  function: string,          // 一个 JS 函数源码,如 "() => document.title"
  args?: string[],           // 可选参数
  filePath?: string,         // 可选,把脚本输出存文件
}
```

#### 4.2.3 三个边界（review 指出，务必遵守）

1. **`wait_for` 主要用于等待指定文本出现**，不是任意 DOM predicate 等待器。等 `__data` 状态 / computed style / `blocked` 标记 / shadow 内私有属性，用**带超时的 `evaluate_script` 返回结构化 JSON**，由代码或 agent 判断，不要指望 `wait_for`。

2. **网络请求必须在正确时间开始捕获**。`list_network_requests` 返回的是当前选中页面**自最近一次导航以来**记录的请求（可加 `includePreservedRequests` 保留近 3 次导航历史）。不能假设 MCP 连上后自动拥有连接前的全部网络历史。流程：`连接 → select_page → 触发目标导航/动作 → list_network_requests`。B 站评论接口可能被分类为 XHR 或 Fetch，过滤时**不要只查 `Fetch`**，先按 URL 匹配 `/x/v2/reply` 更稳。

3. **`bringToFront` 后仍要断言页面状态**，不只看工具返回成功。激活后立即 `evaluate_script` 检查：

```js
() => ({
  href: location.href,
  title: document.title,
  visibilityState: document.visibilityState,
  hasFocus: document.hasFocus(),
})
```

至少 `visibilityState === 'visible' && hasFocus === true` 再开始依赖前台状态的懒加载操作（对上 playbook 第 6 节「tab 必须激活」红线）。

#### 4.2.4 能力边界

`take_snapshot` 基于 a11y tree，对 B 站评论这种多层嵌套 open shadow root + `__data` 私有属性，snapshot 未必完整暴露内部结构。**元素定位可吃 snapshot 红利，深层读取仍用 `evaluate_script` 手写 JS 兜底**——和现在 `inspect-comments.mjs` 读 `bili-comments` 那段 JS 等价。

### 4.3 流程层 — Playwright 内部重构，不换 MCP

`comment-timing-smoke.mjs` / `video-card-timing-smoke.mjs` 留在 Playwright 代码里做内部重构。

**不换 MCP 的理由**：价值在确定性断言 + 产物落盘。典型断言：

```820:829:bilibili_blocked_videos_by_tags/scripts/comment-timing-smoke.mjs
    const hidden = await waitForState(
      page,
      keyword,
      "comment hidden by keyword rule",
      (state) =>
        state.target?.blocked === true &&
        state.target?.computedVisibility === "hidden" &&
        state.target?.placeholderFound === true,
      recorder
    );
```

条件不满足就 `throw`，可作回归 gate。断言交给 agent 会失去可重复性。

#### 4.3.1 Playwright 用法推荐划分（review 修正）

> 【注意】`page.evaluate` 不是「退化成 CDP 透传」。准确说法是：**用 `evaluate` 做点击/等待/可见性判断是反模式，用 `evaluate` 读组件私有状态/注入 GM 环境是合理用途**。

| 任务 | 推荐方式 |
|---|---|
| 点击、输入、hover | `Locator`（带 actionability 检查） |
| 等待元素可操作 | `Locator` auto-waiting |
| 检查可见文本 | `expect(locator)` |
| 等待指定网络响应 | `waitForResponse`（先建 promise 再触发动作） |
| 读取 `__data` 等组件私有状态 | `evaluate` |
| 执行/注入 userscript | `evaluate` 或 `addInitScript`（见 §4.4） |
| 边缘 CDP 域 | `page.context().newCDPSession(page).send(...)`，不再手搓第二个 WebSocket client |

#### 4.3.2 重构清单

| 现状 | 问题 | 改法 |
|---|---|---|
| `queryAllDeep` 抄 5 份（L118 / L404 / L476 / L528 / L592） | 重复，改一处漏四处 | 抽进 `scripts/lib/bilibili-dom.js` 作为页面侧 DOM extractor；可见元素改用 `Locator`（见下条） |
| 手写 shadow 穿透选择器 `css=... >>> ...` | `>>>` 多余 | Playwright CSS `Locator` **默认穿透 open shadow DOM**，用嵌套 `Locator` 或普通后代选择器（见下） |
| `readDataMessage` / `readTextDeep` / `getCommentText` 散落 | 同上 | 抽进 `scripts/lib/bilibili-dom.js`，与阶段 3 的探针复用 |
| `GM_*` stub 内联在 `injectUserscript`（L336-369） | 复用难 | 抽成 `createGmRuntimeStub()`，放 `scripts/lib/userscript-runtime.js` 或 Playwright 专用 browser helper，不放通用 Node 骨架 |
| `[350,500,...] + delay(2000)` 滚动轮询（`inspect-comments.mjs` L238） | 固定坐标 + 固定 sleep | 流程层换 `scrollUntil`（有超时上限的状态驱动，见 §4.3.3） |
| `[500,900,...] + waitForTimeout(1500)`（L83） | 同上 | 同上 |
| 确定性网络断言 | `page.on('response')` 适合 recorder 全量观测 | 单步断言用 `waitForResponse`（见 §4.3.4） |

**落地状态（2026-06-29）**：首页首个视频选择已改为 Locator 候选扫描；`comment-timing` 的评论遮罩 hover、详情展开、规则删除、浮窗主按钮激活已改为 Playwright Locator / mouse / keyboard 操作。`evaluate` 仍保留在三类地方：读取 B 站 open shadow DOM 内部 `__data` / 组件私有状态、给 Locator 目标遮罩打临时测试标记、注入 userscript / mock GM 运行时。

**Locator 穿透 open shadow DOM**（不要用 `>>>`）：

```js
// 推荐:嵌套 Locator,CSS 默认穿透 open shadow root
const comments = page.locator("bili-comments");
const renderers = comments.locator("bili-comment-thread-renderer");

// 或普通后代选择器
const renderers2 = page.locator("bili-comments bili-comment-thread-renderer");
```

> 【注意】shadow 内**可见元素** → `Locator`；组件私有属性 `__data` → `evaluate`；**closed** shadow root → 普通 `Locator` 穿不透，必须 `evaluate`。不要为「Playwright 化」强行消灭所有 `evaluate`。

#### 4.3.3 `scrollUntil`：有边界的滚动 + 条件等待

> 【红线】`locator.waitFor()` **不会自动滚动页面触发懒加载**。B 站评论正是滚动触发懒加载的场景。核心不是「完全没有轮询」，而是**从固定时间驱动改成有超时和上限的状态驱动**。

抽进 Playwright browser helper（例如 `scripts/lib/browser-harness.js`；若继续放在 `harness.js`，需先明确该模块从“纯 Node 骨架”扩展为“可接收 Playwright Page 的测试骨架”）：

```js
async function scrollUntil(page, predicate, {
  maxAttempts = 20, step = 600, timeoutMs = 20_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let i = 0; i < maxAttempts; i++) {
    if (await predicate()) return;
    await page.mouse.wheel(0, step);
    await page.waitForFunction(
      () => document.readyState !== "loading",
      null,
      { timeout: Math.min(1000, deadline - Date.now()) }
    ).catch(() => {});
    if (Date.now() >= deadline) break;
  }
  throw new Error("Target state did not appear after bounded scrolling");
}
```

#### 4.3.4 网络断言：`waitForResponse` 优先

`page.on("response", ...)` 适合 recorder 收集全量事件；**确定性 smoke 中验证某次动作触发了目标接口**，用 `waitForResponse`，且**监听必须在触发动作之前创建**，否则竞态：

```js
// 先建 response promise,再触发动作
const replyResponse = page.waitForResponse(
  (r) => r.url().includes("/x/v2/reply") && r.status() === 200
);
await triggerAction();
const response = await replyResponse;
const body = await response.json();
```

#### 4.3.5 「CI gate」定位澄清（review P0-5）

现有 smoke 依赖手动登录 profile + `connectOverCDP` + 真实 B 站页面，且 Playwright 官方标注 `connectOverCDP` 比原生连接「显著更低保真」。它适合**本地真实环境集成 smoke**，不天然适合严格 CI gate（CI 要求无人工登录、可空环境重建、测试隔离、凭证安全注入）。

两类分开：

| 类别 | 实现 | 用途 |
|---|---|---|
| `local:real-smoke` | 连 9223 + 持久 profile + `connectOverCDP` | 本地回归 gate / preflight，验证真实 B 站行为，**不作为每次 CI 强制 gate** |
| `ci:deterministic-smoke`（可选，后续） | Playwright 自启浏览器 + 测试账号 `storageState` 或 mock API + 隔离 context | 正式 CI gate |

若目前只需本机验证，至少把文档/脚本里的「CI gate」改称「本地回归 gate」，避免对可重复性的描述高于实际能力。

### 4.4 注入层 — 现状暂留 + 时序验证任务

**先纠正一个不准确表述**：之前说「`addInitScript` 太早，拿不到 load 时机」不准确。`addInitScript` 在 document 创建后、页面自己脚本运行前执行，**完全可以在此刻 `addEventListener('load', handler)`，在真正 load 时收到事件**。真正该判断的是 userscript 的真实 `@run-at`（`document-start` / `document-end` / `document-idle`），而不是笼统说「init script 太早」。

**当前前置事实**：`scripts/userscript-header.template.js` 目前没有显式 `@run-at`，实际时序依赖油猴运行器默认行为。阶段 2 必须先把这个默认行为验清楚，再决定是否在 header 里声明项目自己的 `@run-at`，否则 harness 注入时序没有稳定契约可对齐。

**现有 `eval(source)` + 手动 `dispatchEvent("load")` 的问题**（review 指出）：`window.dispatchEvent(new Event("load"))` 不等价于浏览器真实 load——`isTrusted` 不同、可能再次触发网站自身已有 load 监听器、可能重复初始化、无法完整重现真实生命周期。

**更稳的两个方案**：

- **方案 A（按真实生命周期安装）**：用**一次** `addInitScript` 安装完整 bootstrap，在同一个 init script 内先注册 GM 环境与 load 监听，再安装/执行 userscript bootstrap；然后 `goto` + `waitForLoadState('load')`，让 userscript 在自己需要的 `@run-at` 时机触发。不要拆成两个 `addInitScript` 依赖先后顺序，Playwright 不保证多个 init script 的执行顺序。
- **方案 B（暴露明确入口）**：把 userscript 核心拆成 `export function bootstrapUserscript(runtime) {...}`，生产由油猴触发，测试直接 `page.evaluate(bootstrapUserscript, mockRuntime)`，比伪造全局 `load` 可控。

**落地**：现有实现**暂保留**（已能跑通 smoke），但在阶段 2 第一批增加一个专门任务——**验证真实油猴运行时序 vs 测试 harness 注入时序**，确认当前默认 `@run-at` 行为与注入时机一致，或显式声明新的 `@run-at` 后再定方案 A/B。不要把「手动派发 load」当最终定论写死。

## 5. 浏览器控制权规则（新增，review 指出）

MCP 与 Playwright 技术上可同时连 `127.0.0.1:9223`，但会互相干扰（导航同页、切标签、滚动、注入、改焦点、读旧状态）。必须建立互斥与确认规则：

- **MCP 探索期间，Playwright smoke 不运行；Playwright smoke 期间，agent 不调 MCP。**
- **锁文件 / 浏览器 lease**：脚本化 `mcp-probe-collect` 与 Playwright smoke 使用同一个 `artifacts/locks/browser-9223.lock`。获取锁必须是原子操作（例如创建锁目录，或用独占创建文件），不能先检查再写入。结束时按 owner token 释放锁；发现已有锁时必须停止操作并提示当前 owner。
- **手工 agent MCP 探索不自动拿锁**：Chrome DevTools MCP server 本身不会自动遵守本仓库的 lock。手工走查阶段必须人为遵守互斥规则，或先运行后续补充的显式 acquire/release 辅助命令。

```json
{ "owner": "pw:comment-timing", "pid": 12345, "pageUrl": "...", "startedAt": "..." }
```

- **stale lock 处理**：锁内容至少包含 `owner`、`pid`、`pageUrl`、`startedAt`。若进程不存在或锁超过约定 TTL，清理前要记录事件；不能静默覆盖。
- **操作前重新确认上下文**：每个操作序列开始前重新核对 `pageId` / URL / title / 目标视频 ID / 登录状态，不默认信任「当前选中页面」。MCP 默认依赖「当前选中页面」，多 agent / 共享 server 并发时容易互相覆盖上下文。

## 6. 安全规则（新增，review 指出）

这个 profile 是**已手动登录、持久复用、通过远程调试端口开放**的浏览器——不是普通测试浏览器，而是**高权限资产**。Chrome DevTools MCP 官方明确：MCP 客户端可查看/修改浏览器及 DevTools 数据；开放远程调试端口后本机其他应用也可连接控制；应使用非默认独立 profile。「profile 在 repo 外」只解决 Git 泄漏，不解决本机权限与 MCP 读取风险。

- 9223 只监听回环地址（`127.0.0.1`），不对局域网开放；`start-chrome.ps1` 应显式传 `--remote-debugging-address=127.0.0.1`，并在启动后校验监听地址。
- profile 只登录 B 站测试账号，**不**在此 profile 登录邮箱、支付、云后台等其他站点。
- 不存储与任务无关的密码和令牌。
- MCP 和 Chrome 不使用时关闭。
- 所有 `evaluate_script` / `evaluate` 默认视为**可执行任意页面代码**，审阅后再跑。
- **Agent 不得进行写操作**（发评论、点赞、关注、私信等），除非当前任务明确批准。本工具链定位是「读 + 验证」，不是「代操作」。

## 7. 行动项与顺序

按风险从低到高分阶段，每阶段独立验收、独立回滚。

### 阶段 1：配 MCP + 工具层/agent 层双验收（零业务代码改动）

> 【红线】不能用「agent 主观判断结果一致」当验收。要拆成**工具层验收**（MCP 脚本化采集与原探针结构化结果一致）和 **agent 层验收**（agent 能正确选页/调工具/解释结果）两层，失败时才能定位是哪层的问题。

- [x] 配 `chrome-devtools-mcp`（锁版本，§4.2.1），`npm run pw:chrome` 启动并手动登录。→ [`.cursor/mcp.json`](../.cursor/mcp.json)、[`.codex/config.toml`](../.codex/config.toml)；Codex Desktop 需同步到用户级 `%USERPROFILE%\.codex\config.toml` 并重启。
- [x] 确认/补齐启动层安全参数：`--remote-debugging-address=127.0.0.1` + `--remote-debugging-port=9223`，并验证 9223 只监听回环地址。→ [`start-chrome.ps1`](../tools/bilibili-browser/start-chrome.ps1)
- [x] **工具层验收（绕开 agent）**：`npm run pw:oracle-compare`（`inspect-comments.mjs → oracle.json`，`mcp-probe-collect.mjs → mcp.json`，经 [`normalize-results.mjs`](../tools/bilibili-browser/normalize-results.mjs) diff）。脚本化等价流程见 [`tools/bilibili-browser/README.md`](../tools/bilibili-browser/README.md) Phase 1；单独采集 MCP 侧结果可用 `npm run pw:mcp-probe`。
- [x] **agent 层验收**（2026-06-29，Codex Desktop 重启后人工走查）：agent 已用 MCP 跑通 `list_pages → select_page(bringToFront=true) → navigate_page → evaluate_script(读 bili-comments Shadow DOM + __data) → list_network_requests`，并正确解释结果。
- [x] 验收记录：工具层 diff 已通过（`diffs: []`）；agent 层选中视频页 `BV1Vk7M6tEgx` / `aid=116796183020898`，读取 `bili-comments` Shadow DOM 得到 `threadCount=21`、首条评论 `rpid=303732170657`，并在网络记录中确认 `/x/v2/reply/subject/description` 与 `/x/v2/reply/wbi/main` 均为 `200`。

### 阶段 2：流程层 Playwright 内部重构

- [x] 跑 `pw:comment-timing` / `pw:video-card-timing` 并通过本地回归。
- [x] 提供基线生成脚本 [`capture-smoke-baselines.mjs`](../scripts/capture-smoke-baselines.mjs)（`npm run pw:baseline`）；是否落盘固定基线取决于是否实际运行该命令，输出目录为 `artifacts/playwright/baselines`。
- [x] 抽 `queryAllDeep` / 评论读取逻辑进 [`bilibili-dom.js`](../scripts/lib/bilibili-dom.js)；GM 注入进 [`userscript-runtime.js`](../scripts/lib/userscript-runtime.js)；`scrollUntil` + browser lease 进 [`browser-harness.js`](../scripts/lib/browser-harness.js)；单测 [`browser-harness.test.js`](../tests/browser-harness.test.js)。
- [x] `waitForResponse` 替换评论接口单步网络等待：[`browser-harness.js`](../scripts/lib/browser-harness.js) 提供 `/x/v2/reply*` 响应匹配与“先注册等待，再触发滚动”封装，[`comment-timing-smoke.mjs`](../scripts/comment-timing-smoke.mjs) / [`playwright-smoke.mjs`](../scripts/playwright-smoke.mjs) 复用该逻辑；DOM 渲染仍由 Shadow DOM 状态采样确认。
- [x] 关键可见交互 Locator 化：首个视频链接选择、评论遮罩 hover/展开/删除、浮窗主按钮激活均改为 Playwright Locator / mouse / keyboard 操作；页面侧 `evaluate` 仅保留给 Shadow DOM 私有状态读取、测试目标标记与 userscript 注入。
- [x] **注入时序验证**（§4.4）→ 结论见 [`injection-timing-verification.md`](./injection-timing-verification.md)（暂保留 synthetic `load` harness）。
- [x] browser lease（§5）→ smoke / `inspect-comments` / `mcp-probe-collect` 共用 `artifacts/locks/browser-9223.lock`，并按 owner token 释放；手工 agent MCP 仍需人为遵守互斥。
- [x] 验收：`pw:comment-timing` / `pw:video-card-timing` 均为 `ok: true`（2026-06-29）。

### 阶段 3：探针底层迁移（不归档，作 oracle 长期保留）

> 【红线】**淘汰手搓 `CdpClient` ≠ 淘汰确定性探针**。`inspect-comments.mjs` 有三个长期价值：① MCP 返回异常时的对照组（页面真变了？MCP 丢数据？agent 选错标签？还是 CDP 本身没数据？）；② 机器可比较的固定结构 JSON，比 agent 调若干工具再自行总结更适合回归 diff；③ MCP 故障时的逃生通道（启动失败、工具改名、输出格式变化、snapshot 看不到私有数据）。

- [x] `inspect-comments.mjs` 底层改为 **Playwright `connectOverCDP` + `page.evaluate`**，共享 [`bilibili-dom.js`](../scripts/lib/bilibili-dom.js) 中 inspect 提取函数。
- [x] **保留** `npm run pw:inspect` / `inspect-comments.mjs` 命令名与 JSON 输出契约。
- [x] 验收：迁移后 `pw:oracle-compare` diff 仍通过（2026-06-29）。

最终形态（**已达成**）：

```
inspect-comments.mjs
  ├─ 不再自己维护 WebSocket / CdpClient
  ├─ 使用 Playwright connectOverCDP
  ├─ 调用共享 DOM extractor (scripts/lib/bilibili-dom.js)
  └─ 输出稳定 JSON (契约不变,长期作 oracle)
```

### 阶段 4：长期保留 inspect 命令与 JSON 契约

- [x] `inspect-comments` / `npm run pw:inspect` 与 JSON 输出契约长期保留，作为 MCP 的 oracle / 对照组 / 逃生通道，不因 MCP 稳定而废弃。

## 8. 风险与回滚

| 风险 | 影响 | 对策 |
|---|---|---|
| MCP snapshot 对 B 站深层 Shadow DOM 穿透不全 | agent 拿不到 `__data` | `evaluate_script` 兜底（§4.2.4） |
| `chrome-devtools-mcp` 版本演进，工具名/参数变 | 脚本/配置失效 | 配置里锁版本 + `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`，不盲目 `@latest`（§4.2.1） |
| MCP 与 Playwright 同时连 9223 互相干扰 | 状态错乱 | 锁文件 + 操作前重新确认上下文（§5） |
| 9223 + 已登录 profile 是高权限资产 | 本机其他应用可控制浏览器 | §6 安全规则 |
| 流程层重构引入行为差异 | smoke 误判 | 阶段 2 可用 `npm run pw:baseline` 生成 `result.json` / `events.jsonl` 基线，再逐项改逐项验 |
| 误把 `local:real-smoke` 当严格 CI gate | 验证可重复性被高估 | §4.3.5 分两类，文档改称「本地回归 gate」 |
| 误把 MCP 当 CI gate | 验证不可重复 | MCP 只用于开发期探索，回归 gate 仍是 `pw:*-timing` 代码断言 |
| 手动 `dispatchEvent('load')` 不等价真实 load | 重复初始化/触发网站自身监听器 | 阶段 2 时序验证任务，定方案 A/B（§4.4） |

回滚：阶段 1 删 MCP 配置即可；阶段 2 按 git 提交粒度逐项 revert；阶段 3 探针底层迁移有 JSON 契约当验收，可对照回退；阶段 4 无代码改动。

## 9. 验收标准

- **阶段 1**：工具层 `oracle.json` vs `mcp.json` 归一化 diff 通过 ✅（2026-06-29）；agent 层能正确选页/调工具/解释结果 ✅（2026-06-29）。
- **阶段 2**：`pw:comment-timing` / `pw:video-card-timing` 重构后 `ok: true` ✅；评论接口等待已接入 `waitForResponse` ✅（2026-06-29）；关键可见交互 Locator 化 ✅（2026-06-29）；注入时序结论见 [`injection-timing-verification.md`](./injection-timing-verification.md) ✅。
- **阶段 3**：`inspect-comments.mjs` 迁移底层后 JSON 输出结构一致，仍能作 oracle ✅。
- **阶段 4**：`inspect-comments` 命令与 JSON 契约长期可用 ✅。

## 相关文件

| 路径 | 本方案中的角色 |
|---|---|
| `tools/bilibili-browser/start-chrome.ps1` | 启动层，回环绑定 + 监听校验 |
| `tools/bilibili-browser/inspect-comments.mjs` | 探针层 oracle（Playwright 底层） |
| `tools/bilibili-browser/normalize-results.mjs` | 阶段 1 oracle / MCP 归一化 diff |
| `tools/bilibili-browser/oracle-mcp-compare.mjs` | 阶段 1 工具层一键验收 |
| `tools/bilibili-browser/mcp-probe-collect.mjs` | MCP 侧结构化采集（对照组） |
| `scripts/playwright-smoke.mjs` | 旧探针 smoke，复用评论接口响应匹配 helper |
| `scripts/comment-timing-smoke.mjs` | 流程层本地回归 smoke |
| `scripts/video-card-timing-smoke.mjs` | 流程层本地回归 smoke |
| `scripts/capture-smoke-baselines.mjs` | 生成 / 刷新 smoke 基线（`npm run pw:baseline`） |
| `scripts/lib/harness.js` | 公共 Node 骨架（参数、产物、recorder、选页） |
| `scripts/lib/browser-harness.js` | `scrollUntil`、browser lease、owner-token 释放校验、评论接口 `waitForResponse` helper、首页视频 Locator helper |
| `scripts/lib/bilibili-dom.js` | smoke + inspect 共享 DOM / 页面侧提取 |
| `scripts/lib/userscript-runtime.js` | GM stub + `injectUserscriptInBrowser` |
| `tests/browser-harness.test.js` | browser lease / scrollUntil / 评论接口响应 helper 单测 |
| `tests/normalize-results.test.js` | oracle 归一化 diff 单测 |
| `docs/injection-timing-verification.md` | §4.4 注入时序结论 |
| `.codex/config.toml` / `.cursor/mcp.json` | 阶段 1 `chrome-devtools-mcp@1.4.0` 项目配置；Codex Desktop 实际加载用户级 `%USERPROFILE%\.codex\config.toml` |
| `docs/automation-playbook.md` | 方法论总览，本方案是其演进增量 |
