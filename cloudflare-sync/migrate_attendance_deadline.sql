-- 出欠キャンペーンに回答締切を追加
ALTER TABLE attendance_campaigns ADD COLUMN deadline_at TEXT;
