/* 次回のグループ分け（任意）：今の保有の持ち帰り先先読み用
   両方の班に1名以上いるときだけ有効。クリアすれば先読みしない。 */
(function (global) {
  'use strict';

  var ctx = null;
  var nextTmMap = {};
  var touched = false;

  function cloneMap(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) {
      if (o[k] === 'A' || o[k] === 'B') out[k] = o[k];
    });
    return out;
  }

  function memberList() {
    if (ctx && typeof ctx.listMembers === 'function') return ctx.listMembers() || [];
    return [];
  }

  function ensureKeys() {
    memberList().forEach(function (m) {
      if (!m || !m.name) return;
      if (nextTmMap[m.name] !== 'A' && nextTmMap[m.name] !== 'B') nextTmMap[m.name] = 'B';
    });
  }

  function counts() {
    var a = 0, b = 0;
    Object.keys(nextTmMap).forEach(function (n) {
      if (nextTmMap[n] === 'A') a++;
      else if (nextTmMap[n] === 'B') b++;
    });
    return { a: a, b: b };
  }

  function isReady() {
    if (!touched) return false;
    var c = counts();
    return c.a > 0 && c.b > 0;
  }

  function updateStatusUI() {
    var card = document.getElementById('tcb-next-team-card');
    var status = document.getElementById('tcb-next-team-status');
    var cntA = document.getElementById('tcb-next-cntA');
    var cntB = document.getElementById('tcb-next-cntB');
    var show = !!(ctx && typeof ctx.needsTeamUI === 'function' && ctx.needsTeamUI());
    if (card) card.className = 'card tcb-next-team-card' + (show ? ' on' : '');
    if (!show) return;
    var la = (ctx && ctx.getTeamLabelA && ctx.getTeamLabelA()) || 'A組';
    var lb = (ctx && ctx.getTeamLabelB && ctx.getTeamLabelB()) || 'B組';
    var c = counts();
    if (cntA) cntA.textContent = la + ' ' + c.a + '名';
    if (cntB) cntB.textContent = lb + ' ' + c.b + '名';
    if (status) {
      if (isReady()) {
        status.className = 'tcb-next-team-status on';
        status.textContent = '先読みON：持ち帰り担当を、次回も同じ班にいる人へ寄せます。';
      } else {
        status.className = 'tcb-next-team-status';
        status.textContent = touched
          ? '両方の班に1名以上にしてください（未入力の班があると先読みしません）。'
          : '未使用。必要なときだけ、きょうの班からコピーして調整してください。';
      }
    }
  }

  function buildGrid() {
    var g = document.getElementById('tcb-next-tgrid');
    if (!g) return;
    g.innerHTML = '';
    ensureKeys();
    var la = (ctx && ctx.getTeamLabelA && ctx.getTeamLabelA()) || '試合組';
    var lb = (ctx && ctx.getTeamLabelB && ctx.getTeamLabelB()) || '練習組';
    var ex = (ctx && typeof ctx.exSet === 'function') ? (ctx.exSet() || {}) : {};
    memberList().forEach(function (m) {
      if (!m || !m.name) return;
      var tm = nextTmMap[m.name] === 'A' ? 'A' : 'B';
      var isEx = !!ex[m.name];
      var c = document.createElement('div');
      c.className = 'tc2 t' + tm + (isEx ? ' ex' : '');
      if (ctx && typeof ctx.tcHtml === 'function') {
        c.innerHTML = ctx.tcHtml(m, tm, la, lb);
      } else {
        c.textContent = m.name;
      }
      (function (mm, cc) {
        cc.addEventListener('click', function () {
          touched = true;
          nextTmMap[mm.name] = (nextTmMap[mm.name] === 'B') ? 'A' : 'B';
          var nt = nextTmMap[mm.name];
          cc.className = 'tc2 t' + nt + (ex[mm.name] ? ' ex' : '');
          if (ctx && typeof ctx.tcHtml === 'function') {
            cc.innerHTML = ctx.tcHtml(mm, nt, la, lb);
          }
          updateStatusUI();
          if (ctx && typeof ctx.onChange === 'function') ctx.onChange();
        });
      })(m, c);
      g.appendChild(c);
    });
    updateStatusUI();
  }

  function copyFromToday() {
    if (!ctx || typeof ctx.getTodayTmMap !== 'function') return;
    nextTmMap = cloneMap(ctx.getTodayTmMap());
    touched = true;
    ensureKeys();
    buildGrid();
    if (ctx && typeof ctx.onChange === 'function') ctx.onChange();
    if (global.TCB_Feedback) global.TCB_Feedback.toast('きょうの班分けを次回へコピーしました。必要ならタップで修正してください。', 'success');
  }

  function clearAll() {
    nextTmMap = {};
    touched = false;
    buildGrid();
    if (ctx && typeof ctx.onChange === 'function') ctx.onChange();
    if (global.TCB_Feedback) global.TCB_Feedback.toast('次回のグループ分けをクリアしました。先読みは使いません。', 'info');
  }

  /* 割当スコア：値が小さいほど優先（assignMinChangers は符号反転して使う） */
  function preferBoost(name, toolTeam) {
    if (!isReady() || !name || (toolTeam !== 'A' && toolTeam !== 'B')) return 0;
    var nt = nextTmMap[name];
    if (nt === toolTeam) return -12000;
    if (nt === 'A' || nt === 'B') return 9000;
    return 0;
  }

  function init(hooks) {
    ctx = hooks || {};
    var btnCopy = document.getElementById('btn-tcb-next-team-copy');
    if (btnCopy) btnCopy.addEventListener('click', copyFromToday);
    var btnClear = document.getElementById('btn-tcb-next-team-clear');
    if (btnClear) btnClear.addEventListener('click', clearAll);
    buildGrid();
  }

  global.TCB_NextTeam = {
    init: init,
    update: function () { buildGrid(); },
    updateStatusUI: updateStatusUI,
    isReady: isReady,
    getMap: function () { return cloneMap(nextTmMap); },
    preferBoost: preferBoost,
    clear: clearAll
  };
})(typeof window !== 'undefined' ? window : this);
