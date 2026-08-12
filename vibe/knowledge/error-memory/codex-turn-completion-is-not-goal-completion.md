---
id: eypc-codex-turn-completion-is-not-goal-completion
status: verified
scope: project
fingerprint: codex-long-running-goal__turn-completed-published-whole-task-completed__use-private-goal-evidence-as-the-completion-boundary
first_seen: 2026-08-12
last_verified: 2026-08-12
review_after: 2026-09-12
evidence:
  - preload/index.js
  - preload/companion/task-kernel.cjs
  - tests/platform/codexAppServerBridge.test.ts
  - tests/platform/companionTaskKernel.test.ts
  - vibe/specs/260810/1155-install-runtime-diagnostics/spec.md
  - vibe/specs/260810/1155-install-runtime-diagnostics/verify.md
tags:
  - codex-companion
  - goal-evidence
  - turn-lifecycle
  - completion-boundary
  - causal-ordering
  - atomic-publication
---

# A Completed Turn Is Not A Completed Long-running Goal

## Symptom

同一 Cloud 任务在持续自动执行期间真实发布 `running → completed → running`。Float 对每个任务包都正常应用，因此现象不是 Renderer 闪烁或消费者缓存失效，而是 Host 上游先发布了错误的完成态。

## Wrong Assumption

把 App Server 的每个 `turn/completed` 当成整个任务完成。这个假设只适用于没有长期 Goal 的普通会话；在长期执行中，一个 Turn 只是 Goal 内部的一轮，后续自动 Turn 合法开始，但中间任务不应进入“已完成”。

## Verified Root Cause

[preload/index.js](../../../preload/index.js#L1) 原先在每个 exact `turn/completed` 后直接形成任务终态；[task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) 又允许严格更新的 Turn 恢复 running。两段逻辑各自合理，却缺少“当前 Goal 是否真正完成”的产品边界，组合后便形成稳定可复现的 completed 回跳。

## Evidence

- [codexAppServerBridge.test.ts](../../../tests/platform/codexAppServerBridge.test.ts#L1) 覆盖 active Goal 跨两个自动 Turn 全程无 completed、漏 Goal 通知时由终态候选补读并单次完成、四种非活动 Goal 映射待继续、cleared/unsupported 回退、暂时失败与真实 RPC timeout 保留 verifying、重复/迟到结果去重，以及 Kernel→Float applied 链的隐私边界。
- [companionTaskKernel.test.ts](../../../tests/platform/companionTaskKernel.test.ts#L1) 覆盖 Goal 优先级、main/Side 混合聚合和中间 Turn 完成的原子抑制。
- Goal Evidence 只保留有限 status、updatedAt、freshness 和会话因果序号；测试故意向假 App Server 响应加入 objective、用量和原始身份字段，并证明它们不进入公共 Activity、任务包或 Float。

## Detection Order

1. 先确认产品表面代表“单轮 Turn”还是“长期 Goal”；不要从事件名称直接推导完成边界。
2. 同时记录 Host 发布的 task-package phase 与 Float applied revision。若两端一致出现错误终态，先查 Evidence/Kernel，不查动画或 CSS。
3. 在接受终态候选前检查当前 Goal：`active` 保持 running；输入/审批仍优先；四种暂停/阻塞/限制态进入 stopped；只有 `complete` 允许完成。
4. 若 Goal 未知或过期，先做同 key single-flight `thread/goal/get`；暂时失败保留最近稳定非终态并标记 verifying，禁止先完成再纠正。
5. 用 App Server 流序号、查询基线和 `goal.updatedAt` 拒绝迟到结果；严格更新的新 Turn 可以取代旧非活动 Goal 并开启新 epoch。时间戳精度相等时必须由更大的流序号裁决，不能把“相等”误当旧 Goal 仍当前。
6. 核对 Goal-only 变化是否强制进入同一 Branch Evidence + Host draft 语义事务；公开线程指纹相同不能把私有证据更新去重掉。

## Prevention Rule

长期 Goal 存在时，Goal status 是任务完成权威，Turn outcome 只是轮次证据。Goal active/verifying 下的 `turn/completed` 即使携带 unread=true 也不得发布任务 completed/completed-unread；终态候选必须使用新鲜 Goal Evidence。只有 Goal complete 且没有因果上更新的 active/waiting 时，才依据最终 unread 单次发布 completed-unread/completed。Goal-only 变化必须原子提交到唯一 Kernel 包，公共 Renderer 不新增 Goal 字段或第二套 reducer。只有明确无 Goal、Goal cleared 或 RPC 明确 method-not-found 时，才回退既有 Turn 语义。

## Latest Applicable Implementation

- [preload/index.js](../../../preload/index.js#L1) 冷启动按既有并发上限读取 Goal，稳态消费 updated/cleared 通知，终态候选执行 single-flight 补读，并以查询基线与 updatedAt 防止乱序覆盖。
- [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1) 在私有分支账本中裁决 Goal，记录稳定非终态权威来源；Goal cleared 时释放 Goal 来源的 running/待继续前态，让普通 Turn 语义重新接管。任一分支 Goal 仍未知时，另一个 complete Goal 也不得抢先完成父任务。
- Main、Float、Navigation、Actions 继续只消费 `companion-task-package-v4`；没有新增公共 TaskPhase、Tab、角标或归档路径。

## Alternative Route

- Status: `verified` by RAW-164 focused runtime tests and production build.
- Preconditions: App Server exposes Goal get/updated/cleared with finite status and updatedAt.
- Ordered steps: sanitize private Goal evidence → reject stale query/notification → stage branch evidence → reduce Goal/Turn causality → commit one task package → require Float applied ACK.
- Verification: active Goal crosses at least two completed Turns with zero intermediate completed/completed-unread package even when unread=true；complete publishes the final unread state once；successful open becomes completed；old unread/full snapshot/duplicate Goal cannot roll back；timeout/transient failure remains verifying；cleared/unsupported preserves legacy Turn behavior；no private payload crosses the Bridge.
- Fallback: only explicit protocol non-support may disable Goal authority for that App Server process. A timeout、malformed response or temporary failure is not evidence that no Goal exists.

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-08-12 | RAW-162 Cloud task stability | User observed one continuing task switch from running to completed and back to running | Every exact Turn completion was treated as whole-task completion | Added process-private Goal Evidence、causal epoch handling、terminal verification and atomic Goal-only publication | automated verified；current development-host reload pending |
| 2026-08-12 | RAW-164 Cloud unread stability | User observed completed-unread drift and a new description/Turn suddenly refreshing the task | Old Host still republished each Turn boundary and the focused matrix did not lock final unread/read-ack rollback | Keep active/verifying Goal nonterminal even with unread，finalize once at Goal complete，bind successful read to the Turn and reject old unread/snapshots/duplicate Goal notifications；add loaded-identity handshake | focused `189/189` and build passed；real `host-loaded` dual-snapshot acceptance pending |
