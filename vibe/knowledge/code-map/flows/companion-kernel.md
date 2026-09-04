# 02a Companion Kernel 函数走读

Baseline: 2026-09-04 · 只读走读，不改 Kernel 语义。行号为本会话实测。

读这一篇时顺着两条链：**证据进 Snapshot**，以及 **点开一条任务**。页面、Float、角标都只消费 Snapshot，不要从 Vue 倒推相位。

热点函数（`finalizeTask` / `applyInteractionProjection` / `commitDraft` / `dispatchCommand` / `open` / 打开收据等）已在源码函数上方写了中文行级注释，说明**为什么必须这样**，不是复述语句。总览图在 Cursor Canvas `eypc-code-map.canvas.tsx`（会话旁打开）。

总览仍见 [companion.md](companion.md#L1)。源文件：[task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) · [task-actions.cjs](../../../../preload/companion/task-actions.cjs#L1) · [open-handoff.cjs](../../../../preload/companion/open-handoff.cjs#L1)。

## 先记住的不变量

- A-1 Kernel 是唯一归约器。Topology 只给成员图，不解释 phase / unread / Plan。
- A-2 打开的 interaction 与 Plan artifact 是两条状态机。有精确提问时，Turn 仍 `running` 也必须公开成待输入（RAW-207）。
- A-3 Deep Link / `shell.openExternal` 成功只是 `dispatched`，`confirmsRead` 仍为 false。
- A-4 语义没变则 `packageRevision` 不涨。同 revision 意见不一致进隔离，不准后到覆盖。

## 链 1：证据 → Snapshot

```text
Host 适配器 evidence batch
  → publishEvidence(draft)                         L2396
      → commitDraft(draft)                         L1938
          → reconcileInteractions(...)             L1039
          → refreshInteractionProjections()        L1179
              → applyInteractionProjection(task)   L1145
          → materializePrivateTopology()           L1632
              → aggregateKernelRoot(root, members) L1585
              → finalizeCanonicalTask              L1292
                  → finalizeTask                   L697
              → publicRootTask                     L509
          → semanticPackage 无变化则不发版          L875
          → syncConsumers → actions.sync           L1525
          → emitPackage                            L1331
```

### 1. 工厂把 Actions / Navigation 接到同一 Snapshot

[createCompanionTaskKernel](../../../../preload/companion/task-kernel.cjs#L894) 持有过程私有图：`nodeStore` / `relationStore` / `interactionStore` / `interactionTombstones`（约 [L932](../../../../preload/companion/task-kernel.cjs#L932)）。对外只暴露根任务。

它立刻构造：

- [createCompanionTaskActions](../../../../preload/companion/task-actions.cjs#L99)（[L964](../../../../preload/companion/task-kernel.cjs#L964)）
- [createCompanionNavigation](../../../../preload/companion/navigation.cjs#L1)（[L973](../../../../preload/companion/task-kernel.cjs#L973)），`openTarget` 回调进 `actions.open`

公开 API 在 [L3222](../../../../preload/companion/task-kernel.cjs#L3222)：`publishEvidence` 给 Host，`dispatchCommand` 给 Renderer，`getLatest` / `subscribe` / `acknowledge` 给消费者。

### 2. commitDraft 是唯一吃证据的入口

[publishEvidence](../../../../preload/companion/task-kernel.cjs#L2396) 与 Renderer 的 [syncPackage](../../../../preload/companion/task-kernel.cjs#L2376) 都进 [commitDraft](../../../../preload/companion/task-kernel.cjs#L1938)。

关键闸门：

- `draft.schema` 必须是当前 draft revision，否则整批丢掉。
- 同一 producer 的 `draftRevision` 必须严格变新。
- 某个已启用 Provider 的 batch `valid !== true` 时整笔事务拒绝，且**不消耗** producer revision，以便同号重试。
- 未声明的 membership lane 视为「未变」，不得当成 0 把库存打成旧快照。

然后：更新 `nodeStore` / `relationStore` → [reconcileInteractions](../../../../preload/companion/task-kernel.cjs#L1039) → [refreshInteractionProjections](../../../../preload/companion/task-kernel.cjs#L1179)。

### 3. applyInteractionProjection：为什么 running 还能是待输入

[applyInteractionProjection](../../../../preload/companion/task-kernel.cjs#L1145)：

1. `basePhase` 取 `activityPhase`（Turn 证据），没有再用 `phase`。
2. 只要 `interactionStore` 里还有该根的 `state === 'opened'` 实例，公开相位改成 `waiting-approval` 或 `waiting-input`，即使 Turn 仍在跑。
3. 新 running epoch 会先把旧 interaction 收进墓碑（reconcile 里按 activity sequence 关店），所以这里不能把已清掉的提问救活。
4. 没有打开的 interaction 时，相位回到 `basePhase`，并清掉 `planImplementation`。

这就是 RAW-207 的代码落点：精确提问与 running 可以同时为真，公开分组走 waiting。

墓碑规则：[recordInteractionTombstone](../../../../preload/companion/task-kernel.cjs#L1014) — 已终结的 `interactionRef` 不能被同 id 重新打开，Provider 必须发新实例。

### 4. finalizeTask：所有公开字段过这一道

[finalizeCanonicalTask](../../../../preload/companion/task-kernel.cjs#L1292) 先算活动窗 `dynamicEligible`，再把已读回执应用到 unread，最后调用模块级 [finalizeTask](../../../../preload/companion/task-kernel.cjs#L697)。

`finalizeTask` 顺序（不要调换）：

| 步骤 | 函数 / 字段 | 做什么 |
| --- | --- | --- |
| 1 | `canonicalPhase = phase` | 证据原值；后面判断「是否仍 unknown」必须读它，不能读用户覆盖后的 `phase` |
| 2 | `manualPhase` | 仅当仍是同一段 `unknown`（`statusEnteredAt <= manualPhaseSetAt`）才顶上 |
| 3 | Plan artifact | `planReady` → `available`；否则不可执行 |
| 4 | capabilities.pause/resume/executePlan | 只在 settled/attention 且 Provider 声明 planLifecycle |
| 5 | [derivedDynamicGroup](../../../../preload/companion/task-kernel.cjs#L674) | **显示**分组；`taskPinned` 则一律 `pinned` |
| 6 | [derivedCycleTier](../../../../preload/companion/task-kernel.cjs#L650) | **快捷键环**；置顶不剥夺待输入/未读资格 |

[taskPinned](../../../../preload/companion/task-kernel.cjs#L609)：`localPin || providerPin`。显示进置顶组，角标仍按 [derivedAttentionState](../../../../preload/companion/task-kernel.cjs#L642)。

[buildViews](../../../../preload/companion/task-kernel.cjs#L817) 的 counts / attentionKeys 读状态资格，不读显示组。置顶的待输入行人在置顶分组，Ctrl 待输入仍能打到它。

### 5. 聚合成根再剥隐私

[aggregateKernelRoot](../../../../preload/companion/task-kernel.cjs#L1585)：live 优先级 `waiting-approval > waiting-input > running`（[L79](../../../../preload/companion/task-kernel.cjs#L79)）。未读：任一 member true → true；全部 known false → false；否则 unknown。

[publicRootTask](../../../../preload/companion/task-kernel.cjs#L509) 剥掉 `activityPhase`、alias token、revision 内场等，Renderer 拿不到子成员 id。

[semanticPackage](../../../../preload/companion/task-kernel.cjs#L875) 只序列化会影响用户语义的字段。health generation 空转不涨 Snapshot。

## 链 2：点开一条任务

```text
卡片 / Enter / 角标 / 全局快捷键
  → dispatchCommand                         L3043
      → executeCommand                      L2881
          → commandIntent('open')           L2834
          → dispatchLegacyIntent            L2670
              action === 'open'             L2721
              → navigation.open
                  → actions.open            task-actions.cjs L292
                      → adapter.open
                      → normalizeOpenResult open-handoff.cjs L68
              → acknowledgeOpenedTask       L1282
```

### 1. 命令闸门

[dispatchCommand](../../../../preload/companion/task-kernel.cjs#L3043)：revision 必须是 `companion-task-command-v1`；`operationId` 去重；**按任务 key 串行**（`commandQueues`）。

[executeCommand](../../../../preload/companion/task-kernel.cjs#L2881) 先挡未来 revision / 拓扑已变且 key 消失。`open` 不在本函数里直接调 Adapter，而是落到 [commandIntent](../../../../preload/companion/task-kernel.cjs#L2834) → [dispatchLegacyIntent](../../../../preload/companion/task-kernel.cjs#L2670)。

[L2721](../../../../preload/companion/task-kernel.cjs#L2721)：用当前 Snapshot 的 [actionTargetForTask](../../../../preload/companion/task-kernel.cjs#L1550)（私有 node 的 alias + 公开 phase）。没有公开行时，仅 `trustedResolvedTarget` 允许短暂目标。打开走 `navigation.open`，避免与 cycle 并发抢同一个 Adapter。

### 2. Actions.open：过程快照才是身份

[resolveOpenTarget](../../../../preload/companion/task-actions.cjs#L265)：同一 key 永远用 Host 已接受的 target。Renderer 带的旧 alias/phase/revision 只是提示，不能换任务。

[open](../../../../preload/companion/task-actions.cjs#L292)：未就绪 → `inventory-not-ready`；没有 target → `stale-target`；没有 adapter.open → `unsupported`；然后 `normalizeOpenResult(await adapter.open(...))`。

### 3. 打开收据：opened 会被降成 dispatched

[normalizeCompanionOpenHandoff](../../../../preload/companion/open-handoff.cjs#L9) 要求 `companion-open-handoff-v1`、合法 `handoffId`、stage 集合。

[normalizeCompanionOpenReceipt](../../../../preload/companion/open-handoff.cjs#L37)：Adapter 自称 `opened` 但收据不满足「stage 已 native-confirmed/applied **且** nativeVisible **且** controlOwner=target-native」时，**降成 `dispatched`**。

[normalizeOpenResult](../../../../preload/companion/open-handoff.cjs#L68) 带上 `confirmsRead` 和可选 `launch`（[open-readiness](../../../../preload/companion/open-readiness.cjs#L1) 先启动再打开）。

### 4. 打开不等于已读

[acknowledgeOpenedTask](../../../../preload/companion/task-kernel.cjs#L1282)：

- 先 `markAttentionOpened`（走完这一轮 attention 游标）。
- **仅当** `result.confirmsRead === true` 才写 process-local `readAcknowledgements` 并清 completed-unread。
- 当前多数 Deep Link 路径 `confirmsRead=false`，所以跳转后未读可以合法地还在。

## 改造时从哪改

| 你想改的现象 | 先打开 | 不要打开 |
| --- | --- | --- |
| running 时提问不进待输入 | `applyInteractionProjection` L1145 | Float 分组 CSS |
| 置顶行快捷键消失 | `derivedAttentionState` / `buildViews` | 只改 `dynamicGroup` |
| 手动指定状态被证据冲掉 | `finalizeTask` canonicalPhase L721 | 直接写 `task.phase` |
| 点开后未读立刻没了 | `acknowledgeOpenedTask` + handoff `confirmsRead` | Controller 里清 unread |
| 点 A 打开了 B | `resolveOpenTarget` | Renderer 缓存的 target |
| Snapshot 乱跳 revision | `semanticPackage` | 每次 push 都 `++packageSequence` |
