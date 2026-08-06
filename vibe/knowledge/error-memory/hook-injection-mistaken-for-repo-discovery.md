---
id: eypc-hook-injection-mistaken-for-repo-discovery
status: verified
scope: project
fingerprint: rules-present-in-context__concluded-chain-healthy__arrival-mechanism-never-checked__hook-injection-is-machine-bound__repo-had-no-claude-entry
first_seen: 2026-08-06
last_verified: 2026-08-06
review_after: 2027-02-06
evidence:
  - CLAUDE.md
  - AGENTS.md
  - vibe/rules/README.md
tags:
  - rules
  - adapters
  - discovery
  - verification-evidence
---

# Hook Injection Mistaken For Repository Discovery

## Symptom

核验「本项目规则是否自动加载」，结论是**全部通过**：规则确实在上下文里，链接 0 broken，
全局 owner 文件 17/17 存在，Skill 符号链接全部有效。据此判定不需要建 `CLAUDE.md`，
并援引 `AGENTS.md` 里「不要再建根目录 CLAUDE.md，会双重注入」的既有说明。

结论是错的。当时 Claude Code 侧**没有任何 repo 自有入口**。

## Wrong Assumption

把「规则出现在上下文里」当成「仓库能自动加载规则」。这两件事不等价——
真正要问的是**它是怎么到达的**。

## Verified Root Cause

规则到达 Claude Code 的唯一通路是全局 `~/.claude/settings.json` 的 SessionStart hook
`cat` 了仓库的 `AGENTS.md`。Claude Code **原生不读 `AGENTS.md`**（只读 `./CLAUDE.md`）。
因此该通路是**机器绑定**的：

1. 换一台机器 → 规则全部消失；
2. 同事 clone 本仓库 → 规则全部消失；
3. 停用/改动那个 hook → 规则全部消失。

消失时不会报错，agent 只是在**没有硬门禁**的情况下继续工作——包括进程 kill、文件删除、
DB 写入、publish/deploy、凭据这几条。而 `AGENTS.md` 里那句「不要建 CLAUDE.md」
正在主动维持这个缺口。

## Detection Order

判定任何一层规则「已加载」前，先按到达来源分类，只有前两类算数：

| 到达来源 | 耐久 | 判定 |
| --- | --- | --- |
| 工具原生读取的自有入口文件 | 是 | pass |
| 自有入口内的 `@import` | 是 | pass |
| 全局 hook 注入 | 否（机器绑定） | gap |
| 本轮自己手动打开的文件 | 否 | 根本不算 discovery |

自检句式：**把 hook 停掉、重新 clone 一份，这条规则还在吗？**

## Prevention Rule

**没有抱怨不等于加载成功；要验机制，不要验氛围。**

每个实际使用的工具都需要一个**仓库自有入口**：Claude Code 读 `./CLAUDE.md`，
Codex 读 `./AGENTS.md`，Cursor 读 `.cursor/rules/*.mdc`。hook 可以保留作冗余，
但不能作为唯一通路。

多入口时采用**一个 canonical + 其余薄镜像**，并在文件内部自述来源，
避免 N 份平行副本各自漂移（本次 `AGENTS.md` 为 canonical，`CLAUDE.md` 为镜像）。

适配器只做**路由**，不复述 CodeNote master，也不复述项目自己 `vibe/rules/` 里已有 owner
的事实——重复即漂移源。只写指路，加上不可推断的事实（生成物目录、刻意不存在的目录）。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：上一轮判定链路健康，`audit-project-rule-adapters` 的到达来源矩阵证伪；补建 repo 自有 `CLAUDE.md`，`AGENTS.md` 标为 canonical、`CLAUDE.md` 标为镜像，并撤掉其中重复 `vibe/rules/README.md` 已有权威的段落 |
