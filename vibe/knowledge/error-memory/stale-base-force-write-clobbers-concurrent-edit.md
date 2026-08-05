---
id: eypc-stale-base-force-write-clobbers-concurrent-edit
status: verified
scope: project
fingerprint: read-file-then-edit-elsewhere__another-session-rewrites-it__force-write-restores-stale-base
first_seen: 2026-08-05
last_verified: 2026-08-05
review_after: 2026-11-05
evidence:
  - vibe/specs/260805/2051-float-quota-single-line/verify.md
  - src/domain/companionPresentation.ts
  - tests/domain/companionPresentation.test.ts
tags:
  - concurrent-edit
  - device-bridge
  - force-write
  - untracked-file
---

# `force: true` 回写会用过期基线抹掉别的会话的并发修改

## 症状

对 `src/domain/companionPresentation.ts` 做过的修改在几分钟后凭空消失：文件 mtime 是新的、字节数变了、`grep` 找不到我加的导出，而 `vue-tsc` 报「模块没有导出成员」。
同一时刻另一批 `claude` 相关文件（`src/domain/claude.ts`、`preload/claude/*`、`tests/platform/claude*.ts`）的 mtime 也一起变新了。

## 错误假设

1. 假设「我刚写过这个文件 → 我是它唯一的写者」。
   实际上用户可以同时跑多个 Codex / Claude 会话（这正是 Companion 这个功能存在的原因），它们改的往往就是同一个功能域的同一批文件。
2. 假设 `git status --porcelain | head -N` 能代表全貌。
   未跟踪文件排在 `??` 段的最后，被 `head` 截断后看起来像「这个文件没被改过」，直接把诊断带偏。
3. 假设 `device_commit_files` 的 mtime 保护是主要防线。
   `force: true` 恰好关掉的就是这道防线，而当时的理由是「文件是我自己刚写的」—— 这个理由只证明了**作者**，没有证明**基线新鲜**。

## 已验证根因

工作流是「读设备文件 → 在别处（容器）编辑 → 回写设备」。中间那段时间窗口里，另一个会话重写了同一个文件。
回写时带 `force: true`，于是**几十分钟前的基线**原样盖回去，对方在这段时间里的修改全部丢失。
该文件未纳入 git（`??`），没有历史可以恢复，只能按对方新的实现反推等价内容补齐。

## 检测顺序

1. 回写前先 `find <目录> -newermt "<本会话开始时间>" -type f`，列出这段时间内所有被改过的文件。
2. 把要回写的文件与自己的基线快照做 md5 比对；不一致就是有第三方写入，停下。
3. 查 `git status --porcelain | grep <文件名>`，**不要用 `head`**；确认它是 `M` 还是 `??`——`??` 意味着一旦覆盖就无法恢复。

## 预防规则

- `device_commit_files` 的 `force: true` 只在**同一轮工具调用内**「读→写」时使用；跨越了任何一次长耗时操作（跑测试、跑 build、等用户回答）就必须重新取基线。
- 更好的做法：需要改设备上的大文件时，**在设备上原地做外科式替换**（`python3` 精确串替换 + `assert count == 1`），而不是整文件回写。本次所有 `src/` 改动都是这么做的，只有测试文件走了整文件回写，也只有它出了事。
- 未跟踪文件（`??`）视为无备份资产，覆盖前必须先另存一份副本。

## 替代路线

- 若必须整文件回写：先 `cp <file> _to_delete/<file>.bak-<时间戳>`，再写。
- 若怀疑有并发会话：直接问用户，或按 mtime 判断后只回写自己独占的文件。

## 记录历史

| 日期 | 事件 |
| --- | --- |
| 2026-08-05 | 首次发现并确认根因；丢失 `tests/domain/companionPresentation.test.ts` 中另一会话的修改，已按当时的源码实现补齐等价覆盖 |
