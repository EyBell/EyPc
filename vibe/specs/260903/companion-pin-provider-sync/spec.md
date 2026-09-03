# Spec：置顶与各 Agent 应用双向同步

spec_id: `SPEC-260903-COMPANION-PIN-PROVIDER-SYNC`
Tool: claude
Date: 2026-09-03
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-verified-inbound / desktop-repaint-on-focus`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L250)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260903-companion-pin-provider-sync`
- Group owner: this `spec.md`
- Excluded unrelated dirty documents: 同一检出里并行会话的 RAW-203/204 未提交文件（`preload/claude/quota.cjs`、`preload/codex/desktop-shadow.cjs`、`preload/codex/desktop-unread-evidence.cjs`、`vibe/specs/260903/codexhost-read-memory-and-claude-quota-org/*`）、`public/` 构建镜像；codex-host 仓库自己的 `docs/czz-dev.md` 脏改动

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260903-companion-pin-provider-sync",
  "group_owner": "vibe/specs/260903/companion-pin-provider-sync/spec.md",
  "documents": [
    "vibe/specs/260903/companion-pin-provider-sync/raw-requirement.md",
    "vibe/specs/260903/companion-pin-provider-sync/spec.md",
    "vibe/specs/260903/companion-pin-provider-sync/changes.md",
    "vibe/specs/requirements/shared-raw-205.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/codex/pin-bridge.cjs",
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/cursor/inventory.cjs",
    "src/domain/companionTaskPackage.ts",
    "src/domain/companionTaskTopology.ts",
    "src/domain/codex.ts",
    "src/domain/codexPresentation.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "tests/platform/codexPinBridge.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexhostArchive.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/cursorInventory.test.ts",
    "tests/domain/companionTaskPackage.test.ts",
    "tests/ui/codexCompanion.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-preload-entry-budget.mjs",
    "scripts/validate-committed-preload-mirrors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260903/companion-pin-provider-sync",
    "vibe/specs/requirements/shared-raw-205.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md",
    "preload/codex/pin-bridge.cjs",
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/cursor/inventory.cjs",
    "src/domain/companionTaskPackage.ts",
    "src/domain/companionTaskTopology.ts",
    "src/domain/codex.ts",
    "src/domain/codexPresentation.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "tests/platform/codexPinBridge.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexhostArchive.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/cursorInventory.test.ts",
    "tests/domain/companionTaskPackage.test.ts",
    "tests/ui/codexCompanion.test.ts"
  ]
}
```

## 条款

### RAW-205#1 · Provider 置顶进入 Kernel

Kernel 任务新增 `providerPin: boolean | null`、`providerPinOrder`、`providerPinAuthority ∈ {app-server, codexhost, claude-metadata, cursor-workspace}`。`null` 表示该来源没有置顶车道，不等于未置顶。`taskPinned = localPin || providerPin === true` 是唯一置顶谓词：动态「置顶」分组、活动时间窗豁免、active 计数、置顶兜底入口与 cycle 层级全部读它；RAW-185/188/189 的不变式对 Provider 置顶原样成立。置顶分组顺序：EyPc 本地置顶按 `Alt+↑/↓` 顺序在前，Provider 置顶按 Provider 顺序在后。

### RAW-205#2 · 四路感知

- Codex 原生：`thread/list` 行 `section.id === 01984de2-…` 为权威；行无 `section` 键时才回退全局状态镜像 `pinned-thread-ids`。
- CodexHost 额外进程：Host `thread list` 行 `pinned`（codex-host 本轮新增）；老 Host 省略时报「无车道」。持久线程记忆携带 `pinned`。
- Claude App：`local_*.json` `isStarred`；只读。
- Cursor：全部 `workspaceStorage/*/state.vscdb` 的 `cursor/pinnedComposers`，按文件签名缓存，读失败保留旧值；只读。

### RAW-205#3 · 回写与来源仲裁

能力 `pin` 只授予 Codex 原生（section 车道）与 CodexHost（Host `pinned` 车道）根任务。可写 Provider 是置顶的单一来源：EyPc 置顶走 `set-provider-pin` → `task-actions.setPin` → 适配器 → `pin-bridge`（写 → 回读核验 → 只提交已核验值）；写失败或不确定时回退为本地置顶并提示「Codex 同步失败 / 待确认」，取消置顶同时清本地置顶。只读 Provider 的置顶只增不减：EyPc 取消只清本地置顶，行仍置顶并提示回 App 取消。

### RAW-205#4 · Desktop 侧栏与产品条款修订

Codex 没有 section 变更通知，Desktop IPC 没有 pin 消息；真机（2026-09-03 用户实测）：EyPc 写入后 Desktop 侧栏不即时刷新，切窗（窗口重新获得焦点）后刷新。成功提示固定写明「侧栏切窗后刷新」，不得声称已同步到侧栏。PRD「本地偏好不回写 Provider」「原生置顶顺序只读」修订为：置顶是唯一回写 Provider 的本地偏好，且只对 Codex/CodexHost；Claude/Cursor 原生置顶仍只读。

## 实现

见 [changes.md](changes.md#L1)。

## 验证

- 聚焦 vitest：`companionTaskKernel` 97、`codexPinBridge` 7、`codexhostArchive` +3、`codexhostDiscovery`、`claudeBridge`、`cursorInventory` +2、`codexAppServerBridge`、`companionTaskPackage` +1、`codex`、`companionAggregate`、`codexCompanion`（UI）全绿；typecheck 通过；入口预算 14357 / 278 / 157。
- codex-host：`tsc -b` 通过；`delegation-cli / delegation-control-server / delegation-control-registry` 38/38。
- 真机（2026-09-03 用户重载 uTools）：置顶分组同时收到 Codex、Cursor、Claude 三家原生置顶共 6 条（读入四路中三路已见，CodexHost 需 Host 重启后再验）；EyPc 置顶 Codex 任务后 Desktop 侧栏不即时刷新，切窗后刷新——提示文案据此收口。未验：`codexhost launch` 重启后 CLI `thread pin` 与列表 `pinned`。

## 会话衔接

- RP-01：codex-host 新动词需 Desktop 正常退出后 `codexhost launch` 重启生效，CodexHost 行的置顶读入与回写待此后验收；两仓改动未提交。
