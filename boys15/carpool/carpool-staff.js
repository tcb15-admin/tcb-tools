(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var cfg = window.TCB_CP_CFG || {};
  var client = null;
  var state = {
    sheets: [],
    campaigns: [],
    sheet: null,
    candidates: null,
    events: [],
    attendanceAlert: null,
    flow: 'make',
    role: 'carpool_mgr'
  };
  var LS_OK = (cfg.lsPrefix || 'tcb') + '_cp_ok';
  var LS_ROLE = (cfg.lsPrefix || 'tcb') + '_cp_role';

  var CATEGORIES = ['スタッフ車', '当番車', '道具車', '選手車', '父兄車', '保護者車'];
  var STATUS_LABEL = {
    draft: '作成中',
    submitted: '確認依頼中',
    approved: '承認済',
    published: '公開済',
    returned: '差し戻し'
  };
  var FLOW_HINTS = {
    make: '出欠を紐づけて作成 → MG候補／当番車を取込 → 手組み → 保存。スタッフ車は空行から手入れ。',
    review: '配車MGRが確認依頼。チーフが承認／差し戻し（コメント任意）。軽微修正はチーフが表を直してOK。',
    share: '承認後、MG LINE と 親父 LINE 用文面をコピーして投稿 → 「展開済にする」。'
  };

  function setStatus(msg, isErr) {
    var el = $('cp-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'cp-status' + (isErr ? ' err' : '');
  }

  function ensureClient() {
    if (client) return client;
    client = TCB_createSyncClient({
      baseUrl: cfg.apiBase || '',
      token: cfg.apiToken || '',
      cohort: String(cfg.cohort || '')
    });
    if (!client) setStatus('API設定がありません', true);
    return client;
  }

  function emptyRow(n) {
    return {
      sortOrder: n || 1, category: '', carModel: '', duty: '',
      driver: '', front: '', rear1: '', rear2: '', rear3: '', rear4: '', rear5: '',
      note: '', block: 'general'
    };
  }

  function unlock() {
    try { sessionStorage.setItem(LS_OK, '1'); } catch (e) {}
    var pw = $('cp-pw');
    if (pw) pw.classList.add('cp-hidden');
  }

  function needLogin() {
    try { return sessionStorage.getItem(LS_OK) !== '1'; } catch (e) { return true; }
  }

  function tryLogin() {
    var inp = $('cp-pw-inp');
    var err = $('cp-pw-err');
    var v = inp ? String(inp.value || '') : '';
    if (v === String(cfg.initialPw || '')) {
      if (err) err.textContent = '';
      unlock();
      boot().catch(function (e) { setStatus(e.message || String(e), true); });
    } else if (err) {
      err.textContent = 'パスワードが違います';
    }
  }

  function setRole(role) {
    state.role = role === 'chief_mgr' ? 'chief_mgr' : 'carpool_mgr';
    try { sessionStorage.setItem(LS_ROLE, state.role); } catch (e) {}
    document.querySelectorAll('.cp-role-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-role') === state.role);
    });
    renderReviewActions();
    updateSharePreview();
  }

  function setFlow(mode, opts) {
    opts = opts || {};
    state.flow = mode || 'make';
    document.querySelectorAll('.cp-flow-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-cp-flow') === state.flow);
    });
    if ($('cp-flow-hint')) $('cp-flow-hint').textContent = FLOW_HINTS[state.flow] || FLOW_HINTS.make;
    var showMake = state.flow === 'make';
    var showReview = state.flow === 'review';
    var showShare = state.flow === 'share';
    if ($('cp-panel-make')) $('cp-panel-make').classList.toggle('cp-hidden', !showMake);
    if ($('cp-panel-edit')) $('cp-panel-edit').classList.toggle('cp-hidden', !(showMake || showReview));
    if ($('cp-panel-table')) $('cp-panel-table').classList.toggle('cp-hidden', !(showMake || showReview));
    if ($('cp-panel-review')) $('cp-panel-review').classList.toggle('cp-hidden', !showReview);
    if ($('cp-panel-share')) $('cp-panel-share').classList.toggle('cp-hidden', !showShare);
    if (opts.scroll && state.sheet) {
      var t = showShare ? $('cp-panel-share') : (showReview ? $('cp-panel-review') : $('cp-panel-edit'));
      if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function statusPill(st) {
    var lab = STATUS_LABEL[st] || st;
    var cls = 'cp-pill';
    if (st === 'submitted') cls += ' sub';
    else if (st === 'approved') cls += ' ok';
    else if (st === 'published') cls += ' pub';
    else if (st === 'returned') cls += ' ret';
    return '<span class="' + cls + '">' + esc(lab) + '</span>';
  }

  function fillCampSelect(sel, selected) {
    if (!sel) return;
    var opts = '<option value="">（なし）</option>';
    state.campaigns.forEach(function (camp) {
      var days = (camp.days || []).map(function (d) { return d.activityDate; }).join(',');
      opts += '<option value="' + esc(camp.id) + '" data-days="' + esc(days) + '"'
        + (camp.id === selected ? ' selected' : '') + '>'
        + esc(camp.title || camp.id) + '</option>';
    });
    sel.innerHTML = opts;
  }

  async function loadCampaigns() {
    var c = ensureClient();
    if (!c) return;
    var res = await c.listCampaigns();
    state.campaigns = res.campaigns || [];
    fillCampSelect($('cp-camp'), '');
    if (state.sheet) fillCampSelect($('cp-d-camp'), state.sheet.attendanceCampaignId || '');
  }

  async function loadSheets() {
    var c = ensureClient();
    if (!c) return;
    var res = await c.listCarpoolSheets();
    state.sheets = res.sheets || [];
    renderList();
  }

  function renderList() {
    var box = $('cp-list');
    if (!box) return;
    if (!state.sheets.length) {
      box.innerHTML = '<p class="cp-meta">まだ配車表がありません。</p>';
      return;
    }
    box.innerHTML = state.sheets.map(function (s) {
      var active = state.sheet && state.sheet.id === s.id ? ' is-active' : '';
      return '<div class="cp-act' + active + '" data-id="' + esc(s.id) + '">'
        + '<div class="cp-act-title">' + esc(s.title || '配車表') + statusPill(s.status) + '</div>'
        + '<div class="cp-meta">' + esc(s.activityDate || '（日付未設定）')
        + (s.groupLabel ? '　' + esc(s.groupLabel) : '')
        + '　' + esc(s.fromPlace || '') + (s.toPlace ? ' ⇒ ' + esc(s.toPlace) : '')
        + '　' + (s.rows ? s.rows.length : 0) + '台</div></div>';
    }).join('');
  }

  function countPeople(rows) {
    var names = {};
    function add(v) {
      var t = String(v || '').trim();
      if (!t) return;
      names[t] = 1;
    }
    (rows || []).forEach(function (r) {
      add(r.driver); add(r.front);
      add(r.rear1); add(r.rear2); add(r.rear3); add(r.rear4); add(r.rear5);
    });
    return Object.keys(names).length;
  }

  function runValidate() {
    var box = $('cp-warn');
    if (!box || !state.sheet) return { errors: [], warnings: [] };
    var v = (window.TCB_carpoolValidate && TCB_carpoolValidate.validateCarpoolRows)
      ? TCB_carpoolValidate.validateCarpoolRows(state.sheet.rows || [])
      : { errors: [], warnings: [] };
    if (!v.errors.length && !v.warnings.length) {
      box.classList.add('cp-hidden');
      box.innerHTML = '';
      return v;
    }
    var html = '';
    if (v.errors.length) {
      html += '<strong>修正が必要</strong><ul>' + v.errors.map(function (e) {
        return '<li>' + esc(e) + '</li>';
      }).join('') + '</ul>';
    }
    if (v.warnings.length) {
      html += '<strong>確認推奨</strong><ul>' + v.warnings.map(function (e) {
        return '<li>' + esc(e) + '</li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html;
    box.classList.remove('cp-hidden');
    return v;
  }

  function renderDetail() {
    var d = state.sheet;
    var panel = $('cp-detail');
    var empty = $('cp-detail-empty');
    if (!d) {
      if (panel) panel.classList.add('cp-hidden');
      if (empty) empty.classList.remove('cp-hidden');
      return;
    }
    if (empty) empty.classList.add('cp-hidden');
    if (panel) panel.classList.remove('cp-hidden');
    $('cp-d-title').textContent = d.title || '配車表';
    $('cp-d-title-inp').value = d.title || '';
    $('cp-d-date').value = d.activityDate || '';
    $('cp-d-from').value = d.fromPlace || '';
    $('cp-d-to').value = d.toPlace || '';
    $('cp-d-group').value = d.groupLabel || '';
    fillCampSelect($('cp-d-camp'), d.attendanceCampaignId || '');
    var note = d.reviewNote ? '　差し戻しメモ: ' + d.reviewNote : '';
    $('cp-d-status').innerHTML = '状態: ' + statusPill(d.status) + esc(note);
    $('cp-counts').innerHTML =
      '<span>台数 ' + (d.rows ? d.rows.length : 0) + '</span>'
      + '<span>乗車名 ' + countPeople(d.rows) + '</span>';
    renderAttendanceAlert();
    renderTable();
    runValidate();
    renderList();
    renderReviewActions();
    updateSharePreview();
  }

  function renderAttendanceAlert() {
    var box = $('cp-att-alert');
    if (!box) return;
    var alert = state.attendanceAlert;
    if (!alert) {
      box.classList.add('cp-hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('cp-hidden');
    box.innerHTML = '<strong>出欠が更新されています</strong><br>' + esc(alert.message || '')
      + '<div style="margin-top:8px"><button type="button" id="cp-btn-resync" class="cp-btn cp-btn-primary cp-btn-sm">'
      + '<svg class="cp-btn-svg" viewBox="0 0 24 24"><use href="#cp-i-users"/></svg>MG候補を再取得</button></div>';
  }

  function catOptions(cur) {
    var html = '<option value=""></option>';
    CATEGORIES.forEach(function (c) {
      html += '<option value="' + esc(c) + '"' + (cur === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    if (cur && CATEGORIES.indexOf(cur) < 0) {
      html += '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>';
    }
    return html;
  }

  function renderTable() {
    var tb = $('cp-tbody');
    if (!tb || !state.sheet) return;
    var rows = state.sheet.rows || [];
    tb.innerHTML = rows.map(function (r, idx) {
      return '<tr data-idx="' + idx + '">'
        + '<td class="cp-num"><input data-k="sortOrder" value="' + esc(r.sortOrder) + '" inputmode="numeric"></td>'
        + '<td><select data-k="category">' + catOptions(r.category) + '</select></td>'
        + '<td><input data-k="carModel" value="' + esc(r.carModel) + '"></td>'
        + '<td><input data-k="duty" value="' + esc(r.duty) + '"></td>'
        + '<td><input data-k="driver" value="' + esc(r.driver) + '"></td>'
        + '<td><input data-k="front" value="' + esc(r.front) + '"></td>'
        + '<td><input data-k="rear1" value="' + esc(r.rear1) + '"></td>'
        + '<td><input data-k="rear2" value="' + esc(r.rear2) + '"></td>'
        + '<td><input data-k="rear3" value="' + esc(r.rear3) + '"></td>'
        + '<td><input data-k="rear4" value="' + esc(r.rear4) + '"></td>'
        + '<td><input data-k="rear5" value="' + esc(r.rear5) + '"></td>'
        + '<td><input data-k="note" value="' + esc(r.note) + '"></td>'
        + '<td><button type="button" class="cp-btn cp-btn-ghost cp-del" data-del="' + idx + '" title="削除" aria-label="削除">'
        + '<svg class="cp-btn-svg" viewBox="0 0 24 24"><use href="#cp-i-trash"/></svg></button></td>'
        + '</tr>';
    }).join('');
  }

  function readTableIntoSheet() {
    if (!state.sheet) return;
    var rows = [];
    var tb = $('cp-tbody');
    if (!tb) return;
    tb.querySelectorAll('tr').forEach(function (tr) {
      var r = emptyRow(rows.length + 1);
      tr.querySelectorAll('[data-k]').forEach(function (el) {
        var k = el.getAttribute('data-k');
        var v = el.tagName === 'SELECT' ? el.value : el.value;
        if (k === 'sortOrder') r[k] = parseInt(v, 10) || (rows.length + 1);
        else r[k] = String(v || '');
      });
      rows.push(r);
    });
    rows.sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    state.sheet.rows = rows;
    state.sheet.title = $('cp-d-title-inp').value || state.sheet.title;
    state.sheet.activityDate = $('cp-d-date').value || '';
    state.sheet.fromPlace = $('cp-d-from').value || '';
    state.sheet.toPlace = $('cp-d-to').value || '';
    state.sheet.groupLabel = $('cp-d-group').value || '';
    state.sheet.attendanceCampaignId = ($('cp-d-camp') && $('cp-d-camp').value) || '';
  }

  function renderReviewActions() {
    var box = $('cp-review-actions');
    if (!box) return;
    if (!state.sheet) {
      box.innerHTML = '';
      return;
    }
    var st = state.sheet.status;
    var isChief = state.role === 'chief_mgr';
    var btns = [];
    if (!isChief && (st === 'draft' || st === 'returned' || st === 'approved')) {
      btns.push('<button type="button" class="cp-btn cp-btn-primary" data-act="submit">'
        + '<svg class="cp-btn-svg" viewBox="0 0 24 24"><use href="#cp-i-send"/></svg>確認依頼</button>');
    }
    if (isChief && (st === 'submitted' || st === 'approved')) {
      btns.push('<button type="button" class="cp-btn cp-btn-ok" data-act="approve">'
        + '<svg class="cp-btn-svg" viewBox="0 0 24 24"><use href="#cp-i-check"/></svg>承認</button>');
      btns.push('<button type="button" class="cp-btn cp-btn-warn" data-act="return">'
        + '<svg class="cp-btn-svg" viewBox="0 0 24 24"><use href="#cp-i-back"/></svg>差し戻し</button>');
    }
    if (st === 'submitted' || st === 'returned' || st === 'published') {
      btns.push('<button type="button" class="cp-btn cp-btn-ghost" data-act="reopen">作成中に戻す</button>');
    }
    box.innerHTML = btns.join('') || '<p class="cp-meta">この状態で可能な操作はありません（ロール切替も確認）。</p>';
  }

  function renderEvents() {
    var ul = $('cp-hist');
    if (!ul) return;
    if (!state.events.length) {
      ul.innerHTML = '<li class="cp-meta">履歴はまだありません。</li>';
      return;
    }
    ul.innerHTML = state.events.map(function (ev) {
      var when = String(ev.createdAt || '').replace('T', ' ').slice(0, 16);
      var actor = ev.actor === 'chief_mgr' ? 'チーフ' : (ev.actor === 'carpool_mgr' ? '配車MGR' : esc(ev.actor || ''));
      return '<li><div>' + esc(ev.summary || ev.action) + '</div>'
        + '<div class="cp-hist-meta">' + esc(when) + '　' + actor + '　' + esc(ev.action) + '</div></li>';
    }).join('');
  }

  async function loadEvents() {
    var c = ensureClient();
    if (!c || !state.sheet) return;
    var res = await c.listCarpoolEvents(state.sheet.id);
    state.events = res.events || [];
    renderEvents();
  }

  async function openSheet(id) {
    var c = ensureClient();
    if (!c) return;
    setStatus('読込中…');
    var res = await c.getCarpoolSheet(id);
    state.sheet = res.sheet;
    state.attendanceAlert = res.attendanceAlert || null;
    state.candidates = null;
    var box = $('cp-cand-box');
    if (box) { box.classList.add('cp-hidden'); box.textContent = ''; }
    renderDetail();
    await loadEvents();
    setStatus('配車表を開きました');
  }

  async function createSheet() {
    var c = ensureClient();
    if (!c) return;
    var title = ($('cp-title') && $('cp-title').value) || ((cfg.teamShort || '') + ' 配車表');
    var date = ($('cp-date') && $('cp-date').value) || '';
    var campId = ($('cp-camp') && $('cp-camp').value) || '';
    var from = ($('cp-from') && $('cp-from').value) || '';
    var to = ($('cp-to') && $('cp-to').value) || '';
    var group = ($('cp-group') && $('cp-group').value) || '';
    setStatus('作成中…');
    var res = await c.upsertCarpoolSheet({
      title: title,
      activityDate: date,
      fromPlace: from,
      toPlace: to,
      groupLabel: group,
      attendanceCampaignId: campId,
      rows: [emptyRow(1)],
      actor: state.role
    });
    state.sheet = res.sheet;
    await loadSheets();
    renderDetail();
    await loadEvents();
    setFlow('make', { scroll: true });
    setStatus('配車表を作成しました');
  }

  async function saveSheet(extraSummary) {
    var c = ensureClient();
    if (!c || !state.sheet) return null;
    readTableIntoSheet();
    var v = runValidate();
    if (v.errors.length) {
      setStatus('ルール違反があります。修正してから保存してください', true);
      return null;
    }
    setStatus('保存中…');
    var payload = Object.assign({}, state.sheet, {
      actor: state.role,
      changeSummary: extraSummary || (state.role === 'chief_mgr' ? 'チーフMGRが修正して保存' : '配車表を保存')
    });
    var res = await c.upsertCarpoolSheet(payload);
    state.sheet = res.sheet;
    state.attendanceAlert = res.attendanceAlert || null;
    await loadSheets();
    renderDetail();
    await loadEvents();
    setStatus('保存しました');
    return state.sheet;
  }

  function addRow() {
    if (!state.sheet) return;
    readTableIntoSheet();
    var n = (state.sheet.rows || []).length + 1;
    state.sheet.rows.push(emptyRow(n));
    renderTable();
    runValidate();
  }

  function guessDriver(car) {
    if (car.send) return car.send;
    var base = String(car.memberName || '').replace(/^\d+[：:]/, '').trim();
    if (car.mother === 'o') return base + '母';
    if (car.father === 'o') return base + '父';
    return base;
  }

  function isBlankRow(r) {
    if (!r) return true;
    return !String(r.category || r.carModel || r.duty || r.driver || r.front
      || r.rear1 || r.rear2 || r.rear3 || r.rear4 || r.rear5 || r.note || '').trim();
  }

  async function loadCandidates() {
    var c = ensureClient();
    if (!c || !state.sheet) return;
    readTableIntoSheet();
    var campId = state.sheet.attendanceCampaignId || '';
    var date = state.sheet.activityDate || '';
    if (!campId || !date) {
      setStatus('出欠と日付を設定して保存してから取り込んでください', true);
      return;
    }
    setStatus('MG候補を取得中…');
    var cand = await c.getCarpoolCandidates(campId, date, state.sheet.id);
    state.candidates = cand;
    state.attendanceAlert = null;
    // 同期時刻をローカルにも反映
    state.sheet.attendanceSyncedAt = new Date().toISOString();
    renderAttendanceAlert();
    var lines = [];
    lines.push('配車可: ' + (cand.carCount || 0) + '台　出席: ' + (cand.riderCount || 0)
      + '　欠席・未回答: ' + (cand.absentCount || 0));
    if (cand.teaDuty && (cand.teaDuty.dutyA || cand.teaDuty.dutyB)) {
      lines.push('お茶当番: A ' + (cand.teaDuty.dutyA || '—') + ' / B ' + (cand.teaDuty.dutyB || '—'));
    }
    (cand.cars || []).forEach(function (car, i) {
      lines.push((i + 1) + '. ' + car.memberName + ' / ' + (car.carModel || '（車種未）')
        + ' / 空き' + (car.seats || '―')
        + ' / 送り:' + (car.send || '―'));
    });
    var box = $('cp-cand-box');
    if (box) {
      box.classList.remove('cp-hidden');
      box.innerHTML = esc(lines.join('\n')).replace(/\n/g, '<br>')
        + '<div style="margin-top:10px"><button type="button" id="cp-btn-apply-cand" class="cp-btn cp-btn-primary cp-btn-sm">候補から選手車を追加</button></div>';
    }
    setStatus('候補を取得しました');
  }

  function applyCandidates() {
    if (!state.sheet || !state.candidates) return;
    readTableIntoSheet();
    var rows = (state.sheet.rows || []).filter(function (r) { return !isBlankRow(r); });
    var start = rows.length;
    (state.candidates.cars || []).forEach(function (car, i) {
      var r = emptyRow(start + i + 1);
      r.category = '選手車';
      r.carModel = car.carModel || '';
      r.duty = '水筒・着替袋';
      r.driver = guessDriver(car);
      r.note = car.seats ? '空き' + car.seats + '名' : '';
      rows.push(r);
    });
    if (!rows.length) rows = [emptyRow(1)];
    state.sheet.rows = rows;
    renderDetail();
    setStatus((state.candidates.cars || []).length + '行を追加（手直ししてください）');
  }

  async function applyTeaDuty() {
    var c = ensureClient();
    if (!c || !state.sheet) return;
    readTableIntoSheet();
    var date = state.sheet.activityDate || '';
    if (!date) {
      setStatus('日付を設定してください', true);
      return;
    }
    setStatus('お茶当番を取得中…');
    var tea = await c.getTeaDutyOnDate(date);
    if (!tea.dutyA && !tea.dutyB) {
      setStatus('この日のお茶当番がありません', true);
      return;
    }
    var rows = (state.sheet.rows || []).filter(function (r) {
      return String(r.category || '') !== '当番車' && !isBlankRow(r);
    });
    function addDuty(name, label) {
      if (!name) return;
      var r = emptyRow(rows.length + 1);
      r.category = '当番車';
      r.duty = label;
      r.driver = String(name).replace(/^\d+[：:]/, '').trim() + '母';
      r.note = 'お茶当番から自動';
      rows.push(r);
    }
    addDuty(tea.dutyA, '当番A');
    addDuty(tea.dutyB, '当番B');
    state.sheet.rows = rows.length ? rows : [emptyRow(1)];
    renderDetail();
    setStatus('当番車を追加しました（車種・同乗は手直し）');
  }

  function updateSharePreview() {
    var pre = $('cp-share-preview');
    if (!pre || !state.sheet) return;
    readTableIntoSheet();
    var text = (window.TCB_carpoolLine && TCB_carpoolLine.formatSheetShare)
      ? TCB_carpoolLine.formatSheetShare(state.sheet, 'MG LINE')
      : '';
    pre.textContent = text;
  }

  async function copyShare(track) {
    if (!state.sheet) return;
    readTableIntoSheet();
    var label = track === 'b' ? '親父 LINE' : 'MG LINE';
    var text = TCB_carpoolLine.formatSheetShare(state.sheet, label);
    try {
      await navigator.clipboard.writeText(text);
      setStatus(label + '用をコピーしました');
    } catch (e) {
      updateSharePreview();
      setStatus('コピーに失敗しました。プレビューから手コピーしてください', true);
    }
  }

  async function doAction(action) {
    var c = ensureClient();
    if (!c || !state.sheet) return;
    if (action === 'submit' || action === 'approve' || action === 'publish') {
      var saved = await saveSheet(action === 'approve' ? '承認前に保存' : '');
      if (!saved && action !== 'publish') return;
    } else {
      readTableIntoSheet();
    }
    var note = ($('cp-return-note') && $('cp-return-note').value) || '';
    setStatus('処理中…');
    var res = await c.carpoolAction({
      id: state.sheet.id,
      action: action,
      actor: state.role,
      note: note
    });
    state.sheet = res.sheet;
    await loadSheets();
    renderDetail();
    await loadEvents();
    if (action === 'submit') setFlow('review', { scroll: true });
    if (action === 'approve' || action === 'publish') setFlow('share', { scroll: true });
    if (action === 'return') setFlow('make', { scroll: true });
    setStatus(STATUS_LABEL[state.sheet.status] || '更新しました');
  }

  function buildPrintHtml() {
    if (!state.sheet) return '';
    readTableIntoSheet();
    var s = state.sheet;
    var rows = (s.rows || []).slice().sort(function (a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
    var body = rows.map(function (r) {
      return '<tr>'
        + '<td>' + esc(r.sortOrder) + '</td><td>' + esc(r.category) + '</td><td>' + esc(r.carModel) + '</td>'
        + '<td>' + esc(r.duty) + '</td><td>' + esc(r.driver) + '</td><td>' + esc(r.front) + '</td>'
        + '<td>' + esc(r.rear1) + '</td><td>' + esc(r.rear2) + '</td><td>' + esc(r.rear3) + '</td>'
        + '<td>' + esc(r.rear4) + '</td><td>' + esc(r.rear5) + '</td><td>' + esc(r.note) + '</td></tr>';
    }).join('');
    return '<h1>' + esc(s.title || '配車表') + '</h1>'
      + '<div class="cp-print-route">' + esc(s.activityDate || '')
      + (s.groupLabel ? '　' + esc(s.groupLabel) : '') + '　'
      + esc(s.fromPlace || '') + (s.toPlace ? ' ⇒ ' + esc(s.toPlace) : '') + '</div>'
      + '<div class="cp-print-counts">台数 ' + rows.length + '　／　乗車名 ' + countPeople(rows) + '</div>'
      + '<table><thead><tr>'
      + '<th>配車順</th><th>分類</th><th>車種</th><th>担当</th><th>運転</th><th>助手</th>'
      + '<th>後部①</th><th>後部②</th><th>後部③</th><th>後部④</th><th>後部⑤</th><th>備考</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table>'
      + '<div class="cp-print-foot">' + esc(s.noteFooter || '') + '</div>';
  }

  async function exportPdf() {
    if (!state.sheet) return;
    var host = $('cp-print');
    if (!host) return;
    host.innerHTML = buildPrintHtml();
    if (typeof html2pdf === 'undefined') {
      setStatus('PDFライブラリがありません。印刷ダイアログを開きます', true);
      window.print();
      return;
    }
    setStatus('PDFを生成中…');
    var fname = (state.sheet.title || '配車表') + '_' + (state.sheet.activityDate || '') + '.pdf';
    await html2pdf().set({
      margin: 8,
      filename: fname,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    }).from(host).save();
    setStatus('PDFを保存しました');
  }

  async function boot() {
    setStatus('読込中…');
    await loadCampaigns();
    await loadSheets();
    setFlow('make');
    setStatus('準備できました');
  }

  document.addEventListener('DOMContentLoaded', function () {
    try {
      var r = sessionStorage.getItem(LS_ROLE);
      if (r) state.role = r === 'chief_mgr' ? 'chief_mgr' : 'carpool_mgr';
    } catch (e) {}
    setRole(state.role);

    if (!needLogin()) {
      unlock();
      boot().catch(function (e) { setStatus(e.message || String(e), true); });
    }
    $('cp-pw-btn').addEventListener('click', tryLogin);
    $('cp-pw-inp').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') tryLogin();
    });

    document.querySelectorAll('.cp-role-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setRole(btn.getAttribute('data-role'));
      });
    });
    document.querySelectorAll('.cp-flow-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setFlow(btn.getAttribute('data-cp-flow') || 'make', { scroll: true });
      });
    });

    var campSel = $('cp-camp');
    if (campSel) {
      campSel.addEventListener('change', function () {
        var opt = campSel.options[campSel.selectedIndex];
        var days = opt ? String(opt.getAttribute('data-days') || '').split(',').filter(Boolean) : [];
        var dateEl = $('cp-date');
        if (dateEl && !dateEl.value && days.length) dateEl.value = days[0];
      });
    }

    $('cp-btn-create').addEventListener('click', function () {
      createSheet().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-refresh').addEventListener('click', function () {
      boot().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-list').addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-id]');
      if (!el) return;
      openSheet(el.getAttribute('data-id')).catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-save').addEventListener('click', function () {
      saveSheet().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-add-row').addEventListener('click', addRow);
    $('cp-btn-load-cand').addEventListener('click', function () {
      loadCandidates().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-tea').addEventListener('click', function () {
      applyTeaDuty().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-pdf').addEventListener('click', function () {
      exportPdf().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-copy-mg').addEventListener('click', function () {
      copyShare('a').catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-copy-oyaji').addEventListener('click', function () {
      copyShare('b').catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('cp-btn-mark-pub').addEventListener('click', function () {
      if (state.role !== 'chief_mgr') {
        setStatus('展開済にするのはチーフMGRロールで操作してください', true);
        return;
      }
      doAction('publish').catch(function (e) { setStatus(e.message || String(e), true); });
    });

    $('cp-detail').addEventListener('click', function (ev) {
      if (ev.target && (ev.target.id === 'cp-btn-apply-cand' || ev.target.closest('#cp-btn-apply-cand'))) {
        applyCandidates();
        return;
      }
      if (ev.target && (ev.target.id === 'cp-btn-resync' || ev.target.closest('#cp-btn-resync'))) {
        loadCandidates().catch(function (e) { setStatus(e.message || String(e), true); });
        return;
      }
      var actBtn = ev.target.closest('[data-act]');
      if (actBtn) {
        doAction(actBtn.getAttribute('data-act')).catch(function (e) {
          setStatus(e.message || String(e), true);
        });
        return;
      }
      var del = ev.target.closest('[data-del]');
      if (!del || !state.sheet) return;
      readTableIntoSheet();
      var idx = parseInt(del.getAttribute('data-del'), 10);
      if (isNaN(idx)) return;
      state.sheet.rows.splice(idx, 1);
      state.sheet.rows.forEach(function (r, i) { r.sortOrder = i + 1; });
      renderTable();
      runValidate();
    });

    $('cp-detail').addEventListener('change', function () {
      if (!state.sheet) return;
      readTableIntoSheet();
      runValidate();
      updateSharePreview();
    });
  });
})();
