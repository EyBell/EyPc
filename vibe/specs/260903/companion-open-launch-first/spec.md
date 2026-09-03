# Spec：跳转前确保目标应用已打开与 CodexHost 启动通路

spec_id: `SPEC-260903-COMPANION-OPEN-LAUNCH-FIRST`
Tool: claude
Date: 2026-09-03
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L254)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260903-companion-open-launch-first`
- Group owner: this `spec.md`
- Excluded unrelated dirty documents: RAW-200 side-chat 一线（同一检出里的并行会话）、`public/` 构建镜像

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260903-companion-open-launch-first",
  "group_owner": "vibe/specs/260903/companion-open-launch-first/spec.md",
  "documents": [
    "vibe/specs/260903/companion-open-launch-first/raw-requirement.md",
    "vibe/specs/260903/companion-open-launch-first/spec.md",
    "vibe/specs/260903/companion-open-launch-first/changes.md",
    "vibe/specs/requirements/shared-raw-202.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/codexhost-plain-cold-start-bypasses-host.md"
  ],
  "dependencies": [
    "preload/companion/open-readiness.cjs",
    "preload/codex/desktop-launch.cjs",
    "preload/index.js",
    "preload/claude/open.cjs",
    "preload/codex/codexhost-discovery.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/navigation.cjs",
    "scripts/utools-preload-assets.mjs",
    "scripts/validate-preload-entry-budget.mjs",
    "src/domain/codex.ts",
    "src/domain/companionProvider.ts",
    "src/domain/companionPresentation.ts",
    "src/domain/codexEnvironmentPresentation.ts",
    "src/pages/CodexPage.vue",
    "src/runtime/appRuntime.ts",
    "src/runtime/codexController.ts",
    "src/platform/eypcPlatform.ts",
    "tests/platform/companionOpenReadiness.test.ts",
    "tests/platform/codexDesktopLaunch.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/domain/codex.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-preload-entry-budget.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260903/companion-open-launch-first",
    "vibe/specs/requirements/shared-raw-202.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/codexhost-plain-cold-start-bypasses-host.md",
    "src/help/guides/codex.md",
    "preload/companion/open-readiness.cjs",
    "preload/codex/desktop-launch.cjs",
    "preload/index.js",
    "preload/claude/open.cjs",
    "preload/codex/codexhost-discovery.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/navigation.cjs",
    "public/",
    "scripts/utools-preload-assets.mjs",
    "scripts/validate-preload-entry-budget.mjs",
    "src/domain/codex.ts",
    "src/domain/companionProvider.ts",
    "src/domain/companionPresentation.ts",
    "src/domain/codexEnvironmentPresentation.ts",
    "src/pages/CodexPage.vue",
    "src/runtime/appRuntime.ts",
    "src/runtime/codexController.ts",
    "src/platform/eypcPlatform.ts",
    "tests/platform/companionOpenReadiness.test.ts",
    "tests/platform/codexDesktopLaunch.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/domain/codex.test.ts"
  ]
}
```

## Requirement Delta

- Add: 统一就绪层 `companion-open-readiness-v1`，在 Host Registry 处包装三个 Provider 的 `open`：探测 → 未运行则启动 → 每 500 ms 轮询至进程出现（≤ 25 秒）→ 软等待就绪（≤ 8 秒）→ 原 opener。超时 / 启动失败 fail-closed（不派发、不清 unread）；探测未知不启动。
- Add: `CodexSettings.openLaunchesTarget`（默认开，缺省即开）与 `CodexSettings.codexhostLaunch: auto | on | off`（默认 `auto`）。
- Add: Codex 启动通路 `preload/codex/desktop-launch.cjs`：CLI / Host 描述符 / 运行中 Desktop 环境（`CODEX_CLI_PATH=…codexhost`、`CODEXHOST_LAUNCHER_PID`）三证据检测、`codexhost launch` detached 启动、`open -b` 普通启动、Host 描述符 + ipc.sock 就绪、codexhost 命令位置解析（手动 > 观察 > 环境变量 > 常见目录 > PATH）与手动路径偏好（`eypc/codex/codexhost-path/v1`）。
- Add: 「运行」页三块：两个开关 + codexhost 位置表单（填写 / 从磁盘选择 / 恢复自动查找）；环境快照 `codexhost` 字段只带标签。
- Change: Claude opener 接受注入的 `pgrep -x Claude` 作为在运行权威（窗口清单空 / 无权限时）；仍不自行启动。
- Change: 回执可附 `launch { outcome, launcher, waitedMs }`；`companion-open-handoff-v1` 不变，深链仍不构成已读。
- Pending decisions: 无。

Acceptance:

1. 目标应用在运行：回执与今天完全一致，无 `launch` 字段，无诊断。
2. 目标应用未运行：启动 → 进程出现 → 就绪 → 派发；回执 `launch.outcome = launched`，消息前缀「已启动 X，」。
3. 25 秒内进程未出现：`failed / launch-timeout`，opener 未被调用。
4. CodexHost 有效且找不到 codexhost 命令：`unavailable / codexhost-cli-missing`，不启动。
5. CodexHost 有效且 Desktop 已在运行：不调 `codexhost launch`，直接深链。
6. `codexhost launch` 非零退出：`failed / codexhost-launch-refused`，消息带 launcher 首行。
7. 开关关闭：不探测、不启动，只发深链。
8. Claude：清单空但 `pgrep` 为真 → 派发；`pgrep` 为假 → 「Claude 桌面端未在运行」；探针失败且清单受阻 → 「无法确认」。
9. 会合点解析到 `CODEXHOST_CLI_PATH` 时记入观察路径；手动路径优先且无效时阻断自动查找。

## VerificationImpactTrace

- Changed surface: Host Registry `open` 包装、Claude 在运行判定、回执 `launch` 透传、Codex 环境快照新字段、设置归一化、「运行」页新增行、入口棘轮。
- Direct consumers: `task-actions.open` → Kernel `open` 命令；Renderer `openThread` 消息；配置页。
- Focused tests: `tests/platform/companionOpenReadiness.test.ts`（12）、`tests/platform/codexDesktopLaunch.test.ts`（12）、`tests/platform/claudeBridge.test.ts`、`tests/platform/codexhostDiscovery.test.ts`、`tests/platform/companionTaskActionsBridge.test.ts`、`tests/platform/companionNavigationBridge.test.ts`、`tests/domain/codex.test.ts`、`tests/platform/codexAppServerBridge.test.ts`（165，沙箱 `pgrep -x` 改答 pid）、`tests/platform/codexActionRuntime.test.ts`、`tests/platform/cursorOpen.test.ts`、`tests/ui/codexCompanion.test.ts`（60，1 例 RAW-201 额度提示文案在 HEAD 已失败，与本任务无关）。
- Not selected: 仓库级 `pnpm test`、MQTT、真实 uTools。
- Identity: preload 变更，`pnpm run build` + `validate-requirements --write-current-truth`。

## Implementation Sync

Desired behavior: 打开任务前保证目标应用在运行；CodexHost 接管的 Codex 经 `codexhost launch` 起并等 Host 就绪后才发深链；Claude / Cursor 用 `open -b` 起并等进程与窗口。Provider 无关的就绪层在 Host Registry 处包装 `open`，provider 差异只在注入的策略里。

## Closeout

Focused automated verification in this task. Headless live check 2026-09-03 14:20 on this machine（模块直连真实依赖）：quit Codex → `desktop: closed / runtimeState: not-running` → `launchViaCodexhost` 经 `~/.local/bin/codexhost` 返回 `ready` 用时 7.1 s → Desktop 进程、Host 描述符与 `~/.codex/ipc/ipc.sock` 同刻就绪 → `open codex://threads/<id>` 派发 → 检测回读 `desktop: managed`。第一版按 bundle 二进制猜 shim 的检测在配置页状态文里露出「未检测到」，已改为读运行中 Desktop 的启动环境。插件点击路径 2026-09-03 14:56 用户重载后实测：Codex 关闭时点一条 Codex 任务 → `codex-desktop-launch codexhost-launch（cliSource: observed）` → `open-readiness launch-started / launched（waitedMs 6077，source card-click）` → `task-action/open dispatched` → discovery 由 `unavailable` 转 `ok`，Desktop 环境带 `CODEXHOST_LAUNCHER_PID` 与 `CODEX_CLI_PATH=…codexhost-shim`，用户确认「是通过 codex host 启动的」。手动路径指向 `exit 1` 脚本、Claude 关闭且无辅助功能权限、开关关闭三项仍由用户择时核验。
