# Bilibili Blocked

对 Bilibili.com 的视频卡片，按标题、UP 主、标签、分区、统计数据、评论等条件匹配并屏蔽或叠加提示；同时支持隐藏热搜、去除首页广告等非视频元素。

本项目为**独立维护的重构版**油猴脚本，源码模块化，带构建链路与单元测试。

## 许可证

本项目以 **[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)**（署名 - 非商业性使用 - 相同方式共享）许可，与原项目保持一致。详见 [`LICENSE`](LICENSE)。

简要说明：可自由使用与修改，但须保留署名、不得用于商业目的，且衍生作品须以相同许可证发布。

## 致谢与原项目

本仓库为独立维护的重构版，**不是**原项目的官方分支，也不与其保持代码同步。

| | |
|---|---|
| 原项目仓库 | [tjxwork/bilibili_blocked_videos_by_tags](https://github.com/tjxwork/bilibili_blocked_videos_by_tags) |
| 原作者 | [tjxwork](https://github.com/tjxwork) |
| 原项目 Greasy Fork | [Bilibili 按标签、标题、时长，UP 主屏蔽视频](https://greasyfork.org/zh-CN/scripts/481629-bilibili-%E6%8C%89%E6%A0%87%E7%AD%BE-%E6%A0%87%E9%A2%98-%E6%97%B6%E9%95%BF-up%E4%B8%BB%E5%B1%8F%E8%94%BD%E8%A7%86%E9%A2%91) |
| 原项目许可证 | CC BY-NC-SA 4.0（与本仓库相同） |

屏蔽思路、交互设计与部分功能概念受上述原项目启发；本仓库在 `src/` 中的实现已全面模块化重写。`legacy/` 目录归档了原项目 v1.5.0 单体脚本，版权归 tjxwork，仅供对照参考。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) / 篡改猴。
2. 新建脚本，粘贴 [`dist/bilibili_blocked_videos_by_tags.user.js`](dist/bilibili_blocked_videos_by_tags.user.js) 的内容（或本地构建后使用 `dist/` 产物）。
3. 打开 B 站页面即可生效。右下角「屏」浮钮，或油猴菜单「屏蔽参数面板」，可打开设置。

**Edge 用户**：若安装了篡改猴但菜单点不出来，请在 `扩展 → 管理扩展` 中开启「开发人员模式」（篡改猴顶部通常也有提示）。

配置存储 key 仍为 `GM_blockedParameter`，可与原项目导出的 JSON 设置兼容导入。

## 开发与构建

| 路径 | 说明 |
|------|------|
| `src/` | 模块化源码（开发时改这里） |
| `dist/bilibili_blocked_videos_by_tags.user.js` | **构建产物，安装到油猴** |
| `legacy/` | 原项目 v1.5.0 单体脚本归档，仅供对照 |
| `docs/` | 重构说明、能力边界与调研笔记 |

```bash
npm install
npm run build    # 生成 dist/
npm run check    # 构建 + 语法检查 + 单元测试
npm run lint     # ESLint
npm run test     # 仅运行测试
npm run perf:boundary # 轻量性能边界压测
```

## 相对原版的改动

- 单体脚本拆分为 `src/` 模块，ESM + 构建打包
- 右键快速屏蔽 / 复核、屏蔽统计、UP 屏蔽建议
- 浮动入口、菜单白名单配置、按 BV 解封单条视频
- API 调用与健康状态透明化（见 [`docs/capability-transparency.md`](docs/capability-transparency.md)）
- 「显示与调试」中可开启 **已屏蔽后仍累计后续命中**：关闭时（默认）已屏蔽视频不再请求 API；开启后继续匹配后续规则
- UI 入口统一为深色面板、图标化快捷按钮和更清晰的危险操作配色
- 新增轻量边界压测脚本，用于对比名单规模、理论检查次数和实际耗时

更多说明：[`docs/technical-report.md`](docs/technical-report.md) · [`docs/refactor-framework.md`](docs/refactor-framework.md)

## 功能

- 按标题屏蔽（支持正则）
- 按 UP 名称或 UID 屏蔽（支持正则）
- 按标签、双重标签屏蔽（支持正则）
- 按充电专属、竖屏、时长、播放量、点赞率、投币率屏蔽
- 按收藏/投币比、视频分区屏蔽（支持正则）
- 按精选评论、置顶评论屏蔽（支持正则）
- 按 UP 主等级、粉丝数、简介屏蔽（支持正则）
- 白名单避免误杀关注的 UP
- 隐藏或屏蔽热搜
- 隐藏首页等页面的非视频元素（直播、广告、推广等）
- 导入、导出配置

**生效页面**：首页、各分区首页、播放页右侧推荐、搜索页、综合热门、每周必看、入站必刷、排行榜、旧版首页（部分元素）等。

## 能力边界与建议上限

配置保存在油猴 `GM_blockedParameter` 中，不直接写入 B 站页面的 `localStorage` 或 `sessionStorage`。当前压测显示，常规名单的存储体积不是主要瓶颈，真正影响体感的是评论区的大名单线性匹配，尤其是评论正则和评论用户名单。

当前边界压测固定三档：

| 档位 | 结论 |
|------|------|
| 1000 条/名单 | 稳定档：视频规则和评论普通关键词整体可接受；评论正则、评论用户名单已能感知到额外开销。 |
| 2000 条/名单 | 压力档：视频普通规则仍轻，视频正则和评论普通关键词可接受；评论正则、评论用户名单可能明显拖慢评论区。 |
| 5000 条/名单 | 探索档：存储仍可回读，但只适合视频普通名单；视频正则、评论普通关键词开始有明显风险，评论正则和评论用户名单不建议使用到这个规模。 |

建议上限：

| 类型 | 建议 |
|------|------|
| 视频普通名单（标题、UP UID、标签、白名单） | 5000 条以内通常可接受 |
| 视频正则名单 | 建议 2000 条以内 |
| 评论普通关键词 | 建议 2000 条以内 |
| 评论正则关键词 | 建议 500-1000 条以内 |
| 评论用户名单 | 建议 500-1000 条以内，2000 条以上可能明显卡顿 |

以上是本地轻量压测口径，不等于浏览器真实页面的硬限制。实际体感还会受页面评论数量、B 站 DOM 变化、浏览器性能和同时启用的其他脚本影响。

压测脚本：

```bash
npm run perf:boundary
```

详细数据见 [`docs/performance-boundary-report-2026-06-26.md`](docs/performance-boundary-report-2026-06-26.md)。

## 实现逻辑

先判黑后判白：标题 → UP 主 → 充电专属 → 收藏投币比 → 竖屏 → 时长 → 播放量 → 点赞率 → 视频分区 → UP 等级 → UP 粉丝数 → UP 简介 → 标签 → 双重标签 → 精选评论 → 置顶评论 → 白名单。

- **临时缓存**：同窗口内以 BV 号为键缓存已获取信息。
- **API 限频**：优先从 DOM 读取；同一 BV 号 3 秒内最多查询 1 次。
- **评论相关 API** 对请求频率敏感，频繁刷新可能导致短时失效，详见能力透明化文档。
- **收藏/投币比规则**为避免误杀新视频或冷门视频，设有隐藏门槛：仅对播放量 ≥ 5000、收藏 ≥ 50 且发布满 2 小时（7200 秒）的视频生效。

## 兼容性

**确认不兼容**：BewlyBewly

**测试通过**：

- [bilibili-app-recommend](https://greasyfork.org/zh-CN/scripts/443530)
- [bv2av](https://greasyfork.org/zh-CN/scripts/398535)

## 相关链接

| | |
|---|---|
| 本仓库 | [Turing222/bilibili_blocked](https://github.com/Turing222/bilibili_blocked) |
| 技术报告 | [`docs/technical-report.md`](docs/technical-report.md) |
| 性能边界报告 | [`docs/performance-boundary-report-2026-06-26.md`](docs/performance-boundary-report-2026-06-26.md) |
| 许可证全文 | [`LICENSE`](LICENSE) · [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |

## 社区

本开源项目已链接并认可 [LINUX DO](https://linux.do) 社区。
