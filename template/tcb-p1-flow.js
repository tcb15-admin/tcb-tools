/* STEP1：割り振り方（今の保有／新規）— 活動パターンと同じ横並びボタン
 * 本体から init(hooks) で状態取得・切替コールバックを受け取る。
 */
(function (global) {
  'use strict';

  var ctx = null;
  /** ユーザーが明示選択した値。未選択は null（既定は保有があれば holdings） */
  var userPick = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function needsTeam() {
    try {
      if (ctx.effectiveNeedsTeamUI) return !!ctx.effectiveNeedsTeamUI();
      return !!(ctx.needsTeamUI && ctx.needsTeamUI());
    } catch (e) {
      return false;
    }
  }

  function groupHoldOn() {
    try {
      return !!(ctx.isGroupHoldEnabled && ctx.isGroupHoldEnabled());
    } catch (e) {
      return false;
    }
  }

  function holdingsAvailable() {
    try {
      return !!(ctx.getHoldingsSnap && ctx.getHoldingsSnap());
    } catch (e) {
      return false;
    }
  }

  function isSeedMode() {
    try {
      return !!(ctx.isSeedModeOn && ctx.isSeedModeOn());
    } catch (e) {
      return false;
    }
  }

  function baseLabel() {
    try {
      return (ctx.getHoldingsLabel && ctx.getHoldingsLabel()) || '';
    } catch (e) {
      return '';
    }
  }

  function getSelectedMode() {
    if (!needsTeam()) return 'fresh';
    if (isSeedMode()) return 'holdings';
    if (userPick === 'fresh') return 'fresh';
    if (userPick === 'holdings') return 'holdings';
    if (holdingsAvailable()) return 'holdings';
    return 'fresh';
  }

  function setUserPick(mode) {
    userPick = mode === 'holdings' || mode === 'fresh' ? mode : null;
  }

  function render() {
    var host = document.getElementById('p1-flow-host');
    if (!host || !ctx) return;

    var twoSplit = needsTeam();
    var gHold = groupHoldOn();
    var hasBase = holdingsAvailable();
    var baseTxt = baseLabel();
    var mode = getSelectedMode();
    var html = '';

    if (!twoSplit) {
      html = ''
        + '<div class="p1-flow-block">'
        + '<div class="ct p1-flow-hd">割り振り方</div>'
        + '<p class="p1-flow-auto">グループ分けなし。全員の中で割り振ります。</p>'
        + '</div>';
      host.innerHTML = html;
      host.style.display = '';
      return;
    }

    /* 保有記録が無いときは「新規」固定（保有ボタンは押せない） */
    var holdingsDisabled = !hasBase;
    if (holdingsDisabled && mode === 'holdings') mode = 'fresh';

    var holdingsOn = mode === 'holdings' ? ' on' : '';
    var freshOn = mode === 'fresh' ? ' on' : '';
    var holdingsDisAttr = holdingsDisabled ? ' disabled aria-disabled="true"' : '';

    html = ''
      + '<div class="p1-flow-block">'
      + '<div class="ct p1-flow-hd">割り振り方を選択'
      + '<button type="button" class="tcb-tip" data-tip="いま持っている道具を引き継ぐか、いちから割り振るかを選びます。" aria-label="説明"></button>'
      + '</div>'
      + '<div class="tgg p1-flow-tgg" role="group" aria-label="割り振り方">'
      + '<button type="button" class="tb2' + holdingsOn + '" id="btn-p1-flow-holdings"' + holdingsDisAttr + '>今の保有で割り振り</button>'
      + '<button type="button" class="tb2' + freshOn + '" id="btn-p1-flow-fresh">新規で割り振り</button>'
      + '</div>';

    if (mode === 'holdings' && hasBase) {
      html += ''
        + '<div class="desc-bar p1-flow-desc" role="status">'
        + 'いまの保有を<strong>各グループ内</strong>で割り振ります。'
        + (baseTxt ? '（基準：' + esc(baseTxt) + '）' : '')
        + '</div>'
        + '<p class="p1-flow-foot">'
        + '<button type="button" class="p1-flow-link" id="btn-p1-flow-hist">別の日の確定記録を基準にする</button>'
        + '</p>';
    } else if (mode === 'fresh') {
      html += ''
        + '<div class="desc-bar p1-flow-desc' + (holdingsDisabled && !gHold ? ' p1-flow-desc-warn' : '') + '" role="status">'
        + (holdingsDisabled
          ? (gHold
            ? '確定保有がないため、グループ保有の控えに沿っていちから割り振ります。'
            : '確定保有の記録がないため、いちから割り振ります。')
          : '保有を引き継がず、いちから割り振ります。')
        + '</div>';
    }

    html += '</div>';
    host.innerHTML = html;
    host.style.display = '';

    var btnH = document.getElementById('btn-p1-flow-holdings');
    var btnF = document.getElementById('btn-p1-flow-fresh');
    if (btnH && !holdingsDisabled) {
      btnH.addEventListener('click', function () {
        setUserPick('holdings');
        if (ctx.onSelectHoldings) ctx.onSelectHoldings();
        else render();
      });
    }
    if (btnF) {
      btnF.addEventListener('click', function () {
        setUserPick('fresh');
        if (ctx.onSelectFresh) ctx.onSelectFresh();
        else render();
      });
    }
    var btnHist = document.getElementById('btn-p1-flow-hist');
    if (btnHist) {
      btnHist.addEventListener('click', function () {
        if (ctx.onPickOther) ctx.onPickOther();
      });
    }
  }

  function init(hooks) {
    ctx = hooks || {};
    userPick = null;
    render();
  }

  global.TCB_P1Flow = {
    init: init,
    update: render,
    getSelectedMode: getSelectedMode,
    setUserPick: setUserPick
  };
})(window);
