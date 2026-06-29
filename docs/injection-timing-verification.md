# Userscript injection timing verification (phase 2)

> Related: [`tool-layer-evolution-plan.md`](./tool-layer-evolution-plan.md) §4.4  
> **Status (2026-06-29)**: Phase 2 验收已采用下方 interim 结论；smoke 均 `ok: true`。Plan A/B 仍为可选后续。

## Current facts

- `scripts/userscript-header.template.js` has **no explicit `@run-at`**. Tampermonkey defaults to `document-idle` for scripts without that directive.
- Test harnesses (`comment-timing-smoke.mjs`, `video-card-timing-smoke.mjs`) inject via `injectUserscriptInBrowser()` in [`scripts/lib/userscript-runtime.js`](../scripts/lib/userscript-runtime.js), which:
  1. Installs GM stubs on `window`
  2. `(0, eval)(userscriptSource)`
  3. Dispatches a synthetic `load` event

## Harness vs real Tampermonkey

| Aspect | Tampermonkey (default) | Current harness |
|---|---|---|
| `@run-at` | `document-idle` (implicit) | Synthetic `load` after full page + eval |
| GM API | Real Tampermonkey | Stub in `userscript-runtime.js` |
| `load` event | Browser-native, `isTrusted: true` | `dispatchEvent`, **not trusted** |
| Re-entry on SPA nav | Tampermonkey re-injects per `@match` | Single inject per smoke run |

## Conclusion (phase 2 interim)

Smokes **already pass** with the synthetic `load` path, so the harness timing is *good enough* for local regression gates today. It is **not** a byte-for-byte match for Tampermonkey `document-idle`.

## Recommended follow-up (before changing `@run-at`)

1. Install dev userscript via `npm run tm:dev` and confirm Tampermonkey’s effective `@run-at` in the dashboard (expect `document-idle`).
2. Compare first script side-effect timestamp vs harness `__bbvtTimingInjectedAt` on the same video page.
3. If drift matters, pick plan **A** (single `addInitScript` bootstrap + real `goto`/`waitForLoadState`) or **B** (exported `bootstrapUserscript(runtime)` called directly from tests) — do **not** rely on manual `dispatchEvent('load')` alone.

## Decision

**Keep current harness for phase 2.** No header change until a measured diff shows a real timing bug. Revisit in phase 3 if probe migration exposes ordering issues.
