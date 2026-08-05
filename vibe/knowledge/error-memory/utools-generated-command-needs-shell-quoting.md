---
id: eypc-utools-generated-command-needs-shell-quoting
status: verified
scope: project
fingerprint: third-party-host-runs-registered-command-through-shell__utools-userdata-path-contains-space__bare-absolute-path-written-into-config__quote-command-line-and-compare-the-same-string__eypc-claude-hooks-statusline
first_seen: 2026-08-05
last_verified: 2026-08-05
review_after: 2027-02-05
evidence:
  - user-screenshot
  - regression-test
tags:
  - utools
  - claude-companion
  - shell-quoting
  - external-config-write
  - promote-to-codenote
---

# 写进第三方配置的生成命令必须 shell 转义

> **待迁移**：本记录的「uTools 数据目录含空格」这一层属于 uTools 模块可复用项，应迁入
> `CodeNote/DevelopRef/Multi-System-Use/uTools/error-memory/` 并在此留 thin pointer。
> 本会话未挂载 CodeNote 目录，暂以完整记录留在项目内。

## 症状

Claude Code 每次启动都打印：

```
SessionStart:startup hook error
Failed with non-blocking status code: /bin/sh: /Users/<name>/Library/Application: No such file or directory
```

十二个 hook 事件全部失效，任务状态不再实时更新；同一根因让状态栏包装脚本也从不执行，于是**额度缓存文件永远不被写出，额度分区恒为空**。

## 错误假设

`~/.claude/settings.json` 里的 `hooks[*].hooks[*].command` 与 `statusLine.command` 被当成了「文件路径」字段。实际上它们是**命令行**——Claude Code 交给 shell 执行，不是 `exec` 一个 argv。

## 已验证根因

uTools 的 `utools.getPath('userData')` 在 macOS 上是 `~/Library/Application Support/uTools`，**必然含空格**。EyPc 把生成脚本放在该目录下，再把裸绝对路径写进 Claude 的配置；`/bin/sh -c /Users/…/Library/Application Support/…/hook.sh` 在第一个空格处断开，把 `Application` 当成命令名。

反向的坑同样真实、且方向相反：**被链式调用的用户原有状态栏命令必须逐字插值**（见本轮既有约束），因为那是用户写的带参数命令行，加引号会把它整体当成一个可执行文件名。同一个文件里因此并存两条相反的规则——**我们生成的单个路径要变成一个词，用户写的命令行要保持原样**。

## 检测顺序

1. fixture 的临时目录**必须含空格**。用 `mkdtemp` 拿到的干净路径永远测不出这个缺陷——原有 8 个注册相关用例全绿。
2. 断言不能只看 JSON 写对了，要**真的用 `/bin/sh -c <写进配置的那个字符串>` 执行一次**，并检查它产生的副作用（队列有事件、额度缓存存在）。
3. 转义后必须回头检查安装状态比对：注册用的字符串与 `hookInstallState` 比对用的字符串若不是同一份，会永远读回 `outdated`，UI 反复要求用户重新注册。
4. 检查旧版本留下的裸路径条目会不会被误认成「用户自己的状态栏」而被链式调用（自我递归）。

## 预防规则

**向第三方配置写入一个由我们生成的路径时，先确认宿主是 exec 还是 shell；只要经过 shell，就必须按平台转义，并且注册与状态比对共用同一份命令串。** 反之，用户提供的命令行永远逐字保留。任何在 uTools 数据目录下生成可执行文件的功能，都要默认「这个路径含空格」。

## 最新实现

- [scripts.cjs](../../../preload/claude/scripts.cjs#L23)：新增 `settingsCommandLine(path, platform)`——POSIX 单引号转义，Windows 走 cmd.exe 的双引号；与既有 `safeChainedCommand` 的逐字规则并列注释说明方向相反的原因。
- [index.cjs](../../../preload/claude/index.cjs#L58)：`hookCommandLine` / `statuslineCommandLine` 一处生成，`install()` 与 `inspect()` 共用。
- [claudeBridgeSafety.test.ts](../../../tests/platform/claudeBridgeSafety.test.ts#L296)：`Application Support` 目录 fixture、真实 `/bin/sh -c` 执行、旧版裸路径收敛、Windows 引号形态。
- [validate-utools-runtime.mjs](../../../scripts/validate-utools-runtime.mjs#L93)：打包校验增加转义断言。

## 替代路线

- 状态：`verified`（源码级 + 真实 `/bin/sh` 执行）。
- 前置：宿主经 shell 执行注册项。
- 步骤：生成路径 → 平台化转义 → 同一字符串既写入又用于状态比对 → 旧条目按 marker 识别并替换。
- 验证：含空格 fixture 下 `install()` → `/bin/sh -c` 实跑 → 断言队列与额度缓存产出；`inspect()` 回读 `installed`。
- 适用边界：EyPc 写入 Claude `settings.json` 的两项。不扩展到任何其它外部配置写入。
- 回退：转义失败或路径为空时不写入，注册报错而非写出不可执行的条目。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 证据 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-05 | Claude 水球运行期缺陷修复 | 用户截图里的 `SessionStart:startup hook error` | 把生成脚本的裸绝对路径直接写进 `settings.json` | Claude Code 原样报错 + 含空格 fixture 复现 | 平台化转义、注册与比对共用一串、打包校验补断言 | verified（源码）；宿主验收归用户 |
