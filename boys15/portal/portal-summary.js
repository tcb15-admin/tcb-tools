/**
 * ポータル — 横断サマリー（タイル状況／要確認アラート）
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setTileMeta(key, tile) {
    var el = document.querySelector('[data-pt-sum="' + key + '"]');
    if (!el || !tile) return;
    el.textContent = tile.line || '';
    el.classList.remove('is-warn', 'is-ok', 'is-idle');
    el.classList.add('is-' + (tile.status || 'idle'));
    el.title = tile.sub || '';
  }

  function renderAlerts(alerts) {
    var box = $('pt-alerts');
    if (!box) return;
    if (!alerts || !alerts.length) {
      box.classList.add('pt-hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('pt-hidden');
    box.innerHTML = '<div class="pt-alerts-title">要確認</div>'
      + alerts.map(function (a) {
        var href = a.href || '#';
        return '<a class="pt-alert-item" href="' + esc(href) + '">' + esc(a.summary || '') + '</a>';
      }).join('');
  }

  async function boot() {
    var cfg = window.TCB_PT_CFG || {};
    var status = $('pt-sum-status');
    if (!cfg.apiBase || !cfg.apiToken) {
      if (status) status.textContent = 'サマリーAPI未設定';
      return;
    }
    if (typeof TCB_createSyncClient !== 'function') {
      if (status) status.textContent = '同期クライアントなし';
      return;
    }
    var client = TCB_createSyncClient({
      baseUrl: cfg.apiBase,
      token: cfg.apiToken,
      cohort: String(cfg.cohort || '')
    });
    if (!client || !client.getPortalSummary) {
      if (status) status.textContent = 'サマリー未対応';
      return;
    }
    if (status) status.textContent = '読込中…';
    try {
      var res = await client.getPortalSummary();
      var tiles = res.tiles || {};
      setTileMeta('attendance', tiles.attendance);
      setTileMeta('carpool', tiles.carpool);
      setTileMeta('tea', tiles.tea);
      setTileMeta('gear', tiles.gear);
      renderAlerts(res.alerts || []);
      if (status) status.textContent = '';
    } catch (e) {
      if (status) status.textContent = 'サマリー取得失敗';
      console.warn(e);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    boot();
  });
})();
