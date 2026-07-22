# Cloudflare同期 API セットアップ

フロント（`tcb-sync-api.js`）が呼ぶ Worker + D1。未デプロイのときは次の順で進めればよい。

## 1. 前提

- Cloudflare アカウント（無料枠で可）
- Node 18+（`npx wrangler` 用）

### 構成の前提（推奨）

- **マスタの正**: Cloudflare Worker + D1（この README の API）。保存・読込はここを経由する。
- **ツール（HTML）の配布**: GitHub（Pages やリポジトリの静的ホストなど）。HTML だけが公開されてもよい。
- **Private リポジトリ**では `raw.githubusercontent.com/.../master.json` は **未認証では取得できない**ため、マスタ配布用の `GITHUB_MASTER_URL` は **空にし、同期 API のみでマスタを扱う**運用にすると一貫する。

初回のみログイン:

```bash
npx wrangler login
```

## 2. 設定ファイルを用意

リポジトリのルートから:

```bash
cp cloudflare-sync/wrangler.toml.example cloudflare-sync/wrangler.toml
```

`cloudflare-sync/wrangler.toml` の `database_id` は次の手順で得た値に差し替える（**このファイルは Git に含めない**。`cloudflare-sync/.gitignore` 済み）。

## 3. D1 を作成する

```bash
npx wrangler d1 create tcb-tools-sync
```

出力に `database_id` が出るので、`wrangler.toml` の `REPLACE_WITH_YOUR_D1_DATABASE_ID` を置き換える。

## 4. スキーマを本番 D1 に流す

**クラウド上の DB に反映する**ときは `--remote` を付ける。

```bash
cd cloudflare-sync
npx wrangler d1 execute tcb-tools-sync --remote --file=./schema.sql
```

（ローカル検証用の D1 にだけ流す場合は `--local` に読み替え。）

## 5. 共有トークン（シークレット）

Worker は `Authorization: Bearer <token>` と `env.SYNC_API_TOKEN` の一致だけで認可する。**トークンは `wrangler.toml` に書かない。**

```bash
cd cloudflare-sync
npx wrangler secret put SYNC_API_TOKEN
```

プロンプトに強いランダム文字列を貼る（フロントの `SYNC_API_TOKEN` と同じ値にする）。

## 6. デプロイ

```bash
cd cloudflare-sync
npm install
npx wrangler deploy
```

表示される URL 例: `https://tcb-tools-sync.<account>.workers.dev`

## 7. ツール側（HTML）に URL とトークンを入れる

1. `template/config_boys15.json` と `template/config_boys16.json` の次を埋める:
   - `SYNC_API_BASE_URL`: 上記 Worker のオリジン（末尾スラッシュなし）
   - `SYNC_API_TOKEN`: 手順 5 と同じ文字列（**Git にコミットしない運用を推奨**。ローカル専用ファイルや CI シークレットでビルドする）
   - `GITHUB_MASTER_URL`: **マスタの正を Cloudflare に置く場合は空文字 `""` のまま**。同期をオフにした端末だけ、任意の公開 JSON URL を一時的に指定する用途向け。
2. リポジトリルートで（`build.py` は `template/` 相対パスで読むため **ルートが cwd**）:

```bash
python3 template/build.py
```

特定世代だけなら `python3 template/build.py boys15 boys16`。

`boys15/index.html` / `boys16/index.html` と `tcb-sync-api.js` が再生成・コピーされる。トークンを Git に載せたくない場合は、ビルド済み HTML をデプロイ対象から外すか、別経路で注入する運用にする。

## 8. 動作確認（任意）

```bash
cd cloudflare-sync
cp .dev.vars.example .dev.vars
# .dev.vars のトークンを編集し、wrangler secret と同じにするか、dev 用に変える
npx wrangler dev
```

別ターミナルで:

```bash
curl -sS -H "Authorization: Bearer <トークン>" "http://127.0.0.1:8787/api/state?cohort=15"
```

`master` / `version` が JSON で返れば OK。

## 9. API 一覧

認可: 下記のうち `Authorization: Bearer <token>` が必要なのは **`/api/public/` 以外のすべて**。`/api/public/` は shareId で個別に検証する **公開経路（トークン不要）**。

- `GET /api/state?cohort=15|16`
- `POST /api/save-master`
- `POST /api/history-upsert`
- `GET /api/history?cohort=15|16&days=365`
- `POST /api/history-delete`
- `POST /api/history-clear`
- `POST /api/confirm-carryout`
- `POST /api/publish-day` … 保護者向け確認ページを発行/更新（Bearer）。body: `{cohort, teamName, days:[...], rotate?}`。戻り: `{ok, shareId, updatedAt}`
- `POST /api/unpublish-day` … 公開を停止（Bearer）。body: `{cohort}`
- `GET /api/public/day?sid=<shareId>` … 保護者向け読み取り公開（**トークン不要**）。active のときだけ view を返す
- `POST /api/public/swap-report` … 保護者の交代申請（**トークン不要**）
- `GET /api/public/swap-status?sid=&person=` … 保護者の受付状況（**トークン不要**）
- `GET /api/swap-reports?cohort=15|16` … MGR 交代報告一覧（Bearer）
- `POST /api/swap-reports/handle` … MGR 反映/却下（Bearer）
- `POST /api/push/subscribe` … MGR Web Push 購読登録（Bearer）

### 出欠（Phase 1 / 2トラック汎用設計）

マイグレーション: `migrate_attendance.sql`（**旧テーブルは置き換え**）

トラックは汎用キー **a / b**（15期は a=MG LINE・b=親父 LINE）。チーム固有の呼称・フォーム種別（family=家族詳細／marks=◯△✕）は **フロント config（`ATT_TRACK_*`）** で注入し、DB・API には持ち込まない（多チーム展開対応）。

- `GET /api/attendance/campaigns?cohort=` … キャンペーン一覧（Bearer）
- `POST /api/attendance/campaigns` … 作成／更新。body: `{cohort, id?, title, memo?, status?, days:[{activityDate,startTime?,place?,kind?}]}`
- `GET /api/attendance/campaign?cohort=&id=` … 詳細＋トラック別回答（Bearer）
- `POST /api/attendance/publish` … shareId 発行。body: `{cohort, id, track?:a|b|both, rotate?}` → `shareIdA` / `shareIdB`
- `POST /api/attendance/campaign-status` … 受付 open/closed。body: `{cohort, id, status}`
- `POST /api/attendance/response` … スタッフ代理回答（Bearer）。body: `{cohort, campaignId, memberName, track, payload}`
- `GET /api/attendance/cross-events?cohort=&since=` … 相互影響イベント（Bearer）
- `GET /api/public/attendance?sid=` … 保護者（トークン不要）。sid がどちらのトラックかで track 判定
- `POST /api/public/attendance-response` … 保護者回答。body: `{sid, memberName, payload}`

フロント:

- `{世代}/portal/index.html`
- `{世代}/attendance/index.html` … 出欠スタッフ
- `{世代}/attendance/kaito.html?sid=` … 保護者（トラックは sid で切替）

## 10. 競合と上書きルール

- マスタ保存は `expectedVersion` で楽観ロック（競合時 `version_conflict`）
- 実施確定は `cohort + activityDate` で上書き（同日再確定）
- PAST 更新はサーバ側で処理（`confirm-carryout`）。リクエストに `map` に加え **`tools` 配列**（wt/sz/name）を含めると、道具ごとの **lscore（負荷pt）** を加算。未送信時は道具あたり 15pt 相当

## 11. 15期/16期の履歴・PAST を一括クリア

**実行前にバックアップ推奨。**

リポジトリルートから:

```bash
npx wrangler d1 execute tcb-tools-sync --remote --file=cloudflare-sync/reset_15_16.sql
```

`cd cloudflare-sync` 済みなら `--file=./reset_15_16.sql` でよい。

## 11b. 配車（Phase2）テーブル

```bash
cd cloudflare-sync
npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_carpool.sql
npx wrangler deploy
```

フロントはリポジトリルートで:

```bash
SYNC_API_TOKEN='…' python3 template/build.py boys15
```

公開URL例: `…/boys15/carpool/`（ポータルから遷移）。MG出欠の配車可回答を候補取込できる。

## 12. 保護者向け確認ページ（案2 Step2-1）のデプロイ

新機能の反映には **D1マイグレーション → Worker 再デプロイ** の2手順が必要（トークンローテーションと同様、ここは手作業）。

1. テーブル追加（冪等）:

```bash
cd cloudflare-sync
npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_published_days.sql
```

2. Worker を再デプロイ:

```bash
cd cloudflare-sync
npx wrangler deploy
```

これで公開経路 `GET /api/public/day` と発行系 `POST /api/publish-day` / `POST /api/unpublish-day` が有効になる。

- 保護者ページ本体は GitHub Pages 側の `boys15/kakunin.html` / `boys16/kakunin.html`（`python3 template/build.py` で生成、**トークンは埋め込まれない**）。
- MGRツールの「印刷／PDF」内「保護者向け確認画面」→「保護者確認URLを発行/更新」で `shareId` 付きURLを発行し、LINEに貼って案内する。
- URL は `PARENT_VIEW_URL`（config）が空なら、ツール自身の場所から同フォルダ `kakunin.html` を自動導出する。独自ドメイン等で固定したい場合のみ config に設定。

## 13. 交代報告機能（保護者申請 → MGR 反映/却下）

コードは **Phase 1 実装済み**。本番で使うには D1 マイグレーションと Worker 再デプロイが必要。

1. テーブル追加（冪等）:

```bash
cd cloudflare-sync
npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_swap_reports.sql
```

2. Worker を再デプロイ:

```bash
cd cloudflare-sync
npx wrangler deploy
```

3. MGR ツール（`boys15/index.html`）は **`SYNC_API_TOKEN` 付きでビルド**すること（未設定だと 📮 報告ボタンは表示されても API が失敗する）。

```bash
SYNC_API_TOKEN='（トークン）' python3 template/build.py boys15
```

### エンドポイント（交代報告）

| 経路 | 認証 | 用途 |
|------|------|------|
| `POST /api/public/swap-report` | 不要（shareId 検証） | 保護者が交代を申請 |
| `GET /api/public/swap-status` | 不要 | 保護者の受付状況 |
| `GET /api/swap-reports` | Bearer | MGR 一覧・未処理件数 |
| `POST /api/swap-reports/handle` | Bearer | MGR 反映/却下 |

- 保護者ページ: `kakunin.html?v=<shareId>`（トークン不要）
- MGR: ヘッダー **📮 報告** で一覧・反映・却下
- 詳細仕様: `docs/spec-swap-report.md`

## 14. Web Push（Phase 2・道具MGRのみ）

新着交代報告を MGR 端末へプッシュ通知する。**VAPID 鍵の設定後**に有効。

### 14-1. VAPID 鍵を生成

```bash
cd cloudflare-sync
node gen-vapid-keys.mjs
```

出力された **公開鍵** を `template/config_boys15.json` の `VAPID_PUBLIC_KEY` に設定。`VAPID_SUBJECT` は連絡先（`mailto:...` 推奨）。

### 14-2. Worker Secret に登録

```bash
cd cloudflare-sync
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_SUBJECT
```

`gen-vapid-keys.mjs` の出力と同じ値を使う。

### 14-3. D1 マイグレーション

```bash
cd cloudflare-sync
npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_push_subscriptions.sql
```

### 14-4. デプロイ

```bash
cd cloudflare-sync
npx wrangler deploy
SYNC_API_TOKEN='（トークン）' python3 template/build.py boys15
```

GitHub Pages に `boys15/`（`sw.js` 含む）を push。

### 14-5. MGR 側の使い方

1. 道具MGR ツールを開く（同期 ON）
2. ヘッダー **🔔 通知** をタップ → ブラウザで通知を許可
3. 状態が **🔔 通知ON** になれば登録完了
4. 保護者から交代申請があるとプッシュ通知（未許可・非対応時は 📮 バッジ）

**iOS**: 16.4 以降、**ホーム画面に追加した PWA** でのみ Push 受信可（Safari 通常タブでは不可）。

### 14-6. API

- `POST /api/push/subscribe`（Bearer・MGR）: 購読登録。body: `{ cohort, endpoint, p256dh, auth }`

`VAPID_PUBLIC_KEY` が config で空の間、🔔 ボタンは非表示（Push 無効）。
