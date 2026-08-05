---
id: eypc-utools-guarded-preload-module-silent-unavailable
status: verified
scope: project-pointer
fingerprint: guarded-require-subsystem-reports-unavailable__catch-swallows-missing-identifier-or-unmapped-sandbox-module__assert-loaded-positively-in-packaging-validation
first_seen: 2026-08-05
last_verified: 2026-08-05
review_after: 2026-11-05
evidence:
  - vibe/specs/260805/1150-claude-companion-provider/verify.md
tags:
  - utools
  - pointer
---

# 守卫式加载的 preload 子系统静默降级（项目指针）

权威正文在 CodeNote：

- [utools-guarded-preload-module-silent-unavailable.md](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-guarded-preload-module-silent-unavailable.md#L1)

## EyPc 专属差异

- 首次触发：新增 `preload/claude/` 模块组时，`execFileSync` 未在 [preload/index.js](../../../preload/index.js#L1) 顶层导入，且 [scripts/validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L1) 的 vm 沙箱未映射 `./claude/index.cjs`。
- 现行防线：模块组清单集中在 [scripts/utools-preload-assets.mjs](../../../scripts/utools-preload-assets.mjs#L1)；打包校验对 `windows` 与 `claude` 两个子系统都有正向 `diagnostics().loaded` 断言与降级断言。
- 任务证据：[verify.md](../../specs/260805/1150-claude-companion-provider/verify.md#L1)
