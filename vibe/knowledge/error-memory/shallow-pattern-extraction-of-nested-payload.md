---
id: eypc-shallow-pattern-extraction-of-nested-payload
status: verified
scope: project
fingerprint: text-pattern-extracts-nested-json__greedy-or-brace-counting-regex-truncates-or-picks-wrong-occurrence__parse-structurally-or-narrow-the-field-set
first_seen: 2026-08-05
last_verified: 2026-08-05
review_after: 2026-11-05
evidence:
  - preload/claude/scripts.cjs
  - tests/platform/claudeBridgeSafety.test.ts
  - vibe/specs/260805/1150-claude-companion-provider/verify.md
tags:
  - companion-provider
  - shell-bridge
  - json-extraction
  - test-fixture
  - privacy
---

# 用文本模式从嵌套 JSON 里取值必然在真实载荷上出错

## 症状

生成的 shell 桥用 `sed` 从 stdin 的 JSON 里取值。两处都在真实载荷上失效，而单元测试全绿：

- 提取 `rate_limits` 的模式 `\({[^}]*}[^}]*}\)` 只能吃两层右花括号。真实载荷有两个窗口对象，捕获恰好少一个 `}`，写出的缓存永远是非法 JSON，下游永远读不到额度。
- 提取 `cwd` 的 `s/.*"cwd"...` 是贪婪的，匹配**最后一次**出现，于是拿到的是 `tool_input.cwd`（工具参数里的路径）而不是会话自己的工作目录，并被写进持久化队列与界面。

## 错误假设

假设"字段名唯一且值不嵌套"。实际上 JSON 载荷里同名键可以出现在任意嵌套层级，而对象值的括号深度不定——正则天然表达不了配平。测试用的是**简化的单窗口载荷**和**没有嵌套同名键的载荷**，恰好绕开了两个缺陷。

## 检测顺序

1. 先问"这个键会不会在嵌套结构里再次出现"，再问"这个值是不是对象"。任一为是，文本模式即不适用。
2. 用**真实形状**的载荷（多窗口、带 `tool_input`）实际跑一次生成的脚本，而不是喂简化 fixture。
3. 断言下游解析结果，而不是断言中间字符串匹配上了。
4. 对隐私敏感字段额外正向断言"输出中不含某个只应出现在嵌套结构里的值"。

## 预防规则

shell 层从 JSON 取值只允许两种做法：对**对象值**用括号配平扫描（`awk` 计数即可，无需依赖 `jq`），对**标量值**只取第一次出现并对取到的值做白名单校验。更优先的做法是**根本不取**——如果同一事实在另一个不会混淆的来源里已经存在（本例中转录文件权威地提供了 cwd 与父会话），就不要从可能含工具参数的载荷里再取一次。回归用例必须以真实形状载荷实际执行生成的脚本。

## 替代路线

- 状态：`verified`。
- 前置条件：需要在 shell 脚本里从 JSON 载荷取值。
- 有序步骤：判断键是否可能嵌套复现 → 能不取就不取 → 对象值用 awk 配平 → 标量值取首次出现并校验 → 用真实载荷跑脚本断言下游解析结果。
- 验证：`pnpm exec vitest run tests/platform/claudeBridgeSafety.test.ts` 通过，其中双窗口额度与嵌套 `tool_input.cwd` 两条以 `/bin/sh` 实际执行。
- 适用边界：生成式 shell 桥；宿主内已有 JSON 运行时时应直接结构化解析。
- 回退：无法可靠提取时宁可不写该字段，让下游按缺失处理。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-05 | Claude Companion 状态栏与钩子脚本 | 对抗式复核实际运行生成脚本 | 花括号正则截断双窗口载荷；贪婪匹配取到 `tool_input.cwd` | 额度改 awk 配平提取；hook 不再读取 cwd/父会话，只取会话 id 与事件名并做标识符白名单校验 | verified；隐私与额度两条均以真实载荷复现 |
