# EyPc 文件收藏工作台需求原始记录

Tool: codex
Date: 2026-07-11
Spec: [spec.md](spec.md#L1)
Source format: `chat`
Capture fidelity: `as-received`

```yaml
spec_id: SPEC-260711-1452-FILE-FAVORITES-WORKBENCH
source_format: chat
capture_fidelity: as-received
entries:
  - raw_id: RAW-001
    captured_at: 2026-07-11T14:52:00+08:00
    state: integrated
  - raw_id: RAW-002
    captured_at: 2026-07-11T17:43:00+08:00
    state: integrated
```

## RAW-001

~~~~text
PLEASE IMPLEMENT THIS PLAN:
# EyPc 文件收藏工作台完善方案

## 摘要

将现有功能继续定位为“键盘优先的文件收藏工作台”，保留虚拟分组、快速打开和一级目录查看，不扩展为会创建、移动、重命名或删除真实文件的完整文件管理器。

成功标准：

- macOS、Windows、Linux 的打开、定位、复制结果不再误报。
- 快速入口不会继承管理页旧选择或抽屉目标。
- 异常收藏树不会循环或卡死。
- 双栏 UI 更紧凑，420px 宽度无横向溢出。
- 树、列表、目录、弹层均有完整键盘、焦点和状态反馈。

## 核心改动

### 1. 领域与状态可靠性

- 新增收藏图归一化：重复 ID 后项确定性重建 ID；孤儿、自引用和环形父级回收到根级；树构建与祖先搜索增加 visited 防线。
- 新增路径比较键：展示路径保持原样；Windows/UNC 路径按分隔符和大小写比较，POSIX 保持大小写敏感；新增、编辑、点选和目录标记共用，避免等价路径重复。
- 不改变 `AppState.version`，路径健康、图标、加载状态均为运行时数据；不存在、离线或无权限的收藏继续保留并显示状态，可通过 `F2` 修正。

### 2. 跨平台桥接接口

- 将布尔返回升级为：
  - `FileActionResult.outcome`: `success | dispatched | revealed-instead | failed`
  - `FileErrorCode`: `invalid-path | not-found | permission-denied | no-handler | timeout | unsupported | io-error`
  - `FileCapabilities`: 打开、定位、复制路径、复制真实项、选择、目录读取、路径检查能力。
  - `FavoritePathInspection`: 路径状态、类型、符号链接、大小、修改时间和错误码。
- `open/reveal/copyPath` 改为结构化结果；新增 `copyItems(paths)`、`inspectPaths(paths)`；目录项补充符号链接信息但不递归跟随。
- 优先预检路径，再使用能返回错误信息的 Electron `shell.openPath`；uTools 的 void 型打开/定位 API 只能记为 `dispatched`，不能宣称已确认成功；macOS 打开失败但定位成功时明确显示“已定位替代打开”。uTools 官方提供跨平台打开/定位与真实文件复制能力，Electron `openPath` 可返回失败文本。[uTools 系统 API](https://www.u-tools.cn/docs/developer/api-reference/utools/system.html)、[uTools 复制 API](https://www.u-tools.cn/docs/developer/api-reference/utools/copy.html)、[Electron shell](https://www.electronjs.org/docs/latest/api/shell)
- 不新增 `cmd/start`、`explorer.exe`、`xdg-open` 等 shell 分支；浏览器开发态按 capability 禁用不支持动作。

### 3. Runtime、选择与快捷键

- 统一动作目标优先级：显式参数 → 已打开抽屉的冻结目标 → 当前栏焦点 → 当前可见多选。
- 进入快速入口时清除旧多选、抽屉、目录目标和编辑层，并聚焦第一个可见结果。
- 收藏栏扩展为 `containers | items | directory`；完整页 `Tab/Shift+Tab` 只循环当前可用栏，快速入口不再切到隐藏容器栏。
- 多选规则固定为：打开/定位只允许单项；复制路径、复制真实项、移动父级和移出元数据可批量；搜索后裁剪不可见选择。
- `Escape` 顺序固定为：编辑/审核 → 抽屉 → 目录多选 → 收藏多选 → 搜索 → 容器过滤 → 行焦点 → 快速入口隐藏。
- 移出容器仍级联移除插件元数据，但确认框显示根节点与后代数量，并提供一次 `Ctrl/Cmd+Z` 撤销。

| 行为 | 默认快捷键 |
| --- | --- |
| 新增目标、选文件、选文件夹 | `Ctrl/Cmd+N`、`Ctrl/Cmd+O`、`Ctrl/Cmd+Shift+O` |
| 新建分组 | `Ctrl/Cmd+G`，保留 `Ctrl/Cmd+T` 兼容绑定 |
| 打开、定位、复制路径 | `Enter`、`Ctrl/Cmd+Enter`、`Ctrl/Cmd+C` |
| 复制真实文件/文件夹 | `Ctrl/Cmd+Shift+C` |
| 全编辑、行内重命名、移动父级 | `F2`、`Shift+F2`、`Ctrl/Cmd+F2` |
| 刷新目录和路径状态 | `Ctrl/Cmd+R` |
| 容器栏、动作抽屉 | `Ctrl/Cmd+Shift+W`、`Ctrl/Cmd+→` |

### 4. UI、响应式与可访问性

- 保留紧凑双栏：左侧只保留容器搜索、新建分组和树；右侧统一收藏搜索、单一“添加”入口、列表和目录区，删除重复按钮及重复计数。
- 使用现有 Lucide 图标替换 `DIR/FILE/开/定/复` 文本缩写；统一完整页与快速页的蓝色焦点、选择、错误和禁用状态。
- 增加总数据为空、搜索无结果、容器无结果、目录加载中/失败/空目录、路径失效、动作不支持等状态；操作结果通过 `role="status"`/`aria-live` 展示。
- 720px 以下容器栏变为命令控制的侧层；行改为名称与路径两行结构，审核表单改为纵向卡片；验证到 420px 无页面级横向滚动。
- 树项补齐 `aria-level/expanded/selected` 和原生披露按钮；列表使用 roving tabindex/`aria-activedescendant`；弹层补齐 dialog 语义、完整字段循环、焦点陷阱和关闭后的触发点恢复。
- `Shift+F2` 在树或列表名称处行内编辑；分组双击进入容器，文件/文件夹双击才执行打开。
- 快速入口继续只读，增加空收藏与无匹配提示，不放入管理动作。

## 测试与验收

- 先补 RED 回归：坏图循环、快速入口旧目标、`Escape` 多选链、编辑成重复路径、目录旧响应、批量目标优先级。
- 平台矩阵覆盖 `darwin/win32/linux/browser`，包括空格、Unicode、前导连字符、UNC、权限、缺失路径、Promise reject、符号链接和复制真实项。
- 增加 `@vue/test-utils + happy-dom` 的组件行为测试，替代仅检查源码字符串的关键 UI 用例；覆盖 ARIA、焦点恢复、空态、禁用态和行内重命名。
- 实际页面验证 1180×680、760×680、640×680、420×680；当前 macOS uTools 做真实打开/定位/复制 smoke。Windows/Linux 只在实机验证完成后才宣称宿主验收通过。
- 完整门禁：`pnpm run test`、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:utools`、`git diff --check`、规则审计与 Markdown 代码链接审计。
- 当前基线已通过收藏聚焦测试 `5 files / 49 tests` 和 Runtime 收藏用例 `18 passed`；实际观察确认 420px 存在溢出及弹层关闭后焦点落回 `body`。工作树保持干净。

## 假设、文档与门禁

- 未收到选项回答，采用推荐默认：收藏工作台、紧凑双栏、保留 `Ctrl/Cmd+C` 复制路径并新增真实项复制、失效路径保留并标记。
- 文件功能默认启用状态保持现状；一级目录查看不升级为任意目录导航；不加入递归扫描或文件监听。
- 后续实施按 Controlled 需求任务建立 `raw-requirement.md + spec/plan/tasks/verify/handoff`，同步产品需求、状态中心、架构/技术记忆和项目 UI soul。
- 若 RED 测试确认快速入口旧目标或收藏环问题，更新项目 error memory；不修改全局规则，Evolution Candidate 为 `none`。
- 本规划轮未修改过程文档、需求、记忆或代码。无 DB/SQL、发布、权限或外部写入；真实文件删除、移动、重命名始终在范围外。陈旧 `public/preload.cjs` 的删除也不纳入本轮。

## 后续建议

1. 按完整方案一次落地跨平台、Runtime、UI 与测试。
2. 先只实施 P1 稳定性：坏图、快速入口、`Escape`、平台结果契约。
3. 先制作完整页与快速页的响应式 UI 原型，确认视觉后再接入行为。
~~~~

## RAW-002

~~~~text
授权, 然后继续进行优化
~~~~

## Capture Boundary

- Included: 用户明确要求实施的产品定位、行为、快捷键、UI、验收、文档和风险边界，以及对意外 `pnpm-workspace.yaml` 删除的授权和在既有范围内继续优化的指令。
- Excluded: 本轮 Agent 叙述、工具输出、测试日志和实现推断。
- Audio unavailable or unclear terms: not applicable。
