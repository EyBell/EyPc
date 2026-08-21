# Mirasim 宿主环境知识

Tool: tool-neutral

本项目的 Agent 会话运行在 Mirasim 桌面版宿主内。本文只记录**宿主侧**的稳定事实与陷阱，不承载 EyPc 产品语义；EyPc 自身架构见 [ARCHITECTURE.md](ARCHITECTURE.md#L1)，实现记忆见 [technical-details.md](technical-details.md#L1)。

结论均为 2026-08-21 在 Mirasim v0.0.213 / macOS 上实测所得。版本升级后需重新核验。

## 1. Worktree 会话的实际效果

Mirasim 的 worktree 位于 `~/.mirasim/worktrees/<workspace>/<branch>/`，在会话中选中它会切换会话工作目录。

- **切目录只认 `set_session_workdir`**。shell 里的 `cd` 不改变会话工作目录，每条命令仍回落到会话根。
- **依赖与产物不随 worktree 复制**。`node_modules/`、`dist/`、`output/` 都在 [.gitignore](../../.gitignore#L1) 内，新 worktree 是空的。因此 `pnpm test` / `typecheck` / `build` / `verify` 及各 `probe:*` 脚本在首次 `pnpm install` 前全部失败；`koffi` 是原生模块，需重新编译。
- **端口互斥**。`pnpm run serve` 使用 `--port 8092 --strictPort`（见 [package.json](../../package.json#L1)），主检出的 dev server 开着时 worktree 起不来。
- **主检出的未提交改动在 worktree 不可见**。worktree 停在自己分支的提交上；若两边同时修改同一批文件，合并必冲突。切入前应先看主检出 `git status`。
- **CodeNote 相对链接会断**。仓库适配器里的 `../../../czz/CzzProj/CodeNote/...` 从 worktree 解析为 `~/.mirasim/czz/CzzProj/CodeNote/...`，不存在。全局 `~/.claude/CLAUDE.md` 用绝对路径，规则内核本身仍能加载。
- **`.git` 是指针文件**，指向主仓库的 `.git/worktrees/<name>`；**stash 栈与主检出共享**，禁止裸 `git stash` / `git stash pop`。

## 2. Web Workbench 占位页：真因与修复

打包版访问 `http://localhost:4970/` 若显示 “The web workbench has not been built yet. Build it with: `npm run build:web`”，**不要照做**——装的是打包 app，`Contents/Resources/` 下没有 `package.json`，本机也无 mirasim 源码。产物其实已随 app 装好。

真因：app 主进程 spawn server 子进程时显式注入

```
MIRASIM_WEB_DIST=/Applications/Mirasim.app/Contents/Resources/web
```

**少了一级 `app`**——真正的 workbench 在 `Resources/web/app/`（`index.html` + `assets/`）。server 的取值是 `webDistDir = env.MIRASIM_WEB_DIST ?? <自动探测>`，显式值直接采用且**不校验 `index.html` 是否存在**，于是本可正确命中 `web/app` 的自动探测没机会跑，静态根指向一个没有 `index.html` 的目录，所有非 `/api` 路径落到硬编码占位页。用 `ps -E -p <server_pid>` 读进程环境即可复现该判断。

- **`launchctl setenv MIRASIM_WEB_DIST` 无效**：会被 app 自己注入的值覆盖。
- **有效修法**（无需重启，立即生效，可秒撤）：在静态根补相对软链把缺的那级补回来。

```bash
W=/Applications/Mirasim.app/Contents/Resources/web
ln -s app/index.html "$W/index.html"; ln -s app/assets "$W/assets"; ln -s app/favicon.svg "$W/favicon.svg"
# 撤销
rm "$W/index.html" "$W/assets" "$W/favicon.svg"
```

- **代价**：修改已签名 bundle 后 `codesign --verify` 变为 `a sealed resource is missing or invalid`；app 自动更新会覆盖 `Resources/`，届时软链消失需重做。

## 3. 访问鉴权模型（安全关键）

来源判定只做一件事：读 **TCP socket 的对端地址**判断是否回环。它**完全不读** `X-Forwarded-For` / `X-Real-IP`。

| 来源 | 判定 | 令牌 |
| --- | --- | --- |
| `localhost` / `127.0.0.1` / `::1` | `local` | 免 |
| 内置 mirachannel 穿透（带 peer-tunnel nonce 头） | `peer-tunnel` | 免（鉴权在隧道层用连接码 + E2E 密钥完成） |
| 局域网 IP、Tailscale IP、自建穿透暴露的域名 | `network` | **必须带** |

令牌可经 `?token=` / `x-mirasim-token` / `Authorization: Bearer` 传入，服务端只有**单一共享令牌**（即配置中的 `mirachannelToken`）；`devices.json` 的按设备配对框架存在但当前无活跃条目。

实测佐证：`127.0.0.1` 伪造 `X-Forwarded-For: 8.8.8.8` 仍 200（只认 socket）；局域网伪造 `X-Forwarded-For: 127.0.0.1` 仍 401（无法提权）。

### 自建内网穿透会使鉴权完全失效

穿透客户端（frp / cloudflared / ngrok / `ssh -R`）跑在本机，是以 `127.0.0.1:4970` 去连服务的，于是服务端看到的对端地址就是回环：

> **穿透把「全世界」洗成了「本机用户」，令牌校验根本不执行。**

后果是任何拿到该 URL 的人权限等同于机器前的本人：可让 agent 执行任意命令、读写全部工作区、消耗模型额度。更糟的是 `/mirachannel/pair` 也是回环门禁（局域网访问返回 403），穿透进来算「本机」会返回 200 并吐出明文令牌——**改成要求令牌也救不回来**。且 Mirasim 启动的 agent 继承已授权的 macOS 屏幕录制 / 辅助功能 / 完全磁盘访问权限。

正确做法：

- **用内置的「互联网穿透」**（系统设置 → 连接设置 → 复制连接码 / 扫二维码）。连接码打包了主机列表与访问令牌，鉴权在隧道层完成，请求带 peer-tunnel nonce 头。
- 若必须自建，底线是**让服务端看到的对端地址不是回环**，令牌门才会启用：Tailscale 私有网络（对端 `100.64.x.x`）、Cloudflare Tunnel + Access、frp + 反代加 Basic Auth / mTLS。
- 裸 `frpc -> 127.0.0.1:4970` 或 `ngrok http 4970`：禁止。

## 4. 操作陷阱

- **重启 Mirasim 会终止其下所有 agent 会话**：Claude 子进程挂在 `server.cjs serve` 那个 pid 下。动手前先 `ps aux | grep local/bin/claude` 确认还有谁在跑；需要重启时用延迟触发的分离脚本，先让当前回复发出。
- **自检脚本不得用「反向特征」判成功**。例如以 “grep 不到占位页文案” 断定修复成功：服务连不上时 `curl` 输出为空，同样不匹配，会把 HTTP `000`（完全失败）误判为成功。应判**正向特征**（如页面含 `<title>Mirasim</title>`）。本轮曾因此上报过一次假阳性结论。
- **BSD `sed` 不支持 `\s`**。用 `\s` 写脱敏正则在 macOS 上静默失效，敏感值会原样输出。`~/.mirasim/setting.json` 明文存放 auth token、refreshToken、device 私钥、mirachannel E2E 密钥与 IM bot token——读取前先确认脱敏手段真的生效。
