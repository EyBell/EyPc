---
id: eypc-detection-recorded-without-any-repair-path
status: candidate
scope: project
fingerprint: canonical-proposal-mismatch__outcome-labelled-superseded-with-no-action__streak-on-stationary-package-queues-reconciliation
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2026-09-13
evidence:
  - preload/index.js
  - vibe/specs/260810/1155-install-runtime-diagnostics/raw-requirement.md
tags:
  - companion-task-state
  - diagnostics
  - recovery
---

# 只记录不修复的检测

## Symptom

诊断日志显示系统**准确知道**自己出错了——某条提议与已发布 canonical 包持续不一致——却没有任何后续动作。真实宿主里同一处失配以恒定计数持续 23 分钟，期间每次提议都被打上 `superseded` 标签，任务始终不更新。

## Wrong Assumption

以为把「提议是否真被接纳」纳入诊断就完成了闭环。RAW-166 §78 要求 `accepted` 必须以最终 canonical 匹配为准、改判记 `superseded`——这条被实现为**纯标注**，默认后续会有别的机制收敛，实际没有。

## Verified Root Cause

检测与动作被分开设计而只落地了检测。`canonicalMismatchCount > 0` 唯一的效果是改变一个字符串标签；没有重试、没有定向复核、没有降级。于是「已知的错」和「未知的错」在系统行为上完全等价，检测本身不产生任何价值，只产生日志。

## Correct Route

任何持续性检测都必须绑定一个动作，哪怕只是降级或告警。

本例的正确形态：按**canonical 包是否停滞**计连击，而不是按事件次数。包在推进说明归约仍在正常工作，此时的瞬时失配是正常中间态，介入只会重复发布相同语义（第一版按事件计数即因此打挂了 RAW-162 的 Goal 抑制回归）。只有包停滞不动时的连续失配才是真卡住，达到阈值后排入该 provider 的定向 reconciliation 并记 `canonical-mismatch-repair`。

推广规则：**判据要落在「系统是否在前进」上，而不是「错误出现了几次」。** 前者区分得开中间态与卡死，后者区分不开。

## Detection Order

1. 在诊断里搜只出现在 `details` 而从不改变控制流的字段——它们是纯标注的信号。
2. 对每个这样的字段问一句：它非零时系统会做什么？答不上来就是本条。
3. 加动作前先确认判据能区分「中间态」与「卡死」，否则会在健康路径上制造重复副作用。

## Occurrence History

- 2026-08-13：用户报告 Codex 任务状态不跟随，日志显示恒定 `canonicalMismatchCount: 1` 持续 23 分钟。已加入停滞判据的修复路径并通过 12 文件 476 项定向矩阵；修复对真实卡死的实际效果**尚未在宿主验证**，故保持 candidate。
