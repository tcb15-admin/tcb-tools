-- 配車 Phase2
-- 適用例:
--   cd /Users/kazuhiko/Applications/tcb-tools/cloudflare-sync
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_carpool.sql
--
-- 行データは rows_json に配列で保持（手組み編集が主）。
-- status: draft | submitted | approved | published | returned

CREATE TABLE IF NOT EXISTS carpool_sheets (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  activity_date TEXT NOT NULL DEFAULT '',
  from_place TEXT NOT NULL DEFAULT '',
  to_place TEXT NOT NULL DEFAULT '',
  group_label TEXT NOT NULL DEFAULT '',
  attendance_campaign_id TEXT,
  rows_json TEXT NOT NULL DEFAULT '[]',
  note_footer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  review_note TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  attendance_synced_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_carpool_sheets_cohort
  ON carpool_sheets(cohort, activity_date DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS carpool_sheet_events (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  cohort TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_carpool_events_sheet
  ON carpool_sheet_events(sheet_id, created_at DESC);
