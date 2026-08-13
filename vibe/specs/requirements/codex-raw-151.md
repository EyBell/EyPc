---
id: eypc-req-codex-raw-151
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-151
status: active
domain: companion-codex
authority: user-stated
source_annotations: "host-exposed-defect-superseded-by-RAW-153 / refines-RAW-135-141-145-147 / bidirectional-waiting-edge-hot-path"
relations:
  - refines-RAW-135-141-145-147
scoped_relations:
  - kind: superseded-by
    target: eypc-req-codex-raw-153
    scope: "host-exposed-defect"
---

# RAW-151 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户再次确认 Codex“进行中 → 待输入”和“待输入 → 进行中”均明显缓慢，并明确该状态通路不受用户完整校对频率限制。`taskRefreshSeconds` 只控制完整库存校对；即使为 `0` 或 `86400`，只要 Codex 功能与任务收件箱启用，待输入热通路在其它 Tab、悬浮窗隐藏期间仍常驻，且不新增用户可调热频率。Desktop/App Server request 新增、移除/resolved 和精确 active/new Turn 事件都进入一个 waiting-edge reducer；revision 缺口、owner 切换或载荷不完整时只对该任务按 `0/50/150/300/600/1000ms` 有界重订，截止 1.25 秒，证据到达即取消，不转为全库存高频扫描。Ownerless 普通输入/Plan 复用有界 rollout 解析和会话期文件监听；matching output、用户继续或新 `task_started` 解除等待，掉文件通知时 Controller 每 1 秒调用 `readActivitySnapshot({phaseOnly:true})` 只复核已登记候选，不读取 unread、quota、inventory 或 latest-Turn 全量。正常事件从接纳到 Controller 最终任务包发布 P95 必须不高于 250ms；漏 Activity callback 或 rollout watcher 时须在 1.25 秒内恢复。读取失败、旧 Bridge 或缺少明确新证据时保留当前保守状态并发布匿名诊断，不按超时猜解除、不形成紧密重试。该条把合同升级到 v7；真实 v7 宿主随后暴露 current-owner active-vs-active 缺少因果解除屏障，其热通路/时延合同继续有效，仲裁缺陷由 RAW-153 v8 取代。
