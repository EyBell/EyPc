---
id: eypc-claude-unread-decay-blocked-by-version-gate-and-minute-flush
status: verified
scope: project
fingerprint: claude-completed-unread-slow-clear__app-log-version-gate-lapsed__leveldb-minute-flush-floor
first_seen: 2026-08-25
last_verified: 2026-09-05
review_after: 2026-12-05
evidence:
  - preload/claude/app-state.cjs
  - preload/claude/unread.cjs
  - preload/claude/index.cjs
  - preload/claude/open.cjs
  - preload/companion/task-kernel.cjs
  - src/domain/codexPresentation.ts
tags:
  - claude-companion
  - unread
  - version-drift
  - latency
---

# Claude 未读/已完成消退慢：版本门熄火后落到 LevelDB 分钟刷盘地板

## 症状

Claude Code 任务在 Claude App 内读完后，EyPc 的「已完成未读/未读」徽标仍滞留约半分钟到一分钟以上，偶尔更久；「已完成」卡片长期不退场。同屏 Codex 任务的已读转换毫秒级完成，用户感知为「只有 Claude 慢」。

## 错误假设

以为慢在 EyPc 自身（轮询频率、渲染节流、watcher 掉通知）。实测渲染层零延迟纯推送、watcher 在每次盘上变化后 ~0.1–0.5s 即发布；慢的是数据源与快车道的可用性。

## 已验证根因

三层叠加，前两层决定量级：

1. **快清车道被版本门整体熄火（2026-08-25 当时源码）。** 当时 [app-state.cjs](../../../preload/claude/app-state.cjs#L1) 用 `SUPPORTED_APP_VERSIONS` 做准入，不含 2026-08-21 自更新的 App `1.34493.1`，`compatibility()` fail closed，热未读与 app-log phase 证据全部关闭。实测 1.34493.1 日志语法未变——只是白名单滞后。该 Set 已于 2026-09-05 按 RAW-211 删除。
2. **兜底通道的地板是 Claude App 每分钟一次的刷盘。** LevelDB 镜像（[unread.cjs](../../../preload/claude/unread.cjs#L148-L183) 快照 + 指纹稳定门）本身很快（读取 14–38ms、零失败），但 Claude App 只在每分钟固定秒位把 Local Storage 刷盘（栅格相位随 App 进程而变：08-25 实测 hh:mm:16，09-02 实测 hh:mm:30；leveldb 目录全部 mtime 锁在该秒位，诊断日志 `claude-unread-v7` 推送间隔 59.7–60.3s）。热车道熄火时，未读翻转最快也要等下一个分钟栅格，均值 ~30s、上限 ~60s，再叠加保守 catch-up（相反持久边缘 + 事后快照，规格 RAW-165 条款 72）可再加 1–2 个栅格。
3. **从 EyPc 打开不构成已读。** [open.cjs](../../../preload/claude/open.cjs#L10-L15) 深链派发永远不报 `confirmsRead`，因此 [task-kernel.cjs](../../../preload/companion/task-kernel.cjs#L1089-L1094) 为 claude 独设的 `readAcknowledgements` 本地快清路径从未触发过。

2026-08-26 同一路径在 App 自动更新到 `1.37937.0` 后再次发生：固定 running/focus/completed/waiting/permission 行式仍兼容，新增可确认的额度耗尽 warn 也可被严格限定；仅白名单滞后令 phase/hot-unread 快车道再次 fail closed。此轮同时确认，卡片点击与快捷入口虽然 selector/source 不同，但在同一个 Navigation/Provider open 回执边界汇合，`dispatched` 均为 `confirmsRead=false`；观察到的点击即消除不能证明存在第二条本地已读通路。

「已完成」卡片本身滞留是设计而非故障：completed-unread 组免时间窗（[codexPresentation.ts](../../../src/domain/codexPresentation.ts#L146-L155)），未读不清则卡片不退场；已读后按 `dynamicTaskWindowHours`（默认 24h，可在 Codex 设置页调整）退出动态区。Codex 对照：未读经 `~/.codex/ipc/ipc.sock` 的 `thread-read-state-changed` 推送毫秒级到达，这就是不对称感的全部来源。

## 检测顺序

1. 先看 app-log 热车道是否在解析：未知 App 版本不得整段 `unsupported`。若 `compatibility` 仍因版本号熄火，就是旧白名单回归。
2. 只数行数验证当前版本语法是否仍兼容（锚定正则 grep -c，不打印日志内容），区分「语法真漂移」与「LevelDB 刷盘地板」。
3. 看 leveldb 目录 mtime 栅格与诊断日志 `task-push | claude-unread-v7` 间隔，确认兜底通道在按刷盘节奏工作。
4. 最后才查 EyPc watcher/渲染——渲染层无兜底轮询，凡渲染侧「慢」先回溯 preload 发布。

## 预防规则

不得把 Claude App 版本号编成准入白名单去整段熄火热车道。行式失配只丢那一行。用户报「状态消退慢」时先走上面的检测顺序，不得为绕过 60s 刷盘栅格提高轮询频率或增加等待（RAW-165 条款 74 明令禁止），也不得把深链派本当成已读。

## 替代路线

- 状态：`candidate`（代码已拆除版本准入；真机 focused 快清 ≤1–2s 仍待插件重载，通过后转 `verified`）。
- 前置条件：热车道只按固定无内容行式匹配；版本字符串只作诊断；冷重放仍不得伪造 live running。
- 有序步骤：删除 `SUPPORTED_APP_VERSIONS` → 同步 preload 镜像 → 重跑 app-state/hot-unread/state-lane regressions → 真机验证 focused 快清 ≤1s 恢复。前三步为本轮交付；宿主重载未执行。
- 验证：`pnpm exec vitest run tests/platform/claudeAppStateBridge.test.ts tests/platform/claudeBridge.test.ts tests/runtime/claudeCompanionWatcherE2E.test.ts tests/platform/companionTaskKernel.test.ts`。
- 适用边界：版本号不得再限制车道。语法漂移时只丢失配行，或改 `parseAppStateLine`；不得回退成版本白名单。
- 回退：新版本实测语法漂移时保持按行 fail closed（安全方向：只漏那一行、不整段熄火）。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-25 | 状态消退慢核验 | 用户报 Claude 任务已完成/未读消失特别慢 | 假设 EyPc 轮询/渲染慢 | 定位版本门滞后 + 分钟刷盘地板；同日扩白名单落地（`88/88`、镜像 73 对），真机复验待重载 | verified（根因）/ candidate（路线待真机验收） |
| 2026-08-26 | V7 已读入口与状态复核 | 快捷方式未立即已读、鼠标点击似乎立即；完成/额度耗尽任务仍进行中 | 把入口观感当成两条已读 mutation，且 inventory delivery 共用 state/unread generation | 证明两入口在相同回执边界汇合；扩 `1.37937.0` 版本门；分离 mutation/state/unread lane；固定 usage-limit 为 stopped | focused automation/current-log replay verified；host reload pending |
| 2026-09-02 | 跳转已读延迟核验 | 用户报快捷键跳转后「已完成已读」仍有延迟（CodexHost 跳转即已读刚落地） | 第一反应去查 CodexHost 额外进程路径；实际两次真机样本都是 Claude Code 会话，56.2s / 42.9s 才翻转，均卡在 hh:mm:30 刷盘栅格 | App 08-30 自更新 `1.40609.1`，白名单第三次滞后；新版 `setFocusedSession 214 / Query completed 22 / Sending message 27 / permission 3+3 / Stopping 4` 行式逐字兼容，扩版本门（canonical+镜像）并钉测试 | 3 文件 `95/95` 通过；host reload pending |
| 2026-09-05 | 取消版本白名单 | 用户报 Claude「已完成未读」延迟；随后明确「不应该把版本当白名单限制」「把所有的白名单都给取消限制」 | 第四次准备把 `1.46388.4` 加进名单 | App `1.46388.4` 语法仍匹配，白名单只到 `1.40609.1`；拆除 `SUPPORTED_APP_VERSIONS`，未知版本也走行式车道（RAW-211） | 代码落地；host reload pending |
