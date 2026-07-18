# EyPc 文件收藏工作台完善规范

Tool: codex

Documentation level: `controlled`

## Requirement Versioning

```yaml
spec_id: SPEC-260711-1452-FILE-FAVORITES-WORKBENCH
spec_revision: 2
status: integrated
raw_sources:
  - RAW-001
  - RAW-002
targets:
  - canonical_manifest: ../../PRODUCT_REQUIREMENTS.md
    base_full_version: unversioned
    result_full_version: 2026-07-11.1
delta:
  - requirement_id: FAVORITES-RELIABILITY
    operation: modify
    before: 收藏树与路径仅按既有输入工作
    after: 图归一化、路径 identity 与运行时健康状态成为稳定合同
    raw_refs: [RAW-001]
    confirmation: explicit
    canonical_location: PRODUCT_REQUIREMENTS.md#file-favorites
  - requirement_id: FAVORITES-FILE-ACTIONS
    operation: modify
    before: 打开、定位和复制使用布尔结果
    after: 结构化 outcome/error/capability、路径检查和真实项复制
    raw_refs: [RAW-001]
    confirmation: explicit
    canonical_location: PRODUCT_REQUIREMENTS.md#file-favorites
  - requirement_id: FAVORITES-INTERACTION
    operation: modify
    before: 管理页和 Quick 的目标、恢复与三栏键盘合同不完整
    after: 显式/抽屉/焦点/多选优先级、Quick 清理、Escape 与撤销闭环
    raw_refs: [RAW-001]
    confirmation: explicit
    canonical_location: PRODUCT_REQUIREMENTS.md#file-favorites
  - requirement_id: FAVORITES-UI-A11Y
    operation: modify
    before: 420px 溢出且弹层焦点恢复不完整
    after: 紧凑双栏/侧层、状态、roving focus、ARIA 和弹层焦点合同
    raw_refs: [RAW-001]
    confirmation: explicit
    canonical_location: PRODUCT_REQUIREMENTS.md#file-favorites
memory_used:
  - ../../2606201810-eypc-file-management-tab/01-spec.md
  - ../../../knowledge/developer-soul.md
memory_updates:
  - ../../PRODUCT_REQUIREMENTS.md
  - ../../../knowledge/ARCHITECTURE.md
  - ../../../knowledge/technical-details.md
  - ../../../knowledge/developer-soul.md
  - ../../../knowledge/error-memory/README.md
open_questions: []
follow_up:
  - raw_ref: RAW-002
    effect: 授权删除意外 pnpm-workspace.yaml，并在既有收藏工作台范围内继续优化和复核
    canonical_change: none
```

- Raw requirement: [raw-requirement.md](raw-requirement.md#L1).
- Canonical Manifest / affected members: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1), `File Favorites`。
- Merge status / missing target: canonical 已合并；无缺失目标。
- Actual surface: `actual`。
- Requirement-runtime gap: macOS uTools 真实 smoke 与 Windows/Linux 实机仍为验证缺口，不影响需求合并状态。

## 目标

在既有文件收藏功能上完成可靠性、跨平台结果契约、键盘目标模型、响应式 UI 与无障碍闭环，使其成为紧凑、可恢复、可验证的收藏工作台，同时保持只管理插件元数据的安全边界。

## Execution Authority

- Control plane: `app-root`
- Sole decision owner: App Root Thread
- Allowed interactive execution surfaces: `main`, `native-thread`
- Automation lane: `not-applicable`
- Surface-to-surface delegation: forbidden
- Main-owned decisions: scope, user communication, risk approval, reconciliation, final acceptance

## 任务规则声明

- 全局入口：CodeNote `VibeAi.md` 已读取。
- 项目入口：`AGENTS.md` → [项目规则](../../../rules/README.md#L1) → [文档规则](../../../rules/documentation.md#L1) → [状态中心](../../PROJECT_STATUS.md#L1) → [架构](../../../knowledge/ARCHITECTURE.md#L1) → [开发者 Soul](../../../knowledge/developer-soul.md#L1)，已读取。
- Sidecar：`native-agents`；Start Explorer、两轮平台/Runtime 与 UI 无障碍审计、两轮 Closeout Reviewer 均只读，主线程独占写入和接纳。
- 既有任务重叠：`partial-overlap`；复用 2026-06 文件收藏基线，只实施净增量。
- 文档路由：需求、业务逻辑、技术细节、开发者 Soul、状态中心；若 RED 确认可复用失败模式，则更新项目错误记忆。
- 高风险门禁：无当前阻断；真实文件删除/移动/重命名、DB、发布、权限和外部写入均不在范围内。

## Prior Task Overlap

- Document governance：复用 [既有文件收藏规范](../../2606201810-eypc-file-management-tab/01-spec.md#L1) 与 [既有验证](../../2606201810-eypc-file-management-tab/04-verify.md#L1) 作为已接纳基线；本任务建立新的 Controlled 增量台账，不改写或复制旧规范正文。
- Execution logic verification：既有任务为 `accepted`；其 26 文件 / 197 测试、平台桥接、快速入口、一级目录和元数据安全边界可复用。旧记录仍保留真实宿主权限与 Windows/Linux 实机未验证门禁，本轮重新验证所有变更边界。
- Traceability：关系为 `partial-overlap`，决策为 `delta-only + new-task`；净增量是坏图归一化、路径标识、结构化结果、目标优先级、撤销、目录键盘、响应式/无障碍与组件行为测试。

## 稳定需求

### 领域与状态

- 收藏图归一化必须确定性修复重复 ID，并把孤儿、自引用和环形父级回收到根级；树构建和祖先搜索保留 visited 防线。
- 路径展示值保持原样；Windows 驱动器和 UNC 路径按分隔符与大小写等价比较，POSIX 路径保持大小写敏感。
- 路径健康、能力和加载状态只存在于 Runtime，不改变 `AppState.version`；失效收藏不得被自动删除。

### 平台桥接

- `open`、`reveal`、`copyPath` 和 `copyItems` 返回结构化结果，区分 `success`、`dispatched`、`revealed-instead`、`failed`。
- 错误码限于 `invalid-path`、`not-found`、`permission-denied`、`no-handler`、`timeout`、`unsupported`、`io-error`。
- 平台暴露能力声明和批量路径检查；目录项暴露符号链接信息但不递归跟随。
- 优先预检路径；uTools void API 只记为 `dispatched`；Electron `shell.openPath` 的空失败串才是已确认成功。
- 不新增 `cmd/start`、`explorer.exe` 或 `xdg-open` shell 分支；浏览器按 capability 禁用宿主动作。

### Runtime 与键盘

- 动作目标顺序固定为：显式参数 → 已打开抽屉冻结目标 → 当前栏焦点 → 当前可见多选。
- 快速入口进入时清空旧多选、抽屉、目录目标和编辑层，并聚焦首个可见结果。
- 完整页可用栏为 `containers | items | directory`，快速入口只在可见栏内操作。
- 打开/定位只接受单项；复制路径、复制真实项、移动父级和移出元数据支持批量。
- `Escape` 按编辑/审核、添加菜单、动作抽屉、目录多选、收藏多选、搜索、容器过滤、行焦点、快速入口隐藏恢复。
- 元数据移出确认显示根节点与后代数量，并提供一次 `Ctrl/Cmd+Z` 撤销。
- 快捷键以用户方案为默认，包括 `Ctrl/Cmd+G` 与兼容 `Ctrl/Cmd+T`、`Ctrl/Cmd+Shift+C`、`Shift+F2` 行内重命名、`Ctrl/Cmd+R` 和 `Ctrl/Cmd+Shift+W`。

### UI 与可访问性

- 完整页保留紧凑双栏；左侧只保留容器搜索、新建分组和树，右侧保留单一添加入口、收藏搜索、列表和目录区。
- 使用现有 Lucide 依赖替换动作文本缩写；完整页和快速页统一焦点、选择、错误、禁用状态。
- 总空态、搜索空态、容器空态、目录加载/失败/空态、路径失效和动作不支持均有可见反馈；结果使用 `role="status"` / `aria-live`。
- 720px 以下容器栏成为命令侧层，420px 视口无页面级横向溢出。
- 树、列表、目录和弹层满足键盘语义、roving tabindex、焦点陷阱及关闭触发点恢复。
- `Shift+F2` 在树或列表名称处行内编辑；分组双击只进入容器，真实文件/文件夹双击才打开。
- 快速入口保持只读，并显示空收藏/无匹配状态。

## 验收标准

- RED/GREEN 覆盖坏图循环、快速入口旧目标、`Escape` 多选链、重复路径编辑、目录旧响应、批量目标优先级。
- 平台矩阵覆盖 darwin/win32/linux/browser、空格、Unicode、前导连字符、UNC、权限、缺失、Promise reject、符号链接和真实项复制。
- 组件行为测试覆盖 ARIA、焦点恢复、空态、禁用态和行内重命名。
- 自动门禁：`pnpm run test`、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:utools`、`git diff --check`、规则审计和 Markdown 代码链接审计。
- 页面验证目标为 1180×680、760×680、640×680、420×680；当前 macOS uTools 可做真实 smoke，Windows/Linux 保留实机待验状态。

## Implementation Sync

| 逻辑 | 权威 | 模块映射 | 集成点 | 证据 |
| --- | --- | --- | --- | --- |
| 收藏图与路径标识 | 本规范 | [favorites.ts](../../../../src/domain/favorites.ts#L1)、[state.ts](../../../../src/domain/state.ts#L1) | Runtime 初始化、新增、编辑、目录标记 | [verify.md](verify.md#L1) verified |
| 平台结果与路径检查 | 本规范 | [eypcPlatform.ts](../../../../src/platform/eypcPlatform.ts#L1)、[preload/index.js](../../../../preload/index.js#L1) | uTools/Electron/浏览器能力边界 | [verify.md](verify.md#L1) source verified；real host gap |
| 目标、键盘与撤销 | 本规范 | [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L1)、[keybindingRuntime.ts](../../../../src/runtime/keybinding/keybindingRuntime.ts#L1)、[keyboardEvent.ts](../../../../src/runtime/keyboardEvent.ts#L1) | 完整页与快速页动作分发 | [verify.md](verify.md#L1) verified |
| 响应式与无障碍 UI | 本规范 | [FavoritesPage.vue](../../../../src/pages/FavoritesPage.vue#L1)、[QuickFavoritesPage.vue](../../../../src/pages/QuickFavoritesPage.vue#L1)、[FavoriteTree.vue](../../../../src/components/FavoriteTree.vue#L1)、[ConfirmLayer.vue](../../../../src/components/ConfirmLayer.vue#L1)、[app.css](../../../../src/styles/app.css#L1) | Vue 页面、组件测试和真实浏览器 | [verify.md](verify.md#L1) verified |

完整需求到代码、测试与宿主验证的当前映射由 [requirements-traceability.md](requirements-traceability.md#L1) 维护。

## 安全与非目标

- 所有删除仍仅删除 EyPc 收藏元数据，不触碰真实文件。
- 本任务不执行 DB/SQL、发布、权限、凭据或外部服务写入。
- 一级目录读取不递归、不跟随符号链接；真实文件修改能力不进入平台接口。
- `public/preload.cjs` 不在本任务范围。
