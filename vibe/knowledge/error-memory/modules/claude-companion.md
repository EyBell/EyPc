# Claude Companion Error Memory Route

<!-- adaptive-document-index: module-v1 -->

## Scope

Link-only route for Claude Code inventory、phase、unread、open、archive and capability-authority failures. It does not own the current requirement or duplicate generic engineering failures.

## Current Authorities And Routes

- [Claude authority reset specification](../../../specs/260807/claude-code-companion-authority-reset/spec.md#L1)
- [Controlled task-state specification](../../../specs/260810/1155-install-runtime-diagnostics/spec.md#L1)
- [Architecture](../../ARCHITECTURE.md#L1)
- [Project status](../../../specs/PROJECT_STATUS.md#L1)

## Primary Error Records

- [Capability gap asserted without shipped-App evidence (superseded)](../capability-gap-asserted-without-reading-the-shipped-app.md#L1)
- [Generic session end must not overwrite completion](../claude-generic-session-end-must-not-overwrite-completion.md#L1)
- [StopFailure must not close a continuing parent turn](../claude-stop-failure-must-not-close-continuing-parent-turn.md#L1)
- [Metadata activity is not completion evidence](../claude-metadata-activity-is-not-completion-evidence.md#L1)
- [Metadata archive does not prove native sidebar convergence](../claude-metadata-archive-does-not-prove-native-sidebar-convergence.md#L1)
- [New phase must outrank previous cache](../claude-new-phase-must-outrank-previous-cache.md#L1)
- [Readiness must not depend on an unneeded capability](../claude-readiness-gated-on-unneeded-capability.md#L1)
- [Session family、open route and state authority are distinct](../claude-session-family-open-route-and-state-authority-conflation.md#L1)

## Related Error Records

- [Independent authorities must not share full refresh](../independent-authorities-coupled-by-full-refresh.md#L1)
- [Watcher callback latency is not publication latency](../watcher-callback-latency-is-not-end-to-end-publication-latency.md#L1)

## Historical Or Migration Sources

- The original mixed-session provider、Desktop provider、old resume/open route、old unread byte scan and N-window quota task remain historical evidence under their task folders; current behavior is owned by the authority-reset and Controlled task-state specifications.
