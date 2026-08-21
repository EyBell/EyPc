# 快捷键选择器就绪门禁与静默退出诊断

Tool: claude
Date: 2026-08-21
Status: `automated-verified / host-pending`
Documentation level: `standard`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1)

## Task Documentation Sync Group

- Group key: `dsg:eypc:shortcut-selector-readiness-v1`
- Group owner: this `spec.md`
- Scope: 本任务目录、PRD §163、架构 Kernel 段、枢纽该行、选择器错误记忆与既有叶子 occurrence。
- Shared-file ownership: 只改写选择器就绪与静默退出诊断相关段落；其它并行脏改动不属于本任务。
- Sidecar: 主线程；本任务未启用只读 Sidecar。

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:shortcut-selector-readiness-v1",
  "group_owner": "vibe/specs/260821/2045-shortcut-selector-readiness/spec.md",
  "documents": [
    "vibe/specs/260821/2045-shortcut-selector-readiness/raw-requirement.md",
    "vibe/specs/260821/2045-shortcut-selector-readiness/spec.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/selector-readiness-must-not-treat-verifying-phase-as-stale.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/detection-recorded-without-any-repair-path.md",
    "vibe/knowledge/error-memory/new-companion-source-must-register-with-navigation-authority.md",
    "vibe/specs/260818/1335-cursor-companion-feasibility/raw-requirement.md"
  ],
  "dependencies": [
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/index.js",
    "public/companion/task-kernel.cjs",
    "public/companion/task-actions.cjs",
    "public/preload.js",
    "public/runtime-identity.cjs"
  ],
  "validators": [
    "tests/platform/companionTaskKernel.test.ts"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260821/2045-shortcut-selector-readiness",
    "vibe/specs/260818/1335-cursor-companion-feasibility/raw-requirement.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory"
  ]
}
```

## 结论摘要

静默快捷入口（上一个/下一个、待输入、已完成未读、归档当前）被 Kernel 消费后有三条退出既不派发也不写诊断。主因是 [`ensureReady`](../../../../preload/companion/task-kernel.cjs#L2054) 把整包 `freshness !== 'fresh'` 当作过期：一条相位 `unknown` 的 Claude 会话就让每次快捷键进入 5 秒两端冷读，而 RAW-166 失配修复风暴让冷读经常超时。本轮把选择器就绪判据改为**成员完整**（`complete`），把全部静默退出接进运行诊断，修正 `warn` 级别误用，并给修复循环加 30 秒每 provider 冷却。列表点击不受影响的原因是它走精确目标 `open` 路径（fresh 目标短路）。

## Requirement Change Review

见 [raw-requirement.md](raw-requirement.md#L1)：§163 措辞 `changed`（`explicit-current-request`），§152 `unchanged`，`no-conflict`，post-sync rescan `pass`。

## Prior Task Overlap

- Relationship：`extends`——复用 [RAW-152/155 导航权威](../../260718/1148-codex-quota-float/spec.md#L1) 与同日 [Cursor 导航注册轮](../../260818/1335-cursor-companion-feasibility/raw-requirement.md#L80) 的已接受证据；v4 注册在宿主已生效（identity 握手一致），本轮只改就绪门禁与诊断。
- Net delta：Kernel `ensureReady` 选项、四处诊断、`warn` 修正、修复冷却、测试合同替换、`dist/` 重建。
- Traceability：本 spec 为当前 owner；[selector readiness 错误记忆](../../../knowledge/error-memory/selector-readiness-must-not-treat-verifying-phase-as-stale.md#L1) 为失败模式 owner。

## 根因与证据

| 观察 | 证据 | 结论 |
| --- | --- | --- |
| 五次入口被消费后零轨迹 | 诊断 20:22:10–20:27:07 `plugin-enter kernel-consumed` 后无 `navigation`/`task-action open`/错误 | 三条退出不写诊断 |
| 入口触发两端冷读后仍无轨迹 | 20:27:03.265 入口 → 03.900 `cold-preflight {codex,claude}` 635 ms → 03.901 `target-sync`/`task-package-send` | 预检成功也可能因空候选静默；失败更是只剩通知 |
| 包长期 `verifying` | 86 次 Claude `unknown-evidence`；`reconcileTask` 对 unknown 置 `verifying` | 选择器被迫走冷读 |
| 冷读慢 | 两端 p50 2.7 s；修复风暴 259 次 Codex 窄冷读/12 min（max 6.6 s） | 5 秒超时易被击穿 |
| 修复记录全被拒收 | 253 条 `diagnostics-level-missing` 指向 `canonical-mismatch-repair` | `level: 'warn'` 不是显式级别 |
| 桩复现 | 真实 Kernel + stub：verifying + 预检抛错/挂起 → 仅两条通知；无候选 attention / 无目标 archive → 仅一条通知 | 退出路径穷举确认 |

## 变更清单

- [task-kernel.cjs#L2034](../../../../preload/companion/task-kernel.cjs#L2034) `verifyingTaskCount`；[`ensureReady(targetKey, options)`#L2054](../../../../preload/companion/task-kernel.cjs#L2054)：`allowVerifying` 时完整包直接返回；慢路径记录 `task-kernel/ready-preflight` `started`（[#L2069](../../../../preload/companion/task-kernel.cjs#L2069)，`reason: incomplete | exact-target-stale | verifying`）与 `accepted`（[#L2095](../../../../preload/companion/task-kernel.cjs#L2095)）。
- [`dispatch`#L2190](../../../../preload/companion/task-kernel.cjs#L2190)：`cycle` / `open-attention` 传 `allowVerifying`；catch 记录 `ready-preflight failed` + `code`（[#L2215](../../../../preload/companion/task-kernel.cjs#L2215)）。
- [`dispatchAttention`#L2153](../../../../preload/companion/task-kernel.cjs#L2153)：空候选记录 `open-attention no-task`（kind、input/unread 计数、complete/freshness）。
- [`handleEnter`#L2320](../../../../preload/companion/task-kernel.cjs#L2320)：记录 `shortcut-enter`（`featureCode`、cycle/input/unread 计数）与失败 `code`（[#L2343](../../../../preload/companion/task-kernel.cjs#L2343)、[#L2359](../../../../preload/companion/task-kernel.cjs#L2359)；`no-task` 为 info，其余 error）。
- [task-actions.cjs `shortcutArchive`#L475](../../../../preload/companion/task-actions.cjs#L475)：`not-ready`（debug）与 `no-target`（[#L483](../../../../preload/companion/task-actions.cjs#L483)）进 `task-action/archive-shortcut`。
- [preload/index.js#L12080](../../../../preload/index.js#L12080) `COMPANION_MISMATCH_REPAIR_COOLDOWN_MS = 30_000`；[`companionTrackCanonicalMismatch`#L12090](../../../../preload/index.js#L12090)：每 provider 冷却、匹配回归即清除冷却、`suppressedRepairs` 进 details；修复记录改 `level: 'info'`（[#L12123](../../../../preload/index.js#L12123)）。
- [preload/index.js#L12999](../../../../preload/index.js#L12999)：`plugin-enter` 带 `featureCode`（plugin.json 固定标识，非内容）。
- 镜像：`public/preload.js`、`public/companion/task-kernel.cjs`、`public/companion/task-actions.cjs`、`public/runtime-identity.cjs` 经 `pnpm run sync:preloads` / build 同步；`dist/` 重建为 `host-2cb135f5562f2d8b9c67 / renderer-75d7e51cc94b4d7fabb7`。
- 测试：[companionTaskKernel.test.ts#L2022](../../../../tests/platform/companionTaskKernel.test.ts#L2022) 取代旧「degraded retained package 拒绝导航」合同；[#L2066](../../../../tests/platform/companionTaskKernel.test.ts#L2066) 不完整包仍单次共享预检并记录失败；[#L2110](../../../../tests/platform/companionTaskKernel.test.ts#L2110) 变更动作保留精确目标 fresh 门禁；[#L2138](../../../../tests/platform/companionTaskKernel.test.ts#L2138) 入口 code 与 no-task 退出进诊断。
- 文档：[PRODUCT_REQUIREMENTS §163](../../PRODUCT_REQUIREMENTS.md#L163)、[ARCHITECTURE Kernel 段](../../../knowledge/ARCHITECTURE.md#L132)、[PROJECT_STATUS](../../PROJECT_STATUS.md#L1)、[Cursor 轮 raw 指针](../../260818/1335-cursor-companion-feasibility/raw-requirement.md#L80)、两条既有错误记忆的记录历史。

## 验证

| 门禁 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/platform/companionTaskKernel.test.ts` | `66/66` |
| `companionNavigationBridge` + `companionTaskActionsBridge` + `runtimeDiagnosticsLevelContract` + `eypcPlatform` + `runtimeIdentity` | `45/45` |
| `codexAppServerBridge` + `codexFloatWindowBridge`（加载 `preload/index.js` 的桥套件） | 通过（与 `eypcPlatform` 同批 `189` 项中仅镜像未同步时的 3 项失败，`sync:preloads` 后通过） |
| `pnpm run build`（typecheck → vite build → runtime prepare → validate:utools） | 通过，`uTools runtime validation passed` |
| 真实 Kernel 桩复现（修复后） | verifying + 预检抛错/挂起 → 直接派发并记录 `target-selected → open → codex-open`；空候选/无目标 → 记录 `open-attention no-task` / `archive-shortcut no-target` |
| 真实宿主 | **pending**：运行中的进程仍是旧 `host-7842…`，需在 uTools 重新接入 / 重载插件，握手为 `host-2cb1…` 后按快捷键；日志应出现 `shortcut-enter → target-selected → <provider>-open`，或带 `code` 的 `ready-preflight failed` |
| `pnpm run validate:mirrors` | 比较的是已提交状态；本轮未提交，未作为门禁 |

MQTT 套件与全量 `pnpm run test` 未运行（无升级触发器）。

## 未决与后续

1. Codex `h:476c…` Desktop 待输入 vs Kernel 已完成的权威分歧（见 raw §待用户裁决 1）：影响「打开待输入」候选与卡片显示，不在本轮范围。
2. Claude 会话长期 `unknown` 把包钉在 `verifying`（250ms unknown 窗口永不收敛）：不再影响快捷键，但值得单独核验证据源。
3. 失配修复触发判据区分不了「被合法改判」与「真卡住」；冷却是有界止损。
4. 诊断量级：`state-proposal` 每次提交按任务数展开，64 MB 上限只剩约 1 小时历史。
5. 19:44 的 `cycleCount: 1` 是层级合同（仅一张 active 卡）；若用户期望跨层循环，需要改 §152，不属缺陷。

## 文档影响

- `doc_drift`：§163 已同步；ARCHITECTURE、PROJECT_STATUS、Cursor 轮 raw、两条错误记忆已补指针；[codex 帮助指南](../../../../src/help/guides/codex.md#L102) 原文「热包直接使用，冷启动/重连/缺口才预检」与新实现一致，未改。
- 新增错误记忆已登记到 [companion-actions-and-presentation](../../../knowledge/error-memory/modules/companion-actions-and-presentation.md#L1)（Primary）与 [companion-task-state](../../../knowledge/error-memory/modules/companion-task-state.md#L1)（Related）。
