---
id: eypc-req-codex-raw-145
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-145
status: active
domain: companion-codex
authority: user-stated
source_annotations: "focused-automated-verified-host-pending / refines-RAW-093-136-141-142 / persisted-decision-end-to-end-provenance"
relations:
  - refines-RAW-093-136-141-142
---

# RAW-145 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户原文：“你这个状态问题 为什么之前没问题, 现在重复出现错误, 仔细核验, 当前的实际通路, 先在本机当前进行实机调通后再修复问题, 不要引入之前的错误”。用户截图中 Codex 原生任务为 `Needs input`，EyPc 同一任务仍显示“进行中”。当前本机先以只读真实 Codex 数据复现：RAW-141 的 Preload 已从 rollout 恢复一条 `connector + active + waitingOnUserInput`，但实际 [Domain 投影](../../../../src/domain/codex.ts#L1) 得到 `productWaitingInput=0`；旧预检复制了更宽松的“connector waiting 即 active”判断，因此错误报告 `active=1`，没有执行产品真实投影。根因是持久请求的精确来源在 Preload 到 Domain 的公开合同中仍标成普通 `connector`，而 Domain 为防旧 connector hint 误报，只放行 Desktop/App Server live 与 RAW-142 的 Plan-only 兼容分支；owner 存在时请求走 `desktop-live` 所以此前正常，owner 丢失后转入 rollout 回退便再次丢失。修复后 `task-state-v5` 增加匿名 `persisted-decision` authority：仅有界解析确认的未决 `request_user_input` 或精确最新 Turn Plan 可使用；普通 connector active/waiting 继续不扩权。该 authority 跨完整库存与 Activity 重建保留，精确新 Turn/active/completion 先清回普通 connector，若同一 completion 另有精确 Plan item 才重新提升；Desktop/App Server live 仍更强。真实预检现直接转译并调用生产 Domain，首个修复后匿名观测为 `connectorWaitingInput=0 / persistedWaitingInput=1 / productWaitingInput=1`；最终复跑时 Provider 已不再给出该决定，同一路径同步为 `0 / 0 / 0`，证明解除后没有粘住，并始终校验运行 revision 为 v5。聚焦四文件 `192/192`、typecheck、完整 production build、三份 main preload 同哈希与 uTools runtime validation 已通过。当前已安装 uTools ASAR 仍是修复前 preload，必须正常重载后才可做同一卡片界面验收，不将源码实机证据冒充已安装宿主验收。
