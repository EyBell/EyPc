# Claude Companion Error Memory Route

## Scope

This link-only module routes EyPc-specific Claude Companion inventory, status, quota, open, bridge and test failures. Current product authority remains the [2026-08-07 reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1); this index is not a requirement manifest, task ledger or runtime state.

更新引入（2026-08-08，RAW-150；已被下条细化）：旧任务和记忆中“Claude 不支持归档”的结论只保留为历史默认边界。RAW-150 曾选择 Deep Link→语义化 AX 动作与日志/元数据/库存三重确认；这条具体执行路线已被本机证据证伪并由 RAW-154 取代，不得恢复为当前建议。

更新引入（2026-08-09，RAW-154）：当前唯一窄例外是 macOS Claude App `1.26832.0` 的 completed/stopped D′ 静默归档。普通库存只在 Preload 内建立唯一 `sessionId → local_*.json` 私有索引；写前重读 phase、身份、stat/hash，事务保留原始字节/权限，只把单一目标的 `isArchived` 改为 true，经同目录临时文件核验后原子替换。元数据 true + 私有活动库存移除即成功，App 日志只是增强证据；安全回滚失败或并发修改不确定时保留卡片。禁止 Deep Link、AX/JXA、LevelDB、扫改目录和非目标会话。普通打开也必须先拒绝已归档/缺失/歧义目标；精确 membership delta 与一秒索引 watchdog 独立于完整库存和 quota。项目级归档仍禁用。

更新引入（2026-08-09，RAW-152）：Claude provider-local exact opener 继续只负责 Epitaxy Deep Link；通用 Codex/Claude 前后任务的游标、全来源 ready、75ms 最终目标和跨来源并发 1 已提升到 Preload 进程 owner。该失败族由 [uTools lifecycle pointer](../utools-onpluginout-hidden-vs-process-exit.md#L1) 与 [Codex session lifecycle](../codex-app-server-session-state-survives-exit.md#L1) 主责，本模块不创建第二份 Claude 专属记录。

## Current Authorities And Routes

- Current decisions, archive ids and implementation boundary: [reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)
- Local technical evidence and strict tests: [research](../../../specs/260807/claude-code-companion-authority-reset/research.md#L1)
- Current project state: [PROJECT_STATUS](../../../specs/PROJECT_STATUS.md#L1)
- Current architecture: [ARCHITECTURE](../../ARCHITECTURE.md#L1)

## Primary Error Records

- [Session family/open/state authority conflation](../claude-session-family-open-route-and-state-authority-conflation.md#L1) — verified root cause and replacement route, including stable unread snapshots, same-completion session hints and App OAuth dynamic quota; interactive UI matrix remains an acceptance boundary, not a route choice.
- [Watcher callback latency is not end-to-end publication latency](../watcher-callback-latency-is-not-end-to-end-publication-latency.md#L1) — measure authority event through Controller publish on one monotonic clock; source wake is diagnostic only.
- [Independent authorities coupled by full refresh](../independent-authorities-coupled-by-full-refresh.md#L1) — inventory/state/unread/quota/presence require feature-lifetime independent lanes, source→Controller→Float monotonic revisions and authority-specific failure semantics.
- [Capability gap asserted without reading the shipped App](../capability-gap-asserted-without-reading-the-shipped-app.md#L1) — superseded historical lesson; `resume` exists but is an import route, not the selected exact-open route.
- [Test double froze an invented cross-module contract](../test-double-froze-an-invented-cross-module-contract.md#L1)
- [Sandbox real Claude binary breaks empty-machine fixtures](../sandbox-real-claude-binary-breaks-empty-machine-fixtures.md#L1)
- [Claude readiness gated on an unneeded capability](../claude-readiness-gated-on-unneeded-capability.md#L1)
- [Cross-clock timestamp comparison](../cross-clock-timestamp-comparison.md#L1)
- [Dedup set wider than projected set](../dedup-set-wider-than-projected-set.md#L1)
- [Concat breaks downstream merge-sorted precondition](../concat-breaks-downstream-merge-sorted-precondition.md#L1)
- [Fixed-field projection drops declared data](../fixed-field-projection-drops-declared-data.md#L1)
- [Tri-state collapsed to boolean hides remedy](../tri-state-collapsed-to-boolean-hides-remedy.md#L1)
- [Tests that cannot fail](../tests-that-cannot-fail.md#L1)
- [Producer built before checking the consumer can express it](../producer-built-before-checking-the-consumer-can-express-it.md#L1)
- [Documented absent field treated as parse target](../documented-absent-field-treated-as-parse-target.md#L1)
- [Superseded rule cited as authority](../superseded-rule-cited-as-authority.md#L1)

## Related Error Records

- [uTools macOS native-addon host signature mismatch](../utools-macos-native-addon-host-signature-mismatch.md#L1)
- [New preload module missing from packaging manifest](../new-preload-module-missing-from-packaging-manifest.md#L1)
- [Facade port omitted below a passing module validator](../facade-port-omitted-below-passing-module-validator.md#L1)
- [Content-derived path segment unvalidated](../content-derived-path-segment-unvalidated.md#L1)
- [Guard field no producer ever sets](../guard-field-no-producer-ever-sets.md#L1)
- [Process-owned multi-provider navigation lifecycle](../utools-onpluginout-hidden-vs-process-exit.md#L1)

These preload/packaging/path records may also route through the CodeNote uTools module; their owning leaf remains unchanged.

## Historical Or Migration Sources

- [已归档：Original Claude provider](../../../specs/260805/1150-claude-companion-provider/spec.md#L1) — CLI/mixed-session 当前权威已失效；替代为 [reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)。
- [已归档：Desktop provider](../../../specs/260806/1130-claude-desktop-provider/spec.md#L1) — Cowork/audit 推断已被 Code-only 真实来源替代；替代为 [reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)。
- [已归档：Old resume/open verification](../../../specs/260806/2147-claude-open-in-desktop-app/verify.md#L1) — import 路线不能证明原会话打开；替代为 [reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)。
- [已归档：Old unread acquisition](../../../specs/260806/2147-claude-open-in-desktop-app/unread-authority.md#L1) — 字节扫描/旧集合实现已失效；替代为 [reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)。
- [已归档：N-window quota work](../../../specs/260806/2210-claude-quota-all-windows/spec.md#L1) — N-window 设计已吸收，旧凭据/调度已失效；替代为 [reset spec](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)。
