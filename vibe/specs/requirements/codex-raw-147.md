---
id: eypc-req-codex-raw-147
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-147
status: active
domain: companion-codex
authority: user-stated
source_annotations: "focused-automated-verified-host-pending / refines-RAW-116-117-141-145 / positive-follow-announcement-no-echo"
relations:
  - refines-RAW-116-117-141-145
---

# RAW-147 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户原文：“优化吧”。对“进行中 → 待输入”缓慢或不切换的真实 IPC 核验发现，EyPc 把任何 peer 发出的 `thread-stream-following-changed(following=true)` 当成请求并定向回发；两个已加载旧实现的 EyPc follower 会互相重报，250ms 内产生 32,329 次、2.5s 约 368,000 次控制消息并挤压状态快照。当前 Codex 包内协议实现确认该消息只是发送方自己的 follower 状态公告；只有 `thread-stream-following-status-requested` 才要求接收方重报。修复后 Preload 直接消费正向公告而不回写，显式 status request 仍只向请求方回复一次；`following=false` 的 inventoried owner shadow 保留/定向续订、断开清理、状态/未读/Turn 权威与隐私边界均不变。回归先稳定 RED（一次公告令同线程出站 follow 从 1 增至 2），修复后专项与 Bridge 全文件 `81/81` 通过；typecheck、production build、canonical/public/dist Preload 三向镜像、语法、同步 IPC 静态门禁及 uTools runtime validation 通过。真实预检脚本同时改为按源模块相对位置递归转译有限 TypeScript 依赖，恢复生产 Domain 投影并在当前数据上返回 `ok=true`。最终 `dist/preload.js` 连接真实 broker 的有界探针只发送 24 条初始 follow，虽收到两个旧客户端共 48 条正向公告也不再追加出站消息；当前运行 uTools 仍加载修复前 ASAR且没有重载，故 live snapshot 与真实 active→waiting 转换验收保持 host-pending。
