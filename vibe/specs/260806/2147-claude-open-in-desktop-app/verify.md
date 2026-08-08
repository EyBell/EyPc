# Verify：Claude 任务一律在桌面端 App 打开

> **Superseded verification.** 本文件证明旧 `claude://resume` 实现的自动化合同，不证明它打开原历史会话。该路线会进入 import 并可产生副本。当前路线缓存主 App PID/启动代次，连续操作通过 latest-target-wins 单飞派发 exact Epitaxy local id；成功派发后只由 Controller 建立同 completion 会话提示并复核原生未读，bridge 仍不声称 `confirmsRead`。十次实机连跳与 no-clone 证据见 [权威重置](../../260807/claude-code-companion-authority-reset/spec.md#L1) / [research](../../260807/claude-code-companion-authority-reset/research.md#L1)。

Date: 2026-08-06 · 状态 `automated-verified / host-pending`

## 交付

| 位置 | 改动 |
| --- | --- |
| 当时的 open bridge | 曾构造 `claude://resume?session=<uuid>`；该 import 路线现已删除，不能从当前源码反推历史实现 |
| 当时的 Claude facade/platform/controller | 曾把 CLI/桌面打开合为单一 import 派发；当前合同见 [权威重置](../../260807/claude-code-companion-authority-reset/spec.md#L1) |
| 当时的帮助文档 | 曾披露首次导入写入；当前 [帮助](../../../../src/help/guides/codex.md#L1) 只描述 exact Epitaxy no-clone 路线 |

## 设计决定

1. **不自动拉起 App**：窗口清单可读且没有 Claude 桌面端窗口 → 报 `unavailable`「Claude 桌面端未在运行」，不发深链（用户要求「已打开的桌面端」）。
2. **辅助功能权限不是硬依赖**：深链本身不需要 AX。清单被权限/平台挡住（`permission: 'required'` / `supported: false`）或窗口子系统缺席时判为 `unknown` 并照常派发——用没拿到的证据拒绝一次能成功的跳转是错的。
3. **结果永远是 `dispatched`，不是 `opened`**：`open` 把 URL 交给系统就返回，登录过期 / transcript 缺失 / 真正跳转成功在插件这边不可区分。
4. **非法 id 不派发**：不符合规范 UUID 的 id 会被 handler 静默丢弃，因此在本地就报 `unavailable`。

## 已知代价（同日已闭环）

**改动前唯一写已读回执的是"确认终端聚焦成功"，随终端路线一并移除。** 当时的结论是 Claude 的「已完成未读」不再有清除路径。

该缺口已在同日由[未读权威增补](unread-authority.md#L1)闭环，但走的不是回执：桌面端 App 自己的未读集合成了这条通道的读权威，EyPc 的角标是它侧栏小点的镜像。`claudeReceipts` 的读取/持久化/投影仍在并被尊重，只是不再有生产者。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npx vitest run tests/platform/claudeBridge.test.ts` | 45/45（含本轮重写的 11 项 task jump 用例） |
| `npx vitest run tests/runtime/claudeCompanionController.test.ts` | 45/45 |
| `pnpm run typecheck` | 0 错误 |
| `pnpm run test`（全量） | 1193/1195 |
| `pnpm run build` | vite build + preload prepare + uTools validation 通过 |

全量两项失败均非本轮：

- `claudeBridge > hook queue push lane > watches before registration` —— fs watcher 时序抖动，同文件单独重跑三次全绿（与 2210 轮记录的同一抖动）。
- `action.test.ts > owns MQTT pane navigation …` —— 5s 超时，**已用 `git stash` 剥离本轮全部改动后在同一基线复现**。

## 宿主验收门禁（未验）

1. 桌面端会话卡片点开 → App 跳到那条会话（而非只是前置）。
2. CLI 会话卡片点开 → App 导入并打开该会话；确认首次导入后 `~/.claude/projects/**/<uuid>.jsonl` 的改写是否可接受。
3. 关闭桌面端 App 后点开 → 提示「Claude 桌面端未在运行」，且**没有**自动拉起 App。
4. 桌面端未登录时点开 → App 侧弹「Sign in to the desktop app」toast，插件侧仍报「已在 Claude 桌面端打开该任务」（已知的不可区分，见设计决定 3）。
5. Windows / Linux 的 `cmd start` / `xdg-open` 路径未在真机验证。

## 取证来源

反编译 `/Applications/Claude.app/Contents/Resources/app.asar`（版本 1.25927.0）。深链契约随 App 版本可变，是外部依赖，不是稳定接口——`resume` host 若被上游改名或加 feature flag，打开会静默变成 `dispatched` 但什么都没发生。
