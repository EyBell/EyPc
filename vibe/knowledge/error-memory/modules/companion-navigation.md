# 任务循环与固定入口错误记录

<!-- adaptive-document-index: module-v1 -->

## Scope

上一／下一固定入口、命令选择与合并、导航资格、顺序、来源接入及环内可达性；状态归约仍由 Task State 模块拥有。

## Current Authorities And Routes

- [当前产品需求](../../../specs/PRODUCT_REQUIREMENTS.md#L255)
- [四层循环与保留合同](../../../specs/260915/companion-cycle-priority/spec.md#L1)
- [本次固定入口修复](../../../specs/261026/task-cycle-freeze/task-card.md#L1)
- [架构](../../ARCHITECTURE.md#L1)

## Primary Error Records

- [外层 cycle 串行队列阻断末次合并](../cycle-command-queue-bypasses-coalescing.md#L1)
- [热态循环入口重复强刷库存](../warm-cycle-entry-forces-inventory-refresh.md#L1)
- [来源须接入唯一导航权威](../new-companion-source-must-register-with-navigation-authority.md#L1)
- [环内可达性不能依赖列表显隐](../ring-reachability-outlives-list-visibility.md#L1)
- [停驻项不能继承新项失效条件](../parked-item-inherits-fresh-item-invalidation.md#L1)
- [成员谓词不能在每个消费者重写](../membership-predicate-restated-at-every-consumer.md#L1)

## Related Error Records

- [Renderer interval 延迟误报卡死](../freeze-recorder-renderer-interval-false-stall.md#L1)

## Historical Or Migration Sources

本模块只维护当前路由；历史方案仍保留在原任务，不作为独立的当前循环权威。
