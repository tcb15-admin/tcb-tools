-- ============================================================
-- 16期（cohort='16'）のデータを D1 から完全削除する
-- 16期は不使用確定（2026-08-09）。個人名を含むため全テーブルから削除する。
--
-- 実行方法（リポジトリの cloudflare-sync/ で）:
--   npx wrangler d1 execute tcb-tools-db --remote --file=delete_cohort16.sql
--   ※ DB名は wrangler.toml の d1_databases.database_name に合わせること
--
-- 実行前の確認（任意）:
--   npx wrangler d1 execute tcb-tools-db --remote \
--     --command "SELECT 'tool_state' t, COUNT(*) n FROM tool_state WHERE cohort='16'"
-- ============================================================

DELETE FROM tool_state                 WHERE cohort = '16';
DELETE FROM history_events             WHERE cohort = '16';
DELETE FROM published_days             WHERE cohort = '16';
DELETE FROM swap_reports               WHERE cohort = '16';
DELETE FROM push_subscriptions         WHERE cohort = '16';
DELETE FROM attendance_campaigns       WHERE cohort = '16';
DELETE FROM attendance_days            WHERE cohort = '16';
DELETE FROM attendance_track_responses WHERE cohort = '16';
DELETE FROM cross_role_events          WHERE cohort = '16';
