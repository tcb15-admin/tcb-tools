/**
 * 配車 — MG／親父 LINE 展開文面
 */
(function (global) {
  'use strict';

  function wdJa(iso) {
    var d = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!d) return '';
    var dt = new Date(+d[1], +d[2] - 1, +d[3]);
    if (isNaN(dt.getTime())) return '';
    return ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()] || '';
  }

  function fmtDate(iso) {
    var d = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!d) return String(iso || '');
    var m = String(Number(d[2]));
    var day = String(Number(d[3]));
    var w = wdJa(iso);
    return m + '/' + day + (w ? '（' + w + '）' : '');
  }

  function rowLine(r) {
    var seats = [r.driver, r.front, r.rear1, r.rear2, r.rear3, r.rear4, r.rear5]
      .map(function (v) { return String(v || '').trim(); })
      .filter(Boolean)
      .join('／');
    var parts = [
      String(r.sortOrder || ''),
      String(r.category || ''),
      String(r.carModel || ''),
      seats
    ].filter(Boolean);
    var duty = String(r.duty || '').trim();
    var note = String(r.note || '').trim();
    var extra = [duty, note].filter(Boolean).join('・');
    return parts.join('　') + (extra ? '（' + extra + '）' : '');
  }

  function formatSheetShare(sheet, trackLabel) {
    sheet = sheet || {};
    var rows = (sheet.rows || []).slice().sort(function (a, b) {
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
    var route = (sheet.fromPlace || '') + (sheet.toPlace ? ' ⇒ ' + sheet.toPlace : '');
    var group = String(sheet.groupLabel || '').trim();
    var lines = [
      '【' + (sheet.title || '配車表') + '】',
      fmtDate(sheet.activityDate) + (group ? '　' + group : ''),
      route,
      '',
      '■配車（' + (trackLabel || 'LINE') + '）'
    ];
    rows.forEach(function (r) {
      if (!String(r.category || r.driver || r.carModel || '').trim()) return;
      lines.push(rowLine(r));
    });
    lines.push('');
    lines.push('安全運転でお願いします。');
    lines.push('');
    return lines.join('\n');
  }

  global.TCB_carpoolLine = {
    formatSheetShare: formatSheetShare,
    fmtDate: fmtDate
  };
})(window);
