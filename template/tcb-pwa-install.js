/* ホーム画面に追加（PWA）ガイド — iOS Safari 等（自動インストール API 非対応のため手順を案内） */
(function (global) {
  'use strict';

  var ctx = null;

  function el(id) { return document.getElementById(id); }

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return window.navigator.standalone === true;
  }

  function isIos() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  }

  function isIosSafari() {
    if (!isIos()) return false;
    var ua = navigator.userAgent || '';
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }

  function lsKey() {
    return String((ctx && ctx.lsPrefix) || 'tcb') + '_pwa_install_dismissed';
  }

  function lsGet(k) {
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  }

  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  function updateHeaderBtn() {
    var btn = el('btn-pwa-install');
    if (!btn) return;
    if (isStandalone()) {
      btn.textContent = '\u2713 ホーム画面から起動中';
      btn.title = 'ホーム画面に追加済みのアプリとして起動しています';
      btn.classList.add('tcb-pwa-hbtn-on');
      return;
    }
    btn.textContent = '\uD83D\uDCF2 ホーム画面に追加';
    btn.title = 'iPhone/iPad のホーム画面にショートカットを追加する手順';
    btn.classList.remove('tcb-pwa-hbtn-on');
  }

  function stepsHtml() {
    if (isIos()) {
      return ''
        + '<ol class="tcb-pwa-steps">'
        + '<li><span class="tcb-pwa-step-no">1</span><span><strong>Safari</strong> でこのページを開いていることを確認（Chrome 等でも共有メニューから同様に追加できます）</span></li>'
        + '<li><span class="tcb-pwa-step-no">2</span><span>画面下（またはアドレスバー右）の <strong>共有</strong> ボタン <strong>□↑</strong> をタップ</span></li>'
        + '<li><span class="tcb-pwa-step-no">3</span><span>一覧から <strong>「ホーム画面に追加」</strong> を選ぶ</span></li>'
        + '<li><span class="tcb-pwa-step-no">4</span><span>名称（例：15期道具）を確認して <strong>「追加」</strong></span></li>'
        + '</ol>'
        + '<div class="tcb-pwa-note"><strong>追加後</strong>：ホーム画面のアイコンから起動するとアプリのように全画面で開きます。<strong>🔔 通知</strong>（交代報告プッシュ）も iOS 16.4 以降は<strong>ホーム画面から起動したときのみ</strong>利用できます。</div>';
    }
    return ''
      + '<ol class="tcb-pwa-steps">'
      + '<li><span class="tcb-pwa-step-no">1</span><span>ブラウザのメニュー（<strong>⋮</strong> または <strong>共有</strong>）を開く</span></li>'
      + '<li><span class="tcb-pwa-step-no">2</span><span><strong>「ホーム画面に追加」</strong> または <strong>「アプリをインストール」</strong> を選ぶ</span></li>'
      + '<li><span class="tcb-pwa-step-no">3</span><span>名称を確認して追加</span></li>'
      + '</ol>'
      + '<div class="tcb-pwa-note">iPhone の場合は <strong>Safari の共有 → ホーム画面に追加</strong> が確実です。</div>';
  }

  function openModal() {
    var modal = el('pwa-install-modal');
    var body = el('pwa-install-body');
    if (!modal || !body) return;
    if (isStandalone()) {
      body.innerHTML = '<p class="tcb-pwa-modal-desc">すでに<strong>ホーム画面から起動</strong>しています。通知 ON の場合もこの起動方法を使ってください。</p>';
    } else {
      body.innerHTML = '<p class="tcb-pwa-modal-desc">ブラウザのタブではなく、<strong>ホーム画面のアイコン</strong>から開けるようにします（PWA）。</p>' + stepsHtml();
    }
    modal.classList.add('open');
  }

  function closeModal() {
    var modal = el('pwa-install-modal');
    if (modal) modal.classList.remove('open');
  }

  function refreshBanner() {
    var banner = el('pwa-install-banner');
    if (!banner) return;
    var show = isIosSafari() && !isStandalone() && !lsGet(lsKey());
    banner.classList.toggle('open', show);
  }

  function dismissBanner() {
    lsSet(lsKey(), '1');
    refreshBanner();
  }

  function init(context) {
    ctx = context || {};
    var btn = el('btn-pwa-install');
    if (btn) btn.addEventListener('click', openModal);
    var closeBtn = el('pwa-install-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    var modal = el('pwa-install-modal');
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    var bannerBtn = el('pwa-install-banner-open');
    if (bannerBtn) bannerBtn.addEventListener('click', openModal);
    var bannerDismiss = el('pwa-install-banner-dismiss');
    if (bannerDismiss) bannerDismiss.addEventListener('click', dismissBanner);
    updateHeaderBtn();
    refreshBanner();
  }

  global.TCB_PwaInstall = {
    init: init,
    isStandalone: isStandalone,
    openGuide: openModal
  };
})(window);
