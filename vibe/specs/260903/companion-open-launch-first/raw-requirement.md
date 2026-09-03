# RAW-202：跳转前确保目标应用已打开与 CodexHost 启动通路

Tool: claude · Date: 2026-09-03 · Level: Standard（需求）

spec_id: SPEC-260903-COMPANION-OPEN-LAUNCH-FIRST

## 用户原话

> 当前打开 Codex 点击任务时，需要增加一个配置项，用于核验是否使用了 Codex Host：
> 1. 如果启用了 Codex Host：需要通过 Codex Host 去打开 Codex，然后再打开该任务。
> 2. 如果未启用 Codex Host：Codex 一打开，即走正常的通路。
> 还有 Claude Code 以及 Cursor 相关的任务 打开时也要核验一下是否已经打开 如果没打开 可以先打开再跳转 这相当于是一个统一的架构

规划阶段三项裁决（2026-09-03）：「通过 CodexHost 打开 Codex」默认**自动检测**；开启但找不到 codexhost 命令时**拦下不启动**；本轮**加手动 codexhost 路径输入框**。

背景：CodexHost 只在启动时接管 Desktop——`codexhost launch` 以 `CODEX_CLI_PATH=…/codexhost-shim` 与 `CODEXHOST_*` 环境打开 `ChatGPT.app`，bundle 本身不动。Codex 未运行时 `codex://threads/<id>` 会冷启动一个没有这些环境的普通 Desktop：任务打开了，但 Host 不会起来、额外进程不出现，之后 `codexhost launch` 因 Desktop 已在运行而拒绝。

## 输入规范化边界

只保存可执行的产品语义；手动路径与会合点观察到的 CLI 路径只存本机插件存储，不进文档、快照或诊断。

## 规范化需求

1. 统一就绪层：所有打开入口（点击、Enter、角标、全局快捷键、上一个/下一个、待输入首个）在 Provider Adapter 派发前先探测目标应用是否在运行；未运行则启动，每 500 ms 轮询至进程出现（最长 25 秒），再软等待应用就绪（最长 8 秒），然后才发深链。超时或启动失败 fail-closed：不派发、不清 unread，回执 `failed / launch-timeout | launch-failed`。探测结果未知时不启动，交给原 opener。
2. 「跳转前确保目标应用已打开」开关默认开（旧配置缺省也为开）；关闭时回到只发深链。
3. Codex：「通过 CodexHost 打开 Codex」三态 `auto | on | off`，默认 `auto`。有效启用 = `on`，或 `auto` 且满足任一：可解析的 codexhost 命令、存活的 Host 描述符、当前运行中的 Desktop 环境带 `CODEX_CLI_PATH=…codexhost` 或 `CODEXHOST_LAUNCHER_PID`（`ps eww` 读取）。有效时 Codex 未运行 → 经 `codexhost launch`（detached，`CODEXHOST_REFUSE_RUNNING_DESKTOP=1`，`ready` 行或 exit 0 即成功，非零退出带 launcher 首行）启动；找不到命令 → `unavailable / codexhost-cli-missing`，不启动任何东西（普通启动只会造出 Host 无法接管的 Desktop）。就绪 = Desktop 进程 + Host 描述符中的 launcher 存活 + `~/.codex/ipc/ipc.sock`。Codex 已在运行时直接深链。无效时 → `open -b`，就绪 = 进程 + ipc.sock。
4. codexhost 命令位置：手动路径（`eypc/codex/codexhost-path/v1`）> 上次会合点观察到的 `CODEXHOST_CLI_PATH` > `CODEXHOST_CLI_PATH` 环境变量 > `~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`、`~/.cargo/bin`、`~/.volta/bin`、`~/.bun/bin`、NVM 版本目录 > PATH。无效的手动路径阻断自动查找并在配置页显示；「运行」页可填写、从磁盘选择或恢复自动查找，页面不回显完整路径。
5. Claude：`pgrep -x Claude` 为在运行权威（窗口清单为空或辅助功能未授权时以进程为准）；未运行 → `open -b com.anthropic.claudefordesktop`，等进程与窗口（无权限时 1.5 秒）再发 Epitaxy 深链。Claude opener 自身仍不启动。
6. Cursor：`pgrep -x Cursor`；未运行 → `open -b com.todesktop.230313mzl4w4u92`，等进程与窗口再发 deeplink。
7. 回执：启动过的打开在回执上附 `launch { outcome: 'launched', launcher, waitedMs }`，消息前缀「已启动 X，」；深链仍不构成已读。
8. 非 darwin：能探则探，启动 `unsupported` 时放行（今天行为）。
9. 诊断：`task-action / open-readiness`（launch-requested 在发出启动命令时记录；launch-started 带 launcher；launched / launch-failed / launch-timeout / settle-timeout / probe-unknown / skipped）与 `task-action / codex-desktop-launch`，只含枚举、等待毫秒、来源与 operationId，不含路径、pid、令牌。

## 需求变更评审

`scanned_owners`：[RAW-177#3](../../requirements/shared-raw-177-clause-003.md#L1) 原生交接与 ACK 边界、[RAW-193](../../requirements/codex-raw-193.md#L1) 跳转即已读、[RAW-199](../../requirements/codex-raw-199.md#L1) Host 归档通道。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| added | 统一就绪层 + 两个开关 + codexhost 路径 | 新增；只改派发前置条件 |
| changed | Claude「不会自动启动」 | 由就绪层启动；opener 自身仍不启动，在运行判定不再要求辅助功能权限 |
| changed | Cursor「未运行时会先启动它」 | 从依赖 URL handler 隐式启动改为确定性探测 + `open -b` |
| unchanged | 深链不构成已读、`opened` 需原生确认 | RAW-177#3 原样 |

`conflict_candidates`：无。`decision_status`：`explicit-current-request`。
