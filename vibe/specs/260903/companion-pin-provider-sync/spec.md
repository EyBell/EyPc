# Spec：置顶与各 Agent 应用双向同步

spec_id: `SPEC-260903-COMPANION-PIN-PROVIDER-SYNC`
Tool: claude
Date: 2026-09-03
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-verified-inbound / desktop-repaint-on-focus / host-verified-native-and-host-pin / claude-cursor-pin-inbound-only / pin-lane-interface / host-verified-codex-bidirectional-pin / host-verified-cursor-wal-inbound`
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
    "vibe/knowledge/error-memory/cursor-sqlite-pin-write-is-not-sidebar-pin.md",
    "vibe/knowledge/error-memory/cursor-workspace-pin-cache-ignores-wal.md",
    "vibe/knowledge/error-memory/cursor-disk-completed-stale-hook-turnopen.md",
    "vibe/knowledge/error-memory/codex-desktop-pin-sqlite-not-json-mirror.md",
    "vibe/knowledge/error-memory/verify-policy-must-not-skip-utools-artifact-build.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/modules/runtime-and-packaging.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/codex/pin-bridge.cjs",
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "preload/companion/provider-manifest.json",
    "preload/companion/provider-registry.cjs",
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/evidence-adapter-v7.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/claude/index.cjs",
    "preload/cursor/index.cjs",
    "preload/cursor/inventory.cjs",
    "src/domain/companionProvider.ts",
    "src/domain/companionTaskPackage.ts",
    "src/domain/companionTaskTopology.ts",
    "src/domain/codex.ts",
    "src/domain/codexPresentation.ts",
    "src/domain/cursorAgent.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "tests/platform/codexPinBridge.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexhostArchive.test.ts",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/cursorInventory.test.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts",
    "tests/domain/companionProvider.test.ts",
    "tests/domain/companionTaskPackage.test.ts",
    "tests/domain/cursorAgent.test.ts",
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
    "vibe/knowledge/error-memory/cursor-sqlite-pin-write-is-not-sidebar-pin.md",
    "vibe/knowledge/error-memory/cursor-workspace-pin-cache-ignores-wal.md",
    "vibe/knowledge/error-memory/cursor-disk-completed-stale-hook-turnopen.md",
    "vibe/knowledge/error-memory/codex-desktop-pin-sqlite-not-json-mirror.md",
    "vibe/knowledge/error-memory/verify-policy-must-not-skip-utools-artifact-build.md",
    "vibe/knowledge/error-memory/modules/companion-actions-and-presentation.md",
    "vibe/knowledge/error-memory/modules/companion-task-state.md",
    "vibe/knowledge/error-memory/modules/runtime-and-packaging.md",
    "src/help/guides/codex.md",
    "preload/codex/pin-bridge.cjs",
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "preload/companion/provider-manifest.json",
    "preload/companion/provider-registry.cjs",
    "preload/companion/task-kernel.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/evidence-adapter-v7.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/claude/index.cjs",
    "preload/cursor/index.cjs",
    "preload/cursor/inventory.cjs",
    "src/domain/companionProvider.ts",
    "src/domain/companionTaskPackage.ts",
    "src/domain/companionTaskTopology.ts",
    "src/domain/codex.ts",
    "src/domain/codexPresentation.ts",
    "src/domain/cursorAgent.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "tests/platform/codexPinBridge.test.ts",
    "tests/platform/companionTaskKernel.test.ts",
    "tests/platform/codexhostArchive.test.ts",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "tests/platform/cursorInventory.test.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts",
    "tests/domain/companionProvider.test.ts",
    "tests/domain/companionTaskPackage.test.ts",
    "tests/domain/cursorAgent.test.ts",
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
- Claude App：`local_*.json` `isStarred`（入站）；插件置顶不写该键。
- Cursor：全部 `workspaceStorage/*/state.vscdb` 的 `cursor/pinnedComposers`，按主库+WAL 签名缓存，读失败保留旧值（入站）；插件置顶不写该键。

### RAW-205#3 · 回写与来源仲裁

能力 `pin` 只授予 Codex 原生（section 车道）与 CodexHost（Host `pinned` 车道）。Cloud Code（Claude App）与 Cursor 不授予写出站：插件置顶走本地 `localPin`；这两路应用内置顶仍经 `providerPin` 入站。Codex / CodexHost 的 EyPc 置顶走 `set-provider-pin` → `task-actions.setPin` → `pin-bridge` 写 → 回读核验 → 只提交已核验值；写失败或不确定时回退为本地置顶并提示，取消置顶同时清本地置顶。应用侧栏可能稍后才刷新，不得声称已即时同步到侧栏。不得把 Cursor sqlite 回读成功说成侧栏已置顶。

### RAW-205#5 · 置顶车道接口化与入站实时（2026-09-04 用户补充）

- 策略单点：`provider-manifest.json` 每个 Provider 声明 `pin: { inbound, outbound, appLabel, pinNoun }`（Codex `outbound:true`；Claude App / Cursor `outbound:false`）。`loadProviderRegistry` 校验该块；`createCompanionHostRegistry` 对 `outbound:false` 的 Provider 若收到 `setPin` 适配器抛 `companion-provider-pin-adapter-forbidden:<id>`。Codex 行级可写仍由 `nativePinLane ∈ {app-server, codexhost}` 授予 `capabilities.pin`；镜像行不可写。
- 统一归一化：三处 Provider 产出共用 `providerPinFields`（非布尔 ⇒ `providerPin:null` + 空 authority）；`task-actions` 三个结果信封合并为 `normalizeActionResult(spec)`；`pin-bridge` 以 `{ write, verify }` 两条 lane 对象共享一条写→回读→分类事务，同线程按 `threadId` 单飞。
- 渲染层：`COMPANION_PROVIDER_PIN_POLICY` / `companionPinAppLabel` / `companionPinNativeLabel` 从 manifest 派生，所有置顶文案与诊断 `provider` 不再按 Provider id 分支；卡片新增 `providerPinned`。
- 叠加本地置顶：应用内已置顶（`providerPin:true`）且本行不可写的任务在 EyPc 点图钉 = 叠加 `localPin`（提示「来源：X 星标/置顶 · 点击叠加 EyPc 本地置顶」；叠加后「X + EyPc 本地置顶 · 点击取消本地置顶」）；应用内置顶只能在应用中取消；`Alt+↑/↓` 只对本地置顶生效。项目级 Codex 原生置顶仍只读。
- 死代码删除：`cursor/pin.cjs`、`code-sessions.setSessionStarred`、`claude.setSessionPin`、`cursor.setTaskPin`、平台 API 与类型、相关测试。
- 入站实时：Codex 原生——Desktop 置顶只改 `.codex-global-state.json` 顶层 `pinned-thread-ids`，未读 watcher 同一次解析附带该镜像（有序），变化即 `requestCodexInventoryMembershipReconciliation('watcher-event', { forceTasksOnly: true })`，fresh `thread/list` 的 `section` 为权威；首读只记基线。2026-09-05 用户确认该路双向已满足（App→插件、插件→App），不另做 `state_5.sqlite` Pinned 分区 watcher。CodexHost——rendezvous 成功后 `fs.watch(<CODEXHOST_DATA_DIR|~/.codexhost>/mapping-store/threads)`，`*.json` 变化 300 ms 防抖后失效列表 TTL 并请求 `queueCompanionHostReconciliation('codex')`；缺目录时保留 TTL 轮询。Claude 沿用既有 watcher。Cursor workspace 递归 watch 把 `state.vscdb-wal` 纳入签名与 StatWatcher，取消置顶只写 WAL 时也会重读。
- 不可改边界：Codex 无 section 通知，EyPc 写入后 Desktop 侧栏仍在重获焦点时刷新；提示文案保持「应用侧栏稍后刷新」。

### RAW-205#4 · Desktop 侧栏与产品条款修订

Codex 没有 section 变更通知，Desktop IPC 没有 pin 消息；真机（2026-09-03 用户实测）：EyPc 写入后 Desktop 侧栏不即时刷新，切窗（窗口重新获得焦点）后刷新。2026-09-04 用户收口：Cloud Code / Cursor 外部 sqlite 写不能驱动当前窗口侧栏，插件改回自己维护置顶，只保留入站。成功提示写明「应用侧栏稍后刷新」仅适用于仍可写的 Codex / CodexHost。PRD：置顶回写只保留 Codex 原生与 CodexHost；归档仍是另一条已有会话状态写：Claude `isArchived` / Cursor `composerHeaders`。

## 实现

见 [changes.md](changes.md#L1)。

## 验证

- 聚焦 vitest（本轮入站收口）：`claudeBridge` + `cursorPin` + `companionTaskKernel` + `codexCompanion` + `companionTaskPackage` 5 文件 255/255；typecheck 通过；入口预算 14375 / 278 / 157；`validate:requirements` 通过。
- codex-host：`tsc -b` 通过；`delegation-cli / delegation-control-server / delegation-control-registry` 38/38。
- 真机（2026-09-03 用户重载 uTools）：置顶分组同时收到 Codex、Cursor、Claude 三家原生置顶共 6 条（读入四路中三路已见）；EyPc 置顶 Codex 任务后 Desktop 侧栏不即时刷新，切窗后刷新——提示文案据此收口。
- 四路有界金丝（2026-09-03 21:13–21:23，不启动 uTools、不杀 Desktop/Claude/Cursor）：
  - Codex 原生 **pass**：独立 `codex app-server` stdio + `createCodexPinBridge`，线程 `01a0524d-…` `thread/section/move` pin → `thread/read` `providerPin:true` 且 sqlite `thread_section_id` 进入 Pinned → unpin 恢复（sqlite 回无分区）。未改产品代码。
  - CodexHost **pass**：运行中 debug CLI 的 `thread --help` 未列出 pin，但会合点 `thread pin|unpin` 可用，无需退出 Desktop。额外进程 grok `ccd66b72-…` pin → list `pinned:true` → unpin → list `pinned:false`，已恢复。
  - Claude 覆盖金丝：`local_5b97e795-…` 只翻 `isStarred` false→true，立即读回采纳，约 10.3 分钟未被冲回；结束已写回 false。用户随后授权产品回写。
  - Cursor 覆盖金丝：Cursor.app 运行中，`empty-window` `cursor/pinnedComposers` 3→2 ids 立即采纳，120s 内未被 flush 冲回；结束写回原 3 ids。用户随后授权产品回写。
- 产品回写（2026-09-03 曾接入 Claude/Cursor 写出站；2026-09-04 用户收口为入站-only）：Claude / Cursor 不再授予 `capabilities.pin`，Host Registry `setPin` 返回 `unsupported`；会话归档状态仍走既有 Claude `isArchived` / Cursor `composerHeaders` 写。

- 2026-09-04 接口化收口（claude 会话）：聚焦 vitest `companionTaskKernel / companionTaskActionsBridge / companionContractsV7 / codexPinBridge / providerEvidenceAdapterV7 / claudeBridge / cursorInventory / eypcPlatform / runtimeIdentity / codexhostDiscovery / codexhostArchive / codexAppServerBridge / companionProvider / companionTaskPackage / codexCompanion / codexController / companionAggregate` 全绿；typecheck 通过；入口预算 14402 / 278 / 157；`pnpm verify` 与 build 见 changes。真机入站实时（Desktop 置顶 ≤2 s 进插件、Host 记录写入触发重扫、叠加本地置顶）待用户重载 uTools 核验。
- 2026-09-05 用户确认（cursor 会话）：Codex Desktop 置顶双向已符合要求——App 里置顶/取消会自动进插件，插件置顶/取消也会同步到 App。本轮只记录，不新增 sqlite 分区 watcher；未完成的 watcher 草稿已撤回。
- 2026-09-05 用户确认（cursor 会话）：Cursor APP 置顶/取消置顶会在插件置顶分组正常展示；入站走 workspace 主库+WAL 签名。磁盘完成后陈旧 `turnOpen` 仍只有聚焦自动化证据，未另报真机相位。

## 会话衔接

- RP-02（2026-09-05）：Codex Desktop 双向置顶已用户确认，状态含 `host-verified-codex-bidirectional-pin`。Cursor WAL 入站已用户确认，状态含 `host-verified-cursor-wal-inbound`。
- RP-01：Codex / CodexHost 置顶写出站仍接产品车道。Cloud Code / Cursor 改为插件自持 + 入站；sqlite 回读不得声称侧栏已置顶。两仓改动未提交。
