---
id: eypc-orca-spinner-osc-title-is-not-card-topic
status: verified
scope: project
fingerprint: orca-working-card-title__osc-spinner-grok-strips-to-repo__new-pane-looks-like-old-running__prefer-visual-layout-tab-title
first_seen: 2026-09-14
last_verified: 2026-09-16
review_after: 2027-09-14
evidence:
  - preload/orca/inventory.cjs
  - tests/platform/orcaInventory.test.ts
  - vibe/knowledge/harness-title-abbreviations.md
  - vibe/specs/260913/orca-companion/raw-requirement.md
tags:
  - orca
  - companion-provider
  - display-label
  - inventory
---

# Orca 工作中 OSC spinner 不是卡片主题

## Symptom

用户在 Orca 里把旧对话标成已读并新开一条对话后，浮窗进行中仍是 `gr · EyPc`，看起来像旧卡没离开进行中。实际是新 pane 仍 `working`，旧 pane 已 `done`。

## Wrong Assumption

`terminal list` 的 pane `title` 就是会话主题。工作中 Grok 的 OSC 标题常是 spinner `⠋ Grok`，剥掉 harness 后主题为空，抬头退回仓库名，新旧卡撞名。

## Verified Root Cause

Orca 顶栏 / Agents 用标签 `customTitle`。`terminal list` / `terminal show` 默认只给窗格 OSC 标题；工作中 Grok 常是 spinner `⠋ Grok`。`visualLayouts` 里 **tab 节点和 pane 节点都带 `tabId` + `title`**：tab 才是标签名，pane 是 OSC。递归抽取时若后写入 pane，会把已经读到的标签名盖掉。相位仍只跟 Agents `working` / `done`；已读清的是工作树 `unread`，不能把仍 `working` 的会话改成已完成。

## Detection Order

1. 对同一仓库列出 Agents `paneKey` + `state`，确认是否已有新 pane。
2. 对照 `terminal list --include-visual-layouts` 的标签标题与 pane OSC 标题。
3. 若 OSC 是 spinner / 裸 `Grok` 而标签有主题，库存必须用标签标题。
4. 不要先把「进行中」当成旧卡没切 `done`。

## Prevention Rule

Orca 抬头只从带 `activeLeafId`、不带 `handle`/`leafId` 的 tab 节点取 `title`。禁止用同 `tabId` 的 pane OSC 标题覆盖。没有标签标题时才回退剥装饰后的 OSC，再没有才用仓库名。不要把 spinner、`◑` 或裸 harness 名当主题。Agents 仍为 `working` 时，未读铃/`unread=true` 不得把相位折成已完成。不要从 visual layout 带出路径或 preview。项目名跟工作树，不按标题前缀改归属。

## Alternative Route

- 状态: `verified`
- 前置条件: Orca CLI 支持 `terminal list --include-visual-layouts`。
- 有序步骤:
  1. `readInventory` 先带该旗标；失败再回退无布局列表。
  2. 只抽取 tab 节点（`tabId` + `activeLeafId` + `title`），忽略 pane 的同字段 OSC 标题。
  3. 同一仓库两个 pane 必须得到两个不同 `name`；工作中 spinner 不得覆盖标签名。
- 验证: `pnpm exec vitest run tests/platform/orcaInventory.test.ts`
- 适用边界: Orca Companion 卡片第一行。不含对话正文、Prompt、preview。
- 回退: CLI 不给 visualLayouts 时保持 OSC / 仓库名回退，不得假造成功读到标签标题。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-14 | Orca 状态跟踪 | 已读后新开对话仍见 `gr · EyPc` 进行中 | 只用 OSC pane title | 旧 pane `done`，新 pane `working` + spinner | 库存改读 visual layout | 未完成 |
| 2026-09-14 | 插件标题未同步 | Orca 顶栏正常，EyPc 仍是 spinner/仓库名 | 递归把 pane.`title` 盖掉 tab.`title` | 同 `tabId` 的 pane 节点带 OSC `⠋ Grok` | 只认 `activeLeafId` 的 tab 节点 | verified |
| 2026-09-16 | Orca 任务识别 | EyPc 工作树里 KM 标题行带信封 | 未读铃盖住进行中，或 unread=true 被当成主轮次结束 | 标签 `260916-KM-…`，窗格 `⠋ Grok`，`state=working`，CLI 无 unread | 抬头继续用标签；working 时 unread 不折成 done；`◑` 也当工作帧 | verified |
