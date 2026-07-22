# 15期 配車アプリ — 試験運用手順（Phase 2 MVP）

| 項目 | 内容 |
|------|------|
| 文書 | TCB-OPS-CAR-001 |
| 対象 | 東海中央ボーイズ 15期 |
| 目的 | 現行 Excel／PDF 配車表と同等の表をアプリで組み、PDF で両 LINE へ展開できるか確認する |
| 前提 | 出欠 Phase1 が動いていること。Cloudflare に `migrate_carpool.sql` 適用済み |

---

## 1. 管理者：初回デプロイ

```bash
cd cloudflare-sync
npx wrangler d1 execute tcb-tools-sync --remote --file=./migrate_carpool.sql
npx wrangler deploy
```

リポジトリルート:

```bash
SYNC_API_TOKEN='（本番トークン）' python3 template/build.py boys15
```

生成物を push → Pages 反映。

公開URL:

- ポータル: https://tcb15-admin.github.io/tcb-tools/boys15/portal/
- 配車: https://tcb15-admin.github.io/tcb-tools/boys15/carpool/

ログインは道具／出欠と同じ初期パスワード（`INITIAL_PW`）。

---

## 2. 試験シナリオ

1. 出欠で当日分の MG 回答があり、配車「可」＋車種が入っていること  
2. 配車画面で日付・出発／到着・出欠を選んで **作成**  
3. **MG候補を取込** → **候補から行を追加**  
4. 分類・担当・運転手・同乗を手直しして **保存**  
5. **PDF出力** → チーフ想定で MG／親父へ展開できるか確認  

---

## 3. やらないこと（MVP）

- 自動最適配車  
- Excel ファイル出力  
- 道具割振りとの積み込み突合（Phase 2.5〜）  
