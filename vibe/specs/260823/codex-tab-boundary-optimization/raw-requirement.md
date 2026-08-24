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

## RAW-178 · 全局当前真值同步

用户明确要求把最初原始需求、后续追加、变更、优化和架构调整按最新有效结果融合或替代，形成一份唯一、真实且可持续同步的全局当前文档。

1. 以最新有效语义融合原始需求与所有后续增量；已被取代的实现或规则只保留为来源证据，不得继续作为并行当前合同。
2. `vibe/specs/PRODUCT_REQUIREMENTS.md` 是唯一全局当前产品真值；需求登记、架构、任务账本和历史 RAW 分别保留生命周期、实现事实、验收和来源职责，但不得与其竞争当前产品语义。
3. 全局当前真值必须基于可复核的需求登记、来源锚点、当前架构、运行身份与验收边界；静态、测试或构建证据不得被写成未发生的真实宿主结果。
4. 全局当前真值必须带确定性机器清单与内容指纹；任一需求、来源、架构、运行身份或正文发生漂移时，统一校验必须失败，直至重新同步。
