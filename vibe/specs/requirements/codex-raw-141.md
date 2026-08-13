---
id: eypc-req-codex-raw-141
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-141
status: active
domain: companion-codex
authority: user-stated
source_annotations: "automated-verified-host-pending / refines-RAW-093-131-137 / ownerless-pending-input-recovery"
relations:
  - refines-RAW-093-131-137
---

# RAW-141 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户指出当前 Codex 原生已有一个长期 `Needs input` 任务，EyPc 却把它显示为“进行中”，并要求同时复核此前可正常显示的普通待输入与“Plan 已规划未实现”状态。当前真实宿主只读核验确认：该任务的原 Desktop stream owner 已不存在；新 follower 虽可收到 `following=true`，但 Desktop 只有原 owner 能返回当前 `conversationState`，不会向新的 EyPc follower 重放待输入快照；App Server `thread/list` 只给 `notLoaded`，latest Turn 只给 `interrupted`，完整 Turn view 也省略尚未回答的 server request。对应 rollout 尾部仍有未匹配的 `request_user_input` function call，且当前 25 条未归档库存中仅此一条满足该条件，与 Codex 原生 `Needs input` 一一对应。修复后 preload 只对 `interrupted/failed/inProgress` 行、只在 `CODEX_HOME/sessions` 实路径内、只读取最多 4 MiB rollout 尾部并只解析 record type、function name、有限 call ID 与 output/user-message 边界；未匹配的 `request_user_input` 投影为 connector-backed `active + waitingOnUserInput`，回答输出或后续 user message 清除，正文、路径和 raw identity 不进入 Renderer。精确 Desktop snapshot/patch 仍为最强当前态；已观察的普通输入、审批和 Plan 请求在 owner/transport 丢失后以会话期 sticky shadow 保留，普通无等待 active 不保留；新 Desktop snapshot、精确 App Server active/new Turn/completion、库存 Turn/outcome/updated revision 或明确移除会清除旧 sticky 状态。普通 `onPluginOut(false)` 关闭 App Server/公开库存但保留 Desktop observer，显式 feature disable、kill 或进程结束仍完全关闭。公开字段、`task-state-v4`、Renderer 判断与 Codex 原生文件均不变化。当前真实任务已从 `notLoaded + interrupted` 复原为 `active + waitingOnUserInput`，只读预检计为 1 条 active；Bridge/Controller/Domain/Presentation 聚焦回归 `170/170`，当前完整工作树 `pnpm run verify` 通过 `737/737`（`57/57` 文件），从 Git index 导出的独立提交副本通过 `711/711`（`54/54` 文件）、typecheck、production build 与 uTools validation；新构建 uTools 卡片验收保持 host-pending。
