# Harness 抬头缩写

全局命名表，不是 CodexHost 专用。任务卡第一行的 harness 前缀（`gr · …`）一律走这里。EyPc 来源标记（第二行 `CC` / `CX` / `CS` / `OR` / `XH`）是另一套，见 [companionPresentation.ts](../../src/domain/companionPresentation.ts#L1)。

运行时唯一实现：[preload/companion/harness-labels.cjs](../../preload/companion/harness-labels.cjs#L1)。CodexHost 额外进程、Orca Agents、以及后续 Paseo 等宿主都 `require` 这份表。禁止再抄一份 `gr`/`cc` 映射。

## 现行缩写

| id | 抬头 |
| --- | --- |
| `grok` | `gr` |
| `claude` / `claude-code` | `cc` |
| `codex` | `cx` |
| `cursor` | `cs` |
| `pi` | `pi` |
| `omp` | `op` |
| `dsh` | `ds` |
| `devin` | `dv` |

未登记的 id 原样使用，不得猜字母。Paseo 等新宿主接入时在本表加一行，并改 `harness-labels.cjs`。

## 抬头形状

`{缩写} · {主题}`。没有主题时用项目名：`gr · EyPc`。不要写完整 `Grok` / `Claude` / `Cursor` 当抬头。Orca 主题优先取标签标题（`terminal list --include-visual-layouts` 的 `tabs[].title`）；工作中 OSC 标题常是 spinner `⠋ Grok`，那不是主题。

## 不要做

- 不要在 CodexHost、Orca、Paseo 各自维护缩写。
- 不要把这张表和 EyPc Provider 标记（`OR` / `XH`）混成一张。
