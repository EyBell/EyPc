---
id: eypc-req-codex-raw-142
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-142
status: active
domain: companion-codex
authority: user-stated
source_annotations: "focused-automated-verified-host-pending / refines-RAW-093-136-138-141 / persisted-plan-wait-and-unread-stabilization"
relations:
  - refines-RAW-093-136-138-141
scoped_relations:
  - kind: superseded-by
    target: eypc-req-shared-raw-160
    scope: "任意新 Turn 清除 Plan"
---

# RAW-142 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户纠正完整门禁过度，要求只验证本次影响项；同时明确“已完成规划但尚未实现”的 Plan 必须展示为待输入，不受已读/未读影响，并指出已完成未读仍会先误判再纠正而闪跳。当前 App Server latest Turn 只给 terminal shape，但 rollout 的 `event_msg.item_completed` 会保留精确 `item.type=Plan`，后续新 Turn 的 `task_started` 是明确解除边界。Preload 现只在 latest Turn 为 completed 时，以 sessions realpath 与渐进 `256 KiB / 1 MiB / 4 MiB` 尾读解析这两个结构事件；命中 Plan 后投影 connector-backed `active + waitingOnUserInput + planImplementationOnly`，Domain 只为该精确持久化 Plan 放开 connector 等待，故即使 unread=true 也不会进入 completed-unread；新 Turn、精确 active 或实现开始会清除。实时 App Server 的精确 Plan `item/completed` 与同 Turn completion 走同一投影，不发布正文。Unread 仲裁在当前原生 unread 文件瞬时不可读时，保留本 Desktop Bridge 最近一次成功解析的成员/非成员，并跨完整库存对象替换使用；精确 event、成功打开与新可解析集合仍可立即覆盖，因此刷新/快捷键路径不会先发布错误 unread=true 再纠正，也没有 Renderer 延迟。只执行影响项验证：Bridge+Domain `114/114`、Controller 两个相关合同、`node --check preload/index.js`、typecheck、main preload 镜像与同步 IPC 静态检查通过；按用户要求未运行完整 `pnpm run verify`、build 或真实 uTools，后者保持 host-pending。
