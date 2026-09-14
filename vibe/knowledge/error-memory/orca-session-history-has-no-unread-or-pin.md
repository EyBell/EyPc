---
id: eypc-orca-session-history-has-no-unread-or-pin
status: verified
scope: project
fingerprint: orca-agent-session-history__no-unread-no-pin-no-phase__tab-bar-owns-completed-unread__sidebar-dot-is-working-done
first_seen: 2026-09-14
last_verified: 2026-09-14
review_after: 2027-09-14
evidence:
  - user-corrected
  - live aiVault.listSessions 2026-09-14
  - src/shared/ai-vault-types.ts
  - src/renderer/src/components/sidebar/worktree-card-agent-summary.ts
tags:
  - orca
  - companion-provider
  - unread
  - pin
---

# Orca Session History 没有已完成未读，也没有标签钉

## Symptom

用户以为 Agent Session History / 左侧树能给出每条对话的已完成未读和钉。EyPc 若去扫 History，仍然对不上标签栏橙色未读。

## Wrong Assumption

Workspace 的 Session 记录、左侧 Agents 树和标签卡共用一套「已完成/未读」。History 行上的状态就是卡片状态。

## Verified Root Cause

真机 `aiVault.listSessions`（232 条）字段只有 title / updatedAt / messageCount / agent 等，没有 `unread`、`isPinned`、`state`。左侧树圆点只映射 `working|waiting|blocked|done|interrupted`，没有未读。已完成未读只在标签栏：`unreadAgentCompletionPanes`。钉在 `tabsByWorktree[].isPinned`。三者不是同一份状态。

## Detection Order

1. History 行能搜到标题，但没有未读/钉字段。
2. 左侧树同一对话只有进行中/已完成圆点。
3. 标签卡仍可能橙色未读或钉。
4. 不要用 History 预览或左侧树去填 EyPc「已完成未读」。

## Prevention Rule

EyPc 未读只认按窗格 `unread`；没有该字段就不要猜。钉只认标签 `isPinned`（CLI 或缺时会话库 tab 布尔）。禁止把 `aiVault.listSessions` 当未读/钉/相位来源，也禁止读它的 preview/prompt。

## Alternative Route

- 状态: `verified`
- 前置条件: 本机 Orca runtime 可调 `aiVault.listSessions`，标签仍开着。
- 有序步骤: 对同一 `title`/`tabId` 分别看 History 键名、`worktree ps` agent.state、会话库 `isPinned`。
- 验证: History 键名不含 unread/isPinned/state；左侧 agent 有 state 无 unread；钉只在 tab。
- 适用边界: Orca companion 未读与钉。
- 回退: 窗格未读未导出时宁可少标，不扫 History。
