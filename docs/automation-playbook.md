# 浏览器验证工作流 Playbook

> 把「AI 改完代码、手动开浏览器点一遍确认没坏」这件事，固化成**一行命令 + 可追溯证据链**。
>
> 本文既是本项目 `scripts/` 自动化脚本的说明，也是一份可照搬到下一个纯前端 / 油猴脚本项目的方法论模板。读者：未来的自己，以及协作的 AI 助手。

## 1. 为什么需要它

AI 辅助开发的真正瓶颈不在「写代码」，而在「验证改动」。如果每次改动都靠肉眼开浏览器回归，迭代速度会被验证成本拖垮，且容易漏测。

这套工作流的目标，是把「验证一次改动」从

> 开浏览器 → 登录 → 找视频 → 滚到评论 → 点屏蔽 → 肉眼确认 →（改了又来一遍）

降到

> `npm run pw:comment-timing` → 读 `result.json` 的 `ok` 字段。

核心理念：**人只在第一次手动探查时介入，之后把判断标准固化进脚本，让机器重复执行并留下证据。**

## 2. 全景链路

```
start-chrome.ps1          带 --remote-debugging-port + 独立 profile 启动真实 Chrome
  └─ 手动登录一次          登录态存在 repo 外,长期复用,幂等(已运行则连上)
       │
       ▼
inspect-comments.mjs      [探查] CDP 连上去,肉眼看真实 DOM / Shadow DOM 结构
       │                  ← 人工阶段:搞清楚选择器、组件树、数据藏在哪
       ▼
tampermonkey-dev.mjs      [热迭代] 本地 HTTP server + @require 热加载 dist
       │                  ← 在真实 Tampermonkey 里反复改、刷
       ▼
*-timing-smoke.mjs        [固化] 把手动操作 + 肉眼判断写成可重复脚本:
       │                    CDP 连真实浏览器 → eval 注入 dist + mock GM API
       │                    → 驱动交互(屏蔽→peek→刷新→恢复)→ recorder 记录
       │                    → 判定 pass/fail
       ▼
artifacts/<时间戳>/        [产物] result.json(结论) + events.jsonl(带相对时间戳的事件流)
                          ← 可追溯、可 diff、可回头喂给 AI 复盘
```

旁边还有一条**不碰浏览器**的支线：`perf-boundary.mjs` 直接 `import` `src/` 模块跑压测，产出性能档位结论。它和浏览器链路正交，是另一类资产（纯逻辑基准）。

## 3. 四个关键设计决策（及理由）

这四点是整套工作流能成立的支柱，迁移到新项目时要原样保留思路。

| 决策 | 理由 |
|---|---|
| **CDP 连真实浏览器，不用无头浏览器** | 复用已登录的真实会话；渲染、懒加载、风控行为都贴近真实用户；避开无头环境的登录与反爬难题。 |
| **持久 profile 放在 repo 外** | 登录一次（cookie 存 `~/codex-browser-profiles/<site>`），长期复用，不把登录态污染进仓库。启动脚本幂等：已在跑就直接连。 |
| **`eval` 注入 dist + mock GM API** | 不依赖「装好 Tampermonkey」也能把被测脚本注进页面；注入环境完全可控；可以拦截并记录 `GM_setValue` 写入，断言副作用。 |
| **recorder 双产物（`result.json` + `events.jsonl`）** | `result.json` 给机器读结论（`ok`/关键指标）；`events.jsonl` 给人/AI 回放过程（带相对毫秒时间线）。两者都能 diff、能喂回 AI 定位回归。 |

## 4. 可复用骨架：`scripts/lib/harness.js`

三个 smoke 脚本曾各自抄了一份相同的样板。现已抽成共享 lib，**新脚本一律从这里 import，不要再复制**。

| 导出 | 作用 |
|---|---|
| `readArg(name, argv?)` | 解析 `--name value` 命令行参数。`argv` 可注入，便于单测。 |
| `cleanText(value, max?)` | 折叠空白 + 截断，把页面文本塞进 `result.json` 时保持紧凑。 |
| `createRunId()` | 基于时间戳生成文件系统安全的运行 ID（冒号、点都换成连字符）。 |
| `createRecorder()` | 事件记录器，`mark(kind, data)` 追加一条带相对毫秒 `t`、ISO `ts`、`kind` 的事件。 |
| `toRelative(filePath)` | 绝对路径转相对 cwd 的展示路径。 |
| `writeRunFiles(runDir, result, events)` | 把结论和事件流写到 `runDir` 下的 `result.json` / `events.jsonl`。 |
| `selectPage(context, prefer?)` | 在已连接的 CDP context 里挑目标标签页。`prefer` 是按优先级排列的 URL 子串列表，全不中则退回首个页面，没有则新开。 |

这套骨架**与具体站点无关**，是可以直接拷到下一个项目的部分。单测见 `tests/automation-harness.test.js`，已纳入 `npm run check` 与 `npm run lint`。

## 5. 写一个新 smoke 脚本（模板）

照这个骨架填空，独特逻辑只在第 3、4 步：

```js
import { chromium } from "@playwright/test";
import {
  readArg, createRunId, createRecorder, toRelative, writeRunFiles, selectPage,
} from "./lib/harness.js";

const port = Number(readArg("--port") ?? 9223);
const endpoint = `http://127.0.0.1:${port}`;

async function run(runDir, recorder) {
  // 1) 连接真实浏览器,复用登录态
  recorder.mark("run.start", { endpoint });
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  recorder.mark("browser.connected", {});

  // 2) 选目标标签页(prefer 列表按新项目的 URL 改)
  const page = await selectPage(context, ["example.com/target", "example.com"]);
  await page.bringToFront();           // ← 关键:很多站点 tab 非激活时不渲染/不加载

  // 3) 注入被测脚本 + mock 运行时 API(项目专用)
  //    await page.evaluate(({ source }) => { /* mock GM_*; (0, eval)(source); */ }, ...)

  // 4) 驱动交互 + 采样判定(项目专用)
  //    recorder.mark("xxx.sample", { ... });

  // 5) 落盘结论 + 事件流
  const result = { ok: true, /* 关键指标 */ };
  recorder.mark("run.end", { ok: result.ok });
  await browser.close();
  return writeRunFiles(runDir, result, recorder.events);
}

const runDir = `artifacts/playwright/<name>/${createRunId()}`;
const recorder = createRecorder();
run(runDir, recorder)
  .then((paths) => console.log(JSON.stringify({ ok: true, resultPath: toRelative(paths.resultPath) }, null, 2)))
  .catch((error) => { recorder.mark("run.error", { message: error.message }); process.exit(1); });
```

**事件 `kind` 命名约定**（保持跨脚本一致，便于统一解析）：
`run.start` → `browser.connected` → `page.selected` → `<feature>.sample` → `run.end` / `run.error`。

## 6. 踩坑清单（血泪约定）

迁移时最容易踩的，不是代码，是这些隐性前提：

- **🚩 注入 / 不注入的红线**：只有真正 `eval` 注入了 dist 的脚本，才能验证脚本改动。纯探针脚本（连接、抓 DOM、看网络）**验证不了任何代码改动**，它只确认页面/网络环境健康。给每个命令在文档里标清楚「是否注入被测产物」，否则 AI（和你）会误以为「冒烟跑过 = 改动验证过」。
- **🚩 tab 必须激活**：很多站点（含 B 站）在标签页非激活时，页面通过 CDP 可读，但懒加载内容（评论、下半屏卡片）拒绝加载。滚动前先 `page.bringToFront()` / `Page.activate`。
- **🚩 Shadow DOM 层级**：现代站点的评论/卡片常是 Web Components，数据藏在多层 `shadowRoot` 里（本项目评论是 `bili-comments → bili-comment-thread-renderer → bili-comment-renderer → bili-rich-text`）。先用探查脚本把组件树摸清楚，再写选择器，必要时优先读组件的 `__data` 而非 DOM 文本。
- **🚩 API 限频敏感**：评论类接口对请求频率敏感，smoke 里频繁刷新/重查可能触发短时失效。脚本里给采样留间隔，别把失败一律当回归。
- **⚠️ 产物 schema 暂未统一**：`events.jsonl` 格式跨脚本一致，但各脚本的 `result.json` 顶层字段还各不相同。新增脚本时尽量向 `{ ok, target, checks:[...], artifacts }` 这类同构结构靠拢，为将来自动解析/CI 留口子。

## 7. 产物怎么用

- **`result.json`** — 给机器/CI 读的结论。先看 `ok`，再看关键指标（如延迟、命中数）。
- **`events.jsonl`** — 给人/AI 读的时间线。每行一个事件，`t` 是相对运行起点的毫秒数；出问题时按时间线回放，定位「卡在哪一步」。
- **喂回 AI** — 回归时把对应 run 的两个文件贴给 AI，它能据时间线和结论直接推断哪一步偏离预期，比口述「不工作了」高效得多。
- 产物目录 `artifacts/` 已被 `.gitignore`，是一次性运行记录，不入库。

## 8. 迁移到下一个项目的 Checklist

- [ ] **直接拷** `scripts/lib/harness.js` + `tests/automation-harness.test.js`（站点无关骨架）。
- [ ] **改启动脚本**：复制 `tools/<browser>/start-chrome.ps1`，换 profile 目录名与默认 URL。
- [ ] **重写探查脚本**：照 `inspect-comments.mjs`，按新站点 DOM / 组件树重写采集逻辑。
- [ ] **按模板写 smoke**：套用第 5 节骨架，只填注入逻辑（第 3 步）和交互判定（第 4 步）。
- [ ] **`selectPage` 的 `prefer`** 换成新站点的目标 URL 子串。
- [ ] **把第 6 节红线**抄进新项目 README，并给每个命令标注「是否注入被测产物」。
- [ ] **把 `scripts/lib` 纳入 lint**（`eslint.config.js` 加 node globals 块 + lint 脚本带上 `scripts/lib`）。

> 经验数据：本项目里通用骨架约占自动化代码的 8–10%，其余 90% 是绑定站点 DOM / 被测脚本实现细节的专用逻辑。**别期待整段复用，期待复用的是这套骨架 + 这份方法论。**

## 相关文件

| 路径 | 说明 |
|---|---|
| `scripts/lib/harness.js` | 站点无关的公共骨架（本文第 4 节） |
| `tests/automation-harness.test.js` | 骨架单测 |
| `scripts/playwright-smoke.mjs` | 探针冒烟（**不注入**，只测页面/网络环境） |
| `scripts/comment-timing-smoke.mjs` | 评论屏蔽端到端冒烟（注入 dist） |
| `scripts/video-card-timing-smoke.mjs` | 视频卡片屏蔽端到端冒烟（注入 dist） |
| `scripts/perf-boundary.mjs` | 纯 Node 性能边界压测（不碰浏览器） |
| `tools/bilibili-browser/README.md` | 启动真实 Chrome、命令注入对照表、Shadow DOM 结构 |
