---
id: eypc-req-codex-raw-054
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-054
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-051-color-interaction"
relations:
  - refines-RAW-051-color-interaction
---

# RAW-054 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

配对颜色模态必须提供两个同时可见的二维取色板，而非只提供滑杆；每个取色板以固定色相显示饱和度/亮度平面，低于 `4.5:1` 的不可选色域以斜纹弱化。选择一侧时锁定该色并把另一侧在保持色相/饱和度的前提下移动到最近的可读亮度；HEX、色相滑杆和取色板继续双向同步。每组标题旁的当前色块是可点击入口，在原位置展开 12 个可选色卡，支持方向键选择与 Esc 关闭；选择色卡走同一联动草稿事务。每个有效草稿都通过 Controller 暂态状态实时展示到真实桌面悬浮伴侣；已保存为水球时预览期间临时显示卡片。预览不得持久化，确认只原子保存一次完整颜色对象；取消、Esc、遮罩或组件卸载清除暂态状态并恢复上次保存的样式和颜色。桌面 [FloatApp.vue](../../../src/FloatApp.vue#L1) 只消费预览结果，不放置水纹或颜色编辑控件；水纹设置仍只属于 Codex 配置页。
