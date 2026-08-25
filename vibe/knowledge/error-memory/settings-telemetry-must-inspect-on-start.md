---
id: eypc-settings-telemetry-must-inspect-on-start
status: verified
scope: project
fingerprint: companion-settings-telemetry__hook-install-state-read-only-on-toggle-or-register__start-and-renderer-remount-leave-unknown__page-says-unregistered-while-disk-hooks-remain__inspect-on-start-without-inventory-lanes
first_seen: 2026-08-25
last_verified: 2026-08-25
review_after: 2027-02-25
evidence:
  - src/runtime/codexController.ts
  - tests/runtime/claudeCompanionController.test.ts
  - tests/runtime/codexController.test.ts
tags:
  - claude-companion
  - cursor-companion
  - settings-telemetry
  - hook-registration
---

# Settings Telemetry Must Inspect On Start

## Symptom

Claude / Cursor 事件钩子已经写进用户配置，关掉插件再开后队列仍在写入，但 Codex「运行 → 接入来源」显示尚未注册 / 没有注入。按钮变成「注册事件钩子」。

## Wrong Assumption

任务态改由 Host/Kernel 观察之后，认为 Controller `start()` 不再需要读 Claude / Cursor。把「不要再读库存」扩成「启动时什么都不读」，把只给设置页用的 `inspect()` 留在拨开关和点注册两条路径上。

## Verified Root Cause

`claudeEnvironment` / `cursorHooks` 初始是 `unknown`。`refreshClaude()` / `refreshCursor()` 会读库存，所以不能挂到 `start()`；但安装态 `inspect()` 是另一条 authority。Renderer 隐藏再挂载会新建 Controller，内存回到 `unknown`。`unknown !== 'installed'` 被设置页写成「尚未注册」。

## Detection Order

1. 先读 `~/.claude/settings.json` 和 `~/.cursor/hooks.json` 里的 EyPc 条目，不要先信配置页文案。
2. 看队列文件是否仍在追加。还在写就证明钩子通道活着。
3. 搜 Controller `start()` 是否调用 `inspect`，以及 `refreshClaude` / `refreshCursor` 是否被整段挂回去。

## Prevention Rule

设置页的钩子安装态在 `start()`（以及 Renderer 重建）时单独 `inspect()`。禁止为了刷新这一行去读库存、state 或 unread。`unknown` 不得显示成「未注册」。

## Alternative Route

- 状态：`verified`
- 前置：配置页展示 Claude / Cursor 钩子安装态。
- 步骤：`start()` → `refreshClaudeEnvironment()` / `refreshCursorRegistration()` → `notify`；库存仍由 Host 推送。
- 验证：`pnpm exec vitest run tests/runtime/claudeCompanionController.test.ts tests/runtime/codexController.test.ts -t 'hook registration'`
- 适用边界：Controller 设置遥测。不改变磁盘注册生命周期，不授权自动写入 `settings.json` / `hooks.json`。
- 回退：`inspect` 失败保持 `unknown`，不把库存失败写成未注册。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-25 | 用户退出再开后磁盘钩子仍在、配置页显示未注入；`start()` 补 inspect-only |
