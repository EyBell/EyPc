# 悬浮卡片紧凑化

## 本轮变更

- 四个页签贴上沿，拖拽区和贴边固定按钮并入页签行。缩短搜索框和列表之间的距离。
- 搜索框下方左侧显示首个可见分组，右侧显示分类重置。分组缺失时，重置组件单独靠右。
- 重置提示按账号短码、倒计时和上海时间分行。最后 30 分钟读分钟。Cursor 的月周期和 Bot 分别用 `gk`、`bo`。

## 影响与验收

- 基线 `81bf91b`。[当前产品要求](../../PRODUCT_REQUIREMENTS.md)和[重置提示条款](../../requirements/codex-magpie-reset-hint-raw-001.md)限定本轮展示差异。
- 展开卡继续消费相同的任务分组、计数、搜索结果和额度窗口。保留快捷操作、分组折叠、额度来源选择、身份去重和手动刷新的入口。水球和外观预览继续使用原额度数据。
- 本轮待测试清单：基线构建链、截图同宽下的首卡位置、选中和焦点状态、首组换位及折叠、无分组与无额度、窄窗多来源、拖拽及贴边固定、`30M` 边界及到期、缺时间、悬停与键盘刷新。真实宿主行为由用户手测。

## 构建与待验

- `closeout` 构建通过。工作树的构建输入和产物身份已核对。`V7` / `host-23b4139e435cd9886f47` / `renderer-a65f9bb41f739bf30516`，生成时间 `2026-11-20T06:52:29.476Z`。
- [插件入口](../../../../dist/plugin.json)可用于手测。收起再展开，先按截图同宽检查首张卡片上移是否至少约 `40px`，再检查分组换位、窄窗额度和拖拽。额度提示重点核对账号短码、最后 `30` 分钟和刷新。
- 全局真值回写被基线中[状态同步原始需求](../../261114/codex-state-sync/raw-requirement.md)的既有来源哈希差异挡住。构建与文档校验结果分别记录。

## Worktree

```worktree-task-v1
{
  "schema": "worktree-task/v1",
  "task_id": "261120-eypc-float-card-compact",
  "control_plane": "app-root",
  "target_branch": "main",
  "repositories": [
    {
      "repo_id": "eypc",
      "base_sha": "81bf91bee14992b10e009b8ea0eeacbbd755b3f9",
      "worktree_branch": "codex/261120-eypc-float-card-compact",
      "task_owner": "vibe/specs/261120/eypc-float-card-compact/task-card.md",
      "head": "81bf91bee14992b10e009b8ea0eeacbbd755b3f9",
      "upstream": null
    }
  ],
  "commit_mode": "verified-milestone",
  "push_mode": "current-message-only",
  "verification_state": "planned",
  "push_state": "not-authorized",
  "integration_state": "not-started",
  "next_action": "从工作树插件产物进行视觉和交互手测"
}
```
