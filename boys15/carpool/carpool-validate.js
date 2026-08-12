/**
 * 配車手組みのルールチェック（警告／エラー）
 * - 母運転: 他家の父を乗せない
 * - 父運転: 他家の母を乗せない
 * - 道具車: 原則選手同乗なし（後部が埋まっていたら警告）
 * - スタッフ車: 選手らしき名前がいたら警告
 * - 同一名の重複乗車
 */
(function (global) {
  'use strict';

  function stem(name) {
    var t = String(name || '').trim();
    return t.replace(/(父|母|姉|兄|妹|弟|祖父|祖母|コーチ)$/u, '').trim();
  }

  function roleTag(name) {
    var t = String(name || '').trim();
    if (/母$/.test(t) || /母（/.test(t)) return 'mother';
    if (/父$/.test(t) || /父（/.test(t)) return 'father';
    if (/コーチ/.test(t)) return 'coach';
    return 'other';
  }

  function seatList(row) {
    return [row.driver, row.front, row.rear1, row.rear2, row.rear3, row.rear4, row.rear5]
      .map(function (v) { return String(v || '').trim(); })
      .filter(Boolean);
  }

  function validateCarpoolRows(rows) {
    var errors = [];
    var warnings = [];
    var seen = {};
    (rows || []).forEach(function (r, idx) {
      var no = r.sortOrder || (idx + 1);
      var seats = seatList(r);
      var localDup = {};
      seats.forEach(function (n) {
        if (localDup[n]) {
          errors.push('No.' + no + ' 車内で「' + n + '」が重複');
        }
        localDup[n] = 1;
        if (seen[n]) {
          errors.push('「' + n + '」が No.' + seen[n] + ' と No.' + no + ' で重複');
        } else {
          seen[n] = no;
        }
      });

      var cat = String(r.category || '');
      var driver = String(r.driver || '').trim();
      var dRole = roleTag(driver);
      var dStem = stem(driver);

      if (dRole === 'mother') {
        seats.forEach(function (n) {
          if (n === driver) return;
          if (roleTag(n) === 'father' && stem(n) !== dStem) {
            errors.push('No.' + no + ' 母運転に他家の父「' + n + '」');
          }
        });
      }
      if (dRole === 'father') {
        seats.forEach(function (n) {
          if (n === driver) return;
          if (roleTag(n) === 'mother' && stem(n) !== dStem) {
            errors.push('No.' + no + ' 父運転に他家の母「' + n + '」');
          }
        });
      }

      if (cat.indexOf('道具') >= 0) {
        var rears = [r.rear1, r.rear2, r.rear3, r.rear4, r.rear5].filter(function (v) {
          return String(v || '').trim();
        });
        if (rears.length) {
          warnings.push('No.' + no + ' 道具車に同乗があります（原則選手は乗せない）');
        }
      }

      if (cat.indexOf('スタッフ') >= 0) {
        seats.forEach(function (n) {
          if (n === driver) return;
          var tag = roleTag(n);
          if (tag === 'other' && !/コーチ|監督|MGR|マネ|スタッフ/.test(n) && stem(n).length <= 4) {
            warnings.push('No.' + no + ' スタッフ車に選手らしき「' + n + '」');
          }
        });
      }
    });

    return { errors: unique(errors), warnings: unique(warnings) };
  }

  function unique(arr) {
    var o = {};
    var out = [];
    (arr || []).forEach(function (x) {
      if (!o[x]) { o[x] = 1; out.push(x); }
    });
    return out;
  }

  global.TCB_carpoolValidate = { validateCarpoolRows: validateCarpoolRows, stem: stem, roleTag: roleTag };
})(window);
