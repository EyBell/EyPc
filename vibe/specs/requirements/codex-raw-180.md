---
id: eypc-req-codex-raw-180
qualified_source: SPEC-260825-CODEX-CONFIG-SILENT-INTEGRATION::RAW-180
status: active
domain: companion-codex
authority: user-stated
source_annotations: "user-screenshot + silent-reread + opaque-tooltip"
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-087
    scope: "运行区主诊断标题与详情常显并换行；例行刷新保持上次稳定连接文案；说明性 i 提示改为不透明顶层气泡。五 Tab 与快捷键不回读仍有效"
  - kind: refines
    target: eypc-req-codex-raw-133
    scope: "live region 只在 warning/error 时宣告，例行刷新不朗读"
  - kind: superseded-by
    target: eypc-req-codex-raw-196
    scope: "ready/checking 主诊断详情常显与十格卡片常显；警告/失败分项、静默刷新与不透明 i 仍有效"
---

# RAW-180 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260825/codex-config-silent-integration/raw-requirement.md#L1)。

已有成功快照后，Codex 配置页的自动额度/环境重读必须静默：顶部连接药丸和运行诊断保持上次稳定文案，忙碌只表现在药丸/重新检测控件。运行区诊断改为叠层换行，标题与详情常显。主窗提示层不透明；与格子重叠时优先完整提示。
