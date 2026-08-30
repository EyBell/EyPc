# Changes：未读与置顶互斥、稳定 attention 轮次

本清单只记录文件作用；需求和验收由 [spec](spec.md#L1) 承载。RAW-188 与 RAW-189 共享文件的最终批次见 [集成清单](../companion-pinned-collapse-plan-input/changes.md#L1)。

| 文件 | 核心说明 |
| --- | --- |
| [task-kernel.cjs](../../../../preload/companion/task-kernel.cjs#L1) | 未读/置顶互斥候选，以及进程内稳定实例轮次 |
| [Kernel 镜像](../../../../public/companion/task-kernel.cjs#L1) | 跟随 canonical preload 生成，不能独立修改 |
| [Kernel 测试](../../../../tests/platform/companionTaskKernel.test.ts#L1) | 覆盖 metadata 重排、新实例插队、失败不推进和零未读切换 |
| [raw-requirement.md](raw-requirement.md#L1) | 规范化来源与冲突裁决 |
| [spec.md](spec.md#L1) | 当前设计、影响核验和集成入口 |
| [RAW-188 登记](../../requirements/shared-raw-188.md#L1) | 登记身份、状态及局部 refinement 关系 |
| [changes.md](changes.md#L1) | 文件归属清单，不复制验证或需求正文 |

未执行：真实宿主快捷键验收、Provider 写入、推送、工作树清理；这些均不由本地提交授权。
