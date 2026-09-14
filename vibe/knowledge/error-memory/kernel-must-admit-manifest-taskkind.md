---
id: eypc-kernel-must-admit-manifest-taskkind
status: verified
scope: project
fingerprint: manifest-provider-inventory-accepted__kernel-taskkind-whitelist-omits-kind__cards-never-appear
first_seen: 2026-09-13
last_verified: 2026-09-13
review_after: 2027-09-13
evidence:
  - preload/companion/provider-manifest.json
  - preload/companion/task-kernel.cjs
  - tests/platform/companionProviderAdmission.test.ts
  - vibe/knowledge/companion-provider-onboarding.md
  - vibe/specs/260913/orca-companion/raw-requirement.md
tags:
  - companion-provider
  - kernel
  - provider-onboarding
  - silent-drop
---

# Kernel 必须承认清单里的 taskKind，否则库存成功卡片仍为空

## Symptom

Orca 接入后设置已打开，运行诊断 `cold-preflight-v7` / `reconciliation` 均为 `accepted` 且 `taskCount` 为 9，但悬浮球动态列表没有对应进行中任务。用户看到的是「没接上」。

## Wrong Assumption

以为 Host 预检接受证据节点并且 `taskCount > 0` 就等于 Kernel 已发布根卡。实际还有一层 `normalizeTask` kind 白名单：不认识的 `taskKind` 会整节点丢弃，不报错。

## Verified Root Cause

`provider-manifest.json` 已声明 `orca` / `orca-session`。Evidence Adapter 与预检按该 kind 提交节点。Kernel `normalizeTask` 当时只承认 `codex-thread` / `claude-session` / `cursor-session` / `topology-child` / `local-pin`。`orca-session` 变成空 kind，`normalizeEvidenceNode` 返回 null。诊断计数的是 batch.nodes，Snapshot `tasks` 里没有它们。

同类缺口：导航权威硬编码 Provider 名单（已由 V5 清单取代，见 [new-companion-source-must-register-with-navigation-authority](new-companion-source-must-register-with-navigation-authority.md#L1)）。本条是 **Kernel 准入** 而不是快捷键候选集。

## Detection Order

1. 看诊断：该 Provider 预检是否 `accepted`、`taskCount` 是否大于 0。
2. 对照 Snapshot：`tasks.filter(t => t.provider === id).length` 是否等于该 batch 根节点数。预检有数、Snapshot 为 0 就是本条。
3. 读 Kernel `TASK_KINDS` / `normalizeTask` 是否包含清单 `taskKind`。
4. 不要先去怀疑 CLI、PATH 或设置开关——那些失败时预检不会是 `accepted` + 正 `taskCount`。

## Prevention Rule

清单每增一个 Provider，Kernel 必须用同一份 `taskKind` 准入，禁止再维护一份平行 kind 名单。接入同一轮必须有「该 id 的 running 根卡进入 `views.groups.active`」测试。开发步骤见 [companion-provider-onboarding.md](../companion-provider-onboarding.md#L1)。

## Alternative Route

- 状态: `verified`
- 前置条件: `provider-manifest.json` 已有新 id 与 `taskKind`。
- 有序步骤:
  1. Kernel `TASK_KINDS` / `PROVIDER_TRAITS` 从清单派生。
  2. 跑 `tests/platform/companionProviderAdmission.test.ts`，每个清单 id 必须能把 running 根送进 `views.groups.active`。
  3. 对照诊断 `taskCount` 与 Snapshot 该 provider 根数。
- 验证: `pnpm exec vitest run tests/platform/companionProviderAdmission.test.ts tests/platform/companionTaskKernel.test.ts`
- 适用边界: 所有 first-class Companion Provider。不包括 CodexHost 额外进程（仍走 Codex 车道）。
- 回退: 若派生表无法表达 Codex 独有 Plan/archive 特质，只把那一行留在 traits 表，kind 准入仍必须派生。

## Occurrence History

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-09-13 | Orca 第四 Provider | 用户重载后看不到进行中 | 预检 9 条 accepted，Kernel 不认 `orca-session` | 运行诊断 `taskCount: 9`；浮窗无 OR 卡 | `TASK_KINDS` 从清单派生 + 准入测试 | verified |
