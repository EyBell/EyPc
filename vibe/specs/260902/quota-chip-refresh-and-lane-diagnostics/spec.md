# Spec：额度读数点击即刷新与 Claude 额度车道诊断

spec_id: `SPEC-260902-QUOTA-CHIP-REFRESH-LANE-DIAGNOSTICS`
Tool: claude
Date: 2026-09-02
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L270)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260902-quota-chip-refresh-and-lane-diagnostics`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260902-quota-chip-refresh-and-lane-diagnostics",
  "group_owner": "vibe/specs/260902/quota-chip-refresh-and-lane-diagnostics/spec.md",
  "documents": [
    "vibe/specs/260902/quota-chip-refresh-and-lane-diagnostics/raw-requirement.md",
    "vibe/specs/260902/quota-chip-refresh-and-lane-diagnostics/spec.md",
    "vibe/specs/260902/quota-chip-refresh-and-lane-diagnostics/changes.md",
    "vibe/specs/requirements/shared-raw-201.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/claude/quota.cjs",
    "preload/claude/index.cjs",
    "public/claude/quota.cjs",
    "public/claude/index.cjs",
    "src/runtime/codexController.ts",
    "src/runtime/appRuntime.ts",
    "src/FloatApp.vue",
    "src/styles/float.css",
    "public/runtime-identity.cjs"
  ],
  "validators": [
    "tests/platform/claudeQuotaFallback.test.ts",
    "tests/runtime/claudeCompanionController.test.ts",
    "scripts/validate-committed-preload-mirrors.mjs",
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260902/quota-chip-refresh-and-lane-diagnostics",
    "vibe/specs/requirements/shared-raw-201.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md"
  ]
}
```

## Requirement Delta

- Added: 展开卡额度行读数块点击（Claude 块含 Enter / Space）即强制刷新 Codex 与 Claude 额度；Claude usage API 手动读取绕过 interval / backoff，但保留 429 Retry-After 与 401/403 凭据锁。
- Added: 每次 Claude 额度读取写一条有界 `quota / claude-quota-read` 诊断（触发原因、三车道年龄、usage API 结果与阻塞原因、计数、主读数来源）。
- Unchanged: 球心读数选择（RAW-184 / RAW-186）、窗口映射与退避序列（RAW-019）、Deep Link 不构成已读（RAW-177#3）。

## Design

- [quota.cjs](../../../../preload/claude/quota.cjs#L372) 记录 `nextAllowedReason`（interval / backoff / retry-after / credential）；`read({ force: true })` 只在前两种阻塞下放行。`diagnostics()` 暴露该原因，[index.cjs](../../../../preload/claude/index.cjs#L337) 透传 `force` 并把有界 `reason / blockedBy` 加进 `quotaAccess` 诊断。
- [codexController.ts](../../../../src/runtime/codexController.ts#L1316) 的 `refreshClaudeQuota(now, trigger)` 统计三条车道的读数年龄与 usage API 结果，结束时经 Renderer 诊断端口写 `quota / claude-quota-read`；`kickClaudeQuota` 由 cold / timer / reset / force / lifecycle-* / manual 触发点带上原因。新公开 `refreshQuota()` 先以 `manual + force` 读 Claude，再 `refresh({ forceQuota })` 读 Codex。
- [appRuntime.ts](../../../../src/runtime/appRuntime.ts#L9712) 注册 `codex.quota.refresh`（risk normal）；[FloatApp.vue](../../../../src/FloatApp.vue#L3387) 的读数块 `click / Enter / Space` 派发该动作，提示末尾追加「点击立即刷新」，[float.css](../../../../src/styles/float.css#L741) 只加指针与按压反馈。

## Verification

- 聚焦：[claudeQuotaFallback.test.ts](../../../../tests/platform/claudeQuotaFallback.test.ts#L1)（四条手动绕过边界）、[claudeCompanionController.test.ts](../../../../tests/runtime/claudeCompanionController.test.ts#L1)（诊断行字段与 manual 触发）。
- 构建：sync:preloads、production build、uTools validator、requirements / source-anchors 校验。
- 真机：未执行。宿主重载后点击额度块并读诊断日志属用户验收。

## Boundaries

- 不新增自动轮询频率，不改「额度刷新（秒）」语义，不写 Codex / Claude 原生状态。
- 诊断只含枚举、年龄与计数；百分比、reset 时刻、身份与凭据不进入日志。
