# Changes: Claude / Cursor 行上时钟在 Turn 关闭后仍可读

| Path | Core description |
| --- | --- |
| `src/domain/cursorAgent.ts` | 完成态 `lastQuestionAt` 回退 `lastUpdatedAt` / `createdAt` |
| `src/domain/claudeCode.ts` | 完成态 `lastQuestionAt` 回退 `lastStopAt` / 活动时间 |
| `src/domain/companionTaskPackage.ts` | Kernel 时钟为 0 时回退完成水位 / `updatedAt` |
| `preload/companion/task-kernel.cjs` | metadata 入站 0 不覆盖已有 `lastQuestionAt` |
| `preload/index.js` | Claude / Cursor 证据时钟带完成/活动回退 |
| `tests/domain/cursorAgent.test.ts` | 完成态有相对时间 |
| `tests/domain/claudeCode.test.ts` | 已读完成回退 `lastStopAt` |
| `tests/domain/companionTaskPackage.test.ts` | 包层 0 回退完成水位 |
| `tests/platform/companionTaskKernel.test.ts` | 后到 0 保留旧时钟 |
| 产物身份 | `host-39a0bdcc59f580df9ac8` / `renderer-4873f208472862aad711`，builtAt `2026-09-04T08:35:13.934Z` |
