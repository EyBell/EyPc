---
spec_id: SPEC-260823-CODEX-TAB-BOUNDARY-OPTIMIZATION
source_format: chat
capture_fidelity: normalized-material-requirement
source_kind: chat-requirement-summary
privacy_boundary: no-verbatim-prompt-or-transcript
captured_at: 2026-08-23
---

# RAW-177 · Codex Tab 边界优化

用户明确选择继续优化前序 Codex Tab 架构核验中 C 模块列出的全部边界；本文件只保留可执行的需求语义，不保存原始对话或逐字 Prompt。

1. 为当前 87 条无父 RAW、但仍由来源正文承载的编号需求建立稳定、无歧义、可回源的机器身份；不得改变原意或把散文拆成未经确认的新需求。
2. 移除当前源码无消费者的 V4 `companionNavigation` 与 V2 `companionTasks` 平台 facade，保持 V5 `companionKernel` 为唯一任务状态与命令入口，并为兼容破坏提供调用方与验证证据。
3. 建立 Mirasim → Codex 的显式交接状态与 acknowledgement 合同；在原生窗口可见、控制权或 applied/read ACK 未被确认前，只能报告 `dispatched/pending`，不得推导为已打开、已读或已接管。
