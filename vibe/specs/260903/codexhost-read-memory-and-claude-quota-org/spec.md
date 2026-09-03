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
- Add（RAW-204）: `acct:<account>|<profile>:<org>:…` 键形组织取第 2 段；多组织平局用 App `plan-usage-history` 最新样本的 `org` 裁决；Claude 额度组 `note`；手动刷新回执 `companion.quotaRefreshReceipt` 与浮窗可见反馈。
- Change: `compareHostDesktopUnread(known, { openedRead })`；`codexhostResetDiscovery({ forgetMemory })` 仅测试用。
- Unchanged: RAW-186 球心顺序、RAW-177#3 深链不构成已读、RAW-190 Host 未读权威、RAW-019 退避序列。

## Design

- [codexhost-discovery.cjs](../../../../preload/codex/codexhost-discovery.cjs#L48)：`threadMemory` 由注入的 `storage()` 载入/写回；`seatThread` 决定 `statusChangedAt` 延续与已读取代；`rememberExternalOpenRead` / `isExternalOpenedRead`；`honorExternalOpenRead` 同时写记忆。
- [index.js](../../../../preload/index.js#L1290)：discovery 注入 `storage: () => globalThis.utools?.dbStorage`；`codexDesktopUnreadObservation` 额外进程分支与 `sanitizeCodexThreads` 传 `openedRead`。
- [quota.cjs](../../../../preload/claude/quota.cjs#L82)：`keyIdentity` 解析两种键形；`readClaudeAppUsageOrganizationHint` 经 [plan-usage.cjs](../../../../preload/claude/plan-usage.cjs#L52) `readOrganization()` 取平局提示。
- [companionPresentation.ts](../../../../src/domain/companionPresentation.ts#L48)：`CompanionQuotaRefreshReceipt`、`companionQuotaRefreshReceiptText`、`claudeAppQuotaReadable`、`claudeQuotaReadingStale`、组 `note`。
- [codexController.ts](../../../../src/runtime/codexController.ts#L3540)：`refreshQuota()` 等待 Claude 读取，写 `quotaRefreshReceipt` 进 Float `companion` 切片并 bump revision；`recordClaudeQuotaRead` 同步产出回执车道事实。
- [FloatApp.vue](../../../../src/FloatApp.vue#L368)：`quotaFeedback` 监听回执 `at`，额度行下方 `.float-quota-feedback` 显示 8 秒；组 `note` 以 `.float-quota-note` 显示。
- 收敛：[claude.ts](../../../../src/domain/claude.ts#L181) `withClaudeQuotaWindows`；[codexPresentation.ts](../../../../src/domain/codexPresentation.ts#L36) `codexWeeklyReading`；[open-handoff.cjs](../../../../preload/companion/open-handoff.cjs#L66) `normalizeOpenResult` / `normalizeOpenLaunch`；[desktop-shadow.cjs](../../../../preload/codex/desktop-shadow.cjs#L51) `codexApplyNativeConnectorUnread`。

## 未收敛的重复判定（审计登记，待裁决）

只读审计共 31 项；本轮收敛 6 项。未动的主要为：

- `desktopAppRead`（discovery）与 `codexDesktopUnreadObservation`（entry）对 snapshot-false / event-true 的策略不一致（审计 #3 / #4）；
- 观察层裸 `.has(threadId)` 与扫描层 `coversCompletion` 两套「已读是否覆盖」（#5 / #8 / #19）；
- Kernel `readAcknowledgements` 对 Codex 是死码（`PROVIDER_TRAITS.codex.readAcknowledgements === false`，#18）；`honorExternalOpenRead` 的 `confirmsRead: true` 被 `normalizeCompanionOpenReceipt` 压回 false（#17）——两者都不影响本轮修复（已读由 preload 记忆承载）；
- `claude.ts` 三处 status / freshness 派生规则不一致（#24 / #25），`companionAggregate` 与 `claudePrimaryQuotaWindow` 的 short/weekly 优先级差异（#26），前后端键词汇表重复（#31）。

## Verification

- 聚焦 vitest：`codexhostDiscovery`（+3 例）、`claudeQuotaFallback`（+2 例）、`companionPresentation`（+2 例）、`codexPresentation`（+1 例）、`claudeCompanionController`（+1 例）；`tests/domain` 全部 + 平台桥 + Kernel + UI 共 43 文件 979 例通过。
- `pnpm run typecheck`、`sync:preloads`、`build`、`validate:mirrors`、`validate:entry-budget`（棘轮 14295 → 14288 行，函数 278 不变）、`validate:requirements`、`validate:error-memory` 通过。
- 真机：本机 `withAccessToken` 实测由 `null` 变为有令牌；宿主重载后水球并列读数、凭据行、刷新回执与额外进程已读稳定性待用户验收。
