/* ホーム画面に追加（PWA）ガイド — iOS / Android / Windows / Mac 向け */
(function (global) {
  'use strict';

  var ctx = null;
  var deferredPrompt = null;

  function el(id) { return document.getElementById(id); }

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return window.navigator.standalone === true;
  }

  function guideKind() {
    if (global.TCB_Device && typeof TCB_Device.pwaGuideKind === 'function') {
      return TCB_Device.pwaGuideKind();
    }
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
    return 'generic';
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
    var kind = guideKind();
    if (kind === 'windows' || kind === 'mac') {
      btn.textContent = '\uD83D\uDDA5 アプリ化の手順';
      btn.title = 'ブラウザからアプリのように使う手順';
    } else {
      btn.textContent = '\uD83D\uDCF2 ホーム画面に追加';
      btn.title = 'ホーム画面にショートカットを追加する手順';
    }
    btn.classList.remove('tcb-pwa-hbtn-on');
  }

  function stepsHtml() {
    var kind = guideKind();
    if (kind === 'ios') {
      return ''
        + '<ol class="tcb-pwa-steps">'
        + '<li><span class="tcb-pwa-step-no">1</span><span><strong>Safari</strong> でこのページを開いていることを確認</span></li>'
        + '<li><span class="tcb-pwa-step-no">2</span><span>画面下（またはアドレスバー右）の <strong>共有</strong> ボタン <strong>□↑</strong> をタップ</span></li>'
        + '<li><span class="tcb-pwa-step-no">3</span><span>一覧から <strong>「ホーム画面に追加」</strong> を選ぶ</span></li>'
        + '<li><span class="tcb-pwa-step-no">4</span><span>名称を確認して <strong>「追加」</strong></span></li>'
        + '</ol>'
        + '<div class="tcb-pwa-note"><strong>追加後</strong>：ホーム画面のアイコンから起動してください。<strong>🔔 通知</strong>（交代報告プッシュ）は iOS 16.4 以降、<strong>ホーム画面から起動したときのみ</strong>利用できます。</div>';
    }
    if (kind === 'android') {
      var installBtn = deferredPrompt
        ? '<p style="margin:0 0 10px;"><button type="button" class="tcb-pwa-install-now" id="tcb-pwa-android-install">今すぐインストール</button></p>'
        : '';
      return installBtn
        + '<ol class="tcb-pwa-steps">'
        + '<li><span class="tcb-pwa-step-no">1</span><span><strong>Chrome</strong>（推奨）でこのページを開く</span></li>'
        + '<li><span class="tcb-pwa-step-no">2</span><span>右上のメニュー <strong>⋮</strong> をタップ</span></li>'
        + '<li><span class="tcb-pwa-step-no">3</span><span><strong>「ホーム画面に追加」</strong> または <strong>「アプリをインストール」</strong> を選ぶ</span></li>'
        + '<li><span class="tcb-pwa-step-no">4</span><span>確認して追加</span></li>'
        + '</ol>'
        + '<div class="tcb-pwa-note">追加後はホーム画面／アプリ一覧のアイコンから起動してください。プッシュ通知もこの起動方法が確実です。</div>';
    }
    if (kind === 'windows') {
      return ''
        + '<ol class="tcb-pwa-steps">'
        + '<li><span class="tcb-pwa-step-no">1</span><span><strong>Edge</strong> または <strong>Chrome</strong> でこのページを開く</span></li>'
        + '<li><span class="tcb-pwa-step-no">2</span><span>アドレスバー右の <strong>インストール</strong>（⊕／モニターアイコン）またはメニューの <strong>「アプリをインストール」</strong> を選ぶ</span></li>'
        + '<li><span class="tcb-pwa-step-no">3</span><span>インストール後、スタートメニュー／タスクバーから起動</span></li>'
        + '</ol>'
        + '<div class="tcb-pwa-note">インストールできない場合は、ブラウザのお気に入り／ブックマークでも運用できます。LINE共有は「本文をコピー」→LINEに貼り付けです。</div>';
    }
    if (kind === 'mac') {
      return ''
        + '<ol class="tcb-pwa-steps">'
        + '<li><span class="tcb-pwa-step-no">1</span><span><strong>Chrome</strong> または <strong>Edge</strong> でこのページを開く（Safari はインストール非対応のことがあります）</span></li>'
        + '<li><span class="tcb-pwa-step-no">2</span><span>アドレスバー右の <strong>インストール</strong>、またはメニューの <strong>「○○をインストール」</strong> を選ぶ</span></li>'
        + '<li><span class="tcb-pwa-step-no">3</span><span>Launchpad／アプリケーションから起動</span></li>'
        + '</ol>'
        + '<div class="tcb-pwa-note">Mac版LINEへの送信はブラウザから直接できないため、<strong>本文をコピー</strong>してトークに貼り付けてください。PDFはダウンロードして手動添付します。</div>';
    }
    return ''
      + '<ol class="tcb-pwa-steps">'
      + '<li><span class="tcb-pwa-step-no">1</span><span>ブラウザのメニューから <strong>「ホーム画面に追加」</strong> または <strong>「アプリをインストール」</strong> を探す</span></li>'
      + '<li><span class="tcb-pwa-step-no">2</span><span>名称を確認して追加</span></li>'
      + '</ol>'
      + '<div class="tcb-pwa-note">端末によって表記が異なります。見つからない場合はブックマークでも利用できます。</div>';
  }

  function bindAndroidInstall() {
    var b = el('tcb-pwa-android-install');
    if (!b || !deferredPrompt) return;
    b.addEventListener('click', function () {
      var p = deferredPrompt;
      deferredPrompt = null;
      p.prompt();
      p.userChoice.finally(function () {
        updateHeaderBtn();
        closeModal();
      });
    });
  }

  function openModal() {
    var modal = el('pwa-install-modal');
    var body = el('pwa-install-body');
    if (!modal || !body) return;
    if (isStandalone()) {
      body.innerHTML = '<p class="tcb-pwa-modal-desc">すでに<strong>ホーム画面／アプリから起動</strong>しています。通知 ON の場合もこの起動方法を使ってください。</p>';
    } else {
      body.innerHTML = '<p class="tcb-pwa-modal-desc">ブラウザのタブではなく、<strong>ホーム画面やアプリ一覧のアイコン</strong>から開けるようにします（PWA）。</p>' + stepsHtml();
      bindAndroidInstall();
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
    var kind = guideKind();
    var show = (kind === 'ios' || kind === 'android') && !isStandalone() && !lsGet(lsKey());
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

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      updateHeaderBtn();
    });

    updateHeaderBtn();
    refreshBanner();
  }

  global.TCB_PwaInstall = {
    init: init,
    isStandalone: isStandalone,
    openGuide: openModal
  };
})(window);
