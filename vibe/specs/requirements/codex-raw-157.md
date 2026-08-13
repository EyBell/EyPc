---
id: eypc-req-codex-raw-157
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-157
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / installed-host-pending / supersedes-RAW-156-default-and-readonly-control-placement"
supersedes:
  - eypc-req-codex-raw-156
---

# RAW-157 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户纠正安装诊断日志应直接使用 `debug` 默认，并要求日志可以启停、可以选择等级。未配置状态与缺少当前默认修订标记的旧 `info` 一次迁移为启用 `debug` 并在启动时写回修订标记；迁移后保存的 `error/info/debug` 或关闭选择继续持久化。Codex「运行」页在最终日志快照上直接提供原生开关与等级选择，“设置 → 维护 → 安装诊断日志”保留同一入口，两处统一派发 `runtime.logs.configure`。唯一 Host sink、隐私拒绝列表、8 MB/64 MB/14 天轮转、权限和只读探针边界不变。聚焦回归与生产构建全绿，当前构建身份为 `hostAssetId=f95cd695fdd0a9e529e7 / rendererAssetId=d384aa2c88fdb5e072a1`；真实安装后三档切换与落盘仍待宿主验收。决策为 `DEC-20260810-01`，来源为本轮明确用户纠正。
