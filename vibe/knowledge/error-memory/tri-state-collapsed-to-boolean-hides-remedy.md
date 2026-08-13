---
id: eypc-tri-state-collapsed-to-boolean-hides-remedy
status: verified
scope: project
fingerprint: tri-state-field__consumed-as-equals-one-value__middle-state-falls-to-the-not-installed-branch__status-text-asks-for-the-remedy__remedy-control-is-hidden-or-mislabeled
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - src/pages/CodexPage.vue
  - src/domain/companionPresentation.ts
  - tests/ui/codexCompanion.test.ts
tags:
  - ui
  - state-modeling
  - remediation-path
---

# A Tri-State Collapsed Into a Boolean Hid Its Own Remedy

## Symptom

`ClaudeEnvironmentSnapshot.hooks` 有三个真实状态：`installed` / `outdated` / `missing`。
设置页把它压成 `claudeRegistered = hooks === 'installed'`，于是 `outdated` 落进"没注册"分支：

- 按钮文案变成「注册事件钩子」，而同一面板的状态行正在说「钩子配置已过期，**请重新注册**」；
- 「移除钩子」按钮 `v-if="claudeRegistered"` 直接消失——想清理反而得先成功注册一次。

而 `outdated` 恰恰是最常出现的一态：升级 Claude Code 或插件数据目录变动后必然触发
（见 [utools-generated-command-needs-shell-quoting](utools-generated-command-needs-shell-quoting.md#L1)，
那一轮修复后所有既有用户第一次进来就是 `outdated`）。

## Wrong Assumption

以为中间态"更接近未安装"，压成布尔时让它落进 false 分支是安全默认。实际恰好相反：
`outdated` 的真实含义是**我们的条目在，只是不匹配**，它比 `missing` 更接近 `installed`——
卸载路径按标记匹配，对 `outdated` 完全有效。

## Verified Root Cause

布尔化时只问了"是不是理想态"，没问"每个非理想态各自需要哪个动作"。三态里两态需要的是
同一个动作（重新注册），一态需要的是另一个（首次注册），而卸载对其中两态都可用——
这三条边一压成布尔就全没了。

## Detection Order

1. 找所有 `=== '<某一态>'` 形式消费联合类型字段的地方，列出联合的全部成员。
2. 对每个成员问：它需要哪个补救动作？该动作此刻可达吗？
3. 特别看**状态文案与控件是否分开求值**——文案走 A 函数、控件走 B 布尔，是本病的典型形状：
   文案说得对，控件不听。

## Prevention Rule

- 状态文案与它的补救控件必须由**同一个状态判断**驱动。本仓的落法是把逐项状态收进纯函数
  `claudeRegistrationRows()`，控件的可见性单独断言，两者在同一轮测试里对照。
- 联合类型压成布尔时，在该处写下"其余成员为什么归到这一侧"的理由；写不出来就说明压错了。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：注册状态可见性一轮发现并修复（`installed \|\| outdated`），同轮补 UI 合同断言 |
