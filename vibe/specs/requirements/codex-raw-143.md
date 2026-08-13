---
id: eypc-req-codex-raw-143
qualified_source: SPEC-260718-1148-CODEX-QUOTA-FLOAT::RAW-143
status: active
domain: companion-codex
authority: user-stated
source_annotations: "focused-automated-verified-host-pending / refines-RAW-114-139-141 / mainhide-hot-shortcut-cache-continuity"
relations:
  - refines-RAW-114-139-141
---

# RAW-143 · companion-codex

> 正文由来源任务保存，此处只登记身份、状态与关系：[原始记录](../260718/1148-codex-quota-float/raw-requirement.md#L1)。

用户继续指出各类全局快捷键反应过慢，要求核验项目列表判断、缓存池与实际卡点。只读量化确认当前原生状态约 1.29 MiB、16 个项目、217 条归属，近似解析/排序/指纹平均约 2.5ms，不是主因；真正阻塞来自普通 `mainHide → onPluginOut(false)` 关闭 App Server 并清空 task/project alias、latest-Turn cache 和 Activity inventory，下一次命令只能重新启动 App Server、完整 `thread/list`，并以 10 并发逐任务执行 `thread/turns/list(limit=1)`。Controller 在已有扫描进行时还会等待后再重复 action preflight，Action Runner/五槽也会在每次入口无条件全量预检。修复后普通 `onPluginOut(false)` 只处理窗口隐藏，不关闭 App Server；显式 Controller close、feature disable、真实 `onPluginOut(true)` 和进程退出仍清理。Controller 以单调发布序列判断现有 in-flight 是否真的完成了任务库存，覆盖成功则复用、未覆盖或被取消才补一次；已验证空库存也属于当前缓存。Runner 首次或 stale alias 才读任务库存，热打开复用现有 verified inventory，Host 精确 alias 校验与一次 stale retry 保持不变。聚焦四文件 `149/149`、typecheck、preload 语法、main preload 镜像与 `git diff --check` 通过；未运行完整 verify/build 或真实 uTools，真实连续快捷键时延保持 host-pending。
