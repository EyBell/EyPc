# EyPc 文件收藏工作台交接

Tool: codex

## Controller

- Controller：`app-root`。
- Work-order version：2。
- Canonical plan：[plan.md](plan.md#L1)。
- Canonical ledger：[tasks.md](tasks.md#L1)。
- Verification：[verify.md](verify.md#L1)。

## 当前状态

- 用户已授权删除意外 `pnpm-workspace.yaml`，文件已移除且门禁重跑没有再生成。
- 代码、测试、canonical、架构/技术/Soul 与结构化错误记忆已同步；完整自动门禁为 `36 files / 332 tests`，typecheck/build/uTools 均通过。
- Work-order v2 新增权限元数据、特殊目录项过滤、条件式撤销上下文、pane DOM focus、窄屏错误反馈和确认层渲染时序回退；Root 已复现并接纳两个优化 reviewer 的 findings。
- Closeout Reviewer 2 的 fallback 优先级与 symlink 权限 P1 已修复并在 Attempt 2 定点复核通过；Root 已在完整门禁和构建产物同步后标记 `accepted`。
- Markdown code-link audit 与 `git diff --check` 通过；AI rule audit 仍只报告既有项目 adapter/hub P1 漂移，按独立治理候选 deferred。
- macOS uTools 真实 smoke 与 Windows/Linux 实机仍为 `unverified`；无 DB、发布、权限或外部服务写入需要接管。真实文件创建、移动、重命名、删除仍未进入能力范围。

## 安全恢复

若继续：

1. 若继续宿主验收，先在 macOS uTools 做安全的 open/reveal/copy smoke，再分别在 Windows/Linux 实机验证；不得用源码矩阵代替宿主结论。
2. 收藏 CSS cascade anchors 仅在独立模块化任务中整体迁移并重跑四视口，不做无证据的机械删除。
3. AI rule audit 的既有 P1 adapter 漂移应放入独立治理任务，不在本产品任务扩面。

不得以子线程 `reported`、单个命令 exit 0 或 candidate memory 代替 Root 接纳。
