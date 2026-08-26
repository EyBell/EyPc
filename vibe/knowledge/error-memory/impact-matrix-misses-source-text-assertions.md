---
id: eypc-impact-matrix-misses-source-text-assertions
status: verified
scope: project
fingerprint: impact-selected-matrix-follows-code-dependency__source-text-assertion-on-edited-file-not-selected__grep-tests-for-the-edited-path
first_seen: 2026-08-13
last_verified: 2026-08-26
review_after: 2026-11-13
evidence:
  - tests/platform/favoriteFileBridge.test.ts
  - package.json
tags:
  - engineering-contracts
  - refactor-safety
---

# 影响面矩阵漏掉源文本断言

## Symptom

按影响面选定的定向矩阵全绿，改动照常提交。若干个提交之后跑一次全仓套件，才发现某个用例从第一次改动起就一直红——它断言的正是被改的那个文件的**文本内容**。

本例：`package.json` 的 `verify` 脚本加了一个步骤，而 `favoriteFileBridge.test.ts` 用 `toBe()` 精确钉住该脚本字符串。红了两个提交没人知道。

## Wrong Assumption

以为影响面可以沿**代码依赖**推导：改了哪个模块，就跑依赖它的测试。这对行为测试成立，对源文本断言不成立——断言方与被断言方之间没有 import 关系，任何依赖图都看不见这条边。

配置文件尤其危险：`package.json`、`vite.config.ts`、`scripts/*.mjs` 很少被 import，却常被源文本断言逐字钉住。

## Correct Route

选定矩阵后，对本轮**每一个被编辑的文件路径**在 `tests/` 里做一次字面搜索：

```
grep -rl "package.json" tests/
grep -rl "preload/index.js" tests/
```

命中的文件一律纳入矩阵，无论它是否在依赖图上。这一步很便宜，而它捕获的正是依赖图结构性看不见的那类断言。

改动脚本、配置、构建产物清单或任何会被逐字断言的文件时，这一步是必需的而非可选的。

## Detection Order

1. 全绿的定向矩阵之后若跑了全仓套件并出现意外失败，先看失败用例是否在断言某个文件的文本。
2. 反查该文件是否在本轮被编辑——是则本条成立，与运行时行为无关。
3. 修正断言而非放宽它：源文本断言通常钉的是契约（此例是 verify 流水线的组成），契约变了断言就该同步变。

## Occurrence History

- 2026-08-13：为守住 HEAD 镜像成对性给 `verify` 加入 `validate:mirrors`，`favoriteFileBridge.test.ts` 的精确断言随即失败，跨两个提交未被发现。同一次全仓套件里的另一处失败（MQTT 焦点用例超时）经回退复验确认为既有问题，与本轮无关。
- 2026-08-26：RAW-180（b5cd77b）把 `codex.css` 弹层背景改为不透明，聚焦矩阵只跑三个 UI/domain 文件，漏掉 `designSystemV7.test.ts` 对该文件的源文本断言（`color-mix` 正则）；直至双 worktree 合流后的全仓 `verify` 才暴露（1 failed / 1529 passed），按已落地产品意图更新断言收敛（f67c949）。
