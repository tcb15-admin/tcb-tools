/* STEP1：きょうの割り振り方（いちから／いまの保有でグループごと）
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

  function holdingsAvailable() {
    try {
      return !!(ctx.getHoldingsSnap && ctx.getHoldingsSnap());
    } catch (e) {
      return false;
    }
  }

  function holdingsBaseIsTwoSplit() {
    try {
      return !!(ctx.isHoldingsBaseTwoSplit && ctx.isHoldingsBaseTwoSplit());
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

    var hasBase = holdingsAvailable();
    /* おすすめ：確定保有があり、その活動が2分けだったとき
       （作業中の STEP1 パターンではなく、基準記録側を見る） */
    var recommendHold = hasBase && holdingsBaseIsTwoSplit();
    var baseTxt = baseLabel();
    var holdDesc = hasBase
      ? ('確定済みの保有を、きょうのグループ内で配ります。'
        + (baseTxt ? '（基準：' + esc(baseTxt) + '）' : '')
        + (recommendHold ? '' : ' ※基準の活動は2分けではないため、いちからがおすすめです。'))
      : '実施確定または入れ替え確定の記録が必要です（試行は使いません）。';

    var html = ''
      + '<div class="p1-flow-panel" role="group" aria-labelledby="p1-flow-title">'
      + '<div class="ct p1-flow-hd" id="p1-flow-title">きょうの割り振り方</div>'
      + '<label class="p1-flow-opt' + (!recommendHold ? ' p1-flow-opt-rec' : '') + '">'
      + '<input type="radio" name="p1-flow" value="fresh"' + (recommendHold ? '' : ' checked') + '>'
      + '<span class="p1-flow-opt-body"><strong>いちから割り振る</strong>'
      + '<span class="p1-flow-opt-desc">負荷を公平に配り直します。2分けしない活動や、担当を大きく変えたいとき。</span></span>'
      + '</label>'
      + '<label class="p1-flow-opt' + (hasBase ? '' : ' p1-flow-opt-disabled') + (recommendHold ? ' p1-flow-opt-rec' : '') + '">'
      + '<input type="radio" name="p1-flow" value="holdings"' + (hasBase ? '' : ' disabled') + (recommendHold ? ' checked' : '') + '>'
      + '<span class="p1-flow-opt-body"><strong>いま持っている道具で、グループごとに割り振る</strong>'
      + '<span class="p1-flow-opt-desc">' + holdDesc + '</span></span>'
      + '</label>'
      + '<p class="p1-flow-foot">'
      + '<button type="button" class="p1-flow-link" id="btn-p1-flow-hist">別の日の確定記録を基準にする</button>'
      + '／活動日前にチーム道具の入れ替えを依頼する場合は、上のボタンを使います。'
      + '</p>'
      + '</div>';

    host.innerHTML = html;
    host.style.display = '';

    var btnHist = document.getElementById('btn-p1-flow-hist');
    if (btnHist) {
      btnHist.addEventListener('click', function () {
        if (ctx.onPickOther) ctx.onPickOther();
      });
    }
  }

  function getSelectedMode() {
    if (isSeedMode()) return 'holdings';
    var checked = document.querySelector('input[name="p1-flow"]:checked');
    return checked ? checked.value : 'fresh';
  }

  function init(hooks) {
    ctx = hooks || {};
    render();
  }

  global.TCB_P1Flow = { init: init, update: render, getSelectedMode: getSelectedMode };
})(window);
