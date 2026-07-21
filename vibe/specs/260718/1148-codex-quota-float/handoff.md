# Codex Companion 真实会话与交互交接

Tool: codex
Date: 2026-07-21
Status: `accepted`

## Result

- Codex Companion 已从 recent-100 近似库存升级为真实原生项目库存：只读解析 Codex 项目注册状态，完整分页读取未归档任务，并用 assignment、Chats、最深 cwd 的固定优先级过滤已移除/未注册项目。
- Host Snapshot V2 只有在项目指纹、完整分页和每条 latest Turn `startedAt` 全部有效时才发布 `verified`；中途项目变化重试一次，失败保留上一份已验证 stale 快照或展示错误空态。
- 会话投影 V3 使用默认 30 天、可配置 1–365 天的滚动窗口，边界包含。`全部 / 待输入 / 动态 / 已完成 / 已隐藏 / 项目` 均按最新提问时间严格倒序，搜索只过滤不重排；动态页依次分为待输入、当前动态、已完成未查看。
- 项目页按 Codex 原生 `Pinned / Projects / Chats` 结构展示，不重复任务并保留空项目；原生顺序只读，本地置顶追加“本地”标记并可排序。
- 任务和项目支持本地别名；最后页签和项目折叠跨重启恢复。搜索词、选择、焦点和确认态不跨重启。持久化只含散列身份/稳定项目指纹，不含原始 ID、路径或任务列表。
- “从 EyPc 移除”是明确的插件本地抑制，可恢复且不会冒充 Codex 删除；原生项目 absent→present 时自动解除旧抑制。
- 展开卡片的第一行就是六页签，其下依次为统一搜索、服务端真实额度文字和内容；旧水球/卡片切换、隐藏、刷新、设置、关闭工具栏已从展开面板删除。
- 水球不再先弹出迷你详情：上半区 hover 不展开，三个数字角标可直接点击且没有延时 hover 动作；指针进入下半区才立即展开。球体显式点击/键盘激活仍有效，触屏不模拟 hover。额度按普通 5 小时正余额、普通周正余额、最高正余额 Spark 选择；两个普通窗口均无正余额时显示 Spark，百分比上方出现 `S`，外环跟随同池周额度。缺失窗口不伪造也不等于 0。
- 默认模型策略是 `quota-auto`：普通阶段使用配置的 `newThreadPreferredModel`，否则用目录默认/首个非 Spark；任一真实返回的普通窗口为 0 时切换最高可用 Spark，Spark 不可用则要求手选。本次手选不持久化。
- 点击项目 `＋`、`Ctrl+T` 或右键新建每次打开新会话编辑器，显示目标项目、模型名称/ID、选择原因和额度。原生 textarea 支持系统听写；Enter 换行、Ctrl/Cmd+Enter 提交、Tab 圈定、Escape 清稿并恢复触发点。冻结选择在额度/目录/项目变化后会刷新并要求再次确认。
- 专用瞬时桥接以精确项目 cwd/模型和 `allowProviderModelFallback=false` 创建线程，校验响应顶层实际模型/cwd 后才发送首轮并打开线程 Deep Link。首轮失败清理零轮线程，清理不确定时停重试；首轮成功但打开失败只保留短期重试打开。提示词不进入通用 action、快照、日志、存储、文档、错误记忆、Deep Link 或剪贴板。
- 项目行只常显 `＋`，任务行不再常显操作轨。新建、选模新建、打开、详情、别名、置顶、隐藏、归档与项目动作集中在右键/Ctrl+右完整抽屉；禁用原因可见，危险动作置后并保留二次确认。
- Codex 悬浮子窗不挂载主应用 Tooltip，也不设置原生 `title`；水球保持无额度气泡，普通 hover 卡片已删除。按住纯 Shift 才显示白名单只读预览；它不抢焦点、不重排列表，自动翻转/夹紧并在窄屏内部滚动，且永不读取正文、摘要、raw ID、cwd 或路径。
- 会话单击只聚焦/选择，双击或 Enter 打开；Ctrl/Shift/Space 扩展选择，Space 新增后自动下移，取消保持原位。至少两项可见选择时出现绝对浮动批量栏 `已选 N / 归 / 操 / 清`，根据焦点/末选项自动置底/置顶，不改变列表行位置。
- App Server 状态通知立即投影，200ms 单飞轻量列表复核待输入/动态状态，连续三次失败退避到 1s；结构变化进入完整 Host V2 扫描。水球左上为红色待输入数，右上为当前动态及已完成未查看数。
- 同页只有一个高亮项，方向键和真实鼠标移动按所有权切换；Shift+↑/↓ 只更新高亮/预览，不改变多选。右键未选先单选、已选保留多选，项目右键清任务选择。`Ctrl+T` 是设置页可改键的 Codex profile 命令；浮窗本地解析 `when`/layer、维护 `codex-composer` 输入角色和 Escape LIFO。Quick Jump 过滤裁剪、遮挡、pointer-events、视口与命中栈，会话标记只聚焦。`codex.float.activate`/uTools 入口继续直接显示、展开并聚焦卡片。
- 成功打开完成未查看任务会推进当前完成版本的本地已查看水位；项目折叠乐观反馈，自动收起约 100ms。
- 单条原生归档重读身份、状态、版本、latest Turn 和项目指纹，拒绝 active/inProgress/变化证据；写入后同时核验 false 缺席与 true 存在。项目归档忽略 30 天窗口，20 条一批、并发 2、跳过 active 并保留逐项失败。
- 项目批量归档只做模拟集成测试。真实验收只使用专用临时任务完成 archive/unarchive 双向核验并最终归档清理；现有任务未被操作。

## Run And Verify

- Development: `pnpm serve`，在 uTools 开发模式加载 [public/plugin.json](../../../../public/plugin.json#L1)。
- Full gates: `pnpm test && pnpm run typecheck && pnpm run build`。
- Real read-only inventory: `node scripts/codex-real-preflight.mjs 30`。
- Real archive acceptance: `node scripts/codex-archive-lifecycle-check.mjs --create-temp-task`；该命令会真实创建并最终归档一个临时 Codex 任务，只应在明确验收时执行。
- Current evidence: [verify.md](verify.md#L1) 记录本轮水球上下半区/角标直点、额度/模型/创建/Shift/Quick Jump 聚焦回归、全量 `48 files / 473 tests`、typecheck、production build/uTools、canonical/public preload 同步、本机 App Server schema 与独立普通/Spark 额度读取、380/330/104px 浏览器 QA，以及既有真实库存和专用临时任务归档/恢复证据。本轮按合同未执行真实 `turn/start` 或系统听写宿主验收。

## Privacy And Compatibility

- [preload/index.js](../../../../preload/index.js#L1) 是原始项目状态、thread/Turn ID、cwd 与 action alias 的唯一进程内边界；Renderer 和持久化层只接收匿名键、项目描述、顺序和短期动作别名。
- 不读取 Codex SQLite/LevelDB/正文，不写 `.codex-global-state.json`，不自动操作 Codex 桌面 UI。
- Host V2 旧字段保留一版迁移兼容；额度 V2 与模型目录保持版本化，活动通道只发布匿名状态 delta。未来 Easy Agent 可替换 provider/floating host，而不改变 Renderer 的六页签、本地元数据、`quota-auto` 或瞬时新会话合同。

## Residual Boundary

- 跨 App Server 的精确 running/input/approval 状态仍需要同一 live authority；裸 `notLoaded` 不被猜成完成或运行。
- `thread/read`/latest Turn 复核与 `thread/archive` 之间没有条件写原语，仍有 provider-level TOCTOU。
- 真实 Windows uTools 发现/系统热键、真实系统听写、真实 `turn/start`/deep link、多显示器/DPI、macOS 两个普通 Space 和一个全屏 Space 仍是宿主验收残余。
