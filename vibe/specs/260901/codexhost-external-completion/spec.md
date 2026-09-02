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
    "vibe/specs/260901/codexhost-external-completion/changes.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/requirements/codex-raw-190.md",
    "vibe/specs/requirements/codex-raw-191.md",
    "vibe/specs/requirements/codex-raw-192.md",
    "vibe/specs/requirements/codex-raw-193.md",
    "vibe/specs/requirements/codex-raw-194.md",
    "vibe/specs/requirements/codex-raw-195.md",
    "vibe/specs/requirements/codex-raw-199.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/rules/README.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md"
  ],
  "dependencies": [
    "preload/codex/codexhost-discovery.cjs",
    "public/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "public/preload.js",
    "scripts/validate-preload-entry-budget.mjs",
    "vibe/specs/source-anchors/catalog.json",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/providerEvidenceAdapterV7.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "preload/codex/archive-bridge.cjs",
    "public/codex/archive-bridge.cjs",
    "tests/platform/codexhostArchive.test.ts"
  ],
  "validators": [
    "scripts/validate-requirements.mjs",
    "scripts/sync-utools-preloads.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260901/codexhost-external-completion",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/requirements/codex-raw-190.md",
    "vibe/specs/requirements/codex-raw-191.md",
    "vibe/specs/requirements/codex-raw-192.md",
    "vibe/specs/requirements/codex-raw-193.md",
    "vibe/specs/requirements/modules/companion-codex.md",
    "vibe/specs/source-anchors/catalog.json",
    "vibe/rules/README.md",
    "src/help/guides/codex.md",
    "vibe/knowledge/error-memory/codexhost-external-threads-invisible-to-official-surfaces.md",
    "preload/codex/codexhost-discovery.cjs",
    "public/codex/codexhost-discovery.cjs",
    "preload/index.js",
    "public/preload.js",
    "scripts/validate-preload-entry-budget.mjs",
    "tests/platform/codexhostDiscovery.test.ts",
    "tests/platform/codexAppServerBridge.test.ts",
    "vibe/specs/requirements/codex-raw-199.md",
    "preload/codex/archive-bridge.cjs",
    "public/codex/archive-bridge.cjs",
    "tests/platform/codexhostArchive.test.ts"
  ]
}
```

## Requirement Delta

- Add: CodexHost 额外进程（`harnessId != codex`）在委派 CLI `thread list` 报告 `status=completed` 时，EyPc 必须离开「进行中」，并按 Host 未读进入「已完成未读」或「已完成」。
- Add: 该 completed 是精确终态（`snapshot-corroborated`），可关闭同 id 残留的 Desktop live active（无 waiting flag）。
- Add: Host `attention=input` 是外置智能体提问/提示的待输入；`attention=approval` 仍是待确认。Desktop follow 不得剥掉这些 Host waiting flag。RAW-191.
- Add: 额外进程 Host `hasUnreadTurn` 在有值时就是真实未读，不再跟 Desktop 未读-true 比对。偏差时以 Codex APP「已读」为准：Desktop unread *event* false，或快捷键/跳转打开 Codex APP。Desktop snapshot false 不是已读。RAW-193.
- Add: 插件重启后必须能从 Host `thread list` 读到已有额外进程，包括已完成/空闲，不得只在新建或变为进行中时才出现。Host 进行中在 Desktop follow 到达前也是进行中。会合点失败不得把空列表缓存成成功快照。RAW-194.
- Add: 额外进程从进行中变为 Host `completed` + unread 时，EyPc 必须离开进行中并进入已完成未读。Desktop follow 残留的 live inProgress 不得压住 Host 已确认终态。RAW-195.
- Add: 额外进程的归档必须真实到达 CodexHost。EyPc 归档桥对 `codexhostExternal` 行改走 Host 委派 CLI：`thread read` 预检（running/creating 保留）、`thread archive` 写入、live/archived `thread list` 双核验；不得再向插件私有的官方 app-server 发这些 id 的 `thread/read` / `thread/archive`。Host 自己向 Desktop 广播 `thread/archived`，EyPc 不补发 Desktop 同步，也不等原生 ACK。RAW-199.
- Clarify: 官方 App Server `notLoaded` 仍不是完成；禁止再把 CLI completed 映射成 `notLoaded`。
- Pending decisions: 无。Host 仍报 `running` 时不得用 Desktop 空闲外观或刷新间隔发明完成。

Acceptance:

1. CLI completed → connector `idle` + latest Turn `completed` + confirmed evidence + `idleConfirmed`。
2. `hasUnreadTurn: true` → 已完成未读；`false` → 已完成已读；字段缺省的新完成 → 已完成未读（不得宣称已读）。
3. Desktop 官方未读原子不得覆盖外部行的 Host 未读。
4. 打开成功仍清未读。
5. Host list 必须保留 `creating | running | completed | failed | interrupted`，不得再折叠成 running/completed。
6. 映射：`creating`/`running` → 进行中；`attention=input` → 待输入；`attention=approval` → 待确认（提问优先）；`interrupted`/`failed` → 待继续；`completed` + Host unread → 已完成未读 / 已完成。
7. Desktop follow 不得剥掉 Host waiting flag，也不得把已确认终态打回进行中。
8. Host 未读有值时直接用；Desktop 未读-true 不得覆盖 Host 已读。Codex APP 已读（unread event false 或跳转 dispatch）可清未读；snapshot false 不是已读。RAW-193.
9. 重启后 Host list 里已有的额外进程必须进库存；进行中以 Host connector 为 live，不等 Desktop follow。官方 follow 不得针对这些 id；Desktop `notLoaded`/idle 不得把 Host running/completed 打成 unknown。官方回答不了的 id 不得以 `verifying` 占位：额外进程 id 的 Goal 证据固定 `none/fresh`，不发 `thread/goal/get`。RAW-194.
10. Host `completed` + unread 必须盖过 Desktop 残留 live inProgress，进入已完成未读。RAW-195.
11. 额外进程归档：预检 Host `thread read`（running/creating 或写入 `THREAD_BUSY` → 保留为 active-task）；写入 `thread archive`；两次核验 live 列表无该 id 且 archived 列表有；Kernel 提交后立刻剔除 Host 花名册中的该行。官方 app-server 不得收到这些 id 的 `thread/read` 或 `thread/archive`。CLI 令牌只经子进程环境，不进参数与诊断。RAW-199.

## Prior Task Overlap

- Relationship: `continuation` of 2026-09-01 CodexHost 外部会话识别（membership + 跳转）。
- Decision: `delta-only`。不重做会合点/CLI 枚举。

## VerificationImpactTrace

- Changed surface: discovery 行/Turn 形状、sanitize 终态标签、Host 未读权威、Codex APP 已读（follow false / 跳转 dispatch）清未读；归档桥 Host lane（read 预检 / archive 写入 / live+archived 列表双核验）。
- Direct consumers: `scanVerifiedCodexInventory` → `companionCodexEvidenceV7` → Kernel groups。
- Focused tests: `tests/platform/codexhostDiscovery.test.ts`、`tests/platform/providerEvidenceAdapterV7.test.ts`、`tests/platform/codexAppServerBridge.test.ts`（额外进程不得官方 follow）、`tests/platform/codexhostArchive.test.ts`（Host lane 归档）。
- Not selected: 仓库级 `pnpm test` / MQTT / 真实 uTools。
- Identity: preload 变更，收尾 `pnpm run build` + `validate-requirements --write-current-truth`。

## Implementation Sync

Desired behavior: Host CLI 负责额外进程 membership、终态分类，以及有值时的未读。Codex APP 已读（Desktop follow false 或跳转打开）可清未读；Desktop 未读-true 不得覆盖 Host 已读。相位仍走既有 Desktop follow 与 Host waiting/终态防护。官方未读原子不得宣称已读。

## Closeout

Focused automated verification in this task; real uTools reload remains user-owned.
