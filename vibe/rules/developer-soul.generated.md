<!-- generated-from: code-note/developer-soul.md sha256:20bb3cb3adecb94f7c00c794a7714a3b00bd2ea1b0f2ea4b9c7a4bb3e574cbe5 -->
<!-- generated; edit the canonical source and republish -->

# Developer Soul Rules


Stable taste guides engineering and product choices after user intent, project requirements, safety and observed behavior. It does not add universal procedures.

Before architecture, UI/interaction, configuration, storage or performance decisions, read the relevant project Soul when one is declared; it precedes shared taste. Requests to improve, beautify, refactor or optimize preserve the core workflow and its acceptance conditions unless the user changes them.

## Engineering Taste

Trace the actual entrypoint, state owner, data flow and side effect before fixing a symptom. Prefer root-cause repair, existing project patterns, explicit ownership and reversible changes. Introduce abstraction for a demonstrated repeated contract; optimize a measured bottleneck. Preserve needed compatibility and make degraded behavior diagnosable. Formatting and language conventions belong to the project's tools. Details: [engineering](engineering.generated.md) and verification (central dependency unavailable: `testing/rules.md`).

## UI And Product Taste

Choose the relevant surface profile through design preferences (central dependency unavailable: `design-preferences/README.md`). Existing project design is the default when no stable preference applies.

- Workbenches: compact, scannable, keyboard-capable layouts; target actions near their target. User-managed groups and members share the same list (central dependency unavailable: `ui/grouped-list.md`). Preserve selection, search state and focus across refresh and editing; normal feedback stays non-blocking.
- Reading/review surfaces: clear hierarchy and comfortable line length; sticky navigation (central dependency unavailable: `ui/review-document-aesthetic.md`) respects page chrome and destination previews (central dependency unavailable: `ui/positional-navigation-preview.md`) reveal useful context.
- Brand/showcase surfaces: typography, space, images and motion follow the approved creative direction. Motion, new fonts, large whitespace or GSAP are never universal defaults.

All surfaces preserve native text editing, accessible contrast, touch/keyboard use and focus recovery. Contextual help explains consequences, prerequisites, disabled reasons or recovery without duplicating labels. Reuse one project help primitive; do not disturb scroll, drag or editing ownership. UI fidelity and implementation validation stay with UI rules (central dependency unavailable: `ui/rules.md`).

## Documentation Taste

Keep one current owner and short links. Project knowledge stores verified reusable facts; task notes store only useful continuity. Preview/demo and shipped runtime claims remain explicit. Answer with the decisive result and evidence that changes the user's judgment. Keep optional suggestions separate and omit them when empty.

## Soul Evolution

Persist new taste only when the user explicitly authorizes it and its scope is known. Stable project preferences stay local; shared preferences use their sole owner and index. One-off or inferred tastes stay conversational. Candidate review is opt-in and does not block routine work. Memory, consent and conflict handling remain with their existing owners; this file does not repeat them.
