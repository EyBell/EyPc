# Spec：同应用唯一根原地换绑

spec_id: `SPEC-260904-WINDOW-UNIQUE-APP-REBIND`
Tool: cursor
Date: 2026-09-04
Status: `implementation-landed / focused-automated-verified / host-verified`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L188)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260904-window-unique-app-rebind`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260904-window-unique-app-rebind",
  "group_owner": "vibe/specs/260904/window-unique-app-rebind/spec.md",
  "documents": [
    "vibe/specs/260904/window-unique-app-rebind/raw-requirement.md",
    "vibe/specs/260904/window-unique-app-rebind/spec.md",
    "vibe/specs/requirements/windows-raw-208.md",
    "vibe/specs/requirements/modules/window-jump.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/code-map/flows/windows.md",
    "vibe/knowledge/code-map/requirement-module-map.md",
    "vibe/knowledge/error-memory/utools-window-target-auto-rebind-after-restart.md",
    "src/help/guides/windows.md"
  ],
  "dependencies": [
    "src/domain/windows.ts",
    "src/runtime/appRuntime.ts",
    "tests/domain/windows.test.ts",
    "tests/runtime/action.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260904/window-unique-app-rebind",
    "vibe/specs/requirements",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/technical-details.md",
    "vibe/knowledge/code-map",
    "vibe/knowledge/error-memory/utools-window-target-auto-rebind-after-restart.md",
    "src/help/guides/windows.md",
    "src/domain/windows.ts",
    "src/runtime/appRuntime.ts",
    "tests/domain/windows.test.ts",
    "tests/runtime/action.test.ts"
  ]
}
```

## Design

- 领域门禁：[uniqueSameAppRebindLive](../../../../src/domain/windows.ts#L181) 只判断「同应用实例记录唯一 + 实时根唯一 + 非精确命中」。标题不参与。
- Runtime：[tryUniqueSameAppRebind](../../../../src/runtime/appRuntime.ts#L1895) 在门禁通过后，locator 已空、或定点探测不是 `live` / `temporarily-unobserved` 时 `rememberVerifiedWindowTarget` 原地写回。`verified-gone` 仍走清 locator；`indeterminate` 直接覆盖（macOS SkyLight 常无法权威证明死亡）。
- 触发：[refreshWindows](../../../../src/runtime/appRuntime.ts#L1560) 在清单更新后静默换绑（不抢焦点）；[resolveAndActivateWindowTargetForAttempt](../../../../src/runtime/appRuntime.ts#L2135) 在精确未命中后先尝试唯一换绑（即使 `freshOnly`+`partial` 使 candidates 为空），失败且仍有候选才 `confirming`。
- 槽位恢复「新建 replacement target」不用于这条路径，以免拆掉收藏/别名。
- macOS `list()` 仍为 `partial`。不得把 complete 当门禁。

## Residual risk

开机后同应用出现两个新根、其中一个在其他 Space、AX 只看见一个、旧实例探测不是 `live`，会把可见那个绑上。ChatGPT 单窗可接受。Edge 里标题含 ChatGPT 的页与原生 ChatGPT 是不同应用，不会自动换绑。本刀不做 CG 全 Space 根普查。

## Verification

- 聚焦 `tests/domain/windows.test.ts` + `tests/runtime/action.test.ts` + `tests/ui/windowsDiagnostics.test.ts`：`233/233`。
- 覆盖：唯一+gone / 唯一+indeterminate 原地换绑（含 partial 清单、标题不同）；刷新不激活；双实时根 / 双记录 / live 不自动；不同应用不换；编辑中不换；激活失败不写 locator；既有「多窗口仍可手动确认」UI 保留。
- 2026-09-04 宿主确认：只认应用是否唯一存在，不认标签标题；ego lite 单窗可换绑。Edge 槽不会对上原生 ChatGPT。
