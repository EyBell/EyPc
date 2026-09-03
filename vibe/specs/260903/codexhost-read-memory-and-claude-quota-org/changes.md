# Changes: 额外进程已读记忆与 Claude App 额度组织仲裁

| Path | Core description |
| --- | --- |
| `preload/codex/codexhost-discovery.cjs` | 线程记忆（`CODEXHOST_THREAD_MEMORY_STORAGE_KEY`，≤ 300）：`seatThread` 延续 `statusChangedAt`、`rememberExternalOpenRead` / `isExternalOpenedRead`、Host unread 边沿取代已读、归档删记忆；`compareHostDesktopUnread` 接受 `openedRead`；`codexhostResetDiscovery({ forgetMemory })` |
| `preload/index.js` | discovery 注入 `storage`；未读观察与 `sanitizeCodexThreads` 查持久已读；官方未读原子写连接器收为 `codexApplyNativeConnectorUnread` 一处 |
| `preload/codex/desktop-shadow.cjs` | 承载 `codexApplyNativeConnectorUnread`（入口预算） |
| `preload/claude/quota.cjs` | `keyIdentity`：`acct:<account>|<profile>:<org>` 组织取第 2 段、账号取第 1 段；多组织平局用 App 计量组织裁决；导出 `keyIdentity` |
| `preload/claude/plan-usage.cjs` | `readOrganization()`：最新样本的 `org` |
| `preload/companion/open-handoff.cjs` / `task-actions.cjs` / `navigation.cjs` | `normalizeOpenResult` / `normalizeOpenLaunch` 收进 open-handoff，两处改 require |
| `src/domain/claude.ts` | `withClaudeQuotaWindows` |
| `src/domain/codexPresentation.ts` | `codexWeeklyReading` |
| `src/domain/companionPresentation.ts` | `CompanionQuotaRefreshReceipt`、`companionQuotaRefreshReceiptText`、`claudeAppQuotaReadable`、`claudeQuotaReadingStale`、组 `note`、`quotaRefreshReceipt` 切片字段 |
| `src/runtime/codexController.ts` | `refreshQuota()` 等待 Claude 读取并发布回执；两处窗口重建改用 helper；诊断主读数改用 `claudePrimaryQuotaWindow` |
| `src/FloatApp.vue` / `src/styles/float.css` | 可见刷新反馈 `.float-quota-feedback`（真机复核后改为覆盖同一行的 overlay）、凭据状态 `.float-quota-note`（改为「!」标记 + 200ms 提示 + 可访问名称）、`selectedWeekly` 改用 helper |
| `preload/claude/quota.cjs`（真机补丁） | `MIN_USAGE_API_INTERVAL_MS = 60s`：成功后的 usage API 间隔不再跟随 10 秒级刷新旋钮；fallback 用例 +1 |
| `src/components/CodexWaterBall.vue` / `src/pages/CodexPage.vue` | 周读数取值改用 `codexWeeklyReading` |
| `tests/platform/codexhostDiscovery.test.ts` | +3：roster 丢失保时间戳、reset/reload 保已读、unread 边沿与归档 |
| `tests/platform/claudeQuotaFallback.test.ts` | +3：`acct:` 键形、多组织平局与 fail-closed、sub-minute cadence 下限 |
| `tests/domain/companionPresentation.test.ts` | +2：凭据 note、回执文案 |
| `tests/domain/codexPresentation.test.ts` | +1：`codexWeeklyReading` |
| `tests/runtime/claudeCompanionController.test.ts` | +1：手动刷新回执 |
| `vibe/specs/requirements/codex-raw-203.md` / `claude-raw-204.md` + 两模块索引 | 登记 |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` / `PROJECT_STATUS.md` / `vibe/knowledge/ARCHITECTURE.md` / `src/help/guides/codex.md` | 当前真值、状态枢纽、架构与帮助同步 |
| `scripts/validate-preload-entry-budget.mjs` | 行数棘轮 14295 → 14288，F-3 再按实测下调（带日期注释） |
| `preload/index.js`（F-3） | `codexAcknowledgementCoversTurn` 单一覆盖规则；Side 路径改用；扫描传 `lastTurnId`；删两处死分支；内联 forget 包装 |
| `src/domain/claude.ts`（F-3） | `claudeQuotaWindowFreshness` / `claudeQuotaMergedStatus` / `markExpiredClaudeQuotaWindows`，三处合并/过期路径共用 |
| `preload/index.js`（F-3 第三轮） | 机器子跑与已读确认裁决只在 `codexDesktopUnreadObservation` 顶部；Side 库存证据只存原始成员关系；分支投影去掉重复守卫；棘轮 14284 → 14282 |
| `preload/codex/codexhost-discovery.cjs` / `preload/companion/task-kernel.cjs`（F-1-b） | `honorExternalOpenRead` 不再写 `confirmsRead: true`；Kernel `PROVIDER_TRAITS.codex` 注明已读由 Provider 持有 |
| `preload/index.js`（F-2-a） | 根观察只在无成员时取线程级未读；有成员时 Kernel 唯一合并 |
| `contracts/claude-quota-vocabulary.json` + `scripts/generate-companion-contracts.mjs` + `preload/claude/quota-vocabulary.cjs` + `src/domain/generated/claudeQuotaVocabulary.ts`（F-2-b 第二项） | 额度窗口词汇表单一来源与两侧生成镜像；`quota.cjs` / `claude.ts` / `companionPresentation.ts` / `FloatApp.vue` 改引 |
| `preload/codex/desktop-unread-evidence.cjs`（F-2-b 第一项，新增） | `desktopReadEvidence` 三态与 `persistedConnectorUnread`，入口经 `desktop-shadow` 再导出取用，discovery 直接 require；`utools-preload-assets` 登记；棘轮 14282 → 14277 |
| `vibe/knowledge/error-memory/modules/codexhost-external-processes.md` + `README.md` + `companion-task-state.md` | task-state 模块到 30 条上限，按自适应阈值拆出 CodexHost 额外进程模块（3 条主记录迁入，含前一会话未登记的 archived-row 记录） |
| `vibe/knowledge/error-memory/codexhost-jump-read-lost-with-roster-timestamp.md` / `claude-app-token-cache-acct-key-organization-segment.md` | 两条错误记忆（verified） |

## 入口预算

`validate:entry-budget` 记录值原为 14295 行 / 278 函数（RAW-202 棘轮）。本轮把 `codexApplyNativeConnectorUnread` 放进 `desktop-shadow.cjs`（鸭子类型判 `unreadIds`，避免 VM realm 下 `instanceof Set` 失真），入口净 -7 行、函数数不变；棘轮按规则下调为 14288 行（`scripts/validate-preload-entry-budget.mjs` 带日期注释）。
