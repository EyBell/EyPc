---
id: eypc-codex-canonical-async-question-lifecycle
status: verified
scope: project
fingerprint: codex-v11-running-and-question-state__canonical-async-lifecycle-not-projected__latest-turn-anonymous-progress-and-exact-accepted-reply
first_seen: 2026-10-10
last_verified: 2026-10-13
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

2026-10-10 同轮重复启动修复保留；当时将 inProgress 辅助函数误作问题关闭合同的判断，已由下面的宿主证据取代。

2026-10-11 宿主实证更正：15:24:18 已加载。等待打开后 2.057 秒被 completed 清除，而精确回答在约 114 秒后下一轮才进入。原生 inProgress 辅助投影不能作为未决交互关闭合同；latest completed 的未答问题须保留，答案/撤回/新轮/failed/interrupted 仍单独决定解除。同时修复完成 publisher 不携带交互，以及活动帧因语义未变化而省略 opened 证据：Kernel 收到较新终态却无 opened 实例会关闭并写墓碑。当前随变化活动帧重发仍 opened 的有限交互，身份/首次序号不变。新增持续读取、App Server 完成、refollow 与下一轮回答的完整 Kernel 回归。

2026-10-12 现场补充：已完成 SRM 任务的最新 canonical Turn 仍含问题，随后同轮 accepted 普通 steering 输入继续对话。仅匹配正式回复会留下旧问题；现按已接受普通输入的顺序关闭之前的问题，保留之后的新问题。关闭卡片本身没有单独协议撤回证据，不能凭 UI 关闭推断问题结束。真实快照修复投影为零个合成待答请求，原生蓝色标签与新 EyPc 宿主显示独立验收。

2026-10-13 Side 续核：Desktop-only 的已验证父子关系原来没有被记为 topology exact；接纳关系后，Side 请求仍使用主 taskKey/turnEpoch，且普通活动重放省略 unchanged opened 实例，Kernel 将其误清。完整 Bridge 回归先失败，修复为成员私有 key、成员轮次与成员完整请求集，并让现有 activity batch 携带该成员仍 opened 的证据后，通过完成、连续读取、refollow 和匹配答复。Side 完成查询还会被主缓存提前收口；现仅主查询用主缓存，Side 精确查询以 Side 当前轮次确认并记录成员终态，不改原定向查询通路、不覆盖较新主轮次。

2026-10-13 晚间更正：Side 问题轮次仍 inProgress，后续另一个生成已完成或被 auto-review 终止，原生仍显示待答 Question；18:32:26 日志却将根 waiting-input 清成 unknown。原生 question selector 与最新运行 Turn 是两条读取，不能把后续 aborted 生成当作此前问题已答。Side 仅在较晚 completed/failed/interrupted 轮次时保留此前未结束的提问轮次，匹配接受答复及普通 accepted steering 仍解除；原生 selector 在较晚 completed 轮次也查此前 pending inProgress；只覆盖 failed/interrupted 的初版现场未通过，新增 completed 组合修正后已取得真实 waiting-input。该回退不供应 running，不复活已 completed 的旧提问，不改主任务原有取消守卫。完整 Bridge 组合先失败后通过；独立 source/packaged 门禁与坏实现 canary补齐。

## Detection Order

1. 核对已加载宿主与实际协议，区分 requests、live turns、canonical 最新轮次和 runtime flags。
2. 只输出匿名身份、状态、计数和序号；正文/问题/答案只在内存瞬时解析，不持久化或公开。
3. 顺查问题打开、接受回复、请求墓碑、runtime 旧等待解除及 Kernel 最终相位。
4. 若旧 interrupted 抑制仍在，核对最新 canonical 新进度；同轮或更旧 completed 必须阻止恢复。
5. 记录普通增量下重订阅次数和任务/计数，不能只核对连接在线。

## Prevention Rule

已验证 Desktop-only 关系与 inventory 关系均可供应精确成员；每个成员的提问/轮次/完整请求集必须独立，其他成员的 activity/terminal 不得关闭它。最新 inProgress/completed Turn 的未答问题可供应当前等待；生成 completed 不等于问题已答，不能单独关闭。稳定匿名实例由匹配接受回复、明确撤回、实际新的对话轮次或其自身 failed/interrupted 关闭；Side 后续另一个 aborted 生成不等于当前原生待答 Question 已结束，必须独立核验该提问轮次；同轮已接受的非空普通 steering 输入只关闭此前问题，待接受/被拒绝输入、空输入及正式部分回答不整体清除。同轮重复启动通知不是回答或新轮次，不可清除未答请求。旧快照不得复活已答实例，新实例仍可等待。运行恢复必须有实际当前进度或 live Turn 生命周期，不能直接把所有 active snapshot 认作新运行。普通正文和工具增量不得回退状态或重新订阅，无法还原的排序/非法索引/协议损坏仍允许恢复。

## Latest Applicable Implementation

- [匿名投影](../../../preload/codex/desktop-shadow.cjs#L126) 只保存有限问题身份、回答关联、turn 状态与活动标记。
- [请求解除](../../../preload/codex/desktop-request-projection.cjs#L219) 保留精确墓碑，并在无其他可见输入时关闭旧等待。
- [运行边界](../../../preload/codex/desktop-activity-resolution.cjs#L130) 不允许同轮/旧轮 completed 被进度或回答重新打开。
- [成员交互归属](../../../preload/codex/desktop-request-projection.cjs#L269)、[组合桥接回归](../../../tests/platform/codexAppServerBridge.test.ts#L6549) 必须断言 Kernel 相位，不能只断言请求已删除。

## Alternative Route

- Status: `verified`，适用于本机 v11 协议与受测匿名生命周期；宿主像素和版本证明单独记录。
- Preconditions: 有兼容 stream owner、有效 revision 和可还原的当前 Turn 结构。
- Ordered steps: 解析有限匿名字段；投影最新问题；接受匹配回复后写墓碑；关闭对应旧 flag；用同域活动序号发布；由 Kernel 仲裁。
- Verification: 当前受影响三文件 215/218（同样 3 项既有 Bridge 失败），async 22/22、独立 gate 8/8、source/packaged 新 17 检查通过。18:45:08 精确握手、真实 Side 待输入维持约 58.3 秒及用户回答后 resolved→running 已核验；未发生的全生命周期仍待证。
- Applicability boundary: 未知回复、其他未答问题、真实终态和 Host 额外进程独立合同不被覆盖。
- Fallback: 非法结构或 revision/owner 断裂恢复快照；不靠超时、冻结计数或 CSS 隐藏掩盖状态。

## Occurrence History

| Date | Task | Trigger | Failed Route | Evidence | Recovery | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-10 | GPT 状态兼容 | 新版问题、进度与接受回复 | 只看旧字段或 shadow 请求删除 | [核验](../../specs/261010/0937-gpt-input-compat/verify.md#L1) | 最新 Turn 匿名投影与完整 Kernel 生命周期回归 | automated verified；user-reported-normal；实际加载四元组未独立取得 |

| 2026-10-13 | Side 生命周期续核 | 子对话仍有未答问题却不维持 waiting；Side completed-unread 漏相位 | Desktop-only 关系未精确；成员请求误归主；活动重放漏交互；主缓存提前结束子查询 | [续核](../../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L1) | 成员证据归属、同批 opened 重放与现有子查询成员终态确认 | 组合回归先红后绿，source/packaged gate 拒绝对应坏实现；18:45:08 宿主精确握手与目标 Side waiting-input 维持约 58.3 秒、用户回答后 resolved→running 已取得，全部真实生命周期未声明通过 |

| 2026-10-13 | 原生 Side 问题维持 | 最新生成结束，但原生 Question 仍待答 | 只看最新生成 / 较窄 aborted 回退 | [续核](../../specs/261013/1425-codex-side-phase/lifecycle-verify.md#L1) | Side 采用原生 pending 提问轮次；不供应历史运行；接受回复独立解除 | 215/218（同样 3 旧失败）、async 22/22、source/packaged 17 新检查；18:45:08 真实 waiting-input 已取得 |
