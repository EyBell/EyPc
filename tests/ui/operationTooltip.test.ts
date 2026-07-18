// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OperationTooltipLayer from '../../src/components/OperationTooltipLayer.vue'

describe('operation tooltip layer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main class="app-shell"><button id="operation" title="刷新列表" data-operation-shortcut="Ctrl+R">刷新</button></main>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('replaces native titles and exposes one accessible tooltip on focus', async () => {
    const button = document.querySelector<HTMLButtonElement>('#operation')!
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    await Promise.resolve()

    expect(button.hasAttribute('title')).toBe(false)
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()

    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')
    expect(tooltip?.textContent).toContain('刷新列表')
    expect(tooltip?.textContent).toContain('Ctrl+R')
    expect(button.getAttribute('aria-describedby')).toContain('eypc-operation-tooltip')

    wrapper.unmount()
  })

  it('shows a reason for disabled operations', async () => {
    const button = document.querySelector<HTMLButtonElement>('#operation')!
    button.disabled = true
    button.dataset.disabledReason = '请先选择一个文件'
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('请先选择一个文件')
    wrapper.unmount()
  })

  it('detects disabled controls from a captured pointer move', async () => {
    vi.useFakeTimers()
    const button = document.querySelector<HTMLButtonElement>('#operation')!
    button.disabled = true
    button.dataset.disabledReason = '请先选择一项'
    const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(button)
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10, bubbles: false }))
    await vi.advanceTimersByTimeAsync(110)
    await wrapper.vm.$nextTick()

    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('请先选择一项')
    elementFromPoint.mockRestore()
    wrapper.unmount()
  })

  it('uses the control label instead of an operation-marked parent for form controls', async () => {
    document.body.innerHTML = `
      <main class="app-shell">
        <div data-operation-tooltip="打开行操作">
          <label><input id="toggle" type="checkbox">悬浮预览</label>
        </div>
        <select id="scope" aria-label="快捷键范围"><option>全部</option></select>
      </main>
    `
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    const checkbox = document.querySelector<HTMLInputElement>('#toggle')!
    checkbox.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('悬浮预览')
    expect(document.querySelector('[role="tooltip"]')?.textContent).not.toContain('打开行操作')

    const select = document.querySelector<HTMLSelectElement>('#scope')!
    select.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: checkbox }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('快捷键范围')
    wrapper.unmount()
  })

  it('covers actionable list/tree rows and label hit areas', async () => {
    document.body.innerHTML = `
      <main class="app-shell">
        <div id="row" role="option" aria-label="MQTT 记录 demo"></div>
        <label id="toggle-label"><input id="nested-toggle" type="checkbox" aria-label="启用预览">启用预览</label>
      </main>
    `
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    const row = document.querySelector<HTMLElement>('#row')!
    row.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('MQTT 记录 demo')
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('单击聚焦')

    const label = document.querySelector<HTMLLabelElement>('#toggle-label')!
    row.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(label)
    vi.useFakeTimers()
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 8, clientY: 8 }))
    await vi.advanceTimersByTimeAsync(110)
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('启用预览')
    elementFromPoint.mockRestore()
    wrapper.unmount()
  })
})
