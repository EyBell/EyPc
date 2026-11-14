---
id: eypc-req-codex-magpie-reset-hint-raw-001
qualified_source: SPEC-261113-MAGPIE-RESET-HINT::RAW-001
status: active
domain: companion-codex
authority: user-stated
scoped_relations:
  - target: SPEC-261112-MAGPIE-CODEX-WEEKLY::RAW-001
    relation: supersedes
    scope: Magpie 悬浮提示与展开卡文案
---

# RAW-001 · Magpie 悬浮重置提示

[细化方案](../261113/magpie-reset-hint/spec.md#requirements)。

## 当前有效变更

2026-11-14 14:31 生产投影：当前 c222 周 99%，排除两个重复 Codex 窗口，其余 Codex 61%，Cursor Models 45.4%；Cursor Grok Bot 留在 Cursor。宿主手测未验，最终构建为 V7 / host-792c101e812567f159e2 / renderer-a231c1aa0813d0e7c024 / builtAt 2026-11-14T06:45:24.329Z。


2026-11-14 当前替代入口：右侧分类重置取代本节原先的展开补额度和整组提示。历史决定保留在下方。


2026-11-13 用户确认：悬浮前只留 Codex、Grok、Cursor 三家重置时间；展开后只补必要信息，重置不重复，大段说明不保留。

- 悬浮提示去掉百分比、Token、账号数、窗口明细和「点击立即刷新」。
- 展开卡只补额度等必要信息，不再重复三家重置时间。
- 取数、周均值、来源优先级、失败缓存、水球、外环和预览保持不变。
