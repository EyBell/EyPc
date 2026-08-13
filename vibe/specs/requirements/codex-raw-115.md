---
id: eypc-req-codex-raw-115
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-115
status: active
domain: companion-codex
authority: user-stated
source_annotations: "active / refines-RAW-092-110-112-113"
relations:
  - refines-RAW-092-110-112-113
---

# RAW-115 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户再次指出插件状态栏与 Codex App 本身不一致。授权的只读联调在同一时刻观察到 Codex 任务接口有 `1 active`，而已展开插件为 `0 动态 / 0 近期任务`；这证明问题发生在 Controller 原子包之前的安全库存登记，不能用 Renderer 角标补数。Desktop 已收到但尚未进入 App Server `thread/list` 的主任务 snapshot 仍只保存在 Preload：若它保持 live active，一次空/滞后的库存扫描不得删除该 shadow。urgent 扫描对当前 dirty 且不在 `thread/list` 的 raw thread 允许在 Preload 内执行一次有界精确 `thread/read(includeTurns=false)`；只有返回身份完全相同、状态结构有效，并继续通过原生项目归属、最新 Turn `startedAt`、匿名 key 与短期 action alias 的完整登记后，才能作为普通任务进入同一 Controller 原子状态包，随后由已保留的 Desktop shadow 覆盖为 exact live 状态。精确读取失败或身份不符不得制造占位卡、匿名外计数或泄漏 raw ID/正文；live shadow 保留到后续真实库存追上、明确离开 active、归档、断桥或会话清理。既有 `thread/list` 完整分页、50ms 合并、读取中补读、`[0,300,1000]` Turn 核验、任务缺失隔离和 Renderer 零额外 debounce 均保持不变。既有 bridge 测试文件补充 `thread/list` 滞后与首次精确读取未命中序列但不执行；状态保持 `reported / 未校验，待用户验收`。
