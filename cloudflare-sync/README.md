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

- `GET /api/state?cohort=15|16`
- `POST /api/save-master`
- `POST /api/history-upsert`
- `GET /api/history?cohort=15|16&days=365`
- `POST /api/history-delete`
- `POST /api/history-clear`
- `POST /api/confirm-carryout`

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
