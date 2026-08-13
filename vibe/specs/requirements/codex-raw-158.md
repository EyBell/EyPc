---
id: eypc-req-codex-raw-158
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-158
status: active
domain: companion-codex
authority: user-stated
source_annotations: "implementation-landed / focused-automated-verified / artifact-ready / installed-host-pending / extends-RAW-157-runtime-log-file-actions"
---

# RAW-158 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户要求日志同时提供当前文件的一键跳转和一键清理。Codex「运行」页与“设置 → 维护 → 安装诊断日志”均提供“打开当前文件 / 打开日志目录 / 清空日志”，统一派发 `runtime.logs.openFile/openDirectory/clear`；尚无当前文件或没有日志文件时，对应原生按钮禁用并说明原因。Host 打开前校验当前路径仍在固定 `eypc-diagnostics` 目录且文件名精确匹配 `runtime-<数字>-<数字>.jsonl`；清理进入现有二次确认，只枚举并逐个删除该模式文件，不递归删除目录，不删除非匹配文件，也不改变开关或等级。清理完成后会话内当前文件、统计与最近事件归零；若日志仍开启，后续事件自然创建新文件。4 个影响文件共 10 项聚焦模块/动作/UI 用例、类型检查、1870-module production/uTools build、runtime validator 和镜像核验均通过；当前构建身份为 `hostAssetId=19c07235e93effb0f11a / rendererAssetId=b5dfe2319649d2b0987c`。真实安装文件跳转、确认清理和清理后续写仍待宿主验收。决策为 `DEC-20260810-02`，来源为本轮明确用户补充。
