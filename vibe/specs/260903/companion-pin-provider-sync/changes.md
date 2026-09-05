# Changes: 置顶与各 Agent 应用双向同步

| Path | Core description |
| --- | --- |
| `preload/codex/pin-bridge.cjs`（新） | `CODEX_PINNED_SECTION_ID`、`codexThreadSectionPinned`（section 三态）、`codexThreadNativePinFields`（Host `pinned` → section → 镜像）、`createCodexPinBridge`（`thread/section/move` → method-not-found 回退 `thread/metadata/update` → `thread/read` 回读；额外进程走 Host CLI；`setCompanionPin` 解析 alias 并回写已核验缓存） |
| `preload/companion/task-kernel.cjs` | `providerPin / providerPinOrder / providerPinAuthority` 字段、`capabilities.pin`、`taskPinned` 单一谓词（分组、时间窗豁免、active 计数、置顶兜底、cycle 层级）、`compareByPinnedOrder` 本地在前 Provider 在后、`set-provider-pin` 命令（只提交已核验结果） |
| `preload/companion/task-actions.cjs` | `setPin`（无确认、无相位门、按任务单飞、`pin-intent / pin-result` 追踪） |
| `preload/index.js` | 守卫加载 pin-bridge；`sanitizeCodexThreads` 改用 `codexThreadNativePinFields`；Codex 根元数据 `providerPin*` 与 `pin` 能力；Claude `isStarred` → `providerPin`（不授予 `pin`）；Cursor `pinned/pinnedOrder` → `providerPin`（不授予 `pin`）；Host Registry `setPin`（Codex 可写；Claude/Cursor `unsupported`） |
| `preload/codex/codexhost-discovery.cjs` | `normalizeThread`/`seatThread`/`sanitizeMemoryEntry` 携带 `pinned`；扫描行 `codexhostPinned`；`codexhostPinThread`（CLI `thread pin|unpin`，同步 roster 与记忆）、`codexhostPinState` |
| `preload/claude/code-sessions.cjs` | 白名单加 `isStarred`；`setSessionStarred` 与归档同构的原子替换（只翻该键、回读、失败回滚） |
| `preload/claude/index.cjs` | `setSessionPin` |
| `preload/cursor/pin.cjs`（新） | workspace `ItemTable` `cursor/pinnedComposers` 加入/去掉 composer id，写后回读 |
| `preload/cursor/index.cjs` | `setTaskPin` |
| `preload/cursor/inventory.cjs` | v5：`queryRows` 通用 sqlite 车道、`workspaceStorage/*/state.vscdb` `cursor/pinnedComposers` 扫描（按主库+WAL size:mtime 缓存、读失败保留旧值）、`projectRow` 带 `pinned/pinnedOrder`、快照 `pinnedAvailable/pinnedStoreCount`、递归 watch workspace 库并纳入签名 |
| **2026-09-05 Codex 双向核验（记录，无代码）** | |
| spec / `PROJECT_STATUS` / `shared-raw-205` / ARCHITECTURE / error-memory | 用户确认 Codex Desktop 置顶双向已满足（App↔插件）；JSON/sqlite 计数分叉只作诊断；撤回未落地的 sqlite 分区 watcher |
| **2026-09-05 Cursor WAL 入站与陈旧 turnOpen** | | |
| `preload/cursor/inventory.cjs` | 置顶缓存/`signatureOf` 含 workspace `-wal`；watch 时对已发现 workspace 主库+WAL 补 StatWatcher |
| `preload/companion/evidence-adapter-v7.cjs` / `src/domain/cursorAgent.ts` | 磁盘 `completed` 且无冷路径活标记时，陈旧 `hook.turnOpen` / `hookPhase=running` 不再单独保持进行中；`aborted`/空磁盘仍允许开 Turn 定 running |
| `tests/platform/cursorInventory.test.ts` | +2：主库签名冻结时 WAL 变化重读取消置顶；workspace WAL 通知 |
| `tests/platform/providerEvidenceAdapterV7.test.ts` / `tests/domain/cursorAgent.test.ts` | 磁盘 completed + 陈旧 turnOpen → completed；活 `unfinishedRunAt` / 空磁盘仍 running |
| **2026-09-05 Cursor WAL 入站真机** | 用户确认 Cursor APP 置顶/取消置顶在插件内正常展示；状态改 `host-verified-cursor-wal-inbound` |
| `src/domain/companionTaskPackage.ts` | 快照类型 `providerPin*`、`capabilities.pin`；`pinSource`：local → native（providerPin）→ 未知时保留库存原生标记；Pinned 分区收 native |
| `src/domain/companionTaskTopology.ts` | 命令名 `set-provider-pin` |
| `src/domain/codex.ts` | `companionCapabilities.pin` |
| `src/domain/codexPresentation.ts` | 渲染镜像的置顶谓词改为任一来源 |
| `src/runtime/codexController.ts` | `toggleLocalPin`：Provider 可写时走 `commitCompanionProviderPin`（先清本地置顶，失败回退本地置顶并提示）；新增 `commitCompanionProviderPin`；成功/失败文案按 Claude App / Cursor / Codex 分来源 |
| `src/FloatApp.vue` | `pinProviderWritable / pinProviderLabel / pinMenuLabel`；只读门只挡不可写的 native；提示与右键菜单按来源分文案 |
| `scripts/utools-preload-assets.mjs` | 登记 `pin-bridge.cjs`、`cursor/pin.cjs` |
| `scripts/validate-preload-entry-budget.mjs` | 行数 14277 → 14357（+80）再 → 14380（Claude/Cursor `setPin` 适配器）再 → 14375（2026-09-04 入站-only 收口 -5）再 → 14402（接口化 + 入站实时 +27）；可变绑定 155 → 157 |
| `tests/platform/codexPinBridge.test.ts`（新） | section 三态、来源优先级、写入/回退/回读不一致/不确定、Host 车道、过期 alias、无 pin 动词 |
| `tests/platform/companionTaskKernel.test.ts` | Provider 置顶分组与排序；`set-provider-pin` 只提交已核验结果；Claude/Cursor 无 `pin` 能力不写适配器 |
| `tests/platform/codexhostArchive.test.ts` | +3：Host `pinned` 列表、CLI pin/unpin 与 roster 领先、错误信封、无字段 Host |
| `tests/platform/claudeBridge.test.ts` | `isStarred` 透传与白名单；`setSessionPin` 只翻星标、幂等 |
| `tests/platform/cursorInventory.test.ts` | +2：多 workspace 置顶合并/缓存失效；解析防御 |
| `tests/platform/cursorPin.test.ts`（新） | `pinnedComposers` 加入/去掉与 bridge `setTaskPin` |
| `tests/domain/companionTaskPackage.test.ts` | +1：native `pinSource` 与 Pinned 分区 |
| `tests/ui/codexCompanion.test.ts` | 只读 native 提示文案随来源 |
| **2026-09-04 接口化收口** | |
| `preload/companion/provider-manifest.json` / `provider-registry.cjs` | 每 Provider `pin: { inbound, outbound, appLabel, pinNoun }`；`validPinPolicy` 校验并冻结；`createCompanionHostRegistry` 对 `outbound:false` 拒绝 `setPin`；导出 `providerPinPolicy` |
| `preload/companion/task-actions.cjs` | `normalizeArchiveResult / PinResult / ExecuteResult` 合并为 `normalizeActionResult(value, target, spec)` + 三个薄包装 |
| `preload/codex/pin-bridge.cjs` | 新增 `providerPinFields`；`setCodexThreadPin` 改为 `appServerLane / codexhostLane` 两个 `{ write, verify }` 对象共享一条事务；in-flight 按 `threadId` |
| `preload/index.js` | 三处产出改用 `companionProviderPinFields`；删除 Claude/Cursor `setPin` 桩与 `setSessionPin / setTaskPin` 平台 API；`readCodexDesktopUnreadIdsInner` 附带隐藏 `pinMirrorLine`；Desktop bridge `notePinMirror` 变化触发 `forceTasksOnly` 成员重扫；discovery 注入 `fs / path / homeDirectory / onRosterChanged` |
| `preload/codex/codexhost-discovery.cjs` | `ensureStoreWatcher`（rendezvous 后监听 mapping-store `threads/`，300 ms 防抖）、`codexhostInvalidateList`、`closeStoreWatcher`；导出 `CODEXHOST_STORE_DEBOUNCE_MS` |
| `preload/claude/code-sessions.cjs` / `claude/index.cjs` / `cursor/index.cjs` | 删除 `setSessionStarred / semanticWithoutStar / setSessionPin / setTaskPin`；`preload/cursor/pin.cjs` 与 `public/cursor/pin.cjs` 删除；`scripts/utools-preload-assets.mjs` 去登记 |
| `src/domain/companionProvider.ts` | `COMPANION_PROVIDER_PIN_POLICY`、`companionPinPolicy / companionPinAppLabel / companionPinNativeLabel`、`CompanionProviderPinResultV2`、`CompanionProviderAdapter.setPin?` |
| `src/domain/codex.ts` / `companionTaskPackage.ts` | 卡片 `providerPinned` |
| `src/runtime/codexController.ts` | `providerPinSyncLabel` 读策略表；`set-pin-gate / set-provider-pin-gate` 诊断 `provider` 由任务派生 |
| `src/FloatApp.vue` | `pinProviderOf / pinProviderPinned`；文案全部读策略表；native 任务行不再只读（叠加本地置顶）；`pinMoveIsReadOnly` 只放行本地置顶重排；菜单 `disabledReason` 复用 `pinSourceHint` |
| `src/platform/eypcPlatform.ts` | 删除 `CompanionProviderPinResult`、`claude.setSessionPin`、`cursor.setTaskPin` |
| `scripts/validate-preload-entry-budget.mjs` | 14375 → 14402（+27，账目见注释） |
| 测试 | `companionTaskKernel`（策略/禁止适配器/manifest 校验）、`codexhostDiscovery`（store watcher）、`codexAppServerBridge`（pin mirror 变化）、`companionProvider`（策略表）、`companionTaskPackage`（`providerPinned`）、`codexCompanion`（叠加文案与门）；删除 `cursorPin.test.ts` 与 `claudeBridge` 星标写用例 |
| codex-host `packages/host-runtime/src/delegation-types.ts` | `ThreadPinInput/Result`、`DelegationControlApi.pin`、列表行 `pinned?` |
| codex-host `app-server-host.ts` | 列表行 `pinned`；`#pinDelegationThread`（`assignSection` 到 Pinned 分区）；注册 `pin` |
| codex-host `delegation-control-registry.ts` / `delegation-control-server.ts` / `delegation-cli.ts` | `pin()`、`/v1/thread/pin`、`thread pin|unpin [<thread>]` 与帮助文本 |
| codex-host 三个 delegation 测试 | mock 补 `pin`；+2 用例 |
| `vibe/specs/requirements/shared-raw-205.md` + `modules/companion-shared.md` | 登记 |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` / `PROJECT_STATUS.md` / `vibe/knowledge/ARCHITECTURE.md` / `src/help/guides/codex.md` | 当前真值、状态枢纽、架构与帮助同步 |
