# 15期 ドキュメント

15期道具マネージャー向けの **公式操作マニュアル・仕様・運用手順** です。

## 15期道具マネージャー向け — 最新マニュアル（公式参照URL）

**https://tcb15-admin.github.io/tcb-tools/boys15/docs/TCB-MAN-001_道具割り振りツール_操作マニュアル_v1.5.pdf**

通知・引き継ぎ時は **必ず上記PDFのURL** を案内してください。通知文テンプレートは [15期道具マネ_マニュアル通知文.md](./15期道具マネ_マニュアル通知文.md)。

| ファイル | 形式 | 用途 |
|----------|------|------|
| **TCB-MAN-001_…v1.5.pdf** | PDF | **正本**（配布・印刷・ブックマーク）。中身は版 **1.10**（2026-07-05、ツール v1.7.2・利用シーン別フロー） |
| [TCB-MAN-001_…v1.5.md](./TCB-MAN-001_道具割り振りツール_操作マニュアル_v1.5.md) | Markdown | 編集用ソース（フロー図・スクショ含む） |
| [TCB-MAN-001_…source.txt](./TCB-MAN-001_ユーザーマニュアル_v1.5_source.txt) | テキスト | 改訂履歴・簡易参照用 |
| [images/](./images/) | PNG | スクショ（**boys15 実画面**） |

**ツール本体:** https://tcb15-admin.github.io/tcb-tools/boys15/

## その他の文書

| 文書番号 | ファイル | 版 | 用途 |
|----------|----------|-----|------|
| TCB-OPS-001 | [TCB-OPS-001_GitHub運用手順書_v1.7_source.txt](./TCB-OPS-001_GitHub運用手順書_v1.7_source.txt) | 1.7 | GitHub Pages・ビルド・マスタ同期の運用 |
| TCB-SPEC-001 | [TCB-SPEC-001_仕様書_v1.5_source.txt](./TCB-SPEC-001_仕様書_v1.5_source.txt) | 1.9 | 開発・改修時の技術仕様 |

## 再ビルド手順

```bash
# 1. リポジトリルートで HTTP サーバ（スクショ再取得時）
python3 -m http.server 8765 --bind 127.0.0.1

# 2. スクショ → PDF
cd boys15/docs/scripts && npm install
node capture-screenshots.mjs
node build-pdf.mjs
```

`scripts/node_modules/` は git に含めません。

## 更新時の注意

1. 機能改修後は `template/config_boys15.json` の `TOOL_VERSION` を上げ、`python3 template/build.py` を実行
2. 仕様変更時は TCB-SPEC-001 の改訂履歴を追記
3. 利用者向け手順・フロー・スクショは **本フォルダ（boys15/docs）** を更新。15期の `boys15/index.html` を正としてスクショを取得すること

## 関連

- Cloudflare 同期: [cloudflare-sync/README.md](../../cloudflare-sync/README.md)
