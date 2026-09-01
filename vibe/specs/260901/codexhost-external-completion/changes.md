# Changes: CodexHost 额外进程完成态

| Path | Core description |
| --- | --- |
| `preload/codex/codexhost-discovery.cjs` | CLI completed → `idle`; running snapshot 1s TTL |
| `preload/index.js` | snapshot-corroborated terminal; Host unread; Desktop overlay guard |
| `public/codex/codexhost-discovery.cjs` | canonical mirror |
| `public/preload.js` | canonical mirror |
| `tests/platform/codexhostDiscovery.test.ts` | idle mapping + running→completed refresh |
| `tests/platform/providerEvidenceAdapterV7.test.ts` | exact terminal unread candidate |
| `scripts/validate-preload-entry-budget.mjs` | ratchet 14096 |
| `src/help/guides/codex.md` | extra-process completion copy |
| `vibe/specs/PRODUCT_REQUIREMENTS.md` | RAW-190 current semantics |
| `preload/codex/codexhost-discovery.cjs` | Host 全状态映射：creating/running/input/approval/interrupted/failed/completed |
| `preload/codex/codexhost-discovery.cjs` | RAW-193：Host 未读有值即用；仅 unread event false / 跳转可清未读 |
| `preload/codex/codexhost-discovery.cjs` | RAW-194：会合点失败不缓存空列表；thread list 翻页 |
| `preload/companion/evidence-adapter-v7.cjs` | RAW-194：Host extra-process connector-active 是 live |
| `preload/codex/inventory-turn-fields.cjs` | RAW-195：snapshot-corroborated 终态盖过 Desktop live inProgress |
| CodexHost `app-server-host.ts` | list 保留 interrupted/failed/creating；提问 `attention: "input"` |
| `vibe/specs/requirements/codex-raw-190.md` | registry leaf |
| `vibe/knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md` | completion overlay occurrence |
| `vibe/specs/260901/codexhost-external-completion/*` | raw + spec |

Not done: real uTools reload. RAW-185 pin-group changes remain a separate review and commit batch even when closed out in the same working tree.
