# Window Jump Workbench — Current Plan

Tool: codex
Updated: 2026-08-01

## Completed Implementation Route

1. 保留真实主窗口作为唯一稳定普通目标，并由 `WindowFamily { root, children }` 表达会话主子关系。
2. 让普通应用展示真实根→已证明子窗；让 Finder/Explorer 独占虚拟父→真实根的固定两级例外。
3. 用 `root-current` 与 `member-exact` 分离默认根切换和指定成员精确激活，后者失效时禁止回退。
4. 在原生桥收紧用户窗口准入：Windows 使用 `EnumWindows` + `GA_ROOTOWNER`，macOS 使用 AX-first + 正 CG 身份佐证。
5. 把树投影、导航、搜索展开、焦点恢复和动作上下文集中到 `windows/windowTree`，Runtime 只协调状态与副作用，页面只渲染投影。
6. 保持子窗会话化，阻断其持久化、收藏、pin、槽位、多选、编辑、置顶、强杀与批量入口。
7. 提升并镜像桥版本 `wj21-main-child-window-tree`，在清单与操作入口统一阻断旧 preload。
8. 更新既有窗口合同测试，执行聚焦测试、语义 typecheck、非 watch production/uTools build、镜像/符号/链接/差异检查；真实宿主验收保持独立。
9. 2026-08-01 清理被取代的关系原始需求和重复过程证据，仅保留当前契约、简明取代关系、当前验证及宿主缺口。

## Constraints

- 保留无关脏树，不覆盖 Codex Companion、Action Runner 或其他并行修改。
- 不新增 UI/原生依赖，不为去重重写跨进程 PowerShell/JXA，不扩大 native 权限或操作范围。
- 文档清理不改变运行时行为；代码验证证据不得因文档压缩被重新解释为真实 uTools 验收。
- 已清退的 Space、标题/序号、唯一候选、应用级关系猜测和成员隐藏方案不得回流。
