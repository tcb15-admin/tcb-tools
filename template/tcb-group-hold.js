/* グループ保有（任意）モジュール
   必要なときだけ STEP2 から登録。有効時は活動パターンに関係なく割振りを班内のみにする。
   ctx は tool_template の init から注入する。 */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = false;
  var holdMap = {}; /* toolName -> 'A'|'B' */
  var draftMap = {}; /* モーダル編集中 */
  /* 保有登録時のグループ名（例：千曲A／千曲B）。次回が同一場所練習などで
     STEP1にグループ名欄が出ないときも、このラベルで結果表示できるように保持する */
  var heldLabels = { la: '', lb: '' };

  function esc(s) {
    return ctx && ctx.esc ? ctx.esc(s) : String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cloneMap(src) {
    var o = {};
    if (!src || typeof src !== 'object') return o;
    Object.keys(src).forEach(function (k) {
      if (src[k] === 'A' || src[k] === 'B') o[k] = src[k];
    });
    return o;
  }

  function teamLabels() {
    var la = (ctx && ctx.getTeamLabelA && ctx.getTeamLabelA()) || 'A組';
    var lb = (ctx && ctx.getTeamLabelB && ctx.getTeamLabelB()) || 'B組';
    return { la: la, lb: lb };
  }

  /* 表示用ラベル：有効な保有登録があればその時の名前を優先（STEP1の初期値に引きずられない） */
  function displayLabels() {
    if (enabled && heldLabels.la && heldLabels.lb) return { la: heldLabels.la, lb: heldLabels.lb };
    return teamLabels();
  }

  function activeToolNames() {
    return (ctx && ctx.listActiveToolNames) ? ctx.listActiveToolNames() : [];
  }

  function defaultHoldFromMaster() {
    return (ctx && ctx.inferHoldFromMaster) ? cloneMap(ctx.inferHoldFromMaster()) : {};
  }

  function inferHoldFromPrev() {
    return (ctx && ctx.inferHoldFromPrevAssign) ? cloneMap(ctx.inferHoldFromPrevAssign()) : {};
  }

  function notifyEnabledChange() {
    if (ctx && typeof ctx.onEnabledChange === 'function') ctx.onEnabledChange();
  }

  /* ===== 永続化（リロード・PWA再起動で保有登録が消えないように） ===== */
  function persist() {
    if (ctx && typeof ctx.savePersisted === 'function') {
      ctx.savePersisted({
        enabled: enabled ? 1 : 0,
        holdMap: cloneMap(holdMap),
        la: String(heldLabels.la || ''),
        lb: String(heldLabels.lb || '')
      });
    }
  }
  function loadPersisted() {
    if (!ctx || typeof ctx.loadPersisted !== 'function') return;
    var o = ctx.loadPersisted();
    if (!o || typeof o !== 'object') return;
    var map = cloneMap(o.holdMap);
    var on = (o.enabled == 1 || o.enabled === true || o.enabled === '1');
    if (on && Object.keys(map).length) {
      holdMap = map;
      enabled = true;
      heldLabels = { la: String(o.la || ''), lb: String(o.lb || '') };
    }
  }

  function ensureDraftComplete() {
    var names = activeToolNames();
    var master = defaultHoldFromMaster();
    var prev = inferHoldFromPrev();
    names.forEach(function (tn) {
      if (draftMap[tn] === 'A' || draftMap[tn] === 'B') return;
      if (holdMap[tn] === 'A' || holdMap[tn] === 'B') { draftMap[tn] = holdMap[tn]; return; }
      if (prev[tn] === 'A' || prev[tn] === 'B') { draftMap[tn] = prev[tn]; return; }
      draftMap[tn] = (master[tn] === 'A' || master[tn] === 'B') ? master[tn] : 'B';
    });
  }

  function countByTeam(map) {
    var a = 0, b = 0;
    Object.keys(map || {}).forEach(function (k) {
      if (map[k] === 'A') a++;
      else if (map[k] === 'B') b++;
    });
    return { a: a, b: b };
  }

  function updateStatusUI() {
    var card = document.getElementById('tcb-ghold-card');
    var status = document.getElementById('tcb-ghold-status');
    var btnClear = document.getElementById('btn-tcb-ghold-clear');
    /* STEP2 内のカードは常時表示（パターン問わず登録可能） */
    if (card) card.className = 'card tcb-ghold-card on';
    var labels = displayLabels();
    if (status) {
      if (enabled) {
        var c = countByTeam(holdMap);
        status.className = 'tcb-ghold-status tcb-ghold-on';
        status.textContent = 'グループ保有を使用中（' + labels.la + ': ' + c.a + '点 / ' + labels.lb + ': ' + c.b + '点）。次回の活動パターンに関係なく、割振りは保有グループ内のみです。';
      } else {
        status.className = 'tcb-ghold-status';
        status.textContent = '未使用（従来どおりマスタの班・会場で割振り）。会場が分かれているときや、次回も保有グループのまま割振りたいときは「登録／確認」してください。';
      }
    }
    if (btnClear) btnClear.style.display = enabled ? '' : 'none';
  }

  function renderDraftList() {
    var listEl = document.getElementById('tcb-ghold-list');
    if (!listEl) return;
    ensureDraftComplete();
    var names = activeToolNames().slice().sort(function (a, b) {
      return String(a).localeCompare(String(b), 'ja');
    });
    var labels = displayLabels();
    if (!names.length) {
      listEl.innerHTML = '<div class="tcb-ghold-row"><div class="tcb-ghold-tool">対象道具がありません（除外道具を確認）。</div></div>';
      return;
    }
    var html = '';
    names.forEach(function (tn) {
      var g = draftMap[tn] === 'A' ? 'A' : 'B';
      html += '<div class="tcb-ghold-row">'
        + '<div class="tcb-ghold-tool">' + esc(tn) + '</div>'
        + '<select class="tcb-ghold-sel" data-tcb-ghold-tool="' + esc(tn) + '">'
        + '<option value="A"' + (g === 'A' ? ' selected' : '') + '>' + esc(labels.la) + '</option>'
        + '<option value="B"' + (g === 'B' ? ' selected' : '') + '>' + esc(labels.lb) + '</option>'
        + '</select></div>';
    });
    listEl.innerHTML = html;
  }

  function openEditor() {
    draftMap = cloneMap(holdMap);
    if (!Object.keys(draftMap).length) {
      var prev = inferHoldFromPrev();
      draftMap = Object.keys(prev).length ? prev : defaultHoldFromMaster();
    }
    renderDraftList();
    if (ctx.openModal) ctx.openModal('tcb-ghold-modal');
  }

  function readDraftFromDom() {
    var listEl = document.getElementById('tcb-ghold-list');
    if (!listEl) return;
    var sels = listEl.querySelectorAll('select.tcb-ghold-sel[data-tcb-ghold-tool]');
    for (var i = 0; i < sels.length; i++) {
      var sel = sels[i];
      var tn = sel.getAttribute('data-tcb-ghold-tool');
      if (!tn) continue;
      draftMap[tn] = sel.value === 'A' ? 'A' : 'B';
    }
  }

  function applyDraftAsActive() {
    readDraftFromDom();
    ensureDraftComplete();
    holdMap = cloneMap(draftMap);
    enabled = true;
    /* グループ名欄が表示されている（次回活動にグループがある）ときだけ現在の名前を採用。
       名前欄が出ないケース（同一場所練習など）での再登録は、前回登録時の名前を維持する */
    var nameUiVisible = !(ctx && typeof ctx.needsTeamUI === 'function') || !!ctx.needsTeamUI();
    if (nameUiVisible || !heldLabels.la || !heldLabels.lb) {
      var labels = teamLabels();
      heldLabels = { la: labels.la, lb: labels.lb };
    }
    persist();
    updateStatusUI();
    notifyEnabledChange();
    if (ctx.closeModal) ctx.closeModal('tcb-ghold-modal');
    if (global.TCB_Feedback) global.TCB_Feedback.toast('グループ保有を登録しました。次回以降もこの端末で引き継がれます。', 'success');
  }

  function clearHold() {
    if (!enabled) return;
    if (!confirm('グループ保有の登録をやめます。次の割振りは従来どおり（マスタの班・会場）になります。よろしいですか？')) return;
    enabled = false;
    holdMap = {};
    draftMap = {};
    heldLabels = { la: '', lb: '' };
    persist();
    updateStatusUI();
    notifyEnabledChange();
    if (global.TCB_Feedback) global.TCB_Feedback.toast('保有登録をやめました。従来どおりの割振りに戻ります。', 'info');
  }

  function fillDraftFromPrev() {
    draftMap = inferHoldFromPrev();
    if (!Object.keys(draftMap).length) {
      if (global.TCB_Feedback) global.TCB_Feedback.toast('前回割り当てから推測できませんでした。マスタ設定から初期化します。', 'warn');
      else alert('前回割り当てから推測できませんでした。マスタ設定から初期化します。');
      draftMap = defaultHoldFromMaster();
    }
    renderDraftList();
  }

  function fillDraftFromMaster() {
    draftMap = defaultHoldFromMaster();
    renderDraftList();
  }

  function onSelChange(e) {
    var sel = e.target;
    if (!sel || !sel.classList || !sel.classList.contains('tcb-ghold-sel')) return;
    var tn = sel.getAttribute('data-tcb-ghold-tool');
    if (!tn) return;
    draftMap[tn] = sel.value === 'A' ? 'A' : 'B';
  }

  /** 割振り用ツールリストをグループ保有で再分類（enabled 時のみ） */
  function rebucketToolLists(tA, tB) {
    if (!enabled) return { tA: tA, tB: tB };
    var all = (tA || []).concat(tB || []);
    var nA = [], nB = [];
    all.forEach(function (t) {
      if (!t || !t.name) return;
      var g = holdMap[t.name];
      if (g !== 'A' && g !== 'B') g = (t.team === 'A') ? 'A' : 'B';
      var copy = Object.assign({}, t, { team: g });
      if (g === 'A') nA.push(copy);
      else nB.push(copy);
    });
    return { tA: nA, tB: nB };
  }

  function toSnapFields() {
    if (!enabled) return { groupHoldEnabled: 0, groupHoldMap: {} };
    return { groupHoldEnabled: 1, groupHoldMap: cloneMap(holdMap) };
  }

  /* 履歴・スナップからの復元はその日の文脈に合わせた一時的な状態変更なので、
     端末保存（永続化）は上書きしない。永続化は明示操作（登録／解除）のみ。 */
  function restoreFromSnap(snap) {
    if (!snap || typeof snap !== 'object') {
      enabled = false;
      holdMap = {};
      updateStatusUI();
      notifyEnabledChange();
      return;
    }
    var on = snap.groupHoldEnabled == 1 || snap.groupHoldEnabled === '1' || snap.groupHoldEnabled === true;
    holdMap = cloneMap(snap.groupHoldMap);
    enabled = !!(on && Object.keys(holdMap).length);
    updateStatusUI();
    notifyEnabledChange();
  }

  function reset() {
    enabled = false;
    holdMap = {};
    draftMap = {};
    updateStatusUI();
    notifyEnabledChange();
  }

  function init(hooks) {
    ctx = hooks || {};
    var btnEdit = document.getElementById('btn-tcb-ghold-edit');
    if (btnEdit) btnEdit.addEventListener('click', openEditor);
    var btnClear = document.getElementById('btn-tcb-ghold-clear');
    if (btnClear) btnClear.addEventListener('click', clearHold);
    var btnSave = document.getElementById('btn-tcb-ghold-save');
    if (btnSave) btnSave.addEventListener('click', applyDraftAsActive);
    ['btn-tcb-ghold-cancel', 'tcb-ghold-modal-close'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () {
        if (ctx.closeModal) ctx.closeModal('tcb-ghold-modal');
      });
    });
    var btnPrev = document.getElementById('btn-tcb-ghold-from-prev');
    if (btnPrev) btnPrev.addEventListener('click', fillDraftFromPrev);
    var btnMaster = document.getElementById('btn-tcb-ghold-from-master');
    if (btnMaster) btnMaster.addEventListener('click', fillDraftFromMaster);
    var listEl = document.getElementById('tcb-ghold-list');
    if (listEl) listEl.addEventListener('change', onSelChange);
    var modal = document.getElementById('tcb-ghold-modal');
    if (modal) modal.addEventListener('click', function (e) {
      if (e.target === modal && ctx.closeModal) ctx.closeModal('tcb-ghold-modal');
    });
    /* 端末に保存済みの保有登録があれば復元（リロード・PWA再起動対応） */
    loadPersisted();
    updateStatusUI();
    if (enabled) notifyEnabledChange();
  }

  global.TCB_GroupHold = {
    init: init,
    isEnabled: function () { return !!enabled; },
    getMap: function () { return cloneMap(holdMap); },
    /* 保有登録時のグループ名（未登録・旧データは空文字） */
    getLabels: function () { return { la: String(heldLabels.la || ''), lb: String(heldLabels.lb || '') }; },
    rebucketToolLists: rebucketToolLists,
    toSnapFields: toSnapFields,
    restoreFromSnap: restoreFromSnap,
    reset: reset,
    updateStatusUI: updateStatusUI,
    openEditor: openEditor
  };
})(typeof window !== 'undefined' ? window : this);
