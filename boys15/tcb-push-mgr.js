/* 道具MGR向け Web Push 登録モジュール（交代報告の新着通知）
   init(ctx):
     syncEnabled()     -> bool
     vapidPublicKey    -> string（空なら非表示）
     lsPrefix          -> localStorage キー接頭辞
     pushSubscribe(p)  -> Promise（endpoint/p256dh/auth を POST） */
(function (global) {
  'use strict';

  var ctx = null;

  function urlBase64ToUint8Array(base64String) {
    var s = String(base64String || '');
    var padding = '='.repeat((4 - (s.length % 4)) % 4);
    var base64 = (s + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function vapidKeyReady() {
    if (!ctx || !ctx.vapidPublicKey) return false;
    var k = String(ctx.vapidPublicKey).trim();
    if (!k || k.indexOf('{{') >= 0 || k.indexOf('__') === 0) return false;
    return k.length > 20;
  }

  function pushAvailable() {
    return !!(
      ctx &&
      ctx.syncEnabled &&
      ctx.syncEnabled() &&
      vapidKeyReady() &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  function el(id) { return document.getElementById(id); }

  function updateBtnState(state) {
    var btn = el('btn-push-notify');
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove('tcbpush-on', 'tcbpush-denied');
    if (state === 'on') {
      btn.textContent = '\uD83D\uDD14 通知ON';
      btn.title = '新着交代報告をプッシュ通知で受け取っています';
      btn.classList.add('tcbpush-on');
    } else if (state === 'denied') {
      btn.textContent = '\uD83D\uDD14 不可';
      btn.title = '通知がブロックされています。ブラウザまたは端末の設定で許可してください';
      btn.classList.add('tcbpush-denied');
      btn.disabled = true;
    } else {
      btn.textContent = '\uD83D\uDD14 通知';
      btn.title = '新着交代報告をプッシュ通知で受け取る（要許可）';
    }
  }

  function registerSubscription(sub) {
    var json = sub.toJSON ? sub.toJSON() : sub;
    if (!json || !json.endpoint || !json.keys) throw new Error('invalid_subscription');
    return ctx.pushSubscribe({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }).then(function () {
      try {
        if (ctx.lsPrefix) localStorage.setItem(ctx.lsPrefix + '_pushOn', '1');
      } catch (e) { /* ignore */ }
      updateBtnState('on');
    });
  }

  function enablePush() {
    if (!pushAvailable()) {
      alert('このブラウザまたは環境ではプッシュ通知に対応していません。\niOS 16.4+ はホーム画面に追加した PWA でのみ利用できます。');
      return Promise.resolve();
    }
    var btn = el('btn-push-notify');
    if (btn) { btn.disabled = true; btn.textContent = '登録中…'; }
    return navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (reg) {
        return Notification.requestPermission().then(function (perm) {
          if (perm === 'denied') {
            updateBtnState('denied');
            throw new Error('denied');
          }
          if (perm !== 'granted') throw new Error('dismissed');
          var key = urlBase64ToUint8Array(ctx.vapidPublicKey);
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        });
      })
      .then(registerSubscription)
      .catch(function (err) {
        if (err && (err.message === 'denied' || err.message === 'dismissed')) return;
        console.error(err);
        alert('通知の登録に失敗しました。通信状況を確認して再度お試しください。');
        updateBtnState('off');
      })
      .finally(function () {
        var b = el('btn-push-notify');
        if (b && !b.classList.contains('tcbpush-on') && !b.classList.contains('tcbpush-denied')) {
          b.disabled = false;
        }
      });
  }

  function tryResubscribe() {
    if (!pushAvailable()) return Promise.resolve();
    if (Notification.permission === 'denied') {
      updateBtnState('denied');
      return Promise.resolve();
    }
    if (Notification.permission !== 'granted') {
      updateBtnState('off');
      return Promise.resolve();
    }
    return navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          if (sub) {
            return registerSubscription(sub).catch(function () { updateBtnState('off'); });
          }
          updateBtnState('off');
        });
      })
      .catch(function () { updateBtnState('off'); });
  }

  function init(context) {
    ctx = context || {};
    var btn = el('btn-push-notify');
    if (!pushAvailable()) {
      if (btn) btn.style.display = 'none';
      return;
    }
    if (btn) {
      btn.style.display = '';
      btn.addEventListener('click', enablePush);
    }
    tryResubscribe();
  }

  global.TCB_PushMgr = { init: init, enable: enablePush };
})(window);
