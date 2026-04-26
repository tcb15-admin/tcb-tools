-- 15期/16期の履歴・PAST・実施確定メタをクリアする
-- 実行前に必ずバックアップを推奨

DELETE FROM history_events
WHERE cohort IN ('15','16');

UPDATE tool_state
SET
  master_json = json_set(master_json, '$.PAST', json('{}')),
  carryout_meta_json = '{"byDate":{}}',
  version = version + 1,
  updated_at = datetime('now')
WHERE cohort IN ('15','16');
