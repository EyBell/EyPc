---
id: eypc-codex-ipc-large-frame-quadratic-buffering
status: verified
scope: project
fingerprint: codex-desktop-large-snapshot__concat-every-chunk-quadratic-copy__bounded-single-allocation-frame-reader
first_seen: 2026-10-25
last_verified: 2026-10-25
review_after: 2027-01-25
evidence:
  - preload/codex/desktop-ipc-endpoint.cjs
  - preload/index.js
  - tests/platform/providerStateRepair.test.ts
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/261010/0937-gpt-input-compat/verify.md
tags:
  - desktop-ipc
  - large-frame
  - linear-buffering
---

# 大快照逐片拼接阻塞实时状态

## Symptom

实际 owner 已有待答/接受回答，EyPc 长时间没有 shadow 或保留旧相位；重启暂时恢复计数，热态提问仍漏报。广播与定向订阅都可能已成功，不能据此认定下游已取得状态。

## Wrong Assumption

把 connected、owner 查询成功或 following 已发当成快照已消费；把多任务未收到快照直接归因于并发协议。遗漏 socket 分片拼接的复制复杂度。

## Verified Root Cause

实测单个原生快照约251MB，其他三个约28.5MB、4.94MB、5.02MB。旧 handleData 每片 Buffer.concat 整个已收前缀，复制总量随分片数平方增长；同连接后续提问/回答帧也被拖延。2.38MB匿名生产 Bridge 回归测得348042076字节复制，先失败；新读取器按头部在原256MiB上限内一次分配，每个字节写入一次，回归转绿。真连接并发四项在4769ms内收齐，累计复制289702106字节、无残留缓冲。

## Detection Order

1. 对比实际 source pending、Host shadow、Kernel相位和Float applied，不能只查连接在线。
2. 仅读取帧长度、复制量、耗时与匿名状态；不持久化原始帧、正文、工具输出或快照。
3. 先测大包大小与复制复杂度，再判断并发、owner或状态仲裁。

## Prevention Rule

IPC按原协议上限先验长度；只在完整填充后交给JSON解析；断连重置释放未完成包。分片头、UTF-8、多帧和消费拒绝均需覆盖，复制工作必须线性。大包日志只留字节/耗时，不写原始数据。不提高协议上限，不新增状态推断。

## Latest Applicable Implementation

[线性帧读取](../../../preload/codex/desktop-ipc-endpoint.cjs#L23) 与[桥接核验](../../specs/261010/0937-gpt-input-compat/verify.md#L3)。唯一Kernel与交互墓碑、Goal时钟保持原合同。

## Alternative Route

- Status: `verified`，生产回归与有限真连接读取已通过；20:01:51最终宿主精确加载，真实等待/回答与四项计数闭环另见核验。
- Preconditions: 长度前缀LE4、受信本机IPC、原256MiB帧上限。
- Ordered steps: 累积4字节头 → 验长 → 一次分配 → 按分片写入 → 完整后解析投影 → Kernel → Float ACK。
- Verification: 29项来源修复文件通过；大帧生产Bridge复制界限先红后绿；真连接四项4769ms收齐。
- Applicability boundary: 不修改上游大快照内容或256MiB协议上限，不宣称全部现场生命周期已通过。
- Fallback: 非法长度/JSON仍按既有不兼容保护；不靠隐藏角标或冻结计数兜底。

## Occurrence History

| Date | Task | Trigger | Failed Route | Recovery | Outcome |
|---|---|---|---|---|---|
| 2026-10-25 | 任务状态日志核验 | 已答不消失、新问题漏报、四项计数少报 | 大包逐片拼接、只验证订阅发送 | 有界单次分配与生产回归 | 自动化、真连接、最终宿主身份与待输入/回答闭环已核；正式监控矩阵未跑 |
