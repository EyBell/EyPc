---
id: eypc-orca-grok-wait-stays-done-until-tool
status: verified
scope: project
fingerprint: orca-agent-state-done__osc-spinner-working-frame__wait-for-response-not-running__treat-public-working-title-as-running
first_seen: 2026-09-14
last_verified: 2026-09-14
review_after: 2027-09-14
evidence:
  - preload/orca/inventory.cjs
  - tests/platform/orcaInventory.test.ts
  - vibe/specs/260913/orca-companion/raw-requirement.md
tags:
  - orca
  - companion-provider
  - phase
  - grok
---

# Orca Grok 等待回复时 agent.state 仍是 done

## Symptom

用户已发出下一轮，Orca 侧栏转圈、终端写着 `Waiting for response`，EyPc 仍显示已完成，要等到第一段工具/助手输出才变进行中。同类缺口也出现在只信「已有输出」而不信「回合已开始」的来源。

## Wrong Assumption

`worktree ps` 的 `agent.state === 'working'` 等于「这一轮已经开始」。对 Grok 来说该字段往往要等到 tool 上报才从 `done` 翻过来。

## Verified Root Cause

Orca 自己用窗格 OSC 工作帧判断 live：Grok 把 `⠋ - Waiting for response… - grok` 规范化成 `⠋ Grok`。侧栏「now」跟的是这套标题状态。CLI `agents[].state` 仍停留在上一轮 `done`。EyPc 只映射 `working`/`done`/`interrupted`，把 OSC 工作帧只拿去剥抬头，相位就漏了整段等待。

Codex Host `creating`/`running`、Claude `UserPromptSubmit`、Cursor `prompt-submit`/`turnOpen` 已经在提问提交时进入进行中。Orca 没有 EyPc hook，公开信号是 OSC 工作帧和 `waiting`/`blocked`。

## Detection Order

1. 对照 `agents[].state` 与同 pane 的 `terminal.title`。
2. 标题以 braille spinner / `✳` / Claude `. ` 开头，而 state 仍是 `done`，就是本条。
3. 不要用 `toolName` 或助手正文是否出现来开门。
4. 抬头仍用 tab `customTitle`，不要把 `⠋ Grok` 当主题。

## Prevention Rule

相位：`working` / `waiting` / `blocked`，或 OSC 工作帧 → 进行中。无工作帧的 `done` 才是已完成。不发明待输入。不要把 spinner 标题写进卡片主题。

## Alternative Route

- 状态: `verified`
- 前置条件: 能读 `terminal list` 的 pane `title`。
- 有序步骤:
  1. `sessionState` 在 `agent.state !== working` 时仍检查 OSC 工作前缀。
  2. 推断进行中时 `lastUpdatedAt` 取 `max(updatedAt, lastOutputAt)`，避免随后的 `done` 用更老时间盖不住。
  3. 测试：`state=done` + `title=⠋ Grok` → `working`，名称仍是标签标题。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts tests/platform/providerEvidenceAdapterV7.test.ts`
- 适用边界: Orca Companion。Codex/Claude/Cursor 原生车道继续走各自的 prompt-submit / creating，不改成等输出。
- 回退: 无 spinner 且 `done` 保持已完成，避免把已结束的会话钉在进行中。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-14 | 等待即算进行中 | AnyDrag Grok `Waiting for response… 16s` | 只信 `agent.state` | CLI `state=done`，OSC 应为工作帧 | OSC 工作帧与 waiting/blocked 映射进行中 | verified |
