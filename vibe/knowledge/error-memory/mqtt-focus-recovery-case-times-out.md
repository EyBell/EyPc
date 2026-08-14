---
id: eypc-mqtt-focus-recovery-case-times-out
status: candidate
scope: project
fingerprint: mqtt-focus-recovery-regression__test-timed-out-in-5000ms-not-assertion-failure__preexisting-and-outside-default-verification
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2026-11-13
evidence:
  - tests/runtime/action.test.ts
  - vibe/rules/README.md
tags:
  - mqtt
  - testing
---

# MQTT 焦点恢复用例超时

## Symptom

全仓套件里 `tests/runtime/action.test.ts` 的「recovers MQTT message focus after delete and isolates template/history search and selection state」失败，耗时约 5.6 秒。失败形式是 **`Test timed out in 5000ms`**，不是断言不符——用例根本没跑到断言。

## 已确认的边界

- **非近期改动引入。** 把该用例及 `src/runtime` 回退到 2026-08-13 companion 重构之前的版本复验，同样超时。
- **与 companion / codex / preload 侧改动无关。** 那一轮改动的 21 文件定向矩阵全绿，只有全仓套件才暴露此项。
- 单独运行该用例同样超时，不是并发资源竞争。

## 当前处置

按用户 2026-08-13 决定，MQTT 测试已移出默认验证口径（见 [项目规则](../../rules/README.md#L1)）：不选入影响矩阵、不作为交付门禁。**但报告不变**——全仓运行若再次暴露它，仍要说明并归因，不得因为「已知」而沉默。

因此本条**不作为待修缺陷跟进**，只保留线索避免后人重复排查同一段路。

## 排查起点（若将来主动要求修复）

超时而非断言失败，指向用例内有未落定的异步等待而非逻辑错误。优先查该用例中的删除后焦点恢复路径是否在等一个永不到达的 tick 或 flush，而不是先去读 MQTT 业务逻辑。用例位置：`tests/runtime/action.test.ts` 第 3801 行起。

## Occurrence History

- 2026-08-13：Codex actions 域抽取后首次跑全仓套件时暴露。经回退复验确认为既有问题，同轮记录并停止跟进。
