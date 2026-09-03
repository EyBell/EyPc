'use strict'
// Generated from contracts/claude-quota-vocabulary.json. Do not edit by hand.

const CLAUDE_QUOTA_VOCABULARY_REVISION = "claude-quota-vocabulary-v1"
const CLAUDE_QUOTA_BASE_KEYS = {
  "short": "five_hour",
  "weekly": "seven_day"
}
const CLAUDE_QUOTA_KEY_ALIASES = {
  "fiveHour": "five_hour",
  "session": "five_hour",
  "sevenDay": "seven_day",
  "weekly": "seven_day",
  "weekly_all": "seven_day"
}
const CLAUDE_QUOTA_UPSTREAM_TYPES = {
  "session": "five_hour",
  "weekly_all": "seven_day",
  "weekly_scoped": "seven_day"
}
const CLAUDE_QUOTA_WINDOW_MINUTES = {
  "short": 300,
  "weekly": 10080
}
const CLAUDE_QUOTA_WINDOW_LABELS = {
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
const CLAUDE_QUOTA_KEY_PATTERN = /^(five_hour|seven_day)(?:[_-](.+))?$/

module.exports = {
  CLAUDE_QUOTA_VOCABULARY_REVISION,
  CLAUDE_QUOTA_BASE_KEYS,
  CLAUDE_QUOTA_KEY_ALIASES,
  CLAUDE_QUOTA_UPSTREAM_TYPES,
  CLAUDE_QUOTA_WINDOW_MINUTES,
  CLAUDE_QUOTA_WINDOW_LABELS,
  CLAUDE_QUOTA_KEY_PATTERN
}
