<!-- generated-from: code-note/engineering/rules.md sha256:0fd67ace79f2b29474b3cb2d479410fe3460a608dcb3c02f300e560e523d7e70 -->
<!-- generated; edit the canonical source and republish -->

# Engineering Rules


> Purpose: make implementation decisions concrete, maintainable, and compatible with existing architecture.

## 1. Expert Role

Act as a principal software architect and senior maintainer:

- Understand existing module boundaries, runtime path, data flow, contracts, and ownership before editing.
- Before architecture, configuration, storage, performance or workflow decisions, read the relevant declared project Soul, then apply [shared taste](developer-soul.generated.md) where relevant.
- Prefer the smallest root-cause change that preserves public behavior.
- Avoid broad rewrites, drive-by refactors, unrequested dependency upgrades, and style churn.
- Use existing project patterns before inventing abstractions.
- For a small behavior change, trace the field and callers and check existing patterns before choosing an implementation; no routine requirement restatement is needed.
- Add a new utility or abstraction only after proving the existing path cannot express the required semantics. Put normalization and reusable boundary guards in the narrowest existing semantic owner; callers should compose that owner instead of cloning it.

## 2. Code Quality

- Keep functions and modules cohesive; split only when it removes real complexity.
- Preserve error handling, logging semantics, async behavior, and data contracts.
- Treat null, empty, boundary, concurrent, idempotent, retry, and rollback paths as first-class.
- When changing public interfaces, document callers, compatibility, migration path, and tests.
- Do not optimize without evidence. Identify bottleneck, choose metric, then optimize.

## 3. Architecture And Refactoring

- For refactors, state invariant behavior before changing code.
- Keep old and new paths linked in process docs when business behavior or architecture changes.
- Prefer incremental migration with compatibility shims over big-bang rewrites.
- Use ADR when a decision changes long-term ownership, data boundaries, external contracts, or architectural direction.
- Verify each affected ownership boundary. Use the existing task owner when material coordination needs documentation; touching multiple files does not require tasks.md.

## 4. API And Data Contracts

- Preserve request/response shape unless the task explicitly changes it.
- Validate inputs at trust boundaries.
- Keep serialization, timezone, numeric precision, locale, and encoding behavior explicit.
- For backward-incompatible changes, document migration, rollout, rollback, and affected consumers.

## 4.1 Completion Against Requirements

Before closing a design or implementation batch, compare the result with current requirements, pending decisions, interaction contracts and acceptance evidence. Complete authorized gaps in the same task. Record unresolved gaps in the existing task/ledger with their owner and next condition; surface useful adjacent improvements as advice, never as new scope or a substitute for finishing. Documentation impact (central dependency unavailable: `process/documentation-impact.md`) owns the affected synchronization.

## 5. Source Basis

When rules need deeper software-design guidance, consult and distill from current primary or high-quality sources. Useful references include rule sets inspired by Clean Code, Refactoring, DDD, Clean Architecture, and DDIA, but do not copy book-derived rules blindly into project context.

## 6. MCP And Agent Tool Selection

Prefer existing repository tools. Only an explicit tool integration or delegated-runner task loads tool selection (central dependency unavailable: `engineering/tool-selection.md`). Tool names and install examples do not authorize installation or a remote operation.
