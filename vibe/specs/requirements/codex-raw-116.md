---
id: eypc-req-codex-raw-116
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-116
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-091-094-108-112-113"
relations:
  - refines-RAW-091-094-108-112-113
---

# RAW-116 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户继续反馈任务角标数量与状态分段错误：主动停止的任务默认仍落在“正在进行中”，切换到该停止任务后会恢复“已停止”，再切换到另一条进行中任务时又回到“正在进行中”。源码调用链确认 Codex Desktop 切换当前任务会让上一任务的 stream owner 广播 `thread-stream-following-changed(following=false)`；preload 旧实现把这个关注切换等同于 owner/client 断开，删除上一任务已确认的 `desktop-live idle` shadow 并立即回退 connector，因此 interrupted/failed 因缺少 exact idle 只能再次保守投影为 ongoing。真正的客户端离线已有独立 `client-status-changed(disconnected/closed)` 清理路径。对于仍在 EyPc inventory 内的主任务，或父任务仍在 inventory 内的 Side Chat，owner `following=false` 只触发向同一 owner 的定向 `following=true` 续订，并保留最后一份精确 shadow 直到替换 snapshot 到达；真实 owner 断开、任务离库、归档、桥失败和显式退订仍按原路径丢弃 live authority。该修复不修改 stopped/ongoing 判定、角标/卡片原子包、读取状态、Turn 核验、timer、协议字段、持久化或隐私边界。`preload/index.js` 与 public 镜像同步，既有 bridge 测试文件只补“切换任务不产生 connector fallback、停止任务保持 idle/live”的合同且不执行；状态保持 `reported / 未校验，待用户验收`。
