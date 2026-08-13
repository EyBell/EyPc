---
id: eypc-req-codex-raw-049
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-049
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / escape-refined-by-RAW-051 / quick-jump-refined-by-RAW-052"
scoped_relations:
  - kind: refined-by
    target: eypc-req-codex-raw-051
    scope: "escape"
  - kind: refined-by
    target: eypc-req-codex-raw-052
    scope: "quick-jump"
---

# RAW-049 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

跨 Tab 迁移只复用交互合同，不复制业务内容。Codex 浮窗独立维护输入角色与暂态层；`Ctrl+T` 是可在设置页改键的 Codex profile 命令，按与主窗口相同的 `when`、layer 优先级和冲突可达性解析。Escape 总体恢复顺序与可聚焦层触发点恢复继续有效；RAW-051 进一步把单项层拆为 `详情 → 更多操作 → 关闭`。Quick Jump 的覆盖、裁剪、pointer、视口和命中栈过滤继续有效；RAW-052 改为行标记同步唯一高亮、固定操作按钮标记执行同一受门禁动作，并采用深色/白字普通态与黄色/深字激活态。允许迁移 MQTT 的本地状态机、预览定位/夹紧/内滚、Esc 内向恢复、禁用原因/`aria-live`，以及 Ports/Favorites 的“右键先同步目标再开完整抽屉”；明确拒绝 MQTT payload/提示词/正文预览、草稿历史/自动持久化/静默失败、主窗口 Tooltip/ConfirmLayer、原生 `title` 和主窗口焦点所有权。
