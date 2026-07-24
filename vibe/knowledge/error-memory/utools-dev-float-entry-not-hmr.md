---
id: eypc-utools-dev-float-entry-not-hmr
status: verified
scope: project
fingerprint: utools-development-main-is-live-but-browser-window-float-css-stays-stale__dist-float-entry-bypasses-vite__serve-writes-dev-float-proxy
first_seen: 2026-07-24
last_verified: 2026-07-24
review_after: 2027-01-24
evidence:
  - user-confirmed
  - preload/index.js
  - scripts/prepare-utools-runtime.mjs
  - public/plugin.json
tags:
  - utools
  - vite
  - hmr
  - float-window
  - development-entry
---

# uTools 开发主入口正常但浮球 CSS 不热更新

## Symptom

uTools 开发工具中主页面地址已经是 Vite 的 `127.0.0.1:8092`，但修改浮球 CSS 仍无效果；执行生产构建后才显示变化。

## Wrong Assumption

把 `plugin.json` 的 `development.main` 视为所有插件窗口的统一入口，忽略了 `utools.createBrowserWindow('float.html')` 会单独解析浮球页面。

## Verified Root Cause

主页面通过 `development.main` 进入 Vite，但独立浮球窗口仍从所选插件目录的 `dist/float.html` 加载，因此 `src/styles/float.css` 不在当前 Vite 页面中，无法触发 HMR。uTools 开发目录应选择完整的 `dist/plugin.json`；开发服务启动时必须把 `dist/float.html` 变成跳转到 Vite `/float.html` 的代理入口。

## Correct Detection Order

1. 在主页面和浮球页面分别检查 `location.href`，不能只确认主页面的开发地址。
2. 确认 uTools 接入的是包含 `float.html`、`float-preload.js` 和 `preload.js` 的 `dist/plugin.json`。
3. 启动 `pnpm run serve`，确认开发准备脚本写入浮球开发代理，再关闭并重新打开已有浮球。
4. 生产构建时不写代理，确认 `pnpm run build` 仍生成真实静态 `dist/float.html`。

## Prevention Rule

uTools 的 `development.main` 只保证主插件入口使用 Vite；任何 `createBrowserWindow` 的独立页面都必须单独接入开发入口。项目开发验收固定使用 `dist/plugin.json` + `pnpm run serve` + 重新接入开发，浮球页面必须通过开发代理或等价的 Vite URL 加载，不能仅凭主页面的 `127.0.0.1` 判断 CSS 已进入 HMR。

## Latest Applicable Implementation

- [public/plugin.json](../../../public/plugin.json#L1) 保留主页面 `development.main`。
- [preload/index.js](../../../preload/index.js#L4253) 在开发主页面创建浮球时尝试使用 Vite 浮球入口。
- [scripts/prepare-utools-runtime.mjs](../../../scripts/prepare-utools-runtime.mjs#L1) 在 `--development` 模式写入 `dist/float.html` 开发代理；生产模式保留构建产物。

## Alternative Route

- Status: `verified`
- Preconditions: uTools 主页面已接入 Vite，但独立浮球仍加载本地插件路径。
- Ordered steps: select `dist/plugin.json`; run `pnpm run serve`; re接入开发; close/reopen the float; inspect the float page URL and verify CSS through Vite HMR.
- Verification: user confirmed the corrected uTools development setup now shows the CSS change; static syntax, diff and type checks pass.
- Applicability boundary: this rule applies to uTools child browser windows; ordinary Vite-rendered main-page CSS only needs the development URL and HMR connection.
- Fallback: if the child window API cannot load a remote URL, retain a local `float.html` proxy that redirects to the Vite child entry; never require a production build for development-only CSS feedback.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-24 | Codex float development refresh | Main page showed `127.0.0.1:8092`, but float CSS stayed stale until build | Assumed `development.main` covered `createBrowserWindow('float.html')` | Added dev-aware float entry plus `dist/float.html` development proxy and required reattach/reopen flow | verified by user; static checks passed |
