# Changes: 置顶与各 Agent 应用双向同步

| Path | Core description |
| --- | --- |
| `preload/codex/pin-bridge.cjs`（新） | `CODEX_PINNED_SECTION_ID`、`codexThreadSectionPinned`（section 三态）、`codexThreadNativePinFields`（Host `pinned` → section → 镜像）、`createCodexPinBridge`（`thread/section/move` → method-not-found 回退 `thread/metadata/update` → `thread/read` 回读；额外进程走 Host CLI；`setCompanionPin` 解析 alias 并回写已核验缓存） |
| `preload/companion/task-kernel.cjs` | `providerPin / providerPinOrder / providerPinAuthority` 字段、`capabilities.pin`、`taskPinned` 单一谓词（分组、时间窗豁免、active 计数、置顶兜底、cycle 层级）、`compareByPinnedOrder` 本地在前 Provider 在后、`set-provider-pin` 命令（只提交已核验结果） |
| `preload/companion/task-actions.cjs` | `setPin`（无确认、无相位门、按任务单飞、`pin-intent / pin-result` 追踪） |
| `preload/index.js` | 守卫加载 pin-bridge；`sanitizeCodexThreads` 改用 `codexThreadNativePinFields`；Codex 根元数据 `providerPin*` 与 `pin` 能力（只在 section / Host 车道）；Claude `isStarred` → `providerPin`；Cursor `pinned/pinnedOrder` → `providerPin`；`companionProviderMetadataV7` 归一化；codex 适配器 `setPin`；pin-bridge 实例（已核验写入回写 500ms 快照缓存） |
| `preload/codex/codexhost-discovery.cjs` | `normalizeThread`/`seatThread`/`sanitizeMemoryEntry` 携带 `pinned`；扫描行 `codexhostPinned`；`codexhostPinThread`（CLI `thread pin|unpin`，同步 roster 与记忆）、`codexhostPinState` |
| `preload/claude/code-sessions.cjs` | 白名单加 `isStarred` |
| `preload/cursor/inventory.cjs` | v5：`queryRows` 通用 sqlite 车道、`workspaceStorage/*/state.vscdb` `cursor/pinnedComposers` 扫描（按 size:mtime 缓存、读失败保留旧值）、`projectRow` 带 `pinned/pinnedOrder`、快照 `pinnedAvailable/pinnedStoreCount`、递归 watch workspace 库并纳入签名 |
| `src/domain/companionTaskPackage.ts` | 快照类型 `providerPin*`、`capabilities.pin`；`pinSource`：local → native（providerPin）→ 未知时保留库存原生标记；Pinned 分区收 native |
| `src/domain/companionTaskTopology.ts` | 命令名 `set-provider-pin` |
| `src/domain/codex.ts` | `companionCapabilities.pin` |
| `src/domain/codexPresentation.ts` | 渲染镜像的置顶谓词改为任一来源 |
| `src/runtime/codexController.ts` | `toggleLocalPin`：Provider 可写时走 `commitCompanionProviderPin`（先清本地置顶，失败回退本地置顶并提示）；新增 `commitCompanionProviderPin` |
| `src/FloatApp.vue` | `pinProviderWritable / pinProviderLabel / pinMenuLabel`；只读门只挡不可写的 native；提示与右键菜单按来源分文案 |
| `scripts/utools-preload-assets.mjs` | 登记 `pin-bridge.cjs` |
| `scripts/validate-preload-entry-budget.mjs` | 行数 14277 → 14357（+80，带日期注释）、可变绑定 155 → 157 |
| `tests/platform/codexPinBridge.test.ts`（新） | section 三态、来源优先级、写入/回退/回读不一致/不确定、Host 车道、过期 alias、无 pin 动词 |
| `tests/platform/companionTaskKernel.test.ts` | +2：Provider 置顶分组与排序；`set-provider-pin` 只提交已核验结果 |
| `tests/platform/codexhostArchive.test.ts` | +3：Host `pinned` 列表、CLI pin/unpin 与 roster 领先、错误信封、无字段 Host |
| `tests/platform/claudeBridge.test.ts` | +1：`isStarred` 透传与白名单 |
| `tests/platform/cursorInventory.test.ts` | +2：多 workspace 置顶合并/缓存失效；解析防御 |
| `tests/domain/companionTaskPackage.test.ts` | +1：native `pinSource` 与 Pinned 分区 |
| `tests/ui/codexCompanion.test.ts` | 只读 native 提示文案随来源 |
| codex-host `packages/host-runtime/src/delegation-types.ts` | `ThreadPinInput/Result`、`DelegationControlApi.pin`、列表行 `pinned?` |
| codex-host `app-server-host.ts` | 列表行 `pinned`；`#pinDelegationThread`（`assignSection` 到 Pinned 分区）；注册 `pin` |
| codex-host `delegation-control-registry.ts` / `delegation-control-server.ts` / `delegation-cli.ts` | `pin()`、`/v1/thread/pin`、`thread pin|unpin [<thread>]` 与帮助文本 |
| codex-host 三个 delegation 测试 | mock 补 `pin`；+2 用例 |
| `vibe/specs/requirements/shared-raw-205.md` + `modules/companion-shared.md` | 登记 |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` / `PROJECT_STATUS.md` / `vibe/knowledge/ARCHITECTURE.md` / `src/help/guides/codex.md` | 当前真值、状态枢纽、架构与帮助同步 |
