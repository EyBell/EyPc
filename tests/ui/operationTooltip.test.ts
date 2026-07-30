// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OperationTooltipLayer from '../../src/components/OperationTooltipLayer.vue'

function vueFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return path.endsWith('.vue') ? [path] : []
  })
}

describe('operation tooltip layer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main class="app-shell"><button id="operation" title="刷新列表" data-operation-shortcut="Ctrl+R">刷新</button></main>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('keeps every main-page and shared-component button within the naming contract', () => {
    const srcRoot = resolve(process.cwd(), 'src')
    const files = [...vueFiles(join(srcRoot, 'pages')), ...vueFiles(join(srcRoot, 'components'))]
    const missing: string[] = []
    let buttonCount = 0

    files.forEach((file) => {
      const source = readFileSync(file, 'utf8')
      for (const button of source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
        buttonCount += 1
        const attrs = button[1]
        const body = button[2]
        const hasExplicitName = /(?:^|\s)(?::|v-bind:)?(?:aria-label|title|data-operation-tooltip)\s*=/.test(attrs)
        const hasTooltipHelper = /v-bind\s*=\s*"(?:commandTooltip|plainTooltip)\(/.test(attrs)
        const hasVisibleContent = Boolean(body
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim())
        if (hasExplicitName || hasTooltipHelper || hasVisibleContent) continue
        const line = source.slice(0, button.index ?? 0).split('\n').length
        missing.push(`${file}:${line}`)
      }
    })

    expect(buttonCount).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })

  it('keeps one main-app tooltip owner while preserving the Float boundary', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const floatApp = readFileSync(resolve(process.cwd(), 'src/FloatApp.vue'), 'utf8')
    const appCss = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')
    const floatCss = readFileSync(resolve(process.cwd(), 'src/styles/float.css'), 'utf8')

    expect(app.match(/<OperationTooltipLayer\b/g)).toHaveLength(1)
    expect(floatApp).not.toContain('OperationTooltipLayer')
    expect(appCss).toContain('.app-shell .codex-tip.codex-tip::after')
    expect(appCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.operation-tooltip \{[\s\S]*animation: none;/)
    expect(floatCss).toContain('.codex-tip::after')
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

  it('reads tooltip metadata from explicit operation attributes', async () => {
    document.body.innerHTML = `<main class="app-shell"><button id="codex-config" data-operation-tooltip="新会话普通模型" data-operation-description="目录默认优先，普通模型缺失时回退到可用模型。">模型策略</button></main>`
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    const button = document.querySelector<HTMLButtonElement>('#codex-config')!
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('新会话普通模型')
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('目录默认优先')
    wrapper.unmount()
  })

  it('parses shortcut chords from suppressed native titles', async () => {
    document.body.innerHTML = `<main class="app-shell"><button id="mqtt-preview" title="预览消息 (c-i)">预览</button></main>`
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    const button = document.querySelector<HTMLButtonElement>('#mqtt-preview')!
    await Promise.resolve()
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(document.querySelector('.operation-tooltip-label')?.textContent).toBe('预览消息')
    expect(document.querySelector('.operation-tooltip-shortcut')?.textContent).toBe('c-i')
    expect(document.querySelector('[role="tooltip"]')?.textContent).not.toContain('预览消息 (c-i)')
    wrapper.unmount()
  })

  it('keeps ordinary parenthetical title text as part of the label', async () => {
    document.body.innerHTML = `<main class="app-shell"><button id="readonly-location" title="查看位置 (只读)">查看</button></main>`
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    const button = document.querySelector<HTMLButtonElement>('#readonly-location')!
    await Promise.resolve()
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(document.querySelector('.operation-tooltip-label')?.textContent).toBe('查看位置 (只读)')
    expect(document.querySelector('.operation-tooltip-shortcut')).toBeNull()
    wrapper.unmount()
  })

  it('uses legacy data-tip details and refreshes active metadata changes', async () => {
    document.body.innerHTML = `<main class="app-shell"><button id="codex-tip" aria-label="模型策略" data-tip="目录默认优先">?</button></main>`
    const wrapper = mount(OperationTooltipLayer, { attachTo: document.body })
    const button = document.querySelector<HTMLButtonElement>('#codex-tip')!
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.operation-tooltip-detail')?.textContent).toBe('目录默认优先')

    button.dataset.tip = '当前会话保持原模型'
    await Promise.resolve()
    await wrapper.vm.$nextTick()
    expect(document.querySelector('.operation-tooltip-detail')?.textContent).toBe('当前会话保持原模型')
    wrapper.unmount()
  })
})
