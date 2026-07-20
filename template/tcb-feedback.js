/* 共通フィードバックUI モジュール
   - トースト通知（alert の非ブロッキング置き換え）
   - クラウド同期状態インジケーター（ヘッダー常設）
   道具MGR画面・保護者確認画面の両方から利用する。 */
(function (global) {
  'use strict';

  var CONTAINER_ID = 'tcb-fb-toast-container';

  function ensureContainer() {
    var c = document.getElementById(CONTAINER_ID);
    if (c) return c;
    c = document.createElement('div');
    c.id = CONTAINER_ID;
    c.className = 'tcb-fb-toasts';
    c.setAttribute('aria-live', 'polite');
    document.body.appendChild(c);
    return c;
  }

  /** トースト表示。type: 'info' | 'success' | 'warn' | 'error' */
  function toast(msg, type, durationMs) {
    type = (type === 'success' || type === 'warn' || type === 'error') ? type : 'info';
    var c = ensureContainer();
    var el = document.createElement('div');
    el.className = 'tcb-fb-toast tcb-fb-' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = String(msg == null ? '' : msg);
    c.appendChild(el);
    /* 表示は最大3件（古いものから消す） */
    while (c.children.length > 3) c.removeChild(c.firstChild);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { el.classList.add('tcb-fb-in'); });
    } else {
      el.classList.add('tcb-fb-in');
    }
    var ms = durationMs || (type === 'error' ? 7000 : type === 'warn' ? 5500 : 3500);
    setTimeout(function () {
      el.classList.remove('tcb-fb-in');
      el.classList.add('tcb-fb-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }, ms);
    return el;
  }

  /* ===== 同期状態インジケーター ===== */
  var ind = { el: null, pending: 0, lastOkAt: null, err: false };

  function two(n) { return String(n).padStart(2, '0'); }

  function renderIndicator() {
    if (!ind.el) return;
    var cls, txt;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      cls = 'off'; txt = '\u26A0 オフライン（保存は端末のみ）';
    } else if (ind.pending > 0) {
      cls = 'busy'; txt = '\u2601 同期中…';
    } else if (ind.err) {
      cls = 'err'; txt = '\u26A0 同期エラー';
    } else if (ind.lastOkAt) {
      cls = 'ok'; txt = '\u2601 同期済み ' + two(ind.lastOkAt.getHours()) + ':' + two(ind.lastOkAt.getMinutes());
    } else {
      cls = 'idle'; txt = '\u2601 クラウド同期';
    }
    ind.el.className = 'tcb-fb-sync tcb-fb-sync-' + cls;
    ind.el.textContent = txt;
    ind.el.hidden = false;
  }

  /** ヘッダーの要素IDを渡して初期化（クラウド同期が有効な画面のみ呼ぶ） */
  function initSyncIndicator(elId) {
    ind.el = document.getElementById(elId);
    if (!ind.el) return;
    window.addEventListener('online', renderIndicator);
    window.addEventListener('offline', renderIndicator);
    renderIndicator();
  }

  /** API呼び出しの状態通知。ev: 'start' | 'ok' | 'error' */
  function syncStatus(ev) {
    if (ev === 'start') {
      ind.pending++;
    } else {
      ind.pending = Math.max(0, ind.pending - 1);
      if (ev === 'ok') { ind.lastOkAt = new Date(); ind.err = false; }
      else if (ev === 'error') { ind.err = true; }
    }
    renderIndicator();
  }

  global.TCB_Feedback = {
    toast: toast,
    initSyncIndicator: initSyncIndicator,
    syncStatus: syncStatus
  };
})(typeof window !== 'undefined' ? window : this);
