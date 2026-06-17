import type { AppTabId, KeybindingOverride, ShortcutProfileId, ShortcutProfileMap } from '../../domain/types'

export type KeybindingLayerId =
  | 'confirm'
  | 'settings-shortcut-record'
  | 'settings-when-edit'
  | 'port-group-editor'
  | 'port-drawer'
  | 'port-detail'
  | 'ports-selection'
  | 'ports-search'
  | 'favorites-search'
  | 'settings'
  | 'ports'
  | 'favorites'
  | 'global'

export interface KeybindingContext {
  tab?: AppTabId
  confirmOpen?: boolean
  textInputFocused?: boolean
  activeInputRole?: 'port-search' | 'port-group-search' | 'favorite-search' | 'settings' | 'port-group-editor' | 'other'
  portPane?: 'groups' | 'results'
  portDrawerOpen?: boolean
  portDrawerActive?: boolean
  portDetailOpen?: boolean
  portDetailActive?: boolean
  portSelectionMode?: boolean
  activeLayers?: KeybindingLayerId[]
}

export interface KeybindingDefinition {
  actionId: string
  shortcutId: string
  defaultShortcutId: string
  defaultShortcutIds?: string[]
  when: string
  defaultWhen?: string
  source: 'system' | 'user' | 'removed'
  weight: number
  layer: KeybindingLayerId
  group?: string
  title?: string
  description?: string
  risk?: 'normal' | 'data-write' | 'destructive'
  order?: number
  internal?: boolean
  disabled?: boolean
  profileId?: ShortcutProfileId
}

export interface ShortcutCommandRow {
  commandId: string
  title: string
  group: string
  layer: KeybindingLayerId
  layerLabel: string
  risk: 'normal' | 'data-write' | 'destructive'
  shortcutIds: string[]
  defaultShortcutIds: string[]
  when: string
  defaultWhen: string
  source: 'system' | 'user' | 'removed'
  sourceLabel: string
  enabled: boolean
  profileId: ShortcutProfileId
  conflicts: ShortcutConflict[]
  reservationConflicts: ShortcutReservationRule[]
  bindings: KeybindingDefinition[]
}

export interface ShortcutConflict {
  commandId: string
  title: string
  shortcutId: string
  when: string
  layer: KeybindingLayerId
}

export interface ShortcutReservationRule {
  shortcutId: string
  commandId: string
  when: string
  description: string
  layer: KeybindingLayerId
}

interface ShortcutCommandProfile {
  actionId: string
  title: string
  group: string
  layer: KeybindingLayerId
  shortcutIds: string[]
  when: string
  weight: number
  risk?: 'normal' | 'data-write' | 'destructive'
  description?: string
  internal?: boolean
  profileId?: ShortcutProfileId
}

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift']
const MODIFIER_ALIASES: Record<string, string> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  cmd: 'Ctrl',
  command: 'Ctrl',
  meta: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift'
}
const KEY_ALIASES: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  space: 'Space',
  spacebar: 'Space',
  tab: 'Tab',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
  pageup: 'PageUp',
  pgup: 'PageUp',
  pagedown: 'PageDown',
  pgdn: 'PageDown',
  delete: 'Delete',
  del: 'Delete',
  backspace: 'Backspace'
}

export const LAYER_PRIORITY: Record<KeybindingLayerId, number> = {
  confirm: 1000,
  'settings-shortcut-record': 960,
  'settings-when-edit': 950,
  'port-group-editor': 930,
  'port-drawer': 820,
  'port-detail': 800,
  'ports-selection': 700,
  'ports-search': 680,
  'favorites-search': 680,
  settings: 500,
  ports: 500,
  favorites: 500,
  global: 100
}

const LAYER_LABELS: Record<KeybindingLayerId, string> = {
  confirm: '确认层',
  'settings-shortcut-record': '快捷键录制',
  'settings-when-edit': 'When 编辑',
  'port-group-editor': '端口组编辑',
  'port-drawer': '端口动作抽屉',
  'port-detail': '端口详情',
  'ports-selection': '端口多选',
  'ports-search': '端口搜索',
  'favorites-search': '收藏搜索',
  settings: '设置',
  ports: '端口',
  favorites: '收藏',
  global: '全局'
}

const SOURCE_WEIGHT = {
  user: 300,
  system: 100,
  removed: 0
}

const DEFAULT_COMMAND_PROFILES: ShortcutCommandProfile[] = [
  { actionId: 'app.escape.idle', title: 'Esc 空闲消费', group: '全局', layer: 'global', shortcutIds: ['Escape'], when: '', weight: 1, internal: true },
  { actionId: 'confirm.cancel', title: '关闭确认弹窗', group: '全局', layer: 'confirm', shortcutIds: ['Escape'], when: 'confirmOpen', weight: 400 },
  { actionId: 'tab.next', title: '下一个主 Tab', group: '全局', layer: 'global', shortcutIds: ['Tab'], when: "tab != 'ports' && !textInputFocused", weight: 100 },
  { actionId: 'tab.prev', title: '上一个主 Tab', group: '全局', layer: 'global', shortcutIds: ['Shift+Tab'], when: "tab != 'ports' && !textInputFocused", weight: 100 },
  { actionId: 'tab.select.ports', title: '切到端口进程', group: '全局', layer: 'global', shortcutIds: ['Ctrl+1'], when: '!textInputFocused', weight: 100 },
  { actionId: 'tab.select.favorites', title: '切到文件收藏', group: '全局', layer: 'global', shortcutIds: ['Ctrl+2'], when: '!textInputFocused', weight: 100 },
  { actionId: 'tab.select.settings', title: '切到设置', group: '全局', layer: 'global', shortcutIds: ['Ctrl+3'], when: '!textInputFocused', weight: 100 },
  { actionId: 'search.focus', title: '聚焦搜索', group: '全局', layer: 'global', shortcutIds: ['Ctrl+F'], when: '!confirmOpen', weight: 100 },
  { actionId: 'settings.open', title: '打开设置', group: '全局', layer: 'global', shortcutIds: ['Ctrl+Alt+Shift+S'], when: '!confirmOpen', weight: 100 },
  { actionId: 'list.up', title: '列表上移', group: '全局', layer: 'global', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: '!textInputFocused || activeInputRole == "port-search" || activeInputRole == "port-group-search"', weight: 100 },
  { actionId: 'list.down', title: '列表下移', group: '全局', layer: 'global', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: '!textInputFocused || activeInputRole == "port-search" || activeInputRole == "port-group-search"', weight: 100 },
  { actionId: 'list.pageUp', title: '列表上翻页', group: '全局', layer: 'global', shortcutIds: ['Alt+U'], when: '!textInputFocused', weight: 100 },
  { actionId: 'list.pageDown', title: '列表下翻页', group: '全局', layer: 'global', shortcutIds: ['Alt+E'], when: '!textInputFocused', weight: 100 },
  { actionId: 'list.toggleSelection', title: '切换选择', group: '全局', layer: 'global', shortcutIds: ['Space'], when: '!textInputFocused || activeInputRole == "port-search"', weight: 100 },
  { actionId: 'ports.workspace.reset', title: '重置端口工作区', group: '端口', layer: 'ports', shortcutIds: ['Escape'], when: "tab == 'ports'", weight: 90 },
  { actionId: 'ports.selection.clear', title: '清空端口多选', group: '端口', layer: 'ports-selection', shortcutIds: ['Escape'], when: "tab == 'ports' && portSelectionMode", weight: 300 },
  { actionId: 'ports.kill.confirm', title: '终止选中进程', group: '端口', layer: 'ports', shortcutIds: ['Enter'], when: "tab == 'ports' && portPane != 'groups' && (!textInputFocused || activeInputRole == 'port-search')", weight: 120, risk: 'data-write' },
  { actionId: 'ports.kill.force', title: '强杀选中进程', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Enter'], when: "tab == 'ports' && portPane != 'groups' && (!textInputFocused || activeInputRole == 'port-search')", weight: 120, risk: 'destructive' },
  { actionId: 'ports.scan', title: '刷新端口', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+R'], when: "tab == 'ports'", weight: 100 },
  { actionId: 'ports.pane.toggleNext', title: '切换端口栏', group: '端口', layer: 'ports', shortcutIds: ['Tab'], when: "tab == 'ports' && !textInputFocused", weight: 130 },
  { actionId: 'ports.pane.togglePrev', title: '反向切换端口栏', group: '端口', layer: 'ports', shortcutIds: ['Shift+Tab'], when: "tab == 'ports' && !textInputFocused", weight: 130 },
  { actionId: 'ports.pane.groups', title: '聚焦端口组栏', group: '端口', layer: 'ports', shortcutIds: ['Alt+ArrowLeft'], when: "tab == 'ports' && !textInputFocused", weight: 110 },
  { actionId: 'ports.pane.results', title: '聚焦端口结果栏', group: '端口', layer: 'ports', shortcutIds: ['Alt+ArrowRight'], when: "tab == 'ports' && !textInputFocused", weight: 110 },
  { actionId: 'ports.group.edit.cancel', title: '取消端口组编辑', group: '端口', layer: 'port-group-editor', shortcutIds: ['Escape'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400 },
  { actionId: 'ports.group.save', title: '保存端口组编辑', group: '端口', layer: 'port-group-editor', shortcutIds: ['Ctrl+S'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400, risk: 'data-write' },
  { actionId: 'ports.group.edit.nextField', title: '编辑层下一个字段', group: '端口', layer: 'port-group-editor', shortcutIds: ['Tab'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400 },
  { actionId: 'ports.group.edit.prevField', title: '编辑层上一个字段', group: '端口', layer: 'port-group-editor', shortcutIds: ['Shift+Tab'], when: "tab == 'ports' && activeInputRole == 'port-group-editor'", weight: 400 },
  { actionId: 'ports.group.apply', title: '应用端口组过滤', group: '端口', layer: 'ports', shortcutIds: ['Enter'], when: "tab == 'ports' && portPane == 'groups' && (!textInputFocused || activeInputRole == 'port-group-search')", weight: 130 },
  { actionId: 'ports.group.kill.confirm', title: '终止当前端口组', group: '端口', layer: 'ports', shortcutIds: ['Shift+Enter'], when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", weight: 130, risk: 'data-write' },
  { actionId: 'ports.group.kill.force', title: '强杀当前端口组', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+Shift+Enter'], when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", weight: 130, risk: 'destructive' },
  { actionId: 'ports.group.rename', title: '重命名端口组', group: '端口', layer: 'ports', shortcutIds: ['Shift+F2'], when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", weight: 130, risk: 'data-write' },
  { actionId: 'ports.group.edit', title: '编辑端口组', group: '端口', layer: 'ports', shortcutIds: ['F2', 'Ctrl+E'], when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", weight: 130, risk: 'data-write' },
  { actionId: 'ports.group.delete', title: '删除端口组', group: '端口', layer: 'ports', shortcutIds: ['Delete'], when: "tab == 'ports' && portPane == 'groups' && !textInputFocused", weight: 130, risk: 'data-write' },
  { actionId: 'ports.group.createFromSelection', title: '选中端口收藏为组', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+G'], when: "tab == 'ports' && !textInputFocused", weight: 120, risk: 'data-write' },
  { actionId: 'ports.drawer.open', title: '打开端口动作抽屉', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+ArrowRight'], when: "tab == 'ports' && !confirmOpen && !portDrawerActive && (!textInputFocused || activeInputRole == 'port-search')", weight: 130 },
  { actionId: 'ports.drawer.close', title: '关闭端口动作抽屉', group: '端口', layer: 'port-drawer', shortcutIds: ['ArrowLeft', 'Ctrl+ArrowLeft', 'Escape'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  { actionId: 'ports.detail.open', title: '打开端口详情抽屉', group: '端口', layer: 'ports', shortcutIds: ['Ctrl+ArrowLeft'], when: "tab == 'ports' && portPane != 'groups' && !confirmOpen && !portDrawerActive && !portDetailActive && (!textInputFocused || activeInputRole == 'port-search')", weight: 130 },
  { actionId: 'ports.detail.close', title: '关闭端口详情抽屉', group: '端口', layer: 'port-detail', shortcutIds: ['ArrowRight', 'Escape'], when: "tab == 'ports' && portDetailActive", weight: 400 },
  { actionId: 'ports.drawer.next', title: '抽屉内下移', group: '端口', layer: 'port-drawer', shortcutIds: ['ArrowDown', 'Ctrl+J'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  { actionId: 'ports.drawer.prev', title: '抽屉内上移', group: '端口', layer: 'port-drawer', shortcutIds: ['ArrowUp', 'Ctrl+K'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  { actionId: 'ports.drawer.select', title: '执行抽屉当前动作', group: '端口', layer: 'port-drawer', shortcutIds: ['Enter'], when: "tab == 'ports' && portDrawerActive", weight: 400 },
  { actionId: 'favorites.open', title: '打开收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Enter'], when: "tab == 'favorites' && !textInputFocused", weight: 120 },
  { actionId: 'favorites.reveal', title: '定位收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+Enter'], when: "tab == 'favorites' && !textInputFocused", weight: 120 },
  { actionId: 'favorites.edit', title: '编辑收藏', group: '收藏', layer: 'favorites', shortcutIds: ['F2'], when: "tab == 'favorites' && !textInputFocused", weight: 120, risk: 'data-write' },
  { actionId: 'favorites.rename', title: '重命名收藏', group: '收藏', layer: 'favorites', shortcutIds: ['Shift+F2'], when: "tab == 'favorites' && !textInputFocused", weight: 120, risk: 'data-write' },
  { actionId: 'favorites.save', title: '保存收藏编辑', group: '收藏', layer: 'favorites', shortcutIds: ['Ctrl+S'], when: "tab == 'favorites' && activeInputRole == 'other'", weight: 120, risk: 'data-write' },
  { actionId: 'favorites.cancel', title: '取消收藏编辑', group: '收藏', layer: 'favorites', shortcutIds: ['Escape'], when: "tab == 'favorites' && activeInputRole == 'other'", weight: 120 }
]

for (let index = 1; index <= 9; index += 1) {
  DEFAULT_COMMAND_PROFILES.push(
    { actionId: `ports.drawer.select.${index}`, title: `执行抽屉第 ${index} 个动作`, group: '端口', layer: 'port-drawer', shortcutIds: [`Ctrl+${index}`], when: "tab == 'ports' && portDrawerActive", weight: 400 },
    { actionId: `ports.drawer.action.${index}`, title: `直接执行第 ${index} 个端口动作`, group: '端口', layer: 'ports', shortcutIds: [`Ctrl+Alt+${index}`], when: "tab == 'ports' && !portDrawerActive && !textInputFocused", weight: 130 }
  )
}

export const SHORTCUT_RESERVATION_RULES: ShortcutReservationRule[] = [
  { shortcutId: 'Escape', commandId: 'confirm.cancel', when: 'confirmOpen', description: '关闭确认弹窗，不穿透到底层', layer: 'confirm' },
  { shortcutId: 'Escape', commandId: 'ports.group.edit.cancel', when: "activeInputRole == 'port-group-editor'", description: '取消端口组编辑', layer: 'port-group-editor' },
  { shortcutId: 'Ctrl+S', commandId: 'ports.group.save', when: "activeInputRole == 'port-group-editor'", description: '保存端口组编辑', layer: 'port-group-editor' },
  { shortcutId: 'Tab', commandId: 'ports.group.edit.nextField', when: "activeInputRole == 'port-group-editor'", description: '编辑层内字段循环，不切换底层 pane', layer: 'port-group-editor' },
  { shortcutId: 'Shift+Tab', commandId: 'ports.group.edit.prevField', when: "activeInputRole == 'port-group-editor'", description: '编辑层内反向字段循环，不切换底层 pane', layer: 'port-group-editor' },
  { shortcutId: 'Escape', commandId: 'ports.drawer.close', when: 'portDrawerActive', description: '关闭端口动作抽屉', layer: 'port-drawer' },
  { shortcutId: 'Escape', commandId: 'ports.detail.close', when: 'portDetailActive', description: '关闭端口详情抽屉', layer: 'port-detail' },
  { shortcutId: 'Escape', commandId: 'ports.selection.clear', when: 'portSelectionMode', description: '清空端口多选', layer: 'ports-selection' },
  { shortcutId: 'Escape', commandId: 'app.escape.idle', when: '', description: '空闲时消费 Esc，避免退出插件', layer: 'global' },
  { shortcutId: 'Tab', commandId: 'ports.pane.toggleNext', when: "tab == 'ports' && !textInputFocused", description: '端口页切换左右栏', layer: 'ports' },
  { shortcutId: 'Shift+Tab', commandId: 'ports.pane.togglePrev', when: "tab == 'ports' && !textInputFocused", description: '端口页反向切换左右栏', layer: 'ports' },
  { shortcutId: 'Enter', commandId: 'ports.drawer.select', when: 'portDrawerActive', description: '执行抽屉当前动作', layer: 'port-drawer' },
  { shortcutId: 'Space', commandId: 'list.toggleSelection', when: "tab == 'ports'", description: '端口列表多选', layer: 'ports' }
]

function normalizeKeyToken(value: string): string {
  const lower = value.toLowerCase()
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower]
  if (/^f\d{1,2}$/i.test(value)) return value.toUpperCase()
  return value.length === 1 ? value.toUpperCase() : value
}

export function normalizeShortcutId(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw === '*') return '*'
  const separator = raw.includes('+') ? '+' : '-'
  const parts = raw.split(separator).map((part) => part.trim()).filter(Boolean)
  const modifiers = new Set<string>()
  let key = ''
  for (const part of parts) {
    const lower = part.toLowerCase()
    const modifier = MODIFIER_ALIASES[lower]
    if (modifier) modifiers.add(modifier)
    else key = normalizeKeyToken(part)
  }
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key].filter(Boolean).join('+')
}

type WhenNode =
  | { type: 'literal'; value: boolean | string }
  | { type: 'identifier'; name: string }
  | { type: 'not'; expr: WhenNode }
  | { type: 'and' | 'or' | 'compare'; op?: '==' | '!='; left: WhenNode; right: WhenNode }

const TOKEN_PATTERN = /\s*(&&|\|\||==|!=|!|\(|\)|true\b|false\b|'[^']*'|"[^"]*"|[A-Za-z_][A-Za-z0-9_.-]*)\s*/gy

function tokenizeWhen(input: string): string[] {
  const source = String(input || '').trim()
  if (!source) return []
  const tokens: string[] = []
  let index = 0
  while (index < source.length) {
    TOKEN_PATTERN.lastIndex = index
    const match = TOKEN_PATTERN.exec(source)
    if (!match || match.index !== index) throw new SyntaxError(`Unexpected token near "${source.slice(index)}"`)
    tokens.push(match[1])
    index = TOKEN_PATTERN.lastIndex
  }
  return tokens
}

export function parseWhenExpression(input: string): WhenNode {
  const tokens = tokenizeWhen(input)
  let index = 0
  const peek = () => tokens[index]
  const consume = (expected?: string) => {
    const token = tokens[index]
    if (expected && token !== expected) throw new SyntaxError(`Expected "${expected}" but found "${token || 'end'}"`)
    index += 1
    return token
  }
  const primary = (): WhenNode => {
    const token = peek()
    if (!token) throw new SyntaxError('Unexpected end of when expression')
    if (token === '(') {
      consume('(')
      const node = or()
      consume(')')
      return node
    }
    if (token === 'true' || token === 'false') {
      consume()
      return { type: 'literal', value: token === 'true' }
    }
    if (token.startsWith("'") || token.startsWith('"')) {
      consume()
      return { type: 'literal', value: token.slice(1, -1) }
    }
    consume()
    return { type: 'identifier', name: token }
  }
  const unary = (): WhenNode => peek() === '!' ? (consume('!'), { type: 'not', expr: unary() }) : primary()
  const compare = (): WhenNode => {
    let left = unary()
    while (peek() === '==' || peek() === '!=') {
      const op = consume() as '==' | '!='
      left = { type: 'compare', op, left, right: unary() }
    }
    return left
  }
  const and = (): WhenNode => {
    let left = compare()
    while (peek() === '&&') {
      consume('&&')
      left = { type: 'and', left, right: compare() }
    }
    return left
  }
  const or = (): WhenNode => {
    let left = and()
    while (peek() === '||') {
      consume('||')
      left = { type: 'or', left, right: and() }
    }
    return left
  }
  const ast = or()
  if (index < tokens.length) throw new SyntaxError(`Unexpected token "${peek()}"`)
  return ast
}

function valueOf(node: WhenNode, context: KeybindingContext): unknown {
  switch (node.type) {
    case 'literal': return node.value
    case 'identifier': return context[node.name as keyof KeybindingContext] ?? false
    case 'not': return !Boolean(valueOf(node.expr, context))
    case 'and': return Boolean(valueOf(node.left, context)) && Boolean(valueOf(node.right, context))
    case 'or': return Boolean(valueOf(node.left, context)) || Boolean(valueOf(node.right, context))
    case 'compare': {
      const left = valueOf(node.left, context)
      const right = valueOf(node.right, context)
      return node.op === '==' ? left === right : left !== right
    }
  }
}

export function evaluateWhenExpression(when: string, context: KeybindingContext): boolean {
  if (!when.trim()) return true
  return Boolean(valueOf(parseWhenExpression(when), context))
}

interface LiteralSet {
  positive: Set<string>
  negative: Set<string>
  equals: Map<string, Set<string>>
  notEquals: Map<string, Set<string>>
}

function emptyLiteralSet(): LiteralSet {
  return { positive: new Set(), negative: new Set(), equals: new Map(), notEquals: new Map() }
}

function cloneLiteralSet(set: LiteralSet): LiteralSet {
  return {
    positive: new Set(set.positive),
    negative: new Set(set.negative),
    equals: new Map([...set.equals.entries()].map(([key, values]) => [key, new Set(values)])),
    notEquals: new Map([...set.notEquals.entries()].map(([key, values]) => [key, new Set(values)]))
  }
}

function addMapSet(map: Map<string, Set<string>>, key: string, value: string) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key)!.add(value)
}

function mergeLiteralSets(left: LiteralSet, right: LiteralSet): LiteralSet {
  const merged = cloneLiteralSet(left)
  right.positive.forEach((item) => merged.positive.add(item))
  right.negative.forEach((item) => merged.negative.add(item))
  right.equals.forEach((values, key) => values.forEach((value) => addMapSet(merged.equals, key, value)))
  right.notEquals.forEach((values, key) => values.forEach((value) => addMapSet(merged.notEquals, key, value)))
  return merged
}

function literalSetsForNode(node: WhenNode | null): LiteralSet[] {
  if (!node) return [emptyLiteralSet()]
  if (node.type === 'and') return literalSetsForNode(node.left).flatMap((left) => literalSetsForNode(node.right).map((right) => mergeLiteralSets(left, right)))
  if (node.type === 'or') return [...literalSetsForNode(node.left), ...literalSetsForNode(node.right)]
  if (node.type === 'identifier') {
    const set = emptyLiteralSet()
    set.positive.add(node.name)
    return [set]
  }
  if (node.type === 'not' && node.expr.type === 'identifier') {
    const set = emptyLiteralSet()
    set.negative.add(node.expr.name)
    return [set]
  }
  if (node.type === 'compare' && node.left.type === 'identifier' && node.right.type === 'literal' && typeof node.right.value === 'string') {
    const set = emptyLiteralSet()
    addMapSet(node.op === '==' ? set.equals : set.notEquals, node.left.name, node.right.value)
    return [set]
  }
  return [emptyLiteralSet()]
}

export function getWhenLiteralSets(when: string): LiteralSet[] {
  if (!when.trim()) return [emptyLiteralSet()]
  return literalSetsForNode(parseWhenExpression(when))
}

function setsContradict(left: LiteralSet, right: LiteralSet): boolean {
  for (const item of left.positive) if (left.negative.has(item) || right.negative.has(item)) return true
  for (const item of right.positive) if (right.negative.has(item) || left.negative.has(item)) return true
  for (const [key, leftValues] of left.equals.entries()) {
    const rightValues = right.equals.get(key)
    if (rightValues && ![...leftValues].some((value) => rightValues.has(value))) return true
  }
  for (const [key, values] of left.equals.entries()) {
    const rightNot = right.notEquals.get(key)
    if (rightNot && [...values].every((value) => rightNot.has(value))) return true
  }
  for (const [key, values] of right.equals.entries()) {
    const leftNot = left.notEquals.get(key)
    if (leftNot && [...values].every((value) => leftNot.has(value))) return true
  }
  return false
}

export function canWhenClausesOverlap(leftWhen: string, rightWhen: string): boolean {
  const leftSets = getWhenLiteralSets(leftWhen)
  const rightSets = getWhenLiteralSets(rightWhen)
  return leftSets.some((left) => rightSets.some((right) => !setsContradict(left, right)))
}

function activeLayers(context: KeybindingContext): KeybindingLayerId[] {
  if (context.activeLayers?.length) return [...new Set<KeybindingLayerId>([...context.activeLayers, 'global'])]
  const layers: KeybindingLayerId[] = ['global']
  if (context.tab) layers.push(context.tab)
  if (context.confirmOpen) layers.push('confirm')
  if (context.activeInputRole === 'port-group-editor') layers.push('port-group-editor')
  if (context.portDetailOpen || context.portDetailActive) layers.push('port-detail')
  if (context.portDrawerOpen || context.portDrawerActive) layers.push('port-drawer')
  if (context.portSelectionMode) layers.push('ports-selection')
  if (context.activeInputRole === 'port-search' || context.activeInputRole === 'port-group-search') layers.push('ports-search')
  if (context.activeInputRole === 'favorite-search') layers.push('favorites-search')
  return [...new Set(layers)]
}

function contextWithLayerFlags(context: KeybindingContext): KeybindingContext {
  const next = { ...context }
  for (const layer of activeLayers(context)) {
    ;(next as Record<string, unknown>)[layer.replace(/-/g, '_')] = true
  }
  return next
}

function shouldBlockTextInputShortcut(shortcutId: string, context: KeybindingContext): boolean {
  if (!context.textInputFocused || shortcutId === 'Escape') return false
  if (context.activeInputRole === 'port-group-editor') return !['Ctrl+S', 'Tab', 'Shift+Tab'].includes(shortcutId)
  if (context.activeInputRole === 'port-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Space', 'Enter', 'Ctrl+Enter', 'Ctrl+ArrowLeft', 'Ctrl+ArrowRight'].includes(shortcutId)
  if (context.activeInputRole === 'port-group-search') return !['ArrowUp', 'ArrowDown', 'Ctrl+K', 'Ctrl+J', 'Enter'].includes(shortcutId)
  return true
}

function profileIdForCommand(commandId: string): ShortcutProfileId {
  if (commandId.startsWith('ports.')) return 'ports'
  if (commandId.startsWith('favorites.')) return 'favorites'
  if (commandId.startsWith('settings.')) return 'settings'
  return 'global'
}

function makeBindings(profiles: ShortcutCommandProfile[]): KeybindingDefinition[] {
  return profiles.flatMap((profile, profileIndex) => profile.shortcutIds.map((shortcutId, shortcutIndex) => ({
    actionId: profile.actionId,
    shortcutId: normalizeShortcutId(shortcutId),
    defaultShortcutId: normalizeShortcutId(profile.shortcutIds[0] || shortcutId),
    defaultShortcutIds: profile.shortcutIds.map(normalizeShortcutId),
    when: profile.when,
    defaultWhen: profile.when,
    source: 'system' as const,
    weight: profile.weight,
    layer: profile.layer,
    group: profile.group,
    title: profile.title,
    description: profile.description,
    risk: profile.risk || 'normal',
    internal: profile.internal,
    profileId: profile.profileId || profileIdForCommand(profile.actionId),
    order: profileIndex * 100 + shortcutIndex
  })))
}

export const DEFAULT_KEYBINDINGS: KeybindingDefinition[] = makeBindings(DEFAULT_COMMAND_PROFILES)

function defaultBindingsFor(commandId: string): KeybindingDefinition[] {
  return DEFAULT_KEYBINDINGS.filter((item) => item.actionId === commandId)
}

function flattenOverrides(input: KeybindingOverride[] | ShortcutProfileMap = []): Array<KeybindingOverride & { profileId?: ShortcutProfileId }> {
  if (Array.isArray(input)) return input
  return (['global', 'ports', 'favorites', 'settings'] as ShortcutProfileId[]).flatMap((profileId) =>
    (input[profileId]?.keybindingOverrides || []).map((override) => ({ ...override, profileId }))
  )
}

export function buildEffectiveKeybindings(overrides: KeybindingOverride[] | ShortcutProfileMap = []): KeybindingDefinition[] {
  const disabledCommands = new Set<string>()
  const userBindings: KeybindingDefinition[] = []
  for (const override of flattenOverrides(overrides)) {
    const defaults = defaultBindingsFor(override.commandId)
    if (!defaults.length) continue
    disabledCommands.add(override.commandId)
    const overrideShortcutValues = override.shortcutIds?.length ? override.shortcutIds : override.shortcutId ? [override.shortcutId] : []
    const shortcutIds = overrideShortcutValues.map(normalizeShortcutId).filter(Boolean)
    const enabled = override.enabled !== false && override.disabled !== true && override.source !== 'removed'
    if (!enabled) {
      userBindings.push({
        ...defaults[0],
        shortcutId: shortcutIds[0] || defaults[0].shortcutId,
        when: override.when || defaults[0].when,
        source: 'removed',
        weight: override.weight || 300,
        disabled: true,
        profileId: override.profileId || defaults[0].profileId || profileIdForCommand(override.commandId)
      })
      continue
    }
    for (const shortcutId of shortcutIds) {
      userBindings.push({
        ...defaults[0],
        shortcutId,
        defaultShortcutId: defaults[0].defaultShortcutId,
        defaultShortcutIds: defaults[0].defaultShortcutIds,
        when: override.when || defaults[0].when,
        source: 'user',
        weight: override.weight || 300,
        disabled: false,
        profileId: override.profileId || defaults[0].profileId || profileIdForCommand(override.commandId)
      })
    }
  }
  return [...DEFAULT_KEYBINDINGS.map((item) => ({ ...item, disabled: disabledCommands.has(item.actionId) ? true : item.disabled })), ...userBindings]
}

function whenSpecificity(when: string): number {
  try {
    return getWhenLiteralSets(when).reduce((max, set) => Math.max(max, set.positive.size + set.negative.size + set.equals.size + set.notEquals.size), 0)
  } catch {
    return 0
  }
}

function score(binding: KeybindingDefinition, context: KeybindingContext): number {
  const layerScore = activeLayers(context).includes(binding.layer) ? LAYER_PRIORITY[binding.layer] * 10000 : -1000000
  return layerScore + SOURCE_WEIGHT[binding.source] * 100 + binding.weight + whenSpecificity(binding.when) - (binding.order || 0) / 10000
}

function sortedCandidates(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext): KeybindingDefinition[] {
  const normalized = normalizeShortcutId(shortcutId)
  const resolvedContext = contextWithLayerFlags(context)
  if (shouldBlockTextInputShortcut(normalized, resolvedContext)) return []
  const layers = activeLayers(resolvedContext)
  return bindings
    .filter((item) => layers.includes(item.layer))
    .filter((item) => item.shortcutId === normalized || item.shortcutId === '*')
    .filter((item) => {
      try {
        return evaluateWhenExpression(item.when, resolvedContext)
      } catch {
        return false
      }
    })
    .sort((a, b) => score(b, resolvedContext) - score(a, resolvedContext))
}

export function resolveKeybinding(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext): KeybindingDefinition | null {
  const winner = sortedCandidates(bindings, shortcutId, context)[0]
  return winner && !winner.disabled && winner.source !== 'removed' ? winner : null
}

export function previewKeybindingResolution(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext) {
  const candidates = sortedCandidates(bindings, shortcutId, context)
  const winner = candidates.find((item) => !item.disabled && item.source !== 'removed') || null
  return {
    key: normalizeShortcutId(shortcutId),
    winner,
    candidates,
    activeLayers: activeLayers(context).sort((a, b) => LAYER_PRIORITY[b] - LAYER_PRIORITY[a])
  }
}

export function getShortcutReservationConflicts(shortcutId: string, options: { commandId?: string; when?: string } = {}): ShortcutReservationRule[] {
  const normalized = normalizeShortcutId(shortcutId)
  const optionIdentifiers = new Set((options.when || '').match(/[A-Za-z_][A-Za-z0-9_.-]*/g) || [])
  return SHORTCUT_RESERVATION_RULES
    .filter((rule) => normalizeShortcutId(rule.shortcutId) === normalized)
    .filter((rule) => rule.commandId !== options.commandId)
    .filter((rule) => canWhenClausesOverlap(options.when || '', rule.when))
    .sort((a, b) => {
      const aScore = (a.when.match(/[A-Za-z_][A-Za-z0-9_.-]*/g) || []).filter((item) => optionIdentifiers.has(item)).length
      const bScore = (b.when.match(/[A-Za-z_][A-Za-z0-9_.-]*/g) || []).filter((item) => optionIdentifiers.has(item)).length
      return bScore - aScore || LAYER_PRIORITY[b.layer] - LAYER_PRIORITY[a.layer]
    })
}

export function detectShortcutConflicts(row: ShortcutCommandRow, rows: ShortcutCommandRow[]): ShortcutConflict[] {
  const conflicts: ShortcutConflict[] = []
  for (const other of rows) {
    if (other.commandId === row.commandId || !other.enabled) continue
    for (const shortcutId of row.shortcutIds) {
      if (!other.shortcutIds.includes(shortcutId)) continue
      if (other.layer !== row.layer && LAYER_PRIORITY[other.layer] !== LAYER_PRIORITY[row.layer]) continue
      if (!canWhenClausesOverlap(row.when, other.when)) continue
      conflicts.push({ commandId: other.commandId, title: other.title, shortcutId, when: other.when, layer: other.layer })
    }
  }
  return conflicts
}

export function buildShortcutCommandRows(bindings: KeybindingDefinition[]): ShortcutCommandRow[] {
  const groups = new Map<string, KeybindingDefinition[]>()
  for (const binding of bindings) {
    if (binding.internal) continue
    if (!groups.has(binding.actionId)) groups.set(binding.actionId, [])
    groups.get(binding.actionId)!.push(binding)
  }
  const rows = [...groups.entries()].map(([commandId, commandBindings]) => {
    const active = commandBindings.filter((item) => !item.disabled && item.source !== 'removed')
    const first = commandBindings[0]
    const shortcutIds = [...new Set(active.map((item) => item.shortcutId))]
    const defaultShortcutIds = [...new Set((first.defaultShortcutIds?.length ? first.defaultShortcutIds : [first.defaultShortcutId]).filter(Boolean))]
    const when = active[0]?.when || first.when
    const source = commandBindings.some((item) => item.source === 'removed') && !active.length ? 'removed' : active.some((item) => item.source === 'user') ? 'user' : 'system'
    const row: ShortcutCommandRow = {
      commandId,
      title: first.title || commandId,
      group: first.group || '未分组',
      layer: first.layer,
      layerLabel: LAYER_LABELS[first.layer],
      risk: first.risk || 'normal',
      shortcutIds,
      defaultShortcutIds,
      when,
      defaultWhen: first.defaultWhen || first.when,
      source,
      sourceLabel: source === 'removed' ? '已禁用' : source === 'user' ? '用户' : '系统',
      enabled: source !== 'removed' && shortcutIds.length > 0,
      profileId: first.profileId || profileIdForCommand(commandId),
      conflicts: [],
      reservationConflicts: [],
      bindings: commandBindings
    }
    row.reservationConflicts = row.shortcutIds.flatMap((shortcutId) => getShortcutReservationConflicts(shortcutId, { commandId, when: row.when }))
    return row
  }).sort((a, b) => a.group.localeCompare(b.group) || a.commandId.localeCompare(b.commandId))
  for (const row of rows) row.conflicts = detectShortcutConflicts(row, rows)
  return rows
}

export function explainKeybinding(bindings: KeybindingDefinition[], shortcutId: string, context: KeybindingContext) {
  const preview = previewKeybindingResolution(bindings, shortcutId, context)
  if (preview.candidates[0]?.disabled || preview.candidates[0]?.source === 'removed') {
    return { key: preview.key, winner: null, level: 'blocked' as const, reason: '用户禁用了该快捷键', candidates: preview.candidates }
  }
  return {
    key: preview.key,
    winner: preview.winner?.actionId ?? null,
    level: preview.winner ? (preview.winner.source === 'user' ? 'override' as const : 'ok' as const) : 'unmatched' as const,
    reason: preview.winner ? (preview.winner.source === 'user' ? '用户快捷键覆盖默认绑定' : '默认快捷键生效') : '未匹配快捷键',
    candidates: preview.candidates
  }
}
