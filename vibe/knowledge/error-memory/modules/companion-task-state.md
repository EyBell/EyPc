# Companion Task State Error Memory Route

<!-- adaptive-document-index: module-v1 -->

## Scope

This link-only module routes EyPc-specific canonical task state、Plan lifecycle、projection、consumer cache and version-skew failures. Current product authority remains the [RAW-160 Controlled specification](../../../specs/260810/1155-install-runtime-diagnostics/spec.md#L1)；this module does not own requirements or runtime state.

## Current Authorities And Routes

- Current contract and conflict adjudication: [RAW-160 specification](../../../specs/260810/1155-install-runtime-diagnostics/spec.md#L1)
- Current implementation architecture: [ARCHITECTURE](../../ARCHITECTURE.md#L1)
- Current verification and host gate: [RAW-160 verification](../../../specs/260810/1155-install-runtime-diagnostics/verify.md#L1)
- Current product status: [PROJECT_STATUS](../../../specs/PROJECT_STATUS.md#L1)

## Primary Error Records

- [Plan lifecycle and interrupted causality](../companion-plan-lifecycle-and-interrupted-causality.md#L1) — ordinary interruption needs branch-idle proof；unexecuted Plan interruption additionally needs targeted no-newer evidence and retains revisioned Plan readiness.
- [Consumer cache and Float applied ACK](../companion-consumer-cache-and-float-applied-ack.md#L1) — Kernel no-op is not end-to-end deduplication；each consumer keeps its latest selector and Float application needs an explicit ACK.
- [Observation generation is not semantic revision](../companion-observation-generation-is-not-semantic-revision.md#L1) — producer ordering watermarks never advance user-visible revision without a selector change.
- [Provider status display normalization](../codex-provider-status-display-normalization.md#L1) — Provider terminal enums become product state only through the Kernel branch/parent causality contract.
- [Task count/list projection convergence](../codex-task-count-list-projection-divergence.md#L1) — rows、counts、badges、cycle and actions derive from one V4 package.
- [Task-state version skew fails closed](../codex-task-state-version-skew-must-degrade-atomically.md#L1) — missing/incompatible V4 Kernel or Runtime Identity is `reload-required`, with no Controller/Renderer reducer fallback.
- [Preload capability version skew](../codex-preload-capability-version-skew.md#L1) — optional diagnostics may degrade narrowly，but stateful Kernel/package/actions identity must match exactly.
- [Historical completion hysteresis](../codex-completion-transition-hysteresis.md#L1) — elapsed-time completion holds remain retired；causal Kernel evidence and one package replace consumer timers.

## Related Error Records

- [Independent authorities must not share a full refresh](../independent-authorities-coupled-by-full-refresh.md#L1) — Primary owner is the Claude Companion module.
- [Watcher callback latency is not publication latency](../watcher-callback-latency-is-not-end-to-end-publication-latency.md#L1) — Primary owner is the Claude Companion module.
- [New Claude phase must outrank previous cache](../claude-new-phase-must-outrank-previous-cache.md#L1) — Primary owner is the Claude Companion module.

## Historical Or Migration Sources

- RAW-142/150/154/159 remain historical evidence；their conflicting Plan-clear、broad interrupted stop、V3 ownership and send-as-applied clauses are superseded by [RAW-160](../../../specs/260810/1155-install-runtime-diagnostics/raw-requirement.md#L1).
- The flat project root predates the adaptive-index contract and retains unrelated migration debt；this module classifies only the state/Plan records touched by RAW-160 and does not authorize bulk movement or deletion.
