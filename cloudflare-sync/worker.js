export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (!authorize(request, env)) return json({ error: "unauthorized" }, 401);

    const url = new URL(request.url);
    try {
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
