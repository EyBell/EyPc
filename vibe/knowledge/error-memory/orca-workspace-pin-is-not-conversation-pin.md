---
id: eypc-orca-workspace-pin-is-not-conversation-pin
status: verified
scope: project
fingerprint: orca-worktree-ispinned__copied-onto-every-agent-card__user-wanted-tab-conversation-pin__same-grain-as-codex-thread
first_seen: 2026-09-14
last_verified: 2026-09-14
review_after: 2027-09-14
evidence:
  - user-corrected
  - preload/orca/inventory.cjs
  - preload/orca/pin.cjs
  - vibe/specs/260913/orca-companion/raw-requirement.md
tags:
  - orca
  - companion-provider
  - pin
---

# Orca 工作区置顶不是对话置顶

## Symptom

用户在 Orca 里钉的是当前对话/标签，EyPc 却按工作区 `isPinned` 入站，或把 EyPc 置顶写回 `worktree set --pinned`。同工作区其它 Codex 式任务不该一起被钉。

## Wrong Assumption

Orca Workspace 侧栏的 Pinned 区等于 Codex 线程置顶。`worktree.isPinned` 或「工作区或标签任一为真」可以当任务置顶。

## Verified Root Cause

一张 EyPc 卡对应一个 Agent 终端（`tabId:leafId`），和 Codex 线程同一粒度。Orca 工作区钉的是整棵 worktree；对话钉的是 `TerminalTab.isPinned`，由 `terminal.list` 带出。桌面开着时 `session.tabs.setTabProps` 对标签属性空成功，真正写入要走渲染层 `pinTab`。

## Detection Order

1. 用户说关心的是这个对话/这个任务，不是工作区。
2. 库存若把 `worktree.isPinned` OR 进 `session.pinned`，同组未钉标签也会显示原生置顶。
3. 出站若调用 `worktree set --pinned`，钉的是 Workspace，不是标签栏。
4. 出站若只调 `session.tabs.setTabProps` 且 Orca 窗口在，回执 `updated:true` 但标签栏不动。

## Prevention Rule

入站只认 `terminal.isPinned === true`。出站用 `orca terminal pin --terminal <handle> --pinned|--no-pinned`，桌面路径必须通知 renderer `pinTab`/`unpinTab`。不要把工作区钉扇到组内每张卡。

## Alternative Route

- 状态: `verified`
- 前置条件: Orca CLI 已有 `terminal pin`，库存 join 了 `terminal.list`。
- 有序步骤: 卡片 pin 读 tab 布尔；写回走 handle 而不是 worktreeId。
- 验证: `orcaInventory` 工作区钉且标签未钉 → `pinned:false`；`orcaPin` 发出 `terminal pin --terminal`。
- 适用边界: Orca companion 置顶。工作区钉仍可存在于 Orca 侧栏，只是不是 EyPc 任务置顶。
- 回退: 写回失败时保留 EyPc `localPin`。
