# Changes: CodexHost 额外进程完成态

| Path | Core description |
| --- | --- |
| `preload/codex/codexhost-discovery.cjs` | CLI completed → `idle`; running snapshot 1s TTL |
| `preload/index.js` | snapshot-corroborated terminal; Host unread; Desktop overlay guard |
| `public/codex/codexhost-discovery.cjs` | canonical mirror |
| `public/preload.js` | canonical mirror |
| `tests/platform/codexhostDiscovery.test.ts` | idle mapping + running→completed refresh |
| `tests/platform/codexAppServerBridge.test.ts` | RAW-194：额外进程 id 不得官方 follow；Host running 在无 notLoaded 影子时保持 live |
| `tests/platform/providerEvidenceAdapterV7.test.ts` | exact terminal unread candidate |
| `scripts/validate-preload-entry-budget.mjs` | ratchet 14096 |
| `src/help/guides/codex.md` | extra-process completion copy |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` | RAW-190 current semantics |
| `preload/codex/codexhost-discovery.cjs` | Host 全状态映射：creating/running/input/approval/interrupted/failed/completed |
| `preload/codex/codexhost-discovery.cjs` | RAW-193：Host 未读有值即用；仅 unread event false / 跳转可清未读 |
| `preload/codex/codexhost-discovery.cjs` | RAW-194：会合点失败不缓存空列表；thread list 翻页 |
| `preload/codex/codexhost-discovery.cjs` | RAW-194：Desktop `notLoaded`/idle 回落到 Host connector，官方 follow 不再针对额外进程 id |
| `preload/companion/evidence-adapter-v7.cjs` | RAW-194：Host extra-process connector-active 是 live |
| `preload/codex/inventory-turn-fields.cjs` | RAW-195：snapshot-corroborated 终态盖过 Desktop live inProgress |
| CodexHost `app-server-host.ts` | list 保留 interrupted/failed/creating；提问 `attention: "input"` |
| `vibe/specs/requirements/codex-raw-190.md` | registry leaf |
| `vibe/knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md` | completion overlay occurrence |
| `vibe/specs/260901/codexhost-external-completion/*` | raw + spec |
| `preload/codex/codexhost-discovery.cjs` | RAW-194 二次根因：`externalGoalEvidence` 对额外进程 id 固定回 Goal `none/fresh`，不再让 `goal-verifying` 占位压过 Host 证据 |
| `preload/index.js` | goal 证据/goal 刷新对额外进程 id 短路；回收临时诊断 `codexhost-evidence`（`codexhost-published` 有用例引用，保留） |
| `tests/platform/codexAppServerBridge.test.ts` | 回归：额外进程 completed+unread / running 的候选序列不含 `goal-verifying`，且不向 App Server 发 `thread/goal/get` |
| `tests/platform/codexhostDiscovery.test.ts` | `externalGoalEvidence` 单测 |
| `scripts/validate-preload-entry-budget.mjs` | ratchet 14160 → 14158 |
| `preload/codex/codexhost-discovery.cjs` | 跳转即已读：`codexhostExternalUnreadFields` 第四参 `openedRead`，EyPc 本地已读盖过 Host 尚未翻转的未读 |
| `preload/index.js` | 快照层对额外进程行传入 opened-read 确认；额外进程的 opened-read 无 turn 起点时绑定打开时刻；`opened-read-cleared` 调试诊断记录清除者 |
| `tests/platform/codexAppServerBridge.test.ts` | 回归：Host 仍报未读时，EyPc 跳转后的快照与私有分支证据均为已读 |
| `preload/codex/codexhost-discovery.cjs` | RAW-199：Host CLI 归档通道 `codexhostReadThread` / `codexhostArchiveThread` / `codexhostArchiveState` / `codexhostForgetThread`；CLI 错误封套保留（stderr / exit 1），`codexhost-command` 诊断只记动词与错误码 |
| `preload/codex/archive-bridge.cjs` | RAW-199：`archiveCodexhostThread` Host lane——read 预检、archive 写入、live/archived 列表双核验、Kernel 提交后剔除花名册；额外进程 id 不再到官方 app-server |
| `preload/index.js` | 归档桥注入 `codexhostDiscovery` getter（+1 行） |
| `scripts/validate-preload-entry-budget.mjs` | ratchet 14158 → 14159 (x) |
| `tests/platform/codexhostArchive.test.ts` | 新增：discovery CLI 归档/核验/遗忘与错误封套；桥 Host lane 成功、running 保留、THREAD_BUSY 保留、核验失败 indeterminate、原生行仍走官方路径 |
| codex-host `packages/host-runtime/src/{delegation-cli,delegation-types,delegation-control-registry,delegation-control-server,app-server-host}.ts` | `codexhost thread archive|unarchive [<thread>]`，与 Desktop 归档共用 `#applyExternalArchiveState` 与 `thread/archived`；见 codex-host `vibe/specs/260902/1412-delegation-thread-archive/task-card.md` |
| codex-host `app-server-host.ts`（RAW-200） | side 子对话运行时来源行 `status: running`、挂起时带 `attention`（`#sideChatRootId` / `#sideChatRunningUnder`）；Desktop 与 CLI 归档级联到 `ephemeral` 子对话（`#cascadeSideChatArchiveState`）。EyPc 无代码变更 |
| `preload/codex/archive-bridge.cjs` | RAW-209：verify-1 后 companion `thread-archived`；官方 protocol-error 改道 Host；Host Desktop ACK 超时 `not-required` |
| `preload/index.js` | RAW-209：`codexThreadAlias` 粘性钉 `codexhostExternal` |

同批提交 `96cf75a` 还携带了 Claude 侧的 Host 线程接管（`claude/scripts.cjs`、`events.cjs`、`code-sessions.cjs`、`claude/index.cjs`、`preload/index.js` 的 `hostSuppressedKeys` 段）。那是 RAW-190 在 Claude 侧的推论，**不属于本任务**，登记在 [claude-host-thread-authority](../claude-host-thread-authority/spec.md#L1) RAW-198（`proposed`）。它与 RAW-194/195 挤进同一个提交，是因为入口预算棘轮对 `preload/index.js` 做恒等断言，拆分需要伪造一个中间行数。

2026-09-02 13:03 real uTools reload verified on `host-bf4111f68776b3eca478`: after `codexhost launch`, the 11 Host rows entered the groups (completed 14→24) and unread matched the Host (0→1). RAW-185 pin-group changes remain a separate review and commit batch even when closed out in the same working tree.
