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
2026-11-14 Hook 规则裁决：收尾构建只由同步 Stop Hook 执行。未回结果只报缺口，模型不手动 build，不伪装调用处理器。真实失败后才修复并交自然 Stop 重验。本条不产生新产物身份。

2026-11-14 显示标签增量：账号显示邮箱名前四位加完整域名，仅去掉末尾 .com；重名序号仍放在时间末尾。SHA-256 去重不变，完整邮箱不落盘。20:52 自然 Hook 回执已覆盖此前源码与本轮 Hook 文案：V7 / host-46e2d9b53fc524f3409c / renderer-84aa25e1092762ee1804 / builtAt 2026-11-14T12:52:06.897Z；这不是真实插件验收，也不覆盖此后新增的 Hook 文案。

2026-11-14 提示格式补充：悬停绝对时间改为上海时区 MMDD-HHMM，按账号左对齐分行。区分序号放在时间末尾，如 c222 1120-2224 ·1；无序号不占位。Cursor 仍为月与 Bot 两行，常态月规则和 D/H/M 不变。该轮构建身份保留为历史，不代表本次标签增量。

2026-11-14 显示收敛：常态只显示最大时间单位，如 5D、3H、25M；悬停只显示上海时间 YYMMDD-HHMMSS。Codex 每账号一行，Cursor 常态只用账号月周期，悬停分月与 Bot。上次数据和部分数据保留，13 类宿主手测未验。


2026-11-14 14:31 生产投影：当前 c222 周 99%，排除两个重复 Codex 窗口，其余 Codex 61%，Cursor Models 45.4%；Cursor Grok Bot 留在 Cursor。宿主手测未验，最终构建为 V7 / host-792c101e812567f159e2 / renderer-a231c1aa0813d0e7c024 / builtAt 2026-11-14T06:45:24.329Z。


2026-11-14 当前替代入口：右侧分类重置取代本节原先的展开补额度和整组提示。历史决定保留在下方。


2026-11-13 用户确认：悬浮前只留 Codex、Grok、Cursor 三家重置时间；展开后只补必要信息，重置不重复，大段说明不保留。

- 悬浮提示去掉百分比、Token、账号数、窗口明细和「点击立即刷新」。
- 展开卡只补额度等必要信息，不再重复三家重置时间。
- 取数、周均值、来源优先级、失败缓存、水球、外环和预览保持不变。
