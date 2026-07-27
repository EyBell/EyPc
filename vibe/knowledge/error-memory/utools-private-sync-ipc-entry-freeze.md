---
id: eypc-utools-private-sync-ipc-entry-freeze
status: verified
scope: project-pointer
fingerprint: utools-main-window-stays-loading__renderer-calls-private-sendSync-getAllFeatureHotKey__remove-hotkey-readback-and-keep-redirect-only
first_seen: 2026-07-24
last_verified: 2026-07-27
review_after: 2027-01-24
evidence:
  - user-confirmed
  - vibe/specs/260718/1148-codex-quota-float/verify.md
tags:
  - utools
  - pointer
---

# uTools 私有同步 IPC 入口冻结（项目指针）

权威正文已迁入 CodeNote：

- [host-hotkey-redirect.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/host-hotkey-redirect.md#L1)
- [utools-private-sync-ipc-entry-freeze.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-private-sync-ipc-entry-freeze.md#L1)

## EyPc 专属差异

- 本地共识 ID：`EYPC-UTOOLS-HOST-001`（见 [vibe/rules/README.md](../../rules/README.md#L1)）
- 任务证据：[verify.md](../../specs/260718/1148-codex-quota-float/verify.md#L1)
- 实现锚点：[preload/index.js](../../../preload/index.js#L1) · [public/preload.js](../../../public/preload.js#L1)
