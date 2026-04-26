# Cloudflare同期 API セットアップ

## 1. 前提
- Cloudflare アカウント（無料枠）
- `wrangler` CLI

## 2. D1作成とスキーマ適用
```bash
wrangler d1 create tcb-tools-sync
wrangler d1 execute tcb-tools-sync --file=cloudflare-sync/schema.sql
```

作成後に表示される `database_id` を `wrangler.toml.example` の `database_id` に設定して `wrangler.toml` として保存。

## 3. トークン設定
```bash
wrangler secret put SYNC_API_TOKEN
```

## 4. デプロイ
```bash
wrangler deploy
```

デプロイURL例:
`https://tcb-tools-sync.<account>.workers.dev`

## 5. ツール側設定（config）
`template/config_boys15.json` と `template/config_boys16.json` に以下を設定:

- `SYNC_API_BASE_URL`: WorkerのURL（例: `https://tcb-tools-sync.xxx.workers.dev`）
- `SYNC_API_TOKEN`: 上記と同じトークン

設定後、`build.py` で `index.html` を再生成し、`boys15/`, `boys16/` に `index.html` と `tcb-sync-api.js` を配置。

## 6. API一覧
- `GET /api/state?cohort=15|16`
- `POST /api/save-master`
- `POST /api/history-upsert`
- `GET /api/history?cohort=15|16&days=365`
- `POST /api/history-delete`
- `POST /api/history-clear`
- `POST /api/confirm-carryout`

## 7. 競合と上書きルール
- マスタ保存は `expectedVersion` で楽観ロック（競合時 `version_conflict`）
- 実施確定は `cohort + activityDate` で上書き（同日再確定）
- PAST更新はサーバ側のみで処理

## 8. 15期/16期の履歴・PASTを一括クリア
```bash
wrangler d1 execute tcb-tools-sync --file=cloudflare-sync/reset_15_16.sql
```

この操作で以下が実行されます:
- `history_events` の 15/16 を全削除
- `tool_state.master_json.PAST` を `{}` に初期化
- `carryout_meta_json` を初期化
