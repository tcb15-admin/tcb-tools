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
    if (!text || !meta || !meta.line) return text;
    return meta.line + '\n' + text;
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

    var skipEl = $('tcb-handoff-skip-note');
    if (skipEl) {
      var skipped = (ctx.getSkippedTools && ctx.getSkippedTools()) || [];
      if (skipped.length) {
        skipEl.style.display = '';
        skipEl.innerHTML = '一時除外中（案に含まれません）：' + esc(skipped.join('、'));
      } else {
        skipEl.style.display = 'none';
        skipEl.innerHTML = '';
      }
    }
  }

  /* 基準セレクタ：候補（履歴）を流し込み、可能なら現在の選択を維持。なければ推奨を選ぶ */
  function fillBaseSelect() {
    var sel = $('handoff-base-sel');
    if (!sel) return;
    var cands = (ctx.getBaseCandidates && ctx.getBaseCandidates()) || [];
    var cur = sel.value;
    sel.innerHTML = '';
    var keep = '';
    var recommended = '';
    cands.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.key;
      o.textContent = c.label + (c.recommended ? '【推奨】' : '');
      sel.appendChild(o);
      if (c.key === cur) keep = cur;
      if (!recommended && c.recommended) recommended = c.key;
    });
    var chosen = keep || recommended || (cands.length ? cands[0].key : '');
    if (chosen) {
      sel.value = chosen;
      if (ctx.setBaseKey) ctx.setBaseKey(chosen);
    }
    sel.disabled = !cands.length;
    var prevEl = $('tcb-handoff-prev');
    if (prevEl) {
      if (!cands.length) {
        prevEl.style.display = '';
        prevEl.innerHTML = '基準にできる割振り結果がありません。先に割振りを実施確定してください。';
      } else {
        prevEl.style.display = 'none';
        prevEl.innerHTML = '';
      }
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

  function isOpen() {
    var ov = $('tcb-handoff-overlay');
    return !!(ov && ov.classList.contains('open'));
  }

  function open() {
    if (ctx.onOpen) ctx.onOpen();
    /* 先にモーダルを表示してからグリッドを構築する
       （非表示のまま構築すると幅0で測られ、文字サイズの自動調整が効かない） */
    if (ctx.openModal) ctx.openModal('tcb-handoff-overlay');
    fillBaseSelect();
    refreshForm();
    clearResult();
    /* クラウド同期があれば履歴を取り直し、他端末の実施確定も候補に反映する */
    if (ctx.refreshHistory) {
      ctx.refreshHistory().then(function () {
        if (!isOpen()) return;
        if (ctx.rebuildBaseCandidates) ctx.rebuildBaseCandidates();
        fillBaseSelect();
      }).catch(function () {});
    }
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
    /* グループ名は1文字ごとにグリッド全体を組み直さず、少し待ってから反映（ちらつき防止） */
    var nameRefreshTimer = null;
    function onTeamNameInput(side, value) {
      if (ctx.setTeamName) ctx.setTeamName(side, value);
      clearResult();
      if (nameRefreshTimer) clearTimeout(nameRefreshTimer);
      nameRefreshTimer = setTimeout(refreshForm, 300);
    }
    var inpA = $('handoff-tnA');
    if (inpA) {
      inpA.addEventListener('input', function () {
        onTeamNameInput('A', inpA.value);
      });
    }
    var inpB = $('handoff-tnB');
    if (inpB) {
      inpB.addEventListener('input', function () {
        onTeamNameInput('B', inpB.value);
      });
    }
    var baseSel = $('handoff-base-sel');
    if (baseSel) {
      baseSel.addEventListener('change', function () {
        if (ctx.setBaseKey) ctx.setBaseKey(baseSel.value);
        clearResult();
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
