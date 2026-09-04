---
id: eypc-companion-display-clock-zero-is-missing
status: verified
scope: project
fingerprint: row-clock-reads-lastQuestionAt__provider-omits-it-after-turn-close__kernel-metadata-zero-overwrites__completed-pinned-shows-missing-time
first_seen: 2026-09-04
last_verified: 2026-09-04
review_after: 2027-03-04
evidence:
  - src/domain/cursorAgent.ts
  - src/domain/claudeCode.ts
  - src/domain/companionTaskPackage.ts
  - preload/companion/task-kernel.cjs
  - preload/index.js
  - tests/domain/cursorAgent.test.ts
  - tests/domain/claudeCode.test.ts
  - tests/domain/companionTaskPackage.test.ts
  - tests/platform/companionTaskKernel.test.ts
tags:
  - companion
  - lastQuestionAt
  - display-clock
  - claude
  - cursor
---

# Display Clock Zero Is Missing, Not A Reset

## Symptom

置顶区 Claude / Cursor 已完成行显示「时间缺失」，同区 Codex 仍有相对时间。进行中 Cursor 正常。相位仍是已完成。

## Wrong Assumption

把 `lastQuestionAt` 当成「仅开着的 Turn 才有的字段」，并让 Kernel metadata 用入站 `0` 覆盖旧值。行上只格式化这一字段，`0` 被当成没有时间。

## Verified Root Cause

Claude / Cursor 投影在 Turn 关闭后省略 `lastQuestionAt`（完成时间写在 `lastTurnCompletedAt`）。Kernel `acceptMetadata` 无条件写入入站值。Float 只读 `lastQuestionAt`。Codex 线程一直有 Turn `startedAt`，所以同区 Codex 看起来正常。Cursor Cloud Agent 排除是另一条旧门，不是本时钟空洞。

## Detection Order

1. 看行上是否只格式化 `lastQuestionAt`，`!value` 是否映射为「时间缺失」。
2. 对照同组 Codex 是否仍有时间：有则不是 Float 整表坏了。
3. 查 Provider 投影是否只在 `unfinishedRunAt` / `turnStartedAt` 时写入该字段。
4. 查 Kernel metadata 覆盖是否把 `0` 当成合法新值。

## Prevention Rule

- 行上时钟：Turn 开着用 Turn 起点；关闭后回退完成或最近活动时间。
- Kernel 入站 `lastQuestionAt = 0` 表示缺失，保留旧值；正值才前进。
- 不要用 Codex 库存「必须有 Turn `startedAt`」去限制 Claude / Cursor 展示回退。
- Cursor Cloud Agent 入库仍需单独授权，不得并进本修复。

## Alternative Route

- Preconditions: 置顶或已完成 Claude / Cursor 行显示「时间缺失」，相位仍正确。
- Steps: 投影回退完成/活动时间；Kernel 保留旧时钟；包层再回退完成水位。
- Verification: 聚焦 cursorAgent / claudeCode / companionTaskPackage / companionTaskKernel。
- Boundary: 不改相位，不收 Cloud Agent。
- Fallback: 真机仍待 uTools 重载。
- Status: verified
