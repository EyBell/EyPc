import type { ToolPreviewPrefs } from './types'

export const TOOL_PREVIEW_HOVER_DELAY_DEFAULT_MS = 500
export const TOOL_PREVIEW_HOVER_DELAY_MAX_MS = 5000

export const DEFAULT_TOOL_PREVIEW_PREFS: ToolPreviewPrefs = {
  hoverPreviewEnabled: false,
  hoverPreviewDelayMs: TOOL_PREVIEW_HOVER_DELAY_DEFAULT_MS
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function boolValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function delayMs(value: unknown): number {
  const raw = numberValue(value, TOOL_PREVIEW_HOVER_DELAY_DEFAULT_MS)
  if (raw < 0) return TOOL_PREVIEW_HOVER_DELAY_DEFAULT_MS
  return Math.min(TOOL_PREVIEW_HOVER_DELAY_MAX_MS, Math.trunc(raw))
}

export function normalizeToolPreviewPrefs(value: unknown): ToolPreviewPrefs {
  const source = record(value)
  return {
    hoverPreviewEnabled: boolValue(source.hoverPreviewEnabled, DEFAULT_TOOL_PREVIEW_PREFS.hoverPreviewEnabled),
    hoverPreviewDelayMs: delayMs(source.hoverPreviewDelayMs)
  }
}
