/* 端末別 LINE共有方針の自動検証（UA 差し替え） */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..'));
const PORT = 18940;
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
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function startServer() {
  const server = createServer(async (req, res) => {
    let p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (p.endsWith('/')) p = join(p, 'index.html');
    if (!existsSync(p)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(p));
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

const CASES = [
  {
    name: 'iPhone Safari',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    expect: { strategy: 'ios-combined', label: 'LINEへ展開', avoidPdfShare: false },
  },
  {
    name: 'Android Chrome',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    expect: { strategy: 'android-share', label: 'LINEへ展開', avoidPdfShare: false },
  },
  {
    name: 'Mac Chrome',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    expect: { strategy: 'desktop-copy', label: '本文をコピー', avoidPdfShare: true },
  },
  {
    name: 'Windows Edge',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    expect: { strategy: 'desktop-copy', label: '本文をコピー', avoidPdfShare: true },
  },
  {
    name: 'iPadOS (Macintosh+touch)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    touchPoints: 5,
    expect: { strategy: 'ios-combined', label: 'LINEへ展開', avoidPdfShare: false, platform: 'ipad' },
  },
];

async function main() {
  if (!existsSync(join(ROOT, 'boys15', 'index.html'))) {
    console.error('boys15/index.html がありません');
    process.exit(2);
  }
  const server = await startServer();
  const browser = await chromium.launch();

  for (const c of CASES) {
    console.log(`\n== ${c.name} ==`);
    const context = await browser.newContext({
      userAgent: c.ua,
      viewport: { width: 390, height: 844 },
      hasTouch: (c.touchPoints || 0) > 0,
    });
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === '127.0.0.1') route.continue();
      else route.abort();
    });
    const page = await context.newPage();
    if (c.touchPoints) {
      await page.addInitScript((n) => {
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => n });
      }, c.touchPoints);
    }
    await page.goto(`http://127.0.0.1:${PORT}/boys15/index.html`);
    const info = await page.evaluate(() => {
      const D = window.TCB_Device;
      if (!D) return null;
      return {
        strategy: D.lineShareStrategy(),
        label: D.sharePrimaryLabel(),
        avoidPdfShare: D.shouldAvoidPdfFileWebShare(),
        platform: D.platformId(),
        pdfLbl: D.pdfOptionLabel(),
        hint: D.sharePanelHint(),
      };
    });
    check(`${c.name}: TCB_Device 読込`, !!info);
    if (info) {
      check(`${c.name}: strategy`, info.strategy === c.expect.strategy, info.strategy);
      check(`${c.name}: ボタンラベル`, info.label === c.expect.label, info.label);
      check(`${c.name}: avoidPdfFileWebShare`, info.avoidPdfShare === c.expect.avoidPdfShare, String(info.avoidPdfShare));
      if (c.expect.platform) {
        check(`${c.name}: platform`, info.platform === c.expect.platform, info.platform);
      }
      if (c.expect.strategy === 'desktop-copy') {
        check(`${c.name}: ヒントあり`, (info.hint || '').length > 20);
        check(`${c.name}: PDFラベルにダウンロード言及`, /ダウンロード/.test(info.pdfLbl));
      }
    }
    await context.close();
  }

  await browser.close();
  server.close();
  console.log('');
  if (failures) {
    console.error(`NG: ${failures} 件失敗`);
    process.exit(1);
  }
  console.log('OK: 端末別共有方針テスト合格');
}

main().catch((e) => { console.error(e); process.exit(1); });
