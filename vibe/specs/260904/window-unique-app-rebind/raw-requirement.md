# RAW-208：同应用唯一根原地换绑

Tool: cursor · Date: 2026-09-04 · Level: Standard（需求）

spec_id: SPEC-260904-WINDOW-UNIQUE-APP-REBIND

## 用户原话

> 如果指定的应用窗口是唯一的，且当前记录的应用也是唯一的，可以进行相应的重新绑定替换。核验下是否可以自行替换

后续收口：

> 不用判断具体的这个应用标题 只要这个浏览器存在就可以对比上

用户在核验「重启 / 开机 / 页面重开后窗口映射对不上」后，选定实现：清单里同应用实时根唯一、同应用持久记录也唯一时自动换绑；微信这类多窗口仍手动。不看标签标题，只认这个应用/浏览器是否还在。macOS 旧实例常返回 `indeterminate` 而非 `verified-gone`，唯一换绑不得因此停住；`live` 仍禁止。不同应用即使标题相似（Edge 里的 ChatGPT 页 vs 原生 ChatGPT）不得换绑。

## 规范化需求

1. 精确身份仍是 `darwin:PID:CGWindowID` / `win32:PID:HWND`。标题、序号、相似度、应用名本身不得当作身份。
2. 允许自动换绑，当且仅当同时成立：目标 `scope=instance`；同平台同应用持久实例记录恰好 1 条；当前产品清单同应用实时根恰好 1 个；旧 locator 已空，或 `probeInstance` 不是 `live` / `temporarily-unobserved`（`verified-gone` 与 `indeterminate` 均可换绑）。
3. 自动换绑必须**原地**写回同一条 `WindowTarget` 的 locator / 标题 / app 字段。别名、收藏、置顶、槽位指针不得另造替换目标。
4. 实时根 ≥2 或同应用记录 ≥2，或探测为 `live` / `temporarily-unobserved`，仍走显式 `confirming`，不得自动选。标题相似的不同应用不得换绑。
5. macOS `list()` 保持 `partial`，不得用「清单 complete」当自动换绑门禁。进 Tab 仍不自动 `windows.list()`。
6. 残留风险必须写明：开机后同应用两个新根、其中一个在其他 Space、AX 只看见一个、旧 PID 已 gone，会把可见那个绑上。本刀不做 CG 全 Space 根普查。

## 需求变更评审

`scanned_owners`：WJ-19/WJ-22 禁止唯一候选捷径；错误记忆 `utools-window-target-auto-rebind-after-restart` 回流门禁。

| 操作 | 条款 | 处置 |
| --- | --- | --- |
| refined | WJ-19「即使只有一个候选也必须 Enter」 | 收窄为：标题/相似度/多窗口/`live` 仍禁；唯一记录+唯一根+非 live 探测允许原地换绑 |
| unchanged | 身份只认 PID+CGWindowID/HWND | 精确命中路径不变 |
| unchanged | 进 Tab 不自动 list | 页面重开仍需加载/刷新或槽位激活 |
