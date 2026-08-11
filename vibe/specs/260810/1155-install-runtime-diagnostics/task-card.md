# RAW-160 Plan 生命周期与按变化发布 — Controlled Task Card

Date: 2026-08-11
Status: `implementation-landed / full-automated-verified / artifact-ready / installed-host-pending`
Documentation level: `controlled`

本任务沿用 RAW-159 的 Controlled 任务树和稳定同步组；RAW-159 的库存、归档事务、诊断、Runtime Identity 与分页成果作为 V4 基础保留，不另建重复任务。

## Task Documentation Sync Group

- Group key: `dsg:eypc:install-runtime-diagnostics-v2`（稳定键不随协议升级改名）
- Group owner: this `task-card.md`
- Scope: Codex/Claude 任务证据、Canonical 状态、Plan 生命周期、暂停/恢复/执行、时间窗口、角标/循环、Latest Package 缓存、Float applied ACK、归档结果与诊断。
- Shared-file ownership: 保留同一工作树内全部用户修改；不触碰用户的 `_to_delete/`。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:install-runtime-diagnostics-v2",
  "group_owner": "vibe/specs/260810/1155-install-runtime-diagnostics/task-card.md",
  "documents": [
    "AGENTS.md",
    "CLAUDE.md",
    "vibe/rules/documentation.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/task-card.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/raw-requirement.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/spec.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/plan.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/tasks.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/verify.md",
    "vibe/specs/260810/1155-install-runtime-diagnostics/handoff.md",
    "vibe/specs/260718/1148-codex-quota-float/raw-requirement.md",
    "vibe/specs/260718/1148-codex-quota-float/spec.md",
    "vibe/specs/260718/1148-codex-quota-float/plan.md",
    "vibe/specs/260718/1148-codex-quota-float/tasks.md",
    "vibe/specs/260718/1148-codex-quota-float/verify.md",
    "vibe/specs/260718/1148-codex-quota-float/handoff.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/rules/README.md",
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/codex-completion-transition-hysteresis.md",
    "vibe/knowledge/error-memory/codex-preload-capability-version-skew.md",
    "vibe/knowledge/error-memory/codex-provider-status-display-normalization.md",
    "vibe/knowledge/error-memory/codex-task-count-list-projection-divergence.md",
    "vibe/knowledge/error-memory/codex-task-state-version-skew-must-degrade-atomically.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "vibe/knowledge/error-memory/companion-consumer-cache-and-float-applied-ack.md",
    "vibe/knowledge/error-memory/claude-new-phase-must-outrank-previous-cache.md",
    "vibe/knowledge/error-memory/companion-observation-generation-is-not-semantic-revision.md",
    "vibe/knowledge/error-memory/independent-authorities-coupled-by-full-refresh.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/utools-developer-tools-project-list-loading.md",
    "vibe/knowledge/error-memory/watcher-callback-latency-is-not-end-to-end-publication-latency.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/raw-requirement.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/spec.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/plan.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/tasks.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/verify.md",
    "vibe/specs/260807/claude-code-companion-authority-reset/handoff.md",
    "src/help/guides/codex.md",
    "src/help/guides/settings.md"
  ],
  "dependencies": [
    "preload/claude/archive.cjs",
    "preload/index.js",
    "preload/float.js",
    "preload/companion/navigation.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/task-kernel.cjs",
    "src/domain/codex.ts",
    "src/domain/companionProvider.ts",
    "src/domain/companionTaskPackage.ts",
    "src/platform/eypcPlatform.ts",
    "src/runtime/appRuntime.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "scripts/utools-runtime-identity.mjs"
  ],
  "validators": [
    "tests/domain/codex.test.ts",
    "tests/domain/companionTaskPackage.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/platform/codexFloatWindowBridge.test.ts",
    "tests/platform/companionTaskActionsBridge.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/eypcPlatform.test.ts",
    "tests/platform/runtimeIdentity.test.ts",
    "tests/runtime/claudeCompanionController.test.ts",
    "tests/runtime/codexController.test.ts",
    "tests/ui/codexCompanion.test.ts",
    "scripts/validate-utools-runtime.mjs"
  ],
  "git_scope_prefixes": [
    "preload",
    "public",
    "scripts",
    "src",
    "tests",
    "vibe/specs/260810/1155-install-runtime-diagnostics",
    "vibe/specs/260718/1148-codex-quota-float",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge",
    "vibe/rules/README.md"
  ]
}
```

## Requirement Change Review

| 类型 | 旧条款或缺口 | RAW-160 当前处置 |
| --- | --- | --- |
| supersede | 任意 exact interrupted 立即 stopped | 普通中断须 idle 复核；Plan 中断须确认无更新 Turn、活动或等待；冲突时保留稳定态并 `verifying` |
| supersede | 任意新 Turn 清除 Plan | 只有确切非 Plan/default 执行 Turn、明确放弃、完成、归档或移除清除 `planReady` |
| supersede | Plan-ready 使用普通隐藏 | 使用持久化 Plan 暂停；旧隐藏且仍可证明 Plan-ready 的任务幂等迁移 |
| supersede | stopped 全部退出通用循环 | 仅 `stopped + planReady + !paused` 进入既有 Plan 层并突破动态小时窗口 |
| supersede | Kernel no-op 足以阻止重复 UI | Kernel、Host、Main、Float、Navigation、Actions 各自缓存 revision/selector 指纹 |
| supersede | Float snapshot-send 即 UI 已更新 | 使用 `received/applied/rejected` ACK；500ms 重发一次，1s 后按健康心跳受控重建 |
| supersede | Renderer/Controller/Preload 分别裁决状态 | Provider 只归一化证据，V4 Kernel 独占 phase、Plan、分组、计数、循环、可见性与能力 |
| add | Plan 生命周期 | `planReady / planLifecycleRevision / paused`，并明确生成、修改、确认、中断、执行与清除因果 |
| add | Plan 操作 | 四槽 `顶/暂/归/执`、`顶/恢/归/执`，批量暂停/恢复和抽屉内新会话 |
| add | 安全执行原 Plan | Actions v2 两击确认、single-flight、能力探测、open→resume→start、完整 CollaborationMode 对象、indeterminate 定向复读 |
| add | Claude 状态新证据优先 | 新 `session.phase` 与 phaseRevision/statusEnteredAt/unread/capabilities 原子更新，旧缓存不得反压 |
| retain | RAW-159 基础 | 无固定库存上限、Codex 全分页、归档事务、Runtime Identity、诊断、semantic no-op 均保留并升级 |
| retain | Claude 归档成功边界 | 只确认 EyPc 元数据与活动库存收敛；提示明确原生侧栏未确认/当前不支持 |
| exclude | 强制 Claude 原生侧栏同步 | 禁止 AX/JXA、私有 IPC、LevelDB 写入、重启与 UI 自动化 |

RAW-142、RAW-150 与 RAW-159 仅上述冲突条款被取代；其余已验证基础和历史事实保留。

## Acceptance Boundary

1. 受影响全链、全库测试、类型检查、生产构建、Preload 镜像、Runtime Identity、uTools validator、静态所有权和文档链接审计必须整体通过。
2. 真实 uTools 同一安装包验收是独立宿主门禁；未完成前状态保持 `installed-host-pending`。
3. 真实“执”会启动一个 Codex Turn，真实 Claude 归档会写 App 本地元数据；二者必须分别取得用户明确授权，本轮自动化只使用假 App Server/夹具。

详细合同见 [raw requirement](raw-requirement.md#L1)、[spec](spec.md#L1)、[tasks](tasks.md#L1)、[verification](verify.md#L1) 和 [handoff](handoff.md#L1)。
