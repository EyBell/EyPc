export interface StopEvent {
  hook_event_name: string
  cwd?: string
  session_id?: string
  stop_hook_active?: boolean
}

export interface BuildResult {
  code: number | null
  reason?: string
  output?: string
}

export interface HookResponse {
  decision?: 'block'
  reason?: string
  systemMessage?: string
}

export function inputDigest(root: string): string
export function runBuild(root: string, timeoutMs?: number): Promise<BuildResult>
export function handleStop(event: StopEvent, options?: {
  root?: string
  source?: 'hook' | 'manual'
  build?: (root: string) => Promise<BuildResult>
}): Promise<HookResponse>
