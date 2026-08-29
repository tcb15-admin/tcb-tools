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

  /* 保有者が「人」ではなく【グループ名】の場合 true（一方向の受け渡しをグループ宛てにする用途） */
  function isGroupHolder(opts, name) {
    return !!(opts && typeof opts.isGroupHolder === 'function' && name && opts.isGroupHolder(name));
  }

  function filterPeople(report, opts) {
    var list = report.peopleMustChange || [];
    if (!opts || typeof opts.isGroupHolder !== 'function') return list;
    return list.filter(function (p) { return !isGroupHolder(opts, p); });
  }

  function hasGroupAddressedOther(report, opts) {
    if (!opts || typeof opts.isGroupHolder !== 'function') return false;
    return (report.others || []).some(function (o) { return isGroupHolder(opts, o.curr); });
  }

  var GROUP_ADDR_NOTE = '【グループ名】宛ては、そのグループの誰かに渡ればOKです。受け取る人は次回の割振りで決めます。';

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
      if (hasGroupAddressedOther(report, opts)) {
        lines.push('※' + GROUP_ADDR_NOTE);
      }
      report.others.forEach(function (o) {
        var prev = o.prev ? withPersonLabel(o.prev, labelPerson) : '';
        var curr = o.curr ? withPersonLabel(o.curr, labelPerson) : '';
        var grp = isGroupHolder(opts, o.curr);
        if (o.prev && o.curr) {
          lines.push('・「' + o.tn + '」 ' + prev + ' → ' + curr + (grp ? ' へ' : ''));
        } else if (o.prev && !o.curr) {
          lines.push('・「' + o.tn + '」 ' + prev + ' → 未割当');
        } else if (!o.prev && o.curr) {
          lines.push('・「' + o.tn + '」 → ' + curr + (grp ? ' へ（新規）' : '（新規担当）'));
        }
      });
      lines.push('');
    }
    var people = filterPeople(report, opts);
    if (people.length) {
      lines.push('■ 持ち帰り内容が変わる方（' + people.length + '名）');
      people.forEach(function (p) {
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
    html += '<div class="tcb-swap-list-hd">保有基準との受け渡しリスト</div>';
    html += '<p class="tcb-swap-list-lead">基準にした保有記録と、今回の割振りの差分です（いちからの割振りでは出ません）。括弧の組名は<strong>きょうの班分け</strong>です。試合道具のルールなどで班が変わる場合、練習組⇔試合組の受け渡しに見えます。</p>';
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
      if (hasGroupAddressedOther(report, opts)) {
        html += '<p class="tcb-swap-list-grpnote">' + esc(GROUP_ADDR_NOTE) + '</p>';
      }
      html += '<ul class="tcb-swap-list-others">';
      report.others.forEach(function (o) {
        var prev = o.prev ? withPersonLabel(o.prev, labelPerson) : '';
        var curr = o.curr ? withPersonLabel(o.curr, labelPerson) : '';
        var grp = isGroupHolder(opts, o.curr);
        html += '<li>';
        if (o.prev && o.curr) {
          html += '「<strong>' + esc(o.tn) + '</strong>」 ' + esc(prev) + ' → ' + esc(curr) + (grp ? ' へ' : '');
        } else if (o.prev && !o.curr) {
          html += '「<strong>' + esc(o.tn) + '</strong>」 ' + esc(prev) + ' → 未割当';
        } else if (!o.prev && o.curr) {
          html += '「<strong>' + esc(o.tn) + '</strong>」 → ' + esc(curr) + (grp ? ' へ（新規）' : '（新規担当）');
        }
        html += '</li>';
      });
      html += '</ul></div>';
    }

    var people = filterPeople(report, opts);
    if (people.length) {
      html += '<div class="tcb-swap-list-sec tcb-swap-list-sec-people">';
      html += '<div class="tcb-swap-list-sec-hd">持ち帰りが変わる方（' + esc(String(people.length)) + '名）</div>';
      html += '<ul class="tcb-swap-list-people">';
      people.forEach(function (p) {
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
