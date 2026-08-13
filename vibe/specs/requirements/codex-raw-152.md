---
id: eypc-req-codex-raw-152
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-152
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-139-143-144-and-generic-cross-provider-navigation / process-lifetime-navigation-arbitration"
relations:
  - refines-RAW-139-143-144-and-generic-cross-provider-navigation
---

# RAW-152 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户确认单独点击悬浮卡片可精确打开，但 Codex 与 Claude 任务通过“上一个/下一个”切换时仍可能崩溃，要求核验全局缓存、快捷键自动识别和既有崩溃修复。通用循环的语义候选仍由 Controller 的原子任务包产生，但全部启用来源的库存必须分别完成一次读取后才可宣告就绪；任何一方未完成时，冷快捷键只做 tasks-only 并行预热，不得用部分集合选目标。Preload 新增版本门禁的进程级 `companion-navigation-v1`：它独占跨来源游标与派发队列，普通 `mainHide` / Renderer 卸载只 detach，功能停用、来源开关变化、kill 或进程退出才失效。连续前后键每次都同步推进游标，但在 75ms 尾随窗口只派发最终目标；卡片手动打开和待输入/未读直达优先于尚未派发的通用循环，所有 Codex/Claude 打开共享一个最大并发为 1 的 Host 队列。热缓存命中时 `onPluginEnter` 在 Preload 直接消费并清除同一 payload，Renderer 不再二次派发；冷/旧缓存继续进入 Renderer。旧 Preload 缺少精确 revision 时，卡片直开保持兼容，通用前后切换 fail closed 并提示重载。诊断只公开版本、计数、队列状态和结果枚举，不公开名称、路径、原始 ID 或 action alias。自动化通过后仍须在真实 uTools 中重复跨来源连按、普通显隐和进程重载，源码测试不得冒充宿主崩溃验收。
