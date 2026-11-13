# EyPc 本地构建适配器

- adapter_version：1；project_id：eypc；repository_roots：从本文件所属检出根目录解析。
- command_owner：开发收尾的 `npm run build` 与自动 Hook 由 [Build And Core Version Sync](documentation.md#build-and-core-version-sync-required) 维护；需要额外独立 asar 产物时才使用 [隔离构建脚本](../../scripts/build-isolated-utools.sh#L1)。
- state_namespace：自动 Hook 的摘要和检出级构建锁位于 Git 忽略的 `.codex/build-hook/`，不保存构建原始输出；隔离构建使用 `eypc-utools-build.*` 临时目录。均不创建端口或自启动服务。
- secret_boundary：只复制构建所需目录；不读取或输出账户凭据。
- release_provider：unsupported；此适配器不发布远端。

| 操作 | 能力 | 入口与证据 |
| --- | --- | --- |
| status | 不支持宿主状态判断 | 用户可在 uTools 内核对实际加载的版本；文件存在不等于运行。 |
| build | 支持 | 开发收尾由同步 Hook 从检出根目录执行 `npm run build`，证据为完整链路退出成功及产物身份；不自动生成 asar 或加载。 |
| 隔离构建 | 支持，按明确需要选择 | `sh scripts/build-isolated-utools.sh` 使用临时目录，不改写检出的 `public/` 或 `dist/`；输出 `ARTIFACT` / `ASAR`。不作为自动 Hook 默认入口。 |
| 本地替换 | 支持，须单次授权 | [替换入口](../../scripts/apply-local-utools.mjs#L1)要求明确提供候选包、已安装包及两者 SHA-256；身份和原生模块一致、旧包无人占用后才备份并原子替换。`--check` 只读，`--apply` 写入；不关闭宿主。 |
| start | 仅 macOS 宿主 | 用户明确要求加载本地插件时，可用 `open -a /Applications/uTools.app` 启动已安装的 uTools；无项目端口。进程与实际插件加载需另行核对，启动命令成功不等于插件可用。 |
| stop / restart / debug | 不支持 | 不终止现有进程或管理端口。 |
| release | 不支持 | 本地产物不构成发布。 |

构建包含当前检出中相关源文件的未提交改动。加载前须区分开发插件目录和已安装包；不覆盖正在运行的 asar，也不把构建成功当作宿主验收。回退需退出宿主后人工核对并恢复输出的备份。
