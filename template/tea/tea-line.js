/**
 * お茶当番 — MG LINE 用文面
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

  function formatRestock(items) {
    var lines = (items || []).filter(function (it) {
      return it && String(it.label || '').trim();
    }).map(function (it) {
      var lab = String(it.label || '').trim();
      var q = String(it.qty || '').trim();
      var u = String(it.unitHint || '').trim();
      if (q) return lab + q + (u || '');
      return lab;
    });
    return [
      'お疲れ様です。',
      '当番Ａの補充をお願いします。',
      '',
      lines.join('\n') || '（品目を選んでください）',
      ''
    ].join('\n');
  }

  function withSan(name) {
    var n = String(name || '').trim();
    if (!n) return '（未定）';
    if (n.indexOf('さん') >= 0) return n;
    return n + 'さん';
  }

  function formatPickupAssign(dutyA, dutyB) {
    return [
      'お当番引き取り連絡です。',
      '',
      '🅰️→' + withSan(dutyA),
      '',
      '🅱️→' + withSan(dutyB),
      '',
      'よろしくお願いします。',
      ''
    ].join('\n');
  }

  /** MG LINE 用の月次当番表（MGR展開） */
  function formatMonthRoster(opts) {
    opts = opts || {};
    var title = String(opts.title || 'お茶当番');
    var ymLabel = String(opts.ymLabel || '');
    var revised = String(opts.revisedAt || '').trim();
    var days = opts.days || [];
    var lines = days.map(function (d) {
      var pg = d.playerGroup ? (d.playerGroup + '班') : '—';
      var names = d.playerNames ? String(d.playerNames).trim() : '';
      var pgPart = names ? (pg + '（' + names + '）') : pg;
      return fmtDate(d.activityDate) +
        '　A:' + (d.dutyA || '（未定）') +
        '　B:' + (d.dutyB || '（未定）') +
        '　選手:' + pgPart;
    });
    var out = [
      '【' + title + '】' + (ymLabel || ''),
      '',
      lines.join('\n') || '（日付がありません）',
      ''
    ];
    if (revised) out.push(revised, '');
    out.push('よろしくお願いします。', '');
    return out.join('\n');
  }

  function formatSwap(rows) {
    var body = (rows || []).map(function (r) {
      return fmtDate(r.activityDate) + '\n' + (r.fromName || '（元）') + '→' + (r.toName || '（先）');
    }).join('\n\n');
    return [
      'おつかれさまです。',
      'お当番交代の連絡です。',
      '',
      body || '（交代内容を入力してください）',
      '',
      '交代して頂きありがとうございます。',
      'よろしくお願いいたします。',
      ''
    ].join('\n');
  }

  global.TCB_TeaLine = {
    fmtDate: fmtDate,
    wdJa: wdJa,
    formatRestock: formatRestock,
    formatPickupAssign: formatPickupAssign,
    formatMonthRoster: formatMonthRoster,
    formatSwap: formatSwap
  };
})(typeof window !== 'undefined' ? window : this);
