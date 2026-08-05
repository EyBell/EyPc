---
id: eypc-companion-external-settings-write-must-fail-closed
status: verified
scope: project
fingerprint: user-owned-config-file-replaced-with-empty-object__unparseable-read-collapses-into-absent__distinguish-absent-from-unreadable-and-refuse-to-write
first_seen: 2026-08-05
last_verified: 2026-08-05
review_after: 2026-11-05
evidence:
  - preload/claude/environment.cjs
  - preload/claude/index.cjs
  - tests/platform/claudeBridgeSafety.test.ts
  - vibe/specs/260805/1150-claude-companion-provider/verify.md
tags:
  - companion-provider
  - external-config
  - data-safety
  - fail-closed
---

# 写入用户自有配置文件前必须区分"文件不存在"与"读不懂"

## 症状

向用户自己的配置文件（本例是 `~/.claude/settings.json`）追加插件条目。文件里若存在任何解析不了的内容（一个手写的尾逗号就够），注册操作返回成功，而文件被替换成只含插件自己条目的对象——用户的 `model`、`env`、`permissions`、`mcpServers` 等全部消失，无提示、无备份。

## 错误假设

假设"读失败"与"文件不存在"可以合并处理，都归一成 `{}` 再走同一条合并写入路径。这在**只读**场景下确实无害，一旦同一个归一结果被喂进**写入**路径，就等于把"我没看懂"当成了"这里本来就是空的"。

## 已验证根因

`readJsonFile` 对 `JSON.parse` 失败与 `ENOENT` 一律返回 `null`，调用方 `readSettings()` 再把 `null` 变成 `{}`。`install()` / `uninstall()` 拿到这个 `{}` 后照常做合并并原子替换，于是整份用户配置被合法地覆盖掉。原有测试只覆盖了"文件不存在"和"格式良好"两种输入，没有任何一条喂入非法 JSON。

## 检测顺序

1. 找出所有会写回外部配置文件的路径，反查它们的读取函数。
2. 检查读取函数是否把"解析失败"与"不存在"合并；只要合并，写入路径就已经不安全。
3. 用一份**故意写坏**的真实配置跑一次写入，断言文件逐字节未变、且返回结构化失败。
4. 检查是否存在备份；无备份时任何替换都是不可逆的。

## 预防规则

任何写回用户自有配置文件的桥接必须区分四态：`absent` / `unreadable` / `unparseable` / `present`。只有 `absent` 与 `present` 允许进入写入路径，其余两态**拒绝写入并返回可读原因**。每次替换前留一份上一代备份。回归用例必须包含"故意写坏的配置"这一条，并正向断言文件内容未变。

## 替代路线

- 状态：`verified`。
- 前置条件：插件需要向用户自有的 JSON 配置追加条目。
- 有序步骤：读取函数返回四态 → 写入路径对后两态早退 → 写前落备份 → 原子替换 → 补"坏文件不被覆盖"回归。
- 验证：`pnpm exec vitest run tests/platform/claudeBridgeSafety.test.ts` 通过，其中包含尾逗号配置与非对象顶层两条。
- 适用边界：所有外部自有配置写入；插件自己数据目录内的文件不受此约束。
- 回退：若无法安全区分，退化为"只读 + 向用户输出需手动粘贴的片段"，不要自动写。

## 记录历史

| 日期 | 任务 | 触发 | 失败路线 | 恢复 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 2026-08-05 | Claude Companion provider 钩子注册 | 对抗式复核以真实坏配置复现 | 解析失败归一为 `{}` 后进入写入路径 | 读取返回四态、写入对不可解析态失败关闭、写前落 `.eypc-bak`、补两条回归 | verified；坏配置逐字节保留 |
