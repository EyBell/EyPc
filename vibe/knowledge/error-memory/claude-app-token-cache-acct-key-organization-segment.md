---
id: eypc-claude-app-token-cache-acct-key-organization-segment
status: verified
scope: project
fingerprint: claude-quota-usage-api-credential-unavailable-forever__tokencachev2-acct-key-segment1-is-account-profile-not-org__several-profiles-read-as-several-orgs
first_seen: 2026-09-03
last_verified: 2026-09-03
review_after: 2026-12-03
evidence:
  - preload/claude/quota.cjs
  - preload/claude/plan-usage.cjs
  - tests/platform/claudeQuotaFallback.test.ts
tags:
  - claude
  - quota
  - credential
  - token-cache
---

# Claude App `acct:` 令牌键的第 1 段不是组织：多 profile 被判成多组织后永远 credential-unavailable

## 症状

授权「允许读取 Claude App 额度」后，水球球心只剩普通周一个数（`94%`），没有 Fable 并列读数；展开卡 Claude 组只有 5h / 周两块且标为可能过期；点击刷新看不出变化。诊断 `quota/claude-quota-read` 每条都是 `usageApi: skipped|failed`、`accessStatus: credential-unavailable`、`scopedCount: 0`。

## 错误假设

以为是 Keychain 读不到、令牌过期、或 usage API 变更。实测 `security find-generic-password` 可读、解密成功、三条记录都未过期。

## 已验证根因

Claude App 新版 `oauth:tokenCacheV2` 键形为 `acct:<accountUuid>|<profileUuid>:<orgUuid>:https://api.anthropic.com:<scopes>`（旧键 `<client>:<org>:…`）。`candidateOrganizationId` 一律取 `split(':')[1]`，在新键上得到 `<account>|<profile>`；同一账号两个 profile 段不同 → 「两个组织」→ 无 `activeOrganization` 提示 → fail-closed 返回空令牌，且退避后每次重复。App 自己的 `plan-usage-history.json` 与 Claude Code `~/.claude.json` 的 `organizationUuid` 都等于第 2 段。

## 修复

`keyIdentity(key)`：`acct:` 且第 1 段含 `|` 时组织取第 2 段、账号取第 1 段 `|` 前；`candidateAccountIds` 合并键内账号；多组织平局用 `plan-usage.cjs#readOrganization()`（最新样本 `org`）裁决，提示不命中任何候选仍 fail-closed。

## 检测顺序

1. 诊断 `claude-quota-read` 的 `accessStatus` 长期 `credential-unavailable` 且 `retryInMs` 按 1m/5m/15m/1h 循环 → 不是网络，是令牌选取。
2. 用本仓 `withAccessToken(deps, '', t => t.length)` 只打印长度：`null` 即仲裁失败。
3. 只打印键形（uuid / 长串打码）：看第 1 段是否含 `|`、第 2 段是否与 `plan-usage-history` 的 `org` 相等。

## 预防规则

对第三方缓存键做位置解析时，必须用本机真值（App 自己写的 org 样本）交叉验证段位含义，并让测试同时覆盖新旧两种键形；「fail-closed」要能被诊断出「为什么关」，而不是只留下 `credential-unavailable`。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-03 | 球心 Fable 并列读数消失核验 | 用户报只剩 `94%` | 先看三车道年龄与退避 | 解密后按键形定位第 1 段被当组织；改取第 2 段 + App 计量组织平局 | 48/48；本机 `withAccessToken` 由 null 变有令牌 |
