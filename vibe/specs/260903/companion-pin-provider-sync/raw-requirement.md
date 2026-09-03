# RAW-205：置顶与各 Agent 应用双向同步

Tool: claude · Date: 2026-09-03 · Level: Standard（需求）

spec_id: SPEC-260903-COMPANION-PIN-PROVIDER-SYNC

## 用户原话

> 调研一下以下功能能否执行得通：
> 1. 状态感知：通过 Codex、Codex Host、Cloud Code 或 Cursor 点击置顶时，EYPC 插件能否感知到，并自动置顶？
> 2. 行为触发：通过 EYPC 点击置顶或取消置顶时，能否触发对应对话的置顶或取消置顶行为？
> 如果可行，需要针对各个 Agent 进行接口适配。

（「Cloud Code」按本项目既有记忆指 Claude Code 桌面 App。）

## 核验证据（只读，本机 2026-09-03）

### Codex Desktop 原生线程

1. 置顶是 app-server 内置线程分区：`~/.codex/state_5.sqlite` `thread_sections` 有固定行 `01984de2-8f74-7c91-a3b2-5c5e937cf318 | Pinned`；`threads.thread_section_id` 指向它即置顶，`is_pinned` 列 1765 行全 0 已废。`thread/list` 每行返回 `section: {id, name}`。
2. `~/.codex/.codex-global-state.json` 的 `pinned-thread-ids` 只是兼容镜像：本机 sqlite 有 3 条置顶（含 2 条已归档），镜像只有 1 条。EyPc 此前只读镜像（`preload/codex/native-registry.cjs`），且只到 Projects 页的只读 `pinSource:'native'`，从未进入 V7 Kernel。
3. 写入方法：`thread/section/move { threadId, sectionId | null, beforeThreadId }`（Desktop 渲染层 `setThreadPinned` 走它）与 `thread/metadata/update { threadId, isPinned }`；两版本机二进制（0.152.1 / 0.153.0）都没有任何 section 变更通知；Desktop IPC 套接字词汇只有 `thread-archived/unarchived/read-state-changed/stream-*`，没有 pin 消息。

### CodexHost 额外进程

4. codex-host（`/Users/gdkmjd/work/czz/GitFork/codex-host`，`czz-dev`）拦截 `thread/section/move` 与 `thread/metadata/update`，把额外进程的置顶落到 mapping-store 记录 `pinned`（`~/.codexhost/mapping-store/threads/*.json` 已有 3 条带该字段）；`codexhost thread list` 行此前不含 `pinned`，也没有 `thread pin|unpin` 动词。

### Claude Code App

5. `~/Library/Application Support/Claude/claude-code-sessions/<org>/<user>/local_*.json` 顶层 `isStarred`（本机 3 条 true）与 EyPc 归档写的 `isArchived` 同文件；App 内部把它叫 pinned（`if(e.isStarred(t.sessionId)) return {reason:"pinned"}`）。`code-sessions.cjs` 白名单此前把它丢掉。
6. 星标是服务端同步状态（`starSyncSeen` / `local_star-sync-notice` / 10 分钟 pending 窗），本地改文件不上服务器且会被下一次同步覆盖；唯一写入口是私有渲染进程 IPC `LocalSessions.updateSession`，PRD 明令禁止私有 IPC/AX/LevelDB。Claude Code CLI（`~/.claude`）没有置顶概念。

### Cursor

7. 置顶在 workspace 存储：`User/workspaceStorage/<ws>/state.vscdb` `ItemTable` 键 `cursor/pinnedComposers`（JSON string[]，≤50，有序，可能同时含 background-composer 别名）；本机 49 个 workspace 只有 `empty-window` 一份，3 个 id 全部对应真实 agent 行。EyPc 此前只读 `globalStorage/state.vscdb`。
8. `ItemTable` 是 VS Code StorageService 的内存缓存表，Cursor 运行时的外部写会被下一次 flush 冲掉；Cursor 无 pin 的 CLI/hook。

## 裁决

- 感知四路全部可行；触发只有 Codex 原生线程与 CodexHost 额外进程可行，Claude / Cursor 只能单向读入。
- 可回写的 Provider 是置顶的单一来源：EyPc 写到 Provider 并显示回读值；写失败回退本地置顶。只读 Provider 的置顶只增不减，EyPc 取消只清本地置顶。
- 修订 PRD「本地偏好不回写 Provider / 原生置顶顺序只读」：置顶成为唯一回写 Codex 的本地偏好。
- Desktop 侧栏是否在 EyPc 写入后即时刷新没有静态证据。真机（2026-09-03 用户实测）：不即时刷新，切窗后刷新；成功提示收口为「已置顶并同步到 Codex；侧栏切窗后刷新」。

## 输入规范化边界

Provider 置顶只存布尔、顺序整数与来源枚举；线程记忆新增 `pinned` 布尔。标题、cwd、令牌、会合点不进持久化、诊断或回执。
