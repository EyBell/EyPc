---
id: eypc-prefix-based-domain-analysis-undercounts
status: verified
scope: project
fingerprint: refactor-scoping-by-name-prefix__infix-named-same-domain-functions-invisible__match-the-domain-word-anywhere-and-verify-against-total
first_seen: 2026-08-13
last_verified: 2026-08-13
review_after: 2026-11-13
evidence:
  - preload/index.js
  - vibe/specs/requirements/invariants-raw-169.md
tags:
  - engineering-contracts
  - refactor-safety
---

# 按名称前缀做域划分会系统性漏掉一大半

## Symptom

为拆分一个大文件做域划分，得出「某域 24 个函数 / 441 行」这样具体、可信、可据以决策的数字。用户据此批准了范围。实际重测是 **60 个函数 / 1680 行**——低估近四倍，且漏掉的恰是最大的几个（343 行的 IPC 装配、253 行的执行主流程）。

## Wrong Assumption

以为同一个域的函数会共享同一个名称前缀，于是用 `/^codex/ && /Action/` 圈定范围。这在命名严格前缀化的代码里成立，在真实代码里不成立：同域函数常按动词开头命名——`activateCodexActionRunner`、`createCodexActionRunner`、`installCodexActionRunnerIpc`、`runCodexProjectEnvironmentAction` 全部不以域名开头，因而全部隐形。

危险之处在于**结果看起来是完整的**：24 个函数、441 行、跨域依赖 1，每个数字都精确，没有任何迹象提示它只覆盖了 40%。

## Verified Root Cause

前缀是命名习惯，不是域边界。一个域的成员由它操作的状态与职责决定，与它在名字里的哪个位置出现域名无关。用前缀圈定等于假设了一条从未验证过的命名公约。

同一次修正里还犯了第二个错：改用 `/Action/i` 大小写不敏感匹配后，`Inter**action**` 被当成 Action 域，把 Float 交互函数误并进来。放宽匹配和收紧匹配一样需要验证。

## Correct Route

- 域名在函数名的**任意位置**匹配，而不是只看前缀；同时排除会误命中的子串（此例是 `Interaction`）。
- **对总量做交叉验证**：各域行数之和应接近文件总行数。此例前缀口径下所有 codex 域合计约 6,011 行而文件有 15,046 行，40% 的缺口本应立刻暴露问题——当时没有做这个校验。
- 域划分若要作为决策依据（尤其是给用户批准范围），必须先报出「已覆盖 / 文件总量」的比例，让低估无处藏身。
- 更可靠的边界依据是**状态与调用关系**，不是名称：谁读写同一批模块级状态、谁被谁调用。名称只用于初筛。

## Detection Order

1. 拿到域划分结果后，先算各域之和与文件总量的比值。差距大即划分不完整。
2. 抽查两三个已知属于该域但命名不以域名开头的函数，看是否被收录。
3. 放宽匹配后重新检查是否引入误命中，尤其是包含域名作为子串的其它词。

## Occurrence History

- 2026-08-13：RAW-169 Codex 单体拆分的域划分。用户基于「actions 域 441 行」批准试点范围，实测为 1680 行、占入口 11.2%，且含 343 行 IPC 装配——落在 `EYPC-UTOOLS-HOST-001` 入口冻结管辖的敏感区。范围经重新确认前未动代码。
