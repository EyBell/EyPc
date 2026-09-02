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

同批提交 `96cf75a` 还携带了 Claude 侧的 Host 线程接管（`claude/scripts.cjs`、`events.cjs`、`code-sessions.cjs`、`claude/index.cjs`、`preload/index.js` 的 `hostSuppressedKeys` 段）。那是 RAW-190 在 Claude 侧的推论，**不属于本任务**，登记在 [claude-host-thread-authority](../claude-host-thread-authority/spec.md#L1) RAW-198（`proposed`）。它与 RAW-194/195 挤进同一个提交，是因为入口预算棘轮对 `preload/index.js` 做恒等断言，拆分需要伪造一个中间行数。

2026-09-02 13:03 real uTools reload verified on `host-bf4111f68776b3eca478`: after `codexhost launch`, the 11 Host rows entered the groups (completed 14→24) and unread matched the Host (0→1). RAW-185 pin-group changes remain a separate review and commit batch even when closed out in the same working tree.
