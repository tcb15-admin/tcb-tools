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

  function formatPickupAssign(dutyA, dutyB) {
    return [
      'お当番引き取り連絡です。',
      '',
      '🅰️→' + (dutyA || '（未定）') + (dutyA && dutyA.indexOf('さん') < 0 ? 'さん' : ''),
      '',
      '🅱️→' + (dutyB || '（未定）') + (dutyB && dutyB.indexOf('さん') < 0 ? 'さん' : ''),
      '',
      'よろしくお願いします。',
      ''
    ].join('\n');
  }

  function formatReceived(iso, setLabel, name) {
    var who = name || '（氏名）';
    if (who.indexOf('さん') < 0 && who.indexOf('です') < 0) who = who + 'です';
    return [
      'お疲れ様です。',
      fmtDate(iso) + 'お当番' + (setLabel || 'B') + 'の' + who + '。',
      'お当番道具' + (setLabel || 'B') + 'をお預かりしました。',
      'よろしくお願いします。',
      ''
    ].join('\n');
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

  function formatTodayPickup(iso, setLabel, name, byWhom) {
    var who = name || '（氏名）';
    if (who.indexOf('です') < 0) who = who + 'です';
    return [
      'おはようございます。',
      fmtDate(iso) + 'お当番' + (setLabel || 'A') + 'の' + who + '。',
      '本日のお当番道具は' + (byWhom || '父が引き取ります') + '。よろしくお願いいたします。',
      ''
    ].join('\n');
  }

  global.TCB_TeaLine = {
    fmtDate: fmtDate,
    wdJa: wdJa,
    formatRestock: formatRestock,
    formatPickupAssign: formatPickupAssign,
    formatReceived: formatReceived,
    formatSwap: formatSwap,
    formatTodayPickup: formatTodayPickup
  };
})(typeof window !== 'undefined' ? window : this);
