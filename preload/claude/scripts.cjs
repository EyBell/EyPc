'use strict'

/**
 * Generated companion scripts.
 *
 * Both scripts are written into EyPc's own data directory and referenced from
 * `~/.claude/settings.json`. They are deliberately tiny, dependency-free POSIX
 * shell, and they fail open: if anything goes wrong they exit 0 without
 * blocking Claude Code.
 *
 * The `eypc-claude-companion` marker string must appear in every generated
 * script and in every settings entry, because that is how uninstall identifies
 * exactly what to remove.
 */

const { EYPC_MARKER } = require('./settings.cjs')

const HOOK_SCRIPT_NAME = 'eypc-claude-companion-hook.sh'
const STATUSLINE_SCRIPT_NAME = 'eypc-claude-companion-statusline.sh'
const QUOTA_FILE_NAME = 'eypc-claude-quota.json'
const DEFAULT_MAX_QUEUE_BYTES = 512 * 1024

function shellQuote(value) {
  return `'${String(value === undefined || value === null ? '' : value).replace(/'/g, `'\\''`)}'`
}

/**
 * The command string written into `~/.claude/settings.json`.
 *
 * Claude Code does not exec these entries directly — it hands them to a shell.
 * A bare absolute path therefore breaks the moment it contains a space, and on
 * macOS EyPc's own data directory lives under `~/Library/Application Support/`,
 * which always does: `/bin/sh` split the path and every hook failed with
 * "/Users/<name>/Library/Application: No such file or directory". Quoting here
 * is what makes the registered command runnable at all.
 *
 * This is the inverse of the chained status line in `statuslineScript`: that
 * value is a user-authored *command line* and must stay verbatim, while this
 * one is a single path we generated and must stay one word.
 */
function settingsCommandLine(filePath, platform) {
  const value = String(filePath === undefined || filePath === null ? '' : filePath)
  if (!value) return ''
  // Windows runs settings commands through cmd.exe, where single quotes are
  // literal characters rather than quoting. A double quote cannot appear in a
  // Windows path, so stripping it cannot corrupt a legitimate one.
  if ((platform || process.platform) === 'win32') return `"${value.replace(/"/g, '')}"`
  return shellQuote(value)
}

/**
 * The hook script.
 *
 * It reads the hook JSON on stdin and appends one compact record to the queue.
 *
 * Only session identity, event name, bounded subagent identity/type and one
 * allowlisted reason are read. The reason is emitted only for
 * `AskUserQuestion` and `idle_prompt`; no arbitrary tool name, prompt, tool
 * input, transcript, summary or response body reaches the queue.
 */
function hookScript(options) {
  const queuePath = shellQuote((options && options.queuePath) || '')
  const maxBytes = Number.isFinite(options && options.maxQueueBytes)
    ? Math.max(4096, Math.trunc(options.maxQueueBytes))
    : DEFAULT_MAX_QUEUE_BYTES
  return `#!/bin/sh
# ${EYPC_MARKER} — EyPc Claude companion hook bridge.
# Appends privacy-safe session events to EyPc's own queue. Never blocks Claude Code.
set -u
QUEUE=${queuePath}
INPUT=$(cat 2>/dev/null || true)
[ -n "$INPUT" ] || exit 0

# First occurrence only: splitting on commas puts each key/value on its own line
# so "head -n 1" takes the earliest match rather than the last one. The value is
# validated below regardless, so a stray nested key cannot poison the queue.
first_value() {
  printf '%s' "$INPUT" | tr ',' '\\n' | sed -n "s/.*\\"$1\\"[[:space:]]*:[[:space:]]*\\"\\([^\\"]*\\)\\".*/\\1/p" | head -n 1
}

SESSION=$(first_value session_id)
EVENT=$(first_value hook_event_name)
REASON=''
AGENT=''
AGENT_KIND=''

if [ "$EVENT" = 'PreToolUse' ]; then
  TOOL=$(first_value tool_name)
  if [ "$TOOL" = 'AskUserQuestion' ]; then REASON='ask-user-question'; fi
elif [ "$EVENT" = 'Notification' ]; then
  KIND=$(first_value notification_type)
  if [ "$KIND" = 'idle_prompt' ]; then REASON='idle-prompt'; fi
fi

RAW_AGENT=$(first_value agent_id)
RAW_AGENT_TYPE=$(first_value agent_type)
case "$RAW_AGENT" in
  '' ) : ;;
  *[!A-Za-z0-9_-]* ) : ;;
  * ) AGENT=$(printf '%s' "$RAW_AGENT" | cut -c1-128) ;;
esac
case "$RAW_AGENT_TYPE" in
  Explore|explore ) AGENT_KIND='explore' ;;
  Plan|plan ) AGENT_KIND='plan' ;;
  general|general-purpose|general_purpose ) AGENT_KIND='general' ;;
  '' ) : ;;
  * ) AGENT_KIND='other' ;;
esac

case "$SESSION" in
  '' ) exit 0 ;;
  *[!A-Za-z0-9_-]* ) exit 0 ;;
esac
case "$EVENT" in
  '' ) exit 0 ;;
  *[!A-Za-z]* ) exit 0 ;;
esac

# Self-cap the queue: the plugin truncates it while running, but the hooks stay
# registered when the plugin is closed and nothing else would bound it.
if [ -f "$QUEUE" ]; then
  SIZE=$(wc -c < "$QUEUE" 2>/dev/null | tr -d ' ')
  case "$SIZE" in
    '' ) : ;;
    *[!0-9]* ) : ;;
    * ) if [ "$SIZE" -gt ${maxBytes} ]; then : > "$QUEUE" 2>/dev/null || true; fi ;;
  esac
fi

# A CodexHost-managed harness child runs with CODEXHOST_THREAD_ID in its
# environment; stamping it links this session to its Host thread so the
# companion can defer to the Host's status instead of double-tracking.
HOSTTHREAD=''
case "\${CODEXHOST_THREAD_ID:-}" in
  '' ) : ;;
  *[!A-Za-z0-9-]* ) : ;;
  * ) HOSTTHREAD=$(printf '%s' "\$CODEXHOST_THREAD_ID" | cut -c1-64) ;;
esac

NOW=$(date +%s)
printf '{"s":"%s","e":"%s","r":"%s","a":"%s","g":"%s","t":%s000,"p":%s,"h":"%s"}\\n' "$SESSION" "$EVENT" "$REASON" "$AGENT" "$AGENT_KIND" "$NOW" "$PPID" "$HOSTTHREAD" >> "$QUEUE" 2>/dev/null || true
exit 0
`
}

/**
 * The status line script.
 *
 * Claude Code hands the session JSON — including the official `rate_limits`
 * object — to whatever status line command is configured. The companion writes
 * that object to its own cache file and then chains to the user's original
 * status line so their display is unchanged.
 */
/**
 * A chained status line is a shell *command line*, not a path: Claude Code runs
 * `statusLine.command` through a shell, so quoting it as a single word would
 * break every status line that takes arguments. It is therefore interpolated
 * verbatim — but only after rejecting anything that could add script lines of
 * its own.
 */
function safeChainedCommand(value) {
  const command = String(value === undefined || value === null ? '' : value).trim()
  if (!command) return ''
  if (/[\r\n]/.test(command)) return ''
  return command
}

function statuslineScript(options) {
  const quotaPath = shellQuote((options && options.quotaPath) || '')
  const chained = safeChainedCommand(options && options.chainedCommand)
  const chainBlock = chained
    ? `
# Chain to the status line that was configured before EyPc was installed.
printf '%s' "$INPUT" | ${chained} 2>/dev/null || true
`
    : `
# No status line was configured before EyPc; print nothing.
`
  return `#!/bin/sh
# ${EYPC_MARKER} — EyPc Claude companion status line bridge.
# Caches the official rate_limits object, then defers to any pre-existing status line.
set -u
QUOTA=${quotaPath}
INPUT=$(cat 2>/dev/null || true)

if [ -n "$INPUT" ]; then
  # Brace-balanced extraction. A regex cannot do this: rate_limits nests one
  # object per window, so a "match up to a closing brace" pattern truncates the
  # payload after the first window and produces invalid JSON.
  RATE=$(printf '%s' "$INPUT" | awk '
    { buffer = buffer $0 }
    END {
      key = index(buffer, "\\"rate_limits\\"")
      if (key == 0) exit
      rest = substr(buffer, key)
      # The value must be an object right here. Claude Code documents that rate
      # limits are absent until the first API response of a session, so a null
      # rate_limits value is ordinary after every /clear -- and searching for
      # the next brace anywhere in the payload then captured the following
      # object (usually "model") and overwrote a good cached reading with it.
      # Skip the key, the colon and any whitespace, and require an open brace.
      value = substr(rest, length("\\"rate_limits\\"") + 1)
      sub(/^[ \\t\\r\\n]*:[ \\t\\r\\n]*/, "", value)
      if (substr(value, 1, 1) != "{") exit
      opened = index(rest, "{")
      if (opened == 0) exit
      start = key + opened - 1
      depth = 0
      total = length(buffer)
      for (i = start; i <= total; i++) {
        c = substr(buffer, i, 1)
        if (c == "{") { depth++ }
        else if (c == "}") {
          depth--
          if (depth == 0) { print substr(buffer, start, i - start + 1); exit }
        }
      }
    }
  ')
  if [ -n "$RATE" ]; then
    NOW=$(date +%s)
    printf '{"version":1,"updatedAt":%s000,"rate_limits":%s}\\n' "$NOW" "$RATE" > "$QUOTA" 2>/dev/null || true
  fi
fi
${chainBlock}
exit 0
`
}

/**
 * Parses the quota cache file written by the status line script. Returns the
 * raw `rate_limits` shape so the domain layer owns normalization.
 */
function parseQuotaCache(text) {
  let parsed
  try { parsed = JSON.parse(String(text || '')) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null
  const rateLimits = parsed.rate_limits && typeof parsed.rate_limits === 'object' ? parsed.rate_limits : null
  if (!rateLimits) return null
  const updatedAt = Number(parsed.updatedAt)
  return {
    rateLimits,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0
  }
}

module.exports = {
  HOOK_SCRIPT_NAME,
  safeChainedCommand,
  STATUSLINE_SCRIPT_NAME,
  QUOTA_FILE_NAME,
  DEFAULT_MAX_QUEUE_BYTES,
  shellQuote,
  settingsCommandLine,
  hookScript,
  statuslineScript,
  parseQuotaCache
}
