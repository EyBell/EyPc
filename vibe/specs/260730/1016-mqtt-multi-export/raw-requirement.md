# RAW: MQTT 多选快速导出

Tool: codex
Date: 2026-07-30

## Request

MQTT 的功能 tab 增加一个“多选快速导出”功能：可以选择多个通信数据，然后一键导出融合json到剪切板或文件。

## Confirmed Scope

- 复用 MQTT 记录列表已有多选状态。
- 导出当前列表中的已选记录，生成一份无损、可机器读取的融合 JSON。
- 支持复制到剪切板与通过系统保存对话框写入 `.json` 文件。

## Acceptance Intent

- 选中一条或多条 MQTT 记录后，顶部工具栏显示已选数量和两个快速导出动作。
- 导出内容保留 topic、payload 原文、方向、QoS、retain、时间与可选别名/备注；合法 JSON payload 同时输出结构化值。
- 导出不清空当前选择，可连续复制和保存。
- 属于现有 MQTT 功能的行为增量，不新增 Tab、远端写入或存储迁移。
