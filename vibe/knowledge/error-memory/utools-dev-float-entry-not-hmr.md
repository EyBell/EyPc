---
id: eypc-utools-dev-float-entry-not-hmr
status: verified
scope: project-pointer
fingerprint: utools-development-main-is-live-but-browser-window-float-css-stays-stale__dist-float-entry-bypasses-vite__serve-writes-dev-float-proxy
first_seen: 2026-07-24
last_verified: 2026-08-03
review_after: 2027-01-24
evidence:
  - user-confirmed
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - utools
  - pointer
---

# uTools 子窗口 Vite HMR（项目指针）

权威正文已迁入 CodeNote：

- [child-window-vite-hmr.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/child-window-vite-hmr.md#L1)
- [utools-child-window-vite-hmr.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-child-window-vite-hmr.md#L1)

## EyPc 专属差异

- 子窗口入口：`float.html`；开发代理由 `pnpm run serve` / `scripts/prepare-utools-runtime.mjs --development` 写入
- RAW-094 修改的是 uTools preload：即使 Vite 主服务与 Renderer 仍在运行，旧 preload 也不会 HMR；真实任务完成状态验收前必须重新连接或重载插件并重新打开既有子窗，不能把源码已更新当作当前宿主已生效
- RAW-139 进一步证明生产安装版本也不是活动子窗版本的充分证据：本机长驻 float 初始仍指向旧 ASAR，激活当前插件实例后才切到 1.2.33。验收顺序固定为实际 child URL/ASAR → preload 镜像哈希/能力 → 行为；不得只看“已安装最新版本”
- 任务证据：[verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1)
- 实现锚点：[public/plugin.json](../../../public/plugin.json#L1) · [scripts/prepare-utools-runtime.mjs](../../../scripts/prepare-utools-runtime.mjs#L1)
