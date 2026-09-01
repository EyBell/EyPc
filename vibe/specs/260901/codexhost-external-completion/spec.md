# Standard Requirement Spec: CodexHost 额外进程完成态

Tool: pi
Date: 2026-09-01
Status: `confirmed` · implementation-landed / focused-automated-verified / artifact-ready / host-pending
Documentation level: `standard requirement`

Raw source: `raw-requirement.md`
Canonical target: `vibe/specs/PRODUCT_REQUIREMENTS.md` Codex Companion

## Task Documentation Sync Group

- Group key: `dsg:eypc:260901-codexhost-external-completion`
- Group owner: this `spec.md`
- Excluded unrelated dirty documents: pin-group kernel/presentation WIP in the same checkout

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260901-codexhost-external-completion",
  "group_owner": "vibe/specs/260901/codexhost-external-completion/spec.md",
  "documents": [
    "vibe/specs/260901/codexhost-external-completion/raw-requirement.md",
    "vibe/specs/260901/codexhost-external-completion/spec.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md"
  ],
  "dependencies": [
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/sync-utools-preloads.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260901/codexhost-external-completion/",
    "preload/codex/codexhost-discovery.cjs",
    "preload/index.js"
  ]
}
```

## Requirement Delta

- Add: CodexHost 额外进程（`harnessId != codex`）在委派 CLI `thread list` 报告 `status=completed` 时，EyPc 必须离开「进行中」，并按 Host 未读进入「已完成未读」或「已完成」。
- Add: 该 completed 是精确终态（`snapshot-corroborated`），可关闭同 id 残留的 Desktop live active（无 waiting flag）。
- Clarify: 官方 App Server `notLoaded` 仍不是完成；禁止再把 CLI completed 映射成 `notLoaded`。
- Pending decisions: 无。Host 仍报 `running` 时不得用 Desktop 空闲外观或刷新间隔发明完成。

Acceptance:

1. CLI completed → connector `idle` + latest Turn `completed` + confirmed evidence + `idleConfirmed`。
2. `hasUnreadTurn: true` → 已完成未读；`false` → 已完成已读；字段缺省的新完成 → 已完成未读（不得宣称已读）。
3. Desktop 官方未读原子不得覆盖外部行的 Host 未读。
4. 打开成功仍清未读。
5. CLI `running` 保持进行中；`attention=approval` 仍进待输入。

## Prior Task Overlap

- Relationship: `continuation` of 2026-09-01 CodexHost 外部会话识别（membership + 跳转）。
- Decision: `delta-only`。不重做会合点/CLI 枚举。

## VerificationImpactTrace

- Changed surface: discovery 行/Turn 形状、sanitize 终态标签与未读、Desktop shadow 对外部 id 的 status/unread 覆盖。
- Direct consumers: `scanVerifiedCodexInventory` → `companionCodexEvidenceV7` → Kernel groups。
- Focused tests: `tests/platform/codexhostDiscovery.test.ts`、`tests/platform/providerEvidenceAdapterV7.test.ts`。
- Not selected: 仓库级 `pnpm test` / MQTT / 真实 uTools。
- Identity: preload 变更，收尾 `pnpm run build` + `validate-requirements --write-current-truth`。

## Implementation Sync

Desired behavior: Host CLI 是外部会话唯一 Turn 权威。completed 映射为 idle + 已确认 completed Turn；unread 走 Host 字段；Desktop follow 不能把已确认完成重新打成进行中，也不能用官方未读原子宣称已读。

## Closeout

Focused automated verification in this task; real uTools reload remains user-owned.
