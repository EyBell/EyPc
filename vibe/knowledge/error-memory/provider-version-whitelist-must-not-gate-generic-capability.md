---
id: eypc-provider-version-whitelist-must-not-gate-generic-capability
status: verified
scope: project
fingerprint: companion-archive-capability__version-whitelist-hard-gate__breaks-on-provider-autoupdate
first_seen: 2026-08-21
last_verified: 2026-09-05
review_after: 2026-12-05
evidence:
  - preload/claude/archive.cjs
  - preload/cursor/archive.cjs
  - src/runtime/codexController.ts
  - tests/platform/claudeBridge.test.ts
  - tests/platform/cursorArchive.test.ts
tags:
  - companion-provider
  - archive
  - capability-gating
  - version-drift
---

# 通用能力位不得用 Provider 版本白名单硬门禁

## 症状

用户点「归」提示「当前 Provider 无法安全确认归档边界」。Claude 任务此前可归档、某天起全部被拒；Cursor 任务从未成功归档。状态本身（待继续/已完成）完全满足归档条件。

## 错误假设

把「写入格式只在版本 X 上验证过」直接编译成能力位硬门禁（`stateCompatibility === 'compatible'` / `SUPPORTED_APP_VERSIONS.has(version)`），假设白名单会随版本更新维护。实际 Provider App 自动升级（本例 Claude `1.30096.5` → `1.34493.1`），白名单必然滞后，通用能力静默熄灭且提示语不指向真因。Cursor 则是另一种形态：投影层写死 `canArchive: false`，把「尚未实现执行通道」冻结成「永远不可归档」。

## 已验证根因

归档资格被三层 provider 特定条件分别阻断：① preload capability 计算（两处 `compatibility === 'compatible'`）；② `preload/claude/archive.cjs` 派发时的版本白名单 + phase 复读的 compatibility 要求；③ 渲染层 `resolveClaudeCodeState` / `resolveCursorAgentState` 把能力位与版本或 provider 绑定。而真正保证安全的从来是执行事务里的结构化校验（目标唯一、指纹重校、原子写、写后回读、活动库存复核），它们与版本无关。

## 检测顺序

1. 能力位被拒时，先沿「卡片 capability → Kernel canonical → preload 能力计算 → 派发适配器」逐层 grep 该能力名，找出每一处布尔条件。
2. 区分两类条件：状态因果（进行中/终态/unknown）与来源特定（provider、版本、平台白名单）。
3. 对来源特定条件追问：执行事务本身是否已有结构化校验兜底？有则该条件是冗余硬闸。
4. 复核本机 Provider 实际版本与白名单差距，确认「曾可用、升级后熄灭」的时间线。

## 预防规则

资格门禁只允许状态筛选（进行中阻断；待继续/已完成放行；unknown 因证据不足暂缓），对所有 Provider 同一条规则。Provider/版本差异只允许出现在执行层，且必须表达为「派发时结构化重验 + 写后回读」的三态结果（archived/failed/indeterminate），不得表达为资格白名单。证据质量车道同样不得用版本号整段熄火；失配按行丢弃。新增 Provider 时，能力位默认跟随状态，执行通道未实现要暴露为「模块不支持」的运行时提示，而不是投影层写死 false。

## 替代路线

- 状态：`verified`。
- 前置条件：执行事务具备目标重验与写后复验（Claude `archiveSessionMetadata`；Cursor `archive.cjs` 单行 UPDATE 内守卫）。
- 有序步骤：状态门禁放行 → 派发适配器重验目标仍非进行中 → 单目标写入 → 回读复验 → 三态上报。
- 验证：`pnpm exec vitest run tests/platform/cursorArchive.test.ts tests/platform/claudeBridge.test.ts tests/domain/claudeCode.test.ts tests/domain/cursorAgent.test.ts tests/runtime/claudeCompanionController.test.ts tests/runtime/codexController.test.ts`。
- 适用边界：EyPc companion 所有任务级能力位（归档、打开、暂停等）以及证据质量车道（含 Claude app-log 热未读）。版本字符串可以出现在诊断里，不得编译成准入 Set。
- 回退：若某版本实测出现写入结构或日志语法漂移，修执行层校验或按新行式适配，仍不得回退成版本资格/证据质量白名单。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-21 | 归档统一为状态门禁 | 用户报 Claude/Cursor 归档全部被拒 | Claude 版本白名单硬闸 + Cursor 投影写死不可归档 | 拆白名单、Cursor 落地写库归档、门禁改状态筛选 | verified |
| 2026-08-25 | 状态消退慢核验 | 用户报 Claude 已完成/未读消失特别慢 | 同一白名单滞后（1.34493.1 未入 `SUPPORTED_APP_VERSIONS`）令 app-log 热未读快清车道熄火，落到 LevelDB 分钟刷盘地板；当时误标为「证据质量门的合法形态」 | 诊断链沉淀至 [claude-unread-decay-blocked-by-version-gate-and-minute-flush](claude-unread-decay-blocked-by-version-gate-and-minute-flush.md#L1)，扩白名单为当时 candidate | verified |
| 2026-09-05 | 取消全部版本准入 | 用户明确不要把版本当白名单限制 | 第四次复现后仍想扩名单 | 拆除 app-log 版本准入（RAW-211）；本记录不再把证据质量车道当例外 | verified |
