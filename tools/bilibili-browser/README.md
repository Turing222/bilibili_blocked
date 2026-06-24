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
