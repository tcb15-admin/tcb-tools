/* 手直しボード：保護者枠＋道具タイル（タップで移動／入れ替え）
 * 依存なし。呼び出し側が map 変更を onMove / onSwap で処理する。
 */
(function (global) {
  'use strict';

  var selectedTool = null;
  var activeRoot = null;
  var activeOpts = null;

  function esc(s, fn) {
    if (typeof fn === 'function') return fn(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clearSelection() {
    selectedTool = null;
  }

  function findToolMeta(opts, toolName) {
    var list = (opts && opts.tools) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].name === toolName) return list[i];
    }
    return { name: toolName };
  }

  function toolsForPerson(opts, person) {
    var by = (opts && opts.toolsByPerson) || {};
    return by[person] || [];
  }

  function canDropOnPerson(opts, toolName, person) {
    if (!opts || typeof opts.canDropOnPerson !== 'function') return { ok: true };
    try {
      var r = opts.canDropOnPerson(toolName, person);
      if (r === false) return { ok: false, reason: '' };
      if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || '' };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: '' };
    }
  }

  function canSwap(opts, toolA, toolB) {
    if (!opts || typeof opts.canSwap !== 'function') return { ok: true };
    try {
      var r = opts.canSwap(toolA, toolB);
      if (r === false) return { ok: false, reason: '' };
      if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || '' };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: '' };
    }
  }

  function canSelectTool(opts, toolName) {
    var meta = findToolMeta(opts, toolName);
    if (meta.locked) return { ok: false, reason: meta.lockReason || 'この道具は移動できません' };
    if (typeof opts.canSelectTool === 'function') {
      try {
        var r = opts.canSelectTool(toolName);
        if (r === false) return { ok: false, reason: '' };
        if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || '' };
      } catch (e) {
        return { ok: false, reason: '' };
      }
    }
    return { ok: true };
  }

  function splitToolLabel(name) {
    var s = String(name == null ? '' : name);
    /* 末尾の通し番号（①②・半角/全角数字）は常に見せる */
    var m = s.match(/^(.*?)([①-⑳❶-❿⑪-⒇]+|[0-9０-９]+)$/);
    if (m && m[1].length >= 2) {
      return { base: m[1], serial: m[2], full: s };
    }
    return { base: s, serial: '', full: s };
  }

  function renderTile(opts, tool, eFn) {
    var name = tool.name || '';
    var parts = splitToolLabel(name);
    var locked = !!tool.locked;
    var fixed = !!tool.fixed;
    var on = selectedTool === name;
    var cls = 'tcb-ab-tile';
    if (fixed) cls += ' tcb-ab-tile-fixed';
    if (on) cls += ' tcb-ab-tile-on';
    if (selectedTool && selectedTool !== name) {
      var sw = canSwap(opts, selectedTool, name);
      if (sw.ok) cls += ' tcb-ab-tile-swap-target';
    }
    var lockMark = locked ? '<span class="tcb-ab-tile-lock" aria-hidden="true">🔒</span>' : (fixed ? '<span class="tcb-ab-tile-lock" aria-hidden="true">固</span>' : '');
    var labelHtml = parts.serial
      ? ('<span class="tcb-ab-tile-base">' + eFn(parts.base) + '</span>'
        + '<span class="tcb-ab-tile-serial">' + eFn(parts.serial) + '</span>')
      : ('<span class="tcb-ab-tile-base">' + eFn(parts.base) + '</span>');
    return '<button type="button" class="' + cls + '" data-ab-tool="' + eFn(name) + '"'
      + ' title="' + eFn(parts.full) + '"'
      + (locked ? ' disabled aria-disabled="true"' : '')
      + ' aria-label="' + eFn(parts.full) + '"'
      + ' aria-pressed="' + (on ? 'true' : 'false') + '">'
      + lockMark
      + '<span class="tcb-ab-tile-txt">' + labelHtml + '</span>'
      + '</button>';
  }

  function renderPersonCard(opts, member, eFn) {
    var name = member.name || '';
    var tools = toolsForPerson(opts, name);
    var teamCls = member.team === 'A' ? ' tA' : (member.team === 'B' ? ' tB' : '');
    var isGroup = !!member.isGroup;
    var drop = selectedTool ? canDropOnPerson(opts, selectedTool, name) : null;
    var cardCls = 'tcb-ab-card' + teamCls + (isGroup ? ' tcb-ab-group' : '');
    if (selectedTool) {
      var curHolder = ((opts.map || {})[selectedTool]) || '';
      if (curHolder === name) {
        cardCls += ' tcb-ab-drop-no';
      } else if (drop && drop.ok) {
        cardCls += ' tcb-ab-drop-ok';
      } else {
        cardCls += ' tcb-ab-drop-no';
      }
    }
    var badges = '';
    if (isGroup) badges += '<span class="tcb-ab-badge tcb-ab-badge-group">組</span>';
    if (member.remote) badges += '<span class="tcb-ab-badge tcb-ab-badge-remote">遠方</span>';
    if (member.excluded) badges += '<span class="tcb-ab-badge tcb-ab-badge-ex">除外</span>';
    if (!isGroup && tools.length >= 2) badges += '<span class="tcb-ab-badge tcb-ab-badge-multi">複数</span>';
    var toolsHtml = tools.length
      ? tools.map(function (t) { return renderTile(opts, t, eFn); }).join('')
      : '<span class="tcb-ab-empty">（なし）</span>';
    return '<div class="' + cardCls + '" data-ab-person="' + eFn(name) + '" role="button" tabindex="0">'
      + '<div class="tcb-ab-name">' + eFn(member.label || name) + badges + '</div>'
      + '<div class="tcb-ab-tools">' + toolsHtml + '</div>'
      + '</div>';
  }

  function renderStatus(opts, eFn) {
    if (!selectedTool) {
      return '<div class="tcb-ab-status" id="tcb-ab-status" hidden></div>';
    }
    var holder = ((opts.map || {})[selectedTool]) || '';
    var msg = '「' + selectedTool + '」を選択中'
      + (holder ? '（いま：' + holder + '）' : '（未割当）')
      + ' → 移動先の人をタップ／別の道具で入れ替え';
    return '<div class="tcb-ab-status on" id="tcb-ab-status" role="status">'
      + eFn(msg)
      + '<button type="button" class="tcb-ab-cancel" data-ab-cancel="1">取消</button>'
      + '</div>';
  }

  function renderPool(opts, eFn) {
    var un = (opts.unassigned || []);
    var dropOk = !!selectedTool;
    var cls = 'tcb-ab-pool' + (dropOk ? ' tcb-ab-drop-ok' : '');
    var body = un.length
      ? un.map(function (t) { return renderTile(opts, t, eFn); }).join('')
      : '<span class="tcb-ab-pool-empty">未割当はありません</span>';
    return '<div class="tcb-ab-sec">'
      + '<div class="tcb-ab-sec-hd">未割当<span class="tcb-ab-cnt">' + un.length + '</span></div>'
      + '<div class="' + cls + '" data-ab-pool="1">' + body + '</div>'
      + '</div>';
  }

  function renderGroups(opts, eFn) {
    var groups = opts.groups || [];
    if (!groups.length) {
      var flat = opts.members || [];
      return '<div class="tcb-ab-sec">'
        + '<div class="tcb-ab-sec-hd">メンバー<span class="tcb-ab-cnt">' + flat.length + '</span></div>'
        + '<div class="tcb-ab-grid">'
        + flat.map(function (m) { return renderPersonCard(opts, m, eFn); }).join('')
        + '</div></div>';
    }
    return groups.map(function (g) {
      var mems = g.members || [];
      return '<div class="tcb-ab-sec">'
        + '<div class="tcb-ab-sec-hd">' + eFn(g.label || g.id || '') + '<span class="tcb-ab-cnt">' + mems.length + '名</span></div>'
        + '<div class="tcb-ab-grid">'
        + mems.map(function (m) { return renderPersonCard(opts, m, eFn); }).join('')
        + '</div></div>';
    }).join('');
  }

  function paint(root, opts) {
    if (!root) return;
    var eFn = function (s) { return esc(s, opts && opts.esc); };
    var lead = opts.lead || '道具タイルをタップして選び、移動先の人（または未割当）をタップすると移動します。別の道具タイルをタップすると入れ替えます。';
    root.innerHTML = '<div class="tcb-ab">'
      + '<p class="tcb-ab-lead">' + eFn(lead) + '</p>'
      + renderStatus(opts, eFn)
      + renderPool(opts, eFn)
      + renderGroups(opts, eFn)
      + '<p class="tcb-ab-foot">固定担当の道具も手動では動かせます（必要時のみ）。変更は「元に戻す」で取り消せます。</p>'
      + '</div>';
  }

  function holderOf(opts, toolName) {
    return ((opts.map || {})[toolName]) || '';
  }

  function bind(root, opts) {
    root.onclick = function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-ab-cancel]')) {
        clearSelection();
        paint(root, opts);
        bind(root, opts);
        if (opts.onCancel) opts.onCancel();
        return;
      }
      var tile = t.closest('[data-ab-tool]');
      if (tile && !tile.disabled) {
        var toolName = tile.getAttribute('data-ab-tool');
        if (!toolName) return;
        if (selectedTool && selectedTool !== toolName) {
          var sw = canSwap(opts, selectedTool, toolName);
          if (sw.ok) {
            var a = selectedTool;
            clearSelection();
            if (opts.onSwap) opts.onSwap(a, toolName);
            return;
          }
          if (sw.reason && opts.onReject) opts.onReject(sw.reason);
        }
        var sel = canSelectTool(opts, toolName);
        if (!sel.ok) {
          if (sel.reason && opts.onReject) opts.onReject(sel.reason);
          return;
        }
        selectedTool = (selectedTool === toolName) ? null : toolName;
        paint(root, opts);
        bind(root, opts);
        return;
      }
      if (!selectedTool) return;
      var pool = t.closest('[data-ab-pool]');
      if (pool) {
        if (holderOf(opts, selectedTool)) {
          var moved = selectedTool;
          clearSelection();
          if (opts.onMove) opts.onMove(moved, '');
        }
        return;
      }
      var card = t.closest('[data-ab-person]');
      if (card) {
        var person = card.getAttribute('data-ab-person');
        if (!person) return;
        if (holderOf(opts, selectedTool) === person) {
          clearSelection();
          paint(root, opts);
          bind(root, opts);
          return;
        }
        var drop = canDropOnPerson(opts, selectedTool, person);
        if (!drop.ok) {
          if (drop.reason && opts.onReject) opts.onReject(drop.reason);
          return;
        }
        var mv = selectedTool;
        clearSelection();
        if (opts.onMove) opts.onMove(mv, person);
      }
    };
  }

  function mount(root, opts) {
    if (!root) return;
    activeRoot = root;
    activeOpts = opts || {};
    paint(root, activeOpts);
    bind(root, activeOpts);
  }

  function refresh(opts) {
    if (!activeRoot) return;
    if (opts) activeOpts = opts;
    /* 選択中の道具が消えた場合は解除 */
    if (selectedTool) {
      var still = false;
      var tools = (activeOpts && activeOpts.tools) || [];
      for (var i = 0; i < tools.length; i++) {
        if (tools[i] && tools[i].name === selectedTool) { still = true; break; }
      }
      if (!still) clearSelection();
    }
    paint(activeRoot, activeOpts);
    bind(activeRoot, activeOpts);
  }

  function unmount() {
    if (activeRoot) activeRoot.innerHTML = '';
    activeRoot = null;
    activeOpts = null;
    clearSelection();
  }

  global.TCB_AssignBoard = {
    mount: mount,
    refresh: refresh,
    unmount: unmount,
    clearSelection: clearSelection,
    getSelectedTool: function () { return selectedTool; }
  };
})(typeof window !== 'undefined' ? window : this);
