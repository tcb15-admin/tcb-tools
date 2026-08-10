/**
 * 日本の祝日・週末ユーティリティ（出欠の仮日付登録用）
 * 法律の固定日＋ハッピーマンデー＋春分／秋分の近似式＋振替休日／国民の休日
 */
(function (global) {
  'use strict';

  function pad2(n){ return (n < 10 ? '0' : '') + n; }

  function toISO(d){
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseISO(iso){
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfLocalDay(d){
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n){
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  /** 第 n 月曜（month: 1-12） */
  function nthMonday(year, month, n){
    var first = new Date(year, month - 1, 1);
    var dow = first.getDay(); // 0=日
    var firstMon = 1 + ((8 - dow) % 7);
    return firstMon + (n - 1) * 7;
  }

  function springEquinoxDay(y){
    // 1980–2099 向け内閣府近似（一般的な実装）
    if (y < 1980 || y > 2099) return 20;
    return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  }

  function autumnEquinoxDay(y){
    if (y < 1980 || y > 2099) return 23;
    return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  }

  /** その年の祝日マップ { 'YYYY-MM-DD': 名称 }（振替・国民の休日含む） */
  function holidaysForYear(year){
    var map = {};
    function put(m, d, name){
      if (d < 1 || d > 31) return;
      var iso = year + '-' + pad2(m) + '-' + pad2(d);
      var dt = parseISO(iso);
      if (!dt || dt.getMonth() + 1 !== m) return;
      map[iso] = name;
    }

    put(1, 1, '元日');
    put(1, nthMonday(year, 1, 2), '成人の日');
    put(2, 11, '建国記念の日');
    if (year >= 2020) put(2, 23, '天皇誕生日');
    put(3, springEquinoxDay(year), '春分の日');
    put(4, 29, '昭和の日');
    put(5, 3, '憲法記念日');
    put(5, 4, 'みどりの日');
    put(5, 5, 'こどもの日');
    if (year >= 2020) put(7, nthMonday(year, 7, 3), '海の日');
    put(8, 11, '山の日');
    put(9, nthMonday(year, 9, 3), '敬老の日');
    put(9, autumnEquinoxDay(year), '秋分の日');
    if (year >= 2020) put(10, nthMonday(year, 10, 2), 'スポーツの日');
    put(11, 3, '文化の日');
    put(11, 23, '勤労感謝の日');

    // 振替休日: 日曜の祝日 → 直後の平日（祝日でない日）
    var isos = Object.keys(map).sort();
    var i, iso, d, cur, key;
    for (i = 0; i < isos.length; i++) {
      iso = isos[i];
      d = parseISO(iso);
      if (!d || d.getDay() !== 0) continue;
      cur = addDays(d, 1);
      while (true) {
        key = toISO(cur);
        if (!map[key]) {
          map[key] = '振替休日';
          break;
        }
        cur = addDays(cur, 1);
      }
    }

    // 国民の休日: 祝日に挟まれた平日
    var yStart = new Date(year, 0, 1);
    var yEnd = new Date(year, 11, 31);
    for (cur = yStart; cur <= yEnd; cur = addDays(cur, 1)) {
      key = toISO(cur);
      if (map[key]) continue;
      var prev = toISO(addDays(cur, -1));
      var next = toISO(addDays(cur, 1));
      if (map[prev] && map[next] && cur.getDay() !== 0) {
        map[key] = '国民の休日';
      }
    }

    return map;
  }

  var holidayCache = {};
  function holidayMap(year){
    if (!holidayCache[year]) holidayCache[year] = holidaysForYear(year);
    return holidayCache[year];
  }

  function holidayName(iso){
    var d = parseISO(iso);
    if (!d) return '';
    return holidayMap(d.getFullYear())[iso] || '';
  }

  function isHoliday(iso){
    return !!holidayName(iso);
  }

  /** 基準日以降（当日含む）の次の土曜 */
  function nextSaturday(fromDate){
    var d = startOfLocalDay(fromDate || new Date());
    var add = (6 - d.getDay() + 7) % 7;
    return addDays(d, add);
  }

  /** 基準日以降（当日含む）の次の日曜 */
  function nextSunday(fromDate){
    var d = startOfLocalDay(fromDate || new Date());
    var add = (0 - d.getDay() + 7) % 7;
    return addDays(d, add);
  }

  /** 基準日以降（当日含む）の次の祝日 */
  function nextHoliday(fromDate){
    var d = startOfLocalDay(fromDate || new Date());
    var y = d.getFullYear();
    var guard = 0;
    while (guard++ < 800) {
      var iso = toISO(d);
      if (holidayMap(d.getFullYear())[iso]) return d;
      d = addDays(d, 1);
      if (d.getFullYear() > y + 2) break;
    }
    return null;
  }

  /**
   * 直近の土曜・日曜・祝日を仮登録用に返す（重複除去・昇順）。
   * @returns {{iso:string, label:string, kindHint:string}[]}
   */
  function nextSatSunHolidayDates(fromDate){
    var base = startOfLocalDay(fromDate || new Date());
    var sat = nextSaturday(base);
    var sun = nextSunday(base);
    var hol = nextHoliday(base);
    var byIso = {};

    function add(d, fallbackLabel){
      if (!d) return;
      var iso = toISO(d);
      var hName = holidayName(iso);
      var wd = d.getDay();
      var label = hName || fallbackLabel || '';
      if (wd === 6 && !hName) label = '土曜';
      if (wd === 0 && !hName) label = '日曜';
      byIso[iso] = {
        iso: iso,
        label: label,
        kindHint: 'practice',
        holidayName: hName || '',
        weekday: wd
      };
    }

    add(sat, '土曜');
    add(sun, '日曜');
    add(hol, '祝日');

    return Object.keys(byIso).sort().map(function (k) { return byIso[k]; });
  }

  /** YYYY-MM-DD[] → 「8月15日、16日、17日」形式（当年外や年跨ぎのみ年を付与） */
  function formatDatesJa(isos){
    var list = (isos || []).map(parseISO).filter(Boolean);
    list.sort(function (a, b) { return a - b; });
    if (!list.length) return '';
    var thisYear = (new Date()).getFullYear();
    var multiYear = list[list.length - 1].getFullYear() !== list[0].getFullYear();
    var out = [];
    var prevMonth = null;
    var prevYear = null;
    list.forEach(function (d) {
      var y = d.getFullYear();
      var m = d.getMonth() + 1;
      var day = d.getDate();
      var needYear = multiYear || y !== thisYear;
      if (needYear && prevYear !== y) {
        out.push(y + '年' + m + '月' + day + '日');
        prevYear = y;
        prevMonth = m;
      } else if (prevMonth !== m) {
        out.push(m + '月' + day + '日');
        prevMonth = m;
        prevYear = y;
      } else {
        out.push(day + '日');
      }
    });
    return out.join('、');
  }

  global.TCB_AttCalendar = {
    toISO: toISO,
    parseISO: parseISO,
    holidayName: holidayName,
    isHoliday: isHoliday,
    nextSaturday: nextSaturday,
    nextSunday: nextSunday,
    nextHoliday: nextHoliday,
    nextSatSunHolidayDates: nextSatSunHolidayDates,
    formatDatesJa: formatDatesJa
  };
})(typeof window !== 'undefined' ? window : this);
