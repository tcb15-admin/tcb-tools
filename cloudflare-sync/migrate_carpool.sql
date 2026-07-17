-- 配車 Phase2 MVP
-- 適用例:
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_carpool.sql
--
-- 行データは rows_json に配列で保持（手組み編集が主のため）。

CREATE TABLE IF NOT EXISTS carpool_sheets (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  activity_date TEXT NOT NULL DEFAULT '',
  from_place TEXT NOT NULL DEFAULT '',
  to_place TEXT NOT NULL DEFAULT '',
  attendance_campaign_id TEXT,
  rows_json TEXT NOT NULL DEFAULT '[]',
  note_footer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_carpool_sheets_cohort
  ON carpool_sheets(cohort, activity_date DESC, updated_at DESC);
