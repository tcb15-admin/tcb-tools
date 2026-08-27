# boys15/master.json について

## これは何か

- `template/build.py` が HTML 内の `DEFAULT_MB` / `DEFAULT_TL` / `DESCS` に埋め込む **ビルド用スナップショット**
- **運用中の正本ではない**（Cloudflare D1 が正本）

## 正本の優先順位

1. **Cloudflare D1**（マスタ画面「保存」→ Worker）
2. 各端末の localStorage（未保存編集がある間のみ）
3. **このファイル**（初回起動・オフライン fallback）

Git に commit しても D1 には自動反映されません。逆も同様です。

## リポジトリを D1 に合わせる

```bash
SYNC_API_TOKEN='（Worker 用 Bearer）' node cloudflare-sync/scripts/pull-master.mjs
python3 template/build.py boys15
```

成功すると `_meta.syncedAt` / `_meta.cloudVersion` が更新されます。

## 固定担当の見方

- **道具マスタ `TL.fixed` + `TL.note`** … 割振りロジックが参照
- **メンバー `MB.fix`** … レガシー表示用。保存時に TL から自動同期（v1.25.7〜）

エージェントや開発者が JSON を読むときは **TL 側を見る**こと。

## 関連

- エージェント向けルール: `.cursor/rules/tcb-master-source.mdc`
- API: `GET /api/state?cohort=15`（Bearer 必須）
