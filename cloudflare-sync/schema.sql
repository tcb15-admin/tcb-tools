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

-- Web Push 購読（道具MGRのみ）: 新着交代報告のプッシュ通知
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_cohort ON push_subscriptions(cohort);

-- 出欠・活動（Phase 1）
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'practice',
  title TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  share_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  responses_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_cohort_date
  ON activities(cohort, activity_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_share
  ON activities(share_id);

CREATE TABLE IF NOT EXISTS attendance_responses (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  cohort TEXT NOT NULL,
  member_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unset',
  comment TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(activity_id, member_name)
);

CREATE INDEX IF NOT EXISTS idx_att_resp_activity
  ON attendance_responses(activity_id);

CREATE INDEX IF NOT EXISTS idx_att_resp_cohort
  ON attendance_responses(cohort, updated_at DESC);

CREATE TABLE IF NOT EXISTS cross_role_events (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  source_role TEXT NOT NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cross_role_cohort
  ON cross_role_events(cohort, created_at DESC);
