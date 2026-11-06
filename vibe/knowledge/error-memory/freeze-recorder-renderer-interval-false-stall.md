---
id: eypc-freeze-recorder-renderer-interval-false-stall
status: verified
scope: project
fingerprint: eypc-freeze-recorder__renderer-interval-delayed-while-node-ipc-live__independent-writer-probe-and-ipc-reply
first_seen: 2026-10-26
last_verified: 2026-10-26
review_after: 2027-01-26
evidence:
  - preload/freeze-trace.cjs
  - tests/platform/freezeTrace.test.ts
  - vibe/specs/261026/task-cycle-freeze/task-card.md
tags:
  - freeze-recorder
  - renderer-timer
  - false-stall
---

# 插件 interval 延迟会误报主线程卡死

## Symptom

EyPc 追踪出现约一分钟周期的 `main-stall`，同时普通 Node 回调仍能处理工作。该周期本身不证明业务调用或同步 IPC 卡死。

## Wrong Assumption

写盘在独立子进程中就意味着存活时钟也独立。旧记录器仍依赖插件 Renderer 的 interval 发送脉冲，漏发时不能区分计时器延迟和整个事件循环不响应。

## Verified Root Cause

匿名进程夹具暂停父进程 interval、保留 IPC 和 timeout 后，旧实现产生误报；独立子进程主动探测、父进程 IPC 回应后同一用例不再误报。真实同步阻塞 300ms 的既有用例仍检测到停顿。验证的是 EyPc 记录器缺口，未证明 2026-10-26 宿主失效由定时器造成。

## Correct Detection Order

1. 先核对存活探测是否依赖待观察进程自身的计时器。
2. 区分 IPC 可以响应但 timer 延迟、异步操作未完成、真正同步阻塞和进程断开。
3. pending span 只定位当时未完成的边界，不能直接归因为阻塞调用。

## Prevention Rule

写入子进程拥有探测时钟，最多保持一个未答探测；插件以 Node IPC 事件回应，不使用 Renderer interval。发送队列仍上限 256，满时在下一 ACK 补答；记录保持 fail-open、有界文件、固定操作名和数值白名单。

## Latest Applicable Implementation

[记录器](../../../preload/freeze-trace.cjs#L1)、[匿名回归](../../../tests/platform/freezeTrace.test.ts#L1)、[当前任务](../../specs/261026/task-cycle-freeze/task-card.md#L1)。

## Alternative Route

- Status: verified（匿名进程边界）；真实宿主复验未执行。
- Preconditions: EyPc 子进程记录器可启动，父进程可接收 Node IPC。
- Ordered steps: 子进程定时探测 → 父进程回调回应 → 子进程计时与落盘；未答探测不重复排队。
- Verification: 父 interval 暂停不误报，真正同步阻塞保留检测，断连与限额继续按既有测试核验。
- Applicability boundary: EyPc 追踪器，不替代真实崩溃堆栈或原生宿主验收。
- Fallback: 记录器失败时业务照常运行，报告追踪不可用，不把缺失日志当作健康。

## Occurrence History

| Date | Trigger | Failed route | Recovery | Outcome |
| --- | --- | --- | --- | --- |
| 2026-10-26 | 任务切换失效复发排查 | Renderer interval 发送存活脉冲 | 写入子进程主动探测，IPC 回应 | 匿名误报用例先红后绿；本次宿主失效根因仍待确认 |
