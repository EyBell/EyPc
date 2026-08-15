---
id: eypc-behavior-check-cannot-prove-derived-value-unchanged
status: verified
scope: project
fingerprint: extraction-moves-code-deriving-an-identifier__separator-or-constant-altered-while-all-behavior-assertions-still-pass__differential-check-old-vs-new-on-shared-inputs
first_seen: 2026-08-15
last_verified: 2026-08-15
review_after: 2026-11-15
evidence:
  - preload/codex/native-registry.cjs
  - tests/platform/projectIdentity.test.ts
tags:
  - engineering-contracts
  - refactor-safety
---

# 行为核验证明不了派生值没变

## Symptom

抽出一段计算项目 key 的代码，写了 29 项独立核验——拒绝路径、边界、结构断言——**全过**。但 key 的分隔符在搬运中从 `\0` 变成了空格。

所有测试仍然绿：拒绝行为没变，返回结构没变，字段齐全，指纹依旧是一个 64 位十六进制串。**只有那个串的值变了。** 项目 key 决定同一目录是否被识别为同一个项目，这一处差异会把一个项目裂成两行。

## Wrong Assumption

以为「行为核验通过」等价于「零行为差异」。它只覆盖**接受与拒绝的分叉**，不覆盖**接受路径上算出的值**。一个哈希、一个 id、一个指纹、一个缓存键——这些的正确性无法由「它存在且格式对」推出。

同类风险还包括：盐值、分隔符、排序规则、截断长度、大小写归一、编码。它们都不改变控制流，只改变输出。

## Correct Model

**凡是抽出「派生标识符」的代码，必须做差分核验：把原实现逐字复制为对照，同一组输入下逐一比对返回值本身，而不是比对它的形状。**

```js
const cases = [/* 正常、畸形、边界、顺序重排 */]
for (const text of cases) {
  expect(shape(moduleImpl(text))).toBe(shape(originalImpl(text)))
}
```

对照实现在核验后即可丢弃——它是一次性脚手架，不是要长期维护的第二份代码。

配套的两条：

- **不可见字符必须写成源码转义。** 真实 0x00 字节落进源码后运行时等价，但 grep、diff 与编辑器都会把它弄丢或弄坏；`\0`（两字符）才是可审查的写法。
- **单一所有权的断言优于具名文件的断言。** 与其钉住「某文件含该配方」，不如扫描一组文件并要求**恰好一处**匹配——既跟着代码走，又顺带把「只有一份定义」变成门禁。

## Related

- [Domain name is not a dependency unit](domain-name-is-not-a-dependency-unit.md#L1)
- [Test slice anchor collapses instead of failing](test-slice-anchor-collapses-instead-of-failing.md#L1)
