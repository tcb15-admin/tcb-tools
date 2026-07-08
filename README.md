# tcb-tools

東海中央ボーイズチーム向け **道具割り振りツール**（15期・16期）。

## 公開 URL

| 世代 | ツール | マニュアル（16期） |
|------|--------|-------------------|
| 15期 | https://tcb15-admin.github.io/tcb-tools/boys15/ | — |
| 16期 | https://tcb15-admin.github.io/tcb-tools/boys16/ | [操作マニュアル PDF](https://tcb15-admin.github.io/tcb-tools/boys16/docs/TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.pdf) |

- リポジトリ: https://github.com/tcb15-admin/tcb-tools
- 現行ツール版: **v1.7.4**（`template/config_boys15.json` の `TOOL_VERSION`）
- 15期マニュアル版: **1.13**（`boys15/docs/TCB-MAN-001_…v1.5.pdf`）
- 15期: 交代報告の **Web Push 通知**（MGR・🔔）は v1.7.4 から（要 VAPID 設定・`cloudflare-sync/README.md` §14）

## リポジトリ構成（概要）

```
template/
  tool_template.html   … 共通ロジック（正）
  config_boys15.json   … 15期設定
  config_boys16.json   … 16期設定
  build.py             … index.html 生成
  tcb-print-pdf.js     … PDF 生成ヘルパー
  tcb-sync-api.js      … Cloudflare 同期クライアント
boys15/ / boys16/      … ビルド成果物（index.html 等）
cloudflare-sync/       … Worker + D1（マスタ同期 API）
boys15/docs/           … 仕様書・運用手順書（15期管理）
boys16/docs/           … 16期マニュアル（PDF 正本）
```

## ビルド

リポジトリルートで実行:

```bash
python3 template/build.py
```

`boys15/index.html` と `boys16/index.html`（および各 `tcb-print-pdf.js`・`tcb-sync-api.js`）が生成されます。

`SYNC_API_TOKEN` は環境変数で渡すと config のプレースホルダをビルド時に埋め込めます（Git に平文を載せない運用）。詳細は [cloudflare-sync/README.md](./cloudflare-sync/README.md)。

## ドキュメント一覧

| 文書 | 版 | 場所 |
|------|-----|------|
| TCB-OPS-001 GitHub 運用手順書 | 1.9 | [boys15/docs/](./boys15/docs/) |
| TCB-SPEC-001 仕様書 | 1.11 | [boys15/docs/](./boys15/docs/) |
| TCB-MAN-001 ユーザーマニュアル | 1.13（[PDF](./boys15/docs/TCB-MAN-001_道具割り振りツール_操作マニュアル_v1.5.pdf)・利用シーン別フロー） | [boys15/docs/](./boys15/docs/) |
| TCB-MAN-016 16期操作マニュアル | 1.10（**更新停止予定**・16期未使用） | [boys16/docs/](./boys16/docs/) |

16期マニュアル PDF の再生成:

```bash
cd boys16/docs/scripts && npm install && node build-pdf.mjs
```

## 主な機能（v1.7.4）

- **展開情報の確認・LINE送信** … STEP3 から一画面で PDF プレビュー、送る内容（LINE本文・保護者確認URL・PDF）の選択、**LINEへ展開**（Web Share API）または **PDFを保存**。端末に残す場合は共有シートの「ファイルに保存」（v1.7.4 で html2pdf 同梱化・iOS 再タップ対応）
- **前回の結果を元に調整** … STEP1 上部の「前回の結果を元に割振る」または履歴詳細から開始。欠席・当番・班替えの差分だけ自動調整（v1.7.0〜）
- **最小変更で再調整** … STEP3 からいま表示中の結果を基準に再調整（v1.7.0）
- **保護者確認ページ** … 実施確定後、閲覧専用 URL を LINE 本文と一緒に展開。保護者からの**交代報告**を道具 MGR が承認／却下（v1.7.0）
- **現地の実保有に補正** … 前回確定と実態がズレた道具を手動補正し、入れ替え案内を実態ベースで生成（v1.6.8）
- **試合前・最小入れ替え調整** … 前回 map を基準に同一担当を最大限維持。班跨ぎは2人スワップ優先、余剰は変更人数最小化（v1.6.5〜）
- **班跨ぎの手動割当** … 持ち帰り調整モードでは自動 ON。通常時は「班を問わず全員を担当候補に表示」で手動のみ
- **累計負荷（PAST）** … 実施確定時に道具の lscore を加算。割振りは班内中央値超のみ弱ペナルティ
- **メンバー対象外** … 休部・退部・コーチ・14期帯同・兄弟所属。マスタの**故障**フラグで割振り表に「故障」タグ
- **PDF** … A4 1ページ固定、ファイル名 `mmdd_道具割振り｜東海中央XX期.pdf`。ダークモード対応 UI（v1.7.1〜）
- **PWA** … ホーム画面追加用アイコン・manifest（v1.6.9〜）
- **Web Push 通知** … 交代報告の新着をヘッダ「🔔 通知」ONでプッシュ通知（v1.7.4〜・要 VAPID 設定）
- **Cloudflare 同期** … マスタ・履歴の正は Worker + D1（推奨）
- **UI_SIMPLE**（15/16期） … 公平再分配・履歴1年 PDF 等の上級機能は非表示

## セキュリティ（未実施の前提）

運用開始時点では以下は **今後の課題** として扱います。必要になったら手順を個別に整理します。

- `SYNC_API_TOKEN` のローテーション
- Public 化前後の config / 履歴への平文トークン載せない
- クライアント埋め込み Bearer の限界（必要なら Cloudflare Access 等）
