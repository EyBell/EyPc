import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Regression suite for the defects an adversarial review found in the first
 * cut of the Claude bridge. Every case here reproduces a real failure the
 * earlier implementation exhibited, so these tests are the guard rail rather
 * than a restatement of the happy path.
 */

const require_ = createRequire(import.meta.url)
const bridgeModule = require_(resolve(process.cwd(), 'preload/claude/index.cjs'))
const scripts = require_(resolve(process.cwd(), 'preload/claude/scripts.cjs'))
const environmentModule = require_(resolve(process.cwd(), 'preload/claude/environment.cjs'))

function makeHome() {
  const root = mkdtempSync(join(tmpdir(), 'eypc-claude-safety-'))
  const claudeHome = join(root, '.claude')
  const dataDirectory = join(root, 'data')
  mkdirSync(join(claudeHome, 'projects'), { recursive: true })
  mkdirSync(dataDirectory, { recursive: true })
  return { root, claudeHome, dataDirectory, settingsPath: join(claudeHome, 'settings.json') }
}

function makeBridge(home: ReturnType<typeof makeHome>, overrides: Record<string, unknown> = {}) {
  return bridgeModule.createClaudeBridge({
    fs,
    path,
    os: { homedir: () => home.root },
    claudeHome: home.claudeHome,
    dataDirectory: home.dataDirectory,
    platform: 'darwin',
    env: { PATH: '' },
    ...overrides
  })
}

function runScript(source: string, input: string, file: string): void {
  writeFileSync(file, source)
  chmodSync(file, 0o755)
  execFileSync('/bin/sh', [file], { input, encoding: 'utf8' })
}

describe('settings file is never destroyed', () => {
  it('refuses to write over a settings file it could not parse', () => {
    const home = makeHome()
    // A hand-edited trailing comma is the realistic version of this.
    const malformed = '{\n  "model": "opus",\n  "permissions": { "allow": [] },\n}'
    writeFileSync(home.settingsPath, malformed)
    const bridge = makeBridge(home)

    const installed = bridge.install()
    expect(installed.ok).toBe(false)
    expect(installed.message).toContain('settings.json')
    expect(readFileSync(home.settingsPath, 'utf8')).toBe(malformed)

    const uninstalled = bridge.uninstall()
    expect(uninstalled.ok).toBe(false)
    expect(readFileSync(home.settingsPath, 'utf8')).toBe(malformed)
  })

  it('refuses to write when the top level is not an object', () => {
    const home = makeHome()
    writeFileSync(home.settingsPath, '["not", "an", "object"]')
    expect(makeBridge(home).install().ok).toBe(false)
    expect(readFileSync(home.settingsPath, 'utf8')).toBe('["not", "an", "object"]')
  })

  it('still installs cleanly when the file is simply absent or empty', () => {
    const home = makeHome()
    expect(makeBridge(home).install().ok).toBe(true)
    const other = makeHome()
    writeFileSync(other.settingsPath, '   \n')
    expect(makeBridge(other).install().ok).toBe(true)
  })

  it('keeps a one-generation backup of what it replaced', () => {
    const home = makeHome()
    const original = JSON.stringify({ model: 'opus', env: { A: '1' } }, null, 2)
    writeFileSync(home.settingsPath, original)
    makeBridge(home).install()
    expect(readFileSync(`${home.settingsPath}.eypc-bak`, 'utf8')).toBe(original)
  })

  it('preserves every unrelated setting through an install/uninstall round trip', () => {
    const home = makeHome()
    const original = {
      model: 'opus',
      env: { EXAMPLE: '1' },
      permissions: { allow: ['Bash'] },
      mcpServers: { demo: { command: 'x' } },
      statusLine: { type: 'command', command: '/user/line.sh' },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '/user/guard.sh' }] }] }
    }
    writeFileSync(home.settingsPath, JSON.stringify(original, null, 2))
    const bridge = makeBridge(home)
    expect(bridge.install().ok).toBe(true)
    expect(bridge.uninstall().ok).toBe(true)
    expect(JSON.parse(readFileSync(home.settingsPath, 'utf8'))).toEqual(original)
  })

  it('distinguishes absent, empty, unparseable and present', () => {
    const home = makeHome()
    expect(environmentModule.readSettingsFile(fs, home.settingsPath).state).toBe('absent')
    writeFileSync(home.settingsPath, '')
    expect(environmentModule.readSettingsFile(fs, home.settingsPath).state).toBe('absent')
    writeFileSync(home.settingsPath, '{oops')
    expect(environmentModule.readSettingsFile(fs, home.settingsPath).state).toBe('unparseable')
    writeFileSync(home.settingsPath, '{"a":1}')
    expect(environmentModule.readSettingsFile(fs, home.settingsPath)).toMatchObject({ state: 'present', value: { a: 1 } })
  })
})

describe('status line wrapper', () => {
  it('extracts a two-window rate_limits object as valid JSON', () => {
    const home = makeHome()
    const quotaPath = join(home.dataDirectory, 'quota.json')
    const payload = JSON.stringify({
      model: { id: 'claude-opus-5' },
      rate_limits: {
        five_hour: { used_percentage: 23.5, resets_at: 1_738_425_600 },
        seven_day: { used_percentage: 41.2, resets_at: 1_738_857_600 }
      },
      cost: { total_cost_usd: 1.5 }
    })
    runScript(scripts.statuslineScript({ quotaPath }), payload, join(home.dataDirectory, 'line.sh'))
    const parsed = scripts.parseQuotaCache(readFileSync(quotaPath, 'utf8'))
    expect(parsed).not.toBeNull()
    expect(parsed.rateLimits.five_hour.used_percentage).toBe(23.5)
    expect(parsed.rateLimits.seven_day.used_percentage).toBe(41.2)
    expect(parsed.rateLimits.seven_day.resets_at).toBe(1_738_857_600)
  })

  it('handles a single-window payload and a payload with no rate limits', () => {
    const home = makeHome()
    const quotaPath = join(home.dataDirectory, 'quota.json')
    const script = join(home.dataDirectory, 'line.sh')
    runScript(scripts.statuslineScript({ quotaPath }), JSON.stringify({ rate_limits: { five_hour: { used_percentage: 5 } } }), script)
    expect(scripts.parseQuotaCache(readFileSync(quotaPath, 'utf8')).rateLimits.five_hour.used_percentage).toBe(5)
    // A payload without rate_limits must leave the previous cache untouched
    // rather than clobbering it with an empty object.
    runScript(scripts.statuslineScript({ quotaPath }), JSON.stringify({ model: { id: 'x' } }), script)
    expect(scripts.parseQuotaCache(readFileSync(quotaPath, 'utf8')).rateLimits.five_hour.used_percentage).toBe(5)
  })

  it('never wires itself into its own chain across repeated installs', () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    bridge.install()
    bridge.install()
    bridge.install()
    const source = readFileSync(bridge.statuslineCommandPath, 'utf8')
    expect(source.includes(scripts.STATUSLINE_SCRIPT_NAME)).toBe(false)
  })

  it('chains to the user status line exactly once and restores it on uninstall', () => {
    const home = makeHome()
    writeFileSync(home.settingsPath, JSON.stringify({ statusLine: { type: 'command', command: '/user/line.sh' } }, null, 2))
    const bridge = makeBridge(home)
    bridge.install()
    bridge.install()
    const source = readFileSync(bridge.statuslineCommandPath, 'utf8')
    expect(source.split('/user/line.sh').length - 1).toBe(1)
    expect(source.includes(scripts.STATUSLINE_SCRIPT_NAME)).toBe(false)
    bridge.uninstall()
    expect(JSON.parse(readFileSync(home.settingsPath, 'utf8')).statusLine.command).toBe('/user/line.sh')
  })

  it('interpolates a chained command verbatim so its arguments survive', () => {
    // Claude Code runs statusLine.command through a shell, so quoting it as a
    // single word would break every status line that takes arguments.
    const source = scripts.statuslineScript({ quotaPath: '/q', chainedCommand: `jq -r '.model.display_name'` })
    expect(source).toContain(`jq -r '.model.display_name'`)
  })

  it('refuses a chained command that could add script lines of its own', () => {
    expect(scripts.safeChainedCommand('/user/line.sh\nrm -rf /')).toBe('')
    expect(scripts.safeChainedCommand('/user/line.sh\r echo hi')).toBe('')
    expect(scripts.safeChainedCommand('  /user/line.sh  ')).toBe('/user/line.sh')
    const source = scripts.statuslineScript({ quotaPath: '/q', chainedCommand: '/user/line.sh\nrm -rf /' })
    expect(source).not.toContain('rm -rf')
    expect(source).toContain('print nothing')
  })
})

describe('hook script privacy', () => {
  it('does not read a path out of nested tool input', () => {
    const home = makeHome()
    const queuePath = join(home.dataDirectory, 'events.jsonl')
    writeFileSync(queuePath, '')
    const payload = JSON.stringify({
      session_id: 'sess-1',
      transcript_path: '/home/u/.claude/projects/x/sess-1.jsonl',
      cwd: '/home/u/proj',
      hook_event_name: 'PreToolUse',
      tool_input: { command: 'ls', cwd: '/private/secret/customer-data' }
    })
    runScript(scripts.hookScript({ queuePath }), payload, join(home.dataDirectory, 'hook.sh'))
    const written = readFileSync(queuePath, 'utf8')
    expect(written).not.toContain('secret')
    expect(written).not.toContain('/home/u/proj')
    expect(written).not.toContain('.jsonl')
    expect(JSON.parse(written.trim())).toMatchObject({ s: 'sess-1', e: 'PreToolUse' })
  })

  it('drops an event whose session id is not a plain identifier', () => {
    const home = makeHome()
    const queuePath = join(home.dataDirectory, 'events.jsonl')
    writeFileSync(queuePath, '')
    const script = join(home.dataDirectory, 'hook.sh')
    runScript(scripts.hookScript({ queuePath }), JSON.stringify({ session_id: '../../etc/passwd', hook_event_name: 'Stop' }), script)
    runScript(scripts.hookScript({ queuePath }), JSON.stringify({ hook_event_name: 'Stop' }), script)
    expect(readFileSync(queuePath, 'utf8').trim()).toBe('')
  })

  it('self-caps the queue so it cannot grow without bound while the plugin is closed', () => {
    const home = makeHome()
    const queuePath = join(home.dataDirectory, 'events.jsonl')
    writeFileSync(queuePath, 'x'.repeat(20_000))
    runScript(
      scripts.hookScript({ queuePath, maxQueueBytes: 4096 }),
      JSON.stringify({ session_id: 'sess-1', hook_event_name: 'Stop' }),
      join(home.dataDirectory, 'hook.sh')
    )
    const written = readFileSync(queuePath, 'utf8')
    expect(written.length).toBeLessThan(200)
    expect(JSON.parse(written.trim()).s).toBe('sess-1')
  })

  it('survives a payload with no usable fields without writing anything', () => {
    const home = makeHome()
    const queuePath = join(home.dataDirectory, 'events.jsonl')
    writeFileSync(queuePath, '')
    runScript(scripts.hookScript({ queuePath }), 'not json at all', join(home.dataDirectory, 'hook.sh'))
    expect(readFileSync(queuePath, 'utf8')).toBe('')
  })
})

describe('inventory cost', () => {
  it('does not open transcripts that fall outside the window', () => {
    const home = makeHome()
    const directory = join(home.claudeHome, 'projects', '-w-app')
    mkdirSync(directory, { recursive: true })
    const stale = join(directory, 'old.jsonl')
    writeFileSync(stale, `${JSON.stringify({ type: 'user', timestamp: '2020-01-01T00:00:00.000Z' })}\n`)
    const ancient = Date.now() - 40 * 24 * 3_600_000
    fs.utimesSync(stale, ancient / 1000, ancient / 1000)

    const opened: string[] = []
    const bridge = makeBridge(home, {
      fs: new Proxy(fs, {
        get(target, key) {
          if (key === 'openSync') {
            return (file: string, ...rest: unknown[]) => {
              opened.push(String(file))
              return (target.openSync as (...args: unknown[]) => number)(file, ...rest)
            }
          }
          return Reflect.get(target, key)
        }
      })
    })
    expect(bridge.readSnapshot({ now: Date.now() }).sessions).toHaveLength(0)
    expect(opened).toEqual([])
  })

  it('still reads a transcript whose mtime is unknown', () => {
    const home = makeHome()
    const directory = join(home.claudeHome, 'projects', '-w-app')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'fresh.jsonl'), `${JSON.stringify({ type: 'user', sessionId: 'fresh', cwd: '/w/app', timestamp: new Date().toISOString() })}\n`)
    expect(makeBridge(home).readSnapshot({ now: Date.now() }).sessions).toHaveLength(1)
  })
})

describe('generated scripts stay recoverable', () => {
  it('leaves nothing outside EyPc data directory after uninstall', () => {
    const home = makeHome()
    const bridge = makeBridge(home)
    bridge.install()
    bridge.uninstall()
    expect(JSON.parse(readFileSync(home.settingsPath, 'utf8'))).toEqual({})
    // Scripts remain in EyPc's own directory; nothing was written into the
    // user's Claude tree other than settings.json itself.
    expect(existsSync(bridge.hookCommandPath)).toBe(true)
    expect(bridge.hookCommandPath.startsWith(home.dataDirectory)).toBe(true)
  })
})

describe('a data directory containing a space stays executable', () => {
  /**
   * The real failure: uTools stores plugin data under
   * `~/Library/Application Support/uTools/…`, and the registered command was a
   * bare path. Claude Code hands `hooks[*].hooks[*].command` and
   * `statusLine.command` to a shell, so every hook died with
   * `/bin/sh: /Users/<name>/Library/Application: No such file or directory` —
   * which silently cost live task state and, because the status line never ran,
   * the quota cache was never written at all.
   */
  function makeSpacedHome() {
    const root = mkdtempSync(join(tmpdir(), 'eypc-claude-space-'))
    const claudeHome = join(root, '.claude')
    const dataDirectory = join(root, 'Application Support', 'uTools', 'claude-companion')
    mkdirSync(join(claudeHome, 'projects'), { recursive: true })
    mkdirSync(dataDirectory, { recursive: true })
    return { root, claudeHome, dataDirectory, settingsPath: join(claudeHome, 'settings.json') }
  }

  it('registers a quoted command line while writing the script at the raw path', () => {
    const home = makeSpacedHome()
    const bridge = makeBridge(home)
    expect(bridge.install().ok).toBe(true)

    const settings = JSON.parse(readFileSync(home.settingsPath, 'utf8'))
    const registered = settings.hooks.SessionStart[0].hooks[0].command
    expect(registered).not.toBe(bridge.hookCommandPath)
    expect(registered).toContain('Application Support')
    expect(settings.statusLine.command).toBe(bridge.statuslineCommandLine)
    expect(existsSync(bridge.hookCommandPath)).toBe(true)
  })

  it('the registered command actually runs under /bin/sh', () => {
    const home = makeSpacedHome()
    const bridge = makeBridge(home)
    bridge.install()
    const settings = JSON.parse(readFileSync(home.settingsPath, 'utf8'))

    // Exactly how Claude Code invokes it. Before the fix this threw with
    // "No such file or directory".
    execFileSync('/bin/sh', ['-c', settings.hooks.SessionStart[0].hooks[0].command], {
      input: JSON.stringify({ session_id: 'spaced-1', hook_event_name: 'SessionStart' }),
      encoding: 'utf8'
    })
    execFileSync('/bin/sh', ['-c', settings.statusLine.command], {
      input: JSON.stringify({ rate_limits: { five_hour: { used_percentage: 40 }, seven_day: { used_percentage: 10 } } }),
      encoding: 'utf8'
    })

    // Both sides of the bridge produced real data, which is the only proof that
    // matters: the hook event reached the queue and the quota cache exists.
    expect(bridge.readSnapshot({ now: Date.now() })).toBeTruthy()
    const quota = bridge.readQuota()
    expect(quota).not.toBeNull()
    expect(quota.rateLimits.five_hour.used_percentage).toBe(40)
  })

  it('reports installed rather than outdated, so the page stops asking to register', () => {
    const home = makeSpacedHome()
    const bridge = makeBridge(home)
    bridge.install()
    expect(bridge.inspect().hooks).toBe('installed')
    expect(bridge.inspect().statusline).toBe('installed')
  })

  it('converges an installation left behind by the unquoted release', () => {
    const home = makeSpacedHome()
    const bridge = makeBridge(home)
    // What the previous version wrote: the bare path, which cannot run.
    writeFileSync(home.settingsPath, JSON.stringify({
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: bridge.hookCommandPath, timeout: 5 }] }] },
      statusLine: { type: 'command', command: bridge.statuslineCommandPath }
    }, null, 2))

    // It must read back as stale rather than as a working installation.
    expect(bridge.inspect().hooks).toBe('outdated')

    bridge.install()
    const settings = JSON.parse(readFileSync(home.settingsPath, 'utf8'))
    expect(settings.hooks.SessionStart).toHaveLength(1)
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe(bridge.hookCommandLine)
    expect(bridge.inspect().hooks).toBe('installed')
    // The broken entry must not be mistaken for a user status line and chained.
    expect(readFileSync(bridge.statuslineCommandPath, 'utf8')).not.toContain(scripts.STATUSLINE_SCRIPT_NAME)
  })

  it('quotes for cmd.exe on Windows instead of using POSIX quoting', () => {
    expect(scripts.settingsCommandLine('C:\\Users\\a b\\hook.cmd', 'win32')).toBe('"C:\\Users\\a b\\hook.cmd"')
    expect(scripts.settingsCommandLine('/Users/a b/hook.sh', 'darwin')).toBe(`'/Users/a b/hook.sh'`)
    expect(scripts.settingsCommandLine(`/Users/o'brien/hook.sh`, 'darwin')).toBe(`'/Users/o'\\''brien/hook.sh'`)
    expect(scripts.settingsCommandLine('', 'darwin')).toBe('')
  })
})
