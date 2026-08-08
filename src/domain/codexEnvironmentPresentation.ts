import type {
  CodexActivityDecisionDiagnostics,
  CodexEnvironmentSnapshotV1,
  CodexLaunchCandidate,
  CodexLaunchMode,
  CodexManualLaunchPathState,
  CodexRuntimeSource,
  CodexStatusFeedMode
} from './codex'

export type CodexEnvironmentDiagnosticTone = 'checking' | 'ready' | 'warning' | 'error'

export interface CodexEnvironmentDiagnostic {
  tone: CodexEnvironmentDiagnosticTone
  role: 'status' | 'alert'
  title: string
  detail: string
}

export interface CodexEnvironmentDiagnosticRow {
  label: string
  value: string
  detail?: string
}

export interface CodexEnvironmentPresentation {
  diagnostic: CodexEnvironmentDiagnostic
  rows: CodexEnvironmentDiagnosticRow[]
  launchCandidates: CodexLaunchCandidate[]
  launchHelpText: string
}

const RUNTIME_SOURCE_LABELS: Record<CodexRuntimeSource, string> = {
  manual: '手动指定',
  configured: '指定路径',
  volta: 'Volta',
  'npm-global': 'npm 全局安装',
  local: '用户目录',
  homebrew: 'Homebrew',
  nvm: 'NVM',
  path: '系统 PATH',
  unknown: '未识别'
}

const LAUNCH_MODE_LABELS: Record<CodexLaunchMode, string> = {
  manual: '手动指定',
  automatic: '自动发现',
  'legacy-fallback': '兼容宿主',
  unknown: '未确认'
}

const MANUAL_PATH_STATE_LABELS: Record<CodexManualLaunchPathState, string> = {
  'not-configured': '未设置',
  valid: '已核验',
  invalid: '不可用',
  unavailable: '宿主不支持'
}

const STATUS_FEED_LABELS: Record<CodexStatusFeedMode, string> = {
  'desktop-live': 'Codex Desktop 实时桥',
  'connector-fallback': '兼容连接器降级',
  unavailable: '不可用'
}

export function isLegacyCodexEnvironmentPending(environment: CodexEnvironmentSnapshotV1): boolean {
  return environment.platform !== 'unsupported'
    && environment.runtimeState === 'missing'
    && environment.runtimeSource === 'unknown'
    && environment.processState === 'unknown'
    && environment.configState === 'unknown'
    && environment.connectionState === 'not-checked'
}

function diagnosticFor(environment: CodexEnvironmentSnapshotV1): Omit<CodexEnvironmentDiagnostic, 'role'> {
  if (environment.manualLaunchPathState === 'invalid') {
    return { tone: 'error', title: '手动 Codex CLI 位置不可用', detail: '请改为可执行文件本身，或恢复自动发现。为保护隐私，已保存的位置不会在此页面回显。' }
  }
  if (environment.checking) {
    return { tone: 'checking', title: '正在核查 Codex 环境', detail: '正在识别系统、Codex 运行环境、相关进程与本地配置。' }
  }
  if (environment.connectionState === 'connected' && environment.desktopBridgeState === 'connected') {
    return { tone: 'ready', title: 'Codex 数据与桌面实时状态已就绪', detail: 'App Server 提供额度、模型与任务清单；桌面实时桥提供 Input、正在进行中和完成未读状态。' }
  }
  if (environment.connectionState === 'connected' && ['connecting', 'not-checked'].includes(environment.desktopBridgeState)) {
    return { tone: 'checking', title: 'Codex 数据已就绪，正在连接桌面实时状态', detail: '额度、模型与任务清单可用；Input、正在进行中和完成未读状态将在桌面桥连接后发布。' }
  }
  if (environment.connectionState === 'connected' && environment.desktopBridgeState === 'not-running') {
    return { tone: 'warning', title: 'Codex 数据已就绪，但桌面端未运行', detail: '不会使用 EyPc 缓存推断 Input 或进行中；启动 Codex 桌面端后会自动重连。' }
  }
  if (environment.connectionState === 'connected' && environment.desktopBridgeState === 'incompatible') {
    return { tone: 'warning', title: 'Codex 数据已就绪，但桌面实时协议不兼容', detail: '实时桥已安全停用；Input、正在进行中和完成未读不会降级为本地缓存推断。' }
  }
  if (environment.connectionState === 'connected') {
    return { tone: 'warning', title: 'Codex 数据已就绪，但桌面实时状态不可用', detail: '额度、模型与任务清单仍可用；实时细分暂不可用，未确认任务保持“进行中”。' }
  }
  if (environment.platform === 'unsupported') {
    return { tone: 'error', title: '当前系统暂不支持自动核查', detail: 'Codex Companion 的自动核查目前支持 macOS 与 Windows。' }
  }
  if (isLegacyCodexEnvironmentPending(environment)) {
    return { tone: 'checking', title: '等待 Codex 连接验证', detail: '当前宿主使用兼容核查；连接成功后会自动确认 CLI、配置与 App Server 状态。' }
  }
  if (environment.runtimeState === 'unusable' || (environment.runtimeState === 'detected' && environment.errorCode === 'runtime-unavailable')) {
    return { tone: 'error', title: 'Codex 启动入口存在，但运行环境不可用', detail: '请更新或重新安装 Codex CLI；Windows npm 入口还需要可验证的 Node 与 Codex 程序文件。完成后重新检测。' }
  }
  if (environment.runtimeState !== 'detected') {
    return {
      tone: 'error',
      title: '未找到可用的 Codex 运行环境',
      detail: environment.platform === 'windows'
        ? '请安装或更新 Codex CLI；支持 npm 全局目录、Volta、NVM、原生 codex.exe 与系统 PATH。安装后点击“重新检测”。'
        : '请安装或更新 Codex CLI；支持 Homebrew、NVM、Volta、用户目录与系统 PATH。安装后点击“重新检测”。'
    }
  }
  if (environment.errorCode === 'not-authenticated') return { tone: 'error', title: 'Codex 尚未登录或登录已失效', detail: '请先在 Codex App 或 CLI 完成登录，再点击“重新检测”。' }
  if (environment.errorCode === 'timeout') return { tone: 'warning', title: 'Codex 已识别，但服务响应超时', detail: '请检查网络或代理状态；上次成功额度会继续保留，恢复后可重新检测。' }
  if (environment.errorCode === 'protocol-error') return { tone: 'error', title: '当前 Codex 版本返回了不兼容的数据', detail: '请更新 Codex App 或 CLI，然后重新检测。' }
  if (environment.errorCode === 'process-exited') return { tone: 'warning', title: 'Codex App Server 已退出', detail: 'EyPc 不会强制结束或接管其他进程；点击“重新检测”会建立新的只读连接。' }
  if (environment.errorCode) return { tone: 'error', title: 'Codex App Server 暂时不可用', detail: '请确认 Codex 可正常启动，然后点击“重新检测”。' }
  if (environment.configState === 'unreadable') return { tone: 'error', title: 'Codex 配置存在但无法读取', detail: '请检查当前用户对 Codex 配置的读取权限，然后重新检测。' }
  if (environment.configState === 'missing') return { tone: 'warning', title: '已找到 Codex，但未发现本地配置', detail: '请先启动 Codex App 或 CLI 完成首次配置与登录，再点击“重新检测”。' }
  return { tone: 'ready', title: 'Codex 运行环境已识别', detail: '当前未建立 App Server 连接；进入本页或显示悬浮球时会自动建立只读连接。' }
}

function rowsFor(
  environment: CodexEnvironmentSnapshotV1,
  decisions: CodexActivityDecisionDiagnostics
): CodexEnvironmentDiagnosticRow[] {
  const connected = environment.connectionState === 'connected'
  const legacyPending = isLegacyCodexEnvironmentPending(environment)
  const platform = environment.platform === 'macos' ? 'macOS' : environment.platform === 'windows' ? 'Windows' : connected ? '桌面宿主已连接' : '不支持'
  const runtime = connected && environment.runtimeSource === 'unknown'
    ? '已识别 · 兼容宿主'
    : legacyPending
      ? '等待连接验证'
      : environment.runtimeState === 'detected'
        ? `已识别 · ${RUNTIME_SOURCE_LABELS[environment.runtimeSource]}`
        : environment.runtimeState === 'unusable'
          ? `入口不可用 · ${RUNTIME_SOURCE_LABELS[environment.runtimeSource]}`
          : environment.runtimeState === 'missing' ? '未找到' : '不支持'
  const process = environment.processState === 'running' ? '发现相关进程' : environment.processState === 'not-running' ? '未发现 · 不影响按需启动' : '无法判断 · 不阻断使用'
  const config = environment.configState === 'loaded' ? 'App Server 已加载' : environment.configState === 'detected' ? '已发现配置文件' : environment.configState === 'missing' ? '未发现' : environment.configState === 'unreadable' ? '无法读取' : '未核查'
  const connection = environment.connectionState === 'connected' ? '已连接' : environment.connectionState === 'failed' ? '连接失败' : '按需连接'
  const desktopBridge = environment.desktopBridgeState === 'connected'
    ? '已连接 · 实时权威'
    : environment.desktopBridgeState === 'connecting'
      ? '正在连接'
      : environment.desktopBridgeState === 'not-running'
        ? 'Codex 桌面端未运行'
        : environment.desktopBridgeState === 'incompatible'
          ? '协议不兼容 · 已安全停用'
          : environment.desktopBridgeState === 'failed'
            ? '连接失败 · 状态不推断'
            : '未核查'
  const protectionCount = Math.min(Number.MAX_SAFE_INTEGER, decisions.staleTurnDiscarded
    + decisions.branchTerminalDeferred
    + decisions.snapshotConflictSuppressed
    + decisions.missingMappingRetained)
  const decisionDetail = `开启新周期 ${decisions.liveEpochOpened}；丢弃旧读 ${decisions.staleTurnDiscarded}；延后分支终态 ${decisions.branchTerminalDeferred}；抑制冲突快照 ${decisions.snapshotConflictSuppressed}；保留缺行映射 ${decisions.missingMappingRetained}`
  return [
    { label: '系统', value: platform },
    { label: 'Codex CLI', value: runtime },
    { label: '启动方式', value: LAUNCH_MODE_LABELS[environment.launchMode || 'unknown'] },
    { label: '手动位置', value: MANUAL_PATH_STATE_LABELS[environment.manualLaunchPathState || 'unavailable'] },
    { label: '相关进程', value: process },
    { label: '本地配置', value: config },
    { label: 'App Server', value: connection },
    { label: '桌面实时桥', value: desktopBridge },
    { label: '状态来源', value: STATUS_FEED_LABELS[environment.statusFeedMode || 'unavailable'] },
    { label: '状态裁决', value: `保护 ${protectionCount} · 周期 ${decisions.liveEpochOpened}`, detail: decisionDetail }
  ]
}

function launchHelpTextFor(environment: CodexEnvironmentSnapshotV1): string {
  const platformGuide = environment.platform === 'windows'
    ? 'Windows 优先选择 codex.exe；自动核查会检查 Volta、npm、NVM、用户目录与系统 PATH。'
    : 'macOS 自动核查会检查 Homebrew、Volta、NVM、用户目录与系统 PATH。'
  const fallbackGuide = environment.statusFeedMode !== 'desktop-live'
    ? ' 当前为兼容连接器降级：额度与库存仍可用，实时任务状态保持未知，直到桌面实时桥连接。'
    : ''
  return `手动位置只保存在本机插件存储，页面不会回显完整路径；未设置时使用自动发现。${platformGuide}${fallbackGuide}`
}

export function buildCodexEnvironmentPresentation(
  environment: CodexEnvironmentSnapshotV1,
  decisions: CodexActivityDecisionDiagnostics
): CodexEnvironmentPresentation {
  const diagnostic = diagnosticFor(environment)
  return {
    diagnostic: {
      ...diagnostic,
      role: diagnostic.tone === 'error' || diagnostic.tone === 'warning' ? 'alert' : 'status'
    },
    rows: rowsFor(environment, decisions),
    launchCandidates: environment.launchCandidates || [],
    launchHelpText: launchHelpTextFor(environment)
  }
}
