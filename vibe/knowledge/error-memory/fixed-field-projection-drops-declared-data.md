---
id: eypc-fixed-field-projection-drops-declared-data
status: verified
scope: project
fingerprint: source-hands-over-a-whole-object__cache-stores-it-verbatim__projection-reads-two-hardcoded-keys__extra-declared-entries-vanish-silently__no-error-anywhere
first_seen: 2026-08-06
last_verified: 2026-08-06
evidence:
  - src/domain/claude.ts
  - preload/claude/scripts.cjs
  - tests/domain/claude.test.ts
tags:
  - domain
  - projection
  - upstream-contract
---

# A Fixed-Field Projection Silently Dropped Data the Source Had Already Handed Over

## Symptom

Claude 的账号面板显示三个限额窗口（`5-hour`、`Weekly · all models`、`Weekly · <模型>`），
EyPc 只显示两个。用户以为是采集缺失，实际上：

- 状态栏包装脚本用花括号配平把**整个 `rate_limits` 对象逐字**写进缓存——第三个窗口的字节一直在本机；
- `normalizeClaudeQuota` 读的是 `input.five_hour` 与 `input.seven_day` 两个硬编码键，其余键**连看都没看**。

没有任何报错、没有降级提示、测试也全绿：投影层把"我认识的字段"当成了"存在的字段"。

## Wrong Assumption

以为上游一个稳定的对象等于一组稳定的**字段**。实际稳定的是**形状**（键 → 窗口），
键集合本身随账号套餐与模型阵容变化。

## Verified Root Cause

跨进程数据在三层之间流动：采集（逐字保留）→ 缓存（逐字保留）→ 投影（**收窄**）。
只有最后一层做了收窄，而它恰好是唯一没有人去核对上游实际内容的一层——
本机缓存文件里就有答案，两轮实现都没打开过它。

## Detection Order

1. 看采集层保留了什么：`grep` 缓存写入点。逐字保留 = 上游内容比投影更宽的强信号。
2. **打开真实的缓存文件/样本**，把键集合与投影读取的键集合做差集。差集非空即是本病。
3. 看 UI 与官方界面的**条目数**对不上时，先怀疑投影，再怀疑采集。

## Prevention Rule

- 对"键 → 条目"形状的上游数据，投影必须**遍历键**，条目标题从键派生；
  认识的键给好标题，不认识的键原样携带而不是丢弃。
- 需要"某个特定条目"时（如水球球心的周读数），用**限定条件**取（无 scope 的那个），
  不要用位置或宽松前缀匹配——否则一个 `seven_day_opus` 会冒充 `seven_day`。
- 不建模型名/条目名对照表：下一个新条目会重演本条记录。

## History

| 日期 | 记录 |
| --- | --- |
| 2026-08-06 | 首次归档：用户按官方面板截图指出只显示两个窗口；改为按键枚举 + 键名派生标签，并补 scoped 不得冒充 plain 的回归用例 |
