import type { CodexActionLogDeltaV1, CodexActionRunnerActionEvent, CodexActionRunnerSnapshotV1 } from './domain/codexActionRunner'

declare global {
  interface Window {
    eypcActionRunner?: {
      getSnapshot(): CodexActionRunnerSnapshotV1 | null
      onSnapshot(listener: (snapshot: CodexActionRunnerSnapshotV1) => void): () => void
      onLog(listener: (delta: CodexActionLogDeltaV1) => void): () => void
      action(actionId: CodexActionRunnerActionEvent['actionId'], args?: Record<string, unknown>): boolean
      requestSnapshot(): boolean
      hide(): boolean
      dragStart(screenX: number, screenY: number): boolean
      dragMove(screenX: number, screenY: number): boolean
      dragEnd(): boolean
      resizeStart(screenX: number, screenY: number, corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): boolean
      resizeMove(screenX: number, screenY: number): boolean
      resizeEnd(): boolean
      resizeCancel(): boolean
    }
  }
}

export {}
