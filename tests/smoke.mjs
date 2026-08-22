/* ============================================================
 * 割振りコアのスモークテスト（Playwright）
 *
 * ビルド済み boys15/index.html をローカルHTTPサーバーで開き、
 * 主要フロー（STEP1→STEP2→割振り実行→STEP3、きょうの割振りカード）
 * が壊れていないことを自動確認する。
 *
 * 実行方法（リポジトリ直下で）:
 *   npm install          （初回のみ。Playwright と Chromium を取得）
 *   npm run smoke
 *
 * 安全対策:
 * - localhost 以外への通信（クラウド同期API等）はすべて遮断する。
 *   本番 D1 のデータには一切触れない。
 * - トークンはこのファイルに含めない（ビルド済みHTMLを開くだけ）。
 * ============================================================ */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = 18923;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

let failures = 0;
function check(name, ok, detail) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let filePath = normalize(join(ROOT, urlPath));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if (filePath.endsWith('/')) filePath = join(filePath, 'index.html');
      if (!existsSync(filePath)) { res.writeHead(404).end('not found'); return; }
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const indexPath = join(ROOT, 'boys15', 'index.html');
  if (!existsSync(indexPath)) {
    console.error('boys15/index.html がありません。先に python3 template/build.py boys15 を実行してください。');
    process.exit(2);
  }

  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext();

  /* localhost 以外（クラウド同期API・外部フォント等）への通信を遮断 */
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') route.continue();
    else route.abort();
  });

  const page = await context.newPage();
  page.on('pageerror', (err) => {
    check('ページ内で未捕捉エラーなし', false, String(err).slice(0, 160));
  });

  const url = `http://127.0.0.1:${PORT}/boys15/index.html`;

  console.log('== 1. 起動・ログインゲート ==');
  await page.goto(url);
  /* テスト用: セッションフラグでゲートを通過（パスワードは扱わない） */
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.setItem('tcb15Auth', '1');
  });
  await page.reload();
  check('パスワード画面が消えている',
    await page.evaluate(() => getComputedStyle(document.getElementById('pw-screen')).display === 'none'));
  check('STEP1 が表示されている',
    await page.evaluate(() => document.getElementById('p1').className.includes('on')));
  check('前回結果なし→保有ベース割振りは選択不可',
    await page.evaluate(() => {
      const h = document.querySelector('input[name="p1-flow"][value="holdings"]');
      return h && h.disabled;
    }));

  console.log('== 2. 通常割振り（両方練習・欠席1・お茶当番1） ==');
  await page.click('#btn-renshu');
  await page.click('#btn-s2');
  check('STEP2 に遷移',
    await page.evaluate(() => document.getElementById('p2').className.includes('on')));
  check('実行前の確認カードが描画されている',
    await page.evaluate(() => (document.getElementById('tcb-presum-body') || {}).innerHTML !== ''));
  await page.evaluate(() => {
    document.querySelectorAll('#agrid .mc')[0].click();  /* 欠席1名 */
    document.querySelectorAll('#ogrid .mc')[1].click();  /* お茶当番1名 */
  });
  await page.click('#btn-run');
  check('STEP3 に遷移（割振り成功）',
    await page.evaluate(() => document.getElementById('p3').className.includes('on')));
  const alloc = await page.evaluate(() => {
    const raw = localStorage.getItem('tcb15PrevResult');
    if (!raw) return null;
    const snap = JSON.parse(raw);
    const people = Object.values(snap.map || {});
    return {
      toolCount: Object.keys(snap.map || {}).length,
      absCount: Object.keys(snap.absS || {}).length,
      ochCount: Object.keys(snap.ochS || {}).length,
      absAssigned: people.some((p) => snap.absS && snap.absS[p]),
      ochAssigned: people.some((p) => snap.ochS && snap.ochS[p]),
    };
  });
  check('前回結果（LS_PREV）が保存されている', !!alloc);
  if (alloc) {
    check('道具が割り当てられている', alloc.toolCount > 0, `${alloc.toolCount}点`);
    check('欠席者に道具が割り当たっていない', !alloc.absAssigned);
    check('お茶当番に道具が割り当たっていない', !alloc.ochAssigned);
  }

  console.log('== 3. きょうの割り振り方（保有ベース） ==');
  await page.evaluate(() => document.getElementById('st1').click());
  check('前回結果あり→きょうの割り振り方が表示',
    await page.evaluate(() => {
      const host = document.getElementById('p1-flow-host');
      return host && host.style.display !== 'none' && host.innerHTML !== '';
    }));
  check('保有ベース割振りが選択可能',
    await page.evaluate(() => {
      const h = document.querySelector('input[name="p1-flow"][value="holdings"]');
      return h && !h.disabled;
    }));
  await page.click('input[name="p1-flow"][value="holdings"]');
  await page.click('#btn-s2');
  check('開始→STEP2 に遷移',
    await page.evaluate(() => document.getElementById('p2').className.includes('on')));
  check('欠席・お茶当番がクリアされている',
    await page.evaluate(() => {
      const marked = (sel) => Array.from(document.querySelectorAll(sel + ' .mc'))
        .filter((c) => /\bon\b|\babs\b|\bsel\b/.test(c.className)).length;
      return marked('#agrid') === 0 && marked('#ogrid') === 0;
    }));
  check('調整モードのバナーが出ている',
    await page.evaluate(() => document.getElementById('p2-seed-mode-banner').className.includes('on')));
  await page.evaluate(() => { document.querySelectorAll('#ogrid .mc')[2].click(); });
  await page.click('#btn-run');
  check('きょうの保有ベース割振り→STEP3 に遷移',
    await page.evaluate(() => document.getElementById('p3').className.includes('on')));

  await browser.close();
  server.close();

  console.log('');
  if (failures) {
    console.error(`NG: ${failures} 件失敗`);
    process.exit(1);
  }
  console.log('OK: すべてのスモークテストに合格');
}

main().catch((e) => { console.error(e); process.exit(1); });
