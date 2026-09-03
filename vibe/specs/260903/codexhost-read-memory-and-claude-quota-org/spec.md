# Spec：额外进程已读记忆与 Claude App 额度组织仲裁

spec_id: `SPEC-260903-CODEXHOST-READ-MEMORY-AND-CLAUDE-QUOTA-ORG`
Tool: claude
Date: 2026-09-03
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L270)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260903-codexhost-read-memory-and-claude-quota-org`
- Group owner: this `spec.md`
- Excluded unrelated dirty documents: 同一检出里并行会话的 260902 归档残留行 / RAW-200 未提交文件（`tests/platform/codexAppServerBridge.test.ts` 的归档用例、`vibe/specs/260901/codexhost-external-completion/*`、`vibe/specs/requirements/codex-raw-200.md`、`vibe/knowledge/error-memory/codexhost-archived-row-resurrected-by-stale-roster.md`——后者本轮只为它补了主责模块登记）、`public/` 构建镜像；RAW-202 已在本轮进行中由并行会话提交为 `c9b10d0`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260903-codexhost-read-memory-and-claude-quota-org",
  "group_owner": "vibe/specs/260903/codexhost-read-memory-and-claude-quota-org/spec.md",
  "documents": [
    "vibe/specs/260903/codexhost-read-memory-and-claude-quota-org/raw-requirement.md",
    "vibe/specs/260903/codexhost-read-memory-and-claude-quota-org/spec.md",
    "vibe/specs/260903/codexhost-read-memory-and-claude-quota-org/changes.md",
    "vibe/specs/requirements/codex-raw-203.md",
    "vibe/specs/requirements/claude-raw-204.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/requirements/modules/companion-claude.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/codexhost-jump-read-lost-with-roster-timestamp.md",
    "vibe/knowledge/error-memory/claude-app-token-cache-acct-key-organization-segment.md"
  ],
  "dependencies": [
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "preload/codex/desktop-shadow.cjs",
    "preload/claude/quota.cjs",
    "preload/claude/plan-usage.cjs",
    "preload/companion/open-handoff.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/navigation.cjs",
    "src/domain/claude.ts",
    "src/domain/codexPresentation.ts",
    "src/domain/companionPresentation.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "src/components/CodexWaterBall.vue",
    "src/pages/CodexPage.vue",
    "src/styles/float.css",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/claudeQuotaFallback.test.ts",
    "tests/domain/companionPresentation.test.ts",
    "tests/domain/codexPresentation.test.ts",
    "tests/runtime/claudeCompanionController.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs",
    "scripts/validate-error-memory.mjs",
    "scripts/validate-preload-entry-budget.mjs",
    "scripts/validate-committed-preload-mirrors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260903/codexhost-read-memory-and-claude-quota-org",
    "vibe/specs/requirements/codex-raw-203.md",
    "vibe/specs/requirements/claude-raw-204.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/requirements/modules/companion-claude.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "vibe/knowledge/error-memory/codexhost-jump-read-lost-with-roster-timestamp.md",
    "vibe/knowledge/error-memory/claude-app-token-cache-acct-key-organization-segment.md",
    "src/help/guides/codex.md",
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "preload/codex/desktop-shadow.cjs",
    "preload/claude/quota.cjs",
    "preload/claude/plan-usage.cjs",
    "preload/companion/open-handoff.cjs",
    "preload/companion/task-actions.cjs",
    "preload/companion/navigation.cjs",
    "public",
    "src/domain/claude.ts",
    "src/domain/codexPresentation.ts",
    "src/domain/companionPresentation.ts",
    "src/runtime/codexController.ts",
    "src/FloatApp.vue",
    "src/components/CodexWaterBall.vue",
    "src/pages/CodexPage.vue",
    "src/styles/float.css",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/claudeQuotaFallback.test.ts",
    "tests/domain/companionPresentation.test.ts",
    "tests/domain/codexPresentation.test.ts",
    "tests/runtime/claudeCompanionController.test.ts"
  ]
}
```

## Requirement Delta

- Add（RAW-203）: discovery 线程记忆 `eypc/codex/codexhost-thread-memory/v1`（status / attention / firstSeenAt / statusChangedAt / Host unread / readAt / readStatusChangedAt，≤ 300 条），跨会合点丢失、`codexhostResetDiscovery` 与插件重载延续 `statusChangedAt`；EyPc 跳转记为持久已读，Host 状态变化或 Host unread `false → true` 边沿取代；归档删除。
- Add（RAW-204）: `acct:<account>|<profile>:<org>:…` 键形组织取第 2 段；多组织平局用 App `plan-usage-history` 最新样本的 `org` 裁决；Claude 额度组 `note`（真机复核后改为行内「!」标记 + 悬停提示，回执改为覆盖同一行，额度区保持一行）；手动刷新回执 `companion.quotaRefreshReceipt` 与浮窗可见反馈。
- Add（RAW-204 真机补丁）: usage API 成功后的下一次调用下限 60 秒（`MIN_USAGE_API_INTERVAL_MS`）；用户把「额度刷新（秒）」设为 10 秒后接口连续 10 秒一读，第 5 次起 429，卡片出现「暂受限」。手动刷新仍绕过该下限。
- Change: `compareHostDesktopUnread(known, { openedRead })`；`codexhostResetDiscovery({ forgetMemory })` 仅测试用。
- Unchanged: RAW-186 球心顺序（用户 2026-09-03 裁决保持 `{Fable}/{普通}`）、RAW-177#3 深链不构成已读、RAW-190 Host 未读权威、RAW-019 退避序列。

## Design

- [codexhost-discovery.cjs](../../../../preload/codex/codexhost-discovery.cjs#L48)：`threadMemory` 由注入的 `storage()` 载入/写回；`seatThread` 决定 `statusChangedAt` 延续与已读取代；`rememberExternalOpenRead` / `isExternalOpenedRead`；`honorExternalOpenRead` 同时写记忆。
- [index.js](../../../../preload/index.js#L1290)：discovery 注入 `storage: () => globalThis.utools?.dbStorage`；`codexDesktopUnreadObservation` 额外进程分支与 `sanitizeCodexThreads` 传 `openedRead`。
- [quota.cjs](../../../../preload/claude/quota.cjs#L82)：`keyIdentity` 解析两种键形；`readClaudeAppUsageOrganizationHint` 经 [plan-usage.cjs](../../../../preload/claude/plan-usage.cjs#L52) `readOrganization()` 取平局提示。
- [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L48)：`CompanionQuotaRefreshReceipt`、`companionQuotaRefreshReceiptText`、`claudeAppQuotaReadable`、`claudeQuotaReadingStale`、组 `note`。
- [codexController.ts](../../../../src/runtime/codexController.ts#L3540)：`refreshQuota()` 等待 Claude 读取，写 `quotaRefreshReceipt` 进 Float `companion` 切片并 bump revision；`recordClaudeQuotaRead` 同步产出回执车道事实。
- [FloatApp.vue](../../../../src/FloatApp.vue#L366-L384)：`quotaFeedback` 监听回执 `at`，8 秒后清空；模板 [L3474-L3475](../../../../src/FloatApp.vue#L3474-L3475) 以 `.float-quota-feedback` 覆盖同一行；组 `note` 为 `.float-quota-note` 「!」标记。
- 收敛：[claude.ts](../../../../src/domain/claude.ts#L181) `withClaudeQuotaWindows`；[codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L36) `codexWeeklyReading`；[open-handoff.cjs](../../../../preload/companion/open-handoff.cjs#L66) `normalizeOpenResult` / `normalizeOpenLaunch`；[desktop-shadow.cjs](../../../../preload/codex/desktop-shadow.cjs#L51) `codexApplyNativeConnectorUnread`。

## 重复判定收敛台账（审计 31 项）

第一轮收敛 6 项（见「实现」）；F-3 第二轮再收敛 5 项：

- #5 / #8 / #19：`codexAcknowledgementCoversTurn` 成为唯一的「已读确认是否覆盖该 Turn」规则，父线程 `codexDesktopOpenedReadCoversCompletion` 与 Side Chat `codexReconcileInventorySideOpenedReadWithTurn` 都改为调用它；Side 路径原来在「start 相等」时不比 `completedAt`，现与父路径一致。
- #9：扫描路径的 `sanitizeCodexThreads` 把 `lastTurnId` 一并传入，Turn 身份快路径可用。
- #12 / #13：分支投影里被观察层提前回答的 `.has(threadId)` 分支与重复施加的 `openedRead` 守卫删除。
- #24 / #25（部分）：`mergeClaudePlanUsage` / `mergeClaudeQuotaWindows` / `staleClaudeQuota` 共用 `claudeQuotaWindowFreshness`、`claudeQuotaMergedStatus`、`markExpiredClaudeQuotaWindows`；`normalizeClaudeQuota` 对上游直出 payload 保留更严的 `plausibleResetAt` 规则（有意差异，已注释）。
- 顺手：`codexForgetDesktopOpenedReadThread` 一行包装内联；入口棘轮 14288 → 实测值。

第三轮再收敛 2 项：

- #14 / #15：机器子跑（subagent / guardian）与已读确认的裁决只在 `codexDesktopUnreadObservation` 顶部各出现一次；Side Chat 库存证据只存原始官方未读成员关系（`unreadKnown = unreadIds instanceof Set`），分支投影先问观察层再回退到证据，不再各自重复机器子跑与 `openedRead` 判定。聚合前过滤机器子跑子项的 `codexDesktopAggregateUnread` 保留：它决定的是「子项是否参与父级合并」，与观察层「子项读作什么」不是同一判定。

判定为**有意差异**、不再列为冲突：#3 / #4（额外进程对 Desktop snapshot-false / event-true 不认，是 RAW-190 / RAW-193 的产品规则）、#16（`sanitizeCodexThreads` 的原生分支写的是 Desktop 原始持久未读，供 `connectorHasUnreadTurn` 作为回退基线；若换成已解析的观察值，已读确认被新 Turn 清掉后回退会误读为已读）、#26（水面 5h、球心与外圈周额度是各通道的产品含义）。

第四轮（F-2-b，用户确认接受模块缺失降级）再收敛 2 项：

- #1 / #2：新增 [desktop-unread-evidence.cjs](../../../../preload/codex/desktop-unread-evidence.cjs#L1)（`desktopReadEvidence` 三态 `read | unread | null`、`persistedConnectorUnread`）。入口的 `codexDesktopUnreadObservation` 经既有 `codexDesktopShadow` 绑定取用并认两种极性；CodexHost lane 直接 require 且只认 `read`（Desktop unread-true 不压过 Host）。discovery 的 `desktopAppRead` 与内联持久回退删除；入口棘轮 14282 → 14277。

第五轮（用户裁决 F-1-b、F-2-a、F-2-b）再收敛 4 项：

- #17 / #18（F-1-b）：正式声明 Codex 已读由 Provider（preload）持有——Desktop 读事件、EyPc 跳转确认表、CodexHost 线程记忆都在 preload 裁决，Kernel 只投影；`honorExternalOpenRead` 不再写从未到达 Kernel 的 `confirmsRead: true`，Kernel 特性表旁注明来源。RAW-193 归属随之明确。
- #20（F-2-a）：根观察只在**没有成员**时取线程级值（此时它就是根自身的读数）；有 Side Chat 成员时根观察只带主分支自身未读，成员作为节点发布，Kernel `aggregateMemberUnread` 是唯一合并点。入口的 `codexDesktopAggregateUnread` 保留为 preload 内部调度启发（完成后是否补读未读、是否跳过重复完成）并在无私有证据时供回退分支使用，不再是发布状态的第二个合并层。
- #30 / #31（F-2-b）：新增 [contracts/claude-quota-vocabulary.json](../../../../contracts/claude-quota-vocabulary.json#L1)，由 `generate-companion-contracts` 同时生成 [quota-vocabulary.cjs](../../../../preload/claude/quota-vocabulary.cjs#L1) 与 [claudeQuotaVocabulary.ts](../../../../src/domain/generated/claudeQuotaVocabulary.ts#L1)：`five_hour / seven_day` 基键、别名、scoped 键正则、窗口分钟数与 `5h / 周` 长短标签只写一次；preload 归一器、domain 描述器、展开卡短标与紧凑卡 `5h` 全部改引。

仍未动：无——审计 31 项全部处置（收敛 19 项、有意差异 4 项、其余为同一项的重复登记）。

## Verification

- 聚焦 vitest：`codexhostDiscovery`（+3 例）、`claudeQuotaFallback`（+3 例）、`companionPresentation`（+2 例）、`codexPresentation`（+1 例）、`claudeCompanionController`（+1 例）；`tests/domain` 全部 + 平台桥 + Kernel + UI 共 43 文件 979 例通过。
- `pnpm run typecheck`、`sync:preloads`、`build`、`validate:mirrors`、`validate:entry-budget`（棘轮 14295 → 14288 行，函数 278 不变）、`validate:requirements`、`validate:error-memory` 通过。
- 真机：本机 `withAccessToken` 实测由 `null` 变为有令牌；宿主重载后水球并列读数、凭据行、刷新回执与额外进程已读稳定性待用户验收。
