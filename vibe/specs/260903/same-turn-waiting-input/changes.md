# Changes: 同一 Turn 仍进行中的精确提问公开为待输入

| Path | Core description |
| --- | --- |
| `preload/companion/task-kernel.cjs` | running 不再短路打开的 interaction；成员聚合 waiting > running |
| `preload/index.js` | Cursor 合成 interaction 传入 `observation.interactionKind` |
| `tests/platform/companionTaskKernel.test.ts` | running+interaction（Codex/Cursor）与 running 根 + waiting 子；源合同禁止 running 短路 |
| `scripts/validate-preload-entry-budget.mjs` | 入口行数 14357 → 14360（Cursor kind 转发 +3） |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` / `ARCHITECTURE.md` / `src/help/guides/codex.md` | 公开顺序改为 interaction 先于 running；帮助点名 Questions / AskQuestion |
