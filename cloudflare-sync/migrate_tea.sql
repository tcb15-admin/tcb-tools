-- お茶当番（月次表・品目マスタ・設定）
-- 適用例:
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_tea.sql
--
-- 未本番前提の追加。既存テーブルは DROP しない。

CREATE TABLE IF NOT EXISTS tea_settings (
  cohort TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tea_months (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  year_month TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  player_groups_json TEXT NOT NULL DEFAULT '{}',
  revised_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(cohort, year_month)
);

CREATE INDEX IF NOT EXISTS idx_tea_months_cohort
  ON tea_months(cohort, year_month DESC);

CREATE TABLE IF NOT EXISTS tea_days (
  id TEXT PRIMARY KEY,
  month_id TEXT NOT NULL,
  cohort TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  duty_a TEXT NOT NULL DEFAULT '',
  duty_b TEXT NOT NULL DEFAULT '',
  player_group INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(month_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_tea_days_month
  ON tea_days(month_id, sort_order, activity_date);

CREATE INDEX IF NOT EXISTS idx_tea_days_cohort_date
  ON tea_days(cohort, activity_date);

CREATE TABLE IF NOT EXISTS tea_supply_items (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  label TEXT NOT NULL,
  unit_hint TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_tea_supply_cohort
  ON tea_supply_items(cohort, sort_order);
