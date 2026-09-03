// Generated from contracts/claude-quota-vocabulary.json. Do not edit by hand.

export const CLAUDE_QUOTA_VOCABULARY_REVISION = "claude-quota-vocabulary-v1"
export const CLAUDE_QUOTA_BASE_KEYS = {
  "short": "five_hour",
  "weekly": "seven_day"
}
export const CLAUDE_QUOTA_KEY_ALIASES = {
  "fiveHour": "five_hour",
  "session": "five_hour",
  "sevenDay": "seven_day",
  "weekly": "seven_day",
  "weekly_all": "seven_day"
}
export const CLAUDE_QUOTA_UPSTREAM_TYPES = {
  "session": "five_hour",
  "weekly_all": "seven_day",
  "weekly_scoped": "seven_day"
}
export const CLAUDE_QUOTA_WINDOW_MINUTES = {
  "short": 300,
  "weekly": 10080
}
export const CLAUDE_QUOTA_WINDOW_LABELS = {
  "short": {
    "long": "5 小时限额",
    "short": "5h"
  },
  "weekly": {
    "long": "周限额",
    "short": "周"
  }
}
/** `five_hour`, `seven_day` or a scoped `five_hour_<scope>` / `seven_day-<scope>` key. */
export const CLAUDE_QUOTA_KEY_PATTERN = /^(five_hour|seven_day)(?:[_-](.+))?$/

export type ClaudeQuotaWindowFamily = keyof typeof CLAUDE_QUOTA_BASE_KEYS
