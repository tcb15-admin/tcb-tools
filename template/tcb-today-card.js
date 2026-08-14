/* ============================================================
 * きょうの割振りカード（TCB_TodayCard）
 * ホーム（STEP1）最上部に、前回の割振り結果を基準にした
 * 「きょうの割振りを始める」1タップ入口を表示する（UX改修 Phase 2）。
 *
 * - 引き継ぐもの: 活動パターン・グループ分け・グループ名・
 *   いま道具を持っているグループ・割り振り方法
 * - 選び直すもの: きょうの欠席・お茶当番（開始後の STEP2 でタップ）
 *
 * 前回結果が端末にない場合と、すでに調整モード中は表示しない
 * （その間は従来の「前回の結果を元に割振る」入口が出る）。
 * 本体スクリプトから init(hooks) で状態取得・開始処理を受け取る。
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

  function fmtMD(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return (+m[2]) + '/' + (+m[3]) + '（' + YOBI[d.getDay()] + '）';
  }

  function todayMD() {
    var d = new Date();
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + YOBI[d.getDay()] + '）';
  }

  function patLabel(snap) {
    var p = snap && snap.pat;
    if (p === 'ryoho') return '両方試合';
    if (p === 'renshu') return '両方練習' + (snap && +snap.renshuSplit ? '（場所分離）' : '');
    return '片方試合';
  }

  function hide(host) {
    host.style.display = 'none';
    host.innerHTML = '';
  }

  function render() {
    var host = document.getElementById('tcb-today-host');
    if (!host || !ctx) return;
    var seedOn = false, snap = null;
    try { seedOn = !!(ctx.isSeedModeOn && ctx.isSeedModeOn()); } catch (e) {}
    try { snap = ctx.getSnap ? ctx.getSnap() : null; } catch (e) {}
    if (seedOn || !snap || typeof snap.map !== 'object') {
      /* 調整モード中・前回結果なし → 非表示（従来入口の表示は本体側が管理） */
      hide(host);
      return;
    }

    /* 従来の「前回の結果を元に割振る」入口はこのカードに統合されるため隠す */
    var legacy = document.getElementById('p1-from-prev-block');
    if (legacy) legacy.style.display = 'none';

    var method = 'fair';
    try { method = (ctx.getMethod && ctx.getMethod()) || 'fair'; } catch (e) {}
    var ghTxt = '';
    try {
      if (ctx.getGroupHold) {
        var gh = ctx.getGroupHold();
        if (gh && gh.on) {
          ghTxt = '・持っているグループ（' + esc(gh.la || 'A') + '／' + esc(gh.lb || 'B') + '）';
        }
      }
    } catch (e) {}

    var html = ''
      + '<div class="tcb-today-card">'
      + '<div class="tcb-today-head">'
      + '<span class="tcb-today-title">&#9728;&#65039; きょうの割振り — ' + esc(todayMD()) + '</span>'
      + '<span class="tcb-today-pill">前回：' + esc(fmtMD(snap.date) || '—') + '・' + esc(patLabel(snap)) + '</span>'
      + '</div>'
      + '<ul class="tcb-today-list">'
      + '<li><span class="tcb-today-k">引き継ぎ</span>前回の担当・グループ分け' + ghTxt
      + '・割り振り方法（' + (method === 'min' ? '前回のまま維持' : '公平に分散') + '）</li>'
      + '<li><span class="tcb-today-k">選び直し</span><strong>きょうの欠席</strong>と<strong>お茶当番（翌活動日分）</strong>。開始後の画面でタップします。</li>'
      + '</ul>'
      + '<button type="button" class="rbtn tcb-today-start" id="btn-tcb-today-start">&#9654; きょうの割振りを始める</button>'
      + '<p class="tcb-today-sub">'
      + '<button type="button" class="tcb-today-link" id="btn-tcb-today-hist">別の日の結果を基準にする</button>'
      + '<span class="tcb-today-or">／ </span>'
      + '<button type="button" class="tcb-today-link" id="btn-tcb-today-handoff">次回活動の入れ替え案</button>'
      + '<span class="tcb-today-or">／ 新規に割振る場合は、下の設定のまま「次へ」。活動パターンが前回と違う日は、開始後に「&#9664; 戻る」で変更できます。</span>'
      + '</p>'
      + '</div>';
    host.innerHTML = html;
    host.style.display = '';

    var btnStart = document.getElementById('btn-tcb-today-start');
    if (btnStart) btnStart.addEventListener('click', function () {
      if (ctx.onStart) ctx.onStart();
    });
    var btnHist = document.getElementById('btn-tcb-today-hist');
    if (btnHist) btnHist.addEventListener('click', function () {
      if (ctx.onPickOther) ctx.onPickOther();
    });
    var btnHandoff = document.getElementById('btn-tcb-today-handoff');
    if (btnHandoff) btnHandoff.addEventListener('click', function () {
      if (ctx.onHandoff) ctx.onHandoff();
    });
  }

  function init(hooks) {
    ctx = hooks || {};
    render();
  }

  global.TCB_TodayCard = { init: init, update: render };
})(window);
