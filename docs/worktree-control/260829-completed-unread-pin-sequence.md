# EyPc 已清理工作树归档指针

Git 子工作树已在 2026-08-30 / 2026-09-07 清完。2026-09-17 复核：`git worktree list` 只有主检出 `main`。

保留的非 Git 归档（不是 worktree）：

- 目录：兄弟 `EyPc-worktrees/backup-260829-completed-unread-pin-sequence-ufb6mz/`
- 原任务分支：`codex/260829-completed-unread-pin-sequence` @ `129b5f68`
- 内容：清理前未提交的 `public/runtime-identity.cjs` 备份；说明见该目录 `README.md`

空壳已删：`EyPc-worktrees/codex/`、`EyPc/.Worktrees/`、`EyPc/.claude/worktrees/`、`~/.mirasim/worktrees/EyPc`。

新任务不要往兄弟 `EyPc-worktrees/` 开树；用 `EyPc/.Worktrees/{lane}/{slug}/`。
