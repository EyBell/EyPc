---
id: eypc-test-slice-anchor-collapses-instead-of-failing
status: verified
scope: project
fingerprint: source-text-assertion-slices-a-region-by-indexOf__anchor-identifier-moves-out-and-indexOf-returns-negative-one__assert-the-anchor-resolved-before-slicing
first_seen: 2026-08-14
last_verified: 2026-08-14
review_after: 2026-11-14
evidence:
  - tests/platform/codexActionRunnerBridge.test.ts
  - preload/codex/action-authorization.cjs
tags:
  - engineering-contracts
  - refactor-safety
---

# 切片锚点失配时静默塌陷而非报错

## Symptom

一次抽取之后，同一个测试文件里**八条**断言同时红，每条的 diff 都指向与该断言毫无关系的源文本。看起来像是抽取破坏了八个不同的契约。

实际只有一处坏了：用例用 `source.indexOf(锚点)` 划出「宿主 Action 监管区」再做断言，而那个锚点常量本轮随模块迁走了。

## Wrong Assumption

以为 `indexOf` 找不到会让用例失败。它不会——返回 `-1`，`String.prototype.slice(-1, N)` 读作「从末尾第一个字符开始」，于是被断言的整片区域**塌成一个字符**。用例照跑，只是对着空气断言。

失败数量与真实缺陷数量脱钩，是这类塌陷的特征：错误信号被放大成八份互相矛盾的噪声，掩盖了「锚点没了」这一条真正的事实。

## Correct Model

**取材失败必须先于断言失败。** 任何按文本位置划定断言范围的用例，都要先确认边界解析成功：

```js
const region = (marker) => {
  const at = source.indexOf(marker)
  if (at < 0) throw new Error(`supervisor anchor not found in preload/index.js: ${marker}`)
  return at
}
```

锚点移位应该响一次并直接说出移位的是哪个名字，而不是错八次让人逐条排查。

选锚点时优先挑**语义上属于该区域**的标识符（此处是 `CODEX_ACTION_HOST_RUNTIME_REVISION`，运行时契约版本号），而不是恰好排在开头的一个实现细节常量——后者迟早会被抽走。

## Related

- [Impact matrix misses source-text assertions](impact-matrix-misses-source-text-assertions.md#L1)
- [Detection recorded without any repair path](detection-recorded-without-any-repair-path.md#L1)
