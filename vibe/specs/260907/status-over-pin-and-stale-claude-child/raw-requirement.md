# RAW-215 / RAW-216：状态分组压过置顶泊位；精确 Claude 拓扑撤回残留活子代理

Tool: cursor · Date: 2026-09-07 · Level: Standard（需求）

spec_id: SPEC-260907-STATUS-OVER-PIN-AND-STALE-CLAUDE-CHILD

## 用户原话

> F1a, F2a

上一轮选项：F-1-a 修 Cloud Code 源已 stopped、Turn 关闭、0 活动子代理，插件仍显示进行中且「1 活动」；F-2-a 进行中与已完成未读（及注意力态）优先于置顶分组，图钉只留行标记，已完成已读可留在置顶分组。

## 规范化需求

### RAW-215

1. 置顶是行标记，不是状态分组的替代。
2. 进行中、待输入/待审批、待继续、已完成未读显示在对应状态分组；图钉仍在行上。
3. 已完成已读与 `unknown` 停在置顶分组。
4. 活动时间窗仍对任何置顶豁免；角标、环与专用入口仍按真实相位。

### RAW-216

1. Claude 会话 `topologyComplete === true` 且非 metadata-only 时，该 family 的子代理名单是全家快照。
2. 快照里不再出现的私有子节点必须撤回，不得靠 live delta 残留把根卡留在进行中（`liveCount > 0`）。
3. metadata-only 与非精确拓扑不得冒充全家快照。

## 需求变更评审

`scanned_owners`：PRD 置顶段、RAW-185、RAW-181 子代理收敛、Claude evidence 活推送。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| added | 状态组压过置顶泊位 | 纠偏 RAW-185「凡置顶即进置顶分组」 |
| added | 精确拓扑撤回缺席子代理 | 修 liveCount 残留 |
| unchanged | 置顶豁免活动时间窗 | RAW-185 窗口条款保留 |
| unchanged | 角标/环按真实相位 | RAW-185 可达性保留 |
