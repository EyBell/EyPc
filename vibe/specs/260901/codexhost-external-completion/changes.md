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
| `vibe/specs/requirements/codex-raw-190.md` | registry leaf |
| `vibe/knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md` | completion overlay occurrence |
| `vibe/specs/260901/codexhost-external-completion/*` | raw + spec |

Not done: real uTools reload; pin-group dirty files in the same checkout left untouched.
