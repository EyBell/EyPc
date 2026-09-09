# RAW-218：自动区分 Codex Host 与原生 Codex，并用官方连接器补原生空 Turn 状态

Tool: cursor · Date: 2026-09-08 · Level: Standard（需求）

spec_id: SPEC-260908-CODEX-NATIVE-HOST-ORIGIN

## 用户原话

> 你要自动去区分code X host里面的任务 还有 Codex 原生的这个任务 我后续大概率会移除 Codex Host 这种形式 但是在 Codex 里面 可以通过 Codex++ 使用额外的模型 去优化当前缺失的实际任务状态 并进行修改

## 规范化需求

1. 悬浮任务行必须自动区分 **Codex Host 额外进程** 与 **Codex 原生任务**。两者仍属同一个 Codex 来源，不得新增第四个 Companion Provider，也不得按 Harness 各建一套 companion。
2. 原生行（含在 Codex 内通过 Codex++ 使用的额外模型）可见标记保持 `CX` /「归属 Codex」。Host 额外进程行可见标记为 `XH` /「归属 Codex Host」。项目行全文与来源底色仍按 Codex。
3. 后续可能移除 Codex Host 形态；本轮不修 Host 会合点 / `codexhost launch` 跳过逻辑，也不把 Host 车道当作原生状态的权威。
4. 原生官方连接器 `status.type === active` 且 `thread/turns/list` 为空时，必须按进行中发布，不得标成无会话丢掉。空闲空页仍按无会话丢弃。不得从空 Turn 发明已完成/未读。
5. Host 额外进程继续走既有合成 Turn，不走第 4 条原生空 Turn 路径。

## 需求变更评审

`scanned_owners`：RAW-217 任务行 `CC`/`CX`/`CS`、RAW-190 Host 额外进程完成/合成 Turn、PRD 来源标记与 Host 段、帮助「虚拟项目与归属」。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| refined | RAW-217 任务行只标 `CX` | Host 额外进程改为 `XH`；原生仍 `CX`；仍是 Codex 来源 |
| refined | RAW-190 官方 turns 答不了 Host | Host 继续合成 Turn；原生空 Turn 改信官方 connector active |
| unchanged | 三个 Provider、不按 Harness 拆 companion | RAW-190 / 既有 Host 合同保留 |
| unchanged | 空闲空 `turns/list` 丢弃 | 既有 idle/bulk 回归保留 |
