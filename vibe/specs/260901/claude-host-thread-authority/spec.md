# Standard Requirement Spec: Claude 会话中断相位与 Host 线程权威

Tool: claude
Date: 2026-09-01
Status: `agent-initiated / pending-user-confirmation` · implementation-landed / focused-automated-verified / host-pending
Documentation level: `standard requirement`

Raw source: `raw-requirement.md`
Canonical target: `vibe/specs/PRODUCT_REQUIREMENTS.md` Claude Code Companion

> 本任务是**事后补登记**。代码已随 `8bb0e3e` 与 `96cf75a` 落地，本文档补上此前只存在于
> [棘轮注释 (q)](../../../scripts/validate-preload-entry-budget.mjs#L94) 的书面依据。两条条款均为
> `agent-transcribed / proposed`，用户确认前不得当作已接纳的产品语义引用。

## Task Documentation Sync Group

- Group key: `dsg:eypc:260901-claude-host-thread-authority`
- Group owner: this `spec.md`
- Excluded unrelated dirty documents: 无

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260901-claude-host-thread-authority",
  "group_owner": "vibe/specs/260901/claude-host-thread-authority/spec.md",
  "documents": [
    "vibe/specs/260901/claude-host-thread-authority/raw-requirement.md",
    "vibe/specs/260901/claude-host-thread-authority/spec.md",
    "vibe/specs/260901/claude-host-thread-authority/changes.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/specs/requirements/claude-raw-197.md",
    "vibe/specs/requirements/claude-raw-198.md",
    "vibe/specs/requirements/modules/companion-claude.md",
    "vibe/knowledge/technical-details.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/claude/interrupt-probe.cjs",
    "public/claude/interrupt-probe.cjs",
    "preload/claude/index.cjs",
    "public/claude/index.cjs",
    "preload/claude/events.cjs",
    "preload/claude/scripts.cjs",
    "preload/claude/code-sessions.cjs",
    "preload/index.js",
    "public/preload.js",
    "scripts/utools-preload-assets.mjs",
    "scripts/validate-preload-entry-budget.mjs"
  ],
  "validators": [
    "tests/platform/claudeInterruptProbe.test.ts",
    "tests/platform/claudeBridge.test.ts",
    "scripts/validate-requirements.mjs",
    "scripts/validate-committed-preload-mirrors.mjs",
    "scripts/validate-preload-entry-budget.mjs"
  ]
}
```

## Current Requirement

- Add: Claude Code CLI 的 Esc 中断不触发任何 Hook。EyPc 必须从会话转录尾巴识别
  `[Request interrupted by user]`，把处于 `running` / `waiting-input` / `waiting-approval`
  且有 `turnStartedAt` 的会话折成 `stopped`（「待继续」），不等下一次提问。RAW-197.
- Add: 判定只看最后一条 user/assistant 记录。工具结果 user 行不是中断证据；更新的提问或
  assistant 记录覆盖旧中断。探针加载失败或任何文件系统错误退化为纯 Hook 基线，不得抛出。RAW-197.
- Add: 由 CodexHost 拉起的 Claude Code 会话，其身份由 harness 子进程环境的
  `CODEXHOST_THREAD_ID` 建立：Hook 脚本盖章，事件层按 `^[A-Za-z0-9-]{8,64}$` 校验后小写粘性保存，
  跨安静期存活。手工会话永不携带该值。RAW-198.
- Add: Host roster 仍持有该线程时，原生 claude 行退场——状态推送把它登记进 membership 退休，
  元数据 upsert 不得复活；roster 消失后原生行自动回来。RAW-198.
- Clarify: 已登记的 Hook 命令行固定，脚本正文随 companion 演进，因此启动时按当前脚本原地刷新
  已安装的 Hook；不触碰 `~/.claude` 的其它内容，也不安装未经登记的 Hook。
- Pending decisions: 两条条款的 `status` 停在 `proposed`。用户确认转述忠实前不得转 `active`。

## Acceptance

1. Hook 队列在中断前后只有两条 `UserPromptSubmit`、中间无事件时，会话仍进入「待继续」。
2. 转录尾巴最后一条是工具结果 user 行时，会话保持进行中。
3. 探针 `require` 失败时，全部会话相位与纯 Hook 基线逐字一致。
4. 带合法 `CODEXHOST_THREAD_ID` 的会话在 Host roster 内时，`claude:<sessionId>` 不出现在 Kernel 包里。
5. 该会话的元数据 upsert 到达时仍不复活原生行。
6. Host roster 不再持有该线程后，原生行重新出现。
7. 非法或缺失的 `CODEXHOST_THREAD_ID` 一律丢弃，会话按普通原生会话处理。

## Prior Task Overlap

- Relationship: `derived` from [codexhost-external-completion](../codexhost-external-completion/spec.md#L1)（RAW-190～195）。
- Decision: `delta-only`。不重做 Host 枚举、终态映射或未读权威；本任务只补 Claude 侧的相位与身份。

## VerificationImpactTrace

- Changed surface: Claude Hook 事件字段、会话相位折叠、Kernel membership 退休、Hook 脚本正文。
- Direct consumers: `createClaudeBridge` → `applyClaudeStateToCompanionKernel` → Kernel groups。
- Focused tests: `tests/platform/claudeInterruptProbe.test.ts`、`tests/platform/claudeBridge.test.ts`。
- Not selected: 仓库级 `pnpm test` / 真实 uTools / 真实 Esc 中断录制。
- Identity: preload 变更，收尾 `pnpm run build` + `validate-requirements --write-current-truth`。

## Implementation Sync

Desired behavior: Hook 负责能观测到的相位；转录尾巴负责 Hook 观测不到的 Esc 中断；Host roster 负责
「这段对话归谁发言」。三者互不覆盖：探针只在 Hook 判为进行中/待输入/待确认时介入，Host 接管只在
roster 持有该线程时生效，两者都在证据消失后自动退回原状态。

## Closeout

聚焦自动化已通过；真实 Esc 中断与 uTools 重载的人工验收仍属用户。`status` 待用户确认。
