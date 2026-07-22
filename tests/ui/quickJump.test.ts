import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('global quick jump UI wiring', () => {
  it('mounts the quick jump overlay from the app keyboard pipeline', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(app).toContain("import QuickJumpLayer from './components/QuickJumpLayer.vue'")
    expect(app).toContain('quickJump.openForward')
    expect(app).toContain('quickJump.openBackward')
    expect(app).toContain('data-quick-jump-ignore')
    expect(app).toMatch(/<QuickJumpLayer[\s\S]*:targets="quickJump\.targets"/)
  })

  it('centers compact framed badges directly over their targets', () => {
    const layer = readFileSync(resolve(process.cwd(), 'src/components/QuickJumpLayer.vue'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    expect(layer).toContain("import { layoutQuickJumpMarkers } from '../domain/quickJumpLayout'")
    expect(layer).toContain('getBoundingClientRect')
    expect(layer).toContain('layoutQuickJumpMarkers')
    expect(css).not.toContain('--quick-jump-y-offset')
    expect(css).toContain('transform: translate(-50%, -50%)')
    expect(css).toContain('.quick-jump-top-layer')
    expect(css).toMatch(/\.quick-jump-top-layer \{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;/s)
    expect(css).toContain('.quick-jump-badge.active')
    expect(layer).toContain("'--quick-jump-width': `${item.width}px`")
    expect(layer).toContain("'--quick-jump-height': `${item.height}px`")
    expect(css).toContain('background: #111827')
    expect(css).toContain('border: 2px solid #fff')
    expect(css).toContain('background: #facc15')
    expect(css).toContain('font-weight: 900')
    expect(css).toContain('font-size: 12px')
    expect(css).toContain('letter-spacing: 0')
    expect(css).not.toContain('.quick-jump-badge:nth-child(2n)')
    expect(css).not.toContain('.quick-jump-badge:nth-child(3n)')
    expect(css).toContain('[data-quick-jump-active="true"]')
  })

  it('renders the remaining marker suffix after typed marker prefixes', () => {
    const layer = readFileSync(resolve(process.cwd(), 'src/components/QuickJumpLayer.vue'), 'utf8')

    expect(layer).toContain('target.displayMarker || target.marker')
    expect(layer).toContain('label: markerLabel')
  })

  it('keeps icon command buttons targetable even inside editor surfaces', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(app).toContain("targetText(element, 'data-mqtt-shortcut-hint')")
    expect(app).toContain("targetText(element, 'placeholder')")
    expect(app).toContain('function isQuickJumpCommandTarget')
    expect(app).toContain('function isQuickJumpEditingSurfaceTarget')
    expect(app).toContain('!isQuickJumpEditingSurfaceTarget(element)')
  })

  it('covers focusable text controls while preserving edit-mode ownership', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(app).toContain('input:not([type="hidden"]):not(:disabled)')
    expect(app).toContain('textarea:not(:disabled)')
    expect(app).toContain('[role="textbox"]')
    expect(app).toContain('[role="searchbox"]')
    expect(app).toContain('function isQuickJumpFocusableTarget')
    expect(app).toContain('|| isQuickJumpFocusableTarget(element)')
    expect(app).toContain('if (isEditableTarget(element) && !isQuickJumpFocusableTarget(element)) return false')
  })

  it('skips command buttons hidden by ancestor clipping or non-interactive styles', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(app).toContain('function quickJumpVisibleRect')
    expect(app).toContain('function quickJumpClippingAncestor')
    expect(app).toContain("style.pointerEvents === 'none'")
    expect(app).toContain('quickJumpVisibleRect(element)')
    expect(app).toContain('visibleRect.width < 6 || visibleRect.height < 6')
  })

  it('skips targets covered by a higher interactive layer while keeping top-layer buttons targetable', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    expect(app).toContain("import { quickJumpHitStackContainsTarget, quickJumpHitTestPoints } from './domain/quickJumpHitTest'")
    expect(app).toContain('function quickJumpHitTargetVisible')
    expect(app).toContain('document.elementsFromPoint')
    expect(app).toContain('quickJumpHitTestPoints(visibleRect).some')
    expect(app).toContain('quickJumpHitStackContainsTarget(element, document.elementsFromPoint(point.x, point.y))')
  })

  it('applies clipping, hit-stack and transient-layer filtering inside the independent Codex renderer', () => {
    const float = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')

    expect(float).toContain('function quickJumpVisibleRect')
    expect(float).toContain('function quickJumpClippingAncestor')
    expect(float).toContain("style.pointerEvents === 'none'")
    expect(float).toContain('document.elementsFromPoint')
    expect(float).toContain('if (composer.value || shiftPreview.value) return false')
    expect(float).toContain("if (panel.value && !element.closest('.float-side-panel')) return false")
    expect(float).toContain('closeShiftPreview(true)')
    expect(float).toMatch(/if \(focusKey\) \{[\s\S]*?focusedKey\.value = focusKey[\s\S]*?return[\s\S]*?\}[\s\S]*?target\.element\.click\(\)/)
  })

  it('uses target rectangles directly without title-anchor positioning', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const layer = readFileSync(resolve(process.cwd(), 'src/components/QuickJumpLayer.vue'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

    expect(app).not.toContain('anchorElement')
    expect(app).not.toContain('quickJumpAnchorElement')
    expect(layer).not.toContain('anchorElement')
    expect(layer).not.toContain('anchorRect')
    expect(layer).toContain('targetRect: quickJumpRect(target.element.getBoundingClientRect())')
    expect(layer).toContain('layoutQuickJumpMarkers')
    expect(layer).not.toContain('viewportWidth: window.innerWidth')
    expect(css).toContain('max-width: none')
    expect(css).toContain('overflow: visible')
  })
})
