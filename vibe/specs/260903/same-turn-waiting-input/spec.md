# Spec：同一 Turn 仍进行中的精确提问公开为待输入

spec_id: `SPEC-260903-SAME-TURN-WAITING-INPUT`
Tool: cursor
Date: 2026-09-03
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-verified-codex-questions`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L260)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260903-same-turn-waiting-input`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260903-same-turn-waiting-input",
  "group_owner": "vibe/specs/260903/same-turn-waiting-input/spec.md",
  "documents": [
    "vibe/specs/260903/same-turn-waiting-input/raw-requirement.md",
    "vibe/specs/260903/same-turn-waiting-input/spec.md",
    "vibe/specs/260903/same-turn-waiting-input/changes.md",
    "vibe/specs/requirements/shared-raw-207.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/companion/task-kernel.cjs",
    "preload/index.js",
    "tests/platform/companionTaskKernel.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-committed-preload-mirrors.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-preload-entry-budget.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260903/same-turn-waiting-input",
    "vibe/specs/requirements",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/source-anchors",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/companion-plan-lifecycle-and-interrupted-causality.md",
    "src/help/guides/codex.md",
    "preload/companion/task-kernel.cjs",
    "preload/index.js",
    "public",
    "tests/platform/companionTaskKernel.test.ts",
    "scripts/validate-preload-entry-budget.mjs"
  ]
}
```

## Design

- [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1139)：`applyInteractionProjection` 在存在打开 interaction 时投影待输入/待确认，不再因 `activityPhase === running` 短路。
- 同文件 `AGGREGATE_LIVE_PHASE_PRIORITY`：`waiting-approval > waiting-input > running`。
- [index.js](../../../../preload/index.js#L11767)：`companionCursorEvidenceV7` 把 `observation.interactionKind` 传入合成 interaction bundle。

## Cross-provider对照

| 来源 | 同 Turn 提问形态 | 本轮 | 结果 |
| --- | --- | --- | --- |
| Codex 原生 | Questions / `request_user_input` | Kernel 不再丢 running 上的打开 interaction | 待输入 |
| Cursor | AskQuestion / `hasBlockingPendingActions` | 补传 kind；Kernel 同上 | 待输入 |
| Claude | AskUserQuestion | reducer 已写 `waiting-input`，不改 | 保持 |
| CodexHost | `attention=input` | 已打 waiting 旗标，不改 | 保持 |

## Verification

- 聚焦 `companionTaskKernel` `99/99`：running+interaction → 待输入/待确认（Codex user-input / Codex approval / Cursor user-input）；running 根 + waiting-input 子 → 根待输入；源合同禁止 `if (basePhase === 'running')` 并要求 Cursor 合成 bundle 带 `kind`；既有 running↔waiting 无 completed-unread 帧回归仍在。
- `sync:preloads`、mirrors `83` 对、typecheck、production/uTools build、`validate:requirements`、`validate:error-memory`、入口预算 `14360 / 278 / 157` 通过。产物 `host-54f70c4e38b814975ea9 / renderer-b8d619d611e9d6704b97`。
- 真机（用户重载 uTools）：Codex Questions 卡从进行中进入待输入，F-1-a 已核验。Cursor AskQuestion / Plan 阻塞待决未在本轮点名。
