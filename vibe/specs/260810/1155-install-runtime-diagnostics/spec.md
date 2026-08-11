# Codex Companion v3 Unified Runtime Spec

Status: `implemented / full-automated-verified / host-acceptance-pending`

## 1. Authority Graph

```text
Codex events + paged inventory
  -> Codex Evidence Adapter
  -> companion-task-kernel-v3 reducer and hot cache
  -> companion-task-package-v3
  -> Main / Float / cards / tabs / badges / projects / shortcuts / navigation / archive
```

[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) 是唯一进程状态与热缓存 owner；[companionTaskPackage.ts](../../../../src/domain/companionTaskPackage.ts#L1) 定义唯一公共包。Renderer 只合并标题、项目等展示元数据，不得重新解释 phase、unread、membership、capability 或循环顺序。Kernel 暂不可用时保留最后完整包并 fail closed，不回退旧业务判断。

## 2. Evidence and Canonical State

`CompanionTaskEvidenceV3` 由 `provider + taskKey` 定位，并携带 membership、phase、authority/exact、Turn/状态/终态时间、三态 unread、observationGeneration、observedAt、metadataRevision 和 capabilityToken。

`CanonicalTaskStateV3` 输出 phase、unread、`fresh|verifying`、statusEnteredAt、semanticRevision、membershipRevision 和 capabilities。`observationGeneration/sourceLaneGenerations` 只用于内部乱序门禁和 debug，不参与包语义相等。

| 新证据 | 因果条件 | Canonical 结果 |
| --- | --- | --- |
| waiting-input / waiting-approval | 水位不早于 active/terminal | 立即等待 |
| active | 新 Turn epoch 或明确解除 waiting | 立即运行 |
| exact completed | 无更新 active/waiting | completed |
| same-epoch unread=true | completion epoch 一致 | completed-unread |
| explicit read receipt | 不早于当前 unread revision | completed-read |
| exact interrupted | 无更新 active/waiting | stopped / 待继续 |
| newer active after interrupted | active epoch 更新 | running |
| unconfirmed failed/interrupted | 无法精确收敛 | 保留稳定态 + verifying |
| exact archived | 归档事务 commit | 原子移除 |
| ordinary inventory missing | 未达缺失确认 | 保留 |

冷启动或重连的 interrupted/failed 冲突只对该任务执行一次 single-flight latest Turn 精确读取；不全量逐任务校对。新 key 先产生稳定最小卡片，元数据随后原位补齐。

## 3. Revision, Publication and Focus

- 同一 tick 的证据由 microtask 合并，下一帧原子展示；可信状态不做秒级防抖。
- unknown 最多使用 250ms 精确核验窗，期间保留原分组且不增加 Tab/角标。
- 只有 membership、phase、unread、visibility、capability 或必要元数据变化才增加 semanticRevision/packageRevision。
- 等价 observation 是完整 no-op：不增加 revision、不发布 Float、不 notify Renderer、不重算角标、不发送 focus；仅 debug 记录原因。
- focus 身份固定为 `provider + taskKey`；revision 不参与等价判断。破坏性操作单独使用 capability/revision 水位。
- 数字角标使用稳定宽度和 tabular digits 消除布局抖动，不延迟真实语义。

## 4. Inventory, Cache and Navigation

Codex `thread/list limit=100` 是单页协议大小，循环读取 cursor 到空并检测 cursor loop。动态小时/天窗口只决定展示资格，不截断源库存。Process Kernel 跨普通 hide/Float close 保存 inventory、alias、latest Turn、cycleKeys、attentionKeys 和 focusedKey。

[navigation.cjs](../../../../preload/companion/navigation.cjs#L1) 使用热目标直接打开；alias stale 时只定向重建一次并重试一次。所有打开来源共享全局单并发：首目标立即派发，在途期间只保留最终尾随目标。相同 focus key 直接 no-op。

## 5. Codex Archive Transaction

[preload/index.js](../../../../preload/index.js#L1) 对每次 Codex 归档创建 operationId，并严格执行：

1. archive-intent
2. archive-confirmation
3. archive-preflight
4. archive-provider-write（只写一次）
5. archive-server-verify-1
6. archive-desktop-sync
7. archive-native-ack（Desktop 已连接时，最长 2 秒）
8. archive-server-verify-2（至少间隔 300ms）
9. archive-kernel-commit
10. archive-reconciliation / archive-ui-removal

Desktop 运行且连接时，写结果、两次服务器库存、Desktop sync 和匹配任务原生 ACK 缺一不可；Desktop 未运行时只免除 ACK/sync，仍须两次持久化确认。Provider RPC 成功、一次列表缺行或消息“已发送”都不是本地删除依据。失败/矛盾/超时返回 failed 或 indeterminate，卡片和按钮保留并自动定向核验；只有 Kernel commit 后全部消费者和缓存原子移除。确认 identity 为 `provider + taskKey + terminalEpoch`，不受 revision、unread、focus 或 alias churn 影响。

## 6. Runtime Operations and Diagnostics

[actionRuntime.ts](../../../../src/runtime/action/actionRuntime.ts#L1) 为所有用户动作创建 operationId；来源枚举包括 card-click、manual-row-open、manual-quick-jump、global-shortcut、local-shortcut、attention-shortcut、archive-button、archive-shortcut、batch-archive、project-archive 和 automatic-recovery。

[diagnostics.cjs](../../../../preload/diagnostics.cjs#L1) 实现 `eypc-runtime-diagnostics-v3`：

- 明文 JSONL，8 MB/文件、64 MB 总量、14 天轮转；唯一 Host sink。
- 当前安装验证默认 `{enabled:true, level:"debug", userConfigured:false, defaultsRevision:3}`；显式用户选择永久保留。
- error 记录失败、不变量冲突、ACK 超时、包/缓存/落盘错误；info 记录用户操作、真实状态/包发布、缓存冷热和归档重要阶段；debug 记录每次规范化、水位、before/after、lane 接纳/拒绝、no-op、队列和定向核验。
- 每个调用显式 level；静态 AST 测试阻止遗漏。
- 公共字段统一携带 sessionId/seq/operationId/traceId、provider/taskRef、event/outcome/reason/evidence、before/after phase/unread、Turn 时间、水位/revision、cache、durationMs 和 errorCode。
- 精确 taskRef、运行路径和状态水位不哈希；递归拒绝提示词/正文、命令参数、stdout/stderr、凭据/令牌、堆栈和隐藏推理。

[probe-eypc-diagnostics-runtime.mjs](../../../../scripts/probe-eypc-diagnostics-runtime.mjs#L1) 兼容 v2/v3，支持精确筛选及状态变化、no-op、快捷键、跳转、归档阶段和错误码聚合。

## 7. Compatibility

Codex 使用 v3 全合同。Claude/Cloud Adapter 仍可提交 Provider-neutral evidence/action/result，但本轮不改变其状态或归档业务语义。旧 v1/v2 task package 不得被 Renderer 作为当前权威消费。
