---
id: eypc-req-windows-raw-208
qualified_source: SPEC-260904-WINDOW-UNIQUE-APP-REBIND::RAW-208
status: active
domain: window-jump
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / host-verified"
scoped_relations:
  - kind: refined-by
    target: eypc-req-windows-raw-213
    scope: "进 Tab / 重启 / 重新接入在本进程尚无会话清单时自动 list 一次并跑唯一换绑；同会话再进不重复全扫；无后台 poller"
---

# RAW-208 · window-jump

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260904/window-unique-app-rebind/raw-requirement.md#L1)。

同应用持久实例记录唯一、当前清单实时根唯一、旧 locator 已空或定点探测不是 `live`（`verified-gone` 或 `indeterminate`）时，原地替换 `lastInstanceId`；标题/相似度/多窗口/`live` 旧实例仍禁止自动换绑。「进 Tab 不自动 list」已由 [RAW-213](windows-raw-213.md#L1) 收窄为同会话再进不重复全扫。
