/**
 * ポータル — 横断サマリー（活動日ハブ／タイル状況／アラート）
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || '');
    var w = ['日', '月', '火', '水', '木', '金', '土'];
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number(m[2]) + '/' + Number(m[3]) + '（' + w[dt.getDay()] + '）';
  }

  var STATUS_CP = {
    draft: '作成中',
    submitted: '確認依頼中',
    approved: '承認済',
    published: '公開済',
    returned: '差し戻し'
  };

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

  function renderHub(hub) {
    var box = $('pt-hub');
    if (!box) return;
    if (!hub || !hub.length) {
      box.innerHTML = '<p class="pt-hub-empty">直近21日に紐づく活動日はまだありません。</p>';
      return;
    }
    box.innerHTML = hub.map(function (h) {
      var bits = [];
      if (h.attendance) {
        bits.push('出欠 MG ' + h.attendance.mgAnswered + '/' + h.attendance.memberTotal);
      }
      if (h.carpool && h.carpool.length) {
        bits.push('配車 ' + h.carpool.map(function (c) {
          return (STATUS_CP[c.status] || c.status) + (c.groupLabel ? '(' + c.groupLabel + ')' : '');
        }).join('・'));
      }
      if (h.tea) {
        bits.push('お茶 A:' + (h.tea.dutyA || '—') + ' B:' + (h.tea.dutyB || '—'));
      }
      if (h.gear && h.gear.hasHistory) bits.push('道具あり');
      return '<div class="pt-hub-card">'
        + '<div class="pt-hub-date">' + esc(fmtDate(h.activityDate)) + '</div>'
        + '<div class="pt-hub-bits">' + esc(bits.join(' ／ ') || '（連携データなし）') + '</div>'
        + '</div>';
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
      renderHub(res.hub || []);
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
