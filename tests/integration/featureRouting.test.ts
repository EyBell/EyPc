import { describe, expect, it } from 'vitest'
import { routePluginFeature } from '../../src/runtime/feature/featureRouting'

describe('uTools feature routing', () => {
  it('routes plugin feature code to tab and search focus intent', () => {
    expect(routePluginFeature({ code: 'eypc-main' })).toEqual({ tab: 'ports', focusSearch: false })
    expect(routePluginFeature({ code: 'eypc-ports' })).toEqual({ tab: 'ports', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-favorites' })).toEqual({ tab: 'favorites', focusSearch: true })
    expect(routePluginFeature({ code: 'eypc-settings' })).toEqual({ tab: 'settings', focusSearch: false })
    expect(routePluginFeature({ code: 'unknown' })).toEqual({ tab: 'ports', focusSearch: false })
  })
})
