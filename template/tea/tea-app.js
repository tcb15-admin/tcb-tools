(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function sha256(str) {
    var hash = 5381, i = 0, s = String(str || '');
    for (; i < s.length; i++) {
      hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
      hash = hash & hash;
    }
    var h2 = hash ^ 0xdeadbeef;
    for (i = 0; i < s.length; i++) {
      h2 = ((h2 << 3) + h2) ^ (s.charCodeAt(i) * 31);
      h2 = h2 & h2;
    }
    var h3 = hash ^ h2 ^ 0xcafebabe;
    for (i = 0; i < s.length; i++) {
      h3 = ((h3 << 7) + h3 + hash) ^ s.charCodeAt(i);
      h3 = h3 & h3;
    }
    function toHex(n) { return (n >>> 0).toString(16).padStart(8, '0'); }
    return toHex(hash) + toHex(h2) + toHex(h3) + toHex(hash ^ h2 ^ h3);
  }

  var cfg = window.TCB_TEA_CFG || {};
  var Line = window.TCB_TeaLine || {};
  var Cal = window.TCB_AttCalendar || null;
  var LS_OK = (cfg.lsPrefix || 'tcb15') + '_tea_ok';
  var sync = null;
  var state = {
    members: [],
    passwordHash: '',
    supplies: [],
    days: [],
    playerGroups: { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] }
  };

  function setStatus(msg, isErr) {
    var el = $('tea-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'tea-status' + (isErr ? ' err' : '');
  }

  function ensureSync() {
    if (sync) return sync;
    sync = TCB_createSyncClient({
      baseUrl: cfg.apiBase || '',
      token: cfg.apiToken || '',
      cohort: String(cfg.cohort || '')
    });
    if (!sync) setStatus('同期設定が無効です（トークン未注入の可能性）', true);
    return sync;
  }

  function gateOk() {
    try { return sessionStorage.getItem(LS_OK) === '1'; } catch (e) { return false; }
  }
  function setGateOk() {
    try { sessionStorage.setItem(LS_OK, '1'); } catch (e) {}
  }

  function effectivePwHash() {
    return state.passwordHash || sha256(cfg.initialPw || '');
  }

  function tryLogin() {
    var v = ($('tea-pw-inp') && $('tea-pw-inp').value) || '';
    if (sha256(v) === effectivePwHash()) {
      setGateOk();
      $('tea-pw').classList.add('tea-hidden');
      bootApp();
    } else {
      $('tea-pw-err').textContent = 'パスワードが違います';
    }
  }

  function currentYm() {
    return ($('tea-ym') && $('tea-ym').value) || '';
  }

  function memberOptionsHtml(selected, includeBlank) {
    var sel = String(selected || '');
    var html = includeBlank ? '<option value="">（未定）</option>' : '';
    state.members.forEach(function (m) {
      if (!m.name) return;
      var dis = m.excluded == 1 || m.excluded === '1' || m.excluded === true;
      html += '<option value="' + esc(m.name) + '"' +
        (m.name === sel ? ' selected' : '') +
        (dis ? ' disabled' : '') + '>' + esc(m.name) + (dis ? '（対象外）' : '') + '</option>';
    });
    if (sel && html.indexOf('value="' + esc(sel) + '"') < 0) {
      html = '<option value="' + esc(sel) + '" selected>' + esc(sel) + '</option>' + html;
    }
    return html;
  }

  function weekdayLabel(iso) {
    if (Line.wdJa) return Line.wdJa(iso);
    return '';
  }

  function addDayRow(prefill) {
    prefill = prefill || {};
    var tr = document.createElement('tr');
    tr.className = 'tea-day-row';
    tr.innerHTML =
      '<td><input type="date" class="tea-d-date" value="' + esc(prefill.activityDate || '') + '"></td>' +
      '<td class="tea-wd">' + esc(weekdayLabel(prefill.activityDate || '')) + '</td>' +
      '<td><select class="tea-d-a">' + memberOptionsHtml(prefill.dutyA, true) + '</select></td>' +
      '<td><select class="tea-d-b">' + memberOptionsHtml(prefill.dutyB, true) + '</select></td>' +
      '<td><select class="tea-d-pg">' +
        '<option value="">—</option>' +
        [1, 2, 3, 4, 5, 6].map(function (n) {
          return '<option value="' + n + '"' + (String(prefill.playerGroup) === String(n) ? ' selected' : '') + '>' + n + '班</option>';
        }).join('') +
      '</select></td>' +
      '<td class="tea-no-print"><button type="button" class="tea-btn tea-btn-danger tea-d-del" style="min-height:36px;padding:6px 10px;font-size:13px">削除</button></td>';
    $('tea-day-body').appendChild(tr);
    tr.querySelector('.tea-d-date').addEventListener('change', function () {
      tr.querySelector('.tea-wd').textContent = weekdayLabel(this.value);
      refreshLineDaySelect();
    });
    tr.querySelector('.tea-d-del').addEventListener('click', function () {
      tr.remove();
      refreshLineDaySelect();
    });
  }

  function collectDays() {
    return [].slice.call(document.querySelectorAll('.tea-day-row')).map(function (tr) {
      var pg = tr.querySelector('.tea-d-pg').value;
      return {
        activityDate: tr.querySelector('.tea-d-date').value,
        dutyA: tr.querySelector('.tea-d-a').value,
        dutyB: tr.querySelector('.tea-d-b').value,
        playerGroup: pg ? Number(pg) : null
      };
    }).filter(function (d) { return !!d.activityDate; })
      .sort(function (a, b) { return a.activityDate < b.activityDate ? -1 : 1; });
  }

  function renderGroups() {
    var box = $('tea-groups');
    if (!box) return;
    box.innerHTML = '';
    for (var i = 1; i <= 6; i++) {
      var k = String(i);
      var div = document.createElement('div');
      div.className = 'tea-gbox';
      var opts = state.members.filter(function (m) { return m.name && !(m.excluded == 1 || m.excluded === '1'); })
        .map(function (m) {
          var sel = (state.playerGroups[k] || []).indexOf(m.name) >= 0;
          return '<option value="' + esc(m.name) + '"' + (sel ? ' selected' : '') + '>' + esc(m.name) + '</option>';
        }).join('');
      div.innerHTML = '<h3>' + i + '班</h3><select multiple size="6" data-g="' + k + '">' + opts + '</select>';
      box.appendChild(div);
    }
  }

  function collectGroups() {
    var out = { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] };
    [].slice.call(document.querySelectorAll('#tea-groups select[multiple]')).forEach(function (sel) {
      var k = sel.getAttribute('data-g');
      out[k] = [].slice.call(sel.selectedOptions).map(function (o) { return o.value; });
    });
    return out;
  }

  function refreshLineDaySelect() {
    var sel = $('tea-line-day');
    if (!sel) return;
    var cur = sel.value;
    var days = collectDays();
    sel.innerHTML = days.map(function (d) {
      var lab = (Line.fmtDate ? Line.fmtDate(d.activityDate) : d.activityDate) +
        ' A:' + (d.dutyA || '—') + ' B:' + (d.dutyB || '—');
      return '<option value="' + esc(d.activityDate) + '">' + esc(lab) + '</option>';
    }).join('') || '<option value="">（日付なし）</option>';
    if (cur) sel.value = cur;
    fillSwapSelects();
  }

  function fillSwapSelects() {
    ['tea-swap-from', 'tea-swap-to'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var cur = el.value;
      el.innerHTML = memberOptionsHtml(cur, true);
    });
  }

  function selectedDay() {
    var iso = $('tea-line-day') && $('tea-line-day').value;
    return collectDays().filter(function (d) { return d.activityDate === iso; })[0] || null;
  }

  function renderRestockChecks() {
    var box = $('tea-restock-checks');
    if (!box) return;
    var items = state.supplies.filter(function (it) { return it.active == 1 || it.active === '1' || it.active === true; });
    box.innerHTML = items.map(function (it, i) {
      return '<label class="tea-supply-row" style="cursor:pointer">' +
        '<input type="checkbox" class="tea-restock-cb" data-i="' + i + '" data-label="' + esc(it.label) + '" data-unit="' + esc(it.unitHint || '') + '">' +
        '<span>' + esc(it.label) + (it.unitHint ? '（' + esc(it.unitHint) + '）' : '') + '</span>' +
        '<input type="text" class="tea-restock-qty" placeholder="数量" style="flex:0 1 72px;min-height:36px" inputmode="numeric">' +
        '</label>';
    }).join('') || '<p class="tea-meta">品目マスタが空です</p>';
  }

  function renderSupplyEdit() {
    var box = $('tea-supply-edit');
    if (!box) return;
    box.innerHTML = state.supplies.map(function (it, i) {
      return '<div class="tea-supply-row" data-i="' + i + '">' +
        '<input type="text" class="tea-sup-label" value="' + esc(it.label) + '" maxlength="80" placeholder="品目名">' +
        '<input type="text" class="tea-sup-unit tea-unit" value="' + esc(it.unitHint || '') + '" maxlength="20" placeholder="単位">' +
        '<label style="font-size:12px"><input type="checkbox" class="tea-sup-active"' + ((it.active == 1 || it.active === '1' || it.active === true) ? ' checked' : '') + '>有効</label>' +
        '<button type="button" class="tea-btn tea-btn-danger tea-sup-del" style="min-height:36px;padding:6px 10px;font-size:13px">削除</button>' +
        '</div>';
    }).join('');
    box.querySelectorAll('.tea-sup-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.tea-supply-row');
        if (row) row.remove();
      });
    });
  }

  function collectSuppliesFromEdit() {
    return [].slice.call(document.querySelectorAll('#tea-supply-edit .tea-supply-row')).map(function (row, i) {
      return {
        id: (state.supplies[i] && state.supplies[i].id) || '',
        label: (row.querySelector('.tea-sup-label').value || '').trim(),
        unitHint: (row.querySelector('.tea-sup-unit').value || '').trim(),
        active: row.querySelector('.tea-sup-active').checked ? 1 : 0
      };
    }).filter(function (it) { return !!it.label; });
  }

  function setPreview(t) {
    if ($('tea-line-preview')) $('tea-line-preview').textContent = t || '';
  }

  async function copyText(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        setStatus('コピーしました');
        return;
      }
      throw new Error('no_clipboard');
    } catch (e) {
      window.prompt('コピーできませんでした。次の文面を選択してコピーしてください:', t);
    }
  }

  function fillWeekendDays() {
    if (!Cal || !Cal.nextSatSunHolidayDates) {
      setStatus('カレンダー部品を読み込めませんでした', true);
      return;
    }
    var ym = currentYm();
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      setStatus('対象月を選んでください', true);
      return;
    }
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7));
    var start = new Date(y, m - 1, 1);
    var end = new Date(y, m, 0);
    var existing = {};
    collectDays().forEach(function (d) { existing[d.activityDate] = d; });

    var cursor = start;
    var added = 0;
    while (cursor <= end) {
      var iso = Cal.toISO(cursor);
      var dow = cursor.getDay();
      var isHol = Cal.isHoliday && Cal.isHoliday(iso);
      if (dow === 0 || dow === 6 || isHol) {
        if (!existing[iso]) {
          addDayRow({ activityDate: iso });
          existing[iso] = 1;
          added++;
        }
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    refreshLineDaySelect();
    setStatus(added ? ('土日祝を ' + added + ' 日追加しました（当番は未設定）') : '追加する土日祝はありませんでした');
  }

  async function loadMonth() {
    var client = ensureSync();
    if (!client) return;
    var ym = currentYm();
    if (!ym) {
      setStatus('対象月を選んでください', true);
      return;
    }
    setStatus('読込中…');
    var res = await client.getTeaMonth(ym);
    state.playerGroups = res.playerGroups || state.playerGroups;
    $('tea-day-body').innerHTML = '';
    (res.days || []).forEach(function (d) {
      addDayRow({
        activityDate: d.activityDate,
        dutyA: d.dutyA,
        dutyB: d.dutyB,
        playerGroup: d.playerGroup
      });
    });
    if (!(res.days || []).length) {
      /* 空なら仮登録を促すだけ */
    }
    if ($('tea-note')) $('tea-note').value = (res.month && res.month.note) || '';
    if ($('tea-revised')) $('tea-revised').value = (res.month && res.month.revisedAt) || '';
    updateRevisedFoot();
    renderGroups();
    refreshLineDaySelect();
    setStatus(res.month ? '表を読み込みました' : '未保存の月です。土日祝の仮登録から始められます');
  }

  async function saveMonth() {
    var client = ensureSync();
    if (!client) return;
    var ym = currentYm();
    if (!ym) {
      setStatus('対象月を選んでください', true);
      return;
    }
    setStatus('保存中…');
    await client.saveTeaMonth({
      yearMonth: ym,
      note: ($('tea-note') && $('tea-note').value) || '',
      revisedAt: ($('tea-revised') && $('tea-revised').value) || '',
      playerGroups: collectGroups(),
      days: collectDays()
    });
    setStatus('当番表を保存しました（道具割振りへ反映可能）');
    updateRevisedFoot();
  }

  function updateRevisedFoot() {
    var t = ($('tea-revised') && $('tea-revised').value) || '';
    if ($('tea-revised-foot')) $('tea-revised-foot').textContent = t;
  }

  async function loadSupplies() {
    var client = ensureSync();
    if (!client) return;
    var res = await client.listTeaSupplies();
    state.supplies = res.items || [];
    renderSupplyEdit();
    renderRestockChecks();
  }

  async function saveSupplies() {
    var client = ensureSync();
    if (!client) return;
    setStatus('品目を保存中…');
    var res = await client.saveTeaSupplies({ items: collectSuppliesFromEdit() });
    state.supplies = res.items || [];
    renderSupplyEdit();
    renderRestockChecks();
    setStatus('品目マスタを保存しました');
  }

  async function changePassword() {
    var a = ($('tea-pw-new') && $('tea-pw-new').value) || '';
    var b = ($('tea-pw-new2') && $('tea-pw-new2').value) || '';
    if (!a || a.length < 4) {
      setStatus('パスワードは4文字以上にしてください', true);
      return;
    }
    if (a !== b) {
      setStatus('確認用パスワードが一致しません', true);
      return;
    }
    var client = ensureSync();
    if (!client) return;
    var hash = sha256(a);
    await client.saveTeaSettings({ passwordHash: hash });
    state.passwordHash = hash;
    $('tea-pw-new').value = '';
    $('tea-pw-new2').value = '';
    setStatus('パスワードを変更しました（他端末でも新しいパスワードになります）');
  }

  function genPickup() {
    var d = selectedDay();
    if (!d) { setStatus('対象日を選んでください', true); return; }
    setPreview(Line.formatPickupAssign(d.dutyA, d.dutyB));
  }
  function genRestock() {
    var items = [];
    [].slice.call(document.querySelectorAll('.tea-restock-cb:checked')).forEach(function (cb) {
      var row = cb.closest('.tea-supply-row');
      var qty = row ? (row.querySelector('.tea-restock-qty').value || '').trim() : '';
      items.push({
        label: cb.getAttribute('data-label') || '',
        unitHint: cb.getAttribute('data-unit') || '',
        qty: qty
      });
    });
    setPreview(Line.formatRestock(items));
  }
  function genRecv() {
    var d = selectedDay();
    if (!d) { setStatus('対象日を選んでください', true); return; }
    var set = ($('tea-line-set') && $('tea-line-set').value) || 'B';
    var name = set === 'A' ? d.dutyA : d.dutyB;
    setPreview(Line.formatReceived(d.activityDate, set, name));
  }
  function genSwap() {
    var d = selectedDay();
    if (!d) { setStatus('対象日を選んでください', true); return; }
    setPreview(Line.formatSwap([{
      activityDate: d.activityDate,
      fromName: ($('tea-swap-from') && $('tea-swap-from').value) || '',
      toName: ($('tea-swap-to') && $('tea-swap-to').value) || ''
    }]));
  }
  function genToday() {
    var d = selectedDay();
    if (!d) { setStatus('対象日を選んでください', true); return; }
    var set = ($('tea-line-set') && $('tea-line-set').value) || 'A';
    var name = set === 'A' ? d.dutyA : d.dutyB;
    setPreview(Line.formatTodayPickup(d.activityDate, set, name, '父が引き取ります'));
  }

  function bind() {
    var now = new Date();
    if ($('tea-ym') && !$('tea-ym').value) {
      $('tea-ym').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    $('tea-pw-btn').addEventListener('click', tryLogin);
    $('tea-pw-inp').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') tryLogin(); });
    $('tea-btn-load').addEventListener('click', function () {
      loadMonth().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('tea-btn-fill-cal').addEventListener('click', fillWeekendDays);
    $('tea-btn-add-day').addEventListener('click', function () {
      addDayRow();
      refreshLineDaySelect();
    });
    $('tea-btn-save').addEventListener('click', function () {
      saveMonth().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('tea-btn-print').addEventListener('click', function () { window.print(); });
    $('tea-revised').addEventListener('input', updateRevisedFoot);
    $('tea-ym').addEventListener('change', function () {
      loadMonth().catch(function (e) { setStatus(e.message || String(e), true); });
    });

    $('tea-line-pickup').addEventListener('click', genPickup);
    $('tea-line-restock').addEventListener('click', function () {
      if ($('tea-restock-panel')) $('tea-restock-panel').open = true;
      genRestock();
    });
    $('tea-line-recv').addEventListener('click', genRecv);
    $('tea-line-swap').addEventListener('click', function () {
      if ($('tea-swap-panel')) $('tea-swap-panel').open = true;
      genSwap();
    });
    $('tea-line-today').addEventListener('click', genToday);
    $('tea-line-copy').addEventListener('click', function () {
      copyText(($('tea-line-preview') && $('tea-line-preview').textContent) || '');
    });

    $('tea-supply-add').addEventListener('click', function () {
      state.supplies.push({ id: '', label: '', unitHint: '', active: 1 });
      renderSupplyEdit();
    });
    $('tea-supply-save').addEventListener('click', function () {
      saveSupplies().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    $('tea-pw-change').addEventListener('click', function () {
      changePassword().catch(function (e) { setStatus(e.message || String(e), true); });
    });
  }

  async function bootApp() {
    var client = ensureSync();
    if (!client) return;
    try {
      var settings = await client.getTeaSettings();
      state.passwordHash = settings.passwordHash || '';
      var mem = await client.listTeaMembers();
      state.members = mem.members || [];
      await loadSupplies();
      await loadMonth();
    } catch (e) {
      setStatus(e.message || String(e), true);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    var pwBtn = $('tea-pw-btn');
    if (gateOk()) {
      $('tea-pw').classList.add('tea-hidden');
      bootApp();
      return;
    }
    if (pwBtn) pwBtn.disabled = true;
    var client = ensureSync();
    if (!client) {
      if (pwBtn) pwBtn.disabled = false;
      return;
    }
    client.getTeaSettings().then(function (s) {
      state.passwordHash = s.passwordHash || '';
      if (pwBtn) pwBtn.disabled = false;
    }).catch(function () {
      if (pwBtn) pwBtn.disabled = false;
    });
  });
})();
