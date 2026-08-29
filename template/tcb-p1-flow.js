/* STEP1：割り振り方の案内（2分け／グループ保有はグループ内・選択肢なし）
 * 本体から init(hooks) で状態取得・描画更新を受け取る。
 */
(function (global) {
  'use strict';

  var ctx = null;

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

  function render() {
    var host = document.getElementById('p1-flow-host');
    if (!host || !ctx) return;

    if (isSeedMode()) {
      host.style.display = 'none';
      host.innerHTML = '';
      return;
    }

    var twoSplit = needsTeam();
    var gHold = groupHoldOn();
    var hasBase = holdingsAvailable();
    var baseTxt = baseLabel();
    var html = '';

    if (twoSplit) {
      if (hasBase) {
        html = ''
          + '<div class="p1-flow-panel" role="status">'
          + '<div class="ct p1-flow-hd">割り振り方</div>'
          + '<p class="p1-flow-auto">'
          + 'いまの保有を<strong>各グループ内</strong>で割り振ります。'
          + (baseTxt ? '（基準：' + esc(baseTxt) + '）' : '')
          + '</p>'
          + '<p class="p1-flow-foot">'
          + '<button type="button" class="p1-flow-link" id="btn-p1-flow-hist">別の日の確定記録を基準にする</button>'
          + '</p>'
          + '</div>';
      } else {
        html = ''
          + '<div class="p1-flow-panel p1-flow-panel-warn" role="status">'
          + '<div class="ct p1-flow-hd">割り振り方</div>'
          + '<p class="p1-flow-auto">'
          + (gHold
            ? 'グループ保有の控えに沿って、各グループ内で割り振ります。'
            : '確定保有の記録がないため、いちから割り振ります。')
          + '</p>'
          + '</div>';
      }
    } else {
      html = ''
        + '<div class="p1-flow-panel" role="status">'
        + '<div class="ct p1-flow-hd">割り振り方</div>'
        + '<p class="p1-flow-auto">グループ分けなし。全員の中で割り振ります。</p>'
        + '</div>';
    }

    host.innerHTML = html;
    host.style.display = '';

    var btnHist = document.getElementById('btn-p1-flow-hist');
    if (btnHist) {
      btnHist.addEventListener('click', function () {
        if (ctx.onPickOther) ctx.onPickOther();
      });
    }
  }

  /* 互換：常に自動判定（ラジオなし） */
  function getSelectedMode() {
    if (isSeedMode()) return 'holdings';
    if (needsTeam() && holdingsAvailable()) return 'holdings';
    if (needsTeam() && groupHoldOn()) return 'holdings';
    return 'fresh';
  }

  function init(hooks) {
    ctx = hooks || {};
    render();
  }

  global.TCB_P1Flow = { init: init, update: render, getSelectedMode: getSelectedMode };
})(window);
