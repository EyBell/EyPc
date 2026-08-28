---
id: eypc-codex-display-label-fallback-precedence
status: candidate
scope: project
fingerprint: codex-task-label__missing-display-name-outranks-original__placeholder-with-valid-source-name__normalize-original-before-alias-display-fallback
first_seen: 2026-07-22
last_verified: 2026-08-28
review_after: 2026-11-28
evidence:
  - src/domain/codex.ts
  - src/FloatApp.vue
  - tests/domain/codex.test.ts
  - tests/ui/codexCompanion.test.ts
tags:
  - codex-companion
  - display-label
  - alias
  - fallback
  - projection
---

# Display Labels Must Start From The Original Name

## Symptom

A task without a local alias could display a placeholder even though the host supplied a valid original name. Rows with aliases also repeated the original name inline, weakening the primary label hierarchy.

## Wrong Assumption

An optional presentation field was treated as the authoritative fallback, while the required source name was stored separately and consulted too late.

## Candidate Root Cause

The projection built `displayName` and `name` from different precedence chains. Renderer helpers then preferred the presentation field before the original name, allowing an absent field to win through a placeholder.

## Detection Order

1. Compare host source-name, optional display-name and local-alias presence independently.
2. Inspect the projection result for alias, display label and original name.
3. Verify no-alias and alias rows separately.
4. Verify search and detail surfaces still retain the original name when the row does not repeat it.

## Prevention Rule

Normalize one valid original name first. Add an alias only when it is non-empty, then derive the display label as `alias || originalName`. A placeholder is permitted only when both source-name inputs are absent. Search and detail may retain both values, but the compact row renders one primary label.

## Alternative Route

- Status: `candidate`; awaiting user-owned UI acceptance.
- Preconditions: a projected entity combines an upstream name with optional local display metadata.
- Ordered steps: normalize original name; normalize optional alias; derive one display label; expose original separately; render one row title; index both values for search.
- Verification: cover alias and no-alias projections, original-name search, single-title rows and detail/preview access to the original.
- Applicability boundary: applies to display metadata; identifiers, ownership and destructive-action aliases remain separate authority.
- Fallback: if no upstream name exists, use the product placeholder without manufacturing an alias.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-07-22 | RAW-055 Codex task labels | User required alias-only display with original-name fallback | Optional display field produced a placeholder before the valid original was considered | Normalize original first and derive alias/display from one precedence chain | candidate; user acceptance pending |

| 2026-08-28 | 逾期 candidate 复核 | validate:error-memory 报告复核窗口过期 | 无——本轮为复核而非再尝试 | 未改动实现 | candidate；2026-08-28 复核：源码与样式实现仍在位，无回归；本轮无法取得验收证据——视觉结论只能由用户给出，运行诊断日志不记录观感。状态维持 candidate，复核窗口顺延。待验收项：无别名任务显示原始名、有别名行不重复原名。 |