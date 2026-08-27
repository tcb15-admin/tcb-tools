#!/usr/bin/env node
/**
 * Cloudflare D1 のマスタを boys15/master.json に書き出す（ビルド用スナップショット更新）
 *
 * 運用中の正本は D1。Git の master.json は自動では更新されないため、
 * マスタを参照して実装・回答するときは本スクリプト実行後のファイルを使う。
 *
 * 使い方:
 *   SYNC_API_TOKEN='…' node cloudflare-sync/scripts/pull-master.mjs
 *   SYNC_API_TOKEN='…' node cloudflare-sync/scripts/pull-master.mjs --cohort 15 --out boys15/master.json
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const API_BASE = (process.env.SYNC_API_BASE || 'https://tcb-tools-sync.kazoo-matsu.workers.dev').replace(/\/+$/, '');
const TOKEN = String(process.env.SYNC_API_TOKEN || '').trim();

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : '';
}

const COHORT = argValue('--cohort') || '15';
const OUT = path.resolve(REPO_ROOT, argValue('--out') || 'boys15/master.json');

function fail(msg) {
  console.error('ERROR:', msg);
  process.exit(1);
}

async function api(pathname) {
  const headers = { Accept: 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${API_BASE}${pathname}`, { headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || res.statusText || 'request_failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

function syncMemberFixFromTools(mb, tl) {
  const members = Array.isArray(mb) ? mb : [];
  members.forEach((m) => {
    if (m && typeof m === 'object') m.fix = null;
  });
  const byName = {};
  members.forEach((m) => {
    if (m && m.name) byName[m.name] = m;
  });
  (Array.isArray(tl) ? tl : []).forEach((t) => {
    if (!t || !t.name) return;
    const fixed = t.fixed == 1 || t.fixed === '1' || t.fixed === true;
    const person = t.note != null ? String(t.note).trim() : '';
    if (!fixed || !person) return;
    const m = byName[person];
    if (m) m.fix = t.name;
  });
  return members;
}

function buildPayload(state) {
  const master = state.master || {};
  const mb = syncMemberFixFromTools(
    JSON.parse(JSON.stringify(Array.isArray(master.MB) ? master.MB : [])),
    Array.isArray(master.TL) ? master.TL : []
  );
  const payload = {
    _meta: {
      source: 'cloudflare-d1',
      cohort: COHORT,
      cloudVersion: state.version != null ? state.version : null,
      syncedAt: new Date().toISOString(),
      apiBase: API_BASE,
      note: 'ビルド用スナップショット。運用の正本は D1。pull-master.mjs で更新。',
    },
    MB: mb,
    TL: JSON.parse(JSON.stringify(Array.isArray(master.TL) ? master.TL : [])),
    DESCS: JSON.parse(JSON.stringify(master.DESCS && typeof master.DESCS === 'object' ? master.DESCS : {})),
  };
  if (master.PAST != null) payload.PAST = JSON.parse(JSON.stringify(master.PAST));
  if (Object.prototype.hasOwnProperty.call(master, 'DEF_TM')) payload.DEF_TM = master.DEF_TM;
  return payload;
}

async function main() {
  if (!TOKEN) {
    fail('SYNC_API_TOKEN が未設定です（Worker API 用 Bearer）。');
  }
  const state = await api(`/api/state?cohort=${encodeURIComponent(COHORT)}`);
  if (!state || !state.master) {
    fail('API 応答に master がありません');
  }
  const payload = buildPayload(state);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const tl = payload.TL.length;
  const fixed = payload.TL.filter((t) => t && (t.fixed == 1 || t.fixed === '1')).length;
  console.log(`[OK] master → ${OUT}`);
  console.log(`     cohort=${COHORT} version=${payload._meta.cloudVersion} TL=${tl} fixed=${fixed}`);
  console.log(`     syncedAt=${payload._meta.syncedAt}`);
}

main().catch((err) => {
  console.error('ERROR:', err.message || err);
  if (err.status === 401) console.error('  → SYNC_API_TOKEN を確認してください');
  process.exit(1);
});
