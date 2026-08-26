# EyPc V7 Global Refactor — Verification Record

status: `automated-verified / artifact-ready / integrated / real-host-unverified`
updated: `2026-08-26`

## Verified Evidence

- Control baseline remains `6e1d6e3704e628b4d1fa5c7fa845403f39cbb0ff`; implementation is isolated on `codex/260824-eypc-v7-global-refactor`.
- Generated contract and preload gates pass: `sync:preloads`, `validate:contracts`, and `validate:mirrors` (`62` tracked pairs verified plus `2` new generated pairs; validator passed).
- Provider → Adapter → Kernel → Bridge focused matrix: `4` files, `228/228` tests passed.
- Kernel truth/lifecycle/concurrency matrix: `72/72` tests passed, including invalid cross-Provider batch atomic rejection and corrected same-revision retry.
- Repository suite: `106/106` files and `1494/1494` tests passed.
- `pnpm run typecheck` passed.
- Production `pnpm run verify` passed end to end, including generated preload sync, all tests, `validate:contracts`, typecheck, Vite build, runtime preparation, `validate:utools` and mirror validation; final artifact identity is `host-cb0294e803978c67b881 / renderer-6817c1e4fe6fd2808739`.
- Requirements and source authorities pass: `30` source documents, `207` ordered anchors, `315` leaves, `287` active, `22` superseded, `6` proposed, `0` conflicted. The six proposed leaves are pre-existing unconfirmed proposals and remain warnings, not silently promoted.
- Error memory passes with `123` leaves (`88` verified, `24` candidate, `11` superseded). Five pre-existing candidate-review dates remain warnings.
- Static ownership gates find no production V4 reducer, Host phase feedback, Renderer whole-snapshot Page contract or non-surface page/component keydown owner. Provider waiting strings remain only in the evidence adapter's interaction extraction, never as activity evidence.

## Acceptance Boundaries

- Automated/source/build acceptance proves the V7 artifact is internally coherent; it does not prove the installed uTools Host loaded that artifact.
- Not run without separate authorization: installation/reload, real Host identity readback, reply/cancel/execute under 300ms, 30-second no-rebound, Float reconnect/refollow/Provider/Host restart, or Codex/Claude/Cursor live canaries.
- Product Design live visual QA was not run: no browser/Playwright or real Host screenshots were captured. System light/dark, compact/comfortable, forced-colors, text scaling and keyboard/focus behavior remain Host-visual gates despite passing static/component checks.
- 2026-08-25 integration round: the worktree tree re-passed `pnpm run verify` before staging (`106/106` files, `1494/1494` tests, contracts, typecheck, production build, uTools validator, `62` verified mirror pairs plus the `2` new generated pairs), and `validate:requirements` / `validate:error-memory` passed with only pre-existing proposed/candidate warnings. After merging into `codex/port-management-redesign` the merged tree re-passed the same full `verify` with `64` mirror pairs. Because `package.json` is a Renderer content-identity input, the target branch's own script wiring changed the Renderer asset id to `renderer-6817c1e4fe6fd2808739` while the Host id stayed `host-cb0294e803978c67b881`; the PRODUCT_REQUIREMENTS truth snapshot was regenerated with `validate-requirements.mjs --write-current-truth` rather than hand-edited.
- Push, installation and publication were not performed.

## Documentation Impact

Classification: `requirement-canonical + project-current + task-only`, synchronized across PRODUCT_REQUIREMENTS, requirement registry/conflicts, PROJECT_STATUS, architecture, technical details, help, source anchors and project error memory. Personal Codex memory was not written.

## 2026-08-26 Claude State/Read Corrective Increment

- Claude metadata membership delta now carries indexed metadata only and preserves activity/interaction/unread/topology generations；a separate state microtask correlates the admitted member。The regression proves many inventory deliveries cannot starve the next real completed state, and inventory without unread authority cannot manufacture a read。
- Claude App `1.37937.0` is admitted only after privacy-bounded grammar verification。Its fixed CycleHealth usage-limit error is an explicit interrupted Turn and folds to `stopped/exact-terminal`；focus remains hot-unread-only and cannot renew phase evidence。
- Card click and global-shortcut sources converge at the same Navigation/Action/Provider receipt boundary。Both current Claude Deep Link outcomes remain `dispatched / confirmsRead=false`；diagnostics now expose only bounded `confirmsRead / handoffStage / nativeVisible` fields。
- Verification: affected `8` files `356/356` tests passed；contracts、typecheck、`74` committed preload mirror pairs、requirements、error-memory、production build and uTools validator passed。Current read-only log replay of the user-identified task resolves to stopped。Artifact identity is `host-328ae8b2f2ff25baf18f / renderer-34ee7434ee28243c10e7`。
- Boundary: no uTools reload/install or live shortcut/card/focus canary was run；artifact readiness does not prove the running Host loaded this identity。
