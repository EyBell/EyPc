---
id: eypc-codexhost-external-threads-invisible-to-official-surfaces
status: verified
scope: project
fingerprint: codexhost-external-harness-threads-absent-from-official-thread-list-and-unread-atom__rendezvous-only-in-harness-child-env__delegation-cli-is-contract-surface
first_seen: 2026-09-01
last_verified: 2026-09-05
review_after: 2026-12-01
evidence:
  - preload/codex/codexhost-discovery.cjs
  - preload/codex/archive-bridge.cjs
  - preload/codex/pin-bridge.cjs
  - preload/index.js
  - tests/platform/codexhostArchive.test.ts
tags:
  - codexhost
  - codex-companion
  - inventory-membership
  - unread
---

# CodexHost 外部 Harness 会话对官方 Codex 面完全不可见

## 症状

CodexHost（codex-host shim）托管的外部 Harness 会话（claude-code/pi/grok/omp/dsh）在 Codex Desktop 侧栏可见、可跳转、带未读点，但 EyPc 完全不显示；官方 `codex app-server` 的 `thread/list`/`thread/read` 都查不到这些线程。

## 错误假设

以为外部会话是原生线程的变体，能从官方清单或 rollout 文件发现。实测它们不落 `~/.codex/sessions`、不进官方清单、未读也不进官方持久未读原子（`unread-thread-ids-by-host-v1` 全部 host 桶实测缺席）。

## 已验证根因

CodexHost 是官方 app-server 的 shim：外部会话由 Host Runtime 托管并直接投影给 Desktop UI，数据面完全在 Host 内。对外唯一契约面是委派 CLI（`codexhost thread list/read/…`），鉴权需 `CODEXHOST_RUNTIME_ENDPOINT/TOKEN`。两个取会合点的坑：

1. **launcher 进程 env 里的 endpoint 是陈旧值**（旧 runtime 的端口）；真实端口要看 host-runtime 进程实际监听。
2. **有效 token 只在 runtime 派生的 harness 子进程 env 里**（launcher 的 token 同样过期，runtime 自己的 env 也没有）。

跳转无需新通道：外部线程的 `codex://threads/<id>` 深链由 Desktop（shim 下）正常解析，与原生任务同方案（已实跳验证）。

## 检测顺序

1. 侧栏可见但 EyPc 缺席的线程，先 `codexhost thread list --cwd <项目根>` 判定是否 Host 托管（`harnessId != codex`）。
2. 会合点取证：`ps -axww` 找 `node …/host-runtime/dist/main.js … app-server`（排除 `codexhost launch` 行），`pgrep -P` 取子进程，读子进程 env。
3. 未读对不上时先查官方未读原子全部 host 桶；缺席即为 Host 内部状态，EyPc 无处可读，不要在 EyPc 里找丢失路径。

## 预防规则

- 已实施（2026-09-01）：[codexhost-discovery.cjs](../../../preload/codex/codexhost-discovery.cjs#L1) lane——会合点发现（仅信 harness 子进程 env）、CLI `thread list` 契约面、TTL 快照、外部行+合成 turn 注入扫描；外部 id 从官方 turn/goal 读取与 membership 回扫中剔除；token 仅驻内存、不入日志与持久文档。
- CLI `completed` 必须映射为 connector `idle` + 已确认 `snapshot-corroborated` Turn，禁止再写成官方 `notLoaded` 或弱 `inventory` 终态。Desktop follow 不得把无 waiting flag 的已确认完成行重新打成进行中。
- Host `hasUnreadTurn` 有值就是真实未读，Desktop 未读-true 不得覆盖 Host 已读。Codex APP 已读是 unread *event* false 或跳转打开；Desktop snapshot false 不是已读（官方未读原子缺席这些 id）。
- 插件重启后必须重新枚举 Host 已有额外进程。Host connector 进行中就是 live，不得等 Desktop follow 才离开 unknown。会合点失败不得把空列表当成成功 TTL 快照。
- Host `completed` + unread 必须盖过 Desktop follow 残留的 live inProgress，否则进行中→已完成未读感知不到。
- 运行中快照可缩短 TTL，墙钟不能单独制造终态。
- 官方 `thread/follow` 不能回答额外进程 id。把这些 id 放进 Desktop inventory 会种下 `notLoaded` 影子，私有分支证据再把它当成 Desktop 状态，Kernel 就落到 unknown——表现是「重启后读不到已有 Host 对话，除非新建或改为进行中」。额外进程不得官方 follow；Desktop `notLoaded`/idle 不得覆盖 Host connector；connector-active 在私有证据里就是 live。
- **官方回答不了的 id，每一个「未知即 verifying」的默认值都要单独封口。** 额外进程 id 已从 `thread/goal/get` 队列剔除是对的，但 `codexPrivateThreadGoalEvidence` 对无缓存条目的 id 默认回 `unknown/verifying`，观测层据此追加 `goal-verifying` 的 `unknown` 候选，而 Kernel 归约表里 `goal-verifying(5)` 压过 `terminal/live-turn(3)` 与 `inventory(1)`——Host 的 running、completed、completed+unread 全部被一条「Goal 还没读到」盖成 unknown：不在任何分组、不计 active、不进未读，且 notLoaded 影子清掉后症状不变。额外进程 id 的 Goal 证据固定为 `none/fresh`（[externalGoalEvidence](../../../preload/codex/codexhost-discovery.cjs#L513-L525)），goal 刷新对这些 id 直接短路。同类默认值（turn status、unread、goal）新增时必须先问：这个 id 官方能回答吗？不能就不得让 verifying 占位。
- **EyPc 跳转即已读，且不依赖 Host 翻转。** Host 只在 Desktop 对该线程发 `thread/read includeTurns` 或 `thread/resume` 时才把额外进程标记已读（codex-host `#readExternalThread` / `#resumeExternalThread`）；Desktop 没读到（例如该线程带错误徽标）时 Host 一直报 unread=true。EyPc 打开走的是 `dispatched` 收据，`normalizeCompanionOpenReceipt` 只在 `opened` + native-confirmed 时给 `confirmsRead`，所以 Kernel 的 `provider-open-read-hint` 对额外进程从不触发；已读只靠 Desktop 桥的 opened-read 确认，而快照层（`sanitizeCodexThreads`）此前只读 Host 值，几秒后一次冷快照就把行打回未读。卡片点击"看起来正常"只是因为 Desktop 恰好先 `thread/read` 让 Host 翻转了。规则：额外进程行的未读先看 opened-read 确认（[codexhostExternalUnreadFields](../../../preload/codex/codexhost-discovery.cjs#L89-L101) `openedRead`），确认无 turn 起点时绑定打开时刻；快捷键与点击必须走同一条读取判定。
- **额外进程的每个写动作都先问「官方 app-server 认识这个 id 吗」。** 归档、改名、发送只能走 Host 委派 CLI；把 `thread/archive` 发给插件私有的官方进程只得到 `protocol-error`，事务在 provider write 之前就结束，Desktop 侧不会有任何体现，项目批量归档的候选也只来自官方列表。规则：`codexhostExternal` 必须钉在库存别名上，不得只信内存花名册 `isExternalThreadId`（会合点失败会清空花名册）。归档走 [archiveCodexhostThread](../../../preload/codex/archive-bridge.cjs#L1)（Host `thread read` 预检 → `thread archive` → live/archived 列表双核验）。官方 `protocol-error` 且 Host `thread read` 成功时改道 Host，禁止停在预检。Host 列表核验通过后补发 Desktop companion `thread-archived`，实时收起 Codex APP 侧栏；仍不等 native ACK。Host 托管 Desktop 时，原生车道两次库存已证归档则 ACK 超时不得整单失败。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-09-01 | codexhost 对话识别与跳转 | 用户要求识别 Host 托管会话并跳转 | 官方清单/rollout/未读原子三面皆缺席 | 委派 CLI 实测枚举+实跳；lane 实装并实机验收（发现 6 行、targets 60→67） | 预防规则已实施 / 未读蓝点待二期 |
| 2026-09-01 | RAW-190 完成态 | 已识别的额外进程完成后仍停在进行中 | CLI completed 被当成 notLoaded/弱 inventory；Desktop 覆盖 status/unread | idle + snapshot-corroborated；Host unread 优先；禁止无 flag 的 desktop-live 复活 | candidate；聚焦测试通过，真实 uTools 待重载 |
| 2026-09-01 | D1 未读收敛验收 | Host completed+unread，EyPc 内核 unread 恒 0 | 两层叠加：① 并行线在入口层重复加外部未读守卫，短路了 discovery 已有的 `compareHostDesktopUnread` 投影（判断点重复=互相覆盖）；② 撤回后仍不落——真根因是两处官方未读原子直写点（`refreshPersistedUnread`/`applyFreshCompletionUnread`）对外部 id 直写 `connectorHasUnreadTurn=false`，每次桌面刷新踩掉 merge 记录的 Host 值 | 撤回入口守卫 + 两处直写点跳过外部 id（预算 (o) 撤回、(p) +7 行）；活体三链验收通过：未读落组 08:16:34、completed-unread 入口打开即清 08:36:24、二次未读再落 08:37:38，无振荡 | verified |
| 2026-09-01 | codex-host 新提交后 CLI 断依赖 | `codexhost` CLI 报 `ERR_MODULE_NOT_FOUND`（dsh apiproxy），EyPc 扫描 `partial:0` 把 9 条外部行整体清空——即"任务读取不到" | 扫描失败时用空 roster 覆盖旧 roster | `npm install` 修 CLI；discovery 增加全失败保留旧 roster 守卫（`partial` 上报旧计数，Host 启动窗口已实测生效一次） | verified；`codexhost launch` 前记得装依赖 |
| 2026-09-01 | 隐藏态验收误判 | 修复正确但诊断连续 unread:0，被误读为仍未修好 | codex 活动轮询在渲染层，uTools 对 `background-hidden` 窗口节流定时器——隐藏时扫描停摆不是回归 | 验收外部未读/相位前先查 `plugin-lifecycle` 可见性事件，再叫用户呼出面板 | verified |
| 2026-09-01 | RAW-194 正常态仍不可见 | 库存已发布 11 条额外进程，列表仍看不到当前 running/completed Host 对话 | 官方 follow 额外进程 id 种下 notLoaded 影子，私有证据把它压过 Host connector，Kernel 落到 unknown | 不再 follow 额外进程；notLoaded/idle 回落到 Host connector；connector-active 在私有证据里就是 live | 已重载验证：影子清除后症状不变——它是必要修复但不是唯一根因，见下一行 |
| 2026-09-02 | RAW-194 重载复验 | notLoaded 修复重载后 `group-counts` 仍 `unread:0 / completed:16`，与修复前逐位相同；Host 两条 completed+unread（af54797a/5d686475）在 `root-unread-evidence` 已是 unread=true 却不落组 | 额外进程 id 被剔出 `thread/goal/get` 后无 Goal 缓存，`codexPrivateThreadGoalEvidence` 默认回 `unknown/verifying` → 观测层追加 `goal-verifying` 候选 → Kernel 归约 `goal-verifying(5)` 压过 `terminal(3)/inventory(1)`，11 行全部 unknown | 额外进程 id 的 Goal 证据固定 `none/fresh`，goal 刷新短路；离线用真实 adapter 复现候选序列，bridge 回归用例在修复前后翻转 | verified：`host-bf4111f68776b3eca478` 重载 + `codexhost launch` 后 13:03:36 `group-counts` completed 14→24、unread 0→1，与 Host 当时 11 行 / 1 条未读逐位一致 |
| 2026-09-02 | 快捷键打开已完成未读不清读 | 快捷键 `eypc-codex-completed-unread` 打开 af54797a 后约 5s 又回未读，反复可现；卡片点击 5d686475 则保持已读 | 两条路径同走 `openCompanionCodexTarget`，Kernel 读提示因收据 `dispatched` 从不触发；已读只靠 Desktop 桥 opened-read，而快照层只读 Host `hasUnreadTurn`——点击那次是 Desktop 恰好 `thread/read` 让 Host 翻转，快捷键那次 Host 未翻转（线程带错误徽标），下一次冷快照即打回 | 快照层传入 opened-read 确认（`openedRead`）；额外进程确认无 turn 起点时绑定打开时刻；`opened-read-cleared` 诊断记录清除者 | verified：`host-77e99c6b3bdc24397bf4` 重载后 13:34:36 快捷键打开 9e7b6a57，live 与紧随的冷快照均 `read / desktop-live`，其后 3 分钟十余次 Host 刷新（Host 仍报 unread=true）不再翻回；期间唯一一条 `opened-read-cleared` 属于一条起了新 Turn 的原生线程，属正当清除 |
| 2026-09-02 | 额外进程归档不触达 Host | 插件对额外进程（含未命名会话）点归档 6 次全部「任务已保留」，Host 记录与 Desktop 侧栏都不变 | 归档事务只走插件私有的官方 app-server，预检 `thread/read` 即 `protocol-error`，provider write 与 Desktop 同步从未执行 | Host 委派 CLI 增 `thread archive/unarchive`（与 Desktop 归档共用持久化与 `thread/archived`）；EyPc 归档桥对 `codexhostExternal` 行改走 CLI：read 预检、archive 写入、live/archived 列表双核验 | candidate；聚焦测试通过，等 Host 重启（`codexhost launch`）与 uTools 重载后实机验收 |
| 2026-09-05 | 归档曾实时进 Codex APP，现侧栏不收 | 用户确认 09-02 曾走通；现插件归档后 APP 不实时消失 | 别名不钉 `codexhostExternal`，会合点清空花名册后掉进官方预检；Host 成功后故意不发 companion `thread-archived`；Host Desktop 下原生 ACK 超时整单 indeterminate | 别名钉 Host 身份；官方 protocol-error 且 Host read 成功则改道；Host 核验后补发 companion 通知；Host Desktop ACK 超时不再一票否决 | candidate；聚焦测试通过，待 uTools 重载实机看 APP 侧栏 |
