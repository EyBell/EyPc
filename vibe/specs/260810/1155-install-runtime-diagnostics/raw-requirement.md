# RAW-159 — Codex Companion 状态、库存、交互、归档与全量日志统一改造

Date: 2026-08-10
Status: `active / implementation-landed / full-automated-verified / installed-host-pending`

## 原始目标

用户要求停止局部补丁式修复，把 Codex 的状态、语义版本、任务库存、缓存、快捷键、跳转、归档和日志作为一个架构改造一次性交付。当前连续复现包括：精确 interrupted 长期显示进行中、正常完成缺少未读、新 Codex 任务不展示、40 条后任务被截断、等价状态高频刷新、快捷键重复发送、归档按钮不稳定，以及插件先隐藏但 Codex App 刷新后仍存在的假归档。

## 不可拆分要求

1. 唯一数据流固定为 `Codex 原生事件/库存 → Evidence Adapter → Process Task Kernel → Canonical Task Package → 全部消费者`。
2. 升级为 `CompanionTaskEvidenceV3`、`CanonicalTaskStateV3`、`companion-task-kernel-v3` 和 `companion-task-package-v3`；Host/Renderer 不得再次裁决 Provider 状态。
3. `phase` 与 `unread` 是独立 lane；同一 completion epoch 的未读不能因暂时缺证据被写成 `false`。
4. 精确 waiting、active、completed、interrupted 立即裁决；无法确认的 failed/interrupted 不覆盖最后稳定态，只显示最多 250ms 的轻量核验中。
5. 新 membership 先显示最小卡片，再定向补元数据；普通 inventory 缺行不能删除。任何固定产品任务上限都必须删除，Codex 分页必须读到 cursor 结束。
6. `observationGeneration` 只拒绝乱序观测；`semanticRevision` 只在真实可见语义变化时递增。等价观测不得增加任务/包 revision，不得发布 Float、focus 或角标更新。
7. Process Kernel 是唯一热缓存。普通主窗口隐藏、浮窗关闭或再次进入不得清空库存、alias、latest Turn 和快捷键目标。
8. 快捷键直接使用 Kernel 的 `cycleKeys/attentionKeys/focusedKey`；热路径不做全量读取，stale alias 只定向重建一次并重试一次，快速连按只保留最终尾随目标。
9. Codex 归档只有在持久化后置条件确认后才可隐藏。运行中的 Desktop 必须满足一次写、两次服务器库存确认、Desktop sync 和匹配 `thread/archived` ACK；Desktop 未运行时仍需两次服务器确认。
10. 归档失败、矛盾或 ACK 超时必须保留卡片、按钮、缓存和快捷键目标，显示“归档未确认”，发送主窗口、浮窗和 uTools 提醒，并携带短 operationId。
11. 卡片、手动行、Quick Jump、全局/本地/attention 快捷键、循环、归档和自动恢复都创建 operationId，并贯穿 UI、Controller、Kernel、Navigation、Provider 和结果。
12. `eypc-runtime-diagnostics-v3` 是唯一明文 JSONL Host sink；安装验证默认开启 debug，可手动关闭或选 error/info/debug，所有调用必须显式填写 level。
13. 日志保留精确 taskRef、路径、状态、水位、revision、缓存、操作阶段和耗时；但不得持久化提示词、正文、命令参数、stdout/stderr、凭据、令牌、堆栈或隐藏推理。
14. 探针兼容 v2/v3，可按 session、operation、trace、provider、taskRef、scope、event、level、since、tail 查询，并聚合状态变化、no-op、快捷键、跳转、归档阶段和错误。
15. 本轮只实现 Codex 全链路；Claude/Cloud 当前无任务，不改变其状态与归档行为。

## 验收要求

- 真值表覆盖运行、等待、审批、完成未读/已读、中断、新 Turn、乱序/重复与核验失败。
- 1,000 条等价 observation 在首条后产生 0 次 semantic/package revision、Float 和 focus。
- 240 个任务、三页库存中的第 41、101、201 条均存在于卡片、Tab、角标、快捷键和归档目标。
- 归档覆盖写成功但 sync 失败、verify-2 矛盾、ACK 超时、成功提交、失败重试、确认身份稳定和旧库存不复活。
- 受影响测试、全量测试、类型检查、Preload 镜像、生产构建、Runtime Identity 和 uTools validator 全部通过。
- 真实 uTools 同一安装包完成状态、库存、交互、归档和四档日志矩阵；该门禁不能由自动化替代。
