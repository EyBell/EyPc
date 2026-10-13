---
id: eypc-companion-recovery-events-anonymous-owner
status: verified
scope: project
fingerprint: companion-lifecycle-diagnostics__generic-recorder-leaks-reference-or-missing-provider-splits-anonymous-namespace__existing-owner-with-provider
first_seen: 2026-10-13
last_verified: 2026-10-13
review_after: 2027-01-13
evidence:
  - preload/index.js
  - preload/companion/task-kernel.cjs
  - scripts/check-companion-diagnostic-privacy.mjs
  - scripts/check-companion-lifecycles.mjs
  - tests/scripts/companionDiagnosticPrivacy.test.ts
tags:
  - companion
  - lifecycle
  - preservation
---

# 生命周期诊断的匿名 owner 与 Provider 命名空间

## Symptom / Wrong Assumption

两种恢复事件使用通用 recorder，误认为底层必然会匿名化 taskRef。现有日志只统计命中次数，没有复制原始任务标识。

根相位与 Side 拓扑均经过匿名 owner，却因根相位未传顶层 Provider 而落入 unknown 命名空间，同一个根 key 的指纹无法关联。仅在 details 中写 Provider 不满足 owner 入参合同。

## Verified Root Cause

desktop-resubscribe 与 desktop-replacement-snapshot 绕过既有 recordCompanionDiagnosticEvent，通用 recorder 仅限制长度而不散列。这两个调用改用现有 owner，仍执行原重订/跟随操作并保留诊断字段。

phase-transition 的 provider 原来只在 details 中，owner 却读取顶层 provider；Side 合并传 codex，根相位传 unknown。同一 key 的两类真实日志无法关联，真实 Kernel 检查与移除该字段的坏实现均复现这一缺口。修复仅增加顶层 Provider 字段，状态归约、传输和跟随不变。

## Detection Order / Prevention Rule

检查事件调用 owner，运行真实匿名函数验证同进程一致指纹及无原始标识，再用绕过 owner 的坏实现验证检测会失败。不删除事件来隐藏泄露，不清理用户已有日志，不保留真实标识样本。

凡带 taskRef 的生命周期事件都必须传与拓扑/任务所属来源相同的顶层 Provider；不能把匿名格式正确等同于跨事件可关联。17 点生命周期 gate 同时检查真实 Kernel 输出的 Provider，缺失字段的负向 canary 必须拒绝。

## Alternative Route

复用现有 salted anonymous owner；标准产物校验自动验证两种事件，三项正负回归通过。旧日志并不会因新版本自动改写。

Provider 命名空间修复复用同一 owner 与同一 root key；source/dist 时序门禁和负向 canary 已通过。它只证明诊断合同，真实子成员因果与宿主像素仍须独立证据。

## Occurrence History

2026-10-13：恢复日志观察与源码确认，修复及自动检测完成。[核验](../../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L1)。

2026-10-13 重载后：两次重订及两次替换快照事件均实际触发，4 次 taskRef 都经过现有 salted owner；只记录计数与格式核验，不保存真实身份。

2026-10-13 续核：至 17:31，49 次恢复事件全部匿名；新发现根相位 Provider 缺失使跨事件关联失败，补字段并加入负向 canary；8 文件回归 268/268、source/dist 各 17 点通过。
