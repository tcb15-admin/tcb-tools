-- お茶当番: 選手班名簿を期共通設定へ（月ごと変動しない）
-- 適用例:
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_tea_player_groups.sql
--
-- 既存の tea_months.player_groups_json は互換のため残す（月保存時に設定へも同期）。

ALTER TABLE tea_settings ADD COLUMN player_groups_json TEXT DEFAULT '{}';
