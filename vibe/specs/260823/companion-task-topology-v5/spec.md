# Companion Task Topology — V6 Corrective Revision

spec_id: `SPEC-260823-COMPANION-TASK-TOPOLOGY-V5`
spec_revision: `4`
status: `v6-implementation-landed / automated-verified-with-known-mqtt-timeout / artifact-ready / host-excluded-by-user`
raw_sources: `RAW-176-01..RAW-176-25`
updated: `2026-08-24`

## Authority

- 用户事实：[raw-requirement.md](raw-requirement.md#L1)
- 实施顺序：[plan.md](plan.md#L1)
- 执行账本：[tasks.md](tasks.md#L1)
- 验证边界：[verify.md](verify.md#L1)
- 变更清单：[changes.md](changes.md#L1)
- 复核证据：[assessment/README.md](assessment/README.md#L1)
- 项目架构：[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)
- 产品权威：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:companion-task-topology-v5`
- Group owner: this `spec.md`
- Scope: V5 历史交付与当前 V6 corrective revision 共用本 Controlled 账本；同步产品/项目/架构/帮助、RAW-176 登记与本轮复发的 Plan/consumer-cache 错误记忆。
- Shared-file ownership: 只提交本任务声明的路径；现有 `_to_delete/` 与其它任务改动不属于本组。
- Sidecar: 两个只读探索结果已由 App Root 接纳；所有文档写入和最终接纳由 App Root 独占。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:companion-task-topology-v5",
  "group_owner": "vibe/specs/260823/companion-task-topology-v5/spec.md",
  "documents": [
    "vibe/specs/260823/companion-task-topology-v5/raw-requirement.md",
    "vibe/specs/260823/companion-task-topology-v5/spec.md",
    "vibe/specs/260823/companion-task-topology-v5/plan.md",
    "vibe/specs/260823/companion-task-topology-v5/tasks.md",
    "vibe/specs/260823/companion-task-topology-v5/verify.md",
    "vibe/specs/260823/companion-task-topology-v5/handoff.md",
    "vibe/specs/260823/companion-task-topology-v5/changes.md",
    "vibe/specs/260823/companion-task-topology-v5/assessment/README.md",
    "vibe/specs/260823/companion-task-topology-v5/assessment/260823-codex-architecture-audit.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/new-companion-source-must-register-with-navigation-authority.md",
    "vibe/knowledge/error-memory/kernel-complete-reapply-must-not-drop-cursor-cards.md",
    "vibe/knowledge/error-memory/companion-consumer-cache-and-float-applied-ack.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "vibe/specs/requirements/shared-raw-176.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167-clause-001.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167-clause-002.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167-clause-003.md",
    "vibe/specs/requirements/README.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/requirements/coverage.md",
    "vibe/specs/requirements/conflict-register.md"
  ],
  "dependencies": [
    "preload/companion/provider-manifest.json",
    "preload/companion/provider-registry.cjs",
    "preload/companion/task-topology.cjs",
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/navigation.cjs",
    "preload/index.js",
    "preload/float.js",
    "public/runtime-identity.cjs",
    "preload/claude/events.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/cursor/events.cjs",
    "preload/cursor/inventory.cjs",
    "src/domain/companionProvider.ts",
    "src/domain/companionTaskTopology.ts",
    "src/domain/companionTaskPackage.ts",
    "src/platform/eypcPlatform.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue"
  ],
  "validators": [
    "scripts/validate-utools-runtime.mjs",
    "scripts/validate-requirements.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-committed-preload-mirrors.mjs",
    "tests/platform/companionTaskTopology.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/companionNavigationBridge.test.ts",
    "tests/platform/runtimeIdentity.test.ts",
    "tests/platform/cursorHooks.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/runtime/codexController.test.ts",
    "tests/runtime/claudeCompanionController.test.ts",
    "tests/runtime/claudeCompanionWatcherE2E.test.ts",
    "tests/runtime/action.test.ts",
    "tests/ui/codexCompanion.test.ts"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260823/companion-task-topology-v5",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/requirements",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/new-companion-source-must-register-with-navigation-authority.md",
    "vibe/knowledge/error-memory/kernel-complete-reapply-must-not-drop-cursor-cards.md",
    "vibe/knowledge/error-memory/companion-consumer-cache-and-float-applied-ack.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "src/help/guides/codex.md"
  ]
}
```

## Public Contracts

1. `CompanionProviderRegistryV1` 是 CJS/TypeScript 的唯一 Provider 枚举、顺序、能力、关系模式和版本来源；Host Registry 只绑定 Adapter。
2. `CompanionTaskEvidenceDraftV6` / `CompanionProviderEvidenceBatchV2` 是 Provider 的唯一任务模板接口，以 membership、phase、unread、metadata、topology 与独立 Plan lifecycle generation 提交来源证据；Provider 不再提交最终 task card。
3. `CompanionTaskTopologyV2` 只接受 exact、同 Provider/family、父存在、非自身、无环且 generation 不倒退的 membership/relation；它不聚合 phase、unread、Plan、counts 或 cycle。
4. `CompanionTaskKernelV6` 独占成员因果、waiting clear barrier、Plan 三态、根 phase/unread、分组、计数、能力与循环队列；消费者和 Adapter 都不得成为第二 reducer。
5. `CompanionTaskSnapshotV6` 是唯一公开运行时读模型；私有 alias/generation ledger 留在 Host。每个语义事务只发布一个完整 revision，Main/Float/页面/角标/快捷键消费同一 revision；`unknown` 由公开 projector 固定映射为中立不可操作状态，inventory 只能补 metadata，不能恢复旧语义。
6. `CompanionTaskCommandV1` 只携带 operation、selector、source、expected revision 与 payload；Kernel 按匿名 key 解析私有目标，Adapter 执行效果。`CompanionTaskSubscribeV1 / AckV2` 负责 replay 与 received/applied/rejected 回执。

## State And Topology Invariants

- 子任务递归归一到根；公共任务、计数和循环只包含根。
- 根 phase 以成员级因果结果按 `waiting-approval > waiting-input > running > goal > terminal` 聚合；精确活动成员阻止根终态。
- unread 为三态；任一成员 true 则根 true，全部明确 false 才 false，其余 unknown。
- 待输入清除屏障绑定 interaction/turn 因果键，旧 observation 不得恢复同一 interaction。
- 精确的新用户补充、新 Turn、thinking/generating 或 execution-start 立即成为 running；不等待实际 assistant reply，也不等待 Renderer 轮询。
- Plan lifecycle 独立为 `unknown / ready / cleared`。`unknown` 继承稳定态；只有更新 sequence 的 cancel、execution-start、archive 或 removal 清除。完成未读 Plan 为 completed-unread；读后且卡仍存在为 waiting-input；取消后为 completed；执行后为 running。
- 选择/open 不改变 phase；打开失败不清 unread；活动成员存在时 archive 拒绝。
- Provider failure 只改变该 Provider health 与 command outcome；Kernel/其它 Provider 保持可用。
- 普通 incomplete evidence 保留上一 complete Snapshot；配置变更是权威 barrier，可立即清除禁用 Provider/inbox 的旧卡。
- 热 evidence 无产品级 debounce。Float applied ACK 缺失只允许一次 latest resend；健康窗口不得因 ACK 超时被强制重建。

## Display And Privacy

- V1 只显示根卡与 `+N 子任务`、live/attention 聚合数；不输出子任务标题、正文、摘要、transcript 或独立操作。
- Claude Hook 只允许 session、event、time、pid、reason、`agent_id`、受控 `agent_type`；Cursor/Codex 继续只跨越匿名有限状态。
- 动态任务状态不持久化；别名、置顶、隐藏、折叠偏好继续由 EyPc 本地配置持久化。

## Supersession

V5 曾取代 V4 Auxiliary Cursor、Controller Cursor open/archive 直调、Renderer Cursor post-fold 和 Provider 专用 navigation callbacks。当前 V6 corrective revision 进一步取代 V5 的预归约 task 输入、Topology 状态聚合、Renderer/provider watcher/cache、Provider 专用同步动作与健康 Float 缺 ACK 强制重建；V5 仍保留为 revision lineage。RAW-177 的 Source Anchor Catalog、冲突边及 `companion-open-handoff-v1` 不被取代。

## Acceptance

V6 最终验收以 [verify.md](verify.md#L1) 的本轮实测为准。Safari、uTools、真实插件、真实 Codex Desktop/native receipt 均按用户明确边界不执行，不能从源码、测试或构建推导 `host-loaded`、native visible/opened/read。
