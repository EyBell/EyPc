# Window Jump Workbench — Tasks and Execution Journal

Tool: codex
Updated: 2026-08-01

## Current Work Items

| ID | Work | Status |
| --- | --- | --- |
| WJ-21.1 | 领域 `WindowFamily`、关系/能力证据及完整/部分清单语义 | completed |
| WJ-21.2 | `root-current` / `member-exact` 与精确失败无回退 | completed |
| WJ-21.3 | Windows/macOS 用户窗口准入和最终焦点复验 | completed |
| WJ-21.4 | 普通根/子树、Finder/Explorer 固定两级及子窗动作限制 | completed |
| WJ-21.5 | 旧 preload 门禁、Runtime inventory 集中化及回归修正 | completed |
| WJ-21.6 | 聚焦测试、typecheck、production/uTools build 与静态收口 | automated-verified |
| WJ-21.7 | 真实 uTools 根/成员/过滤/视觉验收 | host-validation-pending |
| WJ-DOC-01 | 清理失效关系原始需求、重复计划/日志和历史验证正文 | completed |

## Compact History

| Milestone | Outcome | Current relevance |
| --- | --- | --- |
| WJ-01–WJ-10 | 建立窗口工作台、槽位、诊断、置顶和基础原生桥 | 保留通用交互与安全边界 |
| WJ-11–WJ-18 | 探索并验证过 Space、标题和精确 AX/CG 路线 | Space/标题方案已清退；只保留“精确 AX↔CG 身份证据”原则 |
| WJ-19 | 分离逻辑目标与窗口实例，实例失效后人工确认换绑 | 仍适用于持久主窗口根 |
| WJ-20 | 引入根窗口族与文件管理器虚拟父节点 | 根身份和文件管理器例外保留；成员隐藏已清退 |
| WJ-21 | 主窗口稳定、真实子窗会话化精确落点、用户窗口严格准入 | 当前权威 |

## Current Execution Journal

- 2026-07-31 — WJ-21 完成生产实现；旧 preload 列表门禁、单一 Runtime inventory 更新、隐藏子窗动作上下文回根及 macOS 操作时 CG 范围复验已在第一性复核中修正。
- 2026-07-31 — 精确 WJ 暂存快照四组窗口测试 `219/219`、语义 typecheck、production build 与 uTools package validation 通过。完整套件 A/B 从父提交 `661/675` 改善为 `664/676`，没有新增窗口失败；剩余 12 项位于未触碰的 Codex 文件。
- 2026-07-31 — 后续构建拆包把 main chunk 从 `595.12 kB` 降至 `365.55 kB`，500,000-byte 门禁和无 Vite 体积警告通过。
- 2026-08-01 — 按用户授权压缩 Controlled 文档与相关错误记忆；旧逐轮正文由 Git 历史保留，当前入口只指向 WJ-21 契约和仍适用的 WJ-19 根换绑边界。未修改任何生产代码或测试。
