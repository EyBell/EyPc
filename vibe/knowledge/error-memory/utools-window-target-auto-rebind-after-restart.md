---
id: eypc-utools-window-target-auto-rebind-after-restart
status: archived
scope: project
fingerprint: persisted-window-slot-native-ref-expires-after-restart__title-similarity-auto-rebinds-wrong-sibling
first_seen: 2026-07-29
last_verified: 2026-07-30
review_after: superseded by WJ-19 explicit instance rebind
evidence:
  - src/domain/windows.ts
  - src/domain/state.ts
  - src/runtime/appRuntime.ts
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - windows
  - persistence
  - rebind
---

# Automatic Restart Rebinding (Historical; Superseded by WJ-19)

## Historical Failure

WJ-17 曾尝试用应用、标题历史、相似度和领先分数，在进程/窗口实例更换后自动恢复一个逻辑槽位。浏览器和 IDE 的多个相似兄弟窗口证明该推断不能安全代表用户意图；标题变化也不等于窗口身份变化。

## Current Prevention Rule

`WindowTarget` 是插件逻辑目标，`lastInstanceId` 只代表一次 OS 窗口生命周期。实例失效后，完整清单可以展示所有同平台/同应用根候选，但不得自动选择，即使只有一个候选。只有用户明确确认且原生根激活成功，才能原子更新实例/native/application/title 元数据。部分清单保留旧绑定且不能证明关闭；标题只供辨认，不参与匹配。

- 状态：`archived / superseded-by-WJ-19`
- 当前适用范围：持久真实主窗口根；WJ-21 会话子窗不参与换绑。
- 回流门禁：不得恢复标题历史、相似度、唯一候选捷径或任意同应用兄弟替换。
- 验收：关闭并重建一个槽位根，确认唯一候选仍需人工确认、`Escape` 回原根、原生失败不提交换绑。
