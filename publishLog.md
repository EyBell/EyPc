# EyPc Publish Log

Tool: codex

## 首版结论

- 版本基线：`0.1.0`，基于 2026-06-25 当前工作区生成。
- 发布定位：uTools 单实例插件，覆盖端口进程管理、MQTT WebSocket 调试、文件/文件夹收藏与快捷键治理。
- 发布建议：适合进入内测/候选发布；对外发布前必须补齐 uTools 宿主、真实 MQTT Broker、跨平台端口扫描/终止烟测。

## Codex 全浮球用户版本更新日志（2026-07-23）

- 新增 Codex 全浮球入口：紧凑水球展示真实 5 小时/Weekly 额度，Weekly 存在时显示同一额度池的连续或 20 段进度环，支持 Spark 额度展示。
- 新增 Codex 任务工作台：按 `进行中`、`已完成`、`已隐藏`、`项目`组织任务，并保留 Codex 原生 `Pinned / Projects / Chats` 结构、项目归属和稳定排序。
- 新增实时状态同步：macOS Codex Desktop 通过受控私有 IPC 提供进行中状态与完成未读；App Server 仅承担额度、模型、任务库存及归档等连接器职责，连接降级时不会伪造实时状态。
- 新增全浮球操作：待输入/完成未读角标可直接打开对应集合中的第一条任务，支持 `F` / `Shift+F` / `Ctrl+F` 快速跳转、`Ctrl+T` 聚焦创建任务、任务多选与批量操作。
- 优化任务状态稳定性：原始 `interrupted` 在用户界面短暂保持为进行中，非 desktop-live active 持续 60 秒后才允许生成完成标记；任务从进行中完成时保持 2 秒展示窗口，状态、角标、详情和归档能力同步释放，避免界面闪烁。
- 完善归档与项目管理安全边界：进行中的任务不可归档；项目“隐藏”仅影响本地展示，“移除”属于受 Codex Desktop 运行状态、别名、指纹和结构校验保护的高风险操作。
- 增强隐私保护：Codex 会话正文、摘要、路径和原始身份只在 preload 边界内瞬时处理，不进入渲染层、持久化、日志或发布文档。
- 当前交付状态：功能已实现并完成 `git diff --check`、`pnpm run typecheck` 与 Markdown 代码链接审计，仍为“未校验，待用户验收”；本轮未执行自动化测试、build、uTools 宿主、截图或真实 Codex 操作，发布前需完成真实 macOS Codex Desktop 验收，并单独确认 Windows 能力边界。

## 发布范围

- 端口进程：跨平台扫描监听端口、搜索排序、多选、普通终止/强杀、端口组与分组夹；强杀前仍校验 PID 与端口归属，入口见 [src/runtime/appRuntime.ts](src/runtime/appRuntime.ts#L3929)。
- MQTT：连接配置、订阅别名/颜色、topic 筛选、收发记录、发送收藏、发送历史、草稿历史、Shift/`Ctrl+I` 预览；核心模型见 [src/domain/types.ts](src/domain/types.ts#L42)，运行时动作见 [src/runtime/appRuntime.ts](src/runtime/appRuntime.ts#L4986)。
- 文件收藏：文件/文件夹/虚拟分组统一为插件元数据，支持搜索、树形整理、打开、定位、复制路径、快速打开入口；领域逻辑见 [src/domain/favorites.ts](src/domain/favorites.ts#L48)。
- 设置治理：功能开关、快捷键分层、冲突/保留规则、工具悬浮预览设置；默认快捷键源见 [src/runtime/keybinding/keybindingRuntime.ts](src/runtime/keybinding/keybindingRuntime.ts#L238)。

## 技术边界

- 技术栈：Vue 3 + TypeScript + Vite + Vitest，构建脚本见 [package.json](package.json#L7)。
- 插件入口：uTools manifest 声明主窗口、端口、MQTT、收藏、快速收藏、设置入口，见 [public/plugin.json](public/plugin.json#L15)。
- 分层结构：UI 只渲染快照并派发动作；`AppRuntime` 统一持有交互状态和 Action dispatch，入口见 [src/App.vue](src/App.vue#L16) 与 [src/runtime/appRuntime.ts](src/runtime/appRuntime.ts#L470)。
- 平台隔离：进程、文件、剪贴板、存储均经 platform/preload 桥接，浏览器开发态有降级能力，见 [src/platform/eypcPlatform.ts](src/platform/eypcPlatform.ts#L26)。
- MQTT 存储：优先 `node:sqlite` 本地归档，失败降级到 uTools `dbStorage`/浏览器 `localStorage`；SQLite schema 与迁移入口见 [preload/index.js](preload/index.js#L230)。
- 打包约束：仓库是 ESM，uTools preload 运行时强制同步为 CommonJS package scope，见 [scripts/prepare-utools-runtime.mjs](scripts/prepare-utools-runtime.mjs#L1)。

## 本版重点

- MQTT 工作台已从“快连”扩展为紧凑调试台：连接栏、订阅栏、消息/收藏/历史列表、发送区、草稿历史和左右抽屉均由 Runtime 命令接管。
- MQTT 发布体验增强：`Ctrl+H` 草稿历史、`Ctrl+Shift+H` 手动保存、`Ctrl+1/2/3` 信息筛选、`Ctrl+M` 收藏列表、`Ctrl+Shift+F` topic 筛选，测试覆盖见 [tests/runtime/keybinding.test.ts](tests/runtime/keybinding.test.ts#L248)。
- MQTT 数据可靠性增强：连接快照、会话消息、发送收藏、草稿历史纳入本机归档；密码/令牌只走 local-only secret 存储，不进入同步归档。
- 端口与收藏能力保留稳定边界：端口终止是高风险动作，收藏删除只删除插件元数据，不删除真实文件。
- uTools 发布门禁已内置：`pnpm run build` 串联 typecheck、Vite build、runtime asset 准备和 uTools runtime 校验，见 [package.json](package.json#L12) 与 [scripts/validate-utools-runtime.mjs](scripts/validate-utools-runtime.mjs#L1)。

## 发布风险

- 当前工作区包含大量未提交改动；发布前需要确认 `preload/index.js` 与生成的 `public/preload.js` 同步。
- MQTT SQLite 依赖宿主 Electron/Node 对 `node:sqlite` 的支持；不支持时会降级，但需确认真实 uTools 环境下的状态展示与迁移。
- 端口扫描/终止依赖 macOS/Linux `lsof`、Windows `netstat/taskkill`；Windows/Linux 真实环境必须单独烟测。
- MQTT 连接、订阅、收发和 retained/QoS 行为需要真实 Broker 验证；单元测试不能覆盖 Broker 兼容性。
- 文件打开/定位依赖宿主文件 API 和系统命令；跨平台路径、权限和不存在文件需要手测。

## 发布前验证

- 自动门禁：`pnpm run test`、`pnpm run typecheck`、`pnpm run build`。
- uTools 宿主烟测：用 [public/plugin.json](public/plugin.json#L1) 加载插件，验证六个 feature entry、单实例重复进入、默认窗口高度。
- 端口烟测：扫描本机端口，普通终止临时进程；强杀只在确认 PID+端口匹配后执行。
- MQTT 烟测：连接测试 Broker，验证订阅、发送、历史、收藏、草稿历史、topic 筛选、SQLite/降级状态。
- 收藏烟测：添加文件/文件夹、快速入口打开、Finder/Explorer 定位、移出收藏不删除真实文件。

## 当前验证状态

- 已通过：`pnpm run typecheck`。
- 已通过：`pnpm run test`，30 个测试文件、249 个测试通过。
- 已通过：`pnpm run build`，包含 typecheck、Vite production build、uTools runtime asset 准备和 `validate:utools`。
- 已通过：`pnpm run validate:utools`。
- 已通过：Markdown 代码链接审计。
- 未执行：uTools 宿主烟测、真实 MQTT Broker 烟测、Windows/Linux 端口烟测。

## 关键代码索引

- 产品入口：[public/plugin.json](public/plugin.json#L1)，[src/runtime/feature/featureRouting.ts](src/runtime/feature/featureRouting.ts#L31)。
- 应用壳与懒加载：[src/App.vue](src/App.vue#L17)。
- 领域模型：[src/domain/types.ts](src/domain/types.ts#L1)，[src/domain/mqtt.ts](src/domain/mqtt.ts#L3)，[src/domain/ports.ts](src/domain/ports.ts#L30)，[src/domain/favorites.ts](src/domain/favorites.ts#L48)。
- 运行时核心：[src/runtime/appRuntime.ts](src/runtime/appRuntime.ts#L470)，[src/runtime/action/actionRuntime.ts](src/runtime/action/actionRuntime.ts#L23)，[src/runtime/keybinding/keybindingRuntime.ts](src/runtime/keybinding/keybindingRuntime.ts#L505)。
- 平台桥：[src/platform/eypcPlatform.ts](src/platform/eypcPlatform.ts#L26)，[preload/index.js](preload/index.js#L1)，[src/platform/processBridge.ts](src/platform/processBridge.ts#L8)。
- 验证面：[tests/runtime/action.test.ts](tests/runtime/action.test.ts#L1)，[tests/runtime/keybinding.test.ts](tests/runtime/keybinding.test.ts#L1)，[tests/platform/mqttSqlitePreload.test.ts](tests/platform/mqttSqlitePreload.test.ts#L1)，[tests/ui/mqttPage.test.ts](tests/ui/mqttPage.test.ts#L1)。
