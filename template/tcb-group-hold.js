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
        status.textContent = '有効：保有控え（' + labels.la + ': ' + c.a + '点 / ' + labels.lb + ': ' + c.b + '点）に沿い、各グループ内で割り振ります。活動前の個人間入れ替えは STEP1 の入れ替え依頼から行います。';
      } else {
        status.className = 'tcb-ghold-status';
        status.textContent = '未使用。割振りの班分けは活動パターンとルールに従います。必要なときだけ保有控えを登録してください。';
      }
    }
    if (btnClear) btnClear.style.display = enabled ? '' : 'none';
    /* 折りたたみ（STEP2カード）の状態ピルと自動展開 */
    var sum = document.getElementById('tcb-ghold-sumstate');
    if (sum) {
      sum.textContent = enabled ? '使用中' : '未使用';
      sum.className = 'tcb-fold-state' + (enabled ? ' on' : '');
    }
    var det = document.getElementById('tcb-ghold-details');
    if (det && enabled && !det.open) det.open = true;
  }

  function renderDraftList() {
    var listEl = document.getElementById('tcb-ghold-list');
    if (!listEl) return;
    ensureDraftComplete();
    var names = activeToolNames().slice();
    var labels = displayLabels();
    if (!names.length) {
      listEl.innerHTML = '<div class="tcb-ghold-row"><div class="tcb-ghold-tool">対象道具がありません（除外道具を確認）。</div></div>';
      return;
    }
    var metaOf = function (tn) {
      if (ctx && typeof ctx.getToolMeta === 'function') return ctx.getToolMeta(tn) || {};
      return {};
    };
    var sortNames = function (arr) {
      return arr.slice().sort(function (a, b) {
        var ma = metaOf(a);
        var mb = metaOf(b);
        var ia = typeof ma.order === 'number' ? ma.order : 9999;
        var ib = typeof mb.order === 'number' ? mb.order : 9999;
        if (ia !== ib) return ia - ib;
        var maMatch = ma.matchTool ? 0 : 1;
        var mbMatch = mb.matchTool ? 0 : 1;
        if (maMatch !== mbMatch) return maMatch - mbMatch;
        return String(a).localeCompare(String(b), 'ja');
      });
    };
    var groupA = [];
    var groupB = [];
    names.forEach(function (tn) {
      if (draftMap[tn] === 'A') groupA.push(tn);
      else groupB.push(tn);
    });
    groupA = sortNames(groupA);
    groupB = sortNames(groupB);

    function sectionHtml(team, title, arr) {
      if (!arr.length) return '';
      var h = '<div class="tcb-ghold-sec-hd">' + esc(title) + '（' + arr.length + '）</div>';
      arr.forEach(function (tn) {
        var g = team;
        var meta = metaOf(tn);
        var badge = meta.matchTool
          ? '<span class="tcb-ghold-badge tcb-ghold-badge-match">試合道具</span>'
          : '';
        h += '<div class="tcb-ghold-row">'
          + '<div class="tcb-ghold-tool">' + esc(tn) + badge + '</div>'
          + '<select class="tcb-ghold-sel" data-tcb-ghold-tool="' + esc(tn) + '">'
          + '<option value="A"' + (g === 'A' ? ' selected' : '') + '>' + esc(labels.la) + '</option>'
          + '<option value="B"' + (g === 'B' ? ' selected' : '') + '>' + esc(labels.lb) + '</option>'
          + '</select></div>';
      });
      return h;
    }

    var html = '';
    html += '<p class="tcb-ghold-sort-note">表示：保有グループ別（' + esc(labels.la) + ' → ' + esc(labels.lb) + '）／各組内はマスタ順・試合道具優先</p>';
    html += sectionHtml('A', labels.la, groupA);
    html += sectionHtml('B', labels.lb, groupB);
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
    if (global.TCB_Feedback) global.TCB_Feedback.toast('グループ保有を保存しました。各グループの保有道具をメンバー内で割り振ります。', 'success');
  }

  function clearHold() {
    if (!enabled) return;
    if (!confirm('「いま道具を持っているグループ」の登録をやめます。次の割振りは活動パターンのルールに従います。よろしいですか？')) return;
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
