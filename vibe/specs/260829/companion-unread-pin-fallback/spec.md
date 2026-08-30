# Spec：已完成未读与置顶兜底互斥选择

spec_id: `SPEC-260829-COMPANION-UNREAD-PIN-FALLBACK`
Tool: codex
Date: 2026-08-29
Status: `implementation-landed / focused-automated-verified / artifact-ready / host-pending`
Documentation level: `standard requirement`

Raw source: [raw-requirement.md](raw-requirement.md#L1)
Canonical target: [PRODUCT_REQUIREMENTS.md](../../PRODUCT_REQUIREMENTS.md#L250)

## Task Documentation Sync Group

- Group key: `dsg:eypc:260829-companion-unread-pin-fallback`
- Group owner: this `spec.md`

```json documentation-sync-group-v1
{
  "schema": "documentation-sync-group-v1",
  "group_key": "dsg:eypc:260829-companion-unread-pin-fallback",
  "group_owner": "vibe/specs/260829/companion-unread-pin-fallback/spec.md",
  "documents": [
    "vibe/specs/260829/companion-unread-pin-fallback/raw-requirement.md",
    "vibe/specs/260829/companion-unread-pin-fallback/spec.md",
    "vibe/specs/260829/companion-unread-pin-fallback/changes.md",
    "vibe/specs/requirements/shared-raw-188.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/requirements/conflict-register.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md"
  ],
  "dependencies": [
    "preload/companion/task-kernel.cjs",
    "public/companion/task-kernel.cjs",
    "public/runtime-identity.cjs"
  ],
  "validators": [
    "tests/platform/companionTaskKernel.test.ts",
    "scripts/validate-committed-preload-mirrors.mjs",
    "scripts/validate-requirements.mjs",
    "scripts/validate-source-anchors.mjs"
  ],
  "git_scope_prefixes": [
    "vibe/specs/260829/companion-unread-pin-fallback",
    "vibe/specs/requirements/shared-raw-188.md",
    "vibe/specs/requirements/modules/companion-shared.md",
    "vibe/specs/requirements/conflict-register.md",
    "vibe/specs/PRODUCT_REQUIREMENTS.md",
    "vibe/specs/PROJECT_STATUS.md",
    "vibe/knowledge/ARCHITECTURE.md",
    "src/help/guides/codex.md"
  ]
}
```

## Requirement Delta

- Change: `completedUnread` attention 从「真实未读后拼接置顶」改为「真实未读与置顶兜底二选一」，并由 Kernel 为 `input/completedUnread` 各自维持一轮稳定的实例顺序。
- Preserve: 置顶分组成员、时间窗豁免、固定访问身份、通用循环、命令 ID 和 Snapshot 线形。
- Privacy: 任务文档不保留截图标题、原始任务身份、Prompt 或 transcript。
- External authority sync: CodeNote 的 EyPc `companion-state-reconciliation/references/source-map.md` 在独立 `codex/260829-eypc-companion-source-map` 工作树同步；它属于另一 Git tree，因此不进入本组的仓内 manifest。

## Design

`buildViews` 先从同一份已排序可见集合中派生 `unreadAttention` 与 `pinnedAttention`。前者非空时，`attentionKeys.completedUnread` 只映射前者；前者为空时才映射后者。没有新增 Controller 分支或持久状态。

Kernel 以现有 `attentionInstance` 为身份维护两个进程内 `attentionWalk`。每次 Snapshot 只裁剪离场实例，把新生命周期实例按当前最新顺序插到队首，并保持其余实例在本轮中的相对顺序；因此 metadata-only 的 `lastQuestionAt` 重排只影响公开列表，不会改变下一跳。整轮成功派发完毕后，下一次触发才按当时最新公开顺序重建轮次；失败不推进，也不新增防抖、合并或持久化缓存。

真实未读与置顶的互斥 `attentionKeys.completedUnread` 仍是候选边界：置顶轮次被真实未读打断时，全部置顶实例随候选裁剪；回到零未读时按当前置顶首项重建。Controller、Renderer、Provider 与 Navigation 不增加补偿分支。

## Verification Impact Trace

- Changed behavior: V7 Kernel `buildViews` 的 completed-unread 候选选择，以及 `dispatchAttention` 的进程内稳定轮次。
- Direct consumers: `input/completedUnread` 两种 attention、候选计数诊断与全部 `open-attention` 入口。
- Selected checks: Kernel 聚焦 Vitest；production build；preload 镜像；需求登记、Source Anchor 与当前真值。
- Not selected: 仓库全量 `verify`、真实 uTools 快捷键、真实 Provider 打开或视觉验收；没有升级触发。

## Acceptance

聚焦测试必须同时锁定混合快照不跳置顶、零未读置顶兜底、候选切换时进度裁剪、置顶任务自身属于真实未读、两种 attention 的 metadata-only 重排，以及打开进行中新实例插队并恢复旧轮次。自动化通过只形成 `artifact-ready`；真实宿主仍为独立门禁。

## Integration Evidence

- 2026-08-30：与 [RAW-189 集成 owner](../companion-pinned-collapse-plan-input/spec.md#L1) 共同进入本地分批提交；两组复用同一 Kernel、构建与文档验证，不另起实现分支。
- 文件归属见 [changes.md](changes.md#L1)，最终批次回执由集成 owner 保存。
- Kernel / Desktop Bridge / Float / Runtime Identity 四个聚焦文件 `316/316` 通过。该结果不含真实宿主验收，也不构成推送或清理工作树授权。
