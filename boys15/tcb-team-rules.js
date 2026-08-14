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
    return 'other';
  }

  function prevTeamOf(toolName, opts) {
    var map = opts.prevMap || {};
    var person = map[toolName];
    if (!person) return null;
    var ptm = opts.prevTmMap || {};
    var cur = opts.memberTeam || {};
    var g = ptm[person] || (typeof cur === 'function' ? cur(person) : cur[person]) || null;
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
    /*  sticky 過多で目標超過した場合は強制移動（ルール優先） */
    function moveOne(fromArr, toArr, toTeam) {
      for (var i = fromArr.length - 1; i >= 0; i--) {
        var t = fromArr[i];
        fromArr.splice(i, 1);
        toArr.push(t);
        out[t.name] = toTeam;
        return true;
      }
      return false;
    }
    while (a.length > targetA && b.length < targetB) moveOne(a, b, 'B');
    while (b.length > targetB && a.length < targetA) moveOne(b, a, 'A');
  }

  /** グループごとに1点。①→A寄り・②→B寄り、衝突時は sticky を崩して分散 */
  function assignOneEach(tools, out, opts) {
    var list = tools.slice().sort(sortByCircled);
    if (!list.length) return;
    if (list.length === 1) {
      out[list[0].name] = prevTeamOf(list[0].name, opts) || 'A';
      return;
    }
    /* 先頭2点を A/B に振る（3点以上は余りを sticky→交互） */
    var used = { A: 0, B: 0 };
    list.forEach(function (t, idx) {
      var prefer = idx === 0 ? 'A' : idx === 1 ? 'B' : null;
      var pt = prevTeamOf(t.name, opts);
      var pick = null;
      if (prefer && used[prefer] === 0) {
        /* もう一方が sticky で同じ側を欲しがる場合でも、先頭2は prefer を優先 */
        pick = prefer;
      } else if (pt && used[pt] === 0 && idx >= 2) {
        pick = pt;
      } else if (pt && used[pt] === 0 && prefer === pt) {
        pick = pt;
      } else if (used.A === 0) pick = 'A';
      else if (used.B === 0) pick = 'B';
      else pick = used.A <= used.B ? 'A' : 'B';
      out[t.name] = pick;
      used[pick]++;
    });
    /* 先頭2が同じ側に寄った場合の補正 */
    if (list.length >= 2 && out[list[0].name] === out[list[1].name]) {
      out[list[0].name] = 'A';
      out[list[1].name] = 'B';
    }
  }

  function assignStickyOr(tools, out, opts, fallback) {
    tools.forEach(function (t) {
      out[t.name] = prevTeamOf(t.name, opts) || fallback;
    });
  }

  function assignFixedSide(tools, out, side) {
    tools.forEach(function (t) {
      out[t.name] = side;
    });
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
   *   practiceTeam?: 'A'|'B'
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

    var by = {};
    (tools || []).forEach(function (t) {
      if (!t || !t.name) return;
      var f = classify(t.name);
      if (!by[f]) by[f] = [];
      by[f].push(t);
    });

    var twoGroupSame = pat === 'ryoho' || (pat === 'renshu' && split);
    var kata = pat === 'kata';

    if (by.tarp) assignHalfSplit(by.tarp, out, opts);
    if (by.zatsukago) assignOneEach(by.zatsukago, out, opts);
    if (by.pitcherBall) assignOneEach(by.pitcherBall, out, opts);
    if (by.umpire) assignOneEach(by.umpire, out, opts);

    if (by.knockIn || by.knockOut) {
      if (kata) {
        if (by.knockIn) assignFixedSide(by.knockIn, out, matchT);
        if (by.knockOut) assignFixedSide(by.knockOut, out, matchT);
      } else {
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
          out[inTool.name] = inSide || 'A';
        } else if (outTool) {
          out[outTool.name] = outSide || 'B';
        }
      }
    }

    if (by.batCase) {
      if (kata) assignFixedSide(by.batCase, out, matchT);
      else assignStickyOr(by.batCase, out, opts, 'A');
    }
    if (by.longShortBat) {
      if (kata) assignFixedSide(by.longShortBat, out, matchT);
      else assignStickyOr(by.longShortBat, out, opts, 'A');
    }
    if (by.base) {
      if (kata) assignFixedSide(by.base, out, pracT);
      else assignStickyOr(by.base, out, opts, 'B');
    }
    if (by.training) {
      if (kata) assignFixedSide(by.training, out, pracT);
      else assignStickyOr(by.training, out, opts, 'B');
    }
    if (by.jumpRope) {
      if (kata) assignFixedSide(by.jumpRope, out, pracT);
      else assignStickyOr(by.jumpRope, out, opts, 'B');
    }
    if (by.practiceBall) {
      if (kata) assignFixedSide(by.practiceBall, out, pracT);
      else assignHalfSplit(by.practiceBall, out, opts);
    }
    if (by.other) {
      /* ルール未定義：前回保有グループ優先、なければ A */
      assignStickyOr(by.other, out, opts, 'A');
    }

    /* 保険：未割当があれば A */
    (tools || []).forEach(function (t) {
      if (t && t.name && (out[t.name] !== 'A' && out[t.name] !== 'B')) out[t.name] = 'A';
    });
    return out;
  }

  global.TCB_TEAM_RULES = {
    classify: classify,
    assignTeams: assignTeams,
    toolPrefixAndCircled: toolPrefixAndCircled
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
