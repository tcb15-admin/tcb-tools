/* ============================================================
 * マルチデバイス品質テスト（Playwright）
 *
 * 提示された必須テスト観点を本ツール向けに具体化し、
 * 自動実行可能な項目を網羅する。本番 D1 は触らない
 * （localhost 以外は原則遮断。外部疎通は別スクリプト）。
 *
 *   npm run qa
 * ============================================================ */
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = 18924;
const BASE = `http://127.0.0.1:${PORT}/boys15`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const results = [];
function check(section, name, ok, detail) {
  results.push({ section, name, ok: !!ok, detail: detail || '' });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
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

async function newBlockedContext(browser, opts = {}) {
  const context = await browser.newContext(opts);
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') route.continue();
    else route.abort();
  });
  return context;
}

async function authBypass(page) {
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.setItem('tcb15Auth', '1');
  });
  await page.reload();
  await page.waitForSelector('#p1.on', { timeout: 15000 });
}

async function loginWithPassword(page, password) {
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.waitForSelector('#pw-screen', { state: 'visible', timeout: 10000 });
  await page.fill('#pw-inp', password);
  await page.click('#pw-btn');
}

async function runAllocationToStep3(page, patternBtn = '#btn-renshu') {
  page.once('dialog', (d) => d.accept().catch(() => {}));
  await page.click(patternBtn);
  await page.click('#btn-s2');
  await page.waitForSelector('#p2.on', { timeout: 10000 });
  /* 片方試合・両方試合は試合組が0名だと実行できないので最低1名ずつタップ */
  if (patternBtn === '#btn-kata' || patternBtn === '#btn-ryoho') {
    const n = patternBtn === '#btn-ryoho' ? 2 : 1;
    await page.evaluate((count) => {
      const cells = [...document.querySelectorAll('#tgrid .tc2:not(.ex)')];
      cells.slice(0, count).forEach((c) => c.click());
    }, n);
  }
  await page.click('#btn-run');
  await page.waitForSelector('#p3.on', { timeout: 25000 });
}

async function section1_Functional(browser) {
  console.log('\n== 1. 機能テスト（画面・ロジック） ==');
  const context = await newBlockedContext(browser);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.accept().catch(() => {}));

  /* 1-1 ログイン正常／異常 */
  await loginWithPassword(page, 'wrong-password-!!!');
  await page.waitForTimeout(400);
  const stillGate = await page.evaluate(() => {
    const p = document.getElementById('pw-screen');
    return p && getComputedStyle(p).display !== 'none';
  });
  check('1', 'ログイン異常：誤PWでゲート通過しない', stillGate);

  await loginWithPassword(page, 'tcb15');
  await page.waitForFunction(() => {
    const p = document.getElementById('pw-screen');
    return p && getComputedStyle(p).display === 'none';
  }, { timeout: 10000 }).catch(() => {});
  check('1', 'ログイン正常：正しいPWでSTEP1へ',
    await page.evaluate(() => document.getElementById('p1')?.classList.contains('on')));

  /* 1-2 通常割振り 3パターン */
  for (const [btn, label] of [
    ['#btn-kata', '片方試合'],
    ['#btn-ryoho', '両方試合'],
    ['#btn-renshu', '両方練習'],
  ]) {
    await page.evaluate(() => sessionStorage.setItem('tcb15Auth', '1'));
    await page.goto(`${BASE}/index.html`);
    await page.waitForSelector('#p1.on', { timeout: 10000 });
    await runAllocationToStep3(page, btn);
    const ok = await page.evaluate(() => document.getElementById('p3')?.classList.contains('on'));
    check('1', `正常系：${label} → STEP3`, ok);
  }

  /* 1-3 きょうの割振り・実行前確認・戻る */
  await authBypass(page);
  await runAllocationToStep3(page, '#btn-renshu');
  await page.click('#st1');
  await page.waitForSelector('#tcb-today-host', { timeout: 5000 });
  check('1', 'きょうの割振りカード表示',
    await page.evaluate(() => document.getElementById('tcb-today-host')?.style.display !== 'none'));
  await page.click('#btn-tcb-today-start');
  await page.waitForSelector('#p2.on');
  check('1', '実行前の確認カードに内容あり',
    await page.evaluate(() => (document.getElementById('tcb-presum-body')?.textContent || '').length > 20));
  await page.click('#btn-back');
  check('1', 'STEP2→戻るでSTEP1へ',
    await page.evaluate(() => document.getElementById('p1')?.classList.contains('on')));

  /* 1-4 マスタ開閉・履歴 */
  await page.click('#btn-master');
  await page.waitForSelector('#p-master.on', { timeout: 8000 });
  check('1', 'マスタ画面が開く',
    await page.evaluate(() => document.getElementById('p-master')?.classList.contains('on')));
  await page.click('#btn-master-back');
  await page.waitForTimeout(300);
  await page.click('#btn-history');
  await page.waitForSelector('#hist-modal.open', { timeout: 8000 });
  check('1', '履歴モーダルが開く',
    await page.evaluate(() => document.getElementById('hist-modal')?.classList.contains('open')));

  /* 1-5 グループ名の文字数・XSS入力（画面が壊れない） */
  await page.evaluate(() => {
    document.getElementById('hist-modal')?.classList.remove('open');
    document.getElementById('p-master')?.classList.remove('on');
  });
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(() => sessionStorage.setItem('tcb15Auth', '1'));
  await page.reload();
  await page.waitForSelector('#p1.on', { timeout: 10000 });
  await page.click('#btn-kata');
  const xss = '<img src=x onerror=window.__xss=1>';
  await page.fill('#tnA', xss);
  /* maxlength=12 のため長い入力は切り詰められる（準正常） */
  await page.fill('#tnB', 'あ'.repeat(20));
  const tnBLen = await page.inputValue('#tnB');
  check('1', '準正常：グループ名は maxlength で切り詰められる', tnBLen.length <= 12, `len=${tnBLen.length}`);
  await page.click('#btn-s2');
  await page.waitForSelector('#p2.on', { timeout: 10000 });
  await page.evaluate(() => {
    const c = document.querySelector('#tgrid .tc2:not(.ex)');
    if (c) c.click();
  });
  await page.click('#btn-run');
  await page.waitForSelector('#p3.on', { timeout: 25000 });
  const xssFired = await page.evaluate(() => window.__xss === 1);
  check('1', '準正常：グループ名にXSS文字列を入れてもスクリプト実行されない', !xssFired);
  check('1', '準正常：XSS文字列入力後も割振り完了できる',
    await page.evaluate(() => document.getElementById('p3')?.classList.contains('on')));

  /* 1-6 割り振り方法ラジオ（調整モード中の STEP2） */
  await page.click('#st1');
  await page.waitForSelector('#btn-tcb-today-start', { timeout: 8000 });
  await page.click('#btn-tcb-today-start');
  await page.waitForSelector('#p2.on');
  const methodOk = await page.evaluate(() => {
    const fair = document.querySelector('input[name="p2-seedalloc"][value="fair"]');
    const min = document.querySelector('input[name="p2-seedalloc"][value="min"]');
    if (!fair || !min) return { ok: false, saved: 'radioなし' };
    min.click();
    const saved = localStorage.getItem('tcb15SeedAllocMethod');
    fair.click();
    return { ok: String(saved) === 'min', saved };
  });
  check('1', '割り振り方法（公平／維持）が選べて端末に保存される', methodOk.ok, String(methodOk.saved).slice(0, 80));

  check('1', 'ページ未捕捉エラーなし（機能セクション）', errors.length === 0, errors[0]?.slice(0, 120));
  await context.close();
}

async function section2_ResponsiveDark(browser) {
  console.log('\n== 2. 環境・互換性（ビューポート／ダーク） ==');
  const viewports = [
    { name: 'PC 1280x800', opts: { viewport: { width: 1280, height: 800 } } },
    { name: 'iPhone 13', opts: { ...devices['iPhone 13'] } },
    { name: 'iPad Mini', opts: { ...devices['iPad Mini'] } },
    { name: 'Android 360x800', opts: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ];

  for (const vp of viewports) {
    const context = await newBlockedContext(browser, vp.opts);
    const page = await context.newPage();
    await authBypass(page);
    const layout = await page.evaluate(() => {
      const p1 = document.getElementById('p1');
      const btn = document.getElementById('btn-s2');
      const hdr = document.querySelector('header') || document.querySelector('.hdr');
      const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
      const btnRect = btn?.getBoundingClientRect();
      const visible = btn && btnRect.width > 40 && btnRect.height > 20;
      const hdrOk = !hdr || hdr.getBoundingClientRect().height < window.innerHeight * 0.45;
      return { overflowX, visible, hdrOk, w: window.innerWidth };
    });
    check('2', `${vp.name}：横スクロール過多なし`, !layout.overflowX, `w=${layout.w}`);
    check('2', `${vp.name}：主要ボタンが見える`, layout.visible);
    check('2', `${vp.name}：ヘッダが画面を占有しすぎない`, layout.hdrOk);
    await page.click('#btn-renshu');
    await page.click('#btn-s2');
    await page.waitForSelector('#p2.on');
    await page.click('#btn-run');
    await page.waitForSelector('#p3.on', { timeout: 25000 });
    check('2', `${vp.name}：割振り完了まで到達`,
      await page.evaluate(() => document.getElementById('p3')?.classList.contains('on')));
    await context.close();
  }

  /* ダークモード */
  const darkCtx = await newBlockedContext(browser, {
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  });
  const darkPage = await darkCtx.newPage();
  await authBypass(darkPage);
  const contrast = await darkPage.evaluate(() => {
    const body = getComputedStyle(document.body);
    const txt = body.color;
    const bg = body.backgroundColor;
    const presum = document.getElementById('tcb-presum-card');
    /* STEP2 へ進めて presum の文字色も確認 */
    return { txt, bg, hasPresumCss: !!document.querySelector('link[href*="tcb-presummary"]') };
  });
  await darkPage.click('#btn-renshu');
  await darkPage.click('#btn-s2');
  await darkPage.waitForSelector('#p2.on');
  const presumColor = await darkPage.evaluate(() => {
    const val = document.querySelector('.tcb-presum-val');
    if (!val) return null;
    const c = getComputedStyle(val).color;
    /* rgb を粗く明るさ判定（0〜255平均） */
    const m = c.match(/(\d+)/g);
    if (!m) return { c, bright: null };
    const avg = (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3;
    return { c, avg };
  });
  check('2', 'ダークモード：ページが描画される', !!contrast.txt);
  check('2', 'ダークモード：実行前確認の文字が極端に暗くない',
    !presumColor || (presumColor.avg != null && presumColor.avg > 80),
    presumColor ? `${presumColor.c} avg=${presumColor.avg}` : 'no row');
  await darkCtx.close();
}

async function section3_OfflineRotatePersist(browser) {
  console.log('\n== 3. モバイル特有（オフライン・回転・状態保持） ==');
  const context = await newBlockedContext(browser, {
    ...devices['iPhone 13'],
  });
  const page = await context.newPage();
  await authBypass(page);
  await runAllocationToStep3(page, '#btn-renshu');

  /* オフライン：キャッシュ済みシェルが使えるか（SW未登録でも local サーバ遮断で確認） */
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  const offlineState = await page.evaluate(() => ({
    online: navigator.onLine,
    hasBody: !!document.body,
    auth: sessionStorage.getItem('tcb15Auth'),
    prev: !!localStorage.getItem('tcb15PrevResult'),
  }));
  /* ローカルサーバは offline でも Playwright ではブロックされることがある。データ保持を主に見る */
  check('3', 'オフライン時も localStorage の前回結果が保持される', offlineState.prev === true);
  await context.setOffline(false);
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(() => sessionStorage.setItem('tcb15Auth', '1'));
  await page.reload();
  await page.waitForSelector('#p1.on');
  check('3', '再接続後にきょうの割振りカードが復元できる',
    await page.evaluate(() => document.getElementById('tcb-today-host')?.style.display !== 'none'));

  /* 画面回転 */
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  const land = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 8,
    p1: document.getElementById('p1')?.classList.contains('on'),
    prev: !!localStorage.getItem('tcb15PrevResult'),
  }));
  check('3', '横向き：データが初期化されない', land.prev);
  check('3', '横向き：レイアウトが致命的に壊れない（過大な横溢れなし）', !land.overflowX);

  await page.setViewportSize({ width: 390, height: 844 });
  /* バックグラウンド相当：別ページへ → 戻る */
  await page.goto('about:blank');
  await page.goto(`${BASE}/index.html`);
  await page.evaluate(() => sessionStorage.setItem('tcb15Auth', '1'));
  await page.reload();
  check('3', 'タスク切り替え相当：前回結果が保持される',
    await page.evaluate(() => !!localStorage.getItem('tcb15PrevResult')));

  await context.close();
}

async function section4_ParentAndAssets(browser) {
  console.log('\n== 4. 保護者ページ・アセット・プロジェクト固有 ==');
  const context = await newBlockedContext(browser, { viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${BASE}/kakunin.html`);
  await page.waitForTimeout(600);
  const parent = await page.evaluate(() => ({
    title: document.title || '',
    hasBody: (document.body?.innerText || '').length > 20,
    hasOfflineBannerSlot: !!document.querySelector('[class*="offline"], [id*="offline"], #pv-offline, .pvsw-offline, .pv-banner'),
  }));
  check('4', '保護者確認ページが描画される', parent.hasBody, parent.title.slice(0, 40));

  /* ポータル・出欠 */
  for (const path of ['/portal/index.html', '/attendance/index.html', '/attendance/kaito.html']) {
    const res = await page.goto(`${BASE}${path}`);
    check('4', `ページ到達: boys15${path}`, res && res.status() < 400, `status=${res?.status()}`);
  }

  /* 必須アセット存在（ビルド成果物） */
  const assets = [
    'tcb-sync-api.js', 'tcb-presummary.js', 'tcb-presummary.css',
    'tcb-today-card.js', 'tcb-today-card.css', 'tcb-group-hold.js',
    'tcb-feedback.js', 'sw.js', 'parent-swap.js', 'parent-swap.css',
  ];
  for (const a of assets) {
    const r = await page.goto(`${BASE}/${a}`);
    check('4', `アセット配信: ${a}`, r && r.status() === 200);
  }

  /* index のキャッシュバスティング */
  await page.goto(`${BASE}/index.html`);
  const bust = await page.evaluate(() => {
    const links = [...document.querySelectorAll('script[src],link[href]')]
      .map((el) => el.src || el.href)
      .filter((u) => /tcb-.*\.(js|css)/.test(u));
    const withV = links.filter((u) => /[?&]v=/.test(u));
    return { n: links.length, withV: withV.length };
  });
  check('4', 'JS/CSS に ?v= キャッシュバスティングが付いている',
    bust.withV >= 3, `${bust.withV}/${bust.n}`);

  check('4', '保護者・ポータルで未捕捉エラーなし', errors.length === 0, errors[0]?.slice(0, 120));
  await context.close();
}

async function section5_SecurityStatic() {
  console.log('\n== 5. セキュリティ静的チェック（ビルド成果物） ==');
  const html = await readFile(join(ROOT, 'boys15', 'index.html'), 'utf8');
  const cfg = await readFile(join(ROOT, 'template', 'config_boys15.json'), 'utf8');
  check('5', 'config に平文トークンを載せない（プレースホルダ）',
    /"SYNC_API_TOKEN"\s*:\s*"__SYNC_API_TOKEN__"/.test(cfg));
  check('5', '旧固定トークン tokaicentralboys2012 が index に無い',
    !html.includes('tokaicentralboys2012'));
  check('5', 'ログインゲート（pw-screen）が存在する', html.includes('id="pw-screen"'));
  const kakunin = await readFile(join(ROOT, 'boys15', 'kakunin.html'), 'utf8');
  const hasMgrToken = /SYNC_API_TOKEN\s*=\s*'[a-f0-9]{32,}'/i.test(kakunin)
    || /Bearer\s+[a-f0-9]{32,}/i.test(kakunin)
    || kakunin.includes('tokaicentralboys2012');
  check('5', 'kakunin.html に管理者用長トークンを埋め込まない', !hasMgrToken);

  /* XSS エスケープ関数の存在 */
  check('5', 'HTMLエスケープ関数 esc() がテンプレ／成果物にある',
    /function\s+esc\s*\(/.test(html));
}

async function main() {
  if (!existsSync(join(ROOT, 'boys15', 'index.html'))) {
    console.error('boys15/index.html がありません。先に build してください。');
    process.exit(2);
  }

  const server = await startServer();
  const browser = await chromium.launch();

  try {
    await section1_Functional(browser);
    await section2_ResponsiveDark(browser);
    await section3_OfflineRotatePersist(browser);
    await section4_ParentAndAssets(browser);
    await section5_SecurityStatic();
  } finally {
    await browser.close();
    server.close();
  }

  const fail = results.filter((r) => !r.ok);
  const pass = results.filter((r) => r.ok);
  console.log('\n------------------------------------------------------------');
  console.log(`結果: ${pass.length} PASS / ${fail.length} FAIL / 合計 ${results.length}`);
  if (fail.length) {
    console.log('失敗一覧:');
    fail.forEach((f) => console.log(`  - [${f.section}] ${f.name}${f.detail ? ` (${f.detail})` : ''}`));
    process.exit(1);
  }
  console.log('OK: 自動実行可能なQA項目はすべて合格');
}

main().catch((e) => { console.error(e); process.exit(1); });
