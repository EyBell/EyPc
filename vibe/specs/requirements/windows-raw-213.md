---
id: eypc-req-windows-raw-213
qualified_source: SPEC-260905-WINDOW-TAB-AUTO-REFRESH::RAW-213
status: active
domain: window-jump
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / host-reload-pending"
scoped_relations:
  - kind: refines
    target: eypc-req-windows-raw-208
    scope: "进 Tab / 重启 / 重新接入在本进程尚无会话清单时自动 list 一次并跑唯一换绑；同会话再进不重复全扫；无后台 poller"
---

# RAW-213 · window-jump

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260905/window-tab-auto-refresh/raw-requirement.md#L1)。

窗口跳转 Tab 在重新启动、重新接入或关闭后再进入时自动加载列表，不必先点刷新。
