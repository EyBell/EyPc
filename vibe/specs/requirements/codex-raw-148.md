---
id: eypc-req-codex-raw-148
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-148
status: active
domain: companion-codex
authority: user-stated
source_annotations: "focused-automated-verified / refines-RAW-133-and-RAW-022 / codex-recognition-single-owner-and-dedup"
relations:
  - refines-RAW-133-and-RAW-022
---

# RAW-148 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

本轮规范化增量要求复核 Codex 功能 Tab 的运行环境识别与 Codex/Claude 来源识别，优先抽取重复策略并同步最新文档，不改变状态、额度、启动或 Bridge 语义。运行页原先同时维护环境横幅、诊断表、启动帮助和两份相同的兼容宿主等待谓词；现由纯 Domain [codexEnvironmentPresentation.ts](../../../../src/domain/codexEnvironmentPresentation.ts#L1) 一次生成，Page 只渲染。任务/项目归属继续按 RAW-022 在单来源/多来源都显示；`resolveCompanionRowMarker` 移除已失效的 enablement 参数，任务与项目 marker 都在 Float 构造行时只解析一次并复用于可见文本、来源色与 ARIA。Host 的启动路径保存/清除已经返回最新环境快照，Controller 统一发布该结果且不再紧接一次完整环境扫描。冲突核验确认项目规则与 PRD 仍残留“Codex-only 全文逐字一致/单来源隐藏标记”的旧口径；按 RAW-022 将兼容范围收窄到数据、状态、额度、空态和角标语义，归属标记明确为有意例外，并更新既有 supersession 错误记忆而不新建重复记录。聚焦 Domain/Controller/UI 四文件 `188/188` 与当前整树 typecheck 通过；未触碰 Preload、Bridge、产物或真实 Codex/uTools，因此未扩大到 build、镜像与宿主验收。
