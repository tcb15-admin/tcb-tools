# tcb-tools

東海中央ボーイズチーム向け **道具割り振りツール**（15期・16期）。

## 公開 URL

| 世代 | ツール | マニュアル（16期） |
|------|--------|-------------------|
| 15期 | https://tcb15-admin.github.io/tcb-tools/boys15/ | — |
| 16期 | https://tcb15-admin.github.io/tcb-tools/boys16/ | [操作マニュアル PDF](https://tcb15-admin.github.io/tcb-tools/boys16/docs/TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.pdf) |

- リポジトリ: https://github.com/tcb15-admin/tcb-tools
- 現行ツール版: **v1.6.8**（`template/config_boys15.json` / `config_boys16.json` の `TOOL_VERSION`）

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
| TCB-SPEC-001 仕様書 | 1.8 | [boys15/docs/](./boys15/docs/) |
| TCB-MAN-001 ユーザーマニュアル | 1.8 | [boys15/docs/](./boys15/docs/) |
| TCB-MAN-016 16期操作マニュアル | 1.8（PDF ファイル名は v1.5 のまま） | [boys16/docs/](./boys16/docs/) |

16期マニュアル PDF の再生成:

```bash
cd boys16/docs/scripts && npm install && node build-pdf.mjs
```

## 主な機能（v1.6.8）

- **現地の実保有に補正** … 試合前・最小入れ替え調整の開始時に、前回確定と実際の保有がズレている道具（現地での受け渡し・マスタの道具固定など）を「いま実際に持っている人」へ手動補正。以後の「前回持っていた道具」の基準と、入れ替え案内（LINE／PDF）はこの**実態との差分**で作られる（v1.6.8）
- **試合前・最小入れ替え調整** … 前回の実施確定を基準に「同じ人・同じ道具」を最大限維持。班入替は2人1組スワップを優先し、余った道具は変更が必要な人へ集中配分して**入れ替え人数を最小化**（v1.6.5〜1.6.7）
- **道具入れ替え案内テキスト** … 誰と誰がどの道具を交換するかを整理し、STEP3・PDF2ページ目・LINE用メッセージに出力（v1.6.6）
- **持ち帰り調整モード** … 前回の割り振りを基準に欠席・お茶当番の変更分だけ調整（試合前・最小入れ替え調整の土台）
- **累計負荷（PAST）** … 実施確定時に道具の lscore を加算。割振りは班内中央値超のみ弱ペナルティ
- **実施確定** … PAST（過去担当回数）は確定時のみ反映
- **メンバー対象外フラグ** … 休部・コーチに加え、14期帯同（`ac14`）・兄弟所属（`sibling`）を割振り対象外に
- **PDF 印刷レイアウト** … 人数に応じ3/4列、道具名強調、A4 1ページ固定（入れ替え案内がある場合のみ2ページ目を追加）
- **Cloudflare 同期** … マスタの正は Worker + D1（推奨）
- **UI_SIMPLE**（15/16期） … 公平再分配・履歴1年 PDF・デフォルト保存等の上級機能は非表示

## セキュリティ（未実施の前提）

運用開始時点では以下は **今後の課題** として扱います。必要になったら手順を個別に整理します。

- `SYNC_API_TOKEN` のローテーション
- Public 化前後の config / 履歴への平文トークン載せない
- クライアント埋め込み Bearer の限界（必要なら Cloudflare Access 等）
