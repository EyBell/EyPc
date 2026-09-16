---
id: eypc-req-shared-raw-222
qualified_source: SPEC-260915-COMPANION-CYCLE-PRIORITY::RAW-222
status: active
domain: companion-shared
authority: user-stated
scoped_relations:
  - kind: refines
    target: eypc-req-shared-raw-182
    scope: "通用循环改为进行中、待输入、已完成未读加待继续、已读置顶的最高非空层；撤销各层并集与角标非空即当前可循环的等价关系；冻结次序不冻结资格，隐藏或降级后即时移出"
  - kind: refines
    target: eypc-req-shared-raw-183
    scope: "已完成已读置顶进入通用循环第四层；unknown 仍排除；各状态置顶按本轮互斥优先级，专用入口不变"
  - kind: refines
    target: eypc-req-codex-raw-155
    scope: "通用循环层级按 RAW-222 重排并恢复最高非空层独占，待继续与已完成未读同层；来源中立与层内排序不变"
---

# RAW-222 · companion-shared

[需求来源](../260915/companion-cycle-priority/raw-requirement.md#L1) · [设计与验证](../260915/companion-cycle-priority/spec.md#L1)。

上一／下一每次只遍历最高非空类别：进行中 → 待输入 → 已完成未读＋待继续 → 已完成已读的置顶项。EyPc 隐藏、暂停和不可打开项一律排除；更高层重新出现立即优先，冻结与排队不得保留已失格目标。专用入口和实际列表分组保持原合同。
