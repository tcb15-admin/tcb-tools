#!/usr/bin/env node
/**
 * 15期 操作マニュアル用スクショ取得
 * 前提: python3 -m http.server 8765 をリポジトリルートで起動
 * 実行: cd boys15/docs/scripts && node capture-screenshots.mjs
 */
import puppeteer from 'puppeteer';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'images');
const BASE = 'http://127.0.0.1:8765/boys15/';
const PW = 'tcb15';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: !!opts.fullPage });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // マニュアル掲載用はライトモード固定
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  // alert/confirm がクリックをブロックしないよう自動処理する
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.evaluateOnNewDocument(() => {
    window.alert = () => {};
    window.confirm = () => true;
  });

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('#pw-screen', { visible: true, timeout: 15000 });
  await shot(page, '01-login.png');

  await page.type('#pw-inp', PW);
  await page.click('#pw-btn');
  await page.waitForFunction(() => {
    const p = document.getElementById('pw-screen');
    return p && getComputedStyle(p).display === 'none';
  }, { timeout: 15000 });
  await page.waitForSelector('#p1.on', { timeout: 15000 });
  await delay(800);

  await page.click('#btn-kata');
  await shot(page, '02-step1.png', { fullPage: true });

  await page.click('#btn-s2');
  await page.waitForSelector('#p2.on', { timeout: 10000 });
  await delay(500);
  await shot(page, '03-step2-absence.png', { fullPage: true });

  await page.waitForSelector('#tcard', { visible: true, timeout: 10000 });
  const tcell = await page.$('#tgrid .tc2:not(.ex)');
  if (tcell) await tcell.click();
  await page.evaluate(() => document.getElementById('tcard')?.scrollIntoView({ block: 'start' }));
  await delay(300);
  await shot(page, '03b-step2-group.png', { fullPage: true });

  await page.click('#btn-run');
  await page.waitForSelector('#p3.on', { timeout: 25000 });
  await delay(600);
  await shot(page, '04-step3.png', { fullPage: true });

  await page.click('#btn-open-share');
  await page.waitForSelector('#print-overlay.open', { timeout: 10000 });
  await delay(400);
  await shot(page, '05-print-preview.png');

  await page.click('#print-overlay .mclose, #print-close');
  const closePrint = await page.$('#print-overlay button');
  if (closePrint) {
    await page.evaluate(() => document.getElementById('print-overlay')?.classList.remove('open'));
  }

  await page.click('#btn-master');
  await page.waitForSelector('#p-master.on', { timeout: 10000 });
  await delay(400);
  await shot(page, '06-master.png', { fullPage: true });
  await page.click('#btn-master-back');

  await page.waitForSelector('#p1.on, #p2.on, #p3.on', { timeout: 5000 }).catch(() => {});
  await page.click('#btn-history');
  await page.waitForSelector('#hist-modal.open', { timeout: 10000 });
  await delay(400);
  await shot(page, '07-history.png');

  await browser.close();
  console.log('OK:', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
