# Changed inventory — Claude 会话中断相位与 Host 线程权威

事后补登记：下表文件已随 `8bb0e3e` 与 `96cf75a` 提交，本任务只补书面依据。

| 路径 | 作用 | 提交 |
| --- | --- | --- |
| `preload/claude/interrupt-probe.cjs` | RAW-197：转录尾巴中断探针（新模块） | `8bb0e3e` |
| `public/claude/interrupt-probe.cjs` | 同上镜像 | `8bb0e3e` |
| `preload/claude/index.cjs` | RAW-197：inventory 与 state-v2 两处折成 stopped | `8bb0e3e` |
| `scripts/utools-preload-assets.mjs` | RAW-197：新模块进预载清单 | `8bb0e3e` |
| `tests/platform/claudeInterruptProbe.test.ts` | RAW-197 聚焦用例 | `8bb0e3e` |
| `preload/claude/scripts.cjs` | RAW-198：Hook 正文盖 `CODEXHOST_THREAD_ID` | `96cf75a` |
| `preload/claude/events.cjs` | RAW-198：`h` 字段校验、小写化与粘性保存 | `96cf75a` |
| `preload/claude/code-sessions.cjs` | RAW-198：`codexhostThreadId` 随会话行下发 | `96cf75a` |
| `preload/claude/index.cjs` | RAW-198：元数据 upsert 带上 Host 链接；启动时原地刷新已登记 Hook | `96cf75a` |
| `preload/index.js` | RAW-198：Host roster 持有时退休原生 claude 行 | `96cf75a` |
| `public/preload.js` | 同上镜像 | `96cf75a` |
| `scripts/validate-preload-entry-budget.mjs` | 棘轮 (q)：+22 行的唯一旧依据 | `96cf75a` |
| `tests/platform/claudeBridge.test.ts` | RAW-198：`h` 字段校验用例 | `96cf75a` |
