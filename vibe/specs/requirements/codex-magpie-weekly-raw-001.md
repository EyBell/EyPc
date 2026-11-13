---
id: eypc-req-codex-magpie-weekly-raw-001
qualified_source: SPEC-261112-MAGPIE-CODEX-WEEKLY::RAW-001
status: active
domain: companion-codex
authority: user-stated
---

# RAW-001 · Magpie Codex 周额度

[用户决定、实现及待验](../261112/magpie-codex-weekly/task-card.md#raw-001--已确认范围)。

原始决定：水球和展开卡显示现有账户选择所得的 Magpie Codex 周额度，保留账户轮换与 Token 回退；暂不接入 `codex-2` 金额余额。冲突部分已由下述本次明确用户决定局部取代，原始来源保留。

2026-11-13 用户以 F1 确认：本地多个 Codex 账户及远端模式的本地回退均复用既有账户选择规则，避免耗尽的首项遮住仍有周额度的当前账户。详见[续修记录](../261112/magpie-codex-weekly/task-card.md#2026-11-13-本地多账户选择续修)。

## 当前有效变更

2026-11-13 用户明确批准完整方案，decision_status=`explicit-current-request`，决定 `DEC-MAGPIE-WEEKLY-20261113`。继续修订本 leaf，不新增 RAW 身份或 module；[有效变更条款、BusinessChangeReview 与 VerificationImpactTrace](../261112/magpie-codex-weekly/task-card.md#2026-11-13-有效变更条款)承载完整范围，active 仅表示需求有效；证据与未验项见[验证结论](../261112/magpie-codex-weekly/task-card.md#本次验证结论)。

- 局部取代：单账号周选择及 F1 原轮换改为每个来源内非 free 账号全部有效普通 `7days` 周窗口均值，0 参与、非法或缺失不当 0；本次算例 `0+85=42.5%`，Token 344.98 不抢占。余额仍单账号兜底、不求和，顺序为 promax→last→原序。
- 来源候选依次为 fresh 正周、fresh 正 Token、stale 正周、stale 正 Token、明确零、缺失，同层远端优先且不跨来源混账号。参与过期使汇总过期，缺有效周账号标部分数据；失败保留最近成功快照，关闭立即隐藏，过 reset 待刷新、不推 100%。
- 各 Magpie 周入口使用同一读数，最终最多一位小数，`0<p<1` 显示 `<1%`。环仅普通周，Codex 正周保持、0／缺失可补 Magpie 正周；Claude 0 不替代，Claude-only 缺普通周隐藏轨道，不以短窗／scoped 或跨平台补环。grid 优先，移环去重；Token／Grok／Cursor 不驱动环，液面／卡片／贴边线保留原生。
- 展开卡右侧完整来源＋值＋最近参与账号重置，左侧不重复 M·周／M·Token；原生块单行，Magpie 右侧窄窗可换行，整组点击及 Enter／Space 沿用同一额度刷新命令。匿名提示及父 aria 包含账号明细、部分与过期。设置／外观预览复用含 Claude 权限的完整 snapshot；零值格隐藏不改变均值。
- 保留：唯一 finite 远端 key 仅在 Codex-only、明确 free、无原生窗口且无任何 agent 读数时启用；agent 0 也阻断；不接入 codex-2 金额。
