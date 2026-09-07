---
id: eypc-companion-foreign-project-fields-not-published
status: verified
scope: project
fingerprint: claude-cwd-present__cursor-workspace-hash__evidence-omits-projectName__package-fills-chats__meta-hides-chats
first_seen: 2026-09-07
last_verified: 2026-09-07
review_after: 2027-03-07
evidence:
  - preload/index.js
  - preload/claude/code-sessions.cjs
  - preload/cursor/inventory.cjs
  - src/domain/companionTaskPackage.ts
  - src/domain/companionPresentation.ts
  - tests/platform/cursorInventory.test.ts
  - tests/platform/projectIdentity.test.ts
tags:
  - companion
  - projectName
  - claude
  - cursor
  - chats-fallback
---

# Foreign Provider Project Fields Must Reach Kernel Metadata

## Symptom

悬浮卡片 Claude / Cursor 已完成行只看得见来源（`CC` / `CS`），第二行项目槽空着。同表 Codex 行能显示 `CodeNote` / `EyPc`。Cloud Code 侧栏里这些会话已经挂在真实项目下。

## Wrong Assumption

把空项目槽当成「展示层故意藏掉 Claude Chats」。那只解释了默认容器名，解释不了侧栏已有的 `CodeNote` 为什么到不了卡片。

## Verified Root Cause

Claude App `local_*.json` 带有绝对 `originCwd`/`cwd`，库存还按与 Codex 相同的 `codex-project` 配方算出 `projectKey`。本机抽查 192/192 条都有绝对路径。`companionClaudeEvidenceV7` 写 Kernel metadata 时只带了标题/别名，没带项目。Cursor 库存只有 workspace 哈希；人读名在 `workspaceStorage/<id>/workspace.json` 的 `folder`/`workspace`。证据层同样没写 `projectName`。包层缺字段就回填 `Claude Chats` / `Cursor Chats` + `projectKind: chats`，压缩第二行再把 chats 容器名省略，于是只剩来源。

## Detection Order

1. 对照同表 Codex 是否仍有项目名：有则不是 Float 整表坏了。
2. 看 Kernel 公开任务有没有 `projectName`/`projectKind`。缺或为 `* Chats` 再往证据层查。
3. Claude：元数据是否有 `originCwd`/`cwd`，证据 builder 是否把它写进 metadata。
4. Cursor：`workspaceIdentifier` 是不是 32 位哈希；同 id 的 `workspace.json` 是否有 folder URI。

## Prevention Rule

- Claude / Cursor 根节点 metadata 必须带可显示项目名和（若有根路径）与 Codex 同配方的 `projectKey`。
- 不要把 workspace 哈希或 `Cursor Agent` 当项目名。
- 包层 `* Chats` 只允许在证据层确实没有项目时出现；展示层省略 chats 名不得掩盖「证据没发布项目」。
- 跨 Provider 项目身份继续用 `codex-project\\0${root}` 的 32 位散列，不要另起配方。

## Alternative Route

- Preconditions: Claude/Cursor 行有来源无项目，Codex 同行有项目。
- Steps: 证据层复制 cwd/workspace 文件夹名；库存解析 workspace.json；展示层继续省略 chats/哈希。
- Verification: 聚焦 companionPresentation、cursorInventory、projectIdentity、companionTaskKernel 来源切片。
- Boundary: 不改相位；Cursor Cloud Agent 仍排除；没有 cwd / workspace.json 的会话仍可省略项目名。
- Fallback: 真机仍待 uTools 重载。
- Status: verified
