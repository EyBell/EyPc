---
id: eypc-codex-canonical-async-question-lifecycle
status: verified
scope: project
fingerprint: codex-v11-running-and-question-state__canonical-async-lifecycle-not-projected__latest-turn-anonymous-progress-and-exact-accepted-reply
first_seen: 2026-10-10
last_verified: 2026-10-10
review_after: 2027-01-10
evidence:
  - preload/codex/desktop-shadow.cjs
  - preload/codex/desktop-request-projection.cjs
  - preload/codex/desktop-activity-resolution.cjs
  - tests/platform/codexAsyncQuestions.test.ts
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/261010/0937-gpt-input-compat/verify.md
tags:
  - codex-companion
  - desktop-ipc
  - async-question
  - canonical-turn
---

# 新版 canonical 异步问题与运行生命周期

## Symptom

新版 Codex 正在运行的任务被归到待继续；问题没有进入待输入，或接受回答后仍残留等待。普通进度还可能触发重订阅，使角标和数量反复变化。

## Wrong Assumption

把旧 requests/runtime flag 当成唯一状态来源，认为移除请求即可完成等待解除。旧历史中任何 inProgress 被当成当前轮次，或把实际新进度继续挡在旧 interrupted 抑制后。

## Verified Root Cause

本机协议 v11 的实时 turns 可能为空，而 canonical history 持续发布最新进行中 Turn；异步提问来自 agentMessage.questions，回答来自匹配结构化 userMessage 或 accepted steeringUserMessage。运行恢复事件也可能早于 runtime 的 idle 更新。旧投影遗漏这些生命周期，或在最新轮结束后继续寻找历史 inProgress。

回答清除还必须进入 Kernel：旧 runtime waiting flag 可迟到，精确回答只关闭对应等待 epoch；有其他当前问题时不可整体清空。活动序域问题另由 [序号量纲记录](comparison-set-mixing-counter-and-timestamp-units.md#L1) 主责。

## Detection Order

1. 核对已加载宿主与实际协议，区分 requests、live turns、canonical 最新轮次和 runtime flags。
2. 只输出匿名身份、状态、计数和序号；正文/问题/答案只在内存瞬时解析，不持久化或公开。
3. 顺查问题打开、接受回复、请求墓碑、runtime 旧等待解除及 Kernel 最终相位。
4. 若旧 interrupted 抑制仍在，核对最新 canonical 新进度；同轮或更旧 completed 必须阻止恢复。
5. 记录普通增量下重订阅次数和任务/计数，不能只核对连接在线。

## Prevention Rule

最新 Turn 才能供应当前问题；稳定匿名实例只能被匹配接受回复、终态或明确撤回关闭。旧快照不得复活已答实例，新实例仍可等待。运行恢复必须有实际当前进度或 live Turn 生命周期，不能直接把所有 active snapshot 认作新运行。普通正文和工具增量不得回退状态或重新订阅，无法还原的排序/非法索引/协议损坏仍允许恢复。

## Latest Applicable Implementation

- [匿名投影](../../../preload/codex/desktop-shadow.cjs#L126) 只保存有限问题身份、回答关联、turn 状态与活动标记。
- [请求解除](../../../preload/codex/desktop-request-projection.cjs#L219) 保留精确墓碑，并在无其他可见输入时关闭旧等待。
- [运行边界](../../../preload/codex/desktop-activity-resolution.cjs#L130) 不允许同轮/旧轮 completed 被进度或回答重新打开。
- [桥接回归](../../../tests/platform/codexAppServerBridge.test.ts#L6478) 必须断言 Kernel 相位，不能只断言请求已删除。

## Alternative Route

- Status: `verified`，适用于本机 v11 协议与受测匿名生命周期；宿主像素和版本证明单独记录。
- Preconditions: 有兼容 stream owner、有效 revision 和可还原的当前 Turn 结构。
- Ordered steps: 解析有限匿名字段；投影最新问题；接受匹配回复后写墓碑；关闭对应旧 flag；用同域活动序号发布；由 Kernel 仲裁。
- Verification: 定向 19/19，含旧暂停恢复、旧快照不复活、新问题重新等待、部分回答与 completed 防误恢复；用户反馈当前应该正常。
- Applicability boundary: 未知回复、其他未答问题、真实终态和 Host 额外进程独立合同不被覆盖。
- Fallback: 非法结构或 revision/owner 断裂恢复快照；不靠超时、冻结计数或 CSS 隐藏掩盖状态。

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-10 | GPT 状态兼容 | 新版问题、进度与接受回复 | 只看旧字段或 shadow 请求删除 | [核验](../../specs/261010/0937-gpt-input-compat/verify.md#L1) | 最新 Turn 匿名投影与完整 Kernel 生命周期回归 | automated verified；user-reported-normal；实际加载四元组未独立取得 |
