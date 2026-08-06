---
id: eypc-new-preload-module-missing-from-packaging-manifest
status: verified
scope: project
fingerprint: preload-module-added__packaging-manifest-not-updated__dist-require-module-not-found__validator-catches-at-dist-require
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - scripts/utools-preload-assets.mjs
  - scripts/validate-utools-runtime.mjs
  - vibe/specs/260806/1130-claude-desktop-provider/verify.md
tags:
  - packaging
  - preload
  - facade-port
  - iron-rule-14-adjacent
---

# New Preload Module Missing From Packaging Manifest

## Symptom

新增 `preload/claude/desktop.cjs` 并在 `claude/index.cjs` 里 require 后，vitest / typecheck 全绿，但 `validate-utools-runtime.mjs` 在 dist require 阶段崩：`Cannot find module './desktop.cjs'`。

## Wrong Assumption

以为 prepare 脚本按目录整体拷贝 preload/，新文件会自动进 dist 与 public 镜像。

## Verified Root Cause

preload 模块走**显式清单**：`scripts/utools-preload-assets.mjs` 的 `UTOOLS_PRELOAD_MODULE_GROUPS`。prepare（→dist）与 sync（→public 镜像）都吃这份清单；清单没加，源码里的 require 就指向一个不被打包的文件——生产里是死端口，和铁律 14 的 facade 漏端口同类，只是断在更早的 require 层。

## Detection Order

1. `node scripts/validate-utools-runtime.mjs`——dist require 崩 `MODULE_NOT_FOUND` 即是此病。
2. 查 `utools-preload-assets.mjs` 清单是否含新文件。
3. 修完清单后必须重跑 prepare + validate **并且** `node scripts/sync-utools-preloads.mjs` 同步 public 镜像（`diff -q preload/claude/X public/claude/X` 应无差异）。

## Prevention Rule

新增任何 `preload/**/*.cjs`：同一提交里必改 `utools-preload-assets.mjs` 清单 + 跑 sync 镜像 + validate。收尾三件缺一不可。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：desktop.cjs 接入时验证器当场拦截，修清单+同步镜像后通过 |
