# 视频卡片屏蔽延迟调查

日期：2026-06-25

## 目的

本次调查聚焦用户看到的现象：

> 视频卡片先出现在页面上，过一会儿才被屏蔽。

目标不是立刻改代码，而是把现有实现里导致延迟的来源、风险和推荐落地顺序整理清楚，方便后续按优先级处理。

---

## 结论摘要

当前“先出卡片，过一会儿才屏蔽”主要来自四类时序：

1. **页面新增卡片后，统一 MutationObserver 是 300ms trailing debounce**
   - 入口：`src/platform/page-observers.js:66`
   - debounce 实现：`src/utils/debounce.js:1`
   - 这意味着连续 DOM 插入会不断重置计时器，实际体感可能是“最后一次相关 DOM 变动后再等 300ms”。

2. **API 型规则需要等待数据回来，pending 时视频不会先被屏蔽**
   - pipeline 规则循环：`src/orchestration/pipeline.js:191`
   - API feature 返回 `false` 且当前视频尚未命中时会 `break`：`src/orchestration/pipeline.js:201`
   - API 完成后还要走一次 200ms refresh debounce：`src/main.js:84`

3. **overlay 模式下，`card-box` 命中后有 legacy 的 3 秒 blur -> overlay 延迟**
   - 渲染入口：`src/platform/renderer.js:17`
   - 3 秒延迟分支：`src/platform/renderer.js:640`
   - pending 期间卡片会被标记为 `data-bbvt-blocked="pending"`，后续 pipeline 会跳过它：`src/platform/dom-adapter.js:113`

4. **评论 API 规则还有额外的双段请求和错峰排队**
   - 评论规则入口：`src/features/comments.js:13`
   - 评论 API 前需要先确保 `aid`：`src/platform/api-client.js:248`
   - 一批评论请求会按 pending 数量做 100ms 递增错峰：`src/platform/api-client.js:661`
   - 所以“精选评论 / 置顶评论”规则通常比标签、分区、时长等规则更晚命中。

---

## 当前执行链路

### 1. 页面新增视频卡片

页面级监听由 `startPageObservers()` 统一管理：

- `window.load` 直接跑一次 pipeline
- `resize` 用 150ms debounce
- `MutationObserver` 用 300ms debounce

对应代码：

- `src/platform/page-observers.js:66`
- `src/platform/page-observers.js:72`

这里没有针对“新增视频卡片”的专用快路径。普通新增卡片都要等页面级 300ms debounce 触发完整 pipeline。

另外，当前 debounce 是 trailing-only：

- `src/utils/debounce.js:1`

因此如果 B 站 feed 分批插入卡片，实际触发时间不是第一张卡片出现后 300ms，而是最后一批相关 DOM 变动后 300ms。

### 2. 单条视频进入 pipeline

单视频处理顺序在 `runSingleVideoPipeline()` 中：

1. 读取 BV、标题等基础引用
2. 合并 DOM 能读到的基础视频信息
3. 挂载右键快速屏蔽/复核入口
4. 按顺序执行视频规则 feature
5. 执行白名单、UP 屏蔽建议等后处理
6. 渲染隐藏或 overlay

对应代码：

- `src/orchestration/pipeline.js:166`
- `src/orchestration/pipeline.js:182`
- `src/orchestration/pipeline.js:185`
- `src/orchestration/pipeline.js:191`
- `src/orchestration/pipeline.js:207`
- `src/orchestration/pipeline.js:213`

规则顺序来自 `src/features/index.js:32`：

1. `title-up`
2. `video-stats`
3. `up-profile`
4. `tags`
5. `comments`

当某个 API 型 feature 数据未就绪时，它会请求 API 并返回 `false`。如果当前视频还没有任何规则命中，pipeline 会停止继续跑后续规则，并在本轮渲染为“不屏蔽”。

### 3. API 回来后的刷新

API 请求完成后会调用 refresh callback：

- `src/main.js:84`

这层 refresh callback 本身还有 200ms debounce。也就是说 API 型规则的最短路径大致是：

```text
卡片进入 DOM
-> MutationObserver 300ms trailing debounce
-> pipeline 发起 API
-> 网络等待
-> API refresh 200ms debounce
-> pipeline 重新评估
-> 渲染屏蔽结果
```

如果命中后仍处于 overlay 模式且卡片是 `card-box`，后面还会叠加 3 秒 overlay 延迟。

---

## 规则分类

### A. 可以很快命中的规则

这些规则只依赖页面已经渲染出来的 DOM 信息：

- 标题屏蔽
- 卡片 DOM 能读到的 UP UID 屏蔽
- 卡片 DOM 能读到的 UP 名称关键词屏蔽

相关代码：

- DOM 读取 BV / 标题：`src/platform/dom-adapter.js:118`
- DOM 读取 UP UID / 名称：`src/platform/dom-adapter.js:160`
- 标题和 UP 规则：`src/features/title-up.js:10`
- 具体规则判断：`src/state/video-store.js:196`

注意：UP UID / 名称是否能快，取决于当前卡片 DOM 里是否已经有 `space.bilibili.com` 链接和名称节点。读不到时会依赖 `view` API 补齐。

### B. 需要 video view API 的规则

这些规则需要 `x/web-interface/view`：

- 时长
- 播放量
- 点赞率
- 投币率
- 收藏/投币比
- 竖屏
- 充电专属
- 视频分区
- 部分 UP UID / UP 名称补全

相关代码：

- `src/features/video-stats.js:18`
- `src/platform/api-client.js:89`
- `src/platform/api-client.js:565`

这些规则在 API pending 时不会先屏蔽卡片。

### C. 需要标签 API 的规则

这些规则需要 `x/web-interface/view/detail/tag`：

- 标签屏蔽
- 双重标签屏蔽

相关代码：

- `src/features/tags.js:13`
- `src/platform/api-client.js:175`
- `src/platform/api-client.js:583`

### D. 需要 UP 主页资料 API 的规则

这些规则通常需要先拿到 UP UID，再请求 UP card：

- UP 等级
- UP 粉丝数
- UP 简介

相关代码：

- `src/features/up-profile.js:24`
- `src/platform/api-client.js:355`
- `src/platform/api-client.js:601`

如果卡片 DOM 里没有 UP UID，需要先通过 video view API 补齐 UID，再请求 UP profile。

### E. 需要评论 API 的规则

这些规则最慢、最不稳定：

- 屏蔽精选评论的视频
- 按置顶评论屏蔽

相关代码：

- `src/features/comments.js:13`
- `src/platform/api-client.js:234`
- `src/platform/api-client.js:631`

评论规则有几个额外延迟来源：

- 没有 `aid` 时先请求 video view
- 然后请求 `/x/v2/reply/main`
- main 失败时回退 `/x/v2/reply`
- 多视频批量请求时有 100ms 递增错峰
- API 失败或 empty 后 3 秒内不重复请求

因此评论规则不适合承诺“卡片出现前就一定过滤掉”。

---

## 渲染层延迟

### 隐藏模式

如果 `hideVideoMode_Switch` 开启，命中后会直接隐藏视频：

- `src/platform/renderer.js:28`
- `src/platform/renderer.js:723`

这条路径不会走 `card-box` 的 3 秒 overlay 延迟。

### overlay 模式

默认配置中 `hideVideoMode_Switch` 为 `false`：

- `src/settings/defaults.js:87`

因此默认命中后使用 overlay。

overlay 模式下，如果视频卡片的第一个子元素 `className == "card-box"`，当前逻辑会：

1. 给视频卡片加 `filter: blur(5px)`
2. 标记 `data-bbvt-blocked="pending"`
3. 等 3000ms
4. 再真正插入 `.blockedOverlay`
5. 清掉 blur

对应代码：

- `src/platform/renderer.js:646`
- `src/platform/renderer.js:647`
- `src/platform/renderer.js:648`
- `src/platform/renderer.js:651`
- `src/platform/renderer.js:660`

pending 期间 `renderVideoBlockedState()` 会直接返回：

- `src/platform/renderer.js:42`

并且 dom adapter 会认为该卡片已经处于脚本处理中的 blocked child，跳过后续单卡 pipeline：

- `src/platform/dom-adapter.js:113`

这段是当前最明显、收益最大的可优化点。

---

## 额外观察

### 1. 快速屏蔽后的单卡重跑已经存在

快速屏蔽后会调用单卡 pipeline：

- `src/main.js:68`
- `src/main.js:74`
- `src/actions/quick-block.js:261`

这说明代码里已经有“只重跑某个视频卡片”的能力。但普通新增卡片没有使用这个能力，仍走页面级完整 pipeline。

### 2. 已命中视频默认不会继续请求后续 API

默认 `accumulateBlockedRules_Switch` 为 `false`：

- `src/settings/defaults.js:91`

pipeline 中如果视频已经命中，默认会跳过后续规则，避免继续请求 API：

- `src/orchestration/pipeline.js:196`

这对性能和 API 压力是好的，也意味着标题/UP 等 DOM 规则一旦先命中，API 不会继续拖慢首次屏蔽。

如果用户开启“已屏蔽后仍累计后续命中”，则会继续收集后续规则原因，但首次渲染仍然可以在已有命中后发生，不需要等全部 API。

### 3. 失败 / empty 状态有 3 秒重试窗

API 请求状态记录在 `apiDataStates` 中：

- `src/platform/api-health.js:4`
- `src/platform/api-client.js:715`

失败或 empty 后 3 秒内不会重复请求：

- `src/platform/api-client.js:19`
- `src/platform/api-client.js:682`

这不是“首屏延迟”的主要来源，但会影响短时间内反复刷新或反复重评估时的体感。

---

## 推荐落地方案

### 第一步：短期低风险，先处理命中后的显示延迟

目标：只要规则已经命中，就尽快处理卡片，不再让用户看到“命中了但等 3 秒才 overlay”。

建议：

1. 去掉 `card-box` 的 3 秒 overlay 延迟，或增加设置开关绕过它。
2. 至少让新增逻辑默认“命中后立即 overlay”，保留旧行为作为可选动画。
3. 隐藏模式保持现状，因为它已经是命中后直接隐藏。

收益：

- 改动集中在渲染层
- 不改变规则判断
- 不增加 API 请求
- 对误伤概率影响很小
- 对用户体感改善最大

风险：

- 少了原 legacy blur 动画
- 需要确认部分 `card-box` 页面 overlay 插入后布局和 hover 行为是否仍正常

建议测试：

- 首页 feed 的 `card-box` 卡片
- 搜索页卡片
- 视频页右侧推荐卡片
- overlay 模式和隐藏模式切换
- 命中后打开复核面板 / 右键菜单

### 第二步：短期到中期，新增视频卡片走更快触发

目标：减少“卡片进入 DOM 后等待完整 300ms 页面级 debounce”的时间。

建议：

1. 在 `MutationObserver` 中识别新增节点是否包含视频卡片。
2. 如果能定位具体视频卡片，优先在较短延迟内调用 `runVideoCardPipeline()`。
3. 可以用 50ms 左右的小 debounce 合并同一批新增卡片。
4. 仍保留 300ms 完整 pipeline 作为兜底，处理页面级清理、热搜、评论区等非单卡工作。

收益：

- DOM 型规则可以更快命中
- 不必每次都跑完整页面 pipeline
- 可以复用现有 `runVideoCardPipeline()` 能力

风险：

- MutationObserver 需要更精细地区分脚本自有节点和真实页面新增节点
- 需要避免一批卡片导致过多单卡 pipeline 调用
- 卡片 DOM 结构不完整时，50ms 可能读不到标题或 UP，需要保留兜底重扫

建议策略：

- 新增卡片快扫用于“尽快处理已可读信息”
- 页面级 300ms pipeline 继续用于“最终一致”

### 第三步：中期可选，增加 API pending 占位模式

目标：避免用户看到“最终会被 API 规则屏蔽”的卡片。

建议做成可选开关，不建议默认开启。

行为模型：

1. 当开启严格模式时，如果某卡片 BV 已读到，且当前启用了 API 型规则。
2. 如果这些规则的数据处于 `unknown` 或 `pending`，先给卡片加 pending placeholder 或临时隐藏。
3. API 回来后：
   - 命中：保持隐藏或转为 overlay
   - 不命中：恢复正常卡片
   - API empty / unavailable：恢复卡片，并可在调试信息里标注“规则未判定”

收益：

- 最大程度减少“看到将被屏蔽的视频”
- 对强过滤用户更友好

风险：

- API 慢时，正常视频也会短暂占位
- 评论规则可能因为错峰排队导致大量卡片短暂不可见
- 需要非常清晰的状态恢复，避免 pending 残留
- 需要区分“API 不可用”和“规则未命中”，否则用户会误解

建议默认：

- 默认关闭
- 设置文案明确说明：开启后，依赖 API 的正常视频也可能短暂占位

### 第四步：长期高风险，不建议作为第一步

方案：拦截 B 站 feed / search / recommend 接口，在数据层过滤后再让页面渲染。

优点：

- 理论上可以做到“卡片不加载”

问题：

- B 站页面接口多且变化快
- 首页、搜索页、推荐页、视频页右栏结构不统一
- 数据层过滤容易破坏页面自己的分页、曝光、懒加载逻辑
- 更容易触发风控或兼容问题
- 维护成本显著高于当前 DOM pipeline

结论：

这条路只适合长期实验，不适合作为当前修复方向。

---

## 推荐优先级

建议按下面顺序推进：

1. **命中后立即处理**
   - 移除或可配置绕过 `card-box` 的 3 秒 overlay 延迟。
   - 这是收益最大、风险最低的改动。

2. **新增视频卡片 fast-path**
   - 对明确新增的视频卡片，在 50ms 左右触发单卡 pipeline。
   - 保留完整 pipeline 兜底。

3. **API pending 占位模式**
   - 做成高级可选项。
   - 适合强过滤用户，不建议默认开启。

4. **数据层接口过滤**
   - 长期探索。
   - 当前不建议投入。

---

## 验收建议

### 体感验收

在以下页面观察新增卡片：

- B 站首页 feed
- 搜索页
- 视频播放页右侧推荐
- 排行榜或频道列表页

重点看：

- 标题命中是否几乎立即处理
- UP DOM 可读时是否快速处理
- 标签 / 分区 / 时长等 API 规则是否在 API 回来后稳定处理
- 评论规则是否不会造成大量 pending 残留
- overlay 模式下是否不再出现 3 秒空窗

### 自动化测试建议

可补充测试：

1. `card-box` 命中后立即插入 overlay，不再等待 3000ms。
2. 隐藏模式仍然直接隐藏，不插入 overlay。
3. pending 或 placeholder 模式关闭时，不影响现有行为。
4. 新增视频卡片 fast-path 只处理真实视频节点，不响应脚本自己的 overlay 节点。
5. API pending 时严格模式和普通模式行为不同。
6. 评论 API 错峰情况下，placeholder 能按每个 BV 正确恢复。

---

## 最终建议

下一步最建议先做短期方案：

1. 移除或可配置 `card-box` 的 3 秒 overlay 延迟。
2. 对新增视频卡片做更快的单卡 pipeline 触发。

这两项能解决最主要的“明明已经能判定，却还让卡片留在页面上”的问题，同时不改变 API 规则语义，不引入数据层拦截，也不会强迫所有用户接受 pending 占位。

API pending 占位模式可以作为第二阶段高级选项。它能进一步减少看到待屏蔽视频的概率，但会把“API 慢”直接转化成“正常卡片短暂不可见”，因此应该交给用户选择，而不是默认开启。
