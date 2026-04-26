CREATE TABLE IF NOT EXISTS tool_state (
  cohort TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  master_json TEXT NOT NULL,
  carryout_meta_json TEXT NOT NULL DEFAULT '{"byDate":{}}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cohort TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  snap_json TEXT NOT NULL,
  UNIQUE(cohort, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_history_cohort_saved ON history_events(cohort, saved_at DESC);
