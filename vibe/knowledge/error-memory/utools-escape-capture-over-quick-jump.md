---
id: eypc-utools-escape-capture-over-quick-jump
status: candidate
scope: project-pointer
fingerprint: utools-esc-exits-plugin__quick-jump-or-transient-layer-open__window-bubble-keydown__missing-capture-preventdefault
first_seen: 2026-07-26
last_verified: 2026-07-27
review_after: 2026-10-26
evidence:
  - vibe/specs/260724/1527-window-jump-workbench/verify.md
tags:
  - utools
  - pointer
---

# uTools Escape Capture（项目指针）

权威正文已迁入 CodeNote：

- [escape-capture.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/escape-capture.md#L1)
- [utools-escape-capture-over-transient-layer.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-escape-capture-over-transient-layer.md#L1)

## EyPc 专属差异

- 瞬时层包含 Quick Jump、右键抽屉与多选；向外退出为 `Shift+Escape` → `app.hide`
- 任务证据：[verify.md](../../specs/260724/1527-window-jump-workbench/verify.md#L1)
- 实现锚点：[App.vue](../../../src/App.vue#L1) · [FloatApp.vue](../../../src/FloatApp.vue#L1) · [keyboardEvent.ts](../../../src/runtime/keyboardEvent.ts#L1)
- 状态仍为 `candidate`，直至用户完成 uTools 宿主验收
