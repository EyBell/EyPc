// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import DialogShell from '../../src/components/DialogShell.vue'

describe('DialogShell', () => {
  it('owns dialog semantics, Escape, focus cycling, and trigger restoration', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'open'
    document.body.append(trigger)
    trigger.focus()
    const wrapper = mount(DialogShell, {
      props: { as: 'form', panelClass: 'test-dialog', labelId: 'title', initialFocusSelector: '[data-first]' },
      slots: { default: '<h2 id="title">Dialog</h2><button data-first>First</button><button data-last>Last</button>' },
      attachTo: document.body
    })
    await nextTick()
    await nextTick()

    expect(wrapper.get('.test-dialog').attributes()).toMatchObject({ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'title' })
    expect(document.activeElement).toBe(wrapper.get('[data-first]').element)
    await wrapper.get('[data-first]').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(wrapper.get('[data-last]').element)
    await wrapper.get('.test-dialog').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })
})
