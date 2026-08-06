# RAW：Claude 任务一律在桌面端 App 打开，不走 CLI

Date: 2026-08-06 · Tool: claude (Cowork) · Level: Standard（一个 owner）

## 用户原话

> 你核验一下，你是如何跳转 Cloud 相关任务的。我不希望通过 CLI 形式打开，而是希望打开桌面端 APP 里面对应的任务。

追问后拍板（AskUserQuestion，2026-08-06）：

> 只需要已打开的桌面端进行打开指定任务，而不需要 CLI 兜底。

## 改动前的实际路线（核验结论）

`openClaudeTask()`（[codexController.ts](../../../src/runtime/codexController.ts#L1)）按会话族分流到 [open.cjs](../../../preload/claude/open.cjs#L1)：

| 会话族 | 路线 | 问题 |
| --- | --- | --- |
| CLI（`~/.claude`，裸 uuid） | AX 聚焦承载 `claude` 进程的终端窗口 → 兜底 `osascript` 起 Terminal 跑 `claude --resume <id>` | 正是用户不要的 CLI 形式 |
| 桌面端（`local_<uuid>`） | 只把 Claude.app 前置，消息里让用户自己在 App 里点 | 打不到具体任务 |

## 推翻的既有结论

1130 全程记载「桌面端没有按 sessionId 打开的深链，`claude://` 只有 `cowork/new`」（[raw](../1130-claude-desktop-provider/raw-requirement.md#L1)、[spec](../1130-claude-desktop-provider/spec.md#L1)、[偏好回执](../1130-claude-desktop-provider/design-preference-receipt.md#L1)、[open.cjs](../../../preload/claude/open.cjs#L1) 注释、[codex.md](../../../src/help/guides/codex.md#L1)）。该结论来自当时的外部说法，从未核对过安装包本身。

本轮反编译本机 `/Applications/Claude.app`（**1.25927.0**）的 `app.asar`，`claudeURLHandler` 的 host 分支里有 `resume`：

```js
case Ya.Resume: {                                  // host === 'resume'
  let e = l.searchParams.get(`session`)            // 严格 UUID 正则
  return e && b.test(e)
    ? (LocalSessionManager.importCliSession(e)
        .then(n => navigate(`/epitaxy/${n}`)), true)
    : false
}
```

`importCliSession(uuid)` 的第一步：

```js
let t = `local_${uuid}`
if (this.sessions.get(t)) { this.unarchiveSession(t); return t }   // 已存在→纯跳转
```

由此 **`claude://resume?session=<uuid>` 同时覆盖两族**：桌面端 id 去掉 `local_` 前缀即命中「已存在」分支；CLI id 直接就是它要的 uuid。

另一条 `claude://code/<id>` 用不上：校验是 `/^(cse|session)_/`（服务端会话 id），且被 feature flag 挡着。

## 首次导入的副作用（已向用户明示后拍板）

CLI 会话**首次**被导入时，桌面端 App 会：

1. `stripThinkingBlocksFromFile()` **就地改写** `~/.claude/projects/**/<uuid>.jsonl`；
2. 把该会话 cwd 加入信任目录；
3. 探测并可能接管其 git worktree。

写入方是桌面端 App，EyPc 自身仍然只读；每条会话只发生一次。已存在的桌面端会话走「已存在」分支，三条都不触发。

## 范围

`preload/claude/open.cjs` 打开路线重写 + facade 参数收敛 + controller 去分支 + 平台类型 + 桥/controller 测试 + 帮助文档。不动只读读取、状态机、注册写入、额度。
