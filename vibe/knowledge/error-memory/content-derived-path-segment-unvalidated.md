---
id: eypc-content-derived-path-segment-unvalidated
status: verified
scope: project-pointer
fingerprint: filename-validated-by-pattern__id-read-from-file-contents__id-joined-as-path-segment__traversal-escapes-data-root__reader-returns-outside-data-to-renderer
first_seen: 2026-08-06
last_verified: 2026-08-07
review_after: 2027-02-07
evidence:
  - preload/claude/code-sessions.cjs
  - tests/platform/claudeBridge.test.ts
tags:
  - utools
  - preload
  - path-traversal
  - pointer
---

# 内容字段作为路径片段未校验（项目指针）

跨项目权威：[CodeNote uTools error memory](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-preload-content-derived-path-segment-unvalidated.md#L1)。

## EyPc 当前差异

- 触发事故的 mixed-desktop reader 已删除；当前 [code-sessions.cjs](../../../preload/claude/code-sessions.cjs#L1) 从受控目录项建立规范 local id，并限制根目录与输出键集。
- [claudeBridge.test.ts](../../../tests/platform/claudeBridge.test.ts#L1) 覆盖非法身份、根边界与字段白名单；失败项不读取根外数据，也不向 Renderer 泄漏内容字段。
- 当前任务路线见 [research](../../specs/260807/claude-code-companion-authority-reset/research.md#L1)。
