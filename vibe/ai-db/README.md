# EyPc AI DB Notes

Tool: tool-neutral (codex, claude, and any CodeNote-routed agent)

EyPc MVP stores state in `utools.dbStorage` under `eypc/state/v1`.

SQLite is intentionally not the default storage path in the first MVP. If a future task adds SQLite or DB/data workflows, initialize task-specific notes under this directory through the global AI-DB storage and naming rules in [CodeNote DB governance](../../../../../czz/CzzProj/CodeNote/DevelopRef/调试工具/db/governance/README.md#5-workspace-shape-and-naming).
