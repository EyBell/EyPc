---
id: eypc-req-codex-raw-047
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-047
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active"
---

# RAW-047 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

点击项目 `＋`、Codex 域 `Ctrl+T`（展示 `c-t`）或右键“新建会话”每次都打开独立新会话编辑器。编辑器展示目标项目、冻结后的模型名称/ID、选择原因与对应额度，原生多行文本框自动聚焦并兼容系统听写；Enter 换行、Ctrl/Cmd+Enter 提交、Tab 在弹层内循环、Escape 清空临时草稿并恢复触发点。提交支持“发送并打开”和“仅创建空会话”；额度/目录/项目指纹变化时刷新说明并要求再次确认。文本模式专用瞬时桥接以精确 cwd/模型、`allowProviderModelFallback=false` 调用 `thread/start`，校验响应顶层 actual model/cwd 后才调用 `turn/start` 与线程 Deep Link。首轮失败清理零轮会话并保留内存草稿，清理不确定时停止自动重试；首轮成功但 Deep Link 失败只提供短期重试打开。文本提示词不得进入通用 action、快照、日志、存储、错误记忆、Deep Link 或剪贴板；图片回退由受限浮窗 IPC 仅复制用户文字并打开空白 Codex 会话，图片/预览 URL 仍只留内存，成功/取消/关闭后立即清除 EyPc 副本。
