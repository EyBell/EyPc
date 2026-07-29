import { marked } from 'marked'
import type { AppTabId } from '../domain/types'

marked.setOptions({
  gfm: true,
  breaks: false
})

/** Escape HTML so first-party Markdown cannot inject raw tags. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const renderer = new marked.Renderer()
const baseLink = renderer.link.bind(renderer)
renderer.html = ({ text }) => escapeHtml(text)
renderer.link = (token) => {
  const href = String(token.href || '')
  if (!/^(https?:|mailto:)/i.test(href)) {
    return escapeHtml(token.text || href)
  }
  return baseLink(token)
}

export function renderFeatureHelpMarkdown(markdown: string): string {
  const source = String(markdown || '').trim()
  if (!source) return ''
  return marked.parse(source, { renderer, async: false }) as string
}
