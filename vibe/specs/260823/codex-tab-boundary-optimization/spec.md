# Codex Tab Boundary Optimization — Controlled Specification

spec_id: `SPEC-260823-CODEX-TAB-BOUNDARY-OPTIMIZATION`
spec_revision: `3`
status: `integrated / v6-current-automated-verified-with-known-mqtt-timeout / artifact-ready / native-receipt-unavailable`
raw_sources: `RAW-177#1..RAW-177#3`
updated: `2026-08-24`

## Execution Authority

- Control plane: `app-root`
- Sole decision owner: App Root Thread
- Allowed interactive execution surfaces: `main`, `native-thread`
- Automation lane: `not-applicable`
- Surface-to-surface delegation: forbidden
- Main-owned decisions: requirement interpretation、architecture、all writes、verification、documentation synchronization and final acceptance

## Authority And Prior Task Overlap

- 用户需求：[raw-requirement.md](raw-requirement.md#L1)
- 统一状态权威（V5 lineage / V6 current）：[companion-task-topology-v5/spec.md](../companion-task-topology-v5/spec.md#L1)
- 当前架构：[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L123)
- 产品权威：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)
- 需求登记：[requirements/README.md](../../requirements/README.md#L1)
- 来源目录：[Source Anchor Catalog](../../source-anchors/README.md#L1)
- 实施与验收：[plan.md](plan.md#L1) / [tasks.md](tasks.md#L1) / [verify.md](verify.md#L1)

本任务最初在 V5 单链基础上处理三项明确边界，关系为 `new-task / delta-only`。同一共享工作树随后落地 RAW-176 V6 corrective revision；V6 取代 V5 作为现行状态权威，但必须保留本任务已建立的 Source Anchor Catalog、旧 facade 移除结果和 RAW-177 native receipt/read 边界。本账本因此同步记录“原始 C 级交付 + 后期 V6 当前态”，不建立第二套架构。

## Requirement Change Review

| Delta | Classification | Current decision | Integrated result |
| --- | --- | --- | --- |
| C-1：为无父需求的来源条款建立稳定机器身份 | `add / compatible-update` | `explicit-current-request` | 历史人工快照 `87/13` 被当前确定性扫描修正为 `102/14`；全部获得 `SA-*` 来源身份，但不伪装成 active requirement |
| C-2：移除 V4/V2 facade | `remove / supersede` | `explicit-current-request` | `eypcPlatform` 只保留当前 V6 `companionKernel`，旧 `companionNavigation` / `companionTasks` facade 与 v2 常量保持移除 |
| C-3：建立 Mirasim → Codex handoff/ACK | `add / compatible-update` | `explicit-current-request` | EyPc 已落地 `requested → dispatched → native-confirmed → applied / failed` 合同；Deep Link 只到 `dispatched`，没有原生回执时不清未读、不宣称控制权 |

Conflict scan 已闭环：RAW-177#3 整条取代 RAW-163#55，并只在“Deep Link 派发即已读”的范围局部取代 RAW-164#61/#64。当前登记 `conflicted=0`，没有待用户裁决的 semantic fork。

本机只发现已安装的 Mirasim App，没有可编辑的 Mirasim 源码仓库或原生展示/控制权回执接口。因此跨仓写集为空；`native-confirmed → applied` 保留为真实原生接口与宿主联调门禁，不由本地测试推断。

## Invariants

1. 来源身份只给已存在、边界稳定的来源条款寻址，不改写条款语义，也不把 evidence/plan 自动提升为需求。
2. `companionKernel` 保持 Codex/Claude/Cursor 任务状态、导航与效果命令的唯一平台入口。
3. 交接状态必须单调且可回源：`requested → dispatched → native-confirmed → applied`；失败或证据缺失保持 pending/failed。
4. Provider 归属、请求派发、原生可见、控制端与已读分别建模；来源为 Codex 不代表 Codex Desktop 已控制。
5. 本地注意力游标可在接受派发后前进；Provider 原生未读只能由明确 native receipt 改变。
6. 静态、测试、构建和 Runtime Identity 不证明真实 Mirasim/Codex Desktop 已完成 applied ACK。
7. 后期 V6 只能收紧状态所有权：Provider Adapter 提交证据、Topology 只管成员关系、Kernel 独占 phase/unread/Plan/groups/counts/cycle，Main/Float/UI 只消费公开 Snapshot；不得恢复 Renderer/provider 影子状态、私有 alias 泄漏或 inventory 语义回退。

## Current Runtime Reconciliation

当前 revision chain 为 `task-state-v11 / registry-v1 / topology-v2 / kernel-v6 / snapshot-v6 / command-v1 / subscribe-v1 / ack-v2`。点击、Enter、角标、attention、上一个/下一个只提交匿名 `key + source`；Provider alias 和原始目标留在 Host Adapter。公开 `unknown` 是中立、无 alias、不可操作状态，不能从 inventory 恢复旧 phase、unread 或 capability。RAW-177 的 `companion-open-handoff-v1` 与 V6 Command Gateway 正交：命令成功派发仍只到 `dispatched`，未获得匹配 native receipt 前 `confirmsRead=false`。

## Documentation Impact

实际分类为 `requirement-canonical + project-current + task-only`。因为没有可编辑的 Mirasim 仓库，本次没有扩展为 cross-repository write；外部原生接口仍是明确未运行门禁。

## Task Documentation Sync Group

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:codex-tab-boundary-optimization",
  "group_owner": "vibe/specs/260823/codex-tab-boundary-optimization/spec.md",
  "documents": [
    "vibe/specs/260823/codex-tab-boundary-optimization/raw-requirement.md",
    "vibe/specs/260823/codex-tab-boundary-optimization/spec.md",
    "vibe/specs/260823/codex-tab-boundary-optimization/plan.md",
    "vibe/specs/260823/codex-tab-boundary-optimization/tasks.md",
    "vibe/specs/260823/codex-tab-boundary-optimization/verify.md",
    "vibe/specs/260823/codex-tab-boundary-optimization/handoff.md",
    "vibe/specs/260823/codex-tab-boundary-optimization/changes.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/requirements/README.md",
    "vibe/specs/requirements/conflict-register.md",
    "vibe/specs/requirements/coverage.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/requirements/modules/engineering-invariants.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167-clause-001.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167-clause-002.md",
    "vibe/specs/requirements/codex-quick-task-view-raw-167-clause-003.md",
    "vibe/specs/requirements/shared-raw-163-clause-055.md",
    "vibe/specs/requirements/shared-raw-164-clause-061.md",
    "vibe/specs/requirements/shared-raw-164-clause-064.md",
    "vibe/specs/requirements/shared-raw-176.md",
    "vibe/specs/requirements/shared-raw-177.md",
    "vibe/specs/requirements/invariants-raw-177-clause-001.md",
    "vibe/specs/requirements/shared-raw-177-clause-002.md",
    "vibe/specs/requirements/shared-raw-177-clause-003.md",
    "vibe/specs/source-anchors/README.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/rules/README.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "vibe/specs/source-anchors/catalog.json",
    "public/runtime-identity.cjs",
    "src/platform/eypcPlatform.ts",
    "src/domain/companionProvider.ts",
    "src/domain/codex.ts",
    "src/runtime/codexController.ts",
    "preload/index.js",
    "preload/companion/open-handoff.cjs",
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/navigation.cjs"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "tests/platform/eypcPlatform.test.ts",
    "tests/platform/companionNavigationBridge.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/runtime/codexController.test.ts",
    "tests/ui/codexCompanion.test.ts"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260823/codex-tab-boundary-optimization",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/requirements",
    "vibe/specs/source-anchors",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/rules/README.md",
    "src/help/guides/codex.md"
  ]
}
```
