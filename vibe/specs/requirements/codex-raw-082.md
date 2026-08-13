---
id: eypc-req-codex-raw-082
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-082
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-067-completed-unread-activation"
relations:
  - refines-RAW-067-completed-unread-activation
---

# RAW-082 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

“已完成未读”数字角标与新增的 uTools 全局功能/快捷键必须派发同一动作：从完整 `completed-unread` 计数集合（包含已隐藏任务）按既有置顶优先、稳定展示顺序定位第一条，立即在 EyPc 本地持久化该任务当前完成 revision 的用户已读确认，并打开该任务。确认后同一 revision 在角标、列表、项目视图、详情与动作投影中立即显示为“已完成/已读”；这不是向 Codex Desktop 写入全局未读状态，也不从时间或连接器猜测状态。较新的完成 revision 仍自动重新成为未读。“待输入”数字角标及既有全局功能继续只打开第一条，不写本地确认，以免尚未实际输入时提前变更状态。配置页提供跳转到该 uTools 全局快捷键设置的入口。本轮不修改或运行测试、typecheck、build、uTools、截图或真实 Codex 操作，交付仍由用户验收。
