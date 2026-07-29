import type { CodexFloatSnapshotV1 } from './runtime/codexController'
import type { CodexNewThreadRequest, CodexNewThreadResult, CodexThreadOpenResult } from './domain/codex'
import type {
  CodexEnvironmentActionRunResult,
  CodexEnvironmentActionSessionProjection,
  CodexEnvironmentListResult
} from './domain/codexEnvironment'

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
      onActivate?(listener: (payload: { requestedAt?: number; command?: 'new-thread' }) => void): () => void
      setExpansion(expanded: boolean, pinned?: boolean): boolean
      returnFocus(): boolean
      action(actionId: string, args?: Record<string, unknown>): boolean
      createThread(request: CodexNewThreadRequest): Promise<CodexNewThreadResult>
      reopenThread(actionAlias: string): Promise<CodexThreadOpenResult>
      openBlank(): Promise<CodexThreadOpenResult>
      copyText(text: string): Promise<boolean>
      listProjectEnvironments?(targetAlias: string): Promise<CodexEnvironmentListResult>
      runProjectAction?(request: {
        targetAlias: string
        environmentId: string
        actionId: string
        confirmToken?: string
        stopIfRunning?: boolean
      }): Promise<CodexEnvironmentActionRunResult>
      listActionSessions?(): Promise<{ outcome?: string; sessions?: CodexEnvironmentActionSessionProjection[] } | CodexEnvironmentActionSessionProjection[]>
      stopActionSession?(request: {
        projectKey: string
        environmentId: string
        actionId: string
      }): Promise<CodexEnvironmentActionRunResult>
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
