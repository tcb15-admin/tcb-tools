/* 道具MGR側 交代報告モジュール
   ツール本体（tool_template.html）の内部関数は IIFE 内に閉じているため、
   本モジュールは init(ctx) で必要なフックを受け取って動作する（グローバル汚染を避ける）。
   ctx:
     syncEnabled()            -> bool
     fetchSwapReports()       -> Promise<{reports,pending}>
     handleSwapReport(payload)-> Promise<{reports,pending}>
     getR()                   -> 現在の割振り結果 R（無ければ null）
     chAssign(tool,name)      -> STEP3の担当を手動変更（既存関数）
     getAdate()               -> 現在の活動日(YYYY-MM-DD)
     fmtDayLabelJa(iso)       -> "M/D(曜)"
     buildParentPublishPayload() -> 公開ペイロード
     publishDay(payload)      -> Promise<{shareId}>
     buildParentViewUrl(sid)  -> URL
     copyText(text, okMsg)    -> クリップボードコピー（既存関数）
     setPublishedUrl(url)     -> 共有ブロックの表示URLを更新 */
(function (global) {
  'use strict';

  var ctx = null;
  var reports = [];
  var appliedSession = []; // 今回セッションで反映した交代（修正版LINE本文用）

  function pushAppliedSession(entry) {
    if (!entry || !entry.tool) return;
    for (var i = 0; i < appliedSession.length; i++) {
      var s = appliedSession[i];
      if (s.tool === entry.tool && s.from === entry.from && s.to === entry.to) return;
    }
    appliedSession.push({ tool: entry.tool, from: entry.from, to: entry.to });
  }

  var REJECT_LABELS = {
    D1: '交代は取りやめになった（申請の取り下げ）',
    D2: '内容を確認できない／要再連絡',
    D9: 'その他'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function statusText(s) {
    if (s === 'applied') return '反映済み';
    if (s === 'dismissed') return '見送り';
    return '未対応';
  }
  function fmtWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    function p(n) { return String(n).padStart(2, '0'); }
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function setBadge(n) {
    var b = el('swap-badge');
    if (!b) return;
    var c = Number(n) || 0;
    if (c > 0) { b.hidden = false; b.textContent = c > 99 ? '99+' : String(c); }
    else { b.hidden = true; b.textContent = '0'; }
  }

  function refresh() {
    if (!ctx || !ctx.syncEnabled()) return Promise.resolve();
    return ctx.fetchSwapReports().then(function (res) {
      reports = (res && Array.isArray(res.reports)) ? res.reports : [];
      setBadge(res && res.pending);
      renderList();
    }).catch(function (err) {
      console.error('swap fetch failed', err);
    });
  }

  /** 同一（dayKey+tool）で未処理が2件以上あれば競合として扱う */
  function conflictKeys() {
    var count = {};
    reports.forEach(function (r) {
      if (r.status !== 'pending') return;
      var k = r.dayKey + '|' + r.tool;
      count[k] = (count[k] || 0) + 1;
    });
    var set = {};
    Object.keys(count).forEach(function (k) { if (count[k] > 1) set[k] = true; });
    return set;
  }

  function renderList() {
    var list = el('swap-list');
    if (!list) return;
    if (!reports.length) {
      list.innerHTML = '<div class="tcbsw-empty">交代報告はまだありません。</div>';
      return;
    }
    var conflicts = conflictKeys();
    // 未処理を先頭、次に新しい順
    var sorted = reports.slice().sort(function (a, b) {
      var pa = a.status === 'pending' ? 0 : 1;
      var pb = b.status === 'pending' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    var html = '';
    sorted.forEach(function (r) {
      var isConflict = r.status === 'pending' && conflicts[r.dayKey + '|' + r.tool];
      var cls = 'tcbsw-item' + (r.status !== 'pending' ? ' tcbsw-done' : '') + (isConflict ? ' tcbsw-conflict' : '');
      html += '<div class="' + cls + '" data-id="' + esc(r.id) + '">';
      if (isConflict) html += '<div class="tcbsw-conflict-note">&#9888; 同じ道具に複数の申請があります。内容をご確認ください。</div>';
      html += '<div class="tcbsw-head">'
        + (r.dayLabel ? '<span class="tcbsw-day">' + esc(r.dayLabel) + '</span>' : '')
        + '<span class="tcbsw-tool">' + esc(r.tool) + '</span>'
        + '<span class="tcbsw-status ' + esc(r.status) + '">' + statusText(r.status) + '</span>'
        + '</div>';
      html += '<div class="tcbsw-swap">' + esc(r.fromPerson) + '<span class="tcbsw-arrow">&#8594;</span>' + esc(r.toPerson) + '</div>';
      var meta = [];
      if (r.reporter) meta.push('連絡者：' + esc(r.reporter));
      meta.push('受付：' + esc(fmtWhen(r.createdAt)));
      html += '<div class="tcbsw-meta">' + meta.join('　') + (r.comment ? '<span class="tcbsw-comment">「' + esc(r.comment) + '」</span>' : '') + '</div>';
      if (r.status === 'dismissed') {
        var rl = REJECT_LABELS[r.rejectCode] || '';
        var extra = r.rejectReason ? ('（' + esc(r.rejectReason) + '）') : '';
        html += '<div class="tcbsw-reject-info">見送り理由：' + esc(rl || 'ー') + extra + '</div>';
      }
      if (r.status === 'pending') {
        html += '<div class="tcbsw-actions">'
          + '<button type="button" class="tcbsw-btn tcbsw-btn-apply" data-act="apply">反映する</button>'
          + '<button type="button" class="tcbsw-btn tcbsw-btn-reject" data-act="reject">却下</button>'
          + '<button type="button" class="tcbsw-btn tcbsw-btn-open" data-act="open-day">この日をSTEP3で開く</button>'
          + '</div>'
          + renderRejectForm();
      } else if (r.status === 'applied') {
        html += '<div class="tcbsw-actions">'
          + '<button type="button" class="tcbsw-btn tcbsw-btn-open" data-act="open-day">この日をSTEP3で開く</button>'
          + '</div>';
      }
      html += '</div>';
    });
    list.innerHTML = html;
  }

  function renderRejectForm() {
    var opts = '';
    Object.keys(REJECT_LABELS).forEach(function (code, i) {
      opts += '<label class="tcbsw-reject-opt"><input type="radio" name="tcbsw-rj" value="' + code + '"' + (i === 0 ? ' checked' : '') + '>' + esc(REJECT_LABELS[code]) + '</label>';
    });
    return '<div class="tcbsw-reject-form" hidden>'
      + '<span class="tcbsw-reject-label">却下理由を選択（保護者の受付状況に表示されます）</span>'
      + opts
      + '<textarea class="tcbsw-reject-text" maxlength="200" rows="2" placeholder="補足（任意・200字まで）"></textarea>'
      + '<div class="tcbsw-reject-btns">'
      + '<button type="button" class="tcbsw-reject-confirm">この理由で却下する</button>'
      + '<button type="button" class="tcbsw-reject-cancel">やめる</button>'
      + '</div></div>';
  }

  function findReport(id) {
    for (var i = 0; i < reports.length; i++) if (reports[i].id === id) return reports[i];
    return null;
  }

  /** STEP3の割振り結果への自動反映を試みる */
  function tryApplyToResult(r) {
    var R = ctx.getR();
    if (!R || !R.map || typeof R.map !== 'object') return { code: 'no_result' };
    var curLabel = ctx.fmtDayLabelJa(ctx.getAdate());
    if (r.dayLabel && curLabel && r.dayLabel !== curLabel) return { code: 'day_mismatch', cur: curLabel };
    if (!(r.tool in R.map)) return { code: 'tool_absent' };
    var holder = R.map[r.tool];
    if (holder !== r.fromPerson) return { code: 'holder_mismatch', holder: holder };
    ctx.chAssign(r.tool, r.toPerson);
    return { code: 'applied' };
  }

  /** 反映前に、報告日の割振り結果を STEP3 へ用意する（未実行セッションでも履歴から復元） */
  function ensureResultForReport(r) {
    var R = ctx.getR();
    var curLabel = ctx.fmtDayLabelJa(ctx.getAdate());
    var dayOk = !r.dayLabel || !curLabel || r.dayLabel === curLabel;
    if (R && R.map && dayOk) return { code: 'ready' };
    if (typeof ctx.loadResultForDayLabel === 'function' && r.dayLabel) {
      if (ctx.loadResultForDayLabel(r.dayLabel)) return { code: 'ready', restored: true };
    }
    R = ctx.getR();
    if (!R || !R.map) return { code: 'no_result' };
    curLabel = ctx.fmtDayLabelJa(ctx.getAdate());
    if (r.dayLabel && curLabel && r.dayLabel !== curLabel) {
      return { code: 'day_mismatch', cur: curLabel };
    }
    return { code: 'ready' };
  }

  function finishApplySuccess(r) {
    if (typeof ctx.afterSwapApplied === 'function') ctx.afterSwapApplied();
    ctx.handleSwapReport({ id: r.id, action: 'apply' }).then(function (res) {
      reports = (res && Array.isArray(res.reports)) ? res.reports : reports;
      setBadge(res && res.pending);
      renderList();
      pushAppliedSession({ tool: r.tool, from: r.fromPerson, to: r.toPerson });
      window.alert('反映しました。\nSTEP3の割振り結果を確認し、「実施確定」を押してください。\nその後、展開情報から修正版をLINEで再通知できます。');
    }).catch(function (err) {
      alert('反映の記録に失敗しました：' + (err && err.message ? err.message : ''));
    });
  }

  function markAppliedStatusOnly(r) {
    ctx.handleSwapReport({ id: r.id, action: 'apply' }).then(function (res) {
      reports = (res && Array.isArray(res.reports)) ? res.reports : reports;
      setBadge(res && res.pending);
      renderList();
      pushAppliedSession({ tool: r.tool, from: r.fromPerson, to: r.toPerson });
    }).catch(function (err) {
      alert('反映の記録に失敗しました：' + (err && err.message ? err.message : ''));
    });
  }

  function proceedApply(r) {
    var prep = ensureResultForReport(r);
    if (prep.code === 'no_result') {
      if (window.confirm('該当日（' + (r.dayLabel || '不明') + '）の割振り結果が端末の履歴にありません。\n先にその日の割振りを履歴から開くか、STEP2で「割振りを実行」してください。\n\n受付状況のみ「反映済み」に更新しますか？（割振り結果は自動では変わりません）')) {
        markAppliedStatusOnly(r);
      }
      return;
    }
    if (prep.code === 'day_mismatch') {
      if (window.confirm('表示中の日（' + (prep.cur || '不明') + '）が報告の日（' + (r.dayLabel || '不明') + '）と異なります。\n\n受付状況のみ「反映済み」に更新しますか？')) {
        markAppliedStatusOnly(r);
      }
      return;
    }

    var res = tryApplyToResult(r);
    if (res.code === 'applied') {
      finishApplySuccess(r);
      return;
    }
    var msg;
    if (res.code === 'no_result') msg = '現在STEP3の割振り結果が読み込まれていません。';
    else if (res.code === 'day_mismatch') msg = '表示中の日（' + (res.cur || '不明') + '）が報告の日（' + (r.dayLabel || '不明') + '）と異なります。';
    else if (res.code === 'tool_absent') msg = 'この道具が現在の割振りに見つかりません。';
    else if (res.code === 'holder_mismatch') msg = '現在の担当は「' + (res.holder || '未割当') + '」です（申請時は' + r.fromPerson + '）。';
    else msg = '割振り結果へ自動反映できませんでした。';

    if (res.code === 'holder_mismatch') {
      if (window.confirm(msg + '\n「' + r.toPerson + '」で上書きしますか？')) {
        ctx.chAssign(r.tool, r.toPerson);
        finishApplySuccess(r);
        return;
      }
    }
    if (window.confirm(msg + '\n\n割振り結果は自動更新されません。STEP3で手動変更してください。\n受付状況のみ「反映済み」に更新しますか？')) {
      markAppliedStatusOnly(r);
    }
  }

  function onApply(r) {
    if (!window.confirm('「' + r.tool + '」の担当を\n' + r.fromPerson + ' → ' + r.toPerson + '\nに反映します。よろしいですか？')) return;
    var needHist = !ctx.getR() || !ctx.getR().map;
    if (needHist && typeof ctx.refreshHistory === 'function') {
      Promise.resolve(ctx.refreshHistory()).then(function () { proceedApply(r); }).catch(function () { proceedApply(r); });
      return;
    }
    proceedApply(r);
  }

  function onRejectConfirm(itemEl, r) {
    var checked = itemEl.querySelector('input[name="tcbsw-rj"]:checked');
    var code = checked ? checked.value : '';
    var reason = (itemEl.querySelector('.tcbsw-reject-text') || {}).value || '';
    if (!code) { alert('却下理由を選択してください。'); return; }
    var label = REJECT_LABELS[code] || code;
    if (!window.confirm('この報告を却下します。\n理由：' + label + '\nよろしいですか？')) return;
    ctx.handleSwapReport({ id: r.id, action: 'dismiss', rejectCode: code, rejectReason: reason }).then(function (res) {
      reports = (res && Array.isArray(res.reports)) ? res.reports : reports;
      setBadge(res && res.pending);
      renderList();
    }).catch(function (err) {
      alert('却下の記録に失敗しました：' + (err && err.message ? err.message : ''));
    });
  }

  function onOpenDay(r) {
    function doOpen() {
      if (!r.dayLabel || typeof ctx.loadResultForDayLabel !== 'function') {
        alert('該当日の割振りを開けませんでした。');
        return;
      }
      if (!ctx.loadResultForDayLabel(r.dayLabel)) {
        alert('該当日（' + r.dayLabel + '）の割振り結果が履歴にありません。\nクラウド同期や履歴をご確認ください。');
        return;
      }
      if (typeof ctx.afterSwapApplied === 'function') ctx.afterSwapApplied();
      var R = ctx.getR();
      if (R && R.map && r.tool && (r.tool in R.map) && R.map[r.tool] === r.fromPerson && r.toPerson) {
        if (window.confirm('報告どおり「' + r.tool + '」を\n' + r.fromPerson + ' → ' + r.toPerson + '\nに差し替えますか？\n（受付は反映済みでも、割振り側が未更新のときに使います）')) {
          ctx.chAssign(r.tool, r.toPerson);
          pushAppliedSession({ tool: r.tool, from: r.fromPerson, to: r.toPerson });
          window.alert('差し替えました。STEP3で「実施確定」を押してください。');
        }
      }
    }
    if (typeof ctx.refreshHistory === 'function') {
      Promise.resolve(ctx.refreshHistory()).then(doOpen).catch(doOpen);
    } else {
      doOpen();
    }
  }

  function onListClick(ev) {
    var t = ev.target;
    if (!t) return;
    var itemEl = t.closest ? t.closest('.tcbsw-item') : null;
    if (!itemEl) return;
    var r = findReport(itemEl.getAttribute('data-id'));
    if (!r) return;

    if (t.getAttribute('data-act') === 'apply') { onApply(r); return; }
    if (t.getAttribute('data-act') === 'open-day') { onOpenDay(r); return; }
    if (t.getAttribute('data-act') === 'reject') {
      var form = itemEl.querySelector('.tcbsw-reject-form');
      if (form) form.hidden = !form.hidden;
      return;
    }
    if (t.classList && t.classList.contains('tcbsw-reject-cancel')) {
      var f = itemEl.querySelector('.tcbsw-reject-form');
      if (f) f.hidden = true;
      return;
    }
    if (t.classList && t.classList.contains('tcbsw-reject-confirm')) {
      onRejectConfirm(itemEl, r);
      return;
    }
  }

  /* ===== 修正版のLINE再通知（再公開＋本文コピー） ===== */
  function buildRevisedMessage(url) {
    var lines = [];
    lines.push('【修正版】道具割り振りを更新しました');
    if (appliedSession.length) {
      lines.push('交代を反映しました：');
      var seen = {};
      appliedSession.forEach(function (s) {
        if (!s || !s.tool) return;
        var key = s.tool + '\0' + s.from + '\0' + s.to;
        if (seen[key]) return;
        seen[key] = 1;
        lines.push('・「' + s.tool + '」' + s.from + ' → ' + s.to);
      });
    } else {
      lines.push('内容を更新しました。');
    }
    if (url) {
      lines.push('最新はこちら（同じURLで最新版に更新されています）');
      lines.push(url);
    }
    lines.push('※各自の詳しい担当は確認画面またはPDFをご覧ください。');
    return lines.join('\n');
  }

  function reNotify() {
    if (!ctx || !ctx.syncEnabled()) { alert('この機能はクラウド同期が有効な環境でのみ利用できます。'); return; }
    var payload = ctx.buildParentPublishPayload();
    if (!payload || !payload.days || !payload.days.length) {
      alert('公開できる確定済みの割振りがありません。\n先に STEP3 の「実施確定」を行ってください。');
      return;
    }
    ctx.publishDay(payload).then(function (res) {
      var sid = res && res.shareId ? res.shareId : '';
      if (!sid) throw new Error('no_share_id');
      var url = ctx.buildParentViewUrl(sid);
      if (ctx.setPublishedUrl) ctx.setPublishedUrl(url);
      var msg = buildRevisedMessage(url);
      var okMsg = '修正版のLINE本文をコピーしました。';
      if (typeof global.TCB_isMacDesktop === 'function' && global.TCB_isMacDesktop()) {
        okMsg += 'Mac版LINEはブラウザから直接送信できません。LINEのトークに貼り付けて送信してください。';
      } else {
        okMsg += 'LINEに貼り付けて送信してください。';
      }
      ctx.copyText(msg, okMsg);
      appliedSession = [];
    }).catch(function (err) {
      console.error(err);
      alert('修正版の再公開に失敗しました。通信状況を確認して再度お試しください。');
    });
  }

  /* ===== モーダル開閉 =====
     本体の openModal/closeModal（背景スクロールロック・重ね順管理）を優先して使う */
  function openModal() {
    if (ctx && typeof ctx.openModalById === 'function') {
      ctx.openModalById('swap-modal');
    } else {
      var m = el('swap-modal');
      if (m) m.classList.add('open');
    }
    refresh();
  }
  function closeModal() {
    if (ctx && typeof ctx.closeModalById === 'function') {
      ctx.closeModalById('swap-modal');
    } else {
      var m = el('swap-modal');
      if (m) m.classList.remove('open');
    }
  }

  function init(context) {
    ctx = context || {};
    var btn = el('btn-swap-reports');
    // クラウド同期が無効（トークン未設定）の環境では報告機能を隠す
    if (!ctx.syncEnabled || !ctx.syncEnabled()) {
      if (btn) btn.style.display = 'none';
      return;
    }
    if (btn) { btn.style.display = ''; btn.addEventListener('click', openModal); }
    var closeBtn = el('swap-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    var modal = el('swap-modal');
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    var list = el('swap-list');
    if (list) list.addEventListener('click', onListClick);
    // 起動時に新着件数を取得（バッジ表示）
    refresh();
  }

  function hasRevisedNotice() {
    return appliedSession.length > 0;
  }
  function clearRevisedNotice() {
    appliedSession = [];
  }

  global.TCB_SwapMgr = {
    init: init,
    refresh: refresh,
    reNotify: reNotify,
    hasRevisedNotice: hasRevisedNotice,
    buildRevisedLineMessage: buildRevisedMessage,
    clearRevisedNotice: clearRevisedNotice
  };
})(window);
