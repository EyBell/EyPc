---
id: eypc-utools-macos-ax-activation-misses-other-spaces
status: superseded
scope: project-pointer
fingerprint: cg-inventory-finds-window__system-events-ax-target-not-found__activation-not-found-after-healthy-rescan__cgs-space-switch-before-axraise
first_seen: 2026-07-27
last_verified: 2026-07-31
review_after: 2027-01-28
evidence:
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - macos
  - pointer
---

# macOS 跨 Space 激活（项目指针）

权威正文已迁入 CodeNote：

- [macos-window-activation.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/macos-window-activation.md#L1)
- [utools-macos-ax-activation-misses-other-spaces.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-ax-activation-misses-other-spaces.md#L1)

## EyPc 专属差异

WJ-20 supersedes this implementation route. Current EyPc contains no private SkyLight/managed-Space lookup, cache, switch, isolated bridge or environment snapshot; it uses exact CG↔AX root-family proof and final focused-root verification, then blocks if the host cannot complete that operation. The bullets below are retained only as WJ-11–WJ-19 historical host evidence and must not be reintroduced as current activation logic.

- 实现：[preload/index.js](../../../preload/index.js#L1) / [public/preload.js](../../../public/preload.js#L1) 先尝试 preload 内 `koffi`，空绑定时改用隔离 JXA 复跑相同 direct+reverse SkyLight 解析并确认唯一切换；`scripts/prepare-utools-runtime.mjs` 保持运行时镜像与依赖同步。
- 任务证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- 用户复现：槽 1、小米显示器、桌面 5；当前桌面可开、跨桌面 `activation-not-found`
- 2026-07-27 验收对照：同桌面成功；跨桌面全局槽 1 稳定 `space=failed:empty-spaces`（非 `no-api`）→ `activation-not-found`
- 2026-07-27 源码修复：mask `0x7` + managed-display 反查；待宿主跨桌面槽复验 `space=ok:switched`
- 2026-07-27 宿主复验进到 `no-display`；再修为优先用 managed `Display Identifier` 调用 `SLSManagedDisplaySetCurrentSpace`
- 2026-07-27 改为会话缓存 `CGWindowNumber→{spaceId,displayUuid}`（plist + 枚举预热）；同桌面 AX 不变，跨桌面先切再 AX
- 2026-07-27 缓存改为全量：`CGWindowList(OptionAll)` + 清单，经 `SLSCopySpacesForWindows` 绑定全部显示器/桌面；刷新整表重建
- 2026-07-27 回归：`dist/preload.js` 未同步仍走 `SLSCopyManagedDisplayForSpace` → 同屏也 `no-display`；已 prepare 同步。源码：Spaces-only 解析、`current` 跳过、激活未命中反查 tags；勿再依赖 `SLSCopyManagedDisplayForSpace`
- 2026-07-27 可见桌面可开、隐藏桌面 `empty-spaces`：缓存改为 managed CFDictionary + 每 Space `SLSCopyWindowsWithOptionsAndTags` 正向绑定（含非当前桌面）；`SLSCopySpacesForWindows` 仅补清单漏项
- 2026-07-27 绑定仍空时：AX `not-found` 后遍历非当前 managed Space 切换并重试 AX（`walked`），失败则恢复原 Current Space
- 2026-07-27 继续 SIP 路线优化：仅 AX 成功后写入学习缓存；切桌面后仍 not-found 则 forget 再 walk（跳过已试 Space）；settle 120ms
- 2026-07-28 WJ-15 真实宿主：AiTools 位于非当前 Space，全局槽 2 通过 `isolated-space-bridge → switch-confirmed → ax-cg-id-match → ax-focused-window` 完成，目标 Space、Edge 前台和精确 AX 焦点均经只读回查确认；Codex 悬浮球已恢复。
- 2026-07-29 WJ-16：已有会话 Space map 从“只写”改为“先校验再读”；隔离 JXA 的唯一绑定回填当前 preload 会话。缓存命中仍强制应用/标题、精确 CG→AX 与 `AXFocusedWindow` 回读；native miss 淘汰缓存后保留一次完整恢复，Space/display 仍不持久化。
- 2026-07-29 列表缺失：`kCGWindowIsOnscreen=false` 同时覆盖其他 Space 的正常窗口，不能当作最小化并过滤。CG 全量快照可替换；AX/current-Space 局部快照只合并并标记“缓存保留”，不能确认 `target-closed`。
- CodeNote 正文当前包含任务外未提交/未跟踪内容，本轮按安全门禁未覆盖；最新 EyPc 证据以 [verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1) 为准，待该权威工作树由其 owner 合并。

## Alternative Route

- Status: `superseded` for EyPc activation; linked CodeNote material remains historical platform research.
- Current route: exact PID/application/root CG↔AX mapping → restore/Raise/activate → final `AXFocusedWindow` root readback.
- Verification: WJ-20 source/contracts only; real native acceptance remains pending.
- Fallback: unavailable root proof or focus remains blocking and opens the visible workbench path; no Space route runs.
