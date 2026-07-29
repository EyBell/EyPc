import { describe, expect, it } from 'vitest'
import { listFeatureHelpDocs, missingFeatureHelpIds, requiredFeatureHelpIds } from '../../src/help/guides'
import { FEATURES } from '../../src/runtime/feature/featureRegistry'

describe('feature help coverage', () => {
  it('requires a guide id for every FEATURES registry entry', () => {
    expect(requiredFeatureHelpIds()).toEqual(FEATURES.map((feature) => feature.id))
  })

  it('embeds a non-empty user guide for every registered feature', () => {
    expect(missingFeatureHelpIds()).toEqual([])
    expect(listFeatureHelpDocs().map((doc) => doc.id)).toEqual(requiredFeatureHelpIds())
    for (const doc of listFeatureHelpDocs()) {
      expect(doc.title.trim().length).toBeGreaterThan(0)
      expect(doc.markdown.trim().length).toBeGreaterThan(0)
    }
  })
})
