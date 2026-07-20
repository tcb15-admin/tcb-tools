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
      if (url.pathname === "/api/attendance/campaigns" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        return json(await listCampaigns(env, cohort));
      }
      if (url.pathname === "/api/attendance/campaigns" && request.method === "POST") {
        const body = await request.json();
        return json(await upsertCampaign(env, body));
      }
      if (url.pathname === "/api/attendance/campaign" && request.method === "GET") {
        const cohort = (url.searchParams.get("cohort") || "").trim();
        const id = (url.searchParams.get("id") || "").trim();
        return json(await getCampaignDetail(env, cohort, id));
      }
      if (url.pathname === "/api/attendance/publish" && request.method === "POST") {
        const body = await request.json();
        return json(await publishCampaignShares(env, body));
      }
      if (url.pathname === "/api/attendance/campaign-status" && request.method === "POST") {
        const body = await request.json();
        return json(await setCampaignStatus(env, body));
      }
      if (url.pathname === "/api/attendance/response" && request.method === "POST") {
        const body = await request.json();
        return json(await setTrackResponseAdmin(env, body));
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

/** 道具写真URL：https のみ許可（保護者ページに埋め込むため厳格に） */
function sanitizeImgUrl(v) {
  const s = String(v || "").trim();
  if (!s || s.length > 500) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? s : "";
  } catch {
    return "";
  }
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
        img: sanitizeImgUrl(it && it.img),
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

/** 保護者からの交代報告を作成（無認証・入口で厳格に検証）
    type: 'swap'（既定）… 交代先が決まっている報告
    type: 'unavailable' … 担当できなくなった（後任未定）の連絡。to_person は空で保存する */
async function createSwapReport(env, body) {
  const shareId = String((body && body.shareId) || "").trim();
  const dayKey = String((body && body.dayKey) || "").trim();
  const tool = String((body && body.tool) || "").trim();
  const fromPerson = String((body && body.fromPerson) || "").trim();
  const reporter = String((body && body.reporter) || "").trim().slice(0, 40);
  const comment = String((body && body.comment) || "").trim().slice(0, 100);
  const isUnavailable = String((body && body.type) || "swap") === "unavailable";
  const toPerson = isUnavailable ? "" : String((body && body.toPerson) || "").trim();

  if (!tool || !fromPerson) throw new Error("missing_fields");
  if (!isUnavailable) {
    if (!toPerson) throw new Error("missing_fields");
    if (toPerson === fromPerson) throw new Error("same_person");
  }

  const { cohort, view } = await getActivePublishedByShare(env, shareId);
  const day = findPublishedDay(view, dayKey);
  if (!day) throw new Error("invalid_day");

  const items = Array.isArray(day.items) ? day.items : [];
  const item = items.find((it) => String((it && it.tool) || "") === tool) || null;
  if (!item) throw new Error("invalid_tool");
  // 現担当Aの鮮度照合（公開データと不一致＝古い内容は拒否）
  if (String(item.person || "") !== fromPerson) throw new Error("stale_from_person");

  // 新担当Bは当日の割振り対象メンバーに限定（後任未定の連絡では不要）
  const members = Array.isArray(day.members) ? day.members : [];
  const memberNames = members.map((m) => String((m && m.name) || ""));
  if (!isUnavailable && memberNames.indexOf(toPerson) < 0) throw new Error("invalid_to_person");
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
      report: { id, tool, fromPerson, toPerson, dayLabel: String(day.label || ""), unavailable: isUnavailable ? 1 : 0 },
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
  const unavailable = !!(report && report.unavailable);
  const change = unavailable ? `${fromPerson}（担当不可・後任未定）` : `${fromPerson} → ${toPerson}`;
  const bodyText = dayLabel ? `${dayLabel} ${tool}: ${change}` : `${tool}: ${change}`;
  const payload = JSON.stringify({
    title: unavailable ? "担当できない連絡" : "新しい交代報告",
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

// ===== 出欠（複数日キャンペーン・2トラック汎用） =====
// トラックは汎用キー a / b。チーム固有の呼称（15期: a=MG LINE・b=親父 LINE）や
// 表示文言はフロントの config で注入し、サーバー／DB には持ち込まない。

const MARKS = new Set(["o", "x", "t", "unset"]); // ○ ✕ △ 未
const ATT_KINDS = new Set(["practice", "game", "other"]);
const ATT_TRACKS = new Set(["a", "b"]);
// トラックごとの入力形式。将来チーム設定（cohort 単位）に外出しする想定
const TRACK_FORMS = { a: "family", b: "marks" };

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
    }))
    .filter((m) => m.name);
}

function parseJsonObj(raw) {
  try {
    const o = JSON.parse(raw || "{}");
    return o && typeof o === "object" ? o : {};
  } catch (e) {
    return {};
  }
}

function normMark(v) {
  const s = String(v || "unset").trim().toLowerCase();
  if (s === "◯" || s === "○" || s === "o" || s === "yes" || s === "in") return "o";
  if (s === "✕" || s === "×" || s === "x" || s === "no" || s === "out") return "x";
  if (s === "△" || s === "t" || s === "maybe") return "t";
  return "unset";
}

function mustTrack(v) {
  const t = String(v || "").trim().toLowerCase();
  if (!ATT_TRACKS.has(t)) throw new Error("track_invalid");
  return t;
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    cohort: String(row.cohort || ""),
    title: String(row.title || ""),
    memo: String(row.memo || ""),
    status: String(row.status || "open"),
    shareIdA: row.share_id_a ? String(row.share_id_a) : "",
    shareIdB: row.share_id_b ? String(row.share_id_b) : "",
    responsesUpdatedAt: row.responses_updated_at ? String(row.responses_updated_at) : "",
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function mapDay(row) {
  return {
    id: String(row.id || ""),
    activityDate: String(row.activity_date || ""),
    startTime: String(row.start_time || ""),
    place: String(row.place || ""),
    kind: String(row.kind || "practice"),
    label: String(row.label || ""),
    sortOrder: Number(row.sort_order) || 0,
  };
}

function sanitizeFamilyDay(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const mode = String(d.mode || "on") === "off" ? "off" : "on";
  if (mode === "off") {
    return { mode: "off", note: String(d.note || "").trim().slice(0, 120) };
  }
  const seatsRaw = d.seats;
  let seats = null;
  if (seatsRaw !== undefined && seatsRaw !== null && String(seatsRaw).trim() !== "") {
    seats = Math.max(0, Math.min(99, parseInt(String(seatsRaw), 10) || 0));
  }
  return {
    mode: "on",
    father: normMark(d.father),
    mother: normMark(d.mother),
    siblings: String(d.siblings || "").trim().slice(0, 80),
    other: String(d.other || "").trim().slice(0, 80),
    carOk: normMark(d.carOk),
    carModel: String(d.carModel || "").trim().slice(0, 40),
    seats: seats,
    send: String(d.send || "").trim().slice(0, 80),
    pickup: String(d.pickup || "").trim().slice(0, 80),
    note: String(d.note || "").trim().slice(0, 120),
  };
}

function sanitizeTrackPayload(track, payload, dayDates) {
  const form = TRACK_FORMS[track] || "marks";
  const src = payload && typeof payload === "object" ? payload : {};
  const daysIn = src.days && typeof src.days === "object" ? src.days : {};
  const days = {};
  for (const dt of dayDates) {
    if (!Object.prototype.hasOwnProperty.call(daysIn, dt)) continue;
    days[dt] = form === "family" ? sanitizeFamilyDay(daysIn[dt]) : normMark(daysIn[dt]);
  }
  return { days: days };
}

async function loadCampaignDays(env, campaignId) {
  const rs = await env.DB.prepare(
    "SELECT * FROM attendance_days WHERE campaign_id = ? ORDER BY sort_order ASC, activity_date ASC"
  )
    .bind(campaignId)
    .all();
  return (rs.results || []).map(mapDay);
}

async function bumpCampaignAndEvent(env, campaign, summary, eventType) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE attendance_campaigns SET responses_updated_at = ?, updated_at = ? WHERE id = ?"
  )
    .bind(now, now, campaign.id)
    .run();
  await env.DB.prepare(
    "INSERT INTO cross_role_events (id, cohort, activity_id, source_role, event_type, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(genId(), campaign.cohort, campaign.id, "attendance", eventType || "attendance_changed", summary, now)
    .run();
  await env.DB.prepare(
    "DELETE FROM cross_role_events WHERE cohort = ? AND id NOT IN (" +
      "SELECT id FROM cross_role_events WHERE cohort = ? ORDER BY created_at DESC LIMIT 200)"
  )
    .bind(campaign.cohort, campaign.cohort)
    .run();
  return now;
}

async function countTrackResponses(env, campaignId) {
  const rs = await env.DB.prepare(
    "SELECT track, COUNT(*) AS n FROM attendance_track_responses WHERE campaign_id = ? GROUP BY track"
  )
    .bind(campaignId)
    .all();
  const counts = { a: 0, b: 0 };
  for (const r of rs.results || []) {
    const t = String(r.track || "");
    if (t === "a" || t === "b") counts[t] = Number(r.n) || 0;
  }
  return counts;
}

async function listCampaigns(env, cohortRaw) {
  const cohort = mustCohort(cohortRaw);
  const rs = await env.DB.prepare(
    "SELECT * FROM attendance_campaigns WHERE cohort = ? ORDER BY created_at DESC LIMIT 40"
  )
    .bind(cohort)
    .all();
  const campaigns = [];
  for (const row of rs.results || []) {
    const c = mapCampaign(row);
    c.days = await loadCampaignDays(env, c.id);
    c.answered = await countTrackResponses(env, c.id);
    campaigns.push(c);
  }
  return { campaigns: campaigns };
}

async function upsertCampaign(env, body) {
  const cohort = mustCohort(body.cohort);
  const now = new Date().toISOString();
  const title = String(body.title || "").trim().slice(0, 120);
  const memo = String(body.memo || "").trim().slice(0, 500);
  const status = body.status === "closed" ? "closed" : "open";
  const daysIn = Array.isArray(body.days) ? body.days : [];
  if (!daysIn.length) throw new Error("days_required");
  if (daysIn.length > 14) throw new Error("days_too_many");

  const days = daysIn.map((d, i) => {
    const activityDate = String((d && d.activityDate) || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) throw new Error("activity_date_invalid");
    const kind = String((d && d.kind) || "practice").trim();
    if (!ATT_KINDS.has(kind)) throw new Error("kind_invalid");
    return {
      activityDate,
      startTime: String((d && d.startTime) || "").trim().slice(0, 16),
      place: String((d && d.place) || "").trim().slice(0, 120),
      kind,
      label: String((d && d.label) || "").trim().slice(0, 40),
      sortOrder: i,
    };
  });

  let id = String(body.id || "").trim();
  if (id) {
    const cur = await env.DB.prepare("SELECT id FROM attendance_campaigns WHERE id = ? AND cohort = ?")
      .bind(id, cohort)
      .first();
    if (!cur) throw new Error("campaign_not_found");
    await env.DB.prepare(
      "UPDATE attendance_campaigns SET title = ?, memo = ?, status = ?, updated_at = ? WHERE id = ? AND cohort = ?"
    )
      .bind(title, memo, status, now, id, cohort)
      .run();
    await env.DB.prepare("DELETE FROM attendance_days WHERE campaign_id = ?").bind(id).run();
  } else {
    id = genId();
    await env.DB.prepare(
      "INSERT INTO attendance_campaigns (id, cohort, title, memo, status, share_id_a, share_id_b, responses_updated_at, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)"
    )
      .bind(id, cohort, title, memo, status, now, now)
      .run();
  }

  for (const d of days) {
    await env.DB.prepare(
      "INSERT INTO attendance_days (id, campaign_id, cohort, activity_date, start_time, place, kind, label, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(genId(), id, cohort, d.activityDate, d.startTime, d.place, d.kind, d.label, d.sortOrder)
      .run();
  }

  return getCampaignDetail(env, cohort, id);
}

async function getCampaignDetail(env, cohortRaw, idRaw) {
  const cohort = mustCohort(cohortRaw);
  const id = String(idRaw || "").trim();
  if (!id) throw new Error("campaign_id_required");
  const row = await env.DB.prepare("SELECT * FROM attendance_campaigns WHERE id = ? AND cohort = ?")
    .bind(id, cohort)
    .first();
  if (!row) throw new Error("campaign_not_found");
  const campaign = mapCampaign(row);
  campaign.days = await loadCampaignDays(env, id);
  const members = (await loadMasterMembers(env, cohort)).filter((m) => !m.excluded);

  const rs = await env.DB.prepare(
    "SELECT track, member_name, payload_json, updated_at FROM attendance_track_responses WHERE campaign_id = ?"
  )
    .bind(id)
    .all();

  const byTrack = { a: {}, b: {} };
  for (const r of rs.results || []) {
    const t = String(r.track || "");
    if (t !== "a" && t !== "b") continue;
    byTrack[t][String(r.member_name)] = {
      payload: parseJsonObj(r.payload_json),
      updatedAt: String(r.updated_at || ""),
    };
  }

  const roster = members.map((m) => ({
    name: m.name,
    a: byTrack.a[m.name] || null,
    b: byTrack.b[m.name] || null,
  }));

  return {
    campaign: campaign,
    roster: roster,
    memberTotal: members.length,
    answered: {
      a: roster.filter((r) => !!r.a).length,
      b: roster.filter((r) => !!r.b).length,
    },
  };
}

async function publishCampaignShares(env, body) {
  const cohort = mustCohort(body.cohort);
  const id = String(body.id || "").trim();
  if (!id) throw new Error("campaign_id_required");
  const row = await env.DB.prepare("SELECT * FROM attendance_campaigns WHERE id = ? AND cohort = ?")
    .bind(id, cohort)
    .first();
  if (!row) throw new Error("campaign_not_found");
  const now = new Date().toISOString();
  const track = String(body.track || "both"); // a | b | both
  let shareA = row.share_id_a ? String(row.share_id_a) : "";
  let shareB = row.share_id_b ? String(row.share_id_b) : "";
  if (track === "a" || track === "both") {
    if (!shareA || body.rotate) shareA = genShareId();
  }
  if (track === "b" || track === "both") {
    if (!shareB || body.rotate) shareB = genShareId();
  }
  await env.DB.prepare(
    "UPDATE attendance_campaigns SET share_id_a = ?, share_id_b = ?, updated_at = ? WHERE id = ? AND cohort = ?"
  )
    .bind(shareA || null, shareB || null, now, id, cohort)
    .run();
  return {
    ok: true,
    shareIdA: shareA,
    shareIdB: shareB,
    updatedAt: now,
    campaignId: id,
  };
}

async function setCampaignStatus(env, body) {
  const cohort = mustCohort(body.cohort);
  const id = String(body.id || "").trim();
  if (!id) throw new Error("campaign_id_required");
  const status = body.status === "closed" ? "closed" : "open";
  const row = await env.DB.prepare("SELECT id FROM attendance_campaigns WHERE id = ? AND cohort = ?")
    .bind(id, cohort)
    .first();
  if (!row) throw new Error("campaign_not_found");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE attendance_campaigns SET status = ?, updated_at = ? WHERE id = ? AND cohort = ?")
    .bind(status, now, id, cohort)
    .run();
  return getCampaignDetail(env, cohort, id);
}

async function findCampaignByShare(env, sid) {
  const sidN = String(sid || "").trim();
  if (!sidN || !/^[0-9a-f]{16,64}$/.test(sidN)) throw new Error("invalid_share_id");
  let row = await env.DB.prepare("SELECT * FROM attendance_campaigns WHERE share_id_a = ?").bind(sidN).first();
  if (row) return { row: row, track: "a" };
  row = await env.DB.prepare("SELECT * FROM attendance_campaigns WHERE share_id_b = ?").bind(sidN).first();
  if (row) return { row: row, track: "b" };
  throw new Error("not_found");
}

async function saveTrackResponse(env, campaignRow, track, memberName, payload) {
  const campaign = mapCampaign(campaignRow);
  const days = await loadCampaignDays(env, campaign.id);
  const dayDates = days.map((d) => d.activityDate);
  const members = await loadMasterMembers(env, campaign.cohort);
  const hit = members.find((m) => m.name === memberName && !m.excluded);
  if (!hit) throw new Error("member_not_found");
  const clean = sanitizeTrackPayload(track, payload, dayDates);
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO attendance_track_responses (id, campaign_id, cohort, track, member_name, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(campaign_id, track, member_name) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at"
  )
    .bind(genId(), campaign.id, campaign.cohort, track, memberName, JSON.stringify(clean), now)
    .run();
  await bumpCampaignAndEvent(
    env,
    campaign,
    `出欠回答更新[${track}]: ${memberName}`,
    "attendance_changed"
  );
  return clean;
}

async function setTrackResponseAdmin(env, body) {
  const cohort = mustCohort(body.cohort);
  const id = String(body.campaignId || body.id || "").trim();
  const memberName = String(body.memberName || "").trim();
  const track = mustTrack(body.track);
  if (!id || !memberName) throw new Error("campaign_or_member_required");
  const row = await env.DB.prepare("SELECT * FROM attendance_campaigns WHERE id = ? AND cohort = ?")
    .bind(id, cohort)
    .first();
  if (!row) throw new Error("campaign_not_found");
  await saveTrackResponse(env, row, track, memberName, body.payload || {});
  return getCampaignDetail(env, cohort, id);
}

async function getPublicAttendance(env, sidRaw) {
  const found = await findCampaignByShare(env, sidRaw);
  const campaign = mapCampaign(found.row);
  if (campaign.status === "closed") {
    return { ok: true, closed: 1, track: found.track, campaign: campaign, days: [], members: [] };
  }
  const days = await loadCampaignDays(env, campaign.id);
  const members = (await loadMasterMembers(env, campaign.cohort))
    .filter((m) => !m.excluded)
    .map((m) => m.name);

  const rs = await env.DB.prepare(
    "SELECT member_name, payload_json FROM attendance_track_responses WHERE campaign_id = ? AND track = ?"
  )
    .bind(campaign.id, found.track)
    .all();
  const responded = {};
  for (const r of rs.results || []) responded[String(r.member_name)] = parseJsonObj(r.payload_json);

  return {
    ok: true,
    closed: 0,
    track: found.track,
    campaign: {
      id: campaign.id,
      title: campaign.title,
      memo: campaign.memo,
      status: campaign.status,
    },
    days: days,
    members: members,
    responses: responded,
  };
}

async function setAttendanceResponsePublic(env, body) {
  const sid = String((body && body.sid) || "").trim();
  const memberName = String((body && body.memberName) || "").trim();
  if (!memberName) throw new Error("member_required");
  const found = await findCampaignByShare(env, sid);
  if (String(found.row.status || "") === "closed") throw new Error("campaign_closed");

  // 連打抑制（同一キャンペーン・トラック・選手で8秒以内は拒否）
  const recent = await env.DB.prepare(
    "SELECT updated_at FROM attendance_track_responses WHERE campaign_id = ? AND track = ? AND member_name = ?"
  )
    .bind(found.row.id, found.track, memberName)
    .first();
  if (recent && recent.updated_at) {
    const t = Date.parse(String(recent.updated_at));
    if (!Number.isNaN(t) && Date.now() - t < 8000) throw new Error("too_fast");
  }

  await saveTrackResponse(env, found.row, found.track, memberName, body.payload || {});
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
