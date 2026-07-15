-- 出欠 Phase1（MG LINE / 親父 LINE の2系統・複数日）
-- 適用例:
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_attendance.sql
--
-- 注意: 旧・単純出欠テーブル（activities / attendance_responses）は未本番前提で置き換える。

DROP TABLE IF EXISTS attendance_responses;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS attendance_father_responses;
DROP TABLE IF EXISTS attendance_mother_responses;
DROP TABLE IF EXISTS attendance_days;
DROP TABLE IF EXISTS attendance_campaigns;
DROP TABLE IF EXISTS cross_role_events;

-- 出欠キャンペーン（例: 7/18・19・20 の出欠確認）
CREATE TABLE IF NOT EXISTS attendance_campaigns (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  share_id_mg TEXT,
  share_id_father TEXT,
  responses_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_att_camp_cohort
  ON attendance_campaigns(cohort, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_att_camp_share_mg
  ON attendance_campaigns(share_id_mg);

CREATE UNIQUE INDEX IF NOT EXISTS idx_att_camp_share_father
  ON attendance_campaigns(share_id_father);

-- キャンペーン内の日付（複数日）
CREATE TABLE IF NOT EXISTS attendance_days (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  cohort TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'practice',
  label TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(campaign_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_att_days_camp
  ON attendance_days(campaign_id, sort_order, activity_date);

-- 母（MG LINE）回答：選手（家庭）単位。日ごとの詳細は JSON
-- payload 例:
-- {"days":{"2026-07-18":{"mode":"off","note":"学校行事"},
--          "2026-07-19":{"mode":"on","father":"o","mother":"o","siblings":"なし","other":"—",
--                        "carOk":"o","carModel":"RAV4","seats":2,"send":"父（RAV4）","pickup":"父（RAV4）"}}}
CREATE TABLE IF NOT EXISTS attendance_mother_responses (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  cohort TEXT NOT NULL,
  member_name TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_id, member_name)
);

CREATE INDEX IF NOT EXISTS idx_att_mg_camp
  ON attendance_mother_responses(campaign_id);

-- 親父 LINE 回答：選手単位・日ごと ○/△/✕
-- payload 例: {"days":{"2026-07-18":"o","2026-07-19":"o","2026-07-20":"x"}}
CREATE TABLE IF NOT EXISTS attendance_father_responses (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  cohort TEXT NOT NULL,
  member_name TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_id, member_name)
);

CREATE INDEX IF NOT EXISTS idx_att_fa_camp
  ON attendance_father_responses(campaign_id);

-- 相互影響イベント（他役割向け）
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
