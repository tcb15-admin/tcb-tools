#!/usr/bin/env node
/**
 * Markdown（画像付き）→ Word (.docx)
 * 実行: node boys16/docs/scripts/build-docx.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(__dirname, '..');
const MD_PATH = path.join(DOCS, 'TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.md');
const OUT = path.join(DOCS, 'TCB-MAN-016_道具割り振りツール_操作マニュアル_v1.5.docx');

function imgPara(rel, caption, maxW = 520) {
  const full = path.join(DOCS, rel);
  if (!fs.existsSync(full)) {
    return [new Paragraph({ children: [new TextRun({ text: `[画像: ${rel}]`, color: '888888' })] })];
  }
  const data = fs.readFileSync(full);
  const out = [
    new Paragraph({
      children: [
        new ImageRun({
          data,
          transformation: { width: maxW, height: Math.round(maxW * 0.62) },
        }),
      ],
      spacing: { before: 120, after: 80 },
    }),
  ];
  if (caption) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: caption, italics: true, size: 20, color: '444444' })],
        spacing: { after: 200 },
      })
    );
  }
  return out;
}

function stripMd(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function parseMd(text) {
  const children = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let inCode = false;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) {
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|[-: ]/)) {
      while (i < lines.length && lines[i].startsWith('|')) i++;
      continue;
    }
    const img = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (img) {
      const cap = lines[i + 1]?.match(/^\*([^*]+)\*$/) ? stripMd(lines[i + 1].replace(/^\*|\*$/g, '')) : img[1];
      children.push(...imgPara(img[2], cap));
      if (lines[i + 1]?.startsWith('*図')) i += 2;
      else i++;
      continue;
    }
    if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: stripMd(line.slice(2)), heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }));
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: stripMd(line.slice(3)), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: stripMd(line.slice(4)), heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } }));
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: stripMd(line.slice(2)), italics: true, size: 21, color: '333333' })],
          indent: { left: 360 },
          spacing: { after: 100 },
        })
      );
      i++;
      continue;
    }
    if (line.match(/^- \[ \]/)) {
      children.push(new Paragraph({ text: '☐ ' + stripMd(line.replace(/^- \[ \]\s*/, '')), spacing: { after: 60 }, indent: { left: 360 } }));
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      children.push(new Paragraph({ text: '• ' + stripMd(line.slice(2)), spacing: { after: 60 }, indent: { left: 360 } }));
      i++;
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      children.push(new Paragraph({ text: stripMd(line), spacing: { after: 60 }, indent: { left: 360 } }));
      i++;
      continue;
    }
    if (line.startsWith('---')) {
      i++;
      continue;
    }
    children.push(new Paragraph({ children: [new TextRun({ text: stripMd(line), size: 22 })], spacing: { after: 80 } }));
    i++;
  }
  return children;
}

const md = fs.readFileSync(MD_PATH, 'utf8');
const doc = new Document({ sections: [{ properties: {}, children: parseMd(md) }] });
const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);
console.log('Wrote', OUT);
