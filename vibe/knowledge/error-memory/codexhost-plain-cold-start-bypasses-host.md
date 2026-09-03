---
id: eypc-codexhost-plain-cold-start-bypasses-host
status: verified
scope: project
fingerprint: codexhost-takes-over-desktop-only-at-launch-env__deep-link-cold-start-runs-plain-desktop__codexhost-launch-then-refuses__launch-first-then-dispatch
first_seen: 2026-09-03
last_verified: 2026-09-03
review_after: 2026-12-03
evidence:
  - preload/index.js
  - preload/companion/open-readiness.cjs
  - preload/codex/desktop-launch.cjs
  - tests/platform/companionOpenReadiness.test.ts
  - tests/platform/codexDesktopLaunch.test.ts
tags:
  - codexhost
  - deep-link
  - launch
  - open-readiness
---

# Codex 未运行时的深链冷启动绕过 CodexHost；之后 `codexhost launch` 反而被拒

## 症状

Codex Desktop 没有运行时在 EyPc 点任务：Codex 打开了、任务也打开了，但 CodexHost 的额外进程一条都不出现，`codexhost launch` 再跑报「Source launch refuses an existing Codex Desktop」；Claude 未运行时点任务直接被拦下「Claude 桌面端未在运行」；Cursor 未运行时靠系统 URL handler 隐式冷启动。

## 错误假设

第一版把 Codex 桌面端 `ChatGPT.app` 的 70 KB 主可执行文件当成了「codexhost shim 替换了 bundle」，进而断言深链 URL 会被 shim 吞掉，并据此做了「二进制含 codexhost 字样」的 shim 检测。实机核验：该二进制不含 `codexhost` 字样（只有 C++ ABI 的 `__shim_type_info`），bundle 未被替换。

## 已验证根因

CodexHost 只在**启动时**接管 Desktop：`codexhost launch` 用 `open -n -W --env CODEX_CLI_PATH=…/codexhost-shim CODEXHOST_LAUNCHER_PID=… CODEXHOST_HOST_RUNTIME_PATH=…` 打开 `/Applications/ChatGPT.app`，shim 是替代 `codex` CLI 的代理（`crates/shim` `run_proxy`），bundle 本身不动。用 Dock 或 `codex://` 深链冷启动的 Desktop 没有这些环境变量，Host 运行时不会起来；此后 launcher 因 Desktop 已在运行而拒绝（macOS 的 Attach 分支会 force-stop）。EyPc 侧 `openCodexThread` 又无条件 `shell.openExternal`，没有任何在运行前置检查。

## 预防规则

- 打开任务前先经就绪层：探测目标进程，未运行则启动、有界轮询到进程出现、软等待就绪后再发深链；探测未知不启动。
- 「通过 CodexHost 打开 Codex」有效时（`on`，或 `auto` 找到 codexhost 命令 / Host 描述符存活 / 当前 Desktop 环境带 `CODEX_CLI_PATH=…codexhost` 或 `CODEXHOST_LAUNCHER_PID`）用 `codexhost launch` 起 Codex，绝不在 Desktop 已运行时调用它；找不到命令时拦下不启动——普通 `open -b` 只会造出一个 Host 无法接管的 Desktop。
- 「当前 Codex 是否经 CodexHost 启动」只能从运行中进程的环境读（`ps eww -p <pid>`），不能从 bundle 文件推断。
- codexhost 命令位置不能依赖运行中的 Host：会合点解析到的 `CODEXHOST_CLI_PATH` 要持久化为观察路径，另有手动路径与常见目录 / PATH 扫描。
- 测试沙箱里未知命令的 `execFile` 假实现回空输出，`pgrep` 会读成「未运行」并让就绪层等满 25 秒；沙箱要明确答 `pgrep -x` 一个 pid。

## 验证记录

- 2026-09-03：`ps eww -p <ChatGPT pid>` 显示 `CODEX_CLI_PATH=…/target/debug/codexhost-shim`、`CODEXHOST_LAUNCHER_PID`、`CODEXHOST_HOST_RUNTIME_PATH`；`crates/platform/src/desktop_launch.rs` 注入 `CODEX_CLI_PATH` 与 `CODEXHOST_*`；`crates/shim/src/lib.rs` `run_from_environment` → `run_proxy`。配置页第一版状态文「未检测到 CodexHost 接管」即为错误 shim 检测的直接证据。
