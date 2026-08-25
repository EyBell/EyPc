---
id: eypc-module-loader-lands-inside-a-block-scope
status: verified
scope: project
fingerprint: preload-loader-inserted-by-line-offset__let-binding-trapped-in-an-if-block__static-checks-and-full-build-both-pass
first_seen: 2026-08-25
last_verified: 2026-08-25
review_after: 2026-11-25
evidence:
  - preload/index.js
  - tests/platform/codexAppServerBridge.test.ts
  - vibe/specs/requirements/invariants-raw-169.md
tags:
  - engineering-contracts
  - refactor-safety
  - verification-selection
---

# 抽取模块时装载块掉进块级作用域，静态检查与全量构建都发现不了

## Symptom

把 `archive-bridge.cjs` 抽出后，`node --check preload/index.js` 通过、`pnpm run typecheck` 通过、`vite build` 通过、`validate:utools` 与 preload 镜像校验全部通过。只有 vm 沙箱测试报 `ReferenceError: codexArchiveBridge is not defined`，位置在文件末尾的 `window.eypcPlatform.codex.archiveThread` 箭头函数里。

## Wrong Assumption

以为「顶层 `let` 声明写在文件里就一定是脚本作用域」。实际是按行号偏移插入装载块时差了一行，整块落进了它下面那个 `if (companionTaskKernel?.onPackage) {` 的花括号内，成为块级绑定——块外的任何引用都看不到它。

三个静态门禁全部无效：语法合法所以 `node --check` 过；`preload/` 不进 TypeScript 项目所以 typecheck 不覆盖；Vite 只打包 Renderer、preload 是原样拷贝所以构建不求值。真正执行这个文件的只有 vm 沙箱测试。

## Correct Route

1. 按行号偏移插入代码后，**用 vm 沙箱实际求值一次并探测绑定可见性**，不要只看 `node --check`：
   `vm.runInNewContext(src + '\nglobalThis.__p = typeof <binding>;', sandbox)`，得到 `'undefined'` 即为不可见。
2. 一次性探测**全部**模块句柄而不只是新加的那个——同一次插入可能影响多个。
3. `diff -U0` 的 `@@ -N,C @@` 中 `C=0` 表示「在第 N 行**之前**插入」；把它改写成纯插入时若用 `lines[N:N] = add`，实际插到了第 N 行**之后**，正好差一行。改写插入锚点时必须回读插入点前后各一行确认。

## Boundary

只覆盖 `preload/` 下由入口 `require` 装载的模块句柄。`src/` 侧同类问题会被 typecheck 直接拦下，不适用本条。
