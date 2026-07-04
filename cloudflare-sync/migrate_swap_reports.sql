-- 交代報告機能（保護者→道具MGR）用マイグレーション
-- 保護者確認画面から申請された「道具の担当交代」の結果報告を保存するテーブル。
-- 冪等（IF NOT EXISTS）なので複数回実行しても安全。
--
-- 反映（本番 D1）:
--   cd cloudflare-sync
--   npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_swap_reports.sql
-- ローカル検証なら --remote を --local に読み替え。

CREATE TABLE IF NOT EXISTS swap_reports (
  id TEXT PRIMARY KEY,
  cohort TEXT NOT NULL,
  share_id TEXT NOT NULL,
  day_key TEXT NOT NULL,               -- 対象日キー（公開データの role: today / prev）
  day_label TEXT NOT NULL DEFAULT '',  -- 表示用ラベル（例: 7/5(土)）
  tool TEXT NOT NULL,                  -- 道具名
  from_person TEXT NOT NULL,           -- 現担当A（サーバで公開データと照合・自動確定）
  to_person TEXT NOT NULL,             -- 新担当B
  reporter TEXT,                       -- 連絡者（メンバー氏名・選択式・任意）
  comment TEXT,                        -- コメント（100字以内）
  status TEXT NOT NULL DEFAULT 'pending', -- pending / applied / dismissed
  reject_code TEXT,                    -- 却下理由コード（D1/D2/D9）
  reject_reason TEXT,                  -- 却下理由文（自由記入）
  created_at TEXT NOT NULL,
  handled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_swap_cohort_status ON swap_reports(cohort, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_share ON swap_reports(share_id, created_at DESC);
