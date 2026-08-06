---
id: eypc-content-derived-path-segment-unvalidated
status: verified
scope: project
route_pending: codenote-utools
fingerprint: filename-validated-by-pattern__id-read-from-file-contents__id-joined-as-path-segment__traversal-escapes-data-root__reader-returns-outside-data-to-renderer
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - preload/claude/desktop.cjs
  - tests/platform/claudeDesktopBridge.test.ts
tags:
  - preload
  - path-traversal
  - untrusted-input
  - read-only-contract
---

# Content-Derived Path Segment Used Without Validation

> **路由待办**：preload/文件系统边界类，属 uTools 可复用；本次会话未挂载 CodeNote，
> 迁移后本文件降级为 pointer。

## Symptom

`preload/claude/desktop.cjs` 只读读取器可以被诱导 stat 并摘要 Claude 数据根**之外**的文件，
并把结果（字节数、mtime、事件类型、时间戳）交给渲染层；该 id 还会成为 `companionTaskKey`
与 `actionAlias`。

## Wrong Assumption

以为"文件名已经过 `METADATA_PATTERN` 正则校验"就等于"这个会话是可信的"，于是文件**内容**里的
`sessionId` 可以直接当路径片段拼接。

## Verified Root Cause

两个不同的东西被当成了一个：

- `METADATA_PATTERN` 校验的是**文件名**（`local_<hex...>.json`）。
- 拼路径用的是**文件内容**里的 `parsed.sessionId`，只做了 `textOf().trim()` 和非空判断。

`{"sessionId":"../../../x"}` 于是逃出数据根。只读契约还在（没有写），但"只读**根目录内**"
这条实际边界破了。

## Detection Order

1. 任何 `path.join(root, X, ...)`：问 X 从哪来。来自**文件内容 / 网络 / 用户输入**即为不可信。
2. 校验的是文件名还是内容字段？两者不能互相担保。
3. 构造 `../`、绝对路径、尾空格、`a/../../b` 四类输入，断言全部被拒。

## Prevention Rule

**形状白名单 + 容纳性二次校验，两道都要。**

1. 内容来的 id 必须过与文件名同等严格的形状正则（本仓 `SESSION_ID_PATTERN`）。
2. `path.join` 之后再断言结果仍以 `baseDir + path.sep` 开头——正则将来被放宽时这道还在。

只读断言（validator 里的写调用黑名单）**不覆盖本病**：读到根目录外也是读。两类检查各管各的。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：P5 对抗复核发现，补形状正则 + 容纳性断言 + 四类恶意输入回归 |
