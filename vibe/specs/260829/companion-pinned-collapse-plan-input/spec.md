# Spec：置顶折叠稳定顺序、当前交互切换与构建身份可见性

spec_id: `SPEC-260829-COMPANION-PINNED-COLLAPSE-PLAN-INPUT`
Tool: codex
Date: 2026-08-29
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L250)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260829-companion-pinned-collapse-plan-input`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260829-companion-pinned-collapse-plan-input",
  "group_owner": "vibe/specs/260829/companion-pinned-collapse-plan-input/spec.md",
  "documents": [
    "AGENTS.md",
    "vibe/rules/README.md",
    "vibe/rules/documentation.md",
    "vibe/specs/260829/companion-pinned-collapse-plan-input/raw-requirement.md",
    "vibe/specs/260829/companion-pinned-collapse-plan-input/spec.md",
    "vibe/specs/260829/companion-pinned-collapse-plan-input/changes.md",
    "vibe/specs/requirements/shared-raw-189.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/requirements/conflict-register.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/requirements/README.md",
    "vibe/specs/source-anchors/README.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/error-memory.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "vibe/specs/source-anchors/catalog.json",
    "preload/companion/task-kernel.cjs",
    "public/companion/task-kernel.cjs",
    "preload/index.js",
    "preload/float.js",
    "public/preload.js",
    "public/float-preload.js",
    "preload/codex/desktop-request-projection.cjs",
    "public/codex/desktop-request-projection.cjs",
    "preload/codex/desktop-activity-aggregation.cjs",
    "public/codex/desktop-activity-aggregation.cjs",
    "preload/codex/rollout-evidence.cjs",
    "public/codex/rollout-evidence.cjs",
    "contracts/companion-v7.schema.json",
    "preload/companion/contracts-v7.cjs",
    "public/companion/contracts-v7.cjs",
    "src/domain/generated/companionContractsV7.ts",
    "src/FloatApp.vue",
    "src/pages/CodexPage.vue",
    "src/platform/eypcPlatform.ts",
    "src/styles/float.css",
    "package.json",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "tsconfig.json",
    "scripts/utools-runtime-identity.mjs",
    "scripts/eypc-core-version.mjs",
    "scripts/prepare-utools-runtime.mjs",
    "public/runtime-identity.cjs"
  ],
  "validators": [
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "tests/platform/runtimeIdentity.test.ts",
    "tests/unit/preloadEntryBudget.test.ts",
    "scripts/validate-preload-entry-budget.mjs",
    "scripts/validate-utools-runtime.mjs",
    "scripts/generate-companion-contracts.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-committed-preload-mirrors.mjs",
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs"
  ],
  "git_scope_prefixes": [
    "preload/companion/task-kernel.cjs",
    "preload/index.js",
    "preload/float.js",
    "preload/codex/desktop-request-projection.cjs",
    "public/codex/desktop-request-projection.cjs",
    "preload/codex/desktop-activity-aggregation.cjs",
    "public/codex/desktop-activity-aggregation.cjs",
    "preload/codex/rollout-evidence.cjs",
    "public/codex/rollout-evidence.cjs",
    "contracts/companion-v7.schema.json",
    "preload/companion/contracts-v7.cjs",
    "public/companion/contracts-v7.cjs",
    "src/domain/generated/companionContractsV7.ts",
    "src/FloatApp.vue",
    "src/pages/CodexPage.vue",
    "src/platform/eypcPlatform.ts",
    "src/styles/float.css",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "tests/platform/runtimeIdentity.test.ts",
    "tests/unit/preloadEntryBudget.test.ts",
    "scripts/validate-preload-entry-budget.mjs",
    "scripts/validate-utools-runtime.mjs",
    "vibe/specs/260829/companion-pinned-collapse-plan-input",
    "vibe/specs/requirements/shared-raw-189.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/requirements/conflict-register.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "vibe/specs/source-anchors/catalog.json",
    "src/help/guides/codex.md"
  ]
}
```

## Requirement Delta

- Change: pinned 分组改用显式本地置顶序，并新增 session-local 折叠标题；可见快捷编号在「折叠标题一个展开目标 / 展开任务行」之间动态重算。
- Change: terminal task 上任何精确当前 interaction 均先于 unread：普通输入与 Plan 请求投影为待输入，审批投影为待确认；bare request-array disappearance 不再被当作 Plan 关闭证据。
- Change: 旧 Plan 后的更新 default Turn 只有在结构化 `fileChange/patch_apply` 时写 `cleared/execution-start`；真实完成不再被旧 artifact 覆盖，纯补充 Turn 仍保留 Plan。
- Change: Runtime Identity handshake 增量公开当前 Host artifact 的 `artifactState/builtAt/builtAtLocal/packageVersion`；Codex「运行」页以「当前宿主产物」展示该时间，并在 identity 不一致时明确要求重载。
- Preserve: 因果更新的 running 第一优先、未读私有保留、attention 稳定轮次、通用循环、命令 ID 与 Snapshot 线形；移除的是普通 interaction 的旧 unread 屏障与中间完成帧。
- Privacy: 任务文档与诊断不保留截图标题、原始任务身份、Prompt、request body 或 transcript。

## Design

Kernel 的 `pinned` group 单独使用 `displayOrder` 比较器。Codex/Claude/Cursor Adapter 从同一份本地 `pinOrder` 投影根任务 `displayOrder`；Provider metadata 只能作为无显式顺序时的稳定并列，不再移动已有本地置顶项。`completedUnread` 的零未读兜底直接复用这份已排序分组。

Float 只在会话内保存 pinned 展开状态。快速编号从可见的可执行 RenderRow 派生：展开时任务行参加，折叠时任务行不渲染、标题作为唯一 `expand-status` 目标参加。快捷触发标题只反转折叠状态并保留快速模式；下一次响应式计算按展开后的可见任务重新编号。`Alt+F` 的 task-only selector 不包含标题。

Bridge 在 snapshot/patch 写入 request-set tombstone 之前保留仍因果开放的 Plan 请求：bare empty replacement 不推进 request-set authority，也不触发 removed-request terminalization。匹配 resolved、更新 Turn、execution-start 或 runtime 变为 plain-active 仍使用既有精确清除通路。Kernel 先让因果更新的 running 胜出；terminal 上任何精确当前普通输入、审批、Plan choice/implementation 都越过 unread 屏障，根聚合仍保留各自 subtype，interaction 关闭后才重新显露未读。

Desktop parent aggregation 只负责在同一匿名父任务内汇合 main/Side 与 App Server authority。调用方已经用统一 live-evidence sequence 判定 App Server running 胜出时，resolver 只采用该 authority 自带的 connector waiting flags；较旧 Desktop refollow/sticky-shadow waiting flags 与其时间戳不得捐赠给新 running epoch。更新的 Desktop interaction 仍可按自己的更高 sequence 正常进入等待。

Rollout Evidence V3 继续只读有界尾部且不发布正文：已完成 Plan 后，更新 default Turn 的 `fileChange` 或 `patch_apply` 是高置信结构化实施边，写入单调 `execution-start` clear；`task_started`、AgentMessage、reasoning 与无文件变更的补充 Turn 不清 artifact。冷库存、热 rollout watcher 与 Kernel 都接收同一 clear revision，避免 refollow 后旧 Plan 再把完成 Turn 投影为 stopped。

Runtime Identity 仍由 production build 生成且只把已受管产物元数据暴露给 Renderer。Main/Float Preload 从自己加载的 `runtime-identity.cjs` 读取打包时间与包版本；Codex 运行页不读取源码时间，也不把磁盘上的新 `dist` 推断为宿主已加载。`dist/runtime-identity.cjs` 是打包侧凭据，handshake 的 `host-loaded/reload-required` 是运行侧凭据。

## Verification Impact Trace

- Changed behavior: V7 Kernel pinned group/interaction projection、Desktop request-set patch reconciliation、Desktop parent activity aggregation、Rollout Evidence V3 artifact clear、Float status-section rendering/quick-index mapping、Main/Float Runtime Identity metadata 与 Codex 运行页展示。
- Direct consumers: 动态置顶列表、`completedUnread` 置顶兜底、三个状态角标/分组、`Alt+数字`、`Alt+F`、普通输入/审批/Plan waiting、后续 running transition、完成执行的最终分组、Codex 配置运行页与最终 `dist` 打包凭据。
- Selected checks: Kernel + Desktop Bridge + Float UI + Runtime Identity 聚焦 Vitest；typecheck；production build；`dist/runtime-identity.cjs` readback；preload mirrors；requirements/source anchors/current truth。
- Not selected: 仓库全量 `verify`、真实 uTools 视觉/快捷键、真实 Codex 原生请求交互；没有全量升级触发。

## Acceptance

聚焦自动化必须同时锁定：置顶显式顺序不被 metadata 改写、显式重排可生效、折叠只留一个展开编号、展开后编号重算并打开正确任务；terminal read/unread 上普通输入、审批与 Plan interaction 分别直接显示待输入/待确认，显式关闭后才恢复真实终态；bare empty request patch 保留 Plan 等待；new Turn/plain-active 清除旧等待；因果更新的 App Server running 不被较旧 refollow waiting 回弹；default Turn 的 fileChange 消费旧 Plan、纯补充 Turn 保留旧 Plan；Runtime Identity 将 build 写入的时间、包版本与 artifact state 原样投影到 Codex 运行页和最终 `dist`。自动化与构建只形成 `artifact-ready`；真实宿主加载与可见状态时延仍是独立验收门禁。

## Local Integration

- 2026-08-30 当前授权：将既有 RAW-188/189 变更按行为分批提交，并合入主目录 `main`；没有推送、安装、重载或工作树清理授权。
- 源分支与目标基线相同：`332ad79122a995d368145ab88e6277873efb1789`。主目录只有生成的 Runtime Identity 时间变更；该本地产物不混入源码提交，合并前后单独检查。
- Sidecar：主线程。只复核当前提交范围、精确祖先关系和既有影响集，不重复实现或扩大测试。
- 当前聚焦回归：Kernel / Desktop Bridge / Float / Runtime Identity `4` 文件、`316/316`；真实宿主、全仓测试与 MQTT 不在本轮核验范围。
- 工作树 production build、语义 typecheck、contracts 与 uTools validator 通过：`EyPc V7 / host-48db44ec89d5ec2cb1ad / renderer-245a3b62ac14db0d7023 / 2026-08-30T10:43:37.135Z`。本轮帮助文案另对齐进程内轮次与精确 Plan 关闭边界，不改变运行逻辑。
- 提交边界：Kernel 状态与 attention、Codex 因果同步、Float 折叠、Runtime Identity 展示、共享文档收尾。生成的 preload 镜像与对应源码同批；源批次不携带工作树构建时间，主目录重建后将受管 Runtime Identity 与当前真值同批同步，构建目录不纳入提交。逐文件范围见 [changes.md](changes.md#L1)。
- 集成完成条件：目标 `main` 包含完整源分支，主目录重新生成生产产物、回写当前真值，并核对六项构建身份；真实 Host 仍需另行授权加载和验收。
- 文档收尾：需求登记与 Source Anchor、`75` 对 preload 镜像、入口预算 `13894 / 273 / 149`、项目错误记录及代码链接均通过；需求登记仍有 `5` 条历史 proposed，本轮未替用户确认。
- 同步范围为任务、PRD、项目状态、架构、技术事实、用户帮助及既有防错记录；未新增全局规则、Skill、DB 记录或个人记忆。工作树保留，清理需要另外决定。

```json worktree-task-v1
{
  "schema": "worktree-task/v1",
  "task_id": "260829-completed-unread-pin-sequence",
  "control_plane": "app-root",
  "target_branch": "main",
  "repositories": [
    {
      "repo_id": "eypc",
      "base_sha": "332ad79122a995d368145ab88e6277873efb1789",
      "worktree_branch": "codex/260829-completed-unread-pin-sequence",
      "task_owner": "vibe/specs/260829/companion-pinned-collapse-plan-input/spec.md",
      "head": "332ad79122a995d368145ab88e6277873efb1789",
      "upstream": null
    }
  ],
  "commit_mode": "verified-milestone",
  "push_mode": "current-message-only",
  "verification_state": "planned",
  "push_state": "not-authorized",
  "integration_state": "not-started",
  "next_action": "complete scoped local batches and verify main integration"
}
```
