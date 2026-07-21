import type { CodexFloatSnapshotV1 } from './runtime/codexController'

export {}

export type CodexFloatResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export interface CodexFloatWindowState {
  expanded: boolean
  pinned: boolean
  resizing: boolean
  resizeCorner: CodexFloatResizeCorner | null
  expandedSize: { displayId: string; width: number; height: number; manual: boolean } | null
}

declare global {
  interface Window {
    eypcFloat?: {
      getSnapshot(): CodexFloatSnapshotV1 | null
      getState(): CodexFloatWindowState
      onSnapshot(listener: (snapshot: CodexFloatSnapshotV1) => void): () => void
      onState(listener: (state: CodexFloatWindowState) => void): () => void
      onActivate?(listener: (payload: { requestedAt?: number }) => void): () => void
      setExpansion(expanded: boolean, pinned?: boolean): boolean
      action(actionId: string, args?: Record<string, unknown>): boolean
      dragStart(screenX: number, screenY: number): boolean
      dragMove(screenX: number, screenY: number): boolean
      dragEnd(): boolean
      resizeStart(screenX: number, screenY: number, corner: CodexFloatResizeCorner): boolean
      resizeMove(screenX: number, screenY: number): boolean
      resizeEnd(): boolean
      resizeCancel(): boolean
    }
  }
}
