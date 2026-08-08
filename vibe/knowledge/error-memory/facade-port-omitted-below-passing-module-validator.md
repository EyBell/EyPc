---
id: eypc-facade-port-omitted-below-passing-module-validator
status: verified
scope: project-pointer
fingerprint: bridge-module-exports-port__packaging-manifest-ok__module-level-validator-green__preload-facade-omits-port__controller-feature-detect-false__feature-silently-absent-on-host
first_seen: 2026-08-06
last_verified: 2026-08-07
review_after: 2027-02-07
evidence:
  - preload/index.js
  - scripts/validate-utools-runtime.mjs
tags:
  - utools
  - preload
  - facade-port
  - pointer
---

# Facade 漏端口使已加载模块静默不可用（项目指针）

跨项目权威：[CodeNote guarded preload record](../../../../../../czz/CzzProj/CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/utools-guarded-preload-module-silent-unavailable.md#L1)。

## EyPc 当前差异

- 旧 desktop facade 已删除；当前 [preload/index.js](../../../preload/index.js#L1) 显式转发 Code inventory、native unread、event、quota 与 open 端口。
- [validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L1) 同时验证子模块已加载、公开端口/facade 对齐与不可用降级，因此模块级绿灯不能再掩盖 Renderer 端口缺失。
- 当前打包与 facade 结果见 [verify](../../specs/260807/claude-code-companion-authority-reset/verify.md#L1)。
