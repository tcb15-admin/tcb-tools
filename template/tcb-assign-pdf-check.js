/**
 * 割振結果（画面）と PDF HTML の担当内容を突き合わせる。
 * 見た目（説明文・累計・「なし」行）は比較対象外。人→道具→班のみ。
 */
(function (global) {
  'use strict';

  function sortedCopy(arr) {
    return (arr || []).slice().map(String).sort();
  }

  function personKey(name) {
    return String(name || '').trim();
  }

  /**
   * @param {{mode:string, hideTeam:boolean, groups:Object.<string,{label:string, people:Array.<{name:string, tools:string[]}>}>}} snap
   * @returns {Object.<string,{team:string, tools:string[]}>}
   */
  function flattenSnapshot(snap) {
    var out = {};
    if (!snap || !snap.groups) return out;
    Object.keys(snap.groups).forEach(function (team) {
      var g = snap.groups[team];
      (g.people || []).forEach(function (p) {
        var k = personKey(p.name);
        if (!k) return;
        out[k] = { team: team, tools: sortedCopy(p.tools) };
      });
    });
    return out;
  }

  /**
   * PDF HTML から担当カードを抽出
   * @param {string} html
   * @returns {{mode:string, hideTeam:boolean, groups:Object}}
   */
  function parseHtml(html) {
    var groups = { A: { label: 'A', people: [] }, B: { label: 'B', people: [] }, extra: { label: 'その他', people: [] }, all: { label: '', people: [] } };
    if (!html || typeof DOMParser === 'undefined') {
      return { mode: 'unknown', hideTeam: false, groups: groups };
    }
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var hasTeamStack = !!doc.querySelector('.tcb-print-team-stack');
    var sections = doc.querySelectorAll('.tcb-print-team-section');
    if (hasTeamStack && sections.length) {
      Array.prototype.forEach.call(sections, function (sec) {
        var gh = sec.querySelector('.gh');
        var label = gh ? (gh.textContent || '').trim() : '';
        var team = 'extra';
        if (gh && gh.classList.contains('ghA')) team = 'A';
        else if (gh && gh.classList.contains('ghB')) team = 'B';
        else if (/その他/.test(label)) team = 'extra';
        groups[team].label = label.replace(/（\d+名）\s*$/, '').trim() || groups[team].label;
        var cards = sec.querySelectorAll('.card');
        Array.prototype.forEach.call(cards, function (card) {
          var nameEl = card.querySelector('.person-name');
          var name = nameEl ? (nameEl.textContent || '').trim() : '';
          if (!name) return;
          var tools = [];
          Array.prototype.forEach.call(card.querySelectorAll('.tool-name'), function (tn) {
            var t = (tn.textContent || '').trim();
            if (!t || t === '（なし）') return;
            tools.push(t);
          });
          groups[team].people.push({ name: name, tools: tools });
        });
      });
      return { mode: 'team', hideTeam: false, groups: groups };
    }
    var flatCards = doc.querySelectorAll('.cards .card');
    Array.prototype.forEach.call(flatCards, function (card) {
      var nameEl = card.querySelector('.person-name');
      var name = nameEl ? (nameEl.textContent || '').trim() : '';
      if (!name) return;
      var tools = [];
      Array.prototype.forEach.call(card.querySelectorAll('.tool-name'), function (tn) {
        var t = (tn.textContent || '').trim();
        if (!t || t === '（なし）') return;
        tools.push(t);
      });
      groups.all.people.push({ name: name, tools: tools });
    });
    return { mode: 'flat', hideTeam: true, groups: groups };
  }

  function toolsEqual(a, b) {
    var aa = sortedCopy(a);
    var bb = sortedCopy(b);
    if (aa.length !== bb.length) return false;
    for (var i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
    return true;
  }

  /**
   * @param {object} expectedSnap 画面相当（担当ありのみ）
   * @param {object} pdfSnap parseHtml の結果、または同形
   * @returns {{ok:boolean, diffs:Array, notes:string[], summary:string}}
   */
  function compare(expectedSnap, pdfSnap) {
    var diffs = [];
    var notes = [
      'メンバー別の「（なし）」は PDF に出さない（意図どおり）',
      '累計回数・車両バッジは PDF に出さない（意図どおり）',
      '道具説明文は PDF のみ（担当内容の比較対象外）'
    ];
    var exp = flattenSnapshot(expectedSnap);
    var got = flattenSnapshot(pdfSnap);
    var names = {};
    Object.keys(exp).forEach(function (k) { names[k] = 1; });
    Object.keys(got).forEach(function (k) { names[k] = 1; });

    Object.keys(names).sort().forEach(function (name) {
      var e = exp[name];
      var g = got[name];
      if (!e && g) {
        diffs.push({ type: 'extra_on_pdf', person: name, detail: 'PDFのみ: ' + (g.tools || []).join('、') });
        return;
      }
      if (e && !g) {
        diffs.push({ type: 'missing_on_pdf', person: name, detail: '画面のみ: ' + (e.tools || []).join('、') });
        return;
      }
      if (expectedSnap && expectedSnap.mode === 'team' && !expectedSnap.hideTeam) {
        var et = e.team === 'all' ? '' : e.team;
        var gt = g.team === 'all' ? '' : g.team;
        if (et && gt && et !== gt) {
          diffs.push({ type: 'team_mismatch', person: name, detail: '班 画面=' + et + ' / PDF=' + gt });
        }
      }
      if (!toolsEqual(e.tools, g.tools)) {
        diffs.push({
          type: 'tools_mismatch',
          person: name,
          detail: '道具 画面=[' + e.tools.join('、') + '] / PDF=[' + g.tools.join('、') + ']'
        });
      }
    });

    var ok = diffs.length === 0;
    var summary = ok
      ? '割振結果とPDFの担当内容は一致しています（' + Object.keys(exp).length + '名）'
      : '差異が ' + diffs.length + ' 件あります';
    return { ok: ok, diffs: diffs, notes: notes, summary: summary };
  }

  function formatReport(report) {
    if (!report) return '';
    var lines = [report.summary];
    (report.diffs || []).forEach(function (d, i) {
      lines.push((i + 1) + '. [' + d.type + '] ' + d.person + ' — ' + d.detail);
    });
    if (report.ok && report.notes && report.notes.length) {
      lines.push('（参考）' + report.notes.join(' / '));
    }
    return lines.join('\n');
  }

  global.TCB_AssignPdfCheck = {
    parseHtml: parseHtml,
    compare: compare,
    flatten: flattenSnapshot,
    formatReport: formatReport
  };
})(window);
