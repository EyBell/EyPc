# Codex Companion v3 统一改造 — Controlled Task Card

Date: 2026-08-10
Status: `implementation-landed / full-automated-verified / artifact-ready / installed-host-pending`
Documentation level: `controlled`

## Task Documentation Sync Group

- Group key: `dsg:eypc:install-runtime-diagnostics-v2`（沿用既有稳定键，不因协议升级改名）
- Group owner: this `task-card.md`
- Scope: Codex 状态、任务库存、Canonical Package、缓存、快捷键、跳转、归档事务与明文运行诊断日志 v3。
- Exclusion: Claude/Cloud 状态和归档行为不在本轮修改范围；只保持统一 Provider 接口兼容。
- Shared-file ownership: 保留同一工作树内全部用户修改和既有 Claude 增量，不回滚、不重新归属。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:install-runtime-diagnostics-v2",
  "group_owner": "vibe/specs/260810/1155-install-runtime-diagnostics/task-card.md",
  "documents": [
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
    "vibe/knowledge/error-memory/README.md",
    "vibe/knowledge/error-memory/claude-generic-session-end-must-not-overwrite-completion.md",
    "vibe/knowledge/error-memory/codex-app-server-session-state-survives-exit.md",
    "vibe/knowledge/error-memory/codex-explicit-archive-event-bypasses-inventory-quarantine.md",
    "vibe/knowledge/error-memory/codex-fixed-debounce-delays-terminal-confirmation.md",
    "vibe/knowledge/error-memory/codex-inventory-dropout-is-not-task-deletion.md",
    "vibe/knowledge/error-memory/codex-pending-user-request-overrides-idle-runtime.md",
    "vibe/knowledge/error-memory/codex-stale-live-active-needs-completion-order.md",
    "vibe/knowledge/error-memory/codex-task-count-list-projection-divergence.md",
    "vibe/knowledge/error-memory/companion-observation-generation-is-not-semantic-revision.md",
    "vibe/knowledge/error-memory/independent-authorities-coupled-by-full-refresh.md",
    "vibe/knowledge/error-memory/utools-onpluginout-hidden-vs-process-exit.md",
    "vibe/knowledge/error-memory/watcher-callback-latency-is-not-end-to-end-publication-latency.md",
    "vibe/knowledge/error-memory/modules/claude-companion.md",
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
    "preload/diagnostics.cjs",
    "preload/index.js",
    "preload/float.js",
    "preload/companion/navigation.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/task-kernel.cjs",
    "src/domain/companionTaskPackage.ts",
    "src/domain/state.ts",
    "src/platform/eypcPlatform.ts",
    "src/runtime/action/actionRuntime.ts",
    "src/runtime/appRuntime.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "scripts/probe-eypc-diagnostics-runtime.mjs",
    "scripts/utools-runtime-identity.mjs"
  ],
  "validators": [
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/platform/runtimeDiagnostics.test.ts",
    "tests/platform/runtimeDiagnosticsLevelContract.test.ts",
    "tests/platform/runtimeDiagnosticsProbe.test.ts",
    "tests/runtime/codexController.test.ts",
    "scripts/validate-utools-runtime.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260810/1155-install-runtime-diagnostics",
    "vibe/specs/260718/1148-codex-quota-float",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/error-memory",
    "vibe/specs/260807/claude-code-companion-authority-reset",
    "src/help/guides/codex.md",
    "src/help/guides/settings.md"
  ]
}
```

## Requirement Change Review

| 类型 | 条款 | 处置 |
| --- | --- | --- |
| supersede | Host、Renderer 和 Provider 分别解释状态 | 由 `companion-task-kernel-v3 / package-v3` 单一 Reducer 与原子包取代 |
| supersede | 未确认 interrupted/failed 一律回退 running | 保留最后稳定态并标记 `verifying`；冷启动冲突只做一次 single-flight 精确 Turn 读取 |
| supersede | Provider 返回 `archived` 或即时列表缺行即可本地删除 | 由双服务器确认、运行中 Desktop 原生 ACK 和 Kernel commit 的持久化后置条件取代 |
| remove | 固定 40 条、任意产品级总任务上限 | 全部删除；Codex `limit=100` 只作为分页大小并遍历 cursor |
| add | observation generation 与 semantic revision 分离 | 等价证据成为完整 no-op，不发布包、不发 Float/focus、不重算角标 |
| add | 新 Codex membership 立即展示 | 先建立稳定 key 的最小卡片，再定向补齐标题和项目 |
| add | 所有用户操作用 operationId 串联 | 卡片、Quick Jump、全局/本地快捷键、循环、归档与自动恢复进入统一日志合同 |
| add | `eypc-runtime-diagnostics-v3` | 明文 JSONL、显式等级、默认 debug、用户选择永久保留、归档十阶段专项日志和聚合探针 |
| retain | 内容安全边界 | 不落盘提示词、对话/结果正文、命令参数、stdout/stderr、凭据、令牌、堆栈或隐藏推理 |
| exclude | Claude/Cloud 行为优化 | 本轮不改状态和归档语义，仅维持 Provider 接口兼容 |

## Acceptance Boundary

1. 当前源码实现、自动化、生产构建、Preload 镜像、Runtime Identity 和 uTools validator 必须整体通过。
2. 真实 uTools 同一安装包验收是独立宿主门禁；未完成前不得宣称整项完成。
3. 宿主验收不得以重启、手动刷新或日志“包发送成功”替代真实状态、库存和原生归档结果。

详细合同见 [raw requirement](raw-requirement.md#L1)、[spec](spec.md#L1)、[tasks](tasks.md#L1)、[verification](verify.md#L1) 和 [handoff](handoff.md#L1)。
