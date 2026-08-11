# RAW-160 Companion V4 Implementation Plan

Status: `implementation-and-full-automated-verification-complete / artifact-ready / host-gate-pending`

1. `complete` — 将 V3 基线升级为 `task-state-v10 / kernel-v4 / package-v4 / actions-v2`，由 Kernel 独占状态、Plan、视图、循环与能力。
2. `complete` — 修正普通 interrupted、active/terminal 冲突和 main/Side Chat 聚合；实现稳定 `planReady / planLifecycleRevision / paused`。
3. `complete` — 实现动态窗口 Plan 例外、独立角标/循环 selector、暂停收据、旧隐藏迁移、四槽与批量暂停/恢复。
4. `complete` — 实现 Actions v2 两击确认和安全 Codex open→resume→turn/start 协议；能力不足 fail closed，超时定向复读且不重发。
5. `complete` — 把 semantic no-op 扩展到 Main/Float/Navigation/Actions；实现 Latest Cache、Float 独立 task lane 与 applied ACK。
6. `complete` — 修复 Claude 新 phase 被旧缓存覆盖，并收紧归档成功提示，不尝试原生侧栏自动化。
7. `complete` — 增加真值表、暂停/执行、1,000 no-op、Float ACK、Claude、分页/归档/Runtime Identity 和静态所有权回归；受影响矩阵已通过。
8. `complete` — 全仓测试、typecheck、生产构建、镜像/语法、Runtime Identity、uTools validator、文档链接与规则一致性通过。
9. `complete` — 已同步现有 Controlled 任务、长期任务、产品/状态/架构/帮助与错误记忆；未创建重复任务树。
10. `pending-host-gate` — 使用同一最终安装包完成真实状态/窗口/暂停/Float ACK/Claude 矩阵。
11. `separate-user-authorization` — 真实 Execute Plan 与真实 Claude 归档分别选择安全目标后再执行。

结果统一记录在 [verification](verify.md#L1)，宿主步骤见 [handoff](handoff.md#L1)。
