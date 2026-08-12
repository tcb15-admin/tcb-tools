-- 活動日ハブ（出欠・配車・お茶・道具の日付横断）＋配車の出欠同期時刻
-- 適用例:
--   cd /Users/kazuhiko/Applications/tcb-tools/cloudflare-sync
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_activity_hub.sql

CREATE TABLE IF NOT EXISTS activity_hub (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(cohort, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_activity_hub_cohort_date
  ON activity_hub(cohort, activity_date DESC);

-- 既存 carpool_sheets への列追加（未適用時のみ成功）
ALTER TABLE carpool_sheets ADD COLUMN attendance_synced_at TEXT NOT NULL DEFAULT '';
