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

-- 交代報告機能（保護者→道具MGR）: 保護者確認画面から申請された担当交代の結果報告
CREATE TABLE IF NOT EXISTS swap_reports (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  share_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  day_label TEXT NOT NULL DEFAULT '',
  tool TEXT NOT NULL,
  from_person TEXT NOT NULL,
  to_person TEXT NOT NULL,
  reporter TEXT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reject_code TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  handled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_swap_cohort_status ON swap_reports(cohort, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_share ON swap_reports(share_id, created_at DESC);
