#!/usr/bin/env node
/**
 * Markdown + images → PDF（15期操作マニュアル）
 * 実行: cd boys15/docs/scripts && node build-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(__dirname, '..');
const MD_PATH = path.join(DOCS, 'TCB-MAN-001_道具割り振りツール_操作マニュアル_v1.5.md');
const OUT = path.join(DOCS, 'TCB-MAN-001_道具割り振りツール_操作マニュアル_v1.5.pdf');

const MANUAL_PDF_URL =
  'https://tcb15-admin.github.io/tcb-tools/boys15/docs/TCB-MAN-001_道具割り振りツール_操作マニュアル_v1.5.pdf';

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMd(s) {
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    out += esc(s.slice(last, m.index));
    if (m[1] !== undefined) out += `<strong>${esc(m[1])}</strong>`;
    else if (m[2] !== undefined) out += `<code>${esc(m[2])}</code>`;
    else out += `<a href="${esc(m[4])}">${esc(m[3])}</a>`;
    last = re.lastIndex;
  }
  return out + esc(s.slice(last));
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  let html = '';
  let i = 0;
  let inCode = false;
  let codeLang = '';
  let codeBuf = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
      } else {
        if (codeLang === 'mermaid') {
          html += `<pre class="mermaid">${codeBuf.join('\n')}</pre>`;
        }
        inCode = false;
        codeLang = '';
        codeBuf = [];
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|[-: ]/)) {
      html += '<table class="tbl">';
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!lines[i].match(/^\|[-: ]/)) {
          const cells = lines[i]
            .split('|')
            .slice(1, -1)
            .map((c) => `<td>${inlineMd(c.trim())}</td>`)
            .join('');
          html += `<tr>${cells}</tr>`;
        }
        i++;
      }
      html += '</table>';
      continue;
    }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (img) {
      const src = path.join(DOCS, img[2]);
      const rel = path.relative(DOCS, src).split(path.sep).join('/');
      let cap = img[1];
      if (lines[i + 1]?.match(/^\*図/)) {
        cap = lines[i + 1].replace(/^\*|\*$/g, '');
        i += 2;
      } else i++;
      html += `<figure><img src="${esc(rel)}" alt="${esc(img[1])}"/><figcaption>${inlineMd(cap)}</figcaption></figure>`;
      continue;
    }
    if (line.startsWith('# ')) {
      html += `<h1>${inlineMd(line.slice(2))}</h1>`;
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      html += `<h2>${inlineMd(line.slice(3))}</h2>`;
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      html += `<h3>${inlineMd(line.slice(4))}</h3>`;
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      html += `<blockquote>${inlineMd(line.slice(2))}</blockquote>`;
      i++;
      continue;
    }
    if (line.match(/^- \[ \]/)) {
      html += `<p class="chk">☐ ${inlineMd(line.replace(/^- \[ \]\s*/, ''))}</p>`;
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      html += `<li>${inlineMd(line.slice(2))}</li>`;
      i++;
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      html += `<p class="num">${inlineMd(line)}</p>`;
      i++;
      continue;
    }
    if (line.startsWith('---')) {
      html += '<hr/>';
      i++;
      continue;
    }
    html += `<p>${inlineMd(line)}</p>`;
    i++;
  }
  return html;
}

const md = fs.readFileSync(MD_PATH, 'utf8');
const body = mdToHtml(md);

const fullHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<title>15期 道具割り振りツール 操作マニュアル v1.5</title>
<style>
  @page { margin: 18mm 14mm; }
  body { font-family: "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif; font-size: 10.5pt; line-height: 1.55; color: #222; max-width: 100%; }
  h1 { font-size: 18pt; color: #1a237e; border-bottom: 2px solid #1a237e; padding-bottom: 6px; margin-top: 0; page-break-after: avoid; }
  h2 { font-size: 13pt; color: #283593; margin-top: 1.2em; page-break-after: avoid; }
  h3 { font-size: 11pt; margin-top: 1em; page-break-after: avoid; }
  p, li, blockquote, table { margin: 0.4em 0; }
  blockquote { background: #f5f5f5; border-left: 4px solid #90a4ae; padding: 8px 12px; font-size: 9.5pt; }
  .url-box { background: #e3f2fd; border: 2px solid #1565c0; padding: 12px 14px; margin: 12px 0 20px; border-radius: 6px; }
  .url-box strong { display: block; font-size: 11pt; color: #0d47a1; margin-bottom: 6px; }
  .url-box a { word-break: break-all; font-size: 10pt; color: #1565c0; }
  table.tbl { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 8px 0; }
  table.tbl td { border: 1px solid #ccc; padding: 5px 8px; vertical-align: top; }
  figure { margin: 10px 0 16px; page-break-inside: avoid; }
  figure img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; }
  figcaption { font-size: 9pt; color: #555; margin-top: 4px; font-style: italic; }
  code { background: #eee; padding: 1px 4px; border-radius: 3px; font-size: 9pt; }
  hr { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
  li { margin-left: 1.2em; }
  pre.mermaid { background: transparent; border: none; padding: 0; margin: 12px 0 16px; overflow: visible; page-break-inside: avoid; }
  pre.mermaid svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
<div class="url-box">
<strong>15期道具マネージャー向け — 最新マニュアル（公式参照URL）</strong>
<a href="${MANUAL_PDF_URL}">${MANUAL_PDF_URL}</a>
<p style="margin:8px 0 0;font-size:9pt;">通知・引き継ぎ時は<strong>常にこのPDFのURL</strong>を案内してください。内容の更新は同URLで上書きされます。</p>
</div>
${body}
</body>
</html>`;

const htmlPath = path.join(DOCS, '_build-manual.html');
fs.writeFileSync(htmlPath, fullHtml, 'utf8');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js' });
await page.evaluate(async () => {
  if (typeof mermaid === 'undefined') return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
  });
  const nodes = document.querySelectorAll('pre.mermaid');
  if (nodes.length) await mermaid.run({ nodes });
});
await new Promise((r) => setTimeout(r, 1500));
await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
});
await browser.close();
fs.unlinkSync(htmlPath);
console.log('Wrote', OUT);
