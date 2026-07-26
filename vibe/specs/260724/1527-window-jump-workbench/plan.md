# Window Jump Workbench — Plan

1. Add persistent target/slot contracts and normalizers without persisting live native windows.
2. Extend the preload/platform bridge with fixed, bounded Windows and macOS adapters plus unsupported-stale fallback.
3. Add the disabled feature, fixed uTools commands, route parsing, runtime resolution, focus-safe activation, and keyboard bindings.
4. Build the dense accessible window list and action/editor layers, reusing EyPc list conventions.
5. Synchronize requirement, architecture, status, task evidence, and code links; record user-owned validation gaps.

## Non-negotiable Execution Constraints

- Preserve unrelated dirty files and changes.
- Do not run test, typecheck, build, uTools-host, browser/screenshot, or live OS scan/activation checks in this task.
- Keep all platform calls initiated by an explicit user interaction or uTools feature entry, with bounded process execution and no shell interpolation of user-controlled titles.

