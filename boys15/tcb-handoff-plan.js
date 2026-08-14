/* 次回活動の入れ替え案（算出→LINE共有→入れ替え確定まで）
 * 依存: 本体が init(hooks) で算出・確定・パターン変更・班グリッド更新を渡す
 */
(function (global) {
  'use strict';

  var ctx = null;
  var lastLineText = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function $(id) {
    return document.getElementById(id);
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
    lastLineText = '';
    var box = $('tcb-handoff-result');
    if (box) box.innerHTML = '';
  }

  function renderResult(payload) {
    var box = $('tcb-handoff-result');
    if (!box) return;
    if (!payload || payload.error) {
      lastLineText = '';
      box.innerHTML = '<div class="tcb-handoff-err">' + esc((payload && payload.error) || '算出できませんでした。') + '</div>';
      return;
    }
    lastLineText = payload.lineText || '';

    var html = '<div class="tcb-handoff-oknote">最適解のみ表示しています。入れ替え不要の道具は前回の担当のままです。実際に受け渡しが決まったら「入れ替えを実施確定」で保有を記録できます。</div>';
    if (payload.html) html += payload.html;
    if (payload.holdingsHtml) html += payload.holdingsHtml;
    html += '<div class="tcb-swap-list-actions">';
    html += '<button type="button" class="tcb-swap-list-copybtn" id="btn-handoff-copy-line">LINE本文をコピー</button>';
    if (payload.canPdf) {
      html += '<button type="button" class="tcb-swap-list-copybtn tcb-swap-list-copybtn-sec" id="btn-handoff-pdf">変更点PDFを作成</button>';
    }
    html += '</div>';
    if (payload.canConfirm) {
      html += '<div class="tcb-handoff-confirm-wrap">';
      html += '<button type="button" class="tcb-handoff-confirmbtn" id="btn-handoff-confirm">入れ替えを実施確定（保有を更新）</button>';
      html += '<p class="tcb-handoff-confirm-note">確定すると、この保有が次回割振りの基準になります。過去担当回数（PAST）は増えません。</p>';
      html += '</div>';
    }
    if (lastLineText) {
      html += '<div class="tcb-swap-list-line-wrap">';
      html += '<div class="tcb-swap-list-line-hd">LINE本文（このままコピーされます）</div>';
      html += '<pre class="tcb-swap-list-line-pre" id="tcb-handoff-line-pre">' + esc(lastLineText) + '</pre>';
      html += '</div>';
    }
    box.innerHTML = html;

    var lineBtn = $('btn-handoff-copy-line');
    if (lineBtn) {
      lineBtn.addEventListener('click', function () {
        if (ctx.copyText) ctx.copyText(lastLineText, 'LINE本文をコピーしました');
      });
    }
    var pdfBtn = $('btn-handoff-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function () {
        if (!ctx.makePdf) return;
        var orig = pdfBtn.textContent;
        pdfBtn.disabled = true;
        pdfBtn.textContent = 'PDF作成中…';
        ctx.makePdf().then(function () {
          pdfBtn.disabled = false;
          pdfBtn.textContent = orig;
        }).catch(function (err) {
          pdfBtn.disabled = false;
          pdfBtn.textContent = orig;
          /* 共有シートのキャンセルはエラー扱いにしない */
          if (err && err.name === 'AbortError') return;
          if (err && err.name === 'NotAllowedError') {
            alert('準備ができました。もう一度「変更点PDFを作成」を押すと共有シートが開きます。');
            return;
          }
          alert((err && err.message) || 'PDFの作成に失敗しました。');
        });
      });
    }
    var confirmBtn = $('btn-handoff-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        if (!ctx.confirmPlan) return;
        var res = ctx.confirmPlan();
        if (res && res.ok) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = '実施確定済み';
          fillBaseSelect();
        } else if (res && res.msg) {
          alert(res.msg);
        }
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
