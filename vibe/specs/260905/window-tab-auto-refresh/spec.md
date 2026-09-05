# Spec：窗口跳转 Tab 重启后自动刷新

spec_id: `SPEC-260905-WINDOW-TAB-AUTO-REFRESH`
Tool: grok
Date: 2026-09-05
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L192)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260905-window-tab-auto-refresh`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260905-window-tab-auto-refresh",
  "group_owner": "vibe/specs/260905/window-tab-auto-refresh/spec.md",
  "documents": [
    "vibe/specs/260905/window-tab-auto-refresh/raw-requirement.md",
    "vibe/specs/260905/window-tab-auto-refresh/spec.md",
    "vibe/specs/260904/window-unique-app-rebind/raw-requirement.md",
    "vibe/specs/260904/window-unique-app-rebind/spec.md",
    "vibe/specs/requirements/windows-raw-213.md",
    "vibe/specs/requirements/windows-raw-208.md",
    "vibe/specs/requirements/modules/window-jump.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "src/help/guides/windows.md",
    "vibe/rules/README.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/code-map/modules/feature-module.md",
    "vibe/knowledge/code-map/flows/windows.md",
    "vibe/knowledge/error-memory/window-jump-spoken-as-inserted-window.md",
    "vibe/knowledge/error-memory/modules/window-jump-and-native-host.md"
  ],
  "dependencies": [
    "src/runtime/appRuntime.ts",
    "src/runtime/feature/windows/actions.ts",
    "src/runtime/feature/featureActionHost.ts",
    "src/App.vue",
    "src/pages/WindowsPage.vue",
    "tests/runtime/action.test.ts",
    "tests/runtime/featureModule.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260905/window-tab-auto-refresh",
    "vibe/specs/260904/window-unique-app-rebind",
    "vibe/specs/requirements/windows-raw-213.md",
    "vibe/specs/requirements/windows-raw-208.md",
    "vibe/specs/requirements/modules/window-jump.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "src/help/guides/windows.md",
    "vibe/rules/README.md",
    "vibe/knowledge/developer-soul.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/code-map/modules/feature-module.md",
    "vibe/knowledge/code-map/flows/windows.md",
    "vibe/knowledge/error-memory/window-jump-spoken-as-inserted-window.md",
    "vibe/knowledge/error-memory/modules/window-jump-and-native-host.md",
    "src/runtime/appRuntime.ts",
    "src/runtime/feature/windows/actions.ts",
    "src/runtime/feature/featureActionHost.ts",
    "src/App.vue",
    "src/pages/WindowsPage.vue"
  ]
}
```

## Requirement Delta

- Add: 窗口跳转 Tab 在会话冷启动时自动加载清单。
- Refine: RAW-208「进 Tab 不自动 list」收窄为「同会话再进不重复全扫」。
- Unchanged: 无后台 poller；槽位缓存命中不 list。

## Requirement Change Review

- Conflict classification: `compatible-update`.
- Decision status: `explicit-current-request`（用户纠正对象是窗口跳转 Tab）。

## Prior Task Overlap

- RAW-208 unique rebind 仍在 `refreshWindows({ adoptUnique: true })` 上跑。
- RAW-212 悬浮球重建是误路由，代码保留，不作为本条验收。

## Implementation Sync

- `ensureWindowsInventory()`：功能关闭 / 已加载 / 加载中则跳过，否则 `refreshWindows()`。
- 进 Tab 且未显式 `refreshWindows: true` 时走 ensure；插件挂载在功能开启时也 ensure。
- 显式刷新仍走 `refreshWindows`（含 `Ctrl+R`）。

## Verification

- Focused: `action.test.ts` + `featureModule.test.ts` + `windowsDiagnostics.test.ts` `219/219`。
- 真机：启用窗口跳转后重载，进入 Tab 应已有列表，不必先点「加载」。

## Explicit non-goals

- 不后台轮询。
- 不在每次切 Tab 已有缓存时再扫。
- 不把悬浮球当成本条验收。

## Closeout

- 聚焦 `219/219` 与 production/uTools build 已过。产物 `host-2c8c2fd1b6b80a32e59b / renderer-fb0a45dc036eb2d3c5fb`。用户确认窗口跳转 Tab 冷启动已自动有列表。偏好规则 `EYPC-WINDOW-SPOKEN-001` 与 soul / 架构口径已同轮同步。
