# EyPc 本地构建适配器

- adapter_version：1；project_id：eypc；repository_roots：从本文件所属检出根目录解析。
- command_owner：[隔离构建脚本](../../scripts/build-isolated-utools.sh#L1)。每次使用独立临时目录，不改写检出的 `public/` 或 `dist/`。
- state_namespace：每次构建新建 `eypc-utools-build.*` 临时目录，不创建 PID、日志、端口或自启动项。
- secret_boundary：只复制构建所需目录；不读取或输出账户凭据。
- release_provider：unsupported；此适配器不发布远端。

| 操作 | 能力 | 入口与证据 |
| --- | --- | --- |
| status | 不支持宿主状态判断 | 用户可在 uTools 内核对实际加载的版本；文件存在不等于运行。 |
| build | 支持 | 从检出根目录执行 `sh scripts/build-isolated-utools.sh`；以构建和包校验成功及输出的 `ARTIFACT` / `ASAR` 为产物证据。 |
| 本地替换 | 支持，须单次授权 | [替换入口](../../scripts/apply-local-utools.mjs#L1)要求明确提供候选包、已安装包及两者 SHA-256；身份和原生模块一致、旧包无人占用后才备份并原子替换。`--check` 只读，`--apply` 写入；不关闭宿主。 |
| start | 仅 macOS 宿主 | 用户明确要求加载本地插件时，可用 `open -a /Applications/uTools.app` 启动已安装的 uTools；无项目端口。进程与实际插件加载需另行核对，启动命令成功不等于插件可用。 |
| stop / restart / debug | 不支持 | 不终止现有进程或管理端口。 |
| release | 不支持 | 本地产物不构成发布。 |

构建包含当前检出中相关源文件的未提交改动。加载前须区分开发插件目录和已安装包；不覆盖正在运行的 asar，也不把构建成功当作宿主验收。回退需退出宿主后人工核对并恢复输出的备份。
