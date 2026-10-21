# 卡死追踪常驻化与主线程同步 I/O 异步化

## 基线

- 基线时间：2026-10-20 09:36（北京时间），`main` @ `fb61600`，工作区另有与本任务无关的未提交改动（Codex Side 生命周期相关），本任务不触碰。
- 范围：冻结追踪（用户选项 F-2）与主线程同步外部调用（F-3）。
- 状态：`host-verified`。四项首版已提交 `7fd52dc` 并经用户重载；宿主证实 Worker 不可用，追踪改为子进程后经重载确认运行并落盘（见「宿主复验与子进程改造」）。卡死根因仍待下次卡死取证。

## 触发事件

- 2026-10-20 09:11:22–09:11:34 EyPc 渲染进程（PID 1341，已连续运行约 24.5 小时）主线程卡死，uTools 与其他插件随之不可用；用户在 09:12:05 手动卸载插件恢复使用，09:32 重装。
- 运行诊断日志无 warn/error，最后一条为例行状态写入；无 macOS 崩溃报告。排队中的诊断条目随主线程卡死一起丢失，卡在哪个调用没有证据。
- `~/.eypc/freeze-traces` 目录不存在：冻结追踪在真实宿主里从未落盘。

## 原实现摘要

本节行号为基线 `fb61600` 时的位置；当前位置见「实现与验证结果」。

1. 冻结追踪 [freeze-trace.cjs](../../../../preload/freeze-trace.cjs#L60) 用 `new Worker(__filename)` 启动写入线程；[启动接线](../../../../preload/index.js#L21) 在主入口无条件开启。
   1-A. 默认只运行 10 分钟（[L63](../../../../preload/freeze-trace.cjs#L63)、[到期关闭](../../../../preload/freeze-trace.cjs#L123)），每秒写一条心跳，单文件 4 MiB 写满即停止。
   1-B. Worker 报错只调用 `stop`（[L73](../../../../preload/freeze-trace.cjs#L73)），不留任何状态记录。
   1-C. 原设计明确是临时排障，「uTools 打包路径内 Worker 支持及真实落盘需要单独确认」（[trace-guide](../../260914/plugin-startup-freeze/trace-guide.md#L1) 第 8 条）。
2. Cursor 库存 [queryWithCli](../../../../preload/cursor/inventory.cjs#L323) 在主线程 `execFileSync('/usr/bin/sqlite3')`，超时 20 秒（[L26](../../../../preload/cursor/inventory.cjs#L26)）。
   2-A. [readInventory](../../../../preload/cursor/inventory.cjs#L458) 先查全局库，再由 [readPinnedComposers](../../../../preload/cursor/inventory.cjs#L430) 对每个签名变化的工作区库各查一次，上限 200 个。
   2-B. 宿主 Electron 22.3.27 自带 Node 16，没有 `node:sqlite`，实际只走 CLI 同步路径。
3. Cursor 归档 [cliClient](../../../../preload/cursor/archive.cjs#L130) 同样同步调用 sqlite，[archiveTask](../../../../preload/cursor/archive.cjs#L178) 一次最多 3 条语句；入口已用 `Promise.resolve` 包装（[cursor/index.cjs L238](../../../../preload/cursor/index.cjs#L238)）。
4. Claude 配额 [decryptClaudeAppTokenCache](../../../../preload/claude/quota.cjs#L134) 同步调用 `/usr/bin/security` 读钥匙串，超时 5 秒；上层 [withAccessToken](../../../../preload/claude/quota.cjs#L270) 已返回 Promise。
5. 其他同步调用：[ps](../../../../preload/claude/open.cjs#L137)（1 秒）、[PlistBuddy](../../../../preload/claude/app-state.cjs#L259)（2 秒，按文件签名缓存）、[node --version](../../../../preload/codex/node-runtime.cjs#L41)（1.5 秒）。

## 本机实测事实

- 插件安装形态为 `~/Library/Application Support/uTools/plugins/unsafe-*.asar`。
- Cursor 全局库 `state.vscdb` 为 9,223,286,784 字节（约 9.2 GB），工作区库 60 个。
- 崩溃会话里 Cursor 冷预检一次耗时 3,739 ms；重装后会话 55 次 p50 7 ms、最大 19 ms（命中缓存）。
- 本环境 sqlite3 无法打开该库（沙箱限制），全量库存 SQL 的真实耗时未测。

## 根因判断

- 冻结追踪失效：起初推断为 asar 内加载 `__filename` 失败。宿主复验否定了这一推断：uTools 渲染进程创建任何 Worker 都报 `ERR_MISSING_PLATFORM_FOR_WORKER`，原 Worker 方案在该宿主里不可能运行。
- 卡死根因：未确认。Cursor 同步 sqlite 是当前最强候选（单库 9.2 GB、20 秒超时、可多库串行），但崩溃前 Cursor 只在启动时有一次可见预检，不能据此认定。

## 方案（累计变更）

### 1. 冻结追踪常驻化（F-2）

1. 写入端改为独立子进程：`spawn(process.execPath, ['-e', source])`，环境只传 `ELECTRON_RUN_AS_NODE=1` 与 `EYPC_FREEZE_TRACE_CONFIG`，经 IPC 收主线程脉冲与 span。源码由 `runWriter` 及其依赖的常量与校验函数拼成字符串，不从 asar 加载文件。子进程启动异常回传错误码；IPC 断开（插件进程退出或被杀）时写一行 `disconnect` 后自行退出。
2. 启动结果记入普通运行诊断：[diagnostics.cjs](../../../../preload/diagnostics.cjs#L413) 在 `process-start` 后 5 秒记录一次 `freeze-trace/worker-status`，结果为 `ready / starting / unsupported / worker-error / disabled / not-started`，只带 Node 错误码，不带消息正文。放在诊断模块而非主入口，以免入口行数超出预算。
3. 改为长期运行：默认不再到期；单文件写满后滚动到新文件；保留数从 8 份不变，总量上限约 32 MiB。
4. 降低写入量：健康时不写每秒心跳，改为每 60 秒一条存活记录；只写耗时超过 200 ms 的 span 结束记录；主线程停顿超过 2.5 秒时照旧写 `main-stall` 并列出未结束 span。
5. 停用开关 `EYPC_FREEZE_TRACE=0` 保留。
6. [汇总脚本](../../../../scripts/summarize-freeze-trace.mjs#L1) 增加多文件输入，按时间合并。

### 2. Cursor 库存异步化（F-3 主项）

1. `queryWithCli` 改用异步 `execFile`，超时与输出上限不变；`queryRows`、`readPinnedComposers`、`readInventory` 依次改为 async。
2. 增加单飞：同一时刻只允许一次库存读取，后到的调用复用进行中的 Promise。
3. [inspect](../../../../preload/cursor/index.cjs#L114) 改为 await；[冷预检](../../../../preload/index.js#L12081) 改为先 await 库存再组装结果；[公开 readInventory](../../../../preload/index.js#L14488) 已兼容 Promise，不改。
4. 新增追踪 span `cursor.read-inventory`（覆盖整次读取）。
5. 注入的 `DatabaseSync` 与内置 sqlite 回退保持同步实现，仅由 async 函数包裹，行为不变；未注入 `execFile` 时退回注入的 `execFileSync`，仅供测试使用。

### 3. Cursor 归档异步化（F-3 次项）

1. `cliClient` 的 `rows / mutate` 改为异步，`archiveTask` 改为 async，语句顺序（门禁 → 写入 → 复验）和所有结果文案不变。
2. 入口已是 Promise，上层不改。
3. 同一归档器内的归档请求串行执行，避免异步化后两次门禁交错；第二次请求会看到第一次的写入，返回「已在归档列表」。

### 4. Claude 钥匙串读取异步化（F-3 次项）

1. `security` 调用改为异步 `execFile`；`decryptClaudeAppTokenCache`、`readClaudeAppAccessToken` 改为 async；`withAccessToken` 先 await 令牌再执行，保持令牌用后清空。
2. 测试注入的同步 `readClaudeAppAccessToken` 继续兼容。

## 影响与风险

- 时序变化：Cursor 库存和 Claude 令牌从同步变为异步，原本同一轮内立即可用的结果改为下一个微任务后可用。需逐一核对 `inspect()` 及库存读取的使用方，凡同步取值的地方补 await。
- 并发：异步化后可能出现重叠读取，靠单飞消除；归档仍按单次调用串行执行，不新增并发写入。
- 追踪本身：子进程若在 uTools 中起不来，业务照常运行，只是诊断里会出现 `worker-error` 与错误码，这本身就是需要的证据。常驻多一个 Node 模式进程，内存约几十 MB。
- 磁盘：追踪常驻后最多约 32 MiB，位于 `~/.eypc/freeze-traces`。
- 隐私：维持原约束，只记录固定调用名、编号、耗时、计数、字节数，不记录路径、标题、SQL 或输出。
- 本方案降低主线程阻塞，但不保证消除这次卡死；真正根因要靠常驻追踪在下次卡死时取证。

## 测试清单

- 正常流程：追踪子进程以 eval 方式启动并落盘，插件进程被杀后写 `disconnect` 并退出；Cursor 库存异步返回的字段与原同步结果一致；归档三步顺序与文案不变；Claude 令牌读取成功并在用后清空。
- 边界与空值：子进程启动失败、写目录无权限时记录对应结果且业务继续；Cursor 库不存在、sqlite 不可用、JSON 非数组、单个工作区库读失败沿用旧缓存；钥匙串返回空值。
- 权限：钥匙串拒绝或超时返回空令牌，不重试、不弹窗循环。
- 并发与重复提交：两次并发库存读取只起一个 sqlite 进程；归档进行中再次触发不产生第二次写入。
- 回归：`freezeTrace`、`cursorInventory`、`cursorArchive`、`cursorHooks`、`claudeQuotaFallback` 聚焦套件；preload 与 public 镜像校验。

## 验证选择（VerificationImpactTrace，暂定）

- 源码触点 → 追踪 Worker 启动与写入 → 运行诊断；Cursor 库存 → 冷预检 / inspect / 公开读取；Cursor 归档 → 任务动作；Claude 令牌 → 配额读取。
- 聚焦测试为上述 5 个套件，不跑全仓测试。
- 修改了 Preload 构建身份输入，需执行 `pnpm run sync:preloads`、`pnpm run build`、`node scripts/validate-requirements.mjs --write-current-truth`，并提醒重载 uTools。
- 真实宿主验证（追踪是否落盘）只能由用户重载后确认，本任务不启动 uTools。

## 实现与验证结果（2026-10-20）

- 改动：[freeze-trace.cjs](../../../../preload/freeze-trace.cjs#L1)、[diagnostics.cjs](../../../../preload/diagnostics.cjs#L413)、[cursor/inventory.cjs](../../../../preload/cursor/inventory.cjs#L324)、[cursor/index.cjs](../../../../preload/cursor/index.cjs#L114)、[cursor/archive.cjs](../../../../preload/cursor/archive.cjs#L130)、[claude/quota.cjs](../../../../preload/claude/quota.cjs#L134)、[index.js 冷预检](../../../../preload/index.js#L12081)、[汇总脚本](../../../../scripts/summarize-freeze-trace.mjs#L1)、[产物校验探针](../../../../scripts/validate-utools-runtime.mjs#L163)；public 镜像经 `sync:preloads` 同步。
- 新增测试：追踪状态与常驻滚动、快调用过滤、Cursor 单飞与尾随读取、真实 sqlite3 的同步/异步两条路径、并发归档串行、Claude 钥匙串异步路径、诊断模块 5 秒状态记录。
- 聚焦测试：24 个文件 537/537 通过。
- `codexAppServerBridge.test.ts` 3 项失败（Plan 二次确认执行、App Server 方法白名单、初始化失败重试）。在临时副本中把本任务文件恢复为 `HEAD` 后复跑，同样 3 项失败，判定为既有失败，与本任务无关。
- 门禁：伴随核心 40 场景、生命周期 58 检查点、原生未读 23 检查点（源码与打包各一遍）、核心类型 282 文件、工作区镜像 96 对、已跟踪镜像 96 对、运行身份 13 字段、入口预算 14,721 行均通过；需求登记与当前真值已写入。
- 产物 EyPc V7：`host-bdd64e663cdf81768423 / renderer-511a20dff7e6a54cc91f`，builtAt `2026-10-20T02:34:47.641Z`（北京时间 `2026/10/20 10:34:47`）。
- `verify:plan` 报告追踪、汇总脚本、设置说明及三个新改测试文件未登记到 [核心验证映射](../../../knowledge/core-verification-map.json#L1)。修改映射属于治理变更，会触发全量门禁，本任务未改，改为手动执行上述受影响检查；登记留作后续。
- 未运行：全仓测试、真实 uTools 重载与 Worker 落盘验收。

## 宿主复验与子进程改造（2026-10-20）

- 用户 10:41 重载 `7fd52dc` 产物。运行诊断 `runtime-1792464060945-1.jsonl` 第 134 行：`freeze-trace/worker-status` 为 `worker-error`，错误码 `ERR_MISSING_PLATFORM_FOR_WORKER`；`~/.eypc/freeze-traces` 仍未生成。三处异步化不依赖 Worker，已随该次重载生效。
- 只读核对 uTools 的 Electron fuse：`RunAsNode` 为 enabled。`uTools Helper`、`(Plugin)`、`(Renderer)` 三个辅助程序在 `ELECTRON_RUN_AS_NODE=1` 下均以 Node 16.17.1 运行，`child_process.spawn` 可用。
- 用户选定子进程方案，改造见方案 1-1。端到端实测以 `uTools Helper (Plugin)` 作为插件进程：主线程阻塞 4 秒期间写出 2 条 `main-stall` 并点名 `cursor.read-inventory`，恢复后写出约 4,003 ms 的 `end`；插件进程被 SIGKILL 后写出 `disconnect`，无残留子进程。
- 新增测试：插件进程被杀后追踪写 `disconnect`。聚焦 5 个套件 84/84 通过；构建内伴随核心 40、生命周期 58、原生未读 23（打包）与 uTools 产物校验通过；镜像 96 对、入口预算 14,721 行、类型检查、运行身份 13 字段通过；需求真值已写入。
- 产物 EyPc V7：`host-d4cd2c8b400bb0ff586e / renderer-b5ab5f039a525344ea4e`，builtAt 北京时间 `2026/10/20 11:21:37`。
- 宿主验收：用户 11:52 重载该产物。`runtime-1792468368621-1.jsonl` 第 142 行 `freeze-trace/worker-status` 为 `ready`；`~/.eypc/freeze-traces/freeze-1792468368503-31575.jsonl` 已落盘，`identity` 为 `host-d4cd2c8b400bb0ff586e`。追踪子进程 PID 31576 由插件进程 PID 31575 启动，可执行文件为 `uTools Helper (Renderer)`，RSS 约 56 MiB。首 30 秒无 `main-stall`。

## 非目标

- 不处理 `ps`、`PlistBuddy`、`node --version` 三处同步调用：均有 1–2 秒超时且低频。
- 不改 Codex 成员对账（约 5 秒，已是异步）和 Orca 打开耗时。
- 不改 Cursor 数据库本身，不清理或压缩 9.2 GB 的 `state.vscdb`。
- 不改普通运行诊断的写入方式与开关。
- 不处理工作区里已有的 Codex Side 相关未提交改动。

## 文档同步

- 设置说明 [settings.md L46](../../../../src/help/guides/settings.md#L46)：「最多记录 10 分钟」改为常驻滚动说明。
- [ARCHITECTURE.md L304](../../../knowledge/ARCHITECTURE.md#L304)：临时插桩改为常驻追踪。
- [trace-guide](../../260914/plugin-startup-freeze/trace-guide.md#L1) 第 7 条「排查结束应移除 start 接线」加注由本任务取代。
