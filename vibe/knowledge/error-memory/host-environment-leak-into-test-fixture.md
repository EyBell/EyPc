---
id: eypc-host-environment-leak-into-test-fixture
status: verified
scope: project
fingerprint: probe-reads-ambient-process-env__fixture-inherits-host-PATH-and-flips-assertion__inject-environment-as-a-dependency
first_seen: 2026-08-05
last_verified: 2026-08-05
review_after: 2026-11-05
evidence:
  - preload/claude/environment.cjs
  - tests/platform/claudeBridge.test.ts
  - vibe/specs/260805/1150-claude-companion-provider/verify.md
tags:
  - test-fixture
  - environment-probe
  - dependency-injection
---

# 环境探测读 `process.env` 会让测试结果随宿主变化

## 症状

给 CLI 探测加了 PATH 查找之后，一条断言"空机器上探测不到 CLI"的既有用例开始失败——因为运行测试的机器上恰好装着那个 CLI。同一份代码在不同机器上结论不同。

## 错误假设

假设探测函数注入了 `fs` / `path` / `os` 就算完成了依赖倒置。实际上 `process.env` 是同样的环境输入，漏掉它等于测试仍然耦合宿主。

## 已验证根因

`pathBinaryCandidates` 回退到 `process.env.PATH`。测试构造的临时 home 与注入的 `fs` 都是隔离的，唯独 PATH 来自宿主进程，于是 `installed` 在装了 CLI 的机器上为 `true`。

## 检测顺序

1. 一条断言"某能力不存在"的用例开始随机失败时，先列出该函数读取的**所有**环境输入，而不只是显式参数。
2. 逐个检查是否可注入：`fs`、`path`、`os`、`process.env`、`process.platform`、时钟。
3. 把漏掉的那个注入进来，并补一条"注入了该能力则探测到"的正向用例，防止把探测改成永远为假。

## 预防规则

环境探测函数的**每一个**外部输入都必须可注入，`process.env` 与 `process.platform` 和 `fs` 同等对待；实现里只把它们当作缺省值。任何"某能力不存在"的断言都必须显式注入一个空环境，并配一条对应的"存在则找得到"的正向断言。

## 替代路线

- 状态：`verified`。
- 前置条件：探测函数需要读取环境变量或平台标识。
- 有序步骤：把 env/platform 提升为注入依赖 → 测试注入空环境 → 补正反两条用例。
- 验证：`pnpm exec vitest run tests/platform/claudeBridge.test.ts` 在装有与未装 CLI 的机器上结论一致。
- 适用边界：所有环境/能力探测；真正需要宿主真实环境的验收测试应显式标注为宿主验收。
- 回退：无法注入时把该断言移出自动化套件，转入宿主验收矩阵。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-05 | Claude Companion 环境探测加 PATH 查找 | 云端容器恰好装有 Claude Code CLI | fixture 继承宿主 PATH，`installed` 误判为 true | `env` 提升为注入依赖，测试注入 `{ PATH: '' }`，并补 PATH 命中/未命中两条用例 | verified |
