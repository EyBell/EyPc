---
id: eypc-utools-macos-native-addon-host-signature-mismatch
status: verified
scope: project-pointer
fingerprint: utools-macos-hardened-runtime__plugin-bundled-native-addon-loads-in-node-but-dlopen-is-rejected-in-host__use-compatible-host-signed-addon-or-fail-closed
first_seen: 2026-08-07
last_verified: 2026-08-07
review_after: 2027-02-07
evidence:
  - vibe/specs/260807/claude-code-companion-authority-reset/verify.md
tags:
  - utools
  - macos
  - native-addon
  - pointer
---

# uTools macOS Native Addon 宿主签名不一致（项目指针）

跨项目权威：[CodeNote uTools error memory](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-macos-native-addon-host-signature-mismatch.md#L1)。

## EyPc 当前差异

- [unread.cjs](../../../preload/claude/unread.cjs#L1) 解析 uTools 自身 `app.asar/node_modules/leveldown`，只读 `0700` 临时快照；缺失/不兼容返回 unknown。
- [prepare-utools-runtime.mjs](../../../scripts/prepare-utools-runtime.mjs#L1) 删除旧 prototype native 包，[validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L1) 拒绝插件重新打包 `leveldown`。
- 最终收口复跑中本机实际 uTools 宿主 30/30 次读取通过，P95 `29.17ms`，临时目录泄漏 `0`；任务证据见 [verify](../../specs/260807/claude-code-companion-authority-reset/verify.md#L1)。
