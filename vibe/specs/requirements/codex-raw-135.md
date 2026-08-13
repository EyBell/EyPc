---
id: eypc-req-codex-raw-135
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-135
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-010-089-092-120-134 / custom-second-refresh-and-payloadless-completion-fast-path"
relations:
  - refines-RAW-010-089-092-120-134
---

# RAW-135 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户原文：“额度的刷新可以自己手动去改 单位以秒”“完整的这个校验频率也可以自定义”“已完成的这种事件同步还是有 1~2 秒的延迟，可以进行更大的优化。” 额度自动刷新从固定分钟枚举改为 `quotaRefreshSeconds` 整数秒输入，默认 300 秒、范围 `0–86400`，`0` 表示仅手动；旧 `quotaRefreshMinutes` 在规范化时乘 60 一次迁移。完整任务校对继续使用 `taskRefreshSeconds`，但从 `0/15/30/60` 枚举改为默认 15、范围 `0–86400` 的整数秒输入，`0` 表示仅手动；它仍只负责漏事件/完整库存兜底，不得成为已知完成事件的实时缓存。App Server 精确 `turn/completed` 若只带 thread identity 而缺少可发布的 Turn 载荷，Preload 不再因当前 exact-positive 水位把它误判为 stale-active 核验后立即退化到全量扫描；改为同一线程/Side Chat 子线程的专属单任务完成确认，立即读取一次并在同一 3 秒 deadline 内按 `25/75/150/300/600/1000ms` 密集有界复核。成功只发布匿名 completed revision/证据并进入 Controller 既有原子包；任何后到的真实 active/Turn-started/等待请求取消旧确认，耗尽或失败才 urgent 回退完整库存。双 preload 镜像必须同步，不新增 Renderer timer、持久化字段（除设置迁移）、协议字段、原生 Codex 写入或 raw identity 暴露。Domain/Bridge/Controller/UI 四文件相关合同 `165/165`、typecheck、production build 与 uTools runtime validation 已通过；真实 uTools 时延验收仍保持独立宿主门禁。
