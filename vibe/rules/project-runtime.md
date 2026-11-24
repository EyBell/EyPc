# EyPc 本地运行适配器

- adapter_version：1；project_id：eypc；repository_roots：从本文件所属检出根目录解析。
- command_owner：开发收尾的 `npm run build` 与自动 Hook 由 [Build And Core Version Sync](documentation.md#build-and-core-version-sync-required) 维护；需要额外独立 asar 产物时才使用 [隔离构建脚本](../../scripts/build-isolated-utools.sh#L1)。
- state_namespace：自动 Hook 的摘要和检出级构建锁位于 Git 忽略的 `.codex/build-hook/`，不保存构建原始输出；隔离构建使用 `eypc-utools-build.*` 临时目录。均不创建端口或自启动服务。
- secret_boundary：只复制构建所需目录；不读取或输出账户凭据。
- release_provider：unsupported；此适配器不发布远端。

| 操作 | 能力 | 入口与证据 |
| --- | --- | --- |
| status | 不支持宿主状态判断 | 用户可在 uTools 内核对实际加载的版本；文件存在不等于运行。 |
| build | 支持 | 开发收尾走上方构建主本的前置 `closeout` 与同步 Stop，按同一检查器回执核对构建及产物身份。 |
| 隔离构建 | 支持，按明确需要选择 | `sh scripts/build-isolated-utools.sh` 使用临时目录，不改写检出的 `public/` 或 `dist/`；输出 `ARTIFACT` / `ASAR`。不作为自动 Hook 默认入口。 |
| 本地替换 | 支持，须单次授权 | [替换入口](../../scripts/apply-local-utools.mjs#L1)要求明确提供候选包、已安装包及两者 SHA-256；身份和原生模块一致、旧包无人占用后才备份并原子替换。`--check` 只读，`--apply` 写入；不关闭宿主。 |
| start | 仅 macOS 宿主 | 用户明确要求加载本地插件时，可用 `open -a /Applications/uTools.app` 启动已安装的 uTools；无项目端口。进程与实际插件加载需另行核对，启动命令成功不等于插件可用。 |
| stop / restart / debug | 不支持 | 不终止现有进程或管理端口。 |
| release | 不支持 | 本地产物不构成发布。 |

构建包含当前检出中相关源文件的未提交改动。加载前须区分开发插件目录和已安装包；不覆盖正在运行的 asar，也不把构建成功当作宿主验收。回退需退出宿主后人工核对并恢复输出的备份。

<a id="companion-task-count-acceptance"></a>

## Companion 任务数与展示验收

2026-11-24 用户选定的 F1。核对 EyPc 当前任务数、角标、分组或图钉时，直接读现有任务包及其展示回执。

1. 在当前 EyPc 检出根目录运行 `node scripts/read-eypc-task-state.mjs`。脚本支持 `--summary` 时可用它直接读取 `rootCount`、`badgeCounts` 和 `groupCounts`。逐条核对用完整输出，跟踪发包和后续回执用 `--watch` 只读监听已运行的宿主。[脚本入口](../../scripts/read-eypc-task-state.mjs#L1)
2. 按 `hostGeneration`、`packageRevision` 和 Main、Float 各自当前的 `windowGeneration` 配对包与回执。从 `consumerReceipts` 或监听的 `receipt` 事件取实际值。匿名 `taskRef` 只在同一宿主代次内配对。[回执出口](../../preload/companion/task-state-bridge.cjs#L1)
3. Main 用可见 `presentation` 回执的实际 `counts` 核对同包 `views.counts` 的 `active`、`input`、`unread`。展开 Float 用可见 `row` 回执按 `taskRef` 核对 `views.groups`、任务相位和图钉来源。有置顶计数字段时分别报原生置顶、本地置顶和置顶组，可从摘要的 `pinCounts.native`、`pinCounts.local` 和 `pinCounts.group` 读取。同一任务可以同时计入原生置顶和本地置顶。
4. 仅收包或应用、隐藏、折叠、视口外、回执缺失或字段不全时，记录实际阶段，展示标为待核验。首包未完整或相关数据仍在核验中时，保留该状态。真实零值须有完整包和相应字段支持。宿主或窗口换代后重新配对。匹配的可见回执与包内值不一致时，记录包号、窗代和对应字段或匿名任务引用。
5. 任务数和展示验收只采用脚本及同包回执。截图、无障碍树、人工数行均不作为取数或通过依据。若发现差异，沿原专题处理，F1 本身只核验现有展示。[同包实测凭证](../specs/261114/codex-state-sync/status-read-investigation-261116.md#script-display-f1-261124)

Codex、Orca、Cursor 和 Claude Code 的原生状态按[项目状态对账入口](local-context.md#project-skills)逐来源核验。2026-11-16 的开发收尾 F1 走[构建主本](documentation.md#build-and-core-version-sync-required)。
