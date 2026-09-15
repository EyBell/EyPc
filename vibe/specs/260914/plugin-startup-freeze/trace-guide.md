# 临时卡顿日志使用与验证

1. 本轮只准备工作区诊断产物，插件保持屏蔽。新包被用户明确加载后，在实际 uTools renderer 主入口自动启用独立 Worker，最多运行 10 分钟；不通过 uTools.getPath 或 dbStorage 初始化日志。
2. 文件目录为 `~/.eypc/freeze-traces`，本机展开为 `/Users/gdkmjd/.eypc/freeze-traces`。文件名 `freeze-<timestamp>-<pid>.jsonl`；单文件最多 4 MiB，启动时保留最多 7 个旧自有文件加本次文件，权限目录 0700/文件 0600。不会清理原有 runtime diagnostics。
3. 每条只有固定调用名、span 编号、PID、时间、耗时、数量、字节数；start 含 host 构建身份。无任务 ID、标题、路径、对话、命令参数、输出、异常正文或堆栈。
4. begin/end 用于定位进入/退出；worker 每秒记录 heartbeat；主线程脉冲超过 2.5 秒未到时写 main-stall，并列出最多 128 个未结束 span。传输最多 256 条待确认消息；超出只计 dropped，不阻塞业务。磁盘 I/O 和旧追踪清理全部在 worker 内。
5. 覆盖：preload 初始化、插件进入、主状态存储与用户目录 SDK、Orca 库存/CLI/未读观测/异步数据库/原生文件 stat/read/parse、Codex 冷状态与预检派发、Kernel commit/emit/consumer 同步、Float 创建/清理/推送、窗口能力与列表、原日志 drain。`reconciliation-dispatch` 只度量派发，不代表后续 Promise 已完成；其余异步 CLI/库存/窗口 span 等待结果。
6. 单次文件可通过以下只读脚本汇总。替换为实际生成的文件名；输出包含调用次数、累计/最大耗时、未结束调用、心跳超时期间挂起的调用、丢弃与截断计数。

```sh
node scripts/summarize-freeze-trace.mjs /Users/gdkmjd/.eypc/freeze-traces/freeze-实际时间-实际进程.jsonl
```

7. 可通过宿主继承环境 `EYPC_FREEZE_TRACE=0` 在加载前停用本临时追踪；默认 10 分钟自动停止。它与设置页普通安装日志开关独立，普通日志关闭不会关闭这条临时通道。排查结束应移除 main 的 start 接线并重新构建；本轮不修改宿主环境、不要求用户现在重载。
8. 已用独立 Node 子进程阻塞主线程 300ms 验证：Worker 在阻塞期间仍写出该 span 与 main-stall，恢复后 end 耗时符合阻塞。另测限流、容量、到期、Worker 写失败与隐私过滤。这是 Node 离线能力证明；uTools 对打包路径内 Worker 的支持及真实落盘需要单独确认，未运行真实宿主验收。
9. 若 Worker 无法创建、模块受限或文件权限失败，业务仍继续；没有日志不证明插件正常。进程/整个系统暂停、事件丢弃和文件上限均须与真正调用阻塞区分。
