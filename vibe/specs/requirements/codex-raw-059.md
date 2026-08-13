---
id: eypc-req-codex-raw-059
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-059
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-016-and-RAW-056"
relations:
  - refines-RAW-016-and-RAW-056
---

# RAW-059 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

Easy Agent 完成前，Input、正在进行中与已完成未读仍只以 Codex Desktop 的 live/read authority 为准；手动选择或自动发现 CLI 只影响 App Server 启动，绝不把插件缓存提升为状态权威。配置页必须自动诊断 macOS/Windows 受控候选，并允许用户通过本机文件选择或完整路径可选地保存一个本机插件存储中的 CLI 可执行文件绝对路径；完整路径不回显、不进入环境快照、日志或文档。手动位置先经受控运行计划核验，失败必须明确提示并允许恢复自动发现。未设置手动位置时继续使用自动发现与既有本地 App Server 连接器，并明确提示连接可能有延迟；该降级仅保留额度、库存、创建和已验证归档，Input/进行中/完成未读仍显示未知而不是由缓存补猜。Windows 继续支持 npm/Volta/NVM/本地/PATH 的 CLI 发现及 shim 核验，但当前私有 Desktop IPC 实时桥仅是 macOS canary，Windows 不得伪报同等实时能力。开发验收仍由用户负责，本轮不运行测试、类型、构建、uTools、真实预检或真实归档。
