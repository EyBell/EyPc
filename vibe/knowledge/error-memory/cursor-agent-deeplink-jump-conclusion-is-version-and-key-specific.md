---
id: eypc-cursor-agent-deeplink-jump-conclusion-is-version-and-key-specific
status: verified
scope: project
fingerprint: cursor-agent-deeplink-local-composer-jump__live-failed-conclusion-stale__reverify-on-glass-selectedagent-key
first_seen: 2026-08-21
last_verified: 2026-08-21
review_after: 2026-11-21
evidence:
  - preload/cursor/open.cjs
  - tests/platform/cursorOpen.test.ts
  - vibe/specs/260818/1335-cursor-companion-feasibility/raw-requirement.md
tags:
  - companion-provider
  - cursor-companion
  - deeplink
  - external-integration
---

# Cursor 本地对话跳转的「live-failed」结论是版本与观察键双重特定的

## 症状

2026-08-18 在 Cursor 3.16.17 上五条外部打开路径全部判失败，`cursor://anysphere.cursor-deeplink/agent?id=<composerId>` 被记为「切不到本地 id」，跳转合同长期停在 `live-failed`，插件卡片点击只能直返提示。

## 错误假设

把一次实测失败当成稳定能力边界：假设官方 deeplink 永远只服务 cloud `bcId`；且用 workspace 级 `selectedComposerIds` 作为「选中已切换」的唯一观察键。

## 已验证根因

两个变量同时错位。① 版本：3.17.8 的 `/agent` 深链把完整 URL 经 `cursor.openOrFocusGlassWindow` → `cursorRunActionInWindow(glass.handleDeeplink)` 转发进 Agents 窗口，`handleAgentOpen` 按 `id` 命中 header 即选中——本地 composer uuid 一样命中。② 观察键：Agents 窗口的选中持久化在 globalStorage `ItemTable['cursor/glass.selectedAgent']`，不是旧调研盯的 `selectedComposerIds`；就算旧版本行为相同，旧观察键也可能漏报成功。

## 检测顺序

1. 复测前先记 Cursor 版本；App 大版本升级即视为旧外部行为结论过期。
2. 观察键用 `sqlite3 -readonly` 读 `cursor/glass.selectedAgent`（WAL 可见，落盘 ≤8s），不要用 workspace `selectedComposerIds`。
3. 三正一负：两个不同真实目标 + 还原原选中 + 一个伪 uuid 负对照（伪 id 必须不改变选中）。
4. 拆 `cursor-deeplink` 扩展 dist 与 `workbench.glass.main.js` 确认处理链，再下结论。

## 预防规则

外部集成的 `live-failed` 结论必须携带「宿主版本 + 观察键」两个限定词；宿主升级后允许且应当复测，不得把旧结论当永久合同。跳转实现只走官方 deeplink（`dispatched`，不报已读），仍禁止直接写 `selectedComposerIds` / `cursor/glass.selectedAgent`、AX、resume。

## 替代路线

- 状态：`verified`。
- 前置条件：Cursor ≥3.17.8 在本机注册 `cursor://`；目标是库存内本地 Agent composer uuid。
- 有序步骤：校验 uuid → `open "cursor://anysphere.cursor-deeplink/agent?id=<composerId>"` → 报 `dispatched`。
- 验证：`pnpm exec vitest run tests/platform/cursorOpen.test.ts`；本机三正一负观察 `glass.selectedAgent`。
- 适用边界：本地 Agent composer；cloud 走 `bcId`；App 未运行时 `open` 会拉起 Cursor。
- 回退：版本回退或行为再变时恢复 `unavailable` 直返，重新按检测顺序实测。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-18 | Cursor companion 可行性 | 五条外部打开路径实测 | 3.16.17 + `selectedComposerIds` 观察下判 `live-failed` | 冻结跳转实现 | candidate |
| 2026-08-21 | 跳转打通授权轮 | 用户授权本机高级实验 | 无；3.17.8 三正一负全过，`glass.selectedAgent` 精确切换 | 按 Claude 同形落地 `open.cjs`，结论改 `live-verified` | verified |
