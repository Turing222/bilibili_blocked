# 评论屏蔽/恢复 + 视频评论相关屏蔽 原始调查记录

日期：2026-06-24  
场景：这次先不整理成阅读文档，只保留原始证据、命令、即时判断。下次对话再从这里提炼。

---

## 0. 先纠偏范围

用户后续澄清：

- 最开始想查的是“视频评论的屏蔽和修复”
- 不是马上改“视频卡片统一遮罩”
- 视频端现状肉眼看可能没问题，更像工程严谨性问题
- 仍然要保留两条路径

我把问题拆成两条：

1. 视频页评论区 DOM 层的评论屏蔽/恢复
2. 用评论 API（精选评论 / 置顶评论）决定整条视频是否屏蔽

额外保留一个旁支：

3. 视频卡片 hide / overlay 双路径是否存在真实 bug，还是只是实现上不够稳

---

## 1. 最开始的全局 grep，确认仓库里确实有“视频/评论/恢复/遮罩”多条线

命令：

```powershell
Get-ChildItem -Force
rg -n "视频|屏蔽|恢复|遮罩|mask|overlay|video|recover|restore|block|censor|mosaic|blur" -S .
```

看到的重点：

- 项目主目录是 `bilibili_blocked_videos_by_tags`
- `src/actions/review-panel.js` 里有 `_restoreOverlay`
- `src/platform/renderer.js` 里同时存在：
  - `renderVideoBlockedState`
  - `clearVideoElementVisual`
  - `removeAllBlockedOverlays`
  - `syncBlockedOverlayRects`
  - 评论相关的 `renderCommentBlockedState`
- `src/orchestration/pipeline.js` 里有：
  - `restoreCommentFilters`
  - `clearVideoBlocks`
  - `clearScriptEffects`

即时判断：

- 代码里天然就有多条“屏蔽/恢复”链路
- 不能把“评论区单条评论折叠”和“评论 API 驱动整条视频卡片屏蔽”混为一谈

---

## 2. 视频卡片 hide / overlay 双路径：先记为“工程风险”，不直接定性为现网 bug

命令：

```powershell
rg -n "hideVideoMode_Switch|renderVideoBlockedState|clearVideoElementVisual|removeAllBlockedOverlays|syncBlockedOverlayRects|overlay|遮罩|restore" bilibili_blocked_videos_by_tags/src -S
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\platform\renderer.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 20 -First 120
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\platform\renderer.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 330 -First 110
```

核心证据：

- `renderVideoBlockedState` 中：
  - 未 blocked 时：`removeHiddenOrOverlay(videoElement, settings)`  
    见 `renderer.js:21-25`
  - blocked 且 `hideVideoMode_Switch` 开启时：
    - 先删 overlay
    - 再 `hideVideoElement(videoElement)`  
    见 `renderer.js:28-35`
  - blocked 且非 hide 模式时：
    - 若当前隐藏了则 `showVideoElement(videoElement)`
    - 再加 overlay  
    见 `renderer.js:38-50`

- `removeHiddenOrOverlay` 中：
  - 如果当前 `settings.hideVideoMode_Switch == true`
    - `showVideoElement(videoElement)`
    - `clearBlockedElement(videoElement)`
    - 然后 return  
    见 `renderer.js:439-447`
  - 否则只 remove overlay，不 show element  
    见 `renderer.js:449-451`

即时判断（这一轮的原始想法，后续被用户要求降级处理，不直接当 bug）：

- 恢复逻辑依赖“当前开关状态”，不是依赖“这个元素之前到底是被 hide 还是被 overlay”
- 这在逻辑上有潜在风险
- 但如果视频端实测没问题，就先把它归到“工程可读性/稳健性一般”，不在这次作为主修复对象

补充证据（菜单上确实保留了两条路径）：

```powershell
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\platform\userscript-menu.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 105 -First 20
```

看到：

- `userscript-menu.js:106` 有 `隐藏视频而不是显示叠加层`

结论（当前阶段）：

- 两条路径是明确存在且需要保留的
- 这里只先记录为“实现分叉点多，恢复逻辑不够自解释”

---

## 3. 先确认 README / docs 已经承认“评论区 DOM 屏蔽”和“评论 API 屏蔽视频”是两件事

命令：

```powershell
rg -n "investig|调查|comment|评论|restore|恢复|屏蔽" bilibili_blocked_videos_by_tags/docs bilibili_blocked_videos_by_tags/README.md -S
```

看到：

- `README.md:101-102`
  - 有“按置顶评论屏蔽”
  - 说明“按置顶评论屏蔽”、“屏蔽精选评论的视频”都用到了评论 API
- `docs/capability-transparency.md:51`
  - “视频页按评论内容屏蔽 | 读已渲染评论（Shadow DOM），不主动调评论 API”
- `docs/capability-transparency.md:84-85`
  - “屏蔽精选评论的视频” / “按置顶评论屏蔽” 走评论 API

即时判断：

- 文档层本来就已经把这两件事分开了
- 这次调查也要沿用这个边界，避免讨论串线

---

## 4. 评论区 DOM 屏蔽 feature：入口、规则命中、观察器、settling retry

命令：

```powershell
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\features\comment-filter.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -First 220
```

关键证据：

- `commentFilterFeature.enabled`
  - 只要 URL 是视频页就启用  
  - `comment-filter.js:22-25`

- `run(context)` 中：
  - 先 `getCommentElements()`
  - 再判断 `enabled = hasEnabledCommentRules(settings)`
  - `shouldTrackComments = enabled || Boolean(settingsStore)`  
    见 `comment-filter.js:26-30`

- 如果 `shouldTrackComments`：
  - 注册 `domAdapter.observeCommentChanges`
  - 回调里 `resetRetry(); refresh?.();`
  - 同时还会 `scheduleCommentSettlingRetry(refresh, commentElements.length)`  
    见 `comment-filter.js:31-36`

- 然后遍历评论：
  - `readCommentInfo`
  - `getCommentBlockResult`
  - `mountCommentQuickBlock`
  - `renderer.renderCommentBlockedState(commentElement, blockResult)`  
    见 `comment-filter.js:41-50`

- `scheduleCommentSettlingRetry`：
  - comment 数量变化时重置 retry 次数
  - 最多 8 次
  - 每次间隔 1000ms
  - 到时直接 `refresh()`  
    见 `comment-filter.js:146-165`

即时判断：

- 评论区这条线不是“只跑一次”
- 它是：
  - 评论变动时主动 refresh
  - 再叠加一个最多 8 次的 settling retry
- 如果后面出现“恢复抖一下 / 先出来又回去 / 看起来像没恢复干净”，首先应该怀疑时序，不要一开始就怀疑 `restoreCommentElement` 本体写错

备注：

- `shouldTrackComments = enabled || Boolean(settingsStore)` 这点值得记一下  
  即便没有启用评论规则，只要有 `settingsStore`，也会走追踪和 quick block 相关路径。  
  这可能是为了“现场快速屏蔽评论”，不是 bug，但会增加复杂度。

---

## 5. 评论区 DOM 读取和观察：确实专门适配了 Shadow DOM

命令：

```powershell
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\platform\dom-adapter.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 160 -First 120
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\platform\dom-adapter.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 560 -First 200
```

关键证据：

- 只在视频页处理评论：
  - `dom-adapter.js:187-189`

- `getCommentElements()`：
  - 先走 primary selectors：
    - `div.reply-item`
    - `div.root-reply-container`
    - `div.sub-reply-item`
    - `bili-comment-renderer`
    - `bili-comment-reply-renderer`
  - 找不到再走 fallback selectors  
    见 `dom-adapter.js:191-212`

- `readCommentInfo()`：
  - 读取 `text`
  - 读取 `userId`
  - 读取 `userName`
  - 读取 `hasImage`  
    见 `dom-adapter.js:215-222`

- 深层查询：
  - `querySelectorAllDeep`
  - `collectMatches`
  - 会递归 open shadow roots  
    见 `dom-adapter.js:563-569`, `733-757`

- 观察评论变化：
  - `observeCommentShadowRoots(callback)`  
    见 `dom-adapter.js:571-579`
  - 同时观察：
    - document.body childList/subtree
    - 每个 open shadow root 的 attributes / characterData / childList / subtree  
    见 `dom-adapter.js:581-624`

- 观察器节流：
  - `scheduleCommentChange()` 200ms
  - `scheduleCommentShadowRootDiscovery()` 50ms  
    见 `dom-adapter.js:655-675`

- 忽略脚本自有变更：
  - 忽略 placeholder
  - 忽略 `data-bbvt*`
  - 忽略 `bbvtCommentBlocked` / `bbvtCommentFilterBypass` / `bbvtCommentOriginalDisplay` 等  
    见 `dom-adapter.js:677-730`

即时判断：

- 这块不是“随便糊的”，而是专门为 B 站评论 Shadow DOM 做过适配
- 如果评论区恢复有问题，优先排查：
  1. 评论元素识别有没有漏/重
  2. Shadow root 观察器时序
  3. 页面局部重渲染导致同一条评论换了 DOM 节点

而不是先说“评论恢复函数明显错了”

---

## 6. 评论区 DOM 屏蔽/恢复本体：闭环存在，目前没看到明显硬 bug

命令：

```powershell
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\platform\renderer.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 90 -First 190
```

关键证据：

- `renderCommentBlockedState(commentElement, blockResult)`：
  - `!blockResult.blocked` -> `restoreCommentElement(commentElement)` -> return false  
    见 `renderer.js:91-99`
  - `bbvtCommentFilterBypass === "true"` -> `revealCommentElement(commentElement, blockResult)` -> return false  
    见 `renderer.js:93-96`
  - 否则 `blockCommentElement(commentElement, blockResult)`  
    见 `renderer.js:98`

- `blockCommentElement`：
  - 先 `ensureCommentPlaceholder(commentElement, reason, "hidden")`
  - 第一次 block 时记录 `bbvtCommentOriginalDisplay = commentElement.style.display || ""`
  - 然后 `commentElement.style.display = "none"`
  - 打 `bbvtCommentBlocked` / `bbvtCommentBlockReason`  
    见 `renderer.js:143-160`

- `revealCommentElement`：
  - `showCommentElement(commentElement)`
  - `commentElement.dataset.bbvtCommentFilterBypass = "true"`
  - placeholder 改成 `revealed` 模式  
    见 `renderer.js:163-170`

- `ensureCommentPlaceholder`：
  - placeholder 不存在就创建并插在评论前面
  - 按 mode 渲染文案和按钮
  - 点击按钮：
    - 如果当前是 revealed，则删 bypass 再重新 block
    - 如果当前是 hidden，则 reveal  
    见 `renderer.js:172-212`

- `restoreCommentElement`：
  - 移除 placeholder
  - `showCommentElement(commentElement)`
  - 默认删除 `bbvtCommentFilterBypass`
    见 `renderer.js:245-257`

- `showCommentElement`：
  - 如果记录过 `bbvtCommentOriginalDisplay`，就还原回去
  - 删除 `bbvtCommentBlocked`
  - 删除 `bbvtCommentBlockReason`
  - 删除 `bbvtCommentOriginalDisplay`  
    见 `renderer.js:259-267`

即时判断：

- 单看函数级逻辑，这里是闭环的：
  - block -> hide + placeholder
  - reveal -> show + bypass + placeholder
  - restore -> remove placeholder + show + 清状态
- 当前没看到类似“恢复时忘记恢复 display”这种硬伤

一个值得继续观察但暂不下结论的点：

- `revealCommentElement()` 每次 pipeline 重跑、且 bypass 还在时，都会再执行一次 `showCommentElement + ensureCommentPlaceholder(revealed)`  
  逻辑上没错，但意味着手动显示的评论会一直被 feature 接管，而不是进入完全自由状态。

---

## 7. 评论恢复发生在什么场景：总开关关闭 / clearScriptEffects / blockResult 不再命中

命令：

```powershell
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\orchestration\pipeline.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 232 -First 60
```

证据：

- `restoreCommentFilters(context)`：
  - 只在视频页执行
  - 遍历 `getCommentElements()`
  - 调 `renderCommentBlockedState(commentElement, { blocked: false })`  
    见 `pipeline.js:260-267`

上游调用关系（此前 grep 看到）：

- `clearScriptEffects(context)` 会调用 `restoreCommentFilters(context)`  
  来源：
  - `pipeline.js:237-244`
- 菜单里 `scriptEnabled_Switch` 立即生效时，如果关闭脚本：
  - `applyImmediateSetting` -> `context.clearScriptEffects?.()`
  - 然后还会 `context.refresh({ reevaluate: true })`  
    见 `userscript-menu.js:952-959`

即时判断：

- 评论恢复不是只有“规则不命中时才发生”
- 总开关关闭时也会强制 restore 一轮
- 这条恢复路径也没看出明显断裂

---

## 8. 评论 API 驱动的视频屏蔽：另一条完全不同的链路

命令：

```powershell
Get-Content -Path 'bilibili_blocked_videos_by_tags\src\features\comments.js'
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\state\video-store.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 120 -First 40
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\state\video-store.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 610 -First 40
```

关键证据：

- `commentsFeature.enabled`
  - 满足以下之一才启用：
    - `blockedFilteredCommentsVideo_Switch`
    - `blockedTopComment_Switch && blockedTopComment_Array.length > 0`  
    见 `comments.js`

- `commentsFeature.run`
  - 如果当前 `videoInfo.filteredComments === undefined`
    - 查看评论 API data status
    - 若不是 terminal empty/unavailable，则 `requestCommentsIfNeeded(videoBv, videoStore)` 并返回 `false`
  - 否则 `videoStore.applyCommentRules(videoBv, settings)` 并返回 `true`  
    见 `comments.js`

- `videoStore.applyCommentRules(videoBv, settings)`
  - 只做两件事：
    - `applyFilteredCommentsRule(videoInfo, settings)`
    - `applyTopCommentRule(videoInfo, settings)`  
    见 `video-store.js:128-136`

- `applyTopCommentRule`
  - 有置顶评论文本时，用 `blockedTopComment_Array` 匹配
  - 命中后 `markAsBlockedTarget(...)`  
    见 `video-store.js:614-636`

即时判断：

- 这条线的目标是“决定视频卡片 blockedTarget”
- 它和评论区 DOM 的折叠/恢复没有共享状态
- 所以讨论“评论修复”时，必须先问清楚是在说哪条链路

---

## 9. 评论 API 请求实现：有节流、fallback、状态机

命令：

```powershell
rg -n "requestCommentsIfNeeded|getVideoDataStatus|VIDEO_COMMENTS|filteredComments|topComment|request.*comment|reply/main|reply\\?" bilibili_blocked_videos_by_tags/src/platform bilibili_blocked_videos_by_tags/src/state -S
Get-Content -Path 'bilibili_blocked_videos_by_tags\src\platform\api-client.js'
Get-Content -Path 'bilibili_blocked_videos_by_tags\src\platform\api-health.js'
```

关键证据：

- `requestCommentsIfNeeded(videoBv, videoStore)`：
  - 若 `shouldSkipApiWhenBlocked(videoBv, videoStore)` 则 return  
    （默认：视频已 blocked 且不累计后续命中时，不再请求 API）
  - 若 `filteredComments` 已经是 true/false，则 return
  - 3 秒内避免重复请求
  - 还会按 pending comment 数量给请求错峰  
    见 `api-client.js:639-693`

- 实际请求：
  - 主路径：`/x/v2/reply/main`
  - 失败时 fallback：`/x/v2/reply`
  - 返回后读取：
    - `filteredComments = Boolean(commentData.control?.web_selection)`
    - `topComment = readTopCommentMessage(commentData)`  
    见 `api-client.js:247-295`, `334-358`

- `readTopCommentMessage(commentData)`：
  - `commentData?.top?.upper?.content?.message || commentData?.upper?.top?.content?.message || ""`  
    见 `api-client.js:775-777`

- `API_DATA_STATUS`
  - `unknown / pending / ready / empty / unavailable`
  - 评论 feature 会根据状态决定是否重试或放弃  
    见 `api-health.js`

即时判断：

- 这条链实现得比想象中完整：
  - 有状态机
  - 有 fallback
  - 有错峰
  - 有“已 blocked 是否继续请求 API”的策略
- 所以如果“视频因为评论规则被屏蔽后恢复有问题”，更可能要看：
  1. `videoStore` 的 `blockedTarget` 重置时机
  2. 用户开关 `accumulateBlockedRules_Switch`
  3. API 状态从 pending -> empty/unavailable/ready 的过渡

而不是先怀疑评论区 DOM 折叠

---

## 10. 评论 quick block 入口：会增加观察复杂度，但产品上是刻意保留的

命令：

```powershell
Get-Content -Path 'bilibili_blocked_videos_by_tags\src\actions\comment-quick-block.js'
```

看到的重点：

- `mountCommentQuickBlock` 会给 comment element 挂：
  - `mouseenter`
  - `mouseleave`
  - `focusin`
  - `focusout`
- 悬浮按钮和弹窗是全局单例 DOM
- 点“屏蔽用户”或“屏蔽内容”之后会：
  - append 到 settings
  - `context.refresh?.()`

即时判断：

- 这解释了为什么 `commentFilterFeature` 即使没启用评论规则，也可能仍然想 track comments  
  因为它要支撑“从评论现场直接创建规则”
- 这不是 bug，但会让评论区的观察和重跑比“纯只读规则判断”更重

---

## 11. 到目前为止的临时结论（不做正式总结，只记现场判断）

- 目前没有在“评论区 DOM 屏蔽/恢复”这条线上看到明确硬 bug。
- 评论恢复逻辑本身是完整闭环。
- 更大的风险点是“时序复杂”：
  - 页面级 observer
  - 评论 shadow observer
  - comment settling retry
  - quick block 触发后的 refresh
- “视频因为评论规则被屏蔽”是另一条线，别和评论区单条评论折叠混起来。
- 视频卡片 hide / overlay 双路径依然建议记为“实现不够自解释，有潜在恢复风险”，但在用户说“视频端看起来没问题”的前提下，先不把它升级成当前 bug。

---

## 12. 还没做的事 / 下次可继续补证据

1. 检查 `videoStore.resetBlockEvaluation()` 和 `resetAllBlockEvaluations()` 到底会不会把评论 API 相关字段一并清掉，避免误判“恢复”。
2. 看 `settings/storage.js` 对评论相关开关、数组空值有没有兼容行为，是否会让 UI 看起来关闭但 feature 仍参与。
3. 如果要继续深一点，可以在浏览器侧实际抓一次：
   - 打开视频页
   - 评论区滚动加载
   - 手动点击“显示/重新隐藏”
   - 观察是否出现重复 refresh / DOM node 替换

---

## 13. 追加证据：videoStore 的 reset 只清“判定结果”，不清评论 API 数据

命令：

```powershell
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\state\video-store.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -Skip 1 -First 220
rg -n "resetBlockEvaluation|resetAllBlockEvaluations|filteredComments|topComment" bilibili_blocked_videos_by_tags/src/state -S
```

关键证据：

- `resetBlockEvaluation(videoBv)`：
  - `videoInfo.blockedTarget = false`
  - `videoInfo.triggeredBlockedRules = []`
  - `videoInfo.blockedReasons = []`
  - 没有删除 `filteredComments`
  - 没有删除 `topComment`
  - 没有删除 `apiDataStates`  
    见 `video-store.js:171-180`

- `resetAllBlockEvaluations()`：
  - 对所有视频做同样的 3 项清理
  - 也不碰评论 API 结果字段  
    见 `video-store.js:182-193`

- grep 也能看到评论字段仍然是单独使用：
  - `filteredComments`
  - `topComment`
  - 注释写明：`filteredComments` 仅在评论 API 成功返回后写入；`undefined` 表示尚未拉取或请求失败  
    见 `video-store.js:616`

即时判断：

- “重跑评估” != “抹掉评论 API 证据”
- 所以如果视频因为 `filteredComments/topComment` 命中过，后续只要这些字段还在，重新评估时仍可能再次命中
- 这个行为是合理的，不是恢复 bug
- 下次如果用户说“我都 reevaluate 了为什么还会再次被评论规则屏蔽”，要先解释这里

---

## 14. 追加证据：settings 存储层对评论开关有默认/兼容逻辑

命令：

```powershell
$i=1; Get-Content 'bilibili_blocked_videos_by_tags\src\settings\storage.js' | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ } | Select-Object -First 340
rg -n "blockedCommentText_Switch|blockedCommentUser_Switch" bilibili_blocked_videos_by_tags/src/settings -S
```

关键证据：

- 默认值里本身就是：
  - `blockedCommentText_Switch: true`
  - `blockedCommentUser_Switch: true`
  - 在 `defaults.js`（此前 grep 已看到）

- `normalizeUiFeatureSwitches(obj)`：
  - 如果 `uiFeatureSwitchVersion < 1`
  - 且 `blockedCommentText_Array` 是空数组，则 `blockedCommentText_Switch = true`
  - 且 `blockedCommentUser_Array` 是空数组，则 `blockedCommentUser_Switch = true`
  - 然后 `uiFeatureSwitchVersion = 1`  
    见 `storage.js:76-90`

即时判断：

- 评论开关默认偏“开”，但数组为空时不会实际命中规则
- 这更像“UI 功能默认开放”，不是“默认一定参与有效屏蔽”
- 但它会影响 `hasEnabledCommentRules(settings)` 的判断体验，需要区分：
  - 开关是开
  - 真正有有效规则项

补一句：

- `commentFilterFeature` 里 `hasEnabledCommentRules(settings)` 已经要求：
  - 用户 / 文本规则要同时满足“开关开 + 数组非空”
  - 带图规则只看开关  
  所以这里只是存储默认值，并不会单独制造误判
