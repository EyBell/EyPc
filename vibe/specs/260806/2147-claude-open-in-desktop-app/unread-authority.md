# 增补：未读状态改由 Claude 桌面端 App 做权威

> **Partially superseded evidence.** `epitaxy-unread-v1` 仍是持久原生权威；本文件的“字节扫描写入窗口 + 最后已知集合”自 2026-08-07 起被 exact Chromium-tagged key、复制前后源指纹一致的 LevelDB V2 临时快照、真实 reader 与失败=`unknown` 取代。成功精确跳转只允许同 `sessionId + completionEpoch` 的可撤销进程内提示和有界原生复读，不产生持久回执，也不改变 phase。当前合同见 [权威重置](../../260807/claude-code-companion-authority-reset/spec.md#L1)。

Date: 2026-08-06 · 状态 `automated-verified / host-pending`

## 用户原话

> 在 Cloud APP 内部点击查看之后，APP 内部已经没有那个未读的小点了，那你是否可以自动同步已读的状态？

拍板（AskUserQuestion）：**改用 App 集合作权威**。

## 前提修正

用户的前提有一半不成立：EyPc 这边当时**没有可同步的未读**。1130 P4 → 2115 立下的旧产品合同是「桌面端会话永不产生 `completed-unread`」——当时没有任何来源能证明已读，一个谁也清不掉的角标比不显示更糟。对应旧领域模块现已删除；这段只解释历史决策。

本轮取证推翻了那条合同的前提。

## 取证

App 的未读小点由 claude.ai 网页端（跑在桌面端壳里）存在 Chromium Local Storage：

```
~/Library/Application Support/Claude/Local Storage/leveldb/
key: _https://claude.ai\0\1epitaxy-unread-v1
val: {"state":{"unreadIds":["local_<uuid>", …]},"version":0}
```

同一套 `local_<uuid>` id 空间。实测活性：21:52 读到 1 个 id，21:53 读到空数组。

排除过的其它来源：会话元数据 `local_<uuid>.json` 无任何已读字段（44 个键全数盘点）；`setFocusedSession` 只改主进程内存并关通知，不落盘；`unreadItemCount` 全部命中 Outlook MCP connector，无关。

## 设计

**权威 = App 的集合本身，不是回执差分。** 起初实现的「transition → 写已读回执」被推翻：桌面端卡片默认就是已读，回执落下去没有可见效果。正确形态是镜像：

- 观测到集合 → 列表里 = `completed-unread`，不在 = `completed`（`readKnown` 为真）
- 从未观测到 → 维持原状：`completed` + `unknown`，无角标
- 读取失败（`null`）→ 沿用最后一次已知集合，不降级、不清空

角标因此不会卡死：它只是 App 那个点的镜像，App 下一次写入就带着它一起走。最后已知集合持久化在 `codex.claudeDesktopUnread`，重启即刻对齐而不必等 App 下一次写。

## 机械限制（不可回避）

Chromium LevelDB：写入先落未压缩 WAL，随后压进 `.ldb` 的 snappy 块，字节扫描就看不见了（本机实测几分钟内即发生）。所以这是**写入窗口观测**，不是持久读取。

关键在于时机是对齐的：需要读到的那次写入，正是「你点开会话、小点清掉」那一次。轮询错过窗口 = 那次熄灯丢失，角标滞留；降级方向安全（只漏熄、不误熄）。

读取纪律：这批文件同时装着用量/费用、面板布局、recentUuids 与遥测队列。reader 按 key 名取这一个键，只放出 session id 与时间戳；**按字节读，绝不当数据库打开**——App 运行期 Chromium 持有 LOCK，正经打开会恰好在最需要读的时候失败。

## 交付

| 位置 | 改动 |
| --- | --- |
| 已删除的旧 mixed-desktop reader | `readUnreadSet()` 曾扫描 `.log/.ldb`；该路线已被完整快照 reader 取代 |
| 当时的 Claude facade | 曾暴露 `readDesktopUnread` 端口；当前端口为 Code/native-unread 拆分合同 |
| 已删除的旧 desktop domain | 曾接受 `appUnread`；当前权威见 [claudeCode.ts](../../../../src/domain/claudeCode.ts#L1) |
| [src/domain/codex.ts](../../../../src/domain/codex.ts#L1) | 旧持久化字段已删除并在归一化时丢弃，不再冒充当前原生状态 |
| [src/runtime/codexController.ts](../../../../src/runtime/codexController.ts#L1) | 当前独立刷新 native unread，失败不清空其它 Claude lane |
| [scripts/validate-utools-runtime.mjs](../../../../scripts/validate-utools-runtime.mjs#L1) | 当前断言真实 reader、端口、清理和禁止打包异签名 native addon |
| [src/help/guides/codex.md](../../../../src/help/guides/codex.md#L1) | 当前帮助只描述完整快照与失败=`unknown` |

## 验证

| 命令 | 结果 |
| --- | --- |
| 旧 desktop bridge suite（已删除） | 26/26（历史字节扫描证据，不再是当前验收） |
| 旧 desktop domain suite（已删除） | 42/42（历史投影证据，不再是当前验收） |
| `tests/runtime/claudeCompanionController.test.ts` | 52/52（新增 4 项：镜像与熄灯、读取失败保权威、从未读到无角标、重启恢复） |
| `pnpm run typecheck` | 0 错误 |
| `pnpm run test` | 1214/1216 |
| `pnpm run build` | vite build + preload prepare + uTools validation 通过 |

两项失败均非本轮，与上一节同源：`claudeBridge` hook watcher 时序抖动（同文件单跑三次全绿）、`action.test.ts` MQTT 5s 超时（已用 `git stash` 剥离本轮改动在同基线复现）。

## 宿主验收门禁（未验）

1. App 里有小点的会话 → EyPc 显示「已完成未读」并计入角标。
2. 在 App 里点开该会话 → 小点消失后，EyPc 在下一个刷新周期内熄灯。
3. 插件关闭期间在 App 里读掉一条 → 重启后角标是否滞留（写入窗口丢失的实际表现）。
4. 长时间不动 App（记录被压缩）→ 角标保持最后已知状态，不闪烁、不清空。
5. 从未装过桌面端 / 从未读到过该键 → 桌面端任务无未读角标，与改动前逐字一致。

## 外部依赖声明

`epitaxy-unread-v1`（`version: 0`）是 claude.ai 网页端的私有 localStorage 键，比深链更易变。上游改名、改结构或换存储后端，`readUnreadSet` 会稳定返回 `null`，行为退回「桌面端任务无未读角标」——即本轮之前的形态。
