-- お茶当番: LINE案内の定型文（期共通）
-- 実行例（リポジトリの cloudflare-sync から）:
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_tea_share_msg.sql

ALTER TABLE tea_settings ADD COLUMN share_msg_template TEXT;
