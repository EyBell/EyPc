---
id: eypc-parallel-session-batch-commit-splits-in-flight-work
status: verified
scope: project
fingerprint: parallel-agent-session-batch-commit__canonical-committed-without-its-public-mirror__verify-head-pairs-not-just-worktree
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2026-11-13
evidence:
  - scripts/utools-preload-assets.mjs
  - vibe/rules/README.md
tags:
  - engineering-contracts
  - git
  - preload-mirror
---

# 并行会话的批量提交切断在途改动

## Symptom

准备提交时发现工作树几乎干净，自己改过的文件大多已不在 `git status` 里——它们被**另一个并行会话的批量提交**卷走了。残留的少数文件是提交时刻之后的增量。表面看是好事，实际上提交点落在了另一个会话的改动中途。

本次的具体后果：`preload/companion/task-kernel.cjs` 带着新门禁进了提交，而 `public/companion/task-kernel.cjs` 停在旧实现。**HEAD 因此违反了「canonical 与 public 行为镜像」这条硬约束**，而 uTools 宿主加载的是镜像那一侧——即已提交状态会让宿主跑没有该门禁的代码。工作树自己一直是一致的，所以任何只看工作树的检查都是绿的。

同一次提交还让已提交的 `verify.md` 引用了一份仍未跟踪的草案文件，留下断链。

## Wrong Assumption

以为「工作树干净 = 改动已安全落地」，以及「镜像由 `sync:preloads` 保证，不必单独核验」。两条在单会话下成立，在并行会话下都不成立：sync 保证的是**工作树**一致，提交切分保证不了**HEAD** 一致。

## Verified Root Cause

canonical 与 mirror 是两个文件，它们的一致性由构建步骤维护而不是由版本控制强制。任何按文件挑选的提交——无论是人工 `git add` 还是另一个 Agent 的批量提交——都可能只带走其中一侧。当两个会话同时改同一批文件时，这不是小概率事件。

## Correct Route

- 任何自己没有发起的提交出现在日志里之后，**先核验 HEAD 的 canonical/mirror 成对性**，不要只看工作树：
  `git show HEAD:preload/<p> | diff - <(git show HEAD:public/<p>)`
- 修复走前向补齐（补提交缺失的一侧），不改写共享历史。
- 提交前顺带检查已提交文档引用的文件是否都已跟踪，跨会话切分很容易留下断链。
- 多会话并行时，把镜像成对性纳入提交前清单，与 typecheck、定向回归同级。

## Detection Order

1. `git log` 里出现自己没发起的提交 → 立刻做 HEAD 成对性核验。
2. 工作树干净但自己记得改过很多 → 不是完成，是被卷走，先确认切分位置。
3. 只有确认 HEAD 成对且文档引用可解析，才继续下一段实现。

## Occurrence History

- 2026-08-13：C2 同 revision 平局裁决改到共享因果内核期间，另一会话在 17:56–17:57 批量提交，canonical 入库而 public 镜像未入库。由 `1ee6771` 前向补齐镜像、补上三条未提交回归并跟踪被引用的草案，HEAD 八组镜像恢复一致。
