---
id: eypc-one-mechanism-silently-covering-anothers-job
status: verified
scope: project
fingerprint: goal-suppression-depended-on-stale-lane-side-effect__fixing-the-lane-exposed-the-gap__declared-owner-must-hold-alone
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2026-11-13
evidence:
  - preload/companion/task-kernel.cjs
  - preload/index.js
  - tests/platform/codexAppServerBridge.test.ts
tags:
  - engineering-contracts
  - refactor-safety
  - phase-ordering
---

# 一个机制在悄悄替另一个机制干活

## Symptom

修复一处明确的缺陷后，一条**完全无关**的既有回归开始失败。被打挂的用例守的是一条真实产品条款，不是过时断言，所以既不能删也不能改期望值。

## Wrong Assumption

以为修复引入了新缺陷，于是去查改动本身。也容易反向误判——认为那条回归"本来就脆"，把它调松了事。两种处理都会掩盖真实结论。

## Verified Root Cause

被修复的机制此前**顺带**承担了另一条契约的职责，而那条契约的声明所有者其实没有独立成立。

本例：RAW-162 要求 Goal `active` 期间任何中间 `turn/completed` 都不得发布完成。该抑制的声明所有者是 Kernel 的 Goal 归约。但在 lane 量纲被污染期间，过期 lane 也在拦截同一批推送——两道防线叠在一起，测试始终通过。lane 修好后拦截放宽，Goal 抑制单独扛不住，重复发布立刻出现。

也就是说：**这条回归此前是绿的，但不是因为它守的东西成立，而是因为另一个缺陷恰好挡住了。** 缺陷在充当隐式依赖。

## Correct Route

回归在无关改动下变红，优先假设它暴露了既有缺口，而不是改动引入了新缺陷。处理顺序：

1. 先确认被打挂的用例守的条款当前是否仍然有效（查现行 requirement，不查测试历史）。
2. 有效则定位其声明所有者，验证该所有者能否**独立**满足条款。
3. 不能独立满足，就补强所有者本身；不要把刚修好的机制改回去恢复那层意外防护。

推广规则：收敛型重构会持续暴露这类隐式依赖。每消除一个多余判断点，都要问一句"它此前还顺带挡住了什么"，并把答案落到对应所有者上。

## Detection Order

1. 看失败用例与改动是否在同一条数据通路上——不在，本条嫌疑最大。
2. 对照现行 requirement 确认条款有效性，再看其所有者的实现是否完整。
3. 只有确认所有者本就完整、且改动确实破坏了它，才按普通回归处理。

## Occurrence History

- 2026-08-13：统一 `sourceLaneGenerations` 量纲后，`codexAppServerBridge` 的 Goal 跨 Turn 用例出现重复完成发布。确认为 lane 过期此前顺带承担了 Goal 抑制；判据改为按 canonical 包停滞计连击后通过，12 文件 476 项定向矩阵全绿。
