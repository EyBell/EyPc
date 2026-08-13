---
id: eypc-req-codex-raw-156
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-156
status: superseded
domain: companion-codex
authority: user-stated
source_annotations: "superseded-by-RAW-157 / DEC-20260810-01 / independent-install-runtime-diagnostics-v2 / supersedes-RAW-155-fixed-enum-log-contract"
superseded_by: eypc-req-codex-raw-157
---

# RAW-156 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户明确要求安装后执行流程进入一个固定、易于实机测试和后续读取的独立日志模块；日志可手动开启/关闭，当前默认开启 `info`，提供 `error / info / debug`，问题最终解决后的未来版本再把默认改为 `error`。v2 由唯一 Host sink 记录插件/Renderer 生命周期、全部 Runtime Action、Provider membership/phase/unread 水位与门禁、精确状态裁定、导航、Float 健康、任务打开、两 Provider 归档、在途复用和五秒确认；事件使用 timestamp/seq/sessionId/processId 串联，并可保存精确有界的操作任务/会话/动作 ID、Provider 状态、revision/watermark、缓存、路径、耗时和结果码。设置页显示开关、级别、会话、目录、当前文件、容量和统计，并可打开目录；只读探针按 scope/event/level/session/time/tail 过滤。纯 JSONL 按 8 MB/文件、64 MB 总量、14 天轮转，目录/文件权限继续为 0700/0600。禁止持久化提示词、对话/结果正文、命令/argv/工具参数、stdout/stderr、凭据/令牌、堆栈和隐藏推理；“全量”只指完整运行流程和状态证据，不扩展到这些正文。当前代码、105 项聚焦验证、v2 探针、production/uTools build 与运行时校验均通过，构建身份为 `hostAssetId=dd10510968b88389e1f7 / rendererAssetId=d430d91dd42be9b9f705`；真实安装、三档切换和问题复现仍待宿主验收。权威任务记录见 [v2 task card](../../260810/1155-install-runtime-diagnostics/task-card.md#L1)。
