# Changelog

All notable user-facing changes are recorded here. The userscript `@version`, Git tag, GitHub Release, and distribution platform release should use the same version number.

## v2.0.2 - 2026-06-30

### Added
- Added a standalone "隐藏推广视频卡片" switch, enabled by default.
- Detects promoted video cards by `cm.bilibili.com` links without relying on BV IDs or Bilibili APIs.
- Supports promoted card hiding on the home page, search pages, and video pages.

### Changed
- Kept promoted video hiding separate from the existing video-rule pipeline.
- Kept the legacy "隐藏非视频元素" feature unchanged.

### Verification
- `node --test tests/dom-adapter-hide-non-video.test.js`
- `npm test`
- `npm run build`
- `node --check dist/bilibili_blocked_videos_by_tags.user.js`
