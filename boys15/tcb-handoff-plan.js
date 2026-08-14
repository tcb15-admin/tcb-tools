/* 次回活動の入れ替え案（確認用・実施確定しない）
 * 依存: 本体が init(hooks) で算出・パターン変更・班グリッド更新を渡す
 */
(function (global) {
  'use strict';

  var ctx = null;
  var lastReport = null;
  var lastFullText = '';
  var lastLineText = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function prependMeta(body, meta) {
    var text = String(body || '');
    if (!meta || !meta.line) return text;
    return text.replace(/^(【[^】]+】\n)/, '$1' + meta.line + '\n');
  }

  function refreshForm() {
    if (!ctx) return;
    var pat = ctx.getPat ? ctx.getPat() : 'kata';
    var split = !!(ctx.getRenshuSplit && ctx.getRenshuSplit());
    ['kata', 'ryoho', 'renshu'].forEach(function (id) {
      var el = $('btn-handoff-' + id);
      if (el) el.className = (pat === id) ? 'tb2 on' : 'tb2';
    });
    var rsw = $('handoff-renshu-split-wrap');
    if (rsw) rsw.style.display = (pat === 'renshu') ? 'block' : 'none';
    var chk = $('chk-handoff-renshu-split');
    if (chk) chk.checked = split;

    var names = ctx.getTeamNames ? ctx.getTeamNames() : { la: '試合組', lb: '練習組' };
    var inpA = $('handoff-tnA');
    var inpB = $('handoff-tnB');
    if (inpA && document.activeElement !== inpA) inpA.value = names.la || '';
    if (inpB && document.activeElement !== inpB) inpB.value = names.lb || '';

    var needTeam = !!(ctx.needsTeamUI && ctx.needsTeamUI());
    var wrap = $('handoff-team-wrap');
    if (wrap) wrap.style.display = needTeam ? '' : 'none';
    if (needTeam && ctx.buildGrid) ctx.buildGrid();

    var prevEl = $('tcb-handoff-prev');
    if (prevEl && ctx.getPrevSummary) {
      var sum = ctx.getPrevSummary() || '';
      prevEl.innerHTML = sum ? ('<strong>基準（いまの保有）</strong>　' + esc(sum)) : '前回の割振り結果がありません。先に割振りを実施確定してください。';
    }
  }

  function clearResult() {
    lastReport = null;
    lastFullText = '';
    lastLineText = '';
    var box = $('tcb-handoff-result');
    if (box) box.innerHTML = '';
  }

  function renderResult(payload) {
    var box = $('tcb-handoff-result');
    if (!box) return;
    if (!payload || payload.error) {
      lastReport = null;
      lastFullText = '';
      lastLineText = '';
      box.innerHTML = '<div class="tcb-handoff-err">' + esc((payload && payload.error) || '算出できませんでした。') + '</div>';
      return;
    }
    lastReport = payload.report;
    lastFullText = prependMeta(payload.fullText || '', payload.meta);
    lastLineText = prependMeta(payload.lineText || '', payload.meta);

    var html = '<div class="tcb-handoff-oknote">最適解のみ表示しています。入れ替え不要の道具は前回の担当のままです。この画面では実施確定しません。</div>';
    if (payload.html) html += payload.html;
    html += '<div class="tcb-swap-list-actions">';
    html += '<button type="button" class="tcb-swap-list-copybtn" id="btn-handoff-copy-full">入れ替え案内（全文）をコピー</button>';
    if (payload.report && payload.report.changed) {
      html += '<button type="button" class="tcb-swap-list-copybtn tcb-swap-list-copybtn-sec" id="btn-handoff-copy-line">LINE用の要点をコピー</button>';
    }
    html += '</div>';
    if (lastLineText) {
      html += '<div class="tcb-swap-list-line-wrap">';
      html += '<div class="tcb-swap-list-line-hd">LINE本文に使える文面</div>';
      html += '<pre class="tcb-swap-list-line-pre" id="tcb-handoff-line-pre">' + esc(lastLineText) + '</pre>';
      html += '</div>';
    }
    box.innerHTML = html;

    var fullBtn = $('btn-handoff-copy-full');
    if (fullBtn) {
      fullBtn.addEventListener('click', function () {
        if (ctx.copyText) ctx.copyText(lastFullText, '入れ替え案内をコピーしました');
      });
    }
    var lineBtn = $('btn-handoff-copy-line');
    if (lineBtn) {
      lineBtn.addEventListener('click', function () {
        if (ctx.copyText) ctx.copyText(lastLineText, 'LINE用の要点をコピーしました');
      });
    }
  }

  function calc() {
    if (!ctx || !ctx.compute) return;
    renderResult(ctx.compute());
  }

  function open() {
    refreshForm();
    clearResult();
    if (ctx.openModal) ctx.openModal('tcb-handoff-overlay');
    if (ctx.canAutoCalc && ctx.canAutoCalc()) calc();
  }

  function close() {
    if (ctx.closeModal) ctx.closeModal('tcb-handoff-overlay');
  }

  function bind() {
    var openBtn = $('btn-tcb-handoff-open');
    if (openBtn) openBtn.addEventListener('click', open);
    var closeBtn = $('tcb-handoff-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var overlay = $('tcb-handoff-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });
    }
    ['kata', 'ryoho', 'renshu'].forEach(function (id) {
      var el = $('btn-handoff-' + id);
      if (!el) return;
      el.addEventListener('click', function () {
        var cur = ctx.getPat ? ctx.getPat() : '';
        if (cur === id) return;
        if (ctx.setPat) ctx.setPat(id);
        clearResult();
        refreshForm();
      });
    });
    var chk = $('chk-handoff-renshu-split');
    if (chk) {
      chk.addEventListener('change', function () {
        if (ctx.setRenshuSplit) ctx.setRenshuSplit(!!chk.checked);
        clearResult();
        refreshForm();
      });
    }
    var inpA = $('handoff-tnA');
    if (inpA) {
      inpA.addEventListener('input', function () {
        if (ctx.setTeamName) ctx.setTeamName('A', inpA.value);
        clearResult();
        refreshForm();
      });
    }
    var inpB = $('handoff-tnB');
    if (inpB) {
      inpB.addEventListener('input', function () {
        if (ctx.setTeamName) ctx.setTeamName('B', inpB.value);
        clearResult();
        refreshForm();
      });
    }
    var calcBtn = $('btn-handoff-calc');
    if (calcBtn) calcBtn.addEventListener('click', calc);
  }

  function init(hooks) {
    ctx = hooks || {};
    bind();
  }

  global.TCB_HandoffPlan = {
    init: init,
    open: open,
    update: refreshForm
  };
})(typeof window !== 'undefined' ? window : this);
