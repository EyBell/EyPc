---
id: eypc-req-task-recovery-visibility-raw-002
qualified_source: SPEC-261106-TASK-STATE-RECOVERY::RAW-002
status: active
domain: companion-codex
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-codex-raw-134
    scope: "动态默认改一周，保留独立可调设置；待继续豁免动态时间窗；搜索范围提示对应当前页"
---

# RAW-002 · 待继续可见性与搜索范围提示

2026-11-06用户依次修正并补充：待继续不受72小时动态窗口限制；动态时间范围继续可配置，默认一周，与总体默认30天放在一起；截图指出现有配置已经可调，实际问题包括搜索框右侧范围和数量提示。

最终行为：保留已有相邻的总体天数与动态小时数两个配置，不实施先前被纠正的统一30天方案。缺失配置/新默认采用168小时，既有保存的72小时不静默覆盖。所有待继续任务豁免动态时间窗，隐藏/插件暂停仍排除，完整库存保留范围不因此无限扩大；循环可达性与动态可见性一致。其他状态沿用既有窗口规则，不因本次修改强改任务状态。

搜索右侧提示按当前页签与搜索结果显示实际范围及条数，不再把总体30天/总库存82条写成动态页17条的范围。时间豁免通过提示说明，不能声称全部动态项都落在时间窗内。行为与验收见[任务账](../261106/task-state-recovery/task-card.md#L1)。
