# RAW：Claude 桌面端 App 作为第三个证据源/provider

Date: 2026-08-06 · Tool: claude (Cowork) · Level: Controlled

## 用户原话

> 你不能够直接通过我运行的这个 cloud 桌面APP 去更新这个额度，还有这个任务的状态吗？ 这个其实是最好的方式
>
> 我刚才问的那些东西，你再核验一下有没有完成。完成的话，可以进行整个功能；复核没完成，则进行推进。

（cloud = Claude，用户全局术语。）

## 前置核验结论（2026-08-06，Finder 实景 + 本会话自证，详见记忆 claude-desktop-provider-research）

1. 标准版数据根 = `~/Library/Application Support/Claude/local-agent-mode-sessions/<org>/<user>/`。
2. 每会话 = `local_<uuid>.json`（元数据，~121KB，含 cwd/title/lastActivityAt，无状态字段）+ `local_<uuid>/` 目录（`audit.jsonl` 实时追加 + outputs/uploads）。audit.jsonl 标准版存在，3.1MB 分钟级在写。
3. 云端会话仅索引级留痕（`remote-session-spaces.json`：sessionId/spaceId/folders/memoryEnabled，无状态）→ 实时状态只覆盖本机会话。
4. **额度结论（P0-1 采样后修正）**：桌面端无独立额度缓存文件（`cowork-policy-limits-cache.json` 是策略缓存），但 `audit.jsonl` 的 `rate_limit_event` 携带 `resetsAt`（epoch 秒）与限流状态——**无百分比**。百分比维持 statusline + usage API；resetsAt/限流可作 Phase 3 的辅助校准来源（见 [sampling.md](sampling.md#L1)）。

## 需求边界

- 范围 = 任务状态（进行中/待输入/完成未读）+ 打开会话（水球/卡片/循环序全套并入现有 companion 聚合）。
- 不碰额度；不写入桌面端任何文件（纯只读 + fs.watch）；云端会话最多列"存在+归属文件夹"或首版直接不展示（spec 里定）。
- 打开方式：`claude://` 缺按 sessionId 打开 Cowork 会话的深链（只有 `cowork/new`），退路 = Window Jump AX 激活桌面端窗口（缺口跟踪 anthropics/claude-code#50345）。
