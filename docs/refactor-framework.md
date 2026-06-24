# 自用版重构框架说明

> **注意：** 本文档为早期迁移记录，部分内容已过时。日常开发与安装请以根目录 `README.md` 为准。

这个目录描述模块化源码结构的边界划分。原版 v1.5.0 单体脚本已移至 `legacy/`，日常安装请使用 `dist/bilibili_blocked_videos_by_tags.user.js`。

第一阶段目标不是重写所有细节，而是先把边界拆清楚：

- `src/main.js` 只做入口导入、上下文组装、菜单注册、页面监听启动。
- `src/orchestration/pipeline.js` 只描述执行顺序，不写具体屏蔽规则。
- `src/features/` 每个文件是一组可删、可加的功能，不按每个小函数拆得过细。
- `src/platform/` 隔离 B 站页面结构、API、油猴叠加层渲染这些易变部分。
- `src/settings/` 管理默认配置、旧配置兼容、GM 存储读写。
- `src/state/` 管理运行时缓存，例如 `videoInfoDict` 和 `videoUpInfoDict`。

## 当前进度

已完成：

- 已拉取原仓库到本地。
- 已保留原始 `bilibili_blocked_videos_by_tags.user.js`，当前没有改动原脚本。
- 已新增 `src/` 框架目录。
- 已新增 `docs/refactor-framework.md` 作为迁移说明。
- 已建立入口、pipeline、features、platform、settings、state 的文件边界。
- 已确认第一版不迁移白名单功能。
- 第 1 轮“框架契约固定”已完成：浮窗入口、一键屏蔽入口、卡片操作入口、设置变更入口已经预留。
- `src/features/whitelist.js` 保留作为未来参考，但第一版不注册、不执行。
- 第 2 轮“构建链路”已完成：已新增 `package.json`、userscript header 模板和零依赖构建脚本。
- 第 3 轮“基础屏蔽闭环”已完成：已迁移视频卡片扫描、BV/标题/UP 基础读取、标题/UP 屏蔽和隐藏/叠加层渲染。
- 第 4 轮“API 和核心规则迁移”已完成：已迁移视频详情、标签、UP 资料、评论 API，以及统计、标签、UP 资料、评论相关规则。
- 第 5 轮“菜单和配置兼容”已完成：已接入 GM 配置读取/保存、旧字段兼容、分组表单设置 UI、导入导出、高级 JSON 编辑和关闭动作。

未完成：

- 尚未实现浮窗菜单。
- 尚未实现一键屏蔽。

## 第一版目标

第一版尽量还原原脚本的屏蔽能力，但不迁移白名单。

未来功能只预留入口，不做实现：

- 浮窗唤出菜单。
- 一键屏蔽当前视频的 UP 和标签。

这两个功能先作为文件和函数名接入当前流程，函数内部可以空实现，后续再单独实现。

## 分轮迁移计划

### 第 1 轮：框架契约固定

状态：已完成。

目标：补齐未来功能和配置变更的入口，但不实现业务。

范围：

- 新增 `src/actions/quick-block.js`。
- 新增 `src/ui/floating-entry.js`。
- 新增 `src/platform/card-actions.js`。
- 新增 `src/settings/mutations.js`。
- 在 `main.js` 里预留 `mountFloatingEntry(context)` 调用。
- 在 `pipeline.js` 的单视频流程里预留 `mountCardActions(context, videoElement, videoBv)` 调用。
- 从功能注册表中确认不注册白名单功能。

验收标准：

- 原始 `.user.js` 不被修改。
- 新增入口函数可以被导入和调用，但函数内部允许直接 `return`。
- `src/main.js` 能看出页面启动、浮窗入口、菜单入口、pipeline 启动的关系。
- `src/orchestration/pipeline.js` 能看出卡片操作入口位于单视频流程中。
- `node --check` 通过所有新增 JS 文件。

### 第 2 轮：构建链路

状态：已完成。

目标：让 `src/` 可以打包成一个 Tampermonkey 可安装的 userscript。

范围：

- 新增 `package.json`。
- 新增构建脚本，例如 `scripts/build-userjs.mjs`。
- 新增 userscript metadata/header 模板。
- 输出 `dist/bilibili_blocked_videos_by_tags.user.js`。

验收标准：

- `npm run build` 能生成 `dist/bilibili_blocked_videos_by_tags.user.js`。
- 生成文件包含原 userscript 必要 metadata，例如 `@match`、`@grant`、`@require`。
- 构建产物是单文件，适合安装到 Tampermonkey。
- 构建产物不需要手工编辑。
- 构建过程不改动原始 `.user.js`。

### 第 3 轮：基础屏蔽闭环

状态：已完成。

目标：先跑通最小闭环：扫描视频、读取 BV/标题、按标题或 UP 屏蔽并渲染结果。

范围：

- 迁移 `platform/dom-adapter.js` 的视频卡片扫描、BV/标题读取、UP 名称/UID 读取。
- 迁移 `platform/renderer.js` 的隐藏和叠加层渲染。
- 迁移 `state/video-store.js` 的基础视频状态和命中规则记录。
- 迁移 `features/basic-video-info.js`。
- 迁移 `features/title-up.js`。

验收标准：

- 首页、搜索页、视频播放页右侧推荐中至少一种页面能识别视频卡片。
- 标题屏蔽规则能命中并渲染隐藏或叠加层。
- UP 名称或 UID 屏蔽规则能命中并渲染隐藏或叠加层。
- `pipeline.js` 中不出现具体 selector、正则匹配细节或 overlay DOM 细节。
- 白名单不生效，也不参与流程。

### 第 4 轮：API 和核心规则迁移

状态：已完成。

目标：迁移依赖 API 的主要屏蔽功能，尽量还原原脚本第一版能力。

范围：

- 迁移 `platform/api-client.js` 的视频详情 API。
- 迁移标签 API。
- 迁移 UP 资料 API。
- 最后迁移评论 API 和错峰节流。
- 迁移 `features/video-stats.js`。
- 迁移 `features/tags.js`。
- 迁移 `features/up-profile.js`。
- 迁移 `features/comments.js`。

验收标准：

- 视频详情 API 只在相关功能需要时请求。
- 标签 API 只在单标签或双标签屏蔽启用时请求。
- UP 资料 API 只在 UP 等级、粉丝数或简介屏蔽启用时请求。
- 评论 API 只在精选评论或置顶评论屏蔽启用时请求。
- 评论 API 原有错峰节流策略保留。
- 标签、双标签、时长、播放量、点赞率、投币率、分区、竖屏、充电专属等规则至少能按原逻辑命中。

### 第 5 轮：菜单和配置兼容

状态：已完成。

目标：让新版脚本可以实际自用，并兼容旧配置。

范围：

- 迁移 `settings/defaults.js` 的完整默认配置。
- 迁移 `settings/storage.js` 的 GM 读写。
- 迁移旧参数兼容逻辑。
- 迁移或重接 `platform/userscript-menu.js`。
- 保留导入、导出、保存、关闭等菜单动作。

验收标准：

- 能读取现有 `GM_blockedParameter`。
- 旧配置字段能通过兼容逻辑迁移到新字段结构。
- 菜单能打开。
- 修改配置后能保存到 GM 存储。
- 导入导出配置可用。
- 白名单字段可以保留在配置中，但第一版不执行白名单逻辑。

## 并行实现建议

第 1 轮和第 2 轮不建议并行，因为它们会确定公共接口和构建形态。

第 3 轮之后可以分多个 agent 或多个对话轮次并行推进，但要明确文件所有权：

- DOM/渲染负责人：`src/platform/dom-adapter.js`、`src/platform/renderer.js`。
- API 负责人：`src/platform/api-client.js`。
- 规则负责人：`src/features/` 和 `src/state/video-store.js`。
- 配置/UI 负责人：`src/settings/`、`src/platform/userscript-menu.js`。

多人或多 agent 同时做时，尽量避免同时修改：

- `src/orchestration/pipeline.js`
- `src/features/index.js`
- `src/main.js`

这些文件属于公共接口层，应在每轮开始时先定好再分工。

## 原始迁移顺序参考

1. 先把原主流程改写到 `pipeline.js` 的执行阶段里，但仍然调用原有函数。
2. 再把 DOM 获取和渲染函数迁移到 `platform/`。
3. 再按功能组把规则函数迁移到 `features/`。
4. 最后再处理菜单 UI 和构建打包。

最终形态是：开发时阅读 `src/`，发布时打包成单个 userscript。
