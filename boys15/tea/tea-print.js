/**
 * お茶当番 — 共有PDF体裁の生成と LINE 共有
 * 依存: ../tcb-print-pdf.js（TCB_generateAssignPdfBlob）／任意で ../tcb-device.js
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function canShareFiles() {
    if (global.TCB_Device && typeof TCB_Device.canShareFiles === 'function') {
      return !!TCB_Device.canShareFiles();
    }
    try {
      if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
      var probe = new File([new Blob(['0'], { type: 'application/pdf' })], 'probe.pdf', { type: 'application/pdf' });
      return !!navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  function isIosLike() {
    if (global.TCB_Device && typeof TCB_Device.isIos === 'function') return !!TCB_Device.isIos();
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function shouldAvoidPdfFileWebShare() {
    if (global.TCB_Device && typeof TCB_Device.shouldAvoidPdfFileWebShare === 'function') {
      return !!TCB_Device.shouldAvoidPdfFileWebShare();
    }
    return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }

  function fmtMd(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(iso || '');
    return String(Number(m[2])) + '/' + String(Number(m[3]));
  }

  function wdJa(iso) {
    var Line = global.TCB_TeaLine;
    if (Line && Line.wdJa) return Line.wdJa(iso);
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()] || '';
  }

  function isHoliday(iso) {
    var Cal = global.TCB_AttCalendar;
    return !!(Cal && Cal.isHoliday && Cal.isHoliday(iso));
  }

  function titleFor(ym, cohortLabel) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    var y = m ? m[1] : '';
    var mo = m ? String(Number(m[2])) : '';
    var lab = String(cohortLabel || '').replace(/期$/, '') + '期生';
    return lab + '　' + y + '年　' + mo + '月　当番';
  }

  function fileBase(ym, cohortLabel) {
    var m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
    var y = m ? m[1] : '0000';
    var mo = m ? m[2] : '00';
    var lab = String(cohortLabel || 'tea').replace(/\s+/g, '');
    return lab + '_お茶当番_' + y + mo;
  }

  /**
   * @param {{
   *   ym: string,
   *   cohortLabel: string,
   *   revisedAt: string,
   *   note: string,
   *   days: Array<{activityDate:string,dutyA:string,dutyB:string,playerGroup:number|null}>,
   *   playerGroups: Object
   * }} data
   */
  function buildPrintHtml(data) {
    data = data || {};
    var days = data.days || [];
    var groups = data.playerGroups || {};
    var dutyRows = days.map(function (d) {
      var wd = wdJa(d.activityDate);
      var hol = isHoliday(d.activityDate);
      var wdCls = (wd === '日' || hol) ? ' class="tea-pdf-sun"' : '';
      var pg = d.playerGroup ? String(d.playerGroup) : '';
      return '<tr>' +
        '<td>' + esc(fmtMd(d.activityDate)) + '</td>' +
        '<td' + wdCls + '>' + esc(wd) + (hol && wd !== '日' ? '<span class="tea-pdf-hol">祝</span>' : '') + '</td>' +
        '<td>' + esc(d.dutyA || '') + '</td>' +
        '<td>' + esc(d.dutyB || '') + '</td>' +
        '<td>' + esc(pg) + '</td>' +
        '</tr>';
    }).join('');

    var gHeads = '';
    var gCells = '';
    for (var i = 1; i <= 6; i++) {
      var list = groups[String(i)] || [];
      gHeads += '<th>' + i + '班</th>';
      gCells += '<td>' + list.map(function (n) { return esc(n); }).join('<br>') + '</td>';
    }

    var rev = String(data.revisedAt || '').trim();
    var note = String(data.note || '').trim();

    var css = [
      '@page{size:A4;margin:10mm;}',
      '*{box-sizing:border-box;}',
      'body{margin:0;padding:0;background:#fff;color:#000;',
      'font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;}',
      '.page{width:190mm;margin:0 auto;padding:6mm 4mm;background:#fff;}',
      'h1{text-align:center;font-size:18px;font-weight:900;margin:0 0 10px;letter-spacing:.12em;}',
      'table{border-collapse:collapse;width:100%;}',
      '.tea-pdf-duty{margin-bottom:6px;font-size:12px;}',
      '.tea-pdf-duty th,.tea-pdf-duty td{border:1px solid #111;padding:5px 6px;text-align:center;}',
      '.tea-pdf-duty th{font-size:11px;font-weight:800;background:#f3f3f3;}',
      '.tea-pdf-duty td:nth-child(3),.tea-pdf-duty td:nth-child(4){min-width:4.5em;}',
      '.tea-pdf-duty col.c-d{width:12%;}.tea-pdf-duty col.c-w{width:10%;}',
      '.tea-pdf-duty col.c-a,.tea-pdf-duty col.c-b{width:29%;}.tea-pdf-duty col.c-p{width:12%;}',
      '.tea-pdf-sun{color:#c0000a;font-weight:700;}',
      '.tea-pdf-hol{display:block;font-size:9px;color:#c0000a;line-height:1.1;}',
      '.tea-pdf-rev{text-align:right;color:#c0000a;font-size:11px;font-weight:700;margin:2px 0 8px;}',
      '.tea-pdf-gcap{font-size:12px;font-weight:800;margin:0 0 4px;}',
      '.tea-pdf-groups{margin-bottom:12px;font-size:11px;}',
      '.tea-pdf-groups th,.tea-pdf-groups td{border:1px solid #111;padding:6px 4px;vertical-align:top;text-align:center;width:16.66%;}',
      '.tea-pdf-groups th{font-weight:800;background:#f3f3f3;}',
      '.tea-pdf-groups td{line-height:1.55;}',
      '.tea-pdf-note{font-size:11px;line-height:1.55;white-space:pre-wrap;word-break:break-word;}'
    ].join('');

    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>' +
      esc(titleFor(data.ym, data.cohortLabel)) + '</title><style>' + css + '</style></head><body>' +
      '<div class="page">' +
      '<h1>' + esc(titleFor(data.ym, data.cohortLabel)) + '</h1>' +
      '<table class="tea-pdf-duty"><colgroup>' +
      '<col class="c-d"><col class="c-w"><col class="c-a"><col class="c-b"><col class="c-p">' +
      '</colgroup><thead><tr>' +
      '<th>日付</th><th>曜日</th><th>当番A</th><th>当番B</th><th>選手当番</th>' +
      '</tr></thead><tbody>' + (dutyRows || '<tr><td colspan="5">（日付なし）</td></tr>') +
      '</tbody></table>' +
      (rev ? '<p class="tea-pdf-rev">' + esc(rev) + '</p>' : '') +
      '<p class="tea-pdf-gcap">選手当番</p>' +
      '<table class="tea-pdf-groups"><thead><tr>' + gHeads + '</tr></thead>' +
      '<tbody><tr>' + gCells + '</tr></tbody></table>' +
      (note ? '<div class="tea-pdf-note">' + esc(note) + '</div>' : '') +
      '</div></body></html>';
  }

  function copyTextSilent(text) {
    var t = String(text || '');
    if (!t) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }).catch(function () {
        return false;
      });
    }
    return Promise.resolve(false);
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    try {
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
  }

  function defaultShareMessage(data) {
    data = data || {};
    var lab = String(data.cohortLabel || '');
    var title = titleFor(data.ym, lab).replace(/　/g, ' ');
    var rev = String(data.revisedAt || '').trim();
    var lines = [
      'お疲れ様です。',
      '【' + lab + '】' + title + (rev ? '（' + rev + '）' : '') + 'です。',
      '',
      'PDFを添付しますのでご確認ください。',
      'よろしくお願いします。',
      ''
    ];
    return lines.join('\n');
  }

  /**
   * 保存済みデータから PDF を作り、スマホは共有シート／PC は本文コピー＋ダウンロード
   * @returns {Promise<{mode:string,fileName:string}>}
   */
  function shareTeaPdf(data) {
    if (typeof global.TCB_generateAssignPdfBlob !== 'function') {
      return Promise.reject(new Error('PDF部品が読み込まれていません'));
    }
    var base = fileBase(data.ym, data.cohortLabel);
    var fileName = base + '.pdf';
    var msg = String(data.message || '').trim() || defaultShareMessage(data);
    var html = buildPrintHtml(data);

    return global.TCB_generateAssignPdfBlob(html).then(function (blob) {
      if (!(blob instanceof Blob) || !blob.size) {
        throw new Error('PDFの生成に失敗しました');
      }
      var file = new File([blob], fileName, { type: 'application/pdf' });

      /* スマホ: 共有シートで LINE へ本文＋PDF */
      if (!shouldAvoidPdfFileWebShare() && canShareFiles()) {
        var payload = { files: [file], title: base, text: msg };
        try {
          if (!navigator.canShare || navigator.canShare(payload)) {
            return navigator.share(payload).then(function () {
              return { mode: 'share', fileName: fileName };
            });
          }
        } catch (e) { /* fall through */ }
        try {
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            return navigator.share({ files: [file], title: base }).then(function () {
              return { mode: 'share-file', fileName: fileName };
            });
          }
        } catch (e2) { /* fall through */ }
      }

      if (isIosLike() && typeof navigator.share === 'function') {
        try {
          var iosPayload = { files: [file], title: base, text: msg };
          if (!navigator.canShare || navigator.canShare(iosPayload)) {
            return navigator.share(iosPayload).then(function () {
              return { mode: 'share', fileName: fileName };
            });
          }
        } catch (e3) { /* fall through */ }
      }

      /* PC: ブラウザから LINE へ直接送れないため、本文コピー＋PDFダウンロード */
      return copyTextSilent(msg).then(function (copied) {
        downloadBlob(blob, fileName);
        return { mode: 'desktop', fileName: fileName, copied: !!copied };
      });
    });
  }

  global.TCB_TeaPrint = {
    buildPrintHtml: buildPrintHtml,
    shareTeaPdf: shareTeaPdf,
    defaultShareMessage: defaultShareMessage,
    titleFor: titleFor,
    canShareFiles: canShareFiles
  };
})(typeof window !== 'undefined' ? window : this);
