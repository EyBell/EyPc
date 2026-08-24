# Source Anchor Catalog

本目录为没有稳定 `RAW-nnn(#n)` 身份的来源条款提供**来源寻址**，不把它们自动升级为当前需求。

`catalog.json` 由 `scripts/validate-source-anchors.mjs` 从全部 `vibe/specs/**/raw-requirement.md` 确定性生成。当前只选择 Markdown 围栏之外的十进制有序条目；围栏内的原始 Prompt、实施计划或转录内容不进入目录，也不复制条款正文。每条只保存来源路径、所在标题、原生序号、稳定 `source_id` 与内容哈希。

状态边界：

- `registered-requirement`：来源已有父 `RAW`，且 `SPEC::RAW#n` 已进入需求登记。
- `registry-review-required`：来源已有父 `RAW`，但尚未建立当前需求叶子，需要逐条语义复核。
- `source-addressable-not-registered`：没有父 `RAW`；已可稳定回源，但仍不是 active requirement，不能据此推导实现授权或冲突裁决。

同步运行 `pnpm run sync:source-anchors`；只读门禁运行 `pnpm run validate:source-anchors`。目录是 [唯一全局当前产品真值](../PRODUCT_REQUIREMENTS.md#L1) 的来源覆盖与漂移输入，但不拥有产品语义；需求登记的生命周期与冲突关系仍由 [requirements/README.md](../requirements/README.md#L1) 独占。
