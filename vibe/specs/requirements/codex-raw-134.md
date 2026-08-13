---
id: eypc-req-codex-raw-134
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-134
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implemented-unverified / refines-RAW-063-108-109-113 / configurable-dynamic-task-window"
relations:
  - refines-RAW-063-108-109-113
---

# RAW-134 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户原文：“当前 Codex 功能 Tab 里面的那一个 悬浮卡片第一条动态的子 tab，需要把‘时间筛选’的 6 小时配置也放到配置页里面，这样我可以去更改。 现在更改为默认为24小时吧。” 悬浮卡片 `动态` Tab 的 latest-Turn 活动筛选从固定 6 小时改为 Codex → `任务` 中可编辑的 `动态时间筛选（小时）`；新安装/缺失旧字段默认 24 小时，持久化输入规范化到 `1–8760` 整小时。该值继续由同一 Controller 原子任务状态包统一决定动态分组、进行中角标、设置页水球预览与前后任务循环 active 候选，并驱动同一既有下一时间边界调度；修改配置须立即重投影，不等待下一次完整校对，也不新增 Renderer 筛选、timer、provider 请求、Preload 协议或原生 Codex 写入。完整任务库存的 `timeWindowDays` 保持独立。现有 Domain/Controller/UI 测试文件补默认值、边界、可配置筛选与即时重投影合同但依项目规则不执行，真实配置保存和悬浮卡视觉由用户重载验收。
