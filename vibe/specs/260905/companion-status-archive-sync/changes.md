# Changes: 状态来源与额外进程归档双向实时

| Path | Core description |
| --- | --- |
| `preload/claude/code-sessions.cjs` | 唯一关联 live Hook 不得被未递增 `completedTurns` / `lastActivityAt` 退休 |
| `public/claude/code-sessions.cjs` | canonical mirror |
| `tests/platform/claudeBridge.test.ts` | running 保留；旧 Turn `completedTurns` 递增仍可退休 |
| `preload/index.js` | `codexThreadAlias` 粘性钉 `codexhostExternal` |
| `preload/codex/archive-bridge.cjs` | 别名或花名册走 Host；protocol-error 改道；verify-1 后 companion 通知；Host Desktop ACK 超时 `not-required` |
| `public/codex/archive-bridge.cjs` | canonical mirror |
| `tests/platform/codexhostArchive.test.ts` | Host 车道、改道、companion 通知、ACK 不 fail-closed |
| `tests/platform/codexPinBridge.test.ts` | 置顶别名同样钉 Host 身份 |
| `vibe/specs/requirements/codex-raw-209.md` | 登记双向实时归档 |
| `vibe/specs/requirements/claude-raw-210.md` | 登记 unique live Hook |
| `vibe/specs/requirements/codex-raw-199.md` | 注记由 RAW-209 细化，归档真机已过 |
| 产物身份 | `host-13eeb115891c9342c49a` / `renderer-723677a2b5a038e83771`，builtAt `2026-09-05T10:02:52.351Z` |
