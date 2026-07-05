#!/usr/bin/env node
/**
 * 交代報告フローの E2E セットアップ
 * - 実施確定済み履歴から保護者確認URLを再公開
 * - （任意）保護者側の交代申請を API で投入
 *
 * 使い方:
 *   SYNC_API_TOKEN='…' node cloudflare-sync/scripts/e2e-swap-flow.mjs
 *   SYNC_API_TOKEN='…' node cloudflare-sync/scripts/e2e-swap-flow.mjs --submit-swap
 */
import process from 'node:process';

const API_BASE = (process.env.SYNC_API_BASE || 'https://tcb-tools-sync.kazoo-matsu.workers.dev').replace(/\/+$/, '');
const TOKEN = String(process.env.SYNC_API_TOKEN || '').trim();
const COHORT = process.argv.includes('--cohort')
  ? process.argv[process.argv.indexOf('--cohort') + 1]
  : '15';
const PARENT_BASE = process.argv.includes('--parent-url')
  ? process.argv[process.argv.indexOf('--parent-url') + 1]
  : 'https://tcb15-admin.github.io/tcb-tools/boys15/kakunin.html';
const SUBMIT_SWAP = process.argv.includes('--submit-swap');
const SWAP_TOOL = argValue('--tool') || '雑カゴ①';
const SWAP_FROM = argValue('--from') || '11：植松';
const SWAP_TO = argValue('--to') || '15：神野';
const SWAP_COMMENT = argValue('--comment') || 'E2E通しテスト申請';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : '';
}

function fail(msg) {
  console.error('ERROR:', msg);
  process.exit(1);
}

async function api(path, method = 'GET', body) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
    err.data = data;
    throw err;
  }
  return data;
}

function memberMasterExcluded(m) {
  return !!(m && (m.rest || m.coach || m.ac14 || m.sibling));
}

function fmtDayLabelJa(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || '');
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const wk = ['日', '月', '火', '水', '木', '金', '土'];
  const dt = new Date(y, mo - 1, d);
  return `${mo}/${d}(${wk[dt.getDay()]})`;
}

function buildParentViewItems(map, tools, la, lb) {
  const byName = {};
  (tools || []).forEach((t) => {
    if (t && t.name) byName[t.name] = t;
  });
  const items = [];
  Object.keys(map || {}).forEach((toolName) => {
    const person = map[toolName];
    if (!person) return;
    const t = byName[toolName];
    const team = t && (t.team === 'A' || t.team === 'B') ? t.team : '';
    const teamLabel = team === 'A' ? la || '' : team === 'B' ? lb || '' : '';
    items.push({ tool: toolName, desc: '', person, team, teamLabel });
  });
  return items;
}

function buildEligibleRosterForSnap(snap, mb) {
  const abs = snap && snap.absS && typeof snap.absS === 'object' ? snap.absS : {};
  const ocha = snap && snap.ochS && typeof snap.ochS === 'object' ? snap.ochS : {};
  const out = [];
  (mb || []).forEach((m) => {
    if (!m || !m.name) return;
    if (memberMasterExcluded(m)) return;
    if (abs[m.name]) return;
    out.push({ name: m.name, ocha: ocha[m.name] ? 1 : 0 });
  });
  return out;
}

function buildParentPublishPayload(history, teamName, mb) {
  const confirmed = (history || [])
    .filter((h) => h && h.confirmedAt && h.map && typeof h.map === 'object')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const top = confirmed.slice(0, 2);
  const days = [];
  top.forEach((snap, i) => {
    const tools = Array.isArray(snap.tools) ? snap.tools : [];
    const items = buildParentViewItems(snap.map, tools, snap.la, snap.lb);
    if (!items.length) return;
    days.push({
      date: '',
      label: fmtDayLabelJa(snap.date),
      role: i === 0 ? 'today' : 'prev',
      items,
      members: buildEligibleRosterForSnap(snap, mb),
    });
  });
  return { teamName, days };
}

function buildParentViewUrl(shareId) {
  const base = String(PARENT_BASE || '').trim();
  if (!base) return '';
  return `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(shareId)}`;
}

function printChecklist({ mgrUrl, parentUrl, shareId, swap }) {
  console.log('\n=== E2E テスト手順（MGR 側はブラウザ操作） ===\n');
  console.log('【A. 初回の割り振り送信を体験する場合】');
  console.log('  1. 道具MGR を開く:', mgrUrl);
  console.log('  2. STEP3 で活動日を選び「割振りを実行」→「実施確定」');
  console.log('  3. 「展開情報を確認・LINE送信」→ 下部「LINEへ展開」');
  console.log('  4. コピーされた本文を LINE グループに貼り付けて送信');
  console.log('     （保護者確認URL が含まれます）\n');
  console.log('【B. 交代報告〜反映〜再通知（今回 API で公開済み）】');
  console.log('  保護者確認URL:', parentUrl);
  console.log('  shareId:', shareId);
  if (swap) {
    console.log('  テスト申請:', `${swap.tool} ${swap.from} → ${swap.to} (${swap.status})`);
  } else {
    console.log('  保護者画面で交代申請を送るか、--submit-swap で API 投入');
  }
  console.log('  1. 道具MGR:', mgrUrl);
  console.log('  2. STEP3 の活動日を「当日（today）」の日付に合わせる');
  console.log('  3. 📮 交代報告 → 未処理があれば「反映する」');
  console.log('  4. STEP3「実施確定」');
  console.log('  5. 再通知ダイアログ OK → 本文コピー → LINE に貼り付けて送信');
  console.log('  6. 保護者URLを開き「受付状況」が反映済みか確認\n');
}

async function main() {
  if (!TOKEN) fail('SYNC_API_TOKEN を環境変数で指定してください');

  const [{ master }, { history }] = await Promise.all([
    api(`/api/state?cohort=${encodeURIComponent(COHORT)}`),
    api(`/api/history?cohort=${encodeURIComponent(COHORT)}&days=365`),
  ]);

  const teamName = COHORT === '16' ? '東海中央ボーイズ 16期' : '東海中央ボーイズ 15期';
  const mb = (master && master.MB) || [];
  const payload = buildParentPublishPayload(history, teamName, mb);
  if (!payload.days.length) {
    fail('実施確定済みの履歴がありません。先に道具MGRで「実施確定」を行ってください。');
  }

  console.log('公開対象（直近2日）:');
  payload.days.forEach((d) => {
    console.log(`  - ${d.role} ${d.label} items=${d.items.length} members=${d.members.length}`);
  });

  const pub = await api('/api/publish-day', 'POST', { cohort: COHORT, teamName, days: payload.days });
  const shareId = pub.shareId;
  const parentUrl = buildParentViewUrl(shareId);
  const mgrUrl = COHORT === '16'
    ? 'https://tcb15-admin.github.io/tcb-tools/boys16/'
    : 'https://tcb15-admin.github.io/tcb-tools/boys15/';

  console.log('\n公開完了');
  console.log('shareId:', shareId);
  console.log('保護者URL:', parentUrl);

  let swapInfo = null;
  if (SUBMIT_SWAP) {
    const today = payload.days.find((d) => d.role === 'today') || payload.days[0];
    const item = (today.items || []).find((it) => it.tool === SWAP_TOOL);
    if (!item) fail(`道具「${SWAP_TOOL}」が公開データにありません`);
    if (item.person !== SWAP_FROM) {
      fail(`現担当不一致: 公開データは「${item.person}」、指定は「${SWAP_FROM}」`);
    }
    try {
      const created = await api('/api/public/swap-report', 'POST', {
        shareId,
        dayKey: today.role,
        tool: SWAP_TOOL,
        fromPerson: SWAP_FROM,
        toPerson: SWAP_TO,
        reporter: SWAP_FROM,
        comment: SWAP_COMMENT,
      });
      swapInfo = {
        tool: SWAP_TOOL,
        from: SWAP_FROM,
        to: SWAP_TO,
        status: 'pending',
        id: created.id,
      };
      console.log('\n交代申請を投入しました:', `${SWAP_TOOL} ${SWAP_FROM} → ${SWAP_TO}`);
    } catch (e) {
      if (e.data && e.data.error === 'duplicate_pending') {
        swapInfo = { tool: SWAP_TOOL, from: SWAP_FROM, to: SWAP_TO, status: 'duplicate_pending' };
        console.log('\n同一内容の未処理申請が既にあります（スキップ）');
      } else {
        throw e;
      }
    }

    const reports = await api(`/api/swap-reports?cohort=${encodeURIComponent(COHORT)}`);
    console.log('未処理件数:', reports.pending);
  }

  printChecklist({ mgrUrl, parentUrl, shareId, swap: swapInfo });
}

main().catch((err) => {
  console.error(err.data || err.message || err);
  process.exit(1);
});
