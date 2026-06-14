# tcb-tools

東海中央ボーイズチーム向け **道具割り振りツール**（15期・16期）。

## 公開 URL

| 世代 | ツール | マニュアル（16期） |
|------|--------|-------------------|
| 15期 | https://tcb15-admin.github.io/tcb-tools/boys15/ | — |
| 16期 | https://tcb15-admin.github.io/tcb-tools/boys16/ | [操作マニュアル PDF](https://tcb15-admin.github.io/tcb-tools/boys16/docs/TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.pdf) |

- リポジトリ: https://github.com/tcb15-admin/tcb-tools
- 現行ツール版: **v1.6.3**（`template/config_boys15.json` / `config_boys16.json` の `TOOL_VERSION`）

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
| TCB-OPS-001 GitHub 運用手順書 | 1.7 | [boys15/docs/](./boys15/docs/) |
| TCB-SPEC-001 仕様書 | 1.5 | [boys15/docs/](./boys15/docs/) |
| TCB-MAN-001 ユーザーマニュアル | 1.5 | [boys15/docs/](./boys15/docs/) |
| TCB-MAN-016 16期操作マニュアル | 1.6（PDF ファイル名は v1.5 のまま） | [boys16/docs/](./boys16/docs/) |

16期マニュアル PDF の再生成:

```bash
cd boys16/docs/scripts && npm install && node build-pdf.mjs
```

## 主な機能（v1.6.3）

- **持ち帰り調整モード** … 前回の割り振りを基準に欠席・お茶当番の変更分だけ調整
- **実施確定** … PAST（過去担当回数）は確定時のみ反映
- **Cloudflare 同期** … マスタの正は Worker + D1（推奨）
- **UI_SIMPLE**（15/16期） … 公平再分配・履歴1年 PDF・デフォルト保存等の上級機能は非表示

## セキュリティ（未実施の前提）

運用開始時点では以下は **今後の課題** として扱います。必要になったら手順を個別に整理します。

- `SYNC_API_TOKEN` のローテーション
- Public 化前後の config / 履歴への平文トークン載せない
- クライアント埋め込み Bearer の限界（必要なら Cloudflare Access 等）
