-- 出欠・活動（Phase 1）
-- 適用例:
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_attendance.sql

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

-- 相互影響の検知用（他アプリ向けの「要確認」イベント）
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
