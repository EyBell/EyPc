import type { AppTabId } from '../../domain/types'
import { FEATURES, featureDefinitionFor } from '../../runtime/feature/featureRegistry'

export interface FeatureHelpDoc {
  id: AppTabId
  title: string
  markdown: string
}

const guideModules = import.meta.glob('./*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

function markdownFor(id: AppTabId): string | null {
  const key = `./${id}.md`
  const value = guideModules[key]
  return typeof value === 'string' && value.trim() ? value : null
}

/** Feature ids that must have settings「说明」guides — same set as FEATURES. */
export function requiredFeatureHelpIds(): AppTabId[] {
  return FEATURES.map((feature) => feature.id)
}

const docs = new Map<AppTabId, FeatureHelpDoc>()
for (const id of requiredFeatureHelpIds()) {
  const markdown = markdownFor(id)
  if (!markdown) continue
  docs.set(id, {
    id,
    title: featureDefinitionFor(id).title,
    markdown
  })
}

export function getFeatureHelp(id: AppTabId): FeatureHelpDoc | null {
  return docs.get(id) || null
}

export function hasFeatureHelp(id: AppTabId): boolean {
  return docs.has(id)
}

/** Empty when every FEATURES entry has a non-empty src/help/guides/{id}.md. */
export function missingFeatureHelpIds(): AppTabId[] {
  return requiredFeatureHelpIds().filter((id) => !docs.has(id))
}

export function listFeatureHelpDocs(): FeatureHelpDoc[] {
  return requiredFeatureHelpIds()
    .map((id) => docs.get(id))
    .filter((doc): doc is FeatureHelpDoc => Boolean(doc))
}
