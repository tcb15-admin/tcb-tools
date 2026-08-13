/* 前回結果→今回の道具入れ替えリスト（表示・全文テキスト）
 * 依存: 呼び出し側が report（buildCarryAdjustChangeReport 互換）と esc を渡す
 */
(function (global) {
  'use strict';

  function withPersonLabel(name, labelPerson) {
    if (!name) return '（なし）';
    if (typeof labelPerson === 'function') {
      var labeled = labelPerson(name);
      if (labeled) return labeled;
    }
    return name;
  }

  /**
   * @param {object} report
   * @param {{labelPerson?: function(string): string}} [opts]
   */
  function formatFullText(report, opts) {
    opts = opts || {};
    var labelPerson = opts.labelPerson;
    if (!report) return '';
    if (!report.changed) {
      return '【次回活動までの道具入れ替え】\n変更なし（すべて前回と同じ担当・' + report.kept + '点）。';
    }
    var lines = [];
    lines.push('【次回活動までの道具入れ替え案内】');
    lines.push('次回活動日までに、下記の保護者間で道具を受け渡してください。');
    lines.push('維持 ' + report.kept + ' 点／変更 ' + report.changed + ' 点');
    lines.push('');
    if (report.swapGroups && report.swapGroups.length) {
      lines.push('■ 2名で道具を交換（お互い渡し合う）');
      report.swapGroups.forEach(function (g, idx) {
        var a = withPersonLabel(g.pA, labelPerson);
        var b = withPersonLabel(g.pB, labelPerson);
        lines.push((idx + 1) + '. ' + a + ' ⇔ ' + b);
        (g.tools || []).forEach(function (t) {
          lines.push('   ' + a + ' が持つ「' + t.toolA + '」→ ' + b + ' へ');
          lines.push('   ' + b + ' が持つ「' + t.toolB + '」→ ' + a + ' へ');
        });
      });
      lines.push('');
    }
    if (report.others && report.others.length) {
      lines.push('■ その他の受け渡し（一方向）');
      report.others.forEach(function (o) {
        var prev = o.prev ? withPersonLabel(o.prev, labelPerson) : '';
        var curr = o.curr ? withPersonLabel(o.curr, labelPerson) : '';
        if (o.prev && o.curr) {
          lines.push('・「' + o.tn + '」 ' + prev + ' → ' + curr);
        } else if (o.prev && !o.curr) {
          lines.push('・「' + o.tn + '」 ' + prev + ' → 未割当');
        } else if (!o.prev && o.curr) {
          lines.push('・「' + o.tn + '」 → ' + curr + '（新規担当）');
        }
      });
      lines.push('');
    }
    if (report.peopleMustChange && report.peopleMustChange.length) {
      lines.push('■ 持ち帰り内容が変わる方（' + report.peopleMustChange.length + '名）');
      report.peopleMustChange.forEach(function (p) {
        var before = report.prevBy[p] || [];
        var after = report.curBy[p] || [];
        var bStr = before.length ? before.join('、') : '（なし）';
        var aStr = after.length ? after.join('、') : '（なし）';
        lines.push('・' + withPersonLabel(p, labelPerson));
        lines.push('   いま持っている：' + bStr);
        lines.push('   次回担当：' + aStr);
      });
    }
    return lines.join('\n');
  }

  /**
   * @param {object} report
   * @param {{esc: function(string): string, labelPerson?: function(string): string}} opts
   */
  function renderHtml(report, opts) {
    opts = opts || {};
    var esc = opts.esc || function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    };
    var labelPerson = opts.labelPerson;
    if (!report) return '';

    var html = '';
    html += '<div class="tcb-swap-list">';
    html += '<div class="tcb-swap-list-hd">入れ替えリスト</div>';
    html += '<p class="tcb-swap-list-lead">次回活動日までに、下記の保護者間で道具を受け渡してください（試合組⇔練習組の入れ替え含む）。</p>';
    html += '<div class="tcb-swap-list-meta">維持 <strong>' + esc(String(report.kept)) + '</strong> 点';
    if (report.changed) {
      html += '／変更 <strong>' + esc(String(report.changed)) + '</strong> 点';
    }
    html += '</div>';

    if (!report.changed) {
      html += '<p class="tcb-swap-list-empty">変更はありません。前回と同じ担当のままです。</p>';
      html += '</div>';
      return html;
    }

    if (report.swapGroups && report.swapGroups.length) {
      html += '<div class="tcb-swap-list-sec">';
      html += '<div class="tcb-swap-list-sec-hd">2名で道具を交換（' + esc(String(report.swapGroups.length)) + '組）</div>';
      html += '<ol class="tcb-swap-list-pairs">';
      report.swapGroups.forEach(function (g) {
        var a = withPersonLabel(g.pA, labelPerson);
        var b = withPersonLabel(g.pB, labelPerson);
        html += '<li class="tcb-swap-list-pair">';
        html += '<div class="tcb-swap-list-pair-who"><span class="tcb-swap-list-name">' + esc(a) + '</span>';
        html += ' <span class="tcb-swap-list-arrow" aria-hidden="true">⇔</span> ';
        html += '<span class="tcb-swap-list-name">' + esc(b) + '</span></div>';
        html += '<ul class="tcb-swap-list-tools">';
        (g.tools || []).forEach(function (t) {
          html += '<li><span class="tcb-swap-list-from">' + esc(a) + '</span> が持つ「<strong>' + esc(t.toolA) + '</strong>」→ <span class="tcb-swap-list-to">' + esc(b) + '</span></li>';
          html += '<li><span class="tcb-swap-list-from">' + esc(b) + '</span> が持つ「<strong>' + esc(t.toolB) + '</strong>」→ <span class="tcb-swap-list-to">' + esc(a) + '</span></li>';
        });
        html += '</ul></li>';
      });
      html += '</ol></div>';
    }

    if (report.others && report.others.length) {
      html += '<div class="tcb-swap-list-sec">';
      html += '<div class="tcb-swap-list-sec-hd">その他の受け渡し（一方向）</div>';
      html += '<ul class="tcb-swap-list-others">';
      report.others.forEach(function (o) {
        var prev = o.prev ? withPersonLabel(o.prev, labelPerson) : '';
        var curr = o.curr ? withPersonLabel(o.curr, labelPerson) : '';
        html += '<li>';
        if (o.prev && o.curr) {
          html += '「<strong>' + esc(o.tn) + '</strong>」 ' + esc(prev) + ' → ' + esc(curr);
        } else if (o.prev && !o.curr) {
          html += '「<strong>' + esc(o.tn) + '</strong>」 ' + esc(prev) + ' → 未割当';
        } else if (!o.prev && o.curr) {
          html += '「<strong>' + esc(o.tn) + '</strong>」 → ' + esc(curr) + '（新規担当）';
        }
        html += '</li>';
      });
      html += '</ul></div>';
    }

    if (report.peopleMustChange && report.peopleMustChange.length) {
      html += '<div class="tcb-swap-list-sec tcb-swap-list-sec-people">';
      html += '<div class="tcb-swap-list-sec-hd">持ち帰りが変わる方（' + esc(String(report.peopleMustChange.length)) + '名）</div>';
      html += '<ul class="tcb-swap-list-people">';
      report.peopleMustChange.forEach(function (p) {
        var before = report.prevBy[p] || [];
        var after = report.curBy[p] || [];
        var bStr = before.length ? before.join('、') : '（なし）';
        var aStr = after.length ? after.join('、') : '（なし）';
        html += '<li><div class="tcb-swap-list-pname">' + esc(withPersonLabel(p, labelPerson)) + '</div>';
        html += '<div class="tcb-swap-list-pchg">いま：' + esc(bStr) + '</div>';
        html += '<div class="tcb-swap-list-pchg">次回：' + esc(aStr) + '</div></li>';
      });
      html += '</ul></div>';
    }

    html += '</div>';
    return html;
  }

  global.TCB_SWAP_LIST = {
    formatFullText: formatFullText,
    renderHtml: renderHtml
  };
})(typeof window !== 'undefined' ? window : this);
