# 工作树合入索引

2026-09-17 复核时，Git 清单只有主检出 `main`。此前的附加 Git worktree 已在 08-30 / 09-07 清完。

| 任务 | 源分支 / HEAD | 当前状态 | 后续 |
|---|---|---|---|
| [已完成未读钉选](docs/worktree-control/260829-completed-unread-pin-sequence.md) | `codex/260829-completed-unread-pin-sequence` / `129b5f68` | 检出早已移除；分支保留；兄弟目录只留 identity 备份 | 不要把备份目录当 worktree 恢复 |

<!-- worktree-control-observations:start -->
| 任务与主目录记录 | 进度 / 保留 | 核心规划 | 下一步 / 恢复条件 | 标记 |
| --- | --- | --- | --- | --- |
| [261120-eypc-float-card-compact](docs/worktree-control/261120-eypc-float-card-compact.md) | local-main-ready / active | 页签顶格，额度与首组标题同排，最后 30 分钟读分钟 | 从主检出产物接入 uTools 并手测外观及交互；手测反馈后在功能工作树继续 | `ace43c208b7ff2fe` |
| [261120-eypc-shortcut-optimization](docs/worktree-control/261120-eypc-shortcut-optimization.md) | local-main-ready / active | 分来源发布跳转缓存，复核轮次与派发，收敛主窗、浮窗和 Runner 键位 | 从主检出产物接入 uTools；核对同版加载、连续按键、实际窗口到达和原生清读 | `9833786ee842fa8e` |

[Git、规划摘要与缓存引用记录](docs/worktree-control/index.json#L1)
<!-- worktree-control-observations:end -->
