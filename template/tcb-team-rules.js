/* 道具のグループ振分ルール（活動パターン×道具種別）
 * マスタの kata / ryo / practiceVenue に依存せず、割振り時に A/B を決める。
 * 両方練習（場所分離なし）は呼び出し側でスキップすること。
 */
(function (global) {
  'use strict';

  function toolPrefixAndCircled(name) {
    var s = String(name || '');
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0x2460 && c <= 0x2473) {
        return { prefix: s.slice(0, i), num: c - 0x245F, hasCirc: true };
      }
    }
    return { prefix: s, num: 0, hasCirc: false };
  }

  function sortByCircled(a, b) {
    var pa = toolPrefixAndCircled(a.name);
    var pb = toolPrefixAndCircled(b.name);
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix, 'ja');
    if (pa.num !== pb.num) return pa.num - pb.num;
    return String(a.name).localeCompare(String(b.name), 'ja');
  }

  /** @returns {string|null} family id */
  function classify(name) {
    var n = String(name || '');
    if (/^タープ/.test(n)) return 'tarp';
    if (/^雑カゴ/.test(n)) return 'zatsukago';
    if (/^投手用ボール/.test(n)) return 'pitcherBall';
    if (n === '内野用ノックボール' || n === '内野ノックボール') return 'knockIn';
    if (n === '外野用ノックボール' || n === '外野ノックボール') return 'knockOut';
    if (n === '試合用バットケース') return 'batCase';
    if (/^練習用ボール/.test(n)) return 'practiceBall';
    if (n === 'ベース一式') return 'base';
    if (/^審判道具/.test(n)) return 'umpire';
    if (n === '長尺＆短尺バット' || n === '長尺バット' || n === '短尺バット') return 'longShortBat';
    if (/^トレーニング道具/.test(n)) return 'training';
    if (/^縄跳び/.test(n)) return 'jumpRope';
    if (/^キャッチャー道具/.test(n)) return 'catcher';
    if (/^ストレッチポール/.test(n)) return 'stretchPole';
    return 'other';
  }

  function resolveMemberTeam(person, opts) {
    if (!person) return null;
    var cur = opts.memberTeam;
    var g = typeof cur === 'function' ? cur(person) : (cur && cur[person]);
    return g === 'A' || g === 'B' ? g : null;
  }

  function isFixedTool(t) {
    return !!(t && (t.fixed == 1 || t.fixed === '1' || t.fixed === true) && t.note);
  }

  /**
   * キャッチャー道具：固定担当の所属グループへ。
   * 非固定は前回保有側を優先。前回が無いときだけ、固定が片側に偏っていれば反対側へ振る。
   */
  function assignCatcher(tools, out, opts) {
    var list = tools.slice().sort(sortByCircled);
    var fixedTools = [];
    var freeTools = [];
    list.forEach(function (t) {
      if (isFixedTool(t)) fixedTools.push(t);
      else freeTools.push(t);
    });
    var sides = { A: 0, B: 0 };
    fixedTools.forEach(function (t) {
      var g = resolveMemberTeam(t.note, opts) || prevTeamOf(t.name, opts) || 'A';
      out[t.name] = g;
      sides[g]++;
    });
    var allFixedSame = null;
    if (fixedTools.length && sides.A > 0 && sides.B === 0) allFixedSame = 'A';
    else if (fixedTools.length && sides.B > 0 && sides.A === 0) allFixedSame = 'B';

    freeTools.forEach(function (t, idx) {
      /* 前回保有（試合組が持っている等）を最優先。反対側への強制振りはしない */
      var pt = prevTeamOf(t.name, opts);
      if (pt === 'A' || pt === 'B') {
        out[t.name] = pt;
        sides[pt]++;
        return;
      }
      if (allFixedSame) {
        out[t.name] = allFixedSame === 'A' ? 'B' : 'A';
        sides[out[t.name]]++;
        return;
      }
      if (!fixedTools.length) {
        out[t.name] = (idx % 2 === 0 ? 'A' : 'B');
        sides[out[t.name]]++;
        return;
      }
      out[t.name] = sides.A <= sides.B ? 'A' : 'B';
      sides[out[t.name]]++;
    });
  }

  function prevTeamOf(toolName, opts) {
    var map = opts.prevMap || {};
    var person = map[toolName];
    if (!person) return null;
    /* 前回所持者がいま属する班を優先（人が班移動しても同じ道具を持ち続けられる） */
    var cur = opts.memberTeam;
    var curG = typeof cur === 'function' ? cur(person) : (cur && cur[person]);
    if (curG === 'A' || curG === 'B') return curG;
    var ptm = opts.prevTmMap || {};
    var g = ptm[person] || null;
    return g === 'A' || g === 'B' ? g : null;
  }

  /** 半々。奇数の余り1本は「その道具の前回保有側」。ルール優先で目標本数に合わせる */
  function assignHalfSplit(tools, out, opts) {
    var list = tools.slice().sort(sortByCircled);
    var n = list.length;
    if (!n) return;
    var targetA = Math.floor(n / 2);
    var targetB = Math.floor(n / 2);
    if (n % 2 === 1) {
      var rem = null;
      for (var i = list.length - 1; i >= 0; i--) {
        if (prevTeamOf(list[i].name, opts)) {
          rem = list[i];
          break;
        }
      }
      if (!rem) rem = list[list.length - 1];
      var remSide = prevTeamOf(rem.name, opts) || 'A';
      if (remSide === 'A') targetA++;
      else targetB++;
    }
    var a = [];
    var b = [];
    var pending = [];
    list.forEach(function (t) {
      var pt = prevTeamOf(t.name, opts);
      if (pt === 'A' && a.length < targetA) {
        a.push(t);
        out[t.name] = 'A';
      } else if (pt === 'B' && b.length < targetB) {
        b.push(t);
        out[t.name] = 'B';
      } else {
        pending.push(t);
      }
    });
    pending.forEach(function (t) {
      if (a.length < targetA && (a.length <= b.length || b.length >= targetB)) {
        a.push(t);
        out[t.name] = 'A';
      } else if (b.length < targetB) {
        b.push(t);
        out[t.name] = 'B';
      } else {
        a.push(t);
        out[t.name] = 'A';
      }
    });
    /* sticky 過多で目標超過時は、sticky が弱い／反対側の道具から移す */
    function moveOne(fromArr, toArr, toTeam) {
      var pass, i, t, pt;
      for (pass = 0; pass < 2; pass++) {
        for (i = fromArr.length - 1; i >= 0; i--) {
          t = fromArr[i];
          pt = prevTeamOf(t.name, opts);
          if (pass === 0 && pt && pt !== toTeam) continue;
          fromArr.splice(i, 1);
          toArr.push(t);
          out[t.name] = toTeam;
          return true;
        }
      }
      return false;
    }
    while (a.length > targetA && b.length < targetB) moveOne(a, b, 'B');
    while (b.length > targetB && a.length < targetA) moveOne(b, a, 'A');
  }

  /** グループごとに1点。前回所持者のいまの班を優先し、両方同じ班なら片方だけ反対へ */
  function assignOneEach(tools, out, opts) {
    var list = tools.slice().sort(sortByCircled);
    if (!list.length) return;
    if (list.length === 1) {
      out[list[0].name] = prevTeamOf(list[0].name, opts) || 'A';
      return;
    }
    var used = { A: 0, B: 0 };
    var deferred = [];
    list.forEach(function (t) {
      var pt = prevTeamOf(t.name, opts);
      if (pt && used[pt] === 0) {
        out[t.name] = pt;
        used[pt]++;
      } else {
        deferred.push(t);
      }
    });
    deferred.forEach(function (t) {
      var pick;
      if (used.A === 0) pick = 'A';
      else if (used.B === 0) pick = 'B';
      else pick = used.A <= used.B ? 'A' : 'B';
      out[t.name] = pick;
      used[pick]++;
    });
    if (list.length >= 2 && out[list[0].name] === out[list[1].name]) {
      var keep = out[list[0].name];
      var other = keep === 'A' ? 'B' : 'A';
      var s0 = prevTeamOf(list[0].name, opts);
      var s1 = prevTeamOf(list[1].name, opts);
      if (s0 === keep && s1 !== keep) out[list[1].name] = other;
      else if (s1 === keep && s0 !== keep) out[list[0].name] = other;
      else out[list[1].name] = other;
    }
  }

  function fallbackByHeadcount(opts) {
    var nA = Math.max(0, parseInt(opts.countA, 10) || 0);
    var nB = Math.max(0, parseInt(opts.countB, 10) || 0);
    if (nB > nA) return 'B';
    return 'A';
  }

  function assignStickyOr(tools, out, opts, fallback) {
    var fb = fallback || fallbackByHeadcount(opts);
    tools.forEach(function (t) {
      out[t.name] = prevTeamOf(t.name, opts) || fb;
    });
  }

  /** ルール未定義：前回所持者のいまの班を優先し、残りはグループ人数比で偏りを抑える */
  function assignBalancedByHeadcount(tools, out, opts) {
    var list = tools.slice().sort(sortByCircled);
    var n = list.length;
    if (!n) return;
    var nA = Math.max(0, parseInt(opts.countA, 10) || 0);
    var nB = Math.max(0, parseInt(opts.countB, 10) || 0);
    if (nA + nB <= 0) {
      nA = 1;
      nB = 1;
    }
    var targetA = Math.round(n * nA / (nA + nB));
    if (nA === 0) targetA = 0;
    else if (nB === 0) targetA = n;
    if (n >= 2 && nA > 0 && nB > 0) {
      if (targetA < 1) targetA = 1;
      if (targetA > n - 1) targetA = n - 1;
    }
    var targetB = n - targetA;
    var a = [];
    var b = [];
    var pending = [];
    list.forEach(function (t) {
      var pt = prevTeamOf(t.name, opts);
      if (pt === 'A' && a.length < targetA) {
        a.push(t);
        out[t.name] = 'A';
      } else if (pt === 'B' && b.length < targetB) {
        b.push(t);
        out[t.name] = 'B';
      } else {
        pending.push(t);
      }
    });
    pending.forEach(function (t) {
      if (a.length < targetA && (a.length * nB <= b.length * nA || b.length >= targetB)) {
        a.push(t);
        out[t.name] = 'A';
      } else if (b.length < targetB) {
        b.push(t);
        out[t.name] = 'B';
      } else {
        a.push(t);
        out[t.name] = 'A';
      }
    });
    function moveOne(fromArr, toArr, toTeam) {
      var i, t, pt, pass;
      for (pass = 0; pass < 2; pass++) {
        for (i = fromArr.length - 1; i >= 0; i--) {
          t = fromArr[i];
          pt = prevTeamOf(t.name, opts);
          if (pass === 0 && pt && pt !== toTeam) continue;
          fromArr.splice(i, 1);
          toArr.push(t);
          out[t.name] = toTeam;
          return true;
        }
      }
      return false;
    }
    while (a.length > targetA && b.length < targetB) moveOne(a, b, 'B');
    while (b.length > targetB && a.length < targetA) moveOne(b, a, 'A');
  }

  function assignFixedSide(tools, out, side) {
    tools.forEach(function (t) {
      out[t.name] = side;
    });
  }

  function isMatchTool(t) {
    return !!(t && (t.matchTool == 1 || t.matchTool === '1' || t.matchTool === true));
  }

  /** 入れ替え案：番号（試合道具フラグ）よりグループ間の受け渡し最小を優先する道具種 */
  var HANDOFF_FLEX_FAMILIES = { tarp: 1, zatsukago: 1, pitcherBall: 1, umpire: 1 };

  function isHandoffFlexFamily(name) {
    return !!HANDOFF_FLEX_FAMILIES[classify(name)];
  }

  /**
   * 片方試合はグループ名に関係なく試合組寄せする。
   * 練習試合は試合（オープン戦）。「練習」のみが練習。
   */
  function useKataMatchPracticeSides(opts) {
    return (opts.pat || 'kata') === 'kata';
  }

  /**
   * @param {Array<{name:string}>} tools
   * @param {{
   *   pat: string,
   *   renshuSplit?: boolean,
   *   prevMap?: object,
   *   prevTmMap?: object,
   *   memberTeam?: function(string):string|null|object,
   *   matchTeam?: 'A'|'B',
   *   practiceTeam?: 'A'|'B',
   *   labelA?: string,
   *   labelB?: string,
   *   countA?: number,
   *   countB?: number,
   *   handoffFlexFamilies?: boolean
   * }} opts
   * @returns {Object<string,'A'|'B'>}
   */
  function assignTeams(tools, opts) {
    opts = opts || {};
    var pat = opts.pat || 'kata';
    var split = !!opts.renshuSplit;
    var matchT = opts.matchTeam === 'B' ? 'B' : 'A';
    var pracT = opts.practiceTeam === 'A' ? 'A' : 'B';
    var out = {};
    if (pat === 'renshu' && !split) return out;

    var kata = useKataMatchPracticeSides(opts);
    var fb = fallbackByHeadcount(opts);

    /* 片方試合：試合組へ載せる道具はマスタ「試合道具」のみ。チェックなしは練習組
       入れ替え案（handoffFlexFamilies）：タープ／審判／投手用ボール／雑カゴは
       双方でほぼ均等に割れるなら番号・試合道具フラグを無視し、保有側維持を優先 */
    if (kata) {
      if (opts.handoffFlexFamilies) {
        var byFlex = {};
        (tools || []).forEach(function (t) {
          if (!t || !t.name) return;
          var f = classify(t.name);
          if (!HANDOFF_FLEX_FAMILIES[f]) return;
          if (!byFlex[f]) byFlex[f] = [];
          byFlex[f].push(t);
        });
        if (byFlex.tarp) assignHalfSplit(byFlex.tarp, out, opts);
        if (byFlex.zatsukago) assignOneEach(byFlex.zatsukago, out, opts);
        if (byFlex.pitcherBall) assignOneEach(byFlex.pitcherBall, out, opts);
        if (byFlex.umpire) assignOneEach(byFlex.umpire, out, opts);
      }
      (tools || []).forEach(function (t) {
        if (!t || !t.name) return;
        if (out[t.name] === 'A' || out[t.name] === 'B') return;
        out[t.name] = isMatchTool(t) ? matchT : pracT;
      });
      return out;
    }

    var by = {};
    (tools || []).forEach(function (t) {
      if (!t || !t.name) return;
      var f = classify(t.name);
      if (!by[f]) by[f] = [];
      by[f].push(t);
    });

    if (by.tarp) assignHalfSplit(by.tarp, out, opts);
    if (by.zatsukago) assignOneEach(by.zatsukago, out, opts);
    if (by.pitcherBall) assignOneEach(by.pitcherBall, out, opts);
    if (by.umpire) assignOneEach(by.umpire, out, opts);

    if (by.knockIn || by.knockOut) {
      /* それぞれ別グループ。内野の sticky を優先し、外野は反対側 */
      var inTool = (by.knockIn || [])[0];
      var outTool = (by.knockOut || [])[0];
      var inSide = inTool ? prevTeamOf(inTool.name, opts) : null;
      var outSide = outTool ? prevTeamOf(outTool.name, opts) : null;
      if (inTool && outTool) {
        if (inSide && outSide && inSide !== outSide) {
          out[inTool.name] = inSide;
          out[outTool.name] = outSide;
        } else if (inSide) {
          out[inTool.name] = inSide;
          out[outTool.name] = inSide === 'A' ? 'B' : 'A';
        } else if (outSide) {
          out[outTool.name] = outSide;
          out[inTool.name] = outSide === 'A' ? 'B' : 'A';
        } else {
          out[inTool.name] = 'A';
          out[outTool.name] = 'B';
        }
      } else if (inTool) {
        out[inTool.name] = inSide || fb;
      } else if (outTool) {
        out[outTool.name] = outSide || fb;
      }
    }

    if (by.batCase) assignStickyOr(by.batCase, out, opts, fb);
    if (by.longShortBat) assignStickyOr(by.longShortBat, out, opts, fb);
    if (by.base) assignStickyOr(by.base, out, opts, fb);
    if (by.training) assignStickyOr(by.training, out, opts, fb);
    if (by.jumpRope) assignStickyOr(by.jumpRope, out, opts, fb);
    if (by.practiceBall) assignHalfSplit(by.practiceBall, out, opts);
    if (by.catcher) assignCatcher(by.catcher, out, opts);
    if (by.stretchPole) assignStickyOr(by.stretchPole, out, opts, fb);
    if (by.other) assignBalancedByHeadcount(by.other, out, opts);

    (tools || []).forEach(function (t) {
      if (t && t.name && (out[t.name] !== 'A' && out[t.name] !== 'B')) out[t.name] = fb;
    });
    return out;
  }

  global.TCB_TEAM_RULES = {
    classify: classify,
    assignTeams: assignTeams,
    isMatchTool: isMatchTool,
    isHandoffFlexFamily: isHandoffFlexFamily,
    toolPrefixAndCircled: toolPrefixAndCircled
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
