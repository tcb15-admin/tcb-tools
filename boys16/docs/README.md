# 16期 ドキュメント

## 16期道具マネージャー向け — 最新マニュアル（公式参照URL）

**https://tcb15-admin.github.io/tcb-tools/boys16/docs/TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.pdf**

通知・引き継ぎ時は **必ず上記PDFのURL** を案内してください。通知文テンプレートは [16期道具マネ_マニュアル通知文.md](./16期道具マネ_マニュアル通知文.md)。

| ファイル | 形式 | 用途 |
|----------|------|------|
| **TCB-MAN-016_…v1.5.pdf** | PDF | **正本**（配布・印刷・ブックマーク）。中身は版 **1.6**（2026-05-22、ツール v1.6.3） |
| [TCB-MAN-016_…v1.5.md](./TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.md) | Markdown | 編集用ソース |
| TCB-MAN-016_…v1.5.docx | Word | 任意（PDFを優先） |
| [images/](./images/) | PNG | スクショ（実機画面） |

**ツール本体:** https://tcb15-admin.github.io/tcb-tools/boys16/

## 再ビルド手順

```bash
# 1. リポジトリルートで HTTP サーバ（スクショ再取得時のみ）
python3 -m http.server 8765 --bind 127.0.0.1

# 2. スクショ → 名前ぼかし → PDF / Word
cd boys16/docs/scripts && npm install
node capture-screenshots.mjs    # 省略可（既存 images を使う場合）
node build-pdf.mjs
node build-docx.mjs
```

`scripts/node_modules/` は git に含めません。
