---
id: eypc-req-claude-raw-029
qualified_source: SPEC-260807-CLAUDE-CODE-COMPANION-AUTHORITY-RESET::RAW-029
status: active
domain: companion-claude
authority: user-stated
---

# RAW-029 · companion-claude

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260807/claude-code-companion-authority-reset/raw-requirement.md#L1)。

Claude D′ 成功提示必须明确分离两项事实：EyPc 归档已完成且任务已从 EyPc 列表移除；Claude 原生侧栏当前尚未确认同步、可能仍待刷新。继续核验真正的原生侧栏及时收敛，但只有受支持的原生动作入口、同一会话原生 ACK 与运行中侧栏在 1.25 秒内移除同时成立才可接纳；元数据/LevelDB 写入、私有 IPC、AX/JXA/UI 自动化、重启或事后视觉结果均不得冒充原生收敛。
