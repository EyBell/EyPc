import { describe, expect, it } from 'vitest'
import {
  emptyCodexEnvironment,
  type CodexActivityDecisionDiagnostics,
  type CodexEnvironmentSnapshotV1
} from '../../src/domain/codex'
import {
  buildCodexEnvironmentPresentation,
  codexConnectionStatusLabel,
  hasStableCodexEnvironment,
  isLegacyCodexEnvironmentPending,
  shouldInlineCodexEnvironmentDetail,
  visibleCodexEnvironmentRows
} from '../../src/domain/codexEnvironmentPresentation'

const DECISIONS: CodexActivityDecisionDiagnostics = {
  liveEpochOpened: 2,
  hydrationActiveDeferred: 0,
  staleTurnDiscarded: 3,
  branchTerminalDeferred: 5,
  snapshotConflictSuppressed: 7,
  missingMappingRetained: 11,
  waitingEdgeResubscribe: 0,
  waitingEdgeRecoveryExpired: 0
}

function environment(patch: Partial<CodexEnvironmentSnapshotV1> = {}): CodexEnvironmentSnapshotV1 {
  return {
    ...emptyCodexEnvironment(),
    checking: false,
    platform: 'macos',
    runtimeState: 'detected',
    runtimeSource: 'homebrew',
    processState: 'not-running',
    configState: 'detected',
    connectionState: 'not-checked',
    desktopBridgeState: 'not-checked',
    launchMode: 'automatic',
    manualLaunchPathState: 'not-configured',
    statusFeedMode: 'desktop-live',
    checkedAt: 100,
    ...patch
  }
}

describe('Codex environment presentation', () => {
  it.each([
    ['invalid manual path', { checking: true, manualLaunchPathState: 'invalid' }, 'error', '手动 Codex CLI 位置不可用'],
    ['checking', { checking: true, checkedAt: 0 }, 'checking', '正在核查 Codex 环境'],
    ['fully connected', { connectionState: 'connected', desktopBridgeState: 'connected' }, 'ready', 'Codex 数据与桌面实时状态已就绪'],
    ['desktop bridge connecting', { connectionState: 'connected', desktopBridgeState: 'connecting' }, 'checking', 'Codex 数据已就绪，正在连接桌面实时状态'],
    ['desktop not running', { connectionState: 'connected', desktopBridgeState: 'not-running' }, 'warning', 'Codex 数据已就绪，但桌面端未运行'],
    ['desktop incompatible', { connectionState: 'connected', desktopBridgeState: 'incompatible' }, 'warning', 'Codex 数据已就绪，但桌面实时协议不兼容'],
    ['desktop failed', { connectionState: 'connected', desktopBridgeState: 'failed' }, 'warning', 'Codex 数据已就绪，但桌面实时状态不可用'],
    ['unsupported platform', { platform: 'unsupported', runtimeState: 'unsupported' }, 'error', '当前系统暂不支持自动核查'],
    ['unusable runtime', { runtimeState: 'unusable', runtimeSource: 'npm-global' }, 'error', 'Codex 启动入口存在，但运行环境不可用'],
    ['missing runtime', { runtimeState: 'missing' }, 'error', '未找到可用的 Codex 运行环境'],
    ['authentication error', { errorCode: 'not-authenticated' }, 'error', 'Codex 尚未登录或登录已失效'],
    ['timeout', { errorCode: 'timeout' }, 'warning', 'Codex 已识别，但服务响应超时'],
    ['protocol error', { errorCode: 'protocol-error' }, 'error', '当前 Codex 版本返回了不兼容的数据'],
    ['process exited', { errorCode: 'process-exited' }, 'warning', 'Codex App Server 已退出'],
    ['generic bridge error', { errorCode: 'unavailable' }, 'error', 'Codex App Server 暂时不可用'],
    ['unreadable config', { configState: 'unreadable' }, 'error', 'Codex 配置存在但无法读取'],
    ['missing config', { configState: 'missing' }, 'warning', '已找到 Codex，但未发现本地配置'],
    ['ready without connection', {}, 'ready', 'Codex 运行环境已识别']
  ] as const)('%s resolves one canonical diagnostic', (_name, patch, tone, title) => {
    const diagnostic = buildCodexEnvironmentPresentation(environment(patch), DECISIONS).diagnostic
    expect(diagnostic).toMatchObject({ tone, title })
    expect(diagnostic.role).toBe(tone === 'error' || tone === 'warning' ? 'alert' : 'status')
  })

  it('recognizes the legacy host pending shape once for both the banner and rows', () => {
    const pending = environment({
      runtimeState: 'missing',
      runtimeSource: 'unknown',
      processState: 'unknown',
      configState: 'unknown',
      connectionState: 'not-checked'
    })

    expect(isLegacyCodexEnvironmentPending(pending)).toBe(true)
    const presentation = buildCodexEnvironmentPresentation(pending, DECISIONS)
    expect(presentation.diagnostic.title).toBe('等待 Codex 连接验证')
    expect(presentation.rows.find((row) => row.label === 'Codex CLI')?.value).toBe('等待连接验证')
  })

  it('projects the diagnostic grid, decision counters and launch help without paths', () => {
    const presentation = buildCodexEnvironmentPresentation(environment({
      platform: 'windows',
      runtimeSource: 'volta',
      processState: 'running',
      configState: 'loaded',
      connectionState: 'connected',
      desktopBridgeState: 'connected',
      launchMode: 'manual',
      manualLaunchPathState: 'valid',
      launchCandidates: [{ source: 'volta', label: 'Volta', state: 'available' }]
    }), DECISIONS)

    expect(Object.fromEntries(presentation.rows.map((row) => [row.label, row.value]))).toMatchObject({
      系统: 'Windows',
      'Codex CLI': '已识别 · Volta',
      启动方式: '手动指定',
      手动位置: '已核验',
      相关进程: '发现相关进程',
      本地配置: 'App Server 已加载',
      'App Server': '已连接',
      桌面实时桥: '已连接 · 实时权威',
      状态来源: 'Codex Desktop 实时桥',
      状态裁决: '保护 26 · 周期 2'
    })
    expect(presentation.rows.find((row) => row.label === '状态裁决')?.detail).toContain('保留缺行映射 11')
    expect(presentation.launchCandidates).toEqual([{ source: 'volta', label: 'Volta', state: 'available' }])
    expect(presentation.launchHelpText).toContain('Windows 优先选择 codex.exe')
    expect(presentation.launchHelpText).not.toContain('兼容连接器降级')
    expect(visibleCodexEnvironmentRows(presentation).map((row) => row.label)).toEqual([
      'Codex CLI',
      '启动方式',
      '手动位置',
      'App Server',
      '桌面实时桥',
      '状态裁决'
    ])
    expect(shouldInlineCodexEnvironmentDetail(presentation.diagnostic.tone)).toBe(false)
  })

  it('hides healthy-noise rows on a ready automatic snapshot and inlines detail only for alerts', () => {
    const ready = buildCodexEnvironmentPresentation(environment({
      connectionState: 'connected',
      desktopBridgeState: 'connected',
      configState: 'loaded',
      processState: 'running'
    }), { ...DECISIONS, liveEpochOpened: 0, staleTurnDiscarded: 0, branchTerminalDeferred: 0, snapshotConflictSuppressed: 0, missingMappingRetained: 0 })
    expect(visibleCodexEnvironmentRows(ready).map((row) => row.label)).toEqual([
      'Codex CLI',
      'App Server',
      '桌面实时桥'
    ])
    expect(shouldInlineCodexEnvironmentDetail(ready.diagnostic.tone)).toBe(false)

    const warning = buildCodexEnvironmentPresentation(environment({
      connectionState: 'connected',
      desktopBridgeState: 'not-running'
    }), DECISIONS)
    expect(shouldInlineCodexEnvironmentDetail(warning.diagnostic.tone)).toBe(true)
    expect(visibleCodexEnvironmentRows(warning)).toHaveLength(warning.rows.length)
  })

  it('adds the fallback warning only when the desktop feed is not authoritative', () => {
    const help = buildCodexEnvironmentPresentation(environment({ statusFeedMode: 'connector-fallback' }), DECISIONS).launchHelpText
    expect(help).toContain('兼容连接器降级')
    expect(help).toContain('实时任务状态保持未知')
  })

  it('keeps a previously verified diagnostic while a silent re-inspect is in flight', () => {
    const snapshot = environment({
      checking: true,
      checkedAt: 400,
      connectionState: 'connected',
      desktopBridgeState: 'connected',
      configState: 'loaded'
    })
    const presentation = buildCodexEnvironmentPresentation(snapshot, DECISIONS)

    expect(hasStableCodexEnvironment(snapshot)).toBe(true)
    expect(presentation.busy).toBe(true)
    expect(presentation.diagnostic).toMatchObject({
      tone: 'ready',
      title: 'Codex 数据与桌面实时状态已就绪'
    })
  })

  it('still shows checking only on a cold or legacy-pending environment', () => {
    const cold = buildCodexEnvironmentPresentation(environment({ checking: true, checkedAt: 0 }), DECISIONS)
    expect(cold.busy).toBe(true)
    expect(cold.diagnostic.title).toBe('正在核查 Codex 环境')
    expect(hasStableCodexEnvironment(environment({ checking: true, checkedAt: 0 }))).toBe(false)
  })

  it('holds the last successful connection label while quota refresh is in flight', () => {
    expect(codexConnectionStatusLabel({
      refreshing: true,
      quotaStatus: 'ok',
      desktopBridgeState: 'connected',
      statusFeedMode: 'desktop-live'
    })).toBe('数据连接器与桌面实时状态已连接')
    expect(codexConnectionStatusLabel({
      refreshing: true,
      quotaStatus: 'loading',
      desktopBridgeState: 'not-checked',
      statusFeedMode: 'unavailable'
    })).toBe('正在读取 Codex App Server')
  })
})
