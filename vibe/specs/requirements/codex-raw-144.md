---
id: eypc-req-codex-raw-144
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-144
status: active
domain: companion-codex
authority: user-stated
source_annotations: "focused-automated-verified-host-pending / refines-RAW-138-140-142-143 / feature-lifetime-incremental-cache-and-turn-bound-read-ack"
relations:
  - refines-RAW-138-140-142-143
---

# RAW-144 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户进一步明确全局缓存应在功能启用期间持续接收实时增量，不应随主窗口 Tab/浮窗显隐全额清理；同时要求复核“已完成未读”成功打开变为已读后是否仍可能重复出现。复核确认两项残留：Controller 的运行门禁仍绑定 Codex Tab/浮窗，离页会清空物化库存并断开活动订阅；Runner 虽复用 task inventory，却仍在每次入口逐项目读取 Environment catalog。另有两个已读边界未闭合：uTools `shellOpenExternal` fallback 的已接纳派发没有建立已读确认；确认只按 started/completed 时间绑定时，同一 Turn 的迟到 `completedAt` 补全可能被误判为新 completion 并释放确认。现行 Controller 在 Codex 功能启用的整个生命周期保持任务/项目库存、Activity generation、alias 与增量订阅热态，Tab/浮窗只门控额度/config；feature disable、inbox disable、显式 dispose/kill 才清派生状态，收件箱关闭时任务定时器与 Activity watchdog 同步静默。Runner 使用按 project key/alias 的有界内存 catalog、每项目 single-flight 和增量失效：库存新增只加载新项目、alias 变化只重载该项目、移除即删除；Runner 初始化后 verified inventory 会后台补齐受影响分片，Host 执行仍每次重读并验证 TOML/target/command 指纹。Electron Deep Link 成功及 uTools 明确非 `false` 的派发均建立会话确认；确认必须绑定可验证 latest Turn，并优先用 preload 内部 Turn ID 识别 epoch，同一 Turn 的完成时间补全、原生 stale true、refollow 或较旧全量快照不得复现未读，真正不同 Turn、active/inProgress 或明确移除才释放。公开 `task-state-v4`、Renderer、持久化与 Codex 原生文件不变。影响面 15 个测试文件 `301/301`、typecheck、preload 语法/镜像与 diff 已通过；真实 uTools 连续快捷键、uTools fallback 与同 Turn 补全仍为 host-pending。
