---
id: eypc-req-codex-raw-155
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-155
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-pending / lane-isolation-push-first-navigation-and-runtime-observability"
---

# RAW-155 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户以真机截图与复现补充五类缺陷：精确 interrupted 被陈旧 active 外壳显示为进行中；Claude 从进行中到已完成未读的变化被吞；上一个/下一个任务明显慢于直接点击；任务区持续刷新且手动刷新无必要；悬浮球/卡片偶发卡死且无法定位慢调用。当前实现升级为 `companion-task-kernel-v2 / companion-task-package-v2`，每个 Provider 分别维护 membership、phase、unread 水位；新 lane 只更新自身字段，同代次其它 lane 仍可接纳，旧 V1 包 fail closed。Codex Host 的精确 completed/interrupted 证据优先于陈旧 active 壳，成员变化在任何 phase/unread 代次下都先触发仅 Codex 的窄盘点。Claude bridge 的 state/inventory/unread 订阅改为 Host+Renderer 多播；首次冷库存后动态安装新增目录 watcher，Host/Renderer 并发 unread 读取合并为同一次读取，异步结果提交前基于最新任务包重放，避免较晚返回的旧整包删除新会话或覆盖 completed-unread。正常可信推送直接更新进程包，不读取额度、环境或完整库存；完整盘点只允许冷启动、重连或明确成员缺口，删除任务完整校对周期、手动全量刷新和 `Ctrl+R`，保留定向环境检测与 Claude 单任务同步。额度自动刷新默认 300 秒、最小 1 秒，旧 0 迁移为 300。动态列表先按状态分组，所有分组内按最近提问时间倒序；通用循环按 attention → Plan → active → local pin 分层，层内同样按最近提问时间倒序，Provider/置顶不覆盖。导航第一下立即派发；只有首个打开仍在执行时才保留最终尾随目标，手动/attention 优先且全局并发 1。Float 增加 2 秒心跳、超过 6 秒失联判定、60 秒重建冷却和 10 秒恢复观察；交互带匿名 ID 并在 10 秒空闲、blur 或生命周期结束时清理。运行诊断只写固定枚举 JSONL，单文件 2 MB、总量 10 MB、最长 7 天，不记录 raw ID/标题/提示词/路径/URL/Token/命令/stdout/stderr/堆栈；慢阈值、缓存、结果和计数可由本机只读探针核验。产品标题统一为“额度任务悬浮球”，眉题为“CODEX · CLAUDE COMPANION”。真实 uTools 重新接入后的状态转换、快速连按、Float 自恢复与日志落盘仍是独立宿主门禁。
