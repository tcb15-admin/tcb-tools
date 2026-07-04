-- 保護者向け確認ページ（案2 Step2-1）用マイグレーション
-- 世代ごとに1本の固定 shareId で、直近確定分を読み取り公開するためのテーブル。
-- 冪等（IF NOT EXISTS）なので複数回実行しても安全。
--
-- 反映（本番 D1）:
--   cd cloudflare-sync
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_published_days.sql
-- ローカル検証なら --remote を --local に読み替え。

CREATE TABLE IF NOT EXISTS published_days (
  cohort TEXT PRIMARY KEY,
  share_id TEXT NOT NULL UNIQUE,
  view_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_published_share ON published_days(share_id);
