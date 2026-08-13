---
id: eypc-req-codex-raw-114
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-114
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / supersedes-visible-float-slots-in-260729-1435-and-refines-RAW-047-113"
---

# RAW-114 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户明确要求展开 Codex 浮窗不显示额度下方的 `Actions / Environment` 卡槽、项目/Environment 选择层或 Setup 提示。Environment Action 的五个全局命令及 Controller/Host 风险门禁可以保留，但 Float 只能把 `codex.action.run.1…5` 转发给 Controller，不得再维护第二套目标、Environment、会话轮询、确认或选择状态。该局部状态也不得参与展开卡收缩门禁。指针与焦点离开或窗口因点击其它位置失焦时，清理浮窗临时确认/提示并在约 `220ms` 后自动收缩；composer、详情/抽屉、别名编辑、Quick Jump、Shift 预览与 resize 仍可在真实交互期间阻止收缩。本条不删除 Host/Controller 的全局 Action 能力，不增加新的状态 timer、协议或持久化；既有 UI 测试文件只更新合同不执行，状态保持 `reported / 未校验，待用户验收`。
