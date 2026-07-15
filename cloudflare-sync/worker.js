import { sendNotification, WebPushError } from "web-push-neo";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    const url = new URL(request.url);
    // 保護者向け公開経路（shareId で個別検証）だけは Bearer 認証を課さない
    const isPublic = url.pathname.startsWith("/api/public/");
    if (!isPublic && !authorize(request, env)) return json({ error: "unauthorized" }, 401);

    try {
      // ===== 保護者向け公開エンドポイント（トークン不要・shareId 必須） =====
      if (url.pathname === "/api/public/day" && request.method === "GET") {
        const sid = (url.searchParams.get("sid") || "").trim();
        return json(await getPublicDay(env, sid));
      }
      if (url.pathname === "/api/public/swap-report" && request.method === "POST") {
        const body = await request.json();
        const result = await createSwapReport(env, body);
        if (ctx && result.ok && result._pushMeta) {
          const meta = result._pushMeta;
          ctx.waitUntil(notifySwapReportPush(env, meta.cohort, meta.report).catch(() => {}));
          delete result._pushMeta;
        }
        return json(result);
      }
      if (url.pathname === "/api/public/swap-status" && request.method === "GET") {
        const sid = (url.searchParams.get("sid") || "").trim();
        const person = url.searchParams.get("person") || "";
        return json(await getSwapStatusPublic(env, sid, person));
      }
      if (url.pathname === "/api/public/attendance" && request.method === "GET") {
        const sid = (url.searchParams.get("sid") || "").trim();
        return json(await getPublicAttendance(env, sid));
      }
      if (url.pathname === "/api/public/attendance-response" && request.method === "POST") {
        const body = await request.json();
        return json(await setAttendanceResponsePublic(env, body));
      }
      // ===== 確認ページ発行/失効（Bearer 保護） =====
      if (url.pathname === "/api/publish-day" && request.method === "POST") {
        const body = await request.json();
        return json(await publishDay(env, body));
      }
      if (url.pathname === "/api/unpublish-day" && request.method === "POST") {
        const body = await request.json();
        return json(await unpublishDay(env, body));
      }
      // ===== 交代報告（道具MGR側・Bearer 保護） =====
      if (url.pathname === "/api/swap-reports" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        return json(await listSwapReports(env, cohort));
      }
      if (url.pathname === "/api/swap-reports/handle" && request.method === "POST") {
        const body = await request.json();
        return json(await handleSwapReport(env, body));
      }
      if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
        const body = await request.json();
        return json(await savePushSubscription(env, body));
      }
      if (url.pathname === "/api/state" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        return json(await getState(env, cohort));
      }
      if (url.pathname === "/api/save-master" && request.method === "POST") {
        const body = await request.json();
        return json(await saveMaster(env, body));
      }
      if (url.pathname === "/api/history-upsert" && request.method === "POST") {
        const body = await request.json();
        return json(await historyUpsert(env, body));
      }
      if (url.pathname === "/api/history" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        const days = parseInt(url.searchParams.get("days") || "365", 10);
        return json({ history: await listHistory(env, cohort, days) });
      }
      if (url.pathname === "/api/history-delete" && request.method === "POST") {
        const body = await request.json();
        return json({ history: await deleteHistoryByDates(env, body) });
      }
      if (url.pathname === "/api/history-clear" && request.method === "POST") {
        const body = await request.json();
        await clearHistory(env, body);
        return json({ ok: true });
      }
      if (url.pathname === "/api/confirm-carryout" && request.method === "POST") {
        const body = await request.json();
        return json(await confirmCarryout(env, body));
      }
      // ===== 出欠（Bearer） =====
      if (url.pathname === "/api/attendance/activities" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        return json(await listActivities(env, cohort));
      }
      if (url.pathname === "/api/attendance/activities" && request.method === "POST") {
        const body = await request.json();
        return json(await upsertActivity(env, body));
      }
      if (url.pathname === "/api/attendance/activity" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        const id = (url.searchParams.get("id") || "").trim();
        return json(await getActivityDetail(env, cohort, id));
      }
      if (url.pathname === "/api/attendance/publish" && request.method === "POST") {
        const body = await request.json();
        return json(await publishAttendance(env, body));
      }
      if (url.pathname === "/api/attendance/response" && request.method === "POST") {
        const body = await request.json();
        return json(await setAttendanceResponseAdmin(env, body));
      }
      if (url.pathname === "/api/attendance/cross-events" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        const since = (url.searchParams.get("since") || "").trim();
        return json(await listCrossRoleEvents(env, cohort, since));
      }
      return json({ error: "not_found" }, 404);
    } catch (e) {
      return json({ error: e.message || "server_error" }, 400);
    }
  },
};

function authorize(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return !!token && token === env.SYNC_API_TOKEN;
}

function cors(res) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return new Response(res.body, { status: res.status, headers });
}
function json(obj, status = 200) {
  return cors(
    new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    })
  );
}

function mustCohort(v) {
  const c = String(v || "").trim();
  if (!c) throw new Error("cohort_required");
  return c;
}

async function ensureState(env, cohort) {
  const row = await env.DB.prepare("SELECT cohort, version, master_json, carryout_meta_json FROM tool_state WHERE cohort = ?")
    .bind(cohort)
    .first();
  if (row) return row;
  const now = new Date().toISOString();
  const master = { MB: [], TL: [], DESCS: {}, PAST: {}, DEF_TM: null };
  await env.DB.prepare(
    "INSERT INTO tool_state (cohort, version, master_json, carryout_meta_json, updated_at) VALUES (?, 0, ?, ?, ?)"
  )
    .bind(cohort, JSON.stringify(master), JSON.stringify({ byDate: {} }), now)
    .run();
  return {
    cohort,
    version: 0,
    master_json: JSON.stringify(master),
    carryout_meta_json: JSON.stringify({ byDate: {} }),
  };
}

async function getState(env, cohortRaw) {
  const cohort = mustCohort(cohortRaw);
  const row = await ensureState(env, cohort);
  return {
    cohort,
    version: Number(row.version) || 0,
    master: JSON.parse(row.master_json || "{}"),
    carryoutMeta: JSON.parse(row.carryout_meta_json || '{"byDate":{}}'),
  };
}

async function saveMaster(env, body) {
  const cohort = mustCohort(body.cohort);
  const expectedVersion = Number(body.expectedVersion || 0);
  const master = body.master || {};
  const cur = await ensureState(env, cohort);
  const currentVersion = Number(cur.version) || 0;
  if (expectedVersion !== currentVersion) {
    throw new Error("version_conflict");
  }
  const nextVersion = currentVersion + 1;
  await env.DB.prepare("UPDATE tool_state SET version = ?, master_json = ?, updated_at = ? WHERE cohort = ?")
    .bind(nextVersion, JSON.stringify(master), new Date().toISOString(), cohort)
    .run();
  return { ok: true, version: nextVersion };
}

async function historyUpsert(env, body) {
  const cohort = mustCohort(body.cohort);
  const snap = body.snap || {};
  const activityDate = String(snap.date || "").trim();
  if (!activityDate) throw new Error("activity_date_required");
  const savedAt = String(snap.savedAt || new Date().toISOString());
  await env.DB.prepare(
    "INSERT INTO history_events (cohort, activity_date, saved_at, snap_json) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(cohort, activity_date) DO UPDATE SET saved_at = excluded.saved_at, snap_json = excluded.snap_json"
  )
    .bind(cohort, activityDate, savedAt, JSON.stringify(snap))
    .run();
  return { ok: true, history: await listHistory(env, cohort, 365) };
}

async function listHistory(env, cohortRaw, daysRaw) {
  const cohort = mustCohort(cohortRaw);
  const days = Math.max(1, Math.min(3650, Number(daysRaw || 365)));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString().slice(0, 10);
  const rs = await env.DB.prepare(
    "SELECT snap_json FROM history_events WHERE cohort = ? AND activity_date >= ? ORDER BY activity_date DESC"
  )
    .bind(cohort, startIso)
    .all();
  return (rs.results || []).map((r) => JSON.parse(r.snap_json || "{}"));
}

async function deleteHistoryByDates(env, body) {
  const cohort = mustCohort(body.cohort);
  const dates = Array.isArray(body.dates) ? body.dates : [];
  for (const d of dates) {
    await env.DB.prepare("DELETE FROM history_events WHERE cohort = ? AND activity_date = ?")
      .bind(cohort, String(d))
      .run();
  }
  return listHistory(env, cohort, 365);
}

async function clearHistory(env, body) {
  const cohort = mustCohort(body.cohort);
  await env.DB.prepare("DELETE FROM history_events WHERE cohort = ?").bind(cohort).run();
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

const PAST_LOAD_DEFAULT = 15;

function weightLoadRankForLscore(wt) {
  const w = String(wt || "");
  if (w === "Very heavy") return 5;
  if (w === "Heavy") return 4;
  if (w === "Medium") return 3;
  if (w === "Light") return 2;
  if (w === "Very light") return 1;
  return 3;
}
function lengthLoadRankForLscore(sz) {
  const z = String(sz || "").toUpperCase();
  if (z === "LL" || z === "SL") return 3;
  if (z === "L") return 2;
  if (z === "M") return 1;
  return 0;
}
function lscoreFromTool(t) {
  if (!t) return PAST_LOAD_DEFAULT;
  return weightLoadRankForLscore(t.wt) * 10 + lengthLoadRankForLscore(t.sz);
}
function buildToolLoadMap(tools) {
  const map = {};
  (tools || []).forEach((t) => {
    if (t && t.name) map[t.name] = lscoreFromTool(t);
  });
  return map;
}
function pastLoadForToolName(toolName, toolLoadMap) {
  if (toolLoadMap && toolLoadMap[toolName] !== undefined) return toolLoadMap[toolName];
  return PAST_LOAD_DEFAULT;
}
function roundPast(n) {
  return Math.max(0, Math.round(Number(n) * 10) / 10);
}

function applyMapToPast(past, map, toolLoadMap) {
  Object.keys(map || {}).forEach((tool) => {
    const person = map[tool];
    if (!person) return;
    const load = pastLoadForToolName(tool, toolLoadMap);
    past[person] = roundPast((Number(past[person]) || 0) + load);
  });
}
function revertMapFromPast(past, map, toolLoadMap) {
  Object.keys(map || {}).forEach((tool) => {
    const person = map[tool];
    if (!person) return;
    const load = pastLoadForToolName(tool, toolLoadMap);
    past[person] = roundPast((Number(past[person]) || 0) - load);
  });
}

async function confirmCarryout(env, body) {
  const cohort = mustCohort(body.cohort);
  const activityDate = String(body.activityDate || "").trim();
  const map = body.map || {};
  if (!activityDate) throw new Error("activity_date_required");

  const cur = await ensureState(env, cohort);
  const version = Number(cur.version) || 0;
  const master = JSON.parse(cur.master_json || "{}");
  const carry = JSON.parse(cur.carryout_meta_json || '{"byDate":{}}');
  if (!carry.byDate || typeof carry.byDate !== "object") carry.byDate = {};
  if (!master.PAST || typeof master.PAST !== "object") master.PAST = {};

  const old = carry.byDate[activityDate];
  const toolLoadMap = buildToolLoadMap(body.tools);
  if (old && old.map) revertMapFromPast(master.PAST, old.map, toolLoadMap);
  applyMapToPast(master.PAST, map, toolLoadMap);
  carry.byDate[activityDate] = { map: clone(map) };
  carry.lastMap = clone(map);

  const nextVersion = version + 1;
  await env.DB.prepare(
    "UPDATE tool_state SET version = ?, master_json = ?, carryout_meta_json = ?, updated_at = ? WHERE cohort = ?"
  )
    .bind(nextVersion, JSON.stringify(master), JSON.stringify(carry), new Date().toISOString(), cohort)
    .run();
  return { ok: true, version: nextVersion, past: master.PAST };
}

// ===== 保護者向け確認ページ（案2 Step2-1） =====

function genShareId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

/** 保護者に見せてよい最小情報だけを取り出して整形する（PAST等の内部指標は出さない） */
function sanitizePublishDays(daysRaw) {
  const days = Array.isArray(daysRaw) ? daysRaw : [];
  return days.slice(0, 10).map((d) => {
    const items = Array.isArray(d && d.items) ? d.items : [];
    const members = Array.isArray(d && d.members) ? d.members : [];
    const role = d && (d.role === "today" || d.role === "prev") ? d.role : "";
    return {
      date: String((d && d.date) || ""),
      label: String((d && d.label) || ""),
      role: role,
      items: items.map((it) => ({
        tool: String((it && it.tool) || ""),
        desc: String((it && it.desc) || ""),
        person: String((it && it.person) || ""),
        team: String((it && it.team) || ""),
        teamLabel: String((it && it.teamLabel) || ""),
      })),
      // 交代報告フォームの「新担当」候補（当日の割振り対象メンバー＋お茶当番フラグ）
      members: members
        .slice(0, 80)
        .map((m) => ({
          name: String((m && m.name) || ""),
          ocha: m && (m.ocha === 1 || m.ocha === true || m.ocha === "1") ? 1 : 0,
        }))
        .filter((m) => m.name),
    };
  });
}

async function publishDay(env, body) {
  const cohort = mustCohort(body.cohort);
  const teamName = String(body.teamName || "");
  const days = sanitizePublishDays(body.days);
  const now = new Date().toISOString();
  const view = JSON.stringify({ cohort, teamName, days, updatedAt: now });

  const existing = await env.DB.prepare("SELECT share_id, status FROM published_days WHERE cohort = ?")
    .bind(cohort)
    .first();
  // 通常の再公開では URL を保つ。失効後や rotate 指定時のみ新しい shareId を発行する
  const keep = existing && existing.share_id && existing.status === "active" && !body.rotate;
  const shareId = keep ? existing.share_id : genShareId();

  if (existing) {
    await env.DB.prepare(
      "UPDATE published_days SET share_id = ?, view_json = ?, status = 'active', updated_at = ? WHERE cohort = ?"
    )
      .bind(shareId, view, now, cohort)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO published_days (cohort, share_id, view_json, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)"
    )
      .bind(cohort, shareId, view, now, now)
      .run();
  }
  return { ok: true, shareId, updatedAt: now };
}

async function unpublishDay(env, body) {
  const cohort = mustCohort(body.cohort);
  await env.DB.prepare("UPDATE published_days SET status = 'revoked', updated_at = ? WHERE cohort = ?")
    .bind(new Date().toISOString(), cohort)
    .run();
  return { ok: true };
}

async function getPublicDay(env, sidRaw) {
  const sid = String(sidRaw || "").trim();
  if (!sid || !/^[0-9a-f]{16,64}$/.test(sid)) throw new Error("invalid_share_id");
  const row = await env.DB.prepare("SELECT view_json, status FROM published_days WHERE share_id = ?")
    .bind(sid)
    .first();
  if (!row || row.status !== "active") throw new Error("not_found_or_revoked");
  return JSON.parse(row.view_json || "{}");
}

// ===== 交代報告（保護者→道具MGR） =====

/** shareId から有効な公開データ（cohort と view）を取得。無効/失効は例外。 */
async function getActivePublishedByShare(env, sidRaw) {
  const sid = String(sidRaw || "").trim();
  if (!sid || !/^[0-9a-f]{16,64}$/.test(sid)) throw new Error("invalid_share_id");
  const row = await env.DB.prepare("SELECT cohort, view_json, status FROM published_days WHERE share_id = ?")
    .bind(sid)
    .first();
  if (!row || row.status !== "active") throw new Error("not_found_or_revoked");
  return { cohort: String(row.cohort || ""), view: JSON.parse(row.view_json || "{}") };
}

function findPublishedDay(view, dayKey) {
  const days = Array.isArray(view && view.days) ? view.days : [];
  return days.find((d) => String((d && d.role) || "") === String(dayKey || "")) || null;
}

function mapSwapReportRow(r) {
  return {
    id: String(r.id || ""),
    shareId: String(r.share_id || ""),
    dayKey: String(r.day_key || ""),
    dayLabel: String(r.day_label || ""),
    tool: String(r.tool || ""),
    fromPerson: String(r.from_person || ""),
    toPerson: String(r.to_person || ""),
    reporter: r.reporter ? String(r.reporter) : "",
    comment: r.comment ? String(r.comment) : "",
    status: String(r.status || ""),
    rejectCode: r.reject_code ? String(r.reject_code) : "",
    rejectReason: r.reject_reason ? String(r.reject_reason) : "",
    createdAt: String(r.created_at || ""),
    handledAt: r.handled_at ? String(r.handled_at) : "",
  };
}

/** 保護者からの交代報告を作成（無認証・入口で厳格に検証） */
async function createSwapReport(env, body) {
  const shareId = String((body && body.shareId) || "").trim();
  const dayKey = String((body && body.dayKey) || "").trim();
  const tool = String((body && body.tool) || "").trim();
  const fromPerson = String((body && body.fromPerson) || "").trim();
  const toPerson = String((body && body.toPerson) || "").trim();
  const reporter = String((body && body.reporter) || "").trim().slice(0, 40);
  const comment = String((body && body.comment) || "").trim().slice(0, 100);

  if (!tool || !fromPerson || !toPerson) throw new Error("missing_fields");
  if (toPerson === fromPerson) throw new Error("same_person");

  const { cohort, view } = await getActivePublishedByShare(env, shareId);
  const day = findPublishedDay(view, dayKey);
  if (!day) throw new Error("invalid_day");

  const items = Array.isArray(day.items) ? day.items : [];
  const item = items.find((it) => String((it && it.tool) || "") === tool) || null;
  if (!item) throw new Error("invalid_tool");
  // 現担当Aの鮮度照合（公開データと不一致＝古い内容は拒否）
  if (String(item.person || "") !== fromPerson) throw new Error("stale_from_person");

  // 新担当Bは当日の割振り対象メンバーに限定
  const members = Array.isArray(day.members) ? day.members : [];
  const memberNames = members.map((m) => String((m && m.name) || ""));
  if (memberNames.indexOf(toPerson) < 0) throw new Error("invalid_to_person");
  if (reporter && memberNames.indexOf(reporter) < 0) throw new Error("invalid_reporter");

  const now = new Date();
  // レート制限：直近60秒に同一 shareId で5件以上は拒否
  const cutoff = new Date(now.getTime() - 60 * 1000).toISOString();
  const cntRow = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM swap_reports WHERE share_id = ? AND created_at >= ?"
  )
    .bind(shareId, cutoff)
    .first();
  if (cntRow && Number(cntRow.c) >= 5) throw new Error("rate_limited");

  // 重複抑止：同一 share/day/tool/from/to の未処理が既にあれば拒否
  const dup = await env.DB.prepare(
    "SELECT id FROM swap_reports WHERE share_id = ? AND day_key = ? AND tool = ? AND from_person = ? AND to_person = ? AND status = 'pending'"
  )
    .bind(shareId, dayKey, tool, fromPerson, toPerson)
    .first();
  if (dup) throw new Error("duplicate_pending");

  const id = genShareId();
  const nowIso = now.toISOString();
  await env.DB.prepare(
    "INSERT INTO swap_reports (id, cohort, share_id, day_key, day_label, tool, from_person, to_person, reporter, comment, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
  )
    .bind(
      id,
      cohort,
      shareId,
      dayKey,
      String(day.label || ""),
      tool,
      fromPerson,
      toPerson,
      reporter || null,
      comment || null,
      nowIso
    )
    .run();

  return {
    ok: true,
    id,
    _pushMeta: {
      cohort,
      report: { id, tool, fromPerson, toPerson, dayLabel: String(day.label || "") },
    },
  };
}

/** 保護者向け：自分（氏名）に紐づく報告の受付状況（無認証・shareId 検証あり） */
async function getSwapStatusPublic(env, sidRaw, personRaw) {
  await getActivePublishedByShare(env, sidRaw); // shareId の有効性を検証
  const shareId = String(sidRaw || "").trim();
  const person = String(personRaw || "").trim();
  if (!person) return { reports: [] };
  const rs = await env.DB.prepare(
    "SELECT id, share_id, day_key, day_label, tool, from_person, to_person, reporter, comment, status, reject_code, reject_reason, created_at, handled_at " +
      "FROM swap_reports WHERE share_id = ? AND (from_person = ? OR to_person = ? OR reporter = ?) ORDER BY created_at DESC LIMIT 20"
  )
    .bind(shareId, person, person, person)
    .all();
  return { reports: (rs.results || []).map(mapSwapReportRow) };
}

/** 道具MGR向け：世代の交代報告一覧（未処理を先頭に） */
async function listSwapReports(env, cohortRaw) {
  const cohort = mustCohort(cohortRaw);
  const rs = await env.DB.prepare(
    "SELECT id, share_id, day_key, day_label, tool, from_person, to_person, reporter, comment, status, reject_code, reject_reason, created_at, handled_at " +
      "FROM swap_reports WHERE cohort = ? ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200"
  )
    .bind(cohort)
    .all();
  const reports = (rs.results || []).map(mapSwapReportRow);
  const pending = reports.filter((r) => r.status === "pending").length;
  return { reports, pending };
}

/** 道具MGR向け：報告を反映（applied）／却下（dismissed）に更新 */
async function handleSwapReport(env, body) {
  const cohort = mustCohort(body && body.cohort);
  const id = String((body && body.id) || "").trim();
  const action = String((body && body.action) || "").trim();
  if (!id) throw new Error("id_required");
  const row = await env.DB.prepare("SELECT id, status FROM swap_reports WHERE id = ? AND cohort = ?")
    .bind(id, cohort)
    .first();
  if (!row) throw new Error("not_found");
  const nowIso = new Date().toISOString();
  if (action === "apply") {
    await env.DB.prepare(
      "UPDATE swap_reports SET status = 'applied', handled_at = ?, reject_code = NULL, reject_reason = NULL WHERE id = ? AND cohort = ?"
    )
      .bind(nowIso, id, cohort)
      .run();
  } else if (action === "dismiss") {
    const code = String((body && body.rejectCode) || "").trim();
    const reason = String((body && body.rejectReason) || "").trim().slice(0, 200);
    if (!code) throw new Error("reject_code_required");
    await env.DB.prepare(
      "UPDATE swap_reports SET status = 'dismissed', handled_at = ?, reject_code = ?, reject_reason = ? WHERE id = ? AND cohort = ?"
    )
      .bind(nowIso, code, reason || null, id, cohort)
      .run();
  } else {
    throw new Error("invalid_action");
  }
  return await listSwapReports(env, cohort);
}

// ===== Web Push（道具MGRのみ） =====

function pushConfigured(env) {
  return !!(env.VAPID_PRIVATE_KEY && env.VAPID_PUBLIC_KEY);
}

function vapidDetailsFromEnv(env) {
  const subject = String(env.VAPID_SUBJECT || "mailto:admin@example.com").trim();
  return {
    subject,
    publicKey: String(env.VAPID_PUBLIC_KEY || ""),
    privateKey: String(env.VAPID_PRIVATE_KEY || ""),
  };
}

function isValidPushEndpoint(url) {
  if (!url || url.length > 2048) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidPushKeyB64(v, minLen, maxLen) {
  const s = String(v || "").trim();
  if (!s || s.length > maxLen) return false;
  return /^[A-Za-z0-9_-]+$/.test(s) && s.length >= minLen;
}

/** MGR向け: push 購読を登録（endpoint 単位で upsert） */
async function savePushSubscription(env, body) {
  const cohort = mustCohort(body && body.cohort);
  const endpoint = String((body && body.endpoint) || "").trim();
  const p256dh = String((body && body.p256dh) || "").trim();
  const auth = String((body && body.auth) || "").trim();
  if (!isValidPushEndpoint(endpoint)) throw new Error("invalid_endpoint");
  if (!isValidPushKeyB64(p256dh, 80, 200)) throw new Error("invalid_p256dh");
  if (!isValidPushKeyB64(auth, 20, 64)) throw new Error("invalid_auth");
  const id = genShareId();
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO push_subscriptions (id, cohort, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(endpoint) DO UPDATE SET cohort = excluded.cohort, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at"
  )
    .bind(id, cohort, endpoint, p256dh, auth, nowIso)
    .run();
  return { ok: true };
}

/** 新着交代報告時: 登録済み MGR 端末へ Web Push 送信 */
async function notifySwapReportPush(env, cohortRaw, report) {
  if (!pushConfigured(env)) return { sent: 0, skipped: true };
  const cohort = mustCohort(cohortRaw);
  const rs = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE cohort = ?")
    .bind(cohort)
    .all();
  const rows = rs.results || [];
  if (!rows.length) return { sent: 0 };

  const tool = String((report && report.tool) || "");
  const fromPerson = String((report && report.fromPerson) || "");
  const toPerson = String((report && report.toPerson) || "");
  const dayLabel = String((report && report.dayLabel) || "");
  const bodyText = dayLabel
    ? `${dayLabel} ${tool}: ${fromPerson} → ${toPerson}`
    : `${tool}: ${fromPerson} → ${toPerson}`;
  const payload = JSON.stringify({
    title: "新しい交代報告",
    body: bodyText,
    url: "./index.html",
    tag: "swap-" + String((report && report.id) || ""),
  });

  const vapid = vapidDetailsFromEnv(env);
  let sent = 0;
  for (const row of rows) {
    const subscription = {
      endpoint: String(row.endpoint || ""),
      keys: { p256dh: String(row.p256dh || ""), auth: String(row.auth || "") },
    };
    try {
      await sendNotification(subscription, payload, { vapidDetails: vapid, TTL: 86400 });
      sent += 1;
    } catch (e) {
      const code = e instanceof WebPushError ? Number(e.statusCode) : 0;
      if (code === 404 || code === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      }
    }
  }
  return { sent };
}

// ===== 出欠・活動 =====

const ATT_STATUSES = new Set(["in", "out", "maybe", "unset"]);
const ATT_KINDS = new Set(["practice", "game", "other"]);

function genId() {
  return genShareId();
}

function isTruthyFlag(v) {
  return v === 1 || v === true || v === "1";
}

function memberExcluded(m) {
  if (!m || typeof m !== "object") return true;
  return (
    isTruthyFlag(m.rest) ||
    isTruthyFlag(m.quit) ||
    isTruthyFlag(m.coach) ||
    isTruthyFlag(m.ac14) ||
    isTruthyFlag(m.sibling)
  );
}

async function loadMasterMembers(env, cohort) {
  const row = await ensureState(env, cohort);
  let master = {};
  try {
    master = JSON.parse(row.master_json || "{}");
  } catch (e) {
    master = {};
  }
  const mb = Array.isArray(master.MB) ? master.MB : [];
  return mb
    .map((m) => ({
      name: String((m && m.name) || "").trim(),
      excluded: memberExcluded(m),
      rest: isTruthyFlag(m && m.rest) ? 1 : 0,
      quit: isTruthyFlag(m && m.quit) ? 1 : 0,
      coach: isTruthyFlag(m && m.coach) ? 1 : 0,
      ac14: isTruthyFlag(m && m.ac14) ? 1 : 0,
      sibling: isTruthyFlag(m && m.sibling) ? 1 : 0,
    }))
    .filter((m) => m.name);
}

function mapActivityRow(row) {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    cohort: String(row.cohort || ""),
    activityDate: String(row.activity_date || ""),
    startTime: String(row.start_time || ""),
    place: String(row.place || ""),
    kind: String(row.kind || "practice"),
    title: String(row.title || ""),
    memo: String(row.memo || ""),
    shareId: row.share_id ? String(row.share_id) : "",
    status: String(row.status || "open"),
    responsesUpdatedAt: row.responses_updated_at ? String(row.responses_updated_at) : "",
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function summarizeResponses(rows) {
  const counts = { in: 0, out: 0, maybe: 0, unset: 0, answered: 0 };
  const list = (rows || []).map((r) => {
    const st = String(r.status || "unset");
    const status = ATT_STATUSES.has(st) ? st : "unset";
    if (status !== "unset") counts.answered += 1;
    counts[status] = (counts[status] || 0) + 1;
    return {
      memberName: String(r.member_name || ""),
      status: status,
      comment: String(r.comment || ""),
      updatedAt: String(r.updated_at || ""),
    };
  });
  return { counts: counts, responses: list };
}

async function listActivities(env, cohortRaw) {
  const cohort = mustCohort(cohortRaw);
  const rs = await env.DB.prepare(
    "SELECT * FROM activities WHERE cohort = ? ORDER BY activity_date DESC, created_at DESC LIMIT 60"
  )
    .bind(cohort)
    .all();
  const activities = [];
  for (const row of rs.results || []) {
    const act = mapActivityRow(row);
    const agg = await env.DB.prepare(
      "SELECT status, COUNT(*) AS c FROM attendance_responses WHERE activity_id = ? GROUP BY status"
    )
      .bind(act.id)
      .all();
    const counts = { in: 0, out: 0, maybe: 0, unset: 0, answered: 0 };
    for (const a of agg.results || []) {
      const st = String(a.status || "unset");
      const n = Number(a.c) || 0;
      if (ATT_STATUSES.has(st)) counts[st] = n;
      if (st !== "unset") counts.answered += n;
    }
    act.counts = counts;
    activities.push(act);
  }
  return { activities: activities };
}

async function upsertActivity(env, body) {
  const cohort = mustCohort(body.cohort);
  const now = new Date().toISOString();
  const activityDate = String(body.activityDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) throw new Error("activity_date_invalid");
  const kind = String(body.kind || "practice").trim();
  if (!ATT_KINDS.has(kind)) throw new Error("kind_invalid");
  const startTime = String(body.startTime || "").trim().slice(0, 16);
  const place = String(body.place || "").trim().slice(0, 120);
  const title = String(body.title || "").trim().slice(0, 120);
  const memo = String(body.memo || "").trim().slice(0, 500);
  const status = body.status === "closed" ? "closed" : "open";
  let id = String(body.id || "").trim();

  if (id) {
    const cur = await env.DB.prepare("SELECT id FROM activities WHERE id = ? AND cohort = ?")
      .bind(id, cohort)
      .first();
    if (!cur) throw new Error("activity_not_found");
    await env.DB.prepare(
      "UPDATE activities SET activity_date = ?, start_time = ?, place = ?, kind = ?, title = ?, memo = ?, status = ?, updated_at = ? WHERE id = ? AND cohort = ?"
    )
      .bind(activityDate, startTime, place, kind, title, memo, status, now, id, cohort)
      .run();
  } else {
    id = genId();
    await env.DB.prepare(
      "INSERT INTO activities (id, cohort, activity_date, start_time, place, kind, title, memo, share_id, status, responses_updated_at, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)"
    )
      .bind(id, cohort, activityDate, startTime, place, kind, title, memo, status, now, now)
      .run();
  }
  return { ok: true, activity: await getActivityDetail(env, cohort, id).then((d) => d.activity) };
}

async function getActivityDetail(env, cohortRaw, idRaw) {
  const cohort = mustCohort(cohortRaw);
  const id = String(idRaw || "").trim();
  if (!id) throw new Error("activity_id_required");
  const row = await env.DB.prepare("SELECT * FROM activities WHERE id = ? AND cohort = ?")
    .bind(id, cohort)
    .first();
  if (!row) throw new Error("activity_not_found");
  const act = mapActivityRow(row);
  const rs = await env.DB.prepare(
    "SELECT member_name, status, comment, updated_at FROM attendance_responses WHERE activity_id = ?"
  )
    .bind(id)
    .all();
  const sum = summarizeResponses(rs.results || []);
  const members = await loadMasterMembers(env, cohort);
  const byName = {};
  for (const r of sum.responses) byName[r.memberName] = r;

  const roster = members
    .filter((m) => !m.excluded)
    .map((m) => {
      const r = byName[m.name];
      return {
        name: m.name,
        status: r ? r.status : "unset",
        comment: r ? r.comment : "",
        updatedAt: r ? r.updatedAt : "",
      };
    });

  const counts = { in: 0, out: 0, maybe: 0, unset: 0, answered: 0 };
  for (const m of roster) {
    counts[m.status] = (counts[m.status] || 0) + 1;
    if (m.status !== "unset") counts.answered += 1;
  }
  act.counts = counts;
  return {
    activity: act,
    roster: roster,
    memberTotal: roster.length,
    excludedMembers: members.filter((m) => m.excluded).map((m) => m.name),
  };
}

async function publishAttendance(env, body) {
  const cohort = mustCohort(body.cohort);
  const id = String(body.id || "").trim();
  if (!id) throw new Error("activity_id_required");
  const row = await env.DB.prepare("SELECT * FROM activities WHERE id = ? AND cohort = ?")
    .bind(id, cohort)
    .first();
  if (!row) throw new Error("activity_not_found");
  const now = new Date().toISOString();
  let shareId = row.share_id ? String(row.share_id) : "";
  if (!shareId || body.rotate) shareId = genShareId();
  await env.DB.prepare("UPDATE activities SET share_id = ?, updated_at = ? WHERE id = ? AND cohort = ?")
    .bind(shareId, now, id, cohort)
    .run();
  return { ok: true, shareId: shareId, updatedAt: now, activityId: id };
}

async function writeAttendanceResponse(env, activity, memberName, status, comment, source) {
  const st = String(status || "").trim();
  if (!ATT_STATUSES.has(st) || st === "unset") {
    // unset = delete response row（未回答に戻す）
    if (st === "unset") {
      await env.DB.prepare("DELETE FROM attendance_responses WHERE activity_id = ? AND member_name = ?")
        .bind(activity.id, memberName)
        .run();
    } else {
      throw new Error("status_invalid");
    }
  } else {
    const now = new Date().toISOString();
    const id = genId();
    const cmt = String(comment || "").trim().slice(0, 200);
    await env.DB.prepare(
      "INSERT INTO attendance_responses (id, activity_id, cohort, member_name, status, comment, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(activity_id, member_name) DO UPDATE SET status = excluded.status, comment = excluded.comment, updated_at = excluded.updated_at"
    )
      .bind(id, activity.id, activity.cohort, memberName, st, cmt, now)
      .run();
  }
  const now2 = new Date().toISOString();
  await env.DB.prepare("UPDATE activities SET responses_updated_at = ?, updated_at = ? WHERE id = ?")
    .bind(now2, now2, activity.id)
    .run();

  const summary =
    source === "public"
      ? `${memberName} が出欠を更新（${st}）`
      : `出欠更新: ${memberName} → ${st}`;
  await env.DB.prepare(
    "INSERT INTO cross_role_events (id, cohort, activity_id, source_role, event_type, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(genId(), activity.cohort, activity.id, "attendance", "attendance_changed", summary, now2)
    .run();

  // 古いイベントを間引く（世代あたり直近200件）
  await env.DB.prepare(
    "DELETE FROM cross_role_events WHERE cohort = ? AND id NOT IN (" +
      "SELECT id FROM cross_role_events WHERE cohort = ? ORDER BY created_at DESC LIMIT 200)"
  )
    .bind(activity.cohort, activity.cohort)
    .run();

  return { ok: true, responsesUpdatedAt: now2 };
}

async function setAttendanceResponseAdmin(env, body) {
  const cohort = mustCohort(body.cohort);
  const activityId = String(body.activityId || body.id || "").trim();
  const memberName = String(body.memberName || "").trim();
  if (!activityId || !memberName) throw new Error("activity_or_member_required");
  const row = await env.DB.prepare("SELECT * FROM activities WHERE id = ? AND cohort = ?")
    .bind(activityId, cohort)
    .first();
  if (!row) throw new Error("activity_not_found");
  const members = await loadMasterMembers(env, cohort);
  const hit = members.find((m) => m.name === memberName && !m.excluded);
  if (!hit) throw new Error("member_not_found");
  const activity = mapActivityRow(row);
  await writeAttendanceResponse(env, activity, memberName, body.status, body.comment, "admin");
  return getActivityDetail(env, cohort, activityId);
}

async function getPublicAttendance(env, sidRaw) {
  const sid = String(sidRaw || "").trim();
  if (!sid || !/^[0-9a-f]{16,64}$/.test(sid)) throw new Error("invalid_share_id");
  const row = await env.DB.prepare("SELECT * FROM activities WHERE share_id = ?")
    .bind(sid)
    .first();
  if (!row) throw new Error("not_found");
  if (String(row.status || "") === "closed") {
    return { ok: true, closed: 1, activity: mapActivityRow(row), roster: [] };
  }
  const detail = await getActivityDetail(env, row.cohort, row.id);
  return {
    ok: true,
    closed: 0,
    activity: detail.activity,
    roster: detail.roster.map((m) => ({
      name: m.name,
      status: m.status,
      comment: m.comment,
    })),
    memberTotal: (detail.memberTotal | 0),
  };
}

async function setAttendanceResponsePublic(env, body) {
  const sid = String((body && body.sid) || "").trim();
  if (!sid || !/^[0-9a-f]{16,64}$/.test(sid)) throw new Error("invalid_share_id");
  const memberName = String((body && body.memberName) || "").trim();
  if (!memberName) throw new Error("member_required");
  const row = await env.DB.prepare("SELECT * FROM activities WHERE share_id = ?")
    .bind(sid)
    .first();
  if (!row) throw new Error("not_found");
  if (String(row.status || "") === "closed") throw new Error("activity_closed");

  // 連続投稿の簡易抑制（同一 share + member で 8 秒以内は拒否）
  const recent = await env.DB.prepare(
    "SELECT updated_at FROM attendance_responses WHERE activity_id = ? AND member_name = ?"
  )
    .bind(row.id, memberName)
    .first();
  if (recent && recent.updated_at) {
    const t = Date.parse(String(recent.updated_at));
    if (!Number.isNaN(t) && Date.now() - t < 8000) throw new Error("too_fast");
  }

  const members = await loadMasterMembers(env, row.cohort);
  const hit = members.find((m) => m.name === memberName && !m.excluded);
  if (!hit) throw new Error("member_not_found");

  const activity = mapActivityRow(row);
  await writeAttendanceResponse(env, activity, memberName, body.status, body.comment, "public");
  return getPublicAttendance(env, sid);
}

async function listCrossRoleEvents(env, cohortRaw, sinceRaw) {
  const cohort = mustCohort(cohortRaw);
  const since = String(sinceRaw || "").trim();
  let rs;
  if (since) {
    rs = await env.DB.prepare(
      "SELECT id, activity_id, source_role, event_type, summary, created_at FROM cross_role_events " +
        "WHERE cohort = ? AND created_at > ? ORDER BY created_at DESC LIMIT 50"
    )
      .bind(cohort, since)
      .all();
  } else {
    rs = await env.DB.prepare(
      "SELECT id, activity_id, source_role, event_type, summary, created_at FROM cross_role_events " +
        "WHERE cohort = ? ORDER BY created_at DESC LIMIT 50"
    )
      .bind(cohort)
      .all();
  }
  const events = (rs.results || []).map((r) => ({
    id: String(r.id || ""),
    activityId: String(r.activity_id || ""),
    sourceRole: String(r.source_role || ""),
    eventType: String(r.event_type || ""),
    summary: String(r.summary || ""),
    createdAt: String(r.created_at || ""),
  }));
  return { events: events };
}

