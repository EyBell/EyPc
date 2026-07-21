# Codex Companion 真实会话与交互交接

Tool: codex
Date: 2026-07-21
Status: `accepted`

## Result

- Codex Companion 已从 recent-100 近似库存升级为真实原生项目库存：只读解析 Codex 项目注册状态，完整分页读取未归档任务，并用 assignment、Chats、最深 cwd 的固定优先级过滤已移除/未注册项目。
- Host Snapshot V2 只有在项目指纹、完整分页和每条 latest Turn `startedAt` 全部有效时才发布 `verified`；中途项目变化重试一次，失败保留上一份已验证 stale 快照或展示错误空态。
- 会话投影 V3 使用默认 30 天、可配置 1–365 天的滚动窗口，边界包含。`全部 / 进行中 / 已隐藏 / 已完成 / 项目` 均按最新提问时间严格倒序，搜索只过滤不重排。
- 项目页按 Codex 原生 `Pinned / Projects / Chats` 结构展示，不重复任务并保留空项目；原生顺序只读，本地置顶追加“本地”标记并可排序。
- 任务和项目支持本地别名；最后页签和项目折叠跨重启恢复。搜索词、选择、焦点和确认态不跨重启。持久化只含散列身份/稳定项目指纹，不含原始 ID、路径或任务列表。
- “从 EyPc 移除”是明确的插件本地抑制，可恢复且不会冒充 Codex 删除；原生项目 absent→present 时自动解除旧抑制。
- 展开卡片的第一行就是五页签，其下依次为统一搜索、服务端真实额度文字和内容；旧水球/卡片切换、隐藏、刷新、设置、关闭工具栏已从展开面板删除。
- 水球不再先弹出迷你详情，pointer enter 直接展开。中心只显示最近重置的真实额度；Weekly 存在时绘制清晰 5px 完整轨道与剩余圆弧。只有 Weekly 时不显示或伪造 5 小时窗口。
- 任务行常显固定短字符 `开 / 名 / 顶 / 隐（或显）/ 归`，项目行常显 `名 / 顶 / 归 / 移`；每槽 32px，归档/移除在原槽切换为 `确`，不再使用圆点、图标、hover 展开或宽度动画。
- Codex 悬浮子窗不再挂载视觉 Tooltip，也不为水球、任务、项目或操作按钮设置原生 `title`；ARIA 与键盘焦点保留，主程序其他页面的 Tooltip 不变。
- 点击/Ctrl/Shift 多选继续有效；Space 只切换当前任务或项目可见子项，焦点与滚动保持原位。至少两项可见选择时出现绝对浮动批量栏 `已选 N / 归 / 操 / 清`，根据焦点/末选项在列表中的上下半区自动置底/置顶，不改变列表行位置。
- 单条原生归档重读身份、状态、版本、latest Turn 和项目指纹，拒绝 active/inProgress/变化证据；写入后同时核验 false 缺席与 true 存在。项目归档忽略 30 天窗口，20 条一批、并发 2、跳过 active 并保留逐项失败。
- 项目批量归档只做模拟集成测试。真实验收只使用专用临时任务完成 archive/unarchive 双向核验并最终归档清理；现有任务未被操作。

## Run And Verify

- Development: `pnpm serve`，在 uTools 开发模式加载 [public/plugin.json](../../../../public/plugin.json#L1)。
- Full gates: `pnpm test && pnpm run typecheck && pnpm run build`。
- Real read-only inventory: `node scripts/codex-real-preflight.mjs 30`。
- Real archive acceptance: `node scripts/codex-archive-lifecycle-check.mjs --create-temp-task`；该命令会真实创建并最终归档一个临时 Codex 任务，只应在明确验收时执行。
- Current evidence: [verify.md](verify.md#L1) 记录聚焦 `2 / 44`、全量 `47 / 444`、类型/构建/uTools、380/330/104px 浏览器 QA、真实库存 `55 → 34 → 28`、Weekly-only `14%`，以及专用临时任务的真实归档/恢复双向验收。

## Privacy And Compatibility

- [preload/index.js](../../../../preload/index.js#L1) 是原始项目状态、thread/Turn ID、cwd 与 action alias 的唯一进程内边界；Renderer 和持久化层只接收匿名键、项目描述、顺序和短期动作别名。
- 不读取 Codex SQLite/LevelDB/正文，不写 `.codex-global-state.json`，不自动操作 Codex 桌面 UI。
- Host V2 旧字段保留一版迁移兼容；未来 Easy Agent 可替换 provider/floating host 而不改变 Renderer 的五页签和本地元数据合同。

## Residual Boundary

- 跨 App Server 的精确 running/input/approval 状态仍需要同一 live authority；裸 `notLoaded` 不被猜成完成或运行。
- `thread/read`/latest Turn 复核与 `thread/archive` 之间没有条件写原语，仍有 provider-level TOCTOU。
- 真实 Windows uTools 发现/系统热键、真实 deep link、多显示器/DPI、macOS 两个普通 Space 和一个全屏 Space 仍是宿主验收残余。
