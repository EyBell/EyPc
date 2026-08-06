# 增补：未读状态改由 Claude 桌面端 App 做权威

Date: 2026-08-06 · 状态 `automated-verified / host-pending`

## 用户原话

> 在 Cloud APP 内部点击查看之后，APP 内部已经没有那个未读的小点了，那你是否可以自动同步已读的状态？

拍板（AskUserQuestion）：**改用 App 集合作权威**。

## 前提修正

用户的前提有一半不成立：EyPc 这边当时**没有可同步的未读**。1130 P4 → 2115 立下的产品合同是「桌面端会话永不产生 `completed-unread`」，理由写在 [claudeDesktop.ts](../../../src/domain/claudeDesktop.ts#L408) 的 `completedState` 上——当时没有任何来源能证明已读，一个谁也清不掉的角标比不显示更糟。桌面端卡片因此一律 `completed` + `unreadState: 'unknown'`。

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
| [preload/claude/desktop.cjs](../../../preload/claude/desktop.cjs#L1) | `readUnreadSet()`：扫 `.log`/`.ldb`，WAL 优先、同文件取后写，按 key 定向抽取，非 `local_*` id 全丢 |
| [preload/claude/index.cjs](../../../preload/claude/index.cjs#L1) · [preload/index.js](../../../preload/index.js#L1) | `readDesktopUnread` 端口（facade 层一并暴露，否则 validator 拦截） |
| [src/domain/claudeDesktop.ts](../../../src/domain/claudeDesktop.ts#L1) | `normalizeClaudeDesktopUnread`；`completedState`/`resolveClaudeDesktopSessionState`/投影接受 `appUnread` |
| [src/domain/codex.ts](../../../src/domain/codex.ts#L1) | 持久化 `claudeDesktopUnread`（`undefined` 与 `[]` 是两种状态，必须各自往返） |
| [src/runtime/codexController.ts](../../../src/runtime/codexController.ts#L1) | `refreshDesktopUnread()` 同节奏刷新权威并透传给投影 |
| [scripts/validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L1) | 端口断言 + 「不可读时必须是 `null` 而非空集合」 |
| [src/help/guides/codex.md](../../../src/help/guides/codex.md#L1) | 新增「未读小点跟着桌面端走」，含写入窗口限制与对齐办法 |

## 验证

| 命令 | 结果 |
| --- | --- |
| `tests/platform/claudeDesktopBridge.test.ts` | 26/26（新增 10 项：WAL 优先、同文件后写、非法 id、同文件其它键不外泄、不可读返回 `null`） |
| `tests/domain/claudeDesktop.test.ts` | 42/42（新增 5 项：归一、镜像、无观测无角标） |
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
