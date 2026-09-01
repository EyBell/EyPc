# RAW-197 / RAW-198：Claude Code 会话的中断相位与 Host 线程权威

Tool: claude · Date: 2026-09-01 · Level: Standard（需求）

spec_id: SPEC-260901-CLAUDE-HOST-THREAD-AUTHORITY

## 来源：无用户原话

本任务**没有用户原话**。两条条款都由 Agent 在实现 RAW-190～195 期间自行判定并直接落地，事后补登记。`authority` 因此如实标注 `agent-transcribed`，`status` 保持 `proposed` 直到用户确认转述忠实。

补登记的触发：截至 `f3f9afb`，这两块行为在仓库里唯一的书面依据是
[validate-preload-entry-budget.mjs](../../../scripts/validate-preload-entry-budget.mjs#L94) 的棘轮注释 (q)——一条为了解释行数增长而写的旁注，不是需求，也不在任何登记或任务文档里。

已落地的提交：`8bb0e3e`（转录中断探针）、`96cf75a`（Host 线程接管，与 RAW-194/195 同批）。

## RAW-197：Esc 中断的 CLI 轮次必须离开「进行中」

已观测事实：Claude Code 的 Esc 中断**不触发任何 Hook**。Hook 队列在中断前后只看到
`UserPromptSubmit … (无事件) … UserPromptSubmit`，而转录里落了一条正文为
`[Request interrupted by user]` 的 user 记录。纯 Hook 折叠的相位因此把已中断的轮次一直显示成「进行中」，直到下一次提问才被动纠正。

- 已有 [RAW-174#92](../../requirements/claude-raw-174-clause-092.md#L1) 规定「App 精确 failed/interrupted 仍进入 stopped /「待继续」」，但那条只覆盖 Claude App 通道。CLI 通道的同类终态此前无人负责。
- 本条把该语义补到 CLI 通道：转录尾巴是这类中断唯一的持久证人，读到它即把该会话折成 `stopped`。
- 判定只看最后一条 user/assistant 记录：工具结果行不算中断；任何更新的提问或回复覆盖旧中断。任何文件系统错误退化为「无证据」，不得抛出或改写相位。

## RAW-198：会话绑定 CodexHost 线程后由 Host 单一发言

已观测事实：同一个 Claude Code 会话若由 CodexHost 拉起，会同时被两条 lane 看见——原生 Claude Hook/库存 lane，与 CodexHost 额外进程 lane。两条 lane 各自发布相位，列表里出现同一段对话的两行且状态互相矛盾。

- 已有 [RAW-190](../../requirements/codex-raw-190.md#L1) 规定 Host CLI 是额外进程的终态权威；本条是该权威在 Claude 侧的必然推论，不新增用户可见能力。
- 绑定证据只来自 Host 自己：harness 子进程环境里的 `CODEXHOST_THREAD_ID`，由 Hook 脚本盖章、事件层校验后粘性保存。手工起的会话永远不带该值。
- Host roster 仍持有该线程时，原生 claude 行退场（membership 退休，元数据 upsert 不得复活）；roster 消失后原生行自动回来。
- 本条**改变用户可见结果**：一条本来会出现的原生 Claude 行不再出现。这是它必须有书面依据、不能只活在棘轮注释里的原因。

## 需求变更评审（Requirement Change Review）

`scanned_owners`：[PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L1) Codex/Claude Companion · [RAW-174#89～#94](../../requirements/modules/companion-claude.md#L1) · [RAW-190](../../requirements/codex-raw-190.md#L1) · [codexhost-external-completion/spec.md](../codexhost-external-completion/spec.md#L1)

| 操作 | 条款 | 说明 |
| --- | --- | --- |
| added | RAW-197 CLI Esc 中断进 stopped | RAW-174#92 的 App 通道语义补到 CLI 通道；证据源是转录尾巴而非 Hook |
| added | RAW-198 Host 线程接管原生 claude 行 | RAW-190「Host 是额外进程权威」在 Claude 侧的推论；改变可见行数 |
| unchanged | RAW-174#90 同 Turn 后续事件重开父 Turn | 中断探针只在 Hook 已判 running/waiting-* 且有 `turnStartedAt` 时介入，更新记录仍覆盖旧中断 |
| unchanged | RAW-174#91 App live-append 压过 Hook stopped | 探针不参与 App 通道，不改变该优先级 |

`conflict_candidates`: 无。两条都在既有条款留空的通道上补齐，未取消任何现行语义。

`decision_status`: `agent-initiated`——非用户当轮请求，等待用户确认后才可转 `active`。

## 待用户确认项

- RAW-197 的转述是否忠实：你要的是「Esc 中断后该会话立刻显示待继续」，而不是「等下一次提问再纠正」。
- RAW-198 是否是你要的结果：由 CodexHost 拉起的 Claude Code 会话，在列表里**只**出现一行（Host 那行），原生行不再单独出现。
