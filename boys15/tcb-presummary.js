/* ============================================================
 * 実行前サマリー（TCB_PreSummary）
 * STEP2「⚡割振りを実行」の直前に、この内容で実行される、という
 * 全体像を1枚で表示する（UX改修 Phase 1・原則B）。
 * 本体スクリプトから init(ctx) で状態取得関数を受け取り、
 * update() が呼ばれるたびに最新状態で描き直す。
 * ============================================================ */
(function (global) {
  'use strict';

  var ctx = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var YOBI = ['日', '月', '火', '水', '木', '金', '土'];
  function fmtDate(iso) {
    if (!iso) return '未設定';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!m) return String(iso);
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return +m[1] + '/' + (+m[2]) + '/' + (+m[3]) + '（' + YOBI[d.getDay()] + '）';
  }

  function row(key, valHtml) {
    return '<div class="tcb-presum-row"><span class="tcb-presum-key">' + esc(key)
      + '</span><span class="tcb-presum-val">' + valHtml + '</span></div>';
  }

  function render() {
    var host = document.getElementById('tcb-presum-body');
    if (!host || !ctx || typeof ctx.getData !== 'function') return;
    var d;
    try { d = ctx.getData(); } catch (e) { return; }
    if (!d) return;

    var html = '<div class="tcb-presum-rows">';

    /* 活動日・パターン */
    var patHtml = '<strong>' + esc(d.patternLabel) + '</strong>';
    if (d.memUnpublished) patHtml += '<span class="tcb-presum-pill">試合メンバー未発表</span>';
    html += row('活動日', esc(fmtDate(d.date)));
    html += row('次回の活動', patHtml);

    /* 割振り単位 */
    var unit;
    if (d.ghOn) {
      var la = d.ghLa || d.la, lb = d.ghLb || d.lb;
      unit = '<strong>' + esc(la) + '</strong>／<strong>' + esc(lb) + '</strong> の保有グループ内のみ'
        + '<span class="tcb-presum-pill hold">グループ間で道具は動きません</span>';
    } else if (d.teamUI) {
      unit = '<strong>' + esc(d.la) + '</strong>（' + d.cA + '名）／<strong>' + esc(d.lb) + '</strong>（' + d.cB + '名）の2グループ';
    } else {
      unit = '全員一括（グループ分けなし）';
    }
    html += row('割振り単位', unit);

    /* 配り方 */
    var how;
    if (d.seedOn) {
      how = '前回の結果を基準に調整（<strong>'
        + (d.method === 'min' ? '前回のまま維持' : '公平に分散') + '</strong>）';
    } else {
      how = '新規に割振り（負荷が公平になるよう自動）';
    }
    html += row('配り方', how);

    /* 対象・道具 */
    var mem = '<strong>' + d.targetN + '名</strong>';
    var exParts = [];
    if (d.absN) exParts.push('欠席 ' + d.absN);
    if (d.ochaN) exParts.push('お茶当番 ' + d.ochaN);
    if (exParts.length) mem += '（' + exParts.join('・') + ' を除く）';
    html += row('割振り対象', mem);

    var tool = '<strong>' + d.toolsN + '点</strong>';
    if (d.skipN) tool += '<span class="tcb-presum-pill warn">一時除外 ' + d.skipN + '点</span>';
    html += row('道具', tool);

    html += '</div>';
    html += '<p class="tcb-presum-note">この内容で「⚡割振りを実行」します。違うところがあれば、上の各カード（またはSTEP1）で直してから実行してください。</p>';
    host.innerHTML = html;
  }

  function init(hooks) {
    ctx = hooks || {};
    render();
  }

  global.TCB_PreSummary = { init: init, update: render };
})(window);
