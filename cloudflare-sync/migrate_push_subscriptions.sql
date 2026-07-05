-- Web Push 購読（道具MGRのみ）用マイグレーション
-- MGR端末の push 購読情報を保存し、新着交代報告時に通知する。
-- 冪等（IF NOT EXISTS）なので複数回実行しても安全。
--
-- 反映（本番 D1）:
--   cd cloudflare-sync
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_push_subscriptions.sql
-- ローカル検証なら --remote を --local に読み替え。

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_cohort ON push_subscriptions(cohort);
