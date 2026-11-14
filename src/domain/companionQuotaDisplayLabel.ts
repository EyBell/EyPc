export const COMPANION_QUOTA_DISPLAY_LABEL_MAX = 258

export function companionQuotaDisplayLabel(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at !== email.indexOf('@')) return ''
  const local = [...email.slice(0, at)].slice(0, 4).join('')
  let domain = email.slice(at + 1)
  if (domain.toLowerCase().endsWith('.com')) domain = domain.slice(0, -4)
  if (!local || !domain || domain.includes('@') || /\s/.test(domain)) return ''
  const label = `${local}@${domain}`
  return [...label].length <= COMPANION_QUOTA_DISPLAY_LABEL_MAX ? label : ''
}

export function acceptCompanionQuotaDisplayLabel(value: string): string {
  const label = value.trim()
  if (!label || [...label].length > COMPANION_QUOTA_DISPLAY_LABEL_MAX || /\s/.test(label)) return ''
  const at = label.indexOf('@')
  if (at < 0) return [...label].length <= 4 ? label : ''
  if (at === 0 || label.indexOf('@', at + 1) >= 0) return ''
  const local = label.slice(0, at)
  const domain = label.slice(at + 1)
  if ([...local].length > 4 || !domain || domain.toLowerCase().endsWith('.com')) return ''
  return label
}
