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

-- 保護者向け確認ページ（案2 Step2-1）: 世代ごとに1本の固定 shareId で直近確定分を読み取り公開する
CREATE TABLE IF NOT EXISTS published_days (
  cohort TEXT PRIMARY KEY,
  share_id TEXT NOT NULL UNIQUE,
  view_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_published_share ON published_days(share_id);
