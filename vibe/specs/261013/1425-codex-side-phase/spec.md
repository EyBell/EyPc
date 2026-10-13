# Codex side chat 状态聚合修复

状态：implemented / automated-verified / artifact-ready / host-reload-pending。

## BusinessChangeReview

- 基线：当前 PRODUCT_REQUIREMENTS 的 Kernel V7 聚合及 RAW-149（审批归入待输入）、RAW-165/RAW-207（成员 attention 优先）。本轮用户明确纠正 Codex 根卡的状态来源。
- Allowed delta：有精确子成员时，主任务 input/approval 保留；其余保留成员聚合，活动 side 使根卡进行中/等待；历史 completed/stopped/unknown 子成员不得压住主任务 running/Goal。无子成员继续使用主任务。多个成员继续沿用 attention > running > terminal 的现有顺序。
- Preserved invariants：成员自身因果状态不改；未读仍三态聚合；Topology 只负责关系；只发布/打开根任务；活动成员禁止归档；Claude/Cursor/Orca 保持原聚合；活动子成员优先于根任务 Plan artifact；无活动成员时保留原有 Plan 终态投影。
- 消费者：Kernel canonical snapshot → main/float presentation、分组、角标、attention、cycle、command archive guard。
- 测试预期变化：新增 36 个父/子相位组合；恢复原有 active-main/stopped-side → running 守卫，独立验证 active-members 归档拒绝；历史 terminal/unknown 与 Plan fallback 保留检查在错误版本上 5 项失败，修复后通过。
- 未决项：真实插件重载与现场展示；不读取其他任务原始对话。

## VerificationImpactTrace

- Changed surface：Kernel phase 聚合、定向回归、需求与帮助说明。
- Impact evidence：aggregateKernelRoot → materializePrivateTopology → canonical package；根卡共享投影供各消费者使用。
- Selected checks：Kernel/Topology、TaskPackage/Presentation 定向回归；production build（含 semantic typecheck、合同和 uTools 校验）；需求/来源锚点同步校验。
- Skipped checks：全库回归、MQTT、真实 uTools/浏览器；无对应影响或当前运行授权。
- Escalation：none。结果见 verify.md。

## 现场回归续修

用户确认附件为 Codex 原生侧栏，作为状态对照，不能当成 EyPc 界面。重启后的匿名诊断在 14:36–14:39 记录根任务 waiting-input → stopped、running → stopped → completed；部分入站含两个成员，但日志未包含根/子分别相位，不能直接绑定截图标题或确认唯一现场原因。

已确认代码回归：上一产物仅凭存在子成员就排除主成员，将原有 active-main/stopped-side 保护改成 stopped，扩展了用户关于活动 side chat 的需求。续修撤回该扩大行为，只保留主任务 input/approval 的优先；历史子成员不能清除主任务当前 running/Goal。两层原始日志不持久化；本段仅保存必要诊断结论。现场差异是否完全修复仍待新产物验收。
