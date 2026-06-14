# 15期 ドキュメント

15期管理向けの仕様・運用・ユーザーマニュアルです。16期向けの操作マニュアルは [boys16/docs/](../../boys16/docs/) を参照してください。

## ファイル一覧

| 文書番号 | ファイル | 版 | 用途 |
|----------|----------|-----|------|
| TCB-OPS-001 | [TCB-OPS-001_GitHub運用手順書_v1.7_source.txt](./TCB-OPS-001_GitHub運用手順書_v1.7_source.txt) | 1.7 | GitHub Pages・ビルド・マスタ同期の運用 |
| TCB-SPEC-001 | [TCB-SPEC-001_仕様書_v1.5_source.txt](./TCB-SPEC-001_仕様書_v1.5_source.txt) | 1.5 | 開発・改修時の技術仕様 |
| TCB-MAN-001 | [TCB-MAN-001_ユーザーマニュアル_v1.5_source.txt](./TCB-MAN-001_ユーザーマニュアル_v1.5_source.txt) | 1.5 | 利用者向け操作説明（15/16 共通の簡易版） |

## 関連

- ツール本体（15期）: https://tcb15-admin.github.io/tcb-tools/boys15/
- Cloudflare 同期セットアップ: [cloudflare-sync/README.md](../../cloudflare-sync/README.md)
- 16期マニュアル PDF: https://tcb15-admin.github.io/tcb-tools/boys16/docs/TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.pdf

## 更新時の注意

1. 機能改修後は `template/config_boys*.json` の `TOOL_VERSION` を上げ、`python3 template/build.py` を実行
2. 仕様変更時は TCB-SPEC-001 の改訂履歴を追記
3. 利用者向けの手順変更は TCB-MAN-001 と [boys16/docs/TCB-MAN-016](../../boys16/docs/TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.md) を揃える
