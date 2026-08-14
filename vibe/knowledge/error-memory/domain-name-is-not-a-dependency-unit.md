---
id: eypc-domain-name-is-not-a-dependency-unit
status: verified
scope: project
fingerprint: split-plan-scoped-by-naming-domain__domain-members-share-no-dependency-boundary__scope-by-transitive-closure-with-zero-shared-bindings
first_seen: 2026-08-14
last_verified: 2026-08-14
review_after: 2026-11-14
evidence:
  - preload/index.js
  - vibe/specs/requirements/invariants-raw-169.md
tags:
  - engineering-contracts
  - refactor-safety
---

# 域名不是依赖单位

## Symptom

按命名前缀把一个大文件划成十个「域」，据此排出逐域抽取的顺序，并挑了「体量可观且耦合最低」的那个域先做。实际测量时该域调用 20 个域外函数、触及三个被域外引用数十次的共享缓存——注入它需要的协作者不是边界，是参数表。

同一张表还说另外四个域「零依赖、合计 186 行」。实测这四个域合计 68 函数 / 1,394 行，且没有一个是零依赖。

## Wrong Assumption

以为共享命名前缀的函数构成一个可分离的单位。前缀是**分类**，依赖才是**单位**，两者只在设计良好的代码里重合——而需要拆分的文件恰恰是两者已经分开的那种。

前缀口径还会双向失真：既漏掉以动词开头的同域函数（`installCodexActionRunnerIpc`、`runCodexProjectEnvironmentAction`），也完全看不见函数体内的跨域调用。低估与高估同源。

## Correct Model

以**传递闭包**而非名字划范围，判据三条同时成立：

1. 闭包内的函数彼此互调；
2. 闭包外对它的引用点少（理想是一个入口）；
3. 闭包不触及被域外多处引用的模块级绑定。

调用密度本身也是边界：一个被调用数百次的基元不应迁出到需要防护性加载的模块里，因为那几百个调用点无法降级。

先测再排序。一张没有实测支撑的域表会同时给出错误的优先级和错误的可行性判断，而它读起来和正确的表一模一样。

## Related

- [Prefix-based domain analysis undercounts](prefix-based-domain-analysis-undercounts.md#L1)
- [Impact matrix misses source-text assertions](impact-matrix-misses-source-text-assertions.md#L1)
