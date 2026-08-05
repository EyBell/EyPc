import type { CodexTaskCard, ConversationSnapshotV1 } from './codex'
import { companionTaskProvider, type CompanionProviderId } from './companionProvider'

/**
 * Companion aggregation.
 *
 * The Controller keeps one atomic task-state package. This module is the pure
 * seam that folds a second provider's task cards into the snapshot the Codex
 * pipeline already produced, so every downstream surface — dynamic projection,
 * badges, task cycle, floating card — consumes one merged inventory instead of
 * learning about providers individually.
 *
 * The merge is deliberately additive and order-preserving: Codex cards keep
 * their exact positions and the Codex projection is never re-run. That is what
 * makes the Codex-only path byte-identical to the pre-multi-provider release.
 */

/** Buckets a card belongs to, derived from its own state rather than its source. */
function bucketsFor(card: CodexTaskCard): Array<keyof ConversationSnapshotV1 & string> {
  if (card.isHidden) return ['hidden']
  const buckets: Array<keyof ConversationSnapshotV1 & string> = []
  if (card.bucket === 'ongoing') buckets.push('ongoing')
  if (card.bucket === 'stopped') buckets.push('stopped')
  if (card.bucket === 'completed-unread') buckets.push('completedUnread', 'completedTab')
  if (card.bucket === 'completed') buckets.push('completed', 'completedTab')
  if (card.bucket === 'ongoing' && card.activityState === 'waiting-input') buckets.push('inputRequired')
  return buckets
}

/** Latest activity a card can be ordered by; 0 when it has none. */
function activityAt(card: CodexTaskCard): number {
  return Math.max(card.lastTurnStartedAt || 0, card.lastTurnCompletedAt || 0, card.updatedAt || 0)
}

/**
 * Interleaves foreign cards into an existing bucket by recency.
 *
 * A plain append would put every foreign card after every Codex card, which is
 * source grouping by another name — the visible list is supposed to read as one
 * merged, status-driven sequence. This is a two-way stable merge rather than a
 * global sort, so the Codex side keeps its exact internal order (that order
 * encodes projection rules this layer must not second-guess) while foreign
 * cards land where their own activity puts them.
 *
 * Cards with no activity timestamp sink to the end of their own run instead of
 * jumping to the front.
 */
function mergeByRecency(target: readonly CodexTaskCard[], cards: readonly CodexTaskCard[]): CodexTaskCard[] {
  if (!cards.length) return target as CodexTaskCard[]
  const seen = new Set(target.map((card) => card.key))
  const additions = cards.filter((card) => !seen.has(card.key))
  if (!additions.length) return target as CodexTaskCard[]
  if (!target.length) return additions
  const merged: CodexTaskCard[] = []
  let left = 0
  let right = 0
  while (left < target.length && right < additions.length) {
    // Strictly greater keeps the existing card first on a tie, which preserves
    // the Codex sequence whenever timestamps are equal or absent.
    if (activityAt(additions[right]) > activityAt(target[left])) merged.push(additions[right++])
    else merged.push(target[left++])
  }
  while (left < target.length) merged.push(target[left++])
  while (right < additions.length) merged.push(additions[right++])
  return merged
}

function countWaiting(cards: readonly CodexTaskCard[]): number {
  return cards.filter((card) => card.activityState === 'waiting-input' || card.activityState === 'waiting-approval').length
}

/**
 * Merges foreign-provider cards into a Codex conversation snapshot.
 *
 * Counters are recomputed from the merged arrays rather than incremented, so a
 * card that lands in more than one bucket cannot be double counted and the
 * result is identical whether the merge runs once or is re-derived.
 */
export function mergeCompanionConversations(
  snapshot: ConversationSnapshotV1,
  cards: readonly CodexTaskCard[]
): ConversationSnapshotV1 {
  if (!cards.length) return snapshot
  const next: ConversationSnapshotV1 = { ...snapshot }
  const byBucket = new Map<string, CodexTaskCard[]>()
  for (const card of cards) {
    for (const bucket of bucketsFor(card)) {
      const list = byBucket.get(bucket) || []
      list.push(card)
      byBucket.set(bucket, list)
    }
  }
  next.ongoing = mergeByRecency(snapshot.ongoing, byBucket.get('ongoing') || [])
  next.stopped = mergeByRecency(snapshot.stopped, byBucket.get('stopped') || [])
  next.completedUnread = mergeByRecency(snapshot.completedUnread, byBucket.get('completedUnread') || [])
  next.completed = mergeByRecency(snapshot.completed, byBucket.get('completed') || [])
  next.completedTab = mergeByRecency(snapshot.completedTab, byBucket.get('completedTab') || [])
  next.inputRequired = mergeByRecency(snapshot.inputRequired, byBucket.get('inputRequired') || [])
  next.hidden = mergeByRecency(snapshot.hidden, byBucket.get('hidden') || [])
  // `pending` is the deprecated V1 alias of completedUnread and must not drift.
  next.pending = next.completedUnread
  next.all = mergeByRecency(snapshot.all, cards)

  next.ongoingCount = next.ongoing.length
  next.stoppedCount = next.stopped.length + next.hidden.filter((card) => card.bucket === 'stopped').length
  next.waitingCount = countWaiting(next.ongoing)
  next.runningCount = next.ongoing.filter((card) => card.activityState === 'active').length
  next.inputRequiredCount = [...next.ongoing, ...next.hidden].filter((card) => card.activityState === 'waiting-input').length
  next.completedUnreadCount = next.completedUnread.length
  next.completedCount = next.completed.length
  next.pendingCount = next.completedUnreadCount
  next.hiddenCount = next.hidden.length
  return next
}

/** Removes one provider's cards from a merged snapshot. */
export function withoutCompanionProvider(
  snapshot: ConversationSnapshotV1,
  provider: CompanionProviderId
): ConversationSnapshotV1 {
  const keep = (cards: readonly CodexTaskCard[]) => cards.filter((card) => companionTaskProvider(card) !== provider)
  const next: ConversationSnapshotV1 = {
    ...snapshot,
    ongoing: keep(snapshot.ongoing),
    stopped: keep(snapshot.stopped),
    completedUnread: keep(snapshot.completedUnread),
    completed: keep(snapshot.completed),
    completedTab: keep(snapshot.completedTab),
    inputRequired: keep(snapshot.inputRequired),
    hidden: keep(snapshot.hidden),
    all: keep(snapshot.all)
  }
  next.pending = next.completedUnread
  next.ongoingCount = next.ongoing.length
  next.stoppedCount = next.stopped.length + next.hidden.filter((card) => card.bucket === 'stopped').length
  next.waitingCount = countWaiting(next.ongoing)
  next.runningCount = next.ongoing.filter((card) => card.activityState === 'active').length
  next.inputRequiredCount = [...next.ongoing, ...next.hidden].filter((card) => card.activityState === 'waiting-input').length
  next.completedUnreadCount = next.completedUnread.length
  next.completedCount = next.completed.length
  next.pendingCount = next.completedUnreadCount
  next.hiddenCount = next.hidden.length
  return next
}

/* ------------------------------------------------------------------ *
 * Quota aggregation
 * ------------------------------------------------------------------ */

export interface CompanionQuotaChannelReading {
  provider: CompanionProviderId
  remainingPercent: number
  resetAt: number | null
  label: string
}

export interface CompanionWaterBallReadings {
  liquid: CompanionQuotaChannelReading | null
  ring: CompanionQuotaChannelReading | null
  percent: CompanionQuotaChannelReading | null
}

/**
 * Resolves the three water-ball channels from the already-mapped provider
 * assignment plus each provider's current readings. A channel whose provider
 * has no usable reading resolves to null so the renderer can fall back to its
 * existing empty presentation instead of showing a fabricated zero.
 */
export function resolveCompanionWaterBallReadings(
  mapping: { liquid: CompanionProviderId | null; ring: CompanionProviderId | null; percent: CompanionProviderId | null },
  readings: Partial<Record<CompanionProviderId, { short: CompanionQuotaChannelReading | null; weekly: CompanionQuotaChannelReading | null }>>
): CompanionWaterBallReadings {
  const pick = (provider: CompanionProviderId | null, kind: 'short' | 'weekly') => {
    if (!provider) return null
    const source = readings[provider]
    if (!source) return null
    return source[kind] || (kind === 'weekly' ? source.short : source.weekly) || null
  }
  return {
    liquid: pick(mapping.liquid, 'short'),
    ring: pick(mapping.ring, 'weekly'),
    percent: pick(mapping.percent, 'short')
  }
}
