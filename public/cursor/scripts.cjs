'use strict'

/**
 * Generated Cursor companion hook script.
 *
 * Written into EyPc's own data directory and referenced from
 * `~/.cursor/hooks.json` with a quoted absolute path. POSIX, dependency-free,
 * fail-open (`exit 0`). Never assumes jq/python3/node.
 */

const { EYPC_MARKER } = require('./settings.cjs')

const HOOK_SCRIPT_NAME = 'eypc-cursor-companion-hook.sh'
const DEFAULT_MAX_QUEUE_BYTES = 512 * 1024

function shellQuote(value) {
  return `'${String(value === undefined || value === null ? '' : value).replace(/'/g, `'\\''`)}'`
}

function settingsCommandLine(filePath, platform) {
  const value = String(filePath === undefined || filePath === null ? '' : filePath)
  if (!value) return ''
  if ((platform || process.platform) === 'win32') return `"${value.replace(/"/g, '')}"`
  return shellQuote(value)
}

/**
 * Reads stdin JSON with sed only. Allowlisted keys:
 * conversation_id, session_id, hook_event_name, composer_mode, status, reason.
 * Never copies transcript_path, user_email, tool_input, agent_message, prompt.
 */
function hookScript(options) {
  const queuePath = shellQuote((options && options.queuePath) || '')
  const maxBytes = Number.isFinite(options && options.maxQueueBytes)
    ? Math.max(4096, Math.trunc(options.maxQueueBytes))
    : DEFAULT_MAX_QUEUE_BYTES
  return `#!/bin/sh
# ${EYPC_MARKER} — EyPc Cursor companion hook bridge.
# Appends privacy-safe Agent events to EyPc's own queue. Never blocks Cursor.
set -u
QUEUE=${queuePath}
INPUT=$(dd bs=1024 count=32 2>/dev/null || true)
[ -n "$INPUT" ] || exit 0

first_value() {
  printf '%s' "$INPUT" | tr ',' '\\n' | sed -n "s/.*\\"$1\\"[[:space:]]*:[[:space:]]*\\"\\([^\\"]*\\)\\".*/\\1/p" | head -n 1
}

CONVERSATION=$(first_value conversation_id)
SESSION=$(first_value session_id)
EVENT=$(first_value hook_event_name)
MODE=$(first_value composer_mode)
STATUS=$(first_value status)
REASON=$(first_value reason)

ID="$CONVERSATION"
[ -n "$ID" ] || ID="$SESSION"

case "$MODE" in
  ask|edit ) exit 0 ;;
esac

case "$ID" in
  '' ) exit 0 ;;
  *[!A-Za-z0-9_-]* ) exit 0 ;;
esac
case "$EVENT" in
  '' ) exit 0 ;;
  *[!A-Za-z]* ) exit 0 ;;
esac
case "$MODE" in
  ''|agent ) : ;;
  *[!A-Za-z]* ) MODE='' ;;
esac

EXTRA=''
if [ "$EVENT" = 'stop' ]; then
  case "$STATUS" in
    completed|aborted|error ) EXTRA="$STATUS" ;;
  esac
elif [ "$EVENT" = 'sessionEnd' ]; then
  case "$REASON" in
    '' ) : ;;
    *[!A-Za-z0-9_-]* ) : ;;
    * ) EXTRA=$(printf '%s' "$REASON" | cut -c1-40) ;;
  esac
fi

if [ -f "$QUEUE" ]; then
  SIZE=$(wc -c < "$QUEUE" 2>/dev/null | tr -d ' ')
  case "$SIZE" in
    '' ) : ;;
    *[!0-9]* ) : ;;
    * ) if [ "$SIZE" -gt ${maxBytes} ]; then : > "$QUEUE" 2>/dev/null || true; fi ;;
  esac
fi

NOW=$(date +%s)
printf '{"s":"%s","e":"%s","m":"%s","r":"%s","t":%s000,"p":%s}\\n' "$ID" "$EVENT" "$MODE" "$EXTRA" "$NOW" "$PPID" >> "$QUEUE" 2>/dev/null || true
exit 0
`
}

module.exports = {
  HOOK_SCRIPT_NAME,
  DEFAULT_MAX_QUEUE_BYTES,
  settingsCommandLine,
  hookScript
}
