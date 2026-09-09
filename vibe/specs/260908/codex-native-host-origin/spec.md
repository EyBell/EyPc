# Spec：区分 Codex Host 与原生 Codex，并用官方连接器补原生空 Turn

spec_id: `SPEC-260908-CODEX-NATIVE-HOST-ORIGIN`
Tool: cursor
Date: 2026-09-08
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L253)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260908-codex-native-host-origin`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260908-codex-native-host-origin",
  "group_owner": "vibe/specs/260908/codex-native-host-origin/spec.md",
  "documents": [
    "vibe/specs/260908/codex-native-host-origin/raw-requirement.md",
    "vibe/specs/260908/codex-native-host-origin/spec.md",
    "vibe/specs/requirements/shared-raw-218.md",
    "vibe/specs/requirements/shared-raw-217.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/codex-native-active-empty-turns-not-nonconversation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "src/domain/companionPresentation.ts",
    "preload/index.js",
    "tests/domain/companionPresentation.test.ts",
    "tests/platform/codexAppServerBridge.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260908/codex-native-host-origin",
    "vibe/specs/requirements/shared-raw-218.md",
    "vibe/specs/requirements/shared-raw-217.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/error-memory/codex-native-active-empty-turns-not-nonconversation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "src/help/guides/codex.md",
    "src/domain/companionPresentation.ts",
    "preload/index.js",
    "tests/domain/companionPresentation.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "vibe/specs/source-anchors/catalog.json"
  ]
}
```

## Explicit non-goals

- 不修 Codex Host 会合点，也不读取 `codexhost launch` 进程的 token/endpoint。
- 不新增第四个 Companion Provider，不按 Harness 各建一套 companion。
- 不改 RAW-215 置顶分组相对状态分组的语义。
- 不从空闲空 `turns/list` 发明已完成或未读。

## Requirement Delta

- Add: 任务行 Host 额外进程标 `XH` /「归属 Codex Host」；原生 Codex 仍 `CX`。
- Add: 原生官方 `active` 且 `thread/turns/list` 为空时合成 `inProgress`，进入库存。
- Unchanged: 三个 Provider；Host 行继续合成 Turn；idle 空页仍 `nonConversation`。

## Design

[companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L238) `resolveCompanionRowMarker` 在 Codex 且库存卡带 `codexhostHarnessId` 时输出 `XH`。Host 身份仍由 [codexhostExternalIdentity](../../../../preload/codex/codexhost-discovery.cjs#L87) 打到公开线程，[codex.ts](../../../../src/domain/codex.ts#L1979) 与 `projectCanonicalCard` 原样带上卡片。

[index.js](../../../../preload/index.js#L9439) `codexNativeConnectorLiveTurn` 只对非 Host、官方 `status.type === 'active'` 且有 `recencyAt`/`updatedAt` 的空 `turns/list` 合成 `{ status: 'inProgress', startedAt }`。[readOne](../../../../preload/index.js#L9612) 在空页走该路径；idle 空页仍标 `nonConversation`。Host 行不进官方 turn 读，继续用 discovery 合成 Turn。

## VerificationImpactTrace

- Changed behavior: Float 任务行 Host/原生标记；原生官方 active 空 Turn 不再从库存消失。
- Direct consumers: `FloatApp.vue` 第二行标记；Codex 库存 `lastTurnStatus`。
- Focused evidence: `companionPresentation`、`codexAppServerBridge` 新例 + 既有 idle 空 Turn 回归。
- Not selected: 全量 `pnpm test`；Host 会合点；置顶分组。
- Host identity: `host-1506c34de538d54e1a2b / renderer-5f69c5d47a0476037656`，builtAt `2026-09-08T05:54:42.644Z`（北京时间 `2026/09/08 13:54:42`）。真机区分与原生空 Turn 状态待用户重载 uTools。
