# Window Jump Workbench — Handoff

Tool: codex
Updated: 2026-08-01

## Delivery State

`wj21-main-child-window-tree / implemented / automated-verified / host-validation-pending`

当前交付以真实主窗口为稳定持久目标，普通应用显示桥证明的真实子窗口作为会话级精确落点；Finder/Explorer 固定为虚拟父→真实根两级。根使用 `root-current`，子窗使用无回退的 `member-exact`。系统/helper/CG-only/控件及其他不可证明表面不进入树。

## Authorities

- 用户事实：[raw-requirement.md](raw-requirement.md#L1)
- 当前合同：[spec.md](spec.md#L1)
- 执行记录：[tasks.md](tasks.md#L1)
- 验证与宿主门禁：[verify.md](verify.md#L1)
- 领域/平台架构：[ARCHITECTURE.md](../../../knowledge/ARCHITECTURE.md#L1)

## Host Acceptance Focus

重载 preload 后依次验收：根当前子会话、指定成员精确激活与失效无回退、同应用独立根、Finder/Explorer 固定两级、企业微信等噪声过滤、子窗动作限制、完整/部分缓存及搜索/折叠/`Escape` 焦点回根。持久根真正失效时仍走 WJ-19 人工换绑。

## Documentation Boundary

2026-08-01 已按用户授权移除 Controlled 文档中的逐代 Space、标题识别、成员隐藏和重复验证正文。历史实现与实验仍可从 Git 和 [error-memory/README.md](../../../knowledge/error-memory/README.md#L1) 追溯，但不得重新解释为当前行为。

## Safety

不得自动提升 macOS 权限、修改应用标题、模拟输入、绕过 Windows 前台保护或在未确认时强制终止进程。
