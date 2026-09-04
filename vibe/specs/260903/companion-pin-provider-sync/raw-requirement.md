# RAW-205：置顶与各 Agent 应用双向同步

Tool: claude · Date: 2026-09-03 · Level: Standard（需求）

spec_id: SPEC-260903-COMPANION-PIN-PROVIDER-SYNC

## 用户原话

> 调研一下以下功能能否执行得通：
> 1. 状态感知：通过 Codex、Codex Host、Cloud Code 或 Cursor 点击置顶时，EYPC 插件能否感知到，并自动置顶？
> 2. 行为触发：通过 EYPC 点击置顶或取消置顶时，能否触发对应对话的置顶或取消置顶行为？
> 如果可行，需要针对各个 Agent 进行接口适配。

（「Cloud Code」按本项目既有记忆指 Claude Code 桌面 App。）

## 用户补充（2026-09-04，claude 会话）

> 针对于置顶状态同步 需要去优化一下当前的这个实现, 我需要的效果如下:
> * 针对于 Codex 或 Codex Host 里的对话 它可以与插件 Codex Host 以及 Codex 进行真正的实时同步 也就是说 在任何一个地方操作了置顶或取消置顶 都可以在插件以及对应的 Codex 上实时同步展示置顶或非置顶状态
> * 针对于 Cloud Code 和 Cursor，当前 PC 插件可以实现的效果如下：
>  1. 本地插件支持置顶和取消置顶。
>  2. 当在 Cloud Code 或 Cursor 软件内操作置顶和取消置顶时，可以实时同步到本插件。
>  3. 本插件不能直接操作软件内的置顶和取消置顶项，因为该操作是无效的，也无法实时同步。
> 具体要求如下：1. 避免代码冗余，尽量封装成接口。2. 部分能力需要根据 Agent 宿主进行判断适配。3. 接口化、统一化，方便后续管理。

同轮裁决（用户选项）：Claude / Cursor 的写出站死代码**删除**；Claude App / Cursor 在应用内已置顶的任务在 EyPc 点图钉时**允许叠加本地置顶**（应用内置顶保留、插件不写）。

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

- 感知四路全部可行。调研当时的写出站：Codex 原生与 CodexHost 有官方/会合点协议；Claude / Cursor 当时只有磁盘覆盖金丝，产品暂不授予 `pin`。
- 2026-09-03 用户授权完整实现后：四路均可回写。
- 2026-09-04 用户收口（Cursor sqlite 写通但侧栏不刷新）：Cloud Code（Claude App）与 Cursor 不再回写；插件自己维护置顶，这两路应用内置顶仍同步进插件。Codex / CodexHost 写出站保留。
- 修订 PRD：置顶回写只保留 Codex 原生与 CodexHost；会话归档仍走既有 Claude `isArchived` / Cursor `composerHeaders` 写。
- 2026-09-04 接口化收口：置顶策略由 `provider-manifest.json` `pin` 块（`inbound / outbound / appLabel / pinNoun`）单点声明，preload 与 renderer 共读；Host Registry 对 `outbound:false` 的 Provider 拒绝 `setPin` 适配器；Claude / Cursor 写出站代码删除。入站实时：Codex Desktop 置顶只改全局状态镜像 `pinned-thread-ids`，插件在已有的未读 watcher 上比较该镜像并强制 tasks-only 成员重扫；CodexHost 监听 `<data dir>/mapping-store/threads/*.json` 变化后失效列表 TTL 并重扫。Codex Desktop 侧栏对 EyPc 写入仍只在重获焦点时重拉（无通知），不可改。
- Desktop 侧栏是否在 EyPc 写入后即时刷新没有静态证据。真机（2026-09-03 用户实测 Codex）：不即时刷新，切窗后刷新；成功提示收口为「已置顶并同步到 {应用}；应用侧栏稍后刷新」。不得把 Cursor sqlite 回读成功说成侧栏已置顶。

## 输入规范化边界

Provider 置顶只存布尔、顺序整数与来源枚举；线程记忆新增 `pinned` 布尔。标题、cwd、令牌、会合点不进持久化、诊断或回执。
