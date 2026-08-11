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
    playerGroups: { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] },
    swapUndoStack: [],
    lastSwap: null,
    dutyPick: null,
    dragSrc: null
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

  function isOn(v){ return v == 1 || v === '1' || v === true; }

  /** マスタ名「78：榎本」→ 表示用「榎本」 */
  function shortName(full) {
    var s = String(full || '');
    var i = s.indexOf('：');
    if (i < 0) i = s.indexOf(':');
    return i >= 0 ? s.slice(i + 1).trim() : s.trim();
  }

  function normalizeKey(s) {
    return String(s || '')
      .replace(/[（(]/g, '（').replace(/[）)]/g, '）')
      .replace(/\s+/g, '')
      .trim();
  }

  /** 短名またはフル名 → マスタの name（無ければ短名のまま） */
  function resolveMemberName(raw) {
    var want = normalizeKey(shortName(raw));
    if (!want) return '';
    var hit = state.members.filter(function (m) {
      return normalizeKey(shortName(m.name)) === want || normalizeKey(m.name) === normalizeKey(raw);
    })[0];
    return hit ? hit.name : String(raw || '').trim();
  }

  function shiftYm(ym, delta) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return ym;
    var d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function formatYmLabel(ym) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return ym || '';
    return m[1] + '年' + Number(m[2]) + '月';
  }

  function updateMonthChrome() {
    var ym = currentYm();
    var lab = formatYmLabel(ym);
    if ($('tea-ym-label')) $('tea-ym-label').textContent = lab;
    if ($('tea-print-title')) {
      $('tea-print-title').textContent =
        (cfg.teamName || '') + ' お茶当番　' + lab;
    }
    var now = new Date();
    var cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    ['tea-ym-prev', 'tea-ym-now', 'tea-ym-next'].forEach(function (id) {
      var b = $(id);
      if (b) b.classList.remove('is-current');
    });
    if (ym === cur && $('tea-ym-now')) $('tea-ym-now').classList.add('is-current');
    else if (ym === shiftYm(cur, -1) && $('tea-ym-prev')) $('tea-ym-prev').classList.add('is-current');
    else if (ym === shiftYm(cur, 1) && $('tea-ym-next')) $('tea-ym-next').classList.add('is-current');
  }

  function setMonthBadge(text) {
    if ($('tea-month-badge')) $('tea-month-badge').textContent = text || '';
  }

  function memberOptionsHtml(selected, includeBlank, mode) {
    // mode: 'tea' = 保護者当番A/B（コーチ保護者含む） / 'player' = 選手当番
    mode = mode || 'tea';
    var sel = String(selected || '');
    var html = includeBlank ? '<option value="">（未定）</option>' : '';
    state.members.forEach(function (m) {
      if (!m.name) return;
      var ok = mode === 'player' ? isOn(m.playerOk) : isOn(m.teaOk);
      if (!ok && m.name !== sel) return;
      var note = '';
      if (isOn(m.coach)) note = '（コーチ保護者）';
      else if (!ok) note = '（対象外）';
      html += '<option value="' + esc(m.name) + '"' +
        (m.name === sel ? ' selected' : '') +
        (!ok ? ' disabled' : '') + '>' + esc(shortName(m.name)) + note + '</option>';
    });
    if (sel && html.indexOf('value="' + esc(sel) + '"') < 0) {
      html = '<option value="' + esc(sel) + '" selected>' + esc(shortName(sel)) + '</option>' + html;
    }
    return html;
  }

  function weekdayLabel(iso) {
    if (Line.wdJa) return Line.wdJa(iso);
    return '';
  }

  function snapshotDuties() {
    return [].slice.call(document.querySelectorAll('.tea-day-row')).map(function (tr) {
      return {
        date: tr.querySelector('.tea-d-date').value,
        a: tr.querySelector('.tea-d-a').value,
        b: tr.querySelector('.tea-d-b').value
      };
    });
  }

  function applyDutySnapshot(snap) {
    var map = {};
    (snap || []).forEach(function (s) { map[s.date] = s; });
    [].slice.call(document.querySelectorAll('.tea-day-row')).forEach(function (tr) {
      var d = tr.querySelector('.tea-d-date').value;
      var s = map[d];
      if (!s) return;
      var a = tr.querySelector('.tea-d-a');
      var b = tr.querySelector('.tea-d-b');
      if (a) a.value = s.a;
      if (b) b.value = s.b;
    });
  }

  function updateUndoBtn() {
    var btn = $('tea-btn-undo-swap');
    if (btn) btn.disabled = !state.swapUndoStack.length;
  }

  function clearDutyPick() {
    state.dutyPick = null;
    document.querySelectorAll('.tea-duty-box.is-pick').forEach(function (el) {
      el.classList.remove('is-pick');
    });
  }

  function markSwapped(box1, box2) {
    if (box1) box1.classList.add('is-swapped');
    if (box2) box2.classList.add('is-swapped');
  }

  function clearSwappedMarks() {
    document.querySelectorAll('.tea-duty-box.is-swapped').forEach(function (el) {
      el.classList.remove('is-swapped');
    });
  }

  function selectOfBox(box) {
    return box ? box.querySelector('select') : null;
  }

  function swapDutyBoxes(srcBox, dstBox) {
    if (!srcBox || !dstBox || srcBox === dstBox) return false;
    var sa = selectOfBox(srcBox);
    var sb = selectOfBox(dstBox);
    if (!sa || !sb) return false;
    var fromName = sa.value;
    var toName = sb.value;
    if (fromName === toName) {
      setStatus('同じ名前同士のため入れ替え不要です');
      return false;
    }
    state.swapUndoStack.push(snapshotDuties());
    if (state.swapUndoStack.length > 30) state.swapUndoStack.shift();
    sa.value = toName;
    sb.value = fromName;
    srcBox.classList.remove('is-pick', 'is-drag-over');
    dstBox.classList.remove('is-pick', 'is-drag-over');
    markSwapped(srcBox, dstBox);
    var srcTr = srcBox.closest('.tea-day-row');
    var srcDate = srcTr ? srcTr.querySelector('.tea-d-date').value : '';
    state.lastSwap = {
      activityDate: srcDate,
      fromName: fromName,
      toName: toName
    };
    var today = new Date();
    if ($('tea-revised')) {
      $('tea-revised').value = today.getFullYear() + '.' + (today.getMonth() + 1) + '.' + today.getDate() + '更新';
      updateRevisedFoot();
    }
    updateUndoBtn();
    setFlow('change');
    setStatus('入れ替え: ' + shortName(fromName) + ' ↔ ' + shortName(toName) + '（未保存・戻す可）');
    return true;
  }

  function undoLastSwap() {
    if (!state.swapUndoStack.length) {
      setStatus('戻せる交代がありません');
      return;
    }
    var snap = state.swapUndoStack.pop();
    applyDutySnapshot(snap);
    clearSwappedMarks();
    clearDutyPick();
    state.lastSwap = null;
    updateUndoBtn();
    setStatus('直前の交代を戻しました（保存するまでサーバには未反映）');
  }

  function bindDutyBox(box) {
    if (!box || box.dataset.bound === '1') return;
    box.dataset.bound = '1';
    box.setAttribute('draggable', 'true');

    box.addEventListener('dragstart', function (ev) {
      state.dragSrc = box;
      box.classList.add('is-dragging');
      clearDutyPick();
      try {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', 'tea-duty');
      } catch (e) {}
    });
    box.addEventListener('dragend', function () {
      box.classList.remove('is-dragging');
      document.querySelectorAll('.tea-duty-box.is-drag-over').forEach(function (el) {
        el.classList.remove('is-drag-over');
      });
      state.dragSrc = null;
    });
    box.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      if (state.dragSrc && state.dragSrc !== box) box.classList.add('is-drag-over');
    });
    box.addEventListener('dragleave', function () {
      box.classList.remove('is-drag-over');
    });
    box.addEventListener('drop', function (ev) {
      ev.preventDefault();
      box.classList.remove('is-drag-over');
      var src = state.dragSrc;
      state.dragSrc = null;
      if (src) swapDutyBoxes(src, box);
    });

    // スマホ等: ⇄ または枠（select以外）タップで元→先
    box.addEventListener('click', function (ev) {
      if (ev.target && (ev.target.tagName === 'SELECT' || ev.target.closest('select'))) return;
      if (!state.dutyPick) {
        clearDutyPick();
        state.dutyPick = box;
        box.classList.add('is-pick');
        setStatus('交代元を選択しました。入れ替え先の枠（⇄）をタップしてください');
        return;
      }
      if (state.dutyPick === box) {
        clearDutyPick();
        setStatus('交代元の選択を解除しました');
        return;
      }
      var src = state.dutyPick;
      clearDutyPick();
      swapDutyBoxes(src, box);
    });
  }

  function addDayRow(prefill) {
    prefill = prefill || {};
    var tr = document.createElement('tr');
    tr.className = 'tea-day-row';
    tr.innerHTML =
      '<td><input type="date" class="tea-d-date" value="' + esc(prefill.activityDate || '') + '"></td>' +
      '<td class="tea-wd">' + esc(weekdayLabel(prefill.activityDate || '')) + '</td>' +
      '<td><div class="tea-duty-box" data-slot="A" title="ドラッグ／タップで他の枠と入れ替え">' +
        '<span class="tea-duty-grip" aria-hidden="true">⇄</span>' +
        '<select class="tea-d-a">' + memberOptionsHtml(prefill.dutyA, true, 'tea') + '</select></div></td>' +
      '<td><div class="tea-duty-box" data-slot="B" title="ドラッグ／タップで他の枠と入れ替え">' +
        '<span class="tea-duty-grip" aria-hidden="true">⇄</span>' +
        '<select class="tea-d-b">' + memberOptionsHtml(prefill.dutyB, true, 'tea') + '</select></div></td>' +
      '<td><div class="tea-pg-cell">' +
        '<select class="tea-d-pg" aria-label="選手班">' +
        '<option value="">—</option>' +
        [1, 2, 3, 4, 5, 6].map(function (n) {
          return '<option value="' + n + '"' + (String(prefill.playerGroup) === String(n) ? ' selected' : '') + '>' + n + '班</option>';
        }).join('') +
        '</select>' +
        '<span class="tea-pg-names"></span></div></td>' +
      '<td class="tea-no-print">' +
        '<button type="button" class="tea-btn tea-btn-ico tea-btn-danger tea-d-del" title="この行を削除" aria-label="この行を削除">' +
        '<svg viewBox="0 0 24 24"><use href="#tea-i-trash"/></svg></button></td>';
    $('tea-day-body').appendChild(tr);
    tr.querySelectorAll('.tea-duty-box').forEach(bindDutyBox);
    updatePlayerGroupHint(tr);
    tr.querySelector('.tea-d-date').addEventListener('change', function () {
      tr.querySelector('.tea-wd').textContent = weekdayLabel(this.value);
    });
    tr.querySelector('.tea-d-del').addEventListener('click', function () {
      tr.remove();
    });
    tr.querySelector('.tea-d-pg').addEventListener('change', function () {
      updatePlayerGroupHint(tr);
    });
    ['.tea-d-a', '.tea-d-b'].forEach(function (sel) {
      tr.querySelector(sel).addEventListener('change', function () {
        var box = this.closest('.tea-duty-box');
        // 手動変更はD&D交代ハイライトを外す（元に戻した場合もオレンジが残らないように）
        if (box) box.classList.remove('is-swapped', 'is-pick');
      });
    });
  }

  function playerNamesForGroup(g) {
    var list = state.playerGroups[String(g)] || [];
    return list.map(shortName).filter(Boolean);
  }

  function updatePlayerGroupHint(tr) {
    if (!tr) return;
    var sel = tr.querySelector('.tea-d-pg');
    var hint = tr.querySelector('.tea-pg-names');
    if (!sel || !hint) return;
    var g = sel.value;
    if (!g) {
      hint.textContent = '';
      return;
    }
    var names = playerNamesForGroup(g);
    hint.textContent = names.length ? names.join('・') : '（名簿未設定）';
    hint.title = names.join('、');
  }

  function refreshAllPlayerGroupHints() {
    document.querySelectorAll('.tea-day-row').forEach(updatePlayerGroupHint);
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

  function playerRosterNames() {
    return state.members
      .filter(function (m) { return m.name && isOn(m.playerOk); })
      .map(function (m) { return m.name; })
      .sort(function (a, b) {
        return shortName(a).localeCompare(shortName(b), 'ja');
      });
  }

  function normalizePlayerGroups(groups) {
    var out = emptyGroups();
    var seen = {};
    for (var i = 1; i <= 6; i++) {
      var k = String(i);
      (groups && groups[k] ? groups[k] : []).forEach(function (name) {
        var full = resolveMemberName(name) || String(name || '').trim();
        if (!full || seen[normalizeKey(shortName(full))]) return;
        seen[normalizeKey(shortName(full))] = true;
        out[k].push(full);
      });
    }
    return out;
  }

  function unassignedPlayers() {
    var assigned = {};
    for (var i = 1; i <= 6; i++) {
      (state.playerGroups[String(i)] || []).forEach(function (n) {
        assigned[normalizeKey(shortName(n))] = true;
      });
    }
    return playerRosterNames().filter(function (n) {
      return !assigned[normalizeKey(shortName(n))];
    });
  }

  function renderGroups() {
    var box = $('tea-groups');
    if (!box) return;
    state.playerGroups = normalizePlayerGroups(state.playerGroups);
    var un = unassignedPlayers();
    var html = '<div class="tea-gunassigned">' +
      '<h3>未割当<span class="tea-gcount">' + un.length + '人</span></h3>' +
      '<div class="tea-gchips" id="tea-g-unassigned">';
    if (!un.length) {
      html += '<span class="tea-gempty">全員が班に入っています</span>';
    } else {
      html += un.map(function (n) {
        return '<span class="tea-gchip"><span class="tea-gchip-name">' + esc(shortName(n)) + '</span></span>';
      }).join('');
    }
    html += '</div>';
    if (un.length) {
      html += '<div class="tea-gadd">' +
        '<select id="tea-g-pick" aria-label="未割当の選手">' +
        un.map(function (n) {
          return '<option value="' + esc(n) + '">' + esc(shortName(n)) + '</option>';
        }).join('') +
        '</select>' +
        '<select id="tea-g-to" aria-label="振り分け先の班">' +
        [1, 2, 3, 4, 5, 6].map(function (i) {
          return '<option value="' + i + '">' + i + '班へ</option>';
        }).join('') +
        '</select>' +
        '<button type="button" class="tea-btn tea-btn-ghost" id="tea-g-assign">追加</button>' +
        '</div>';
    }
    html += '</div><div class="tea-ggrid">';
    for (var i = 1; i <= 6; i++) {
      var k = String(i);
      var list = state.playerGroups[k] || [];
      html += '<div class="tea-gbox" data-g="' + k + '">' +
        '<h3>' + i + '班<span class="tea-gcount">' + list.length + '人</span></h3>' +
        '<div class="tea-gchips">';
      if (!list.length) {
        html += '<span class="tea-gempty">未設定</span>';
      } else {
        html += list.map(function (n) {
          return '<span class="tea-gchip" data-name="' + esc(n) + '">' +
            '<span class="tea-gchip-name">' + esc(shortName(n)) + '</span>' +
            '<button type="button" class="tea-gchip-x" data-g="' + k + '" data-name="' + esc(n) + '" title="未割当へ" aria-label="' + esc(shortName(n)) + 'を未割当へ">×</button>' +
            '</span>';
        }).join('');
      }
      html += '</div></div>';
    }
    html += '</div>';
    box.innerHTML = html;

    var assignBtn = $('tea-g-assign');
    if (assignBtn) {
      assignBtn.addEventListener('click', function () {
        var name = ($('tea-g-pick') && $('tea-g-pick').value) || '';
        var g = ($('tea-g-to') && $('tea-g-to').value) || '';
        if (!name || !g) return;
        state.playerGroups = normalizePlayerGroups(state.playerGroups);
        for (var i = 1; i <= 6; i++) {
          state.playerGroups[String(i)] = (state.playerGroups[String(i)] || []).filter(function (n) {
            return normalizeKey(shortName(n)) !== normalizeKey(shortName(name));
          });
        }
        state.playerGroups[String(g)].push(name);
        renderGroups();
        refreshAllPlayerGroupHints();
        setStatus(shortName(name) + ' を ' + g + '班へ振り分けました（未保存）');
      });
    }
    box.querySelectorAll('.tea-gchip-x').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var g = btn.getAttribute('data-g');
        var name = btn.getAttribute('data-name') || '';
        state.playerGroups[String(g)] = (state.playerGroups[String(g)] || []).filter(function (n) {
          return normalizeKey(shortName(n)) !== normalizeKey(shortName(name));
        });
        renderGroups();
        refreshAllPlayerGroupHints();
        setStatus(shortName(name) + ' を未割当に戻しました（未保存）');
      });
    });
  }

  function collectGroups() {
    return normalizePlayerGroups(state.playerGroups);
  }

  var FLOW_HINTS = {
    make: '前月から作成 → 内容確認 → 保存。そのあと「PDFで展開」へ。',
    share: '「印刷してPDF保存」→ MG LINE にPDFを添付して展開します。',
    change: '枠をドラッグ／タップで入れ替え → 保存 → もう一度PDFで再展開。'
  };

  function setFlow(mode) {
    mode = mode || 'make';
    document.querySelectorAll('.tea-flow-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tea-flow') === mode);
    });
    if ($('tea-flow-hint')) $('tea-flow-hint').textContent = FLOW_HINTS[mode] || FLOW_HINTS.make;
    if (mode === 'share' && $('tea-panel-share')) {
      try { $('tea-panel-share').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }
    if (mode === 'change' && $('tea-panel-table')) {
      try { $('tea-panel-table').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }
  }

  function doPrint() {
    setFlow('share');
    window.print();
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
    setStatus(added ? ('土日祝を ' + added + ' 日追加しました（当番は未設定）') : '追加する土日祝はありませんでした');
  }

  function groupsHaveMembers(groups) {
    var g = groups || {};
    return Object.keys(g).some(function (k) {
      return Array.isArray(g[k]) && g[k].length > 0;
    });
  }

  function emptyGroups() {
    return { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] };
  }

  function resolveSeedGroups(seedGroups) {
    var groups = emptyGroups();
    Object.keys(seedGroups || {}).forEach(function (k) {
      groups[k] = (seedGroups[k] || []).map(resolveMemberName).filter(Boolean);
    });
    return groups;
  }

  function teaRosterNames() {
    return state.members
      .filter(function (m) { return m.name && isOn(m.teaOk); })
      .map(function (m) { return m.name; })
      .sort(function (a, b) {
        return shortName(a).localeCompare(shortName(b), 'ja');
      });
  }

  function indexOfName(roster, name) {
    var want = normalizeKey(shortName(name));
    if (!want) return -1;
    for (var i = 0; i < roster.length; i++) {
      if (normalizeKey(shortName(roster[i])) === want || normalizeKey(roster[i]) === normalizeKey(name)) {
        return i;
      }
    }
    return -1;
  }

  function nextName(roster, prevName) {
    if (!roster.length) return '';
    var idx = indexOfName(roster, prevName);
    if (idx < 0) return roster[0];
    return roster[(idx + 1) % roster.length];
  }

  function nextPlayerGroup(prev) {
    var n = Number(prev);
    if (!Number.isFinite(n) || n < 1 || n > 6) return 1;
    return n === 6 ? 1 : n + 1;
  }

  function weekendDatesInMonth(ym) {
    if (!Cal || !Cal.toISO) return [];
    if (!/^\d{4}-\d{2}$/.test(ym)) return [];
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7));
    var start = new Date(y, m - 1, 1);
    var end = new Date(y, m, 0);
    var out = [];
    var cursor = start;
    while (cursor <= end) {
      var iso = Cal.toISO(cursor);
      var dow = cursor.getDay();
      var isHol = Cal.isHoliday && Cal.isHoliday(iso);
      if (dow === 0 || dow === 6 || isHol) out.push(iso);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return out;
  }

  async function ensureBaseline() {
    var seed = window.TCB_TeaSeed;
    var client = ensureSync();
    if (!client || !seed) return;

    var settings = await client.getTeaSettings();
    state.passwordHash = settings.passwordHash || state.passwordHash;
    if (groupsHaveMembers(settings.playerGroups)) {
      state.playerGroups = settings.playerGroups;
    } else {
      state.playerGroups = resolveSeedGroups(seed.playerGroups);
      try {
        await client.saveTeaSettings({ playerGroups: state.playerGroups });
      } catch (e) {
        /* カラム未追加時は後で月保存時に載せる */
      }
    }

    var aug = await client.getTeaMonth(seed.yearMonth);
    if (!aug.month) {
      var days = (seed.days || []).map(function (d) {
        return {
          activityDate: d.activityDate,
          dutyA: resolveMemberName(d.dutyA),
          dutyB: resolveMemberName(d.dutyB),
          playerGroup: d.playerGroup
        };
      });
      await client.saveTeaMonth({
        yearMonth: seed.yearMonth,
        note: seed.note || '',
        revisedAt: seed.revisedAt || '',
        playerGroups: state.playerGroups,
        days: days
      });
    } else if (!groupsHaveMembers(state.playerGroups) && groupsHaveMembers(aug.playerGroups)) {
      state.playerGroups = aug.playerGroups;
      try {
        await client.saveTeaSettings({ playerGroups: state.playerGroups });
      } catch (e) {}
    }
  }

  async function loadMonth() {
    var client = ensureSync();
    if (!client) return;
    var ym = currentYm();
    if (!ym) {
      setStatus('対象月を選んでください', true);
      return;
    }
    updateMonthChrome();
    setStatus('読込中…');
    var res = await client.getTeaMonth(ym);
    if (groupsHaveMembers(res.playerGroups)) {
      state.playerGroups = res.playerGroups;
    }
    $('tea-day-body').innerHTML = '';
    state.swapUndoStack = [];
    state.lastSwap = null;
    clearDutyPick();
    (res.days || []).forEach(function (d) {
      addDayRow({
        activityDate: d.activityDate,
        dutyA: d.dutyA,
        dutyB: d.dutyB,
        playerGroup: d.playerGroup
      });
    });
    updateUndoBtn();
    if ($('tea-note')) $('tea-note').value = (res.month && res.month.note) || '';
    if ($('tea-revised')) $('tea-revised').value = (res.month && res.month.revisedAt) || '';
    updateRevisedFoot();
    renderGroups();
    refreshAllPlayerGroupHints();
    if (res.month) {
      setMonthBadge('保存済み（最終更新: ' + (res.month.updatedAt || res.month.revisedAt || '—') + '）');
      setStatus(formatYmLabel(ym) + ' の表を読み込みました');
    } else {
      setMonthBadge('未保存です。「前月から作成」で土日祝と持ち回りを埋められます。');
      setStatus(formatYmLabel(ym) + ' は未保存です');
    }
  }

  async function createFromPreviousMonth() {
    var client = ensureSync();
    if (!client) return;
    var ym = currentYm();
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      setStatus('対象月を選んでください', true);
      return;
    }
    var existing = collectDays();
    if (existing.length) {
      if (!window.confirm(formatYmLabel(ym) + ' に既に日付があります。いったん消して前月から作り直しますか？')) {
        return;
      }
    }

    var prevYm = shiftYm(ym, -1);
    setStatus(formatYmLabel(prevYm) + ' を参照して作成中…');
    var prev = await client.getTeaMonth(prevYm);
    var prevDays = (prev.days || []).slice().sort(function (a, b) {
      return a.activityDate < b.activityDate ? -1 : 1;
    });

    if (!prevDays.length && window.TCB_TeaSeed && window.TCB_TeaSeed.yearMonth === prevYm) {
      prevDays = (window.TCB_TeaSeed.days || []).map(function (d) {
        return {
          activityDate: d.activityDate,
          dutyA: resolveMemberName(d.dutyA),
          dutyB: resolveMemberName(d.dutyB),
          playerGroup: d.playerGroup
        };
      });
    }
    if (!prevDays.length) {
      setStatus(formatYmLabel(prevYm) + ' の当番表がありません。先に前月を保存してください', true);
      return;
    }

    var last = prevDays[prevDays.length - 1];
    var roster = teaRosterNames();
    var dutyA = last.dutyA || '';
    var dutyB = last.dutyB || '';
    var pg = last.playerGroup;

    var dates = weekendDatesInMonth(ym);
    if (!dates.length) {
      setStatus('この月に土日祝がありません', true);
      return;
    }

    $('tea-day-body').innerHTML = '';
    dates.forEach(function (iso) {
      dutyA = nextName(roster, dutyA);
      dutyB = nextName(roster, dutyB);
      if (dutyB && dutyA && normalizeKey(shortName(dutyB)) === normalizeKey(shortName(dutyA))) {
        dutyB = nextName(roster, dutyB);
      }
      pg = nextPlayerGroup(pg);
      addDayRow({
        activityDate: iso,
        dutyA: dutyA,
        dutyB: dutyB,
        playerGroup: pg
      });
    });

    if ($('tea-note') && !$('tea-note').value) {
      $('tea-note').value = (prev.month && prev.month.note) ||
        (window.TCB_TeaSeed && window.TCB_TeaSeed.note) ||
        'あいうえお順持ち回り（原則）。交代時のみ表を更新。';
    }
    var today = new Date();
    if ($('tea-revised')) {
      $('tea-revised').value = today.getFullYear() + '.' + (today.getMonth() + 1) + '.' + today.getDate() + '作成';
      updateRevisedFoot();
    }
    refreshAllPlayerGroupHints();
    setMonthBadge(formatYmLabel(prevYm) + ' の続きで ' + dates.length + ' 日分を仮作成しました。確認して「保存」してください。');
    setStatus('前月から作成しました（未保存）');
    setFlow('make');
  }

  async function savePlayerGroups() {
    var client = ensureSync();
    if (!client) return;
    setStatus('選手班を保存中…');
    state.playerGroups = collectGroups();
    try {
      await client.saveTeaSettings({ playerGroups: state.playerGroups });
    } catch (e) {
      setStatus((e && e.message) || '選手班の保存に失敗しました（D1マイグレーション未適用の可能性）', true);
      return;
    }
    // 表示中の月があれば名簿も同期して保存（道具反映用の月次JSON互換）
    var ym = currentYm();
    if (ym && collectDays().length) {
      try {
        await client.saveTeaMonth({
          yearMonth: ym,
          note: ($('tea-note') && $('tea-note').value) || '',
          revisedAt: ($('tea-revised') && $('tea-revised').value) || '',
          playerGroups: state.playerGroups,
          days: collectDays()
        });
      } catch (e2) {
        setStatus('選手班設定は保存しましたが、当月表への同期に失敗: ' + (e2.message || e2), true);
        return;
      }
    }
    renderGroups();
    refreshAllPlayerGroupHints();
    setStatus('選手班を保存しました（退部・休部時以外は変更不要）');
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
    state.playerGroups = collectGroups();
    await client.saveTeaMonth({
      yearMonth: ym,
      note: ($('tea-note') && $('tea-note').value) || '',
      revisedAt: ($('tea-revised') && $('tea-revised').value) || '',
      playerGroups: state.playerGroups,
      days: collectDays()
    });
    try {
      await client.saveTeaSettings({ playerGroups: state.playerGroups });
    } catch (e) { /* 月保存が本体 */ }
    setStatus('当番表を保存しました。続けて「PDFで展開」できます');
    updateRevisedFoot();
    setMonthBadge('保存済み');
    clearSwappedMarks();
    state.swapUndoStack = [];
    updateUndoBtn();
    refreshAllPlayerGroupHints();
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
  }

  async function saveSupplies() {
    var client = ensureSync();
    if (!client) return;
    setStatus('品目を保存中…');
    var res = await client.saveTeaSupplies({ items: collectSuppliesFromEdit() });
    state.supplies = res.items || [];
    renderSupplyEdit();
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

  function bind() {
    var now = new Date();
    if ($('tea-ym') && !$('tea-ym').value) {
      $('tea-ym').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    updateMonthChrome();
    $('tea-pw-btn').addEventListener('click', tryLogin);
    $('tea-pw-inp').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') tryLogin(); });
    if ($('tea-btn-from-prev')) {
      $('tea-btn-from-prev').addEventListener('click', function () {
        createFromPreviousMonth().catch(function (e) { setStatus(e.message || String(e), true); });
      });
    }
    $('tea-btn-add-day').addEventListener('click', function () {
      addDayRow();
    });
    if ($('tea-btn-undo-swap')) {
      $('tea-btn-undo-swap').addEventListener('click', undoLastSwap);
    }
    $('tea-btn-save').addEventListener('click', function () {
      saveMonth().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    if ($('tea-btn-save-groups')) {
      $('tea-btn-save-groups').addEventListener('click', function () {
        savePlayerGroups().catch(function (e) { setStatus(e.message || String(e), true); });
      });
    }
    function onPrint() { doPrint(); }
    if ($('tea-btn-print')) $('tea-btn-print').addEventListener('click', onPrint);
    if ($('tea-btn-share-print')) $('tea-btn-share-print').addEventListener('click', onPrint);
    $('tea-revised').addEventListener('input', updateRevisedFoot);
    $('tea-ym').addEventListener('change', function () {
      updateMonthChrome();
      loadMonth().catch(function (e) { setStatus(e.message || String(e), true); });
    });
    function goYm(deltaOrCur) {
      var nowYm = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      var next = deltaOrCur === 'now' ? nowYm : shiftYm(currentYm() || nowYm, deltaOrCur);
      if ($('tea-ym')) $('tea-ym').value = next;
      updateMonthChrome();
      loadMonth().catch(function (e) { setStatus(e.message || String(e), true); });
    }
    $('tea-ym-prev').addEventListener('click', function () { goYm(-1); });
    $('tea-ym-now').addEventListener('click', function () { goYm('now'); });
    $('tea-ym-next').addEventListener('click', function () { goYm(1); });

    document.querySelectorAll('.tea-flow-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setFlow(btn.getAttribute('data-tea-flow') || 'make');
      });
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
      if (groupsHaveMembers(settings.playerGroups)) {
        state.playerGroups = settings.playerGroups;
      }
      var mem = await client.listTeaMembers();
      state.members = mem.members || [];
      await loadSupplies();
      await ensureBaseline();
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
