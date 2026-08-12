/* 共通ログイン：パスワード表示切替（data-tcb-pw-eye） */
(function () {
  'use strict';
  function bindEye(btn) {
    if (!btn || btn.dataset.tcbPwEyeBound === '1') return;
    btn.dataset.tcbPwEyeBound = '1';
    var targetId = btn.getAttribute('data-tcb-pw-eye');
    var inp = targetId ? document.getElementById(targetId) : null;
    if (!inp) return;
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'パスワードを表示');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.setAttribute('aria-label', show ? 'パスワードを隠す' : 'パスワードを表示');
    });
  }
  function init() {
    document.querySelectorAll('[data-tcb-pw-eye]').forEach(bindEye);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
