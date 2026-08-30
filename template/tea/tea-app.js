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
    savedGroupsSnap: '',
    dirty: false,
    shareMsgTemplate: '',
    shareMsgTemplateRev: '',
    shareBaselineDays: [],
    shareBaselineGroups: null,
    swapUndoStack: [],
    lastSwap: null,
    dutyPick: null,
    dragSrc: null
  };

  function defaultNote() {
    var seed = window.TCB_TeaSeed;
    return (seed && seed.defaultNote) || (seed && seed.note) || '';
  }

  function markDirty() {
    state.dirty = true;
    updateDirtyUi();
    refreshShareMsgAfterEdit();
  }

  /** 表・名簿の編集に合わせて、未手編集の案内文へ変更内容を反映 */
  function refreshShareMsgAfterEdit() {
    var el = $('tea-share-msg');
    if (!el || !hasTableChanges()) return;
    var cur = String(el.value || '');
    var atDefault = !cur.trim() ||
      cur === state._lastShareDefault ||
      cur.indexOf('（変更内容を記入してください）') >= 0;
    if (!atDefault) return;
    setShareKind('revision', true);
    fillShareMsg(true);
  }

  function clearDirty() {
    state.dirty = false;
    state.savedGroupsSnap = groupsSnap(collectGroups());
    updateDirtyUi();
    clearGroupChangeMarks();
  }

  /** 変更送付の差分基準（読込／新規作成時点。保存や共有では更新しない） */
  function captureShareBaseline() {
    state.shareBaselineDays = collectDays().map(function (d) {
      return {
        activityDate: d.activityDate,
        dutyA: d.dutyA || '',
        dutyB: d.dutyB || '',
        playerGroup: d.playerGroup == null ? null : Number(d.playerGroup)
      };
    });
    state.shareBaselineGroups = collectGroups();
  }

  function fmtShareDate(iso) {
    var Line = window.TCB_TeaLine;
    if (Line && Line.fmtDate) return Line.fmtDate(iso);
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || '');
    return String(Number(m[2])) + '/' + String(Number(m[3]));
  }

  function samePerson(a, b) {
    return normalizeKey(shortName(a)) === normalizeKey(shortName(b));
  }

  function buildChangeSummary() {
    var lines = [];
    var baseMap = {};
    (state.shareBaselineDays || []).forEach(function (d) {
      baseMap[d.activityDate] = d;
    });
    var curDays = collectDays();
    var curMap = {};
    curDays.forEach(function (d) {
      curMap[d.activityDate] = d;
      var b = baseMap[d.activityDate];
      if (!b) {
        lines.push(fmtShareDate(d.activityDate) + '　追加　A:' + (shortName(d.dutyA) || '—') +
          '　B:' + (shortName(d.dutyB) || '—') +
          (d.playerGroup ? '　選手:' + d.playerGroup + '班' : ''));
        return;
      }
      var parts = [];
      if (!samePerson(b.dutyA, d.dutyA)) {
        parts.push('A:' + (shortName(b.dutyA) || '—') + '→' + (shortName(d.dutyA) || '—'));
      }
      if (!samePerson(b.dutyB, d.dutyB)) {
        parts.push('B:' + (shortName(b.dutyB) || '—') + '→' + (shortName(d.dutyB) || '—'));
      }
      var bpg = b.playerGroup == null || b.playerGroup === '' ? '' : String(b.playerGroup);
      var cpg = d.playerGroup == null || d.playerGroup === '' ? '' : String(d.playerGroup);
      if (bpg !== cpg) {
        parts.push('選手:' + (bpg ? bpg + '班' : '—') + '→' + (cpg ? cpg + '班' : '—'));
      }
      if (parts.length) {
        lines.push(fmtShareDate(d.activityDate) + '　' + parts.join('　'));
      }
    });
    Object.keys(baseMap).forEach(function (iso) {
      if (!curMap[iso]) lines.push(fmtShareDate(iso) + '　削除');
    });

    var bg = state.shareBaselineGroups || emptyGroups();
    var cg = collectGroups();
    for (var i = 1; i <= 6; i++) {
      var k = String(i);
      var a = (bg[k] || []).map(shortName).join('・');
      var b = (cg[k] || []).map(shortName).join('・');
      if (a !== b) {
        lines.push(i + '班名簿　' + (a || '（空）') + ' → ' + (b || '（空）'));
      }
    }

    return lines.length ? lines.join('\n') : '';
  }

  function hasTableChanges() {
    return !!buildChangeSummary();
  }

  function groupsSnap(groups) {
    var g = normalizePlayerGroups(groups || state.playerGroups);
    var keys = ['1', '2', '3', '4', '5', '6'];
    return keys.map(function (k) {
      return k + ':' + (g[k] || []).map(function (n) { return normalizeKey(shortName(n)); }).sort().join('|');
    }).join(';');
  }

  function updateDirtyUi() {
    var badge = $('tea-dirty-badge');
    if (badge) badge.classList.toggle('tea-hidden', !state.dirty);
    var saveBtn = $('tea-btn-save');
    if (saveBtn) saveBtn.classList.toggle('tea-btn-warn', !!state.dirty);
    highlightGroupChanges();
  }

  function clearGroupChangeMarks() {
    document.querySelectorAll('.tea-gbox.is-changed, .tea-gchip.is-changed').forEach(function (el) {
      el.classList.remove('is-changed');
    });
  }

  function highlightGroupChanges() {
    if (!state.savedGroupsSnap) return;
    var saved = {};
    state.savedGroupsSnap.split(';').forEach(function (part) {
      var i = part.indexOf(':');
      if (i < 0) return;
      saved[part.slice(0, i)] = part.slice(i + 1);
    });
    document.querySelectorAll('.tea-gbox[data-g]').forEach(function (box) {
      var k = box.getAttribute('data-g');
      var cur = (state.playerGroups[k] || []).map(function (n) {
        return normalizeKey(shortName(n));
      }).sort().join('|');
      var changed = (saved[k] || '') !== cur;
      box.classList.toggle('is-changed', changed);
      var savedSet = {};
      String(saved[k] || '').split('|').forEach(function (x) {
        if (x) savedSet[x] = true;
      });
      box.querySelectorAll('.tea-gchip[data-name]').forEach(function (chip) {
        var key = normalizeKey(shortName(chip.getAttribute('data-name') || ''));
        chip.classList.toggle('is-changed', changed && !savedSet[key]);
      });
    });
  }

  function syncNotePrint() {
    var t = ($('tea-note') && $('tea-note').value) || '';
    if ($('tea-note-print')) $('tea-note-print').textContent = t;
  }

  function applyDefaultNoteIfEmpty() {
    if (!$('tea-note')) return;
    if (!String($('tea-note').value || '').trim()) {
      $('tea-note').value = defaultNote();
    }
    syncNotePrint();
  }

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
    // mode: 'tea' = 保護者当番A/B / 'player' = 選手当番
    mode = mode || 'tea';
    var sel = String(selected || '');
    var html = includeBlank ? '<option value="">（未定）</option>' : '';
    state.members.forEach(function (m) {
      if (!m.name) return;
      var ok = mode === 'player' ? isOn(m.playerOk) : isOn(m.teaOk);
      if (!ok && m.name !== sel) return;
      html += '<option value="' + esc(m.name) + '"' +
        (m.name === sel ? ' selected' : '') +
        (!ok ? ' disabled' : '') + '>' + esc(shortName(m.name)) + '</option>';
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

  /** （未定）＝空選択の枠を視認用に着色（必須ではない） */
  function syncDutyTbd(box) {
    var sel = selectOfBox(box);
    if (!box || !sel) return;
    box.classList.toggle('tcb-val-tbd', !String(sel.value || '').trim());
  }

  function syncPgTbd(sel) {
    if (!sel) return;
    sel.classList.toggle('tcb-val-tbd', !String(sel.value || '').trim());
  }

  function syncAllTbdFields() {
    document.querySelectorAll('.tea-duty-box').forEach(syncDutyTbd);
    document.querySelectorAll('.tea-d-pg').forEach(syncPgTbd);
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
    setFlow('make');
    markDirty();
    setStatus('入れ替え: ' + shortName(fromName) + ' ↔ ' + shortName(toName) + '（未保存・戻す可）');
    syncAllTbdFields();
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
    markDirty();
    setStatus('直前の交代を戻しました（保存するまでサーバには未反映）');
    syncAllTbdFields();
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
      '<td><select class="tea-d-pg" aria-label="選手班">' +
        '<option value="">—</option>' +
        [1, 2, 3, 4, 5, 6].map(function (n) {
          return '<option value="' + n + '"' + (String(prefill.playerGroup) === String(n) ? ' selected' : '') + '>' + n + '班</option>';
        }).join('') +
      '</select></td>' +
      '<td class="tea-no-print">' +
        '<button type="button" class="tea-btn tea-btn-ico tea-btn-danger tea-d-del" title="この行を削除" aria-label="この行を削除">' +
        '<svg viewBox="0 0 24 24"><use href="#tea-i-trash"/></svg></button></td>';
    $('tea-day-body').appendChild(tr);
    tr.querySelectorAll('.tea-duty-box').forEach(bindDutyBox);
    tr.querySelector('.tea-d-date').addEventListener('change', function () {
      tr.querySelector('.tea-wd').textContent = weekdayLabel(this.value);
      refreshDayTableOrder({ resequencePg: true });
      syncAllTbdFields();
      markDirty();
    });
    tr.querySelector('.tea-d-del').addEventListener('click', function () {
      tr.remove();
      refreshDayTableOrder({ resequencePg: true });
      syncAllTbdFields();
      markDirty();
    });
    tr.querySelector('.tea-d-pg').addEventListener('change', function () {
      syncPgTbd(this);
      markDirty();
    });
    ['.tea-d-a', '.tea-d-b'].forEach(function (sel) {
      tr.querySelector(sel).addEventListener('change', function () {
        var box = this.closest('.tea-duty-box');
        // 手動変更はD&D交代ハイライトを外す（元に戻した場合もオレンジが残らないように）
        if (box) {
          box.classList.remove('is-swapped', 'is-pick');
          syncDutyTbd(box);
        }
        markDirty();
      });
    });
    tr.querySelectorAll('.tea-duty-box').forEach(syncDutyTbd);
    syncPgTbd(tr.querySelector('.tea-d-pg'));
    if (prefill.activityDate) {
      refreshDayTableOrder({ resequencePg: false });
    }
  }

  /** 日付のある行を日付昇順に並べ替え（日付未入力は末尾） */
  function sortDayRowsByDate() {
    var body = $('tea-day-body');
    if (!body) return;
    var rows = [].slice.call(body.querySelectorAll('.tea-day-row'));
    rows.sort(function (a, b) {
      var da = (a.querySelector('.tea-d-date') && a.querySelector('.tea-d-date').value) || '';
      var db = (b.querySelector('.tea-d-date') && b.querySelector('.tea-d-date').value) || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      if (da < db) return -1;
      if (da > db) return 1;
      return 0;
    });
    rows.forEach(function (tr) { body.appendChild(tr); });
  }

  /**
   * 日付順の行に対し選手班を 1→6 の連続に振り直す。
   * 起点は「最も早い日付行」に既にある班（無ければ1）。
   */
  function resequencePlayerGroups() {
    var rows = [].slice.call(document.querySelectorAll('.tea-day-row')).filter(function (tr) {
      var inp = tr.querySelector('.tea-d-date');
      return inp && inp.value;
    });
    if (!rows.length) return;
    var startPg = null;
    var firstPg = rows[0].querySelector('.tea-d-pg');
    if (firstPg && firstPg.value) {
      var n0 = Number(firstPg.value);
      if (Number.isFinite(n0) && n0 >= 1 && n0 <= 6) startPg = n0;
    }
    if (startPg === null) startPg = 1;
    rows.forEach(function (tr, i) {
      var pgSel = tr.querySelector('.tea-d-pg');
      if (!pgSel) return;
      pgSel.value = String(((startPg - 1 + i) % 6) + 1);
    });
  }

  function refreshDayTableOrder(opts) {
    opts = opts || {};
    sortDayRowsByDate();
    if (opts.resequencePg) resequencePlayerGroups();
    syncAllTbdFields();
  }

  function playerNamesForGroup(g) {
    var list = state.playerGroups[String(g)] || [];
    return list.map(shortName).filter(Boolean);
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
    return sortNamesByRoster(
      state.members
        .filter(function (m) { return m.name && isOn(m.playerOk); })
        .map(function (m) { return m.name; })
    );
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
      out[k] = sortNamesByRoster(out[k]);
    }
    return out;
  }

  /** 共有名簿（シード）のあいうえお順。未知の名前は末尾で localeCompare */
  function teaRosterOrderIndex() {
    if (teaRosterOrderIndex._map) return teaRosterOrderIndex._map;
    var map = {};
    var seed = window.TCB_TeaSeed;
    var n = 0;
    if (seed && seed.playerGroups) {
      for (var i = 1; i <= 6; i++) {
        (seed.playerGroups[String(i)] || []).forEach(function (name) {
          var key = normalizeKey(name);
          if (!key || map[key] !== undefined) return;
          map[key] = n++;
        });
      }
    }
    teaRosterOrderIndex._map = map;
    return map;
  }

  function sortNamesByRoster(list) {
    var order = teaRosterOrderIndex();
    return (list || []).slice().sort(function (a, b) {
      var sa = shortName(a);
      var sb = shortName(b);
      var ka = normalizeKey(sa);
      var kb = normalizeKey(sb);
      var ia = order[ka];
      var ib = order[kb];
      var aKnown = ia !== undefined;
      var bKnown = ib !== undefined;
      if (aKnown && bKnown && ia !== ib) return ia - ib;
      if (aKnown && !bKnown) return -1;
      if (!aKnown && bKnown) return 1;
      return sa.localeCompare(sb, 'ja');
    });
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
      '<div class="tea-gchips tea-gchips-grid" id="tea-g-unassigned">';
    if (!un.length) {
      html += '<span class="tea-gempty">全員割当済</span>';
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
        '<div class="tea-gchips tea-gchips-grid">';
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
    highlightGroupChanges();

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
        state.playerGroups[String(g)] = sortNamesByRoster(state.playerGroups[String(g)]);
        markDirty();
        renderGroups();
        setStatus(shortName(name) + ' を ' + g + '班へ振り分けました（未保存）');
      });
    }
    box.querySelectorAll('.tea-gchip-x').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var g = btn.getAttribute('data-g');
        var name = btn.getAttribute('data-name') || '';
        state.playerGroups[String(g)] = sortNamesByRoster(
          (state.playerGroups[String(g)] || []).filter(function (n) {
            return normalizeKey(shortName(n)) !== normalizeKey(shortName(name));
          })
        );
        markDirty();
        renderGroups();
        setStatus(shortName(name) + ' を未割当に戻しました（未保存）');
      });
    });
  }

  function collectGroups() {
    return normalizePlayerGroups(state.playerGroups);
  }

  var FLOW_HINTS = {
    make: '前月から作成、または枠の入れ替え／名簿修正 → 保存。そのあと「LINEで展開」へ。',
    share: '「保存・LINE送信」でPDFを作成し、共有シートから MG LINE へ送ります。'
  };

  function setFlow(mode, opts) {
    mode = mode || 'make';
    if (mode === 'change') mode = 'make';
    opts = opts || {};
    document.querySelectorAll('.tea-flow-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tea-flow') === mode);
    });
    if ($('tea-flow-hint')) $('tea-flow-hint').textContent = FLOW_HINTS[mode] || FLOW_HINTS.make;
    if (mode === 'share') {
      var prevKind = getShareKind();
      var nextKind = suggestShareKind();
      setShareKind(nextKind, true);
      var el = $('tea-share-msg');
      var cur = el ? String(el.value || '') : '';
      var atDefault = !cur.trim() || cur === state._lastShareDefault;
      if (prevKind !== nextKind || atDefault) fillShareMsg(true);
      if ($('tea-panel-share')) {
        try { $('tea-panel-share').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      }
    } else if (opts.scroll && $('tea-panel-table')) {
      try { $('tea-panel-table').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }
  }

  function setShareStatus(msg, isErr) {
    var el = $('tea-share-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'tea-status' + (isErr ? ' err' : '');
  }

  function getShareKind() {
    var rev = $('tea-share-kind-revision');
    return (rev && rev.checked) ? 'revision' : 'initial';
  }

  function setShareKind(kind, silent) {
    var isRev = kind === 'revision';
    if ($('tea-share-kind-revision')) $('tea-share-kind-revision').checked = isRev;
    if ($('tea-share-kind-initial')) $('tea-share-kind-initial').checked = !isRev;
    if (!silent) fillShareMsg(true);
  }

  function shareMsgPayload() {
    return {
      ym: currentYm(),
      cohortLabel: cfg.cohortLabel || (cfg.cohort ? cfg.cohort + '期' : ''),
      revisedAt: ($('tea-revised') && $('tea-revised').value) || '',
      kind: getShareKind(),
      changeSummary: buildChangeSummary()
    };
  }

  function activeShareTemplate() {
    var Print = window.TCB_TeaPrint;
    var kind = getShareKind();
    if (kind === 'revision') {
      if (state.shareMsgTemplateRev && String(state.shareMsgTemplateRev).trim()) {
        return String(state.shareMsgTemplateRev);
      }
      if (Print && typeof Print.systemShareTemplateRevision === 'function') {
        return Print.systemShareTemplateRevision();
      }
    } else {
      if (state.shareMsgTemplate && String(state.shareMsgTemplate).trim()) {
        return String(state.shareMsgTemplate);
      }
      if (Print && typeof Print.systemShareTemplateInitial === 'function') {
        return Print.systemShareTemplateInitial();
      }
      if (Print && typeof Print.systemShareTemplate === 'function') {
        return Print.systemShareTemplate();
      }
    }
    return '';
  }

  function defaultShareMsgText() {
    var Print = window.TCB_TeaPrint;
    if (Print && typeof Print.applyShareTemplate === 'function') {
      return Print.applyShareTemplate(activeShareTemplate(), shareMsgPayload());
    }
    return '';
  }

  function suggestShareKind() {
    /* 読込後に表・名簿が変わっているときだけ変更送付を自動選択 */
    if (hasTableChanges()) return 'revision';
    return 'initial';
  }

  function fillShareMsg(force) {
    var el = $('tea-share-msg');
    if (!el) return;
    var def = defaultShareMsgText();
    if (force || !String(el.value || '').trim()) {
      el.value = def;
    }
    state._lastShareDefault = def;
  }

  function loadShareTemplatesFromRaw(raw) {
    var Print = window.TCB_TeaPrint;
    var parsed = Print && Print.parseStoredShareTemplates
      ? Print.parseStoredShareTemplates(raw)
      : { initial: String(raw || ''), revision: '' };
    state.shareMsgTemplate = parsed.initial || '';
    state.shareMsgTemplateRev = parsed.revision || '';
  }

  async function saveShareTemplateFromMessage() {
    var Print = window.TCB_TeaPrint;
    var el = $('tea-share-msg');
    if (!el || !Print || typeof Print.messageToShareTemplate !== 'function') {
      setShareStatus('定型登録に失敗しました', true);
      return;
    }
    var kind = getShareKind();
    var payload = shareMsgPayload();
    payload.kind = kind;
    var tpl = Print.messageToShareTemplate(el.value, payload);
    if (kind === 'revision') state.shareMsgTemplateRev = tpl;
    else state.shareMsgTemplate = tpl;

    var packed = Print.serializeShareTemplates
      ? Print.serializeShareTemplates(state.shareMsgTemplate, state.shareMsgTemplateRev)
      : state.shareMsgTemplate;
    var client = ensureSync();
    if (!client) return;
    setShareStatus('定型を登録中…');
    try {
      await client.saveTeaSettings({ shareMsgTemplate: packed });
      try {
        localStorage.setItem((cfg.lsPrefix || 'tcb15') + '_tea_share_tpl', packed);
      } catch (e) {}
      fillShareMsg(true);
      setShareStatus((kind === 'revision' ? '変更送付' : '初回送付') + 'の定型を登録しました');
      setStatus('LINE案内の定型を登録しました');
    } catch (e) {
      try {
        localStorage.setItem((cfg.lsPrefix || 'tcb15') + '_tea_share_tpl', packed);
      } catch (e2) {}
      fillShareMsg(true);
      setShareStatus('サーバへ保存できないため、この端末に定型を保存しました');
    }
  }

  function shortNamesForPdf(groups) {
    var out = { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [] };
    for (var i = 1; i <= 6; i++) {
      out[String(i)] = (groups[String(i)] || []).map(shortName).filter(Boolean);
    }
    return out;
  }

  async function doShareLine() {
    var Print = window.TCB_TeaPrint;
    if (!Print || typeof Print.shareTeaPdf !== 'function') {
      setShareStatus('PDF共有部品が読み込まれていません', true);
      return;
    }
    setFlow('share');
    if (getShareKind() === 'revision' && !buildChangeSummary()) {
      setShareStatus('変更点が検出できません。必要なら案内文の「変更内容」を手編集してください');
    }
    var msgEl = $('tea-share-msg');
    var curMsg = msgEl ? String(msgEl.value || '') : '';
    if (!curMsg.trim() || curMsg === state._lastShareDefault) {
      if (hasTableChanges()) setShareKind('revision', true);
      fillShareMsg(true);
    }
    var btn = $('tea-btn-share-line');
    if (btn) btn.disabled = true;
    try {
      if (state.dirty) {
        setShareStatus('未保存のため、先に保存します…');
        await saveMonth();
      }
      setShareStatus('PDFを作成しています…');
      var msg = ($('tea-share-msg') && $('tea-share-msg').value) || '';
      var result = await Print.shareTeaPdf({
        ym: currentYm(),
        cohortLabel: cfg.cohortLabel || (cfg.cohort ? cfg.cohort + '期' : ''),
        revisedAt: ($('tea-revised') && $('tea-revised').value) || '',
        note: ($('tea-note') && $('tea-note').value) || '',
        message: msg,
        shareTemplate: activeShareTemplate(),
        changeSummary: buildChangeSummary(),
        days: collectDays().map(function (d) {
          return {
            activityDate: d.activityDate,
            dutyA: shortName(d.dutyA),
            dutyB: shortName(d.dutyB),
            playerGroup: d.playerGroup
          };
        }),
        playerGroups: shortNamesForPdf(collectGroups())
      });
      if (result && result.mode === 'desktop') {
        setShareStatus(
          (result.copied ? '案内文をコピーし、' : '') +
          'PDFをダウンロードしました（' + result.fileName + '）。' +
          'MG LINE に本文を貼り付け、PDFを手動添付して送信してください。'
        );
        setStatus('PC向け：PDFダウンロード＋案内文コピー済み');
      } else if (result && result.mode === 'download') {
        setShareStatus('PDFをダウンロードしました（' + result.fileName + '）。MG LINE に添付して送信してください。');
        setStatus('PDFをダウンロードしました');
      } else {
        setShareStatus('共有シートを開きました。LINE を選んで送信してください。');
        setStatus('LINE共有の準備ができました');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        setShareStatus('共有をキャンセルしました');
        return;
      }
      setShareStatus((e && e.message) || 'LINE送信に失敗しました', true);
      setStatus((e && e.message) || 'LINE送信に失敗しました', true);
    } finally {
      if (btn) btn.disabled = false;
    }
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
    syncAllTbdFields();
    updateUndoBtn();
    var loadedNote = (res.month && res.month.note) || '';
    var oldShort = 'あいうえお順持ち回り（原則）。交代時のみ表を更新。';
    var noteNeedsSave = false;
    if ($('tea-note')) {
      if (!loadedNote || loadedNote === oldShort) {
        $('tea-note').value = defaultNote();
        noteNeedsSave = !!res.month;
      } else {
        $('tea-note').value = loadedNote;
      }
    }
    if ($('tea-revised')) $('tea-revised').value = (res.month && res.month.revisedAt) || '';
    updateRevisedFoot();
    syncNotePrint();
    renderGroups();
    captureShareBaseline();
    setShareKind(suggestShareKind(), true);
    fillShareMsg(true);
    if (res.month) {
      setMonthBadge('保存済み（最終更新: ' + (res.month.updatedAt || res.month.revisedAt || '—') + '）');
      setStatus(formatYmLabel(ym) + ' の表を読み込みました');
      clearDirty();
      if (noteNeedsSave) {
        markDirty();
        setStatus('備考を定型文に更新しました。内容を確認して保存してください');
      }
    } else {
      setMonthBadge('未保存です。「前月から作成」で土日祝と持ち回りを埋められます。');
      setStatus(formatYmLabel(ym) + ' は未保存です');
      state.savedGroupsSnap = groupsSnap(state.playerGroups);
      state.dirty = false;
      updateDirtyUi();
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

    if ($('tea-note')) {
      var prevNote = (prev.month && prev.month.note) || '';
      var oldShort = 'あいうえお順持ち回り（原則）。交代時のみ表を更新。';
      $('tea-note').value = (!prevNote || prevNote === oldShort) ? defaultNote() : prevNote;
      syncNotePrint();
    }
    var today = new Date();
    if ($('tea-revised')) {
      $('tea-revised').value = today.getFullYear() + '.' + (today.getMonth() + 1) + '.' + today.getDate() + '作成';
      updateRevisedFoot();
    }
    setMonthBadge(formatYmLabel(prevYm) + ' の続きで ' + dates.length + ' 日分を仮作成しました。確認して「保存」してください。');
    setStatus('前月から作成しました（未保存）');
    captureShareBaseline();
    setShareKind('initial', true);
    fillShareMsg(true);
    setFlow('make');
    markDirty();
    syncAllTbdFields();
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
    clearDirty();
    setStatus('選手班を保存しました');
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
    setStatus('保存しました。「保存・LINE送信」で展開できます');
    updateRevisedFoot();
    syncNotePrint();
    setMonthBadge('保存済み');
    clearSwappedMarks();
    state.swapUndoStack = [];
    updateUndoBtn();
    clearDirty();
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
      syncAllTbdFields();
      markDirty();
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
    if ($('tea-btn-share-line')) {
      $('tea-btn-share-line').addEventListener('click', function () {
        doShareLine().catch(function (e) { setStatus(e.message || String(e), true); });
      });
    }
    if ($('tea-share-msg-reset')) {
      $('tea-share-msg-reset').addEventListener('click', function () {
        fillShareMsg(true);
        setShareStatus(
          (getShareKind() === 'revision' ? '変更送付' : '初回送付') +
          'の定型（またはシステム定型）で案内文を作り直しました'
        );
      });
    }
    if ($('tea-share-msg-save')) {
      $('tea-share-msg-save').addEventListener('click', function () {
        saveShareTemplateFromMessage().catch(function (e) {
          setShareStatus(e.message || String(e), true);
        });
      });
    }
    document.querySelectorAll('input[name="tea-share-kind"]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        fillShareMsg(true);
        setShareStatus(
          getShareKind() === 'revision'
            ? '変更送付の定型に切り替えました（変更内容を本文に掲載）'
            : '初回送付の定型に切り替えました'
        );
      });
    });
    if ($('tea-revised')) {
      $('tea-revised').addEventListener('change', function () {
        var el = $('tea-share-msg');
        var cur = el ? String(el.value || '') : '';
        if (!cur.trim() || cur === state._lastShareDefault) fillShareMsg(true);
        else state._lastShareDefault = defaultShareMsgText();
      });
      $('tea-revised').addEventListener('input', function () {
        updateRevisedFoot();
        markDirty();
      });
    }
    if ($('tea-note')) {
      $('tea-note').addEventListener('input', function () {
        syncNotePrint();
        markDirty();
      });
    }
    window.addEventListener('beforeunload', function (ev) {
      if (!state.dirty) return;
      ev.preventDefault();
      ev.returnValue = '';
    });
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
        setFlow(btn.getAttribute('data-tea-flow') || 'make', { scroll: true });
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
      var rawTpl = '';
      if (settings.shareMsgTemplate) {
        rawTpl = String(settings.shareMsgTemplate);
      } else {
        try {
          rawTpl = localStorage.getItem((cfg.lsPrefix || 'tcb15') + '_tea_share_tpl') || '';
        } catch (e) {
          rawTpl = '';
        }
      }
      loadShareTemplatesFromRaw(rawTpl);
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
