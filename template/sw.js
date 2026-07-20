/* Service Worker: 道具MGR向け Web Push 受信（交代報告の新着通知）＋オフラインキャッシュ
   - HTML・JS・CSS: ネットワーク優先（HTMLとJSの版ずれを防ぐ）。失敗時のみキャッシュ（圏外対策）
   - 画像・フォント: stale-while-revalidate（バージョン非依存の静的物のみ）
   - API（別オリジン）には一切触れない */
'use strict';

var CACHE_NAME = 'tcb-shell-v2';

self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* HTMLと一緒に更新されるべきもの（版ずれ厳禁）→ ネットワーク優先 */
function isVersionedAsset(url) {
  return /\.(js|css)$/.test(url.pathname);
}
/* バージョンに依存しない静的物 → キャッシュ即返し＋裏で更新 */
function isImmutableAsset(url) {
  return /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; /* API等の別オリジンは対象外 */

  var isNav = req.mode === 'navigate' || /\.html$/.test(url.pathname) || url.pathname.endsWith('/');

  /* HTML・JS・CSS はネットワーク優先（更新を最速で届け、HTMLとJSの版ずれを防ぐ）。
     オフライン時のみキャッシュから返す（同一キャッシュ世代なので組み合わせは整合する） */
  if (isNav || isVersionedAsset(url)) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          if (!isNav) throw new Error('offline_no_cache');
          return new Response(
            '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<body style="font-family:sans-serif;padding:40px 20px;text-align:center;color:#333;">'
            + '<h1 style="font-size:18px;">オフラインです</h1>'
            + '<p style="font-size:14px;line-height:1.7;">このページはまだ端末に保存されていません。<br>電波のある場所で再度開いてください。</p></body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  /* 画像・フォント: キャッシュ即返し＋裏で更新 */
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        var refetch = fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () {});
          }
          return res;
        }).catch(function () {
          if (hit) return hit;
          throw new Error('offline_no_cache');
        });
        return hit || refetch;
      })
    );
  }
});

self.addEventListener('push', function (event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }
  var title = data.title || '交代報告';
  var opts = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'swap-report',
    data: { url: data.url || './index.html' },
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && c.url.indexOf('index.html') >= 0) {
          return c.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
