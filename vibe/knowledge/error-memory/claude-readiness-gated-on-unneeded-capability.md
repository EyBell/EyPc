---
id: eypc-claude-readiness-gated-on-unneeded-capability
status: verified
scope: project
fingerprint: provider-lane-reports-empty__cli-binary-not-discoverable-under-gui-path__readiness-conflated-open-capability-with-data-readability__split-capability-and-widen-version-manager-roots__eypc-utools-claude-provider
first_seen: 2026-08-05
last_verified: 2026-08-06
review_after: 2027-02-06
recurred: 2026-08-06
evidence:
  - user-host-observation
  - user-screenshot
  - regression-test
tags:
  - claude-companion
  - utools
  - nvm
  - fnm
  - gui-path
  - readiness
  - capability-gating
---

# Claude 通道被「不需要的能力」判死

## 症状

用户已在设置页开启 `接入 Claude Code`，浮窗里 **任务卡片与额度双双完全不显示**——不是停滞、不是过期，是一条都没有。设置页状态行写着「未检测到 Claude Code CLI」，而用户终端里 `claude` 正常运行、`~/.claude/projects` 下有当天的转录。

## 错误假设

把「能不能找到 `claude` 可执行文件」当成了「能不能读 Claude 状态」。`claudeReadinessReason` 的第一条判断就是 `if (!environment.installed) return 'not-installed'`，`refreshClaude` 随即清空 sessions、把额度打成 stale 直接返回。

## 已验证根因

两层，缺一不成灾：

1. **能力被错误合并**。任务卡片来自 `~/.claude/projects/*/*.jsonl` 转录，额度来自状态栏脚本写出的缓存文件——**两者都不需要那个二进制**。二进制只有一个用途：从卡片 `claude --resume` 跳回会话。把整条读取链挂在它身上，等于让一个可选能力否决全部数据。
2. **发现范围看不到 Node 版本管理器**。候选根只有 `PATH` / `~/.claude/local` / `~/.local/bin` / `/opt/homebrew/bin` / `/usr/local/bin` / `/usr/bin` / `~/.bun/bin` / `~/.volta/bin`。用 nvm 装的 Claude Code 在 `~/.nvm/versions/node/<ver>/bin/claude`，一个都不命中；而 uTools 从 Dock 启动，`process.env.PATH` 是 GUI 的裸 PATH，永远不含用户 shell 导出的 nvm 路径，所以 PATH 那条路同时也是断的。

这与 [codex-gui-nvm-launcher-path.md](codex-gui-nvm-launcher-path.md#L1) 同宗但边界不同：那条讲「找到了 wrapper 但找不到它的 Node 运行时」，这条讲「压根没去看版本管理器目录，且找不到根本不该停止读数据」。

## 检测顺序

1. 先问「这个能力的缺失，会让哪些**数据**读不出来」。读不出来的才进 readiness；只影响某个动作的进 capability。
2. 用空 `PATH` + 只有 `~/.claude` 的 fixture 跑一次环境探针，断言 `homeReady/authenticated` 为真而 `installed` 为假时，快照与额度仍然产出。
3. 复现发现失败：`env: { PATH: '' }`，二进制只放在 `~/.nvm/versions/node/<ver>/bin/`。
4. 检查用户可见文案是否把「少一个跳转能力」说成了「未检测到」。

## 预防规则

**Provider readiness 描述的是「状态能不能读」，不是「所有能力是否齐备」。** 任何只服务于单个动作的依赖（可执行文件、终端、窗口 API）必须落在独立的 capability 判定里，缺失时只降级那个动作，并在文案里明说其余读数正常。GUI 宿主里的可执行文件发现必须显式枚举 Node 版本管理器的 per-version `bin` 目录，绝不能指望继承 shell PATH。

## 最新实现

- [claude.ts](../../../src/domain/claude.ts#L543)：`claudeReadinessReason` 只在**数据目录也不存在**时才判 `not-installed`；新增 `canOpenClaudeTask()` 单独承载二进制门禁。
- [companionPresentation.ts](../../../src/domain/companionPresentation.ts#L161)：`claudeSetupHint` 把缺二进制排到最后，并明说「状态与额度正常，但无法从卡片打开会话」。
- [environment.cjs](../../../preload/claude/environment.cjs#L16)：新增 `versionManagerBinRoots()`，覆盖 nvm / fnm（三种布局）/ asdf / nodenv / n，按版本号降序；另补 npm-global、pnpm、yarn、asdf shims 与 Windows `%APPDATA%\npm`；`manualPath` 支持按调用覆盖。
- [claudeCliDiscovery.test.ts](../../../tests/platform/claudeCliDiscovery.test.ts#L1)：空 PATH 下的各版本管理器命中、版本号数值序、缺二进制仍可读三类断言。

## 替代路线

- 状态：`verified`（源码级）。
- 前置：`~/.claude/projects` 可读。
- 步骤：readiness 只看数据可读性 → 二进制发现失败时保留 `installed: false` 并继续读 → 打开动作由 opener 自行报 `unavailable`。
- 验证：`claudeCliDiscovery.test.ts` + `claude.test.ts` + `companionPresentation.test.ts` 聚焦套件；typecheck 与 build 通过。
- 适用边界：EyPc 的 Claude provider。不授权执行任意路径、不授权 shell 执行、不读取凭证。
- 回退：仍找不到二进制时，卡片打开报「未找到 Claude Code CLI」，状态与额度不受影响。

## 2026-08-06 复发：同一个门，新的被害者

桌面端 provider 接入时，`refreshClaude` 里写着：

```ts
if (!isClaudeAvailable(claudeEnvironment)) {
  claudeSessions = []
  claudeDesktopSessions = []   // ← 桌面端跟着一起清空
```

`isClaudeAvailable` 描述的仍然是 **CLI**：它的二进制、它的 `~/.claude` 家目录、它的登录态。
桌面端会话在 `~/Library/Application Support/Claude/` 下，三者一个都不需要。
于是「只装了 Claude 桌面 App、从没装过 Claude Code」的用户开启开关后一张卡都没有。

上一轮的预防规则写的是"拆分 capability"，做到了 `canOpenClaudeTask`；但**新增数据源时没有
重新问那句话**——「这个能力的缺失，会让哪些数据读不出来」。答案是：让 CLI 转录读不出来，
和桌面端毫无关系。

一个刺眼的旁证：`companionPresentation.test.ts` 里有一条断言
`claudeSourceStatusText({ enabled: true, environment: emptyClaudeEnvironment(), desktopSessionCount: 2 })`
→ `'未检测到 Claude Code · 桌面端 2 个会话'`。**controller 永远产不出这个状态**（环境空 →
桌面数组被清空 → count 恒 0）。测试描述了正确行为，实现做不到，没人对账。

**加强后的规则**：每接入一个新数据源，必须重新走一遍 readiness 判定，逐条确认"这个门禁描述的
能力，是这个新数据源需要的吗"。readiness 是**每个数据源各自**的属性，不是 provider 级别的。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-05 | Claude 水球运行期缺陷修复 | 用户报告开启后卡片与额度全空 | 用二进制发现结果作为整条通道的 readiness | 用户终端 `type -a claude` 落在 nvm 路径 + 空 PATH 复现 | 拆分 capability、扩大发现根、改文案 | verified（源码）；宿主验收归用户 |
| 2026-08-06 | Claude 桌面端 provider P5 对抗复核 | 复核发现桌面 lane 被 CLI readiness 连坐 | 新数据源沿用了旧的 provider 级 readiness 门 | 源码 + 一条自相矛盾的既有呈现层测试 | CLI 读取包进 `cliReadable` 分支，桌面 lane 只受 provider 开关约束；补「只装桌面端也能看到卡」回归 | verified（源码）；宿主验收归用户 |
