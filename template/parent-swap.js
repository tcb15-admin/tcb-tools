/* 保護者確認画面 メインスクリプト
   - 割振り閲覧（当日／前回）＋道具写真の表示
   - 氏名選択で「自分のみ表示」／「全員を表示」トグル
   - あなたの受け渡しナビ（誰から受け取る／誰へ渡す）
   - 各道具の交代報告（申請）＋「担当できない（後任未定）」連絡
   - 受付状況（反映／見送り＋却下理由）の表示と変化ハイライト
   - オフライン時は前回取得分を表示（最終更新時刻つき）
   設定値（APIベースURL）は HTML 側の window.PVSW_CONFIG から受け取る（トークンは埋め込まない）。 */
(function () {
  'use strict';

  var CFG = window.PVSW_CONFIG || {};
  var API_BASE = String(CFG.apiBase || '').replace(/\/+$/, '');
  var COHORT = document.documentElement.getAttribute('data-cohort') || '';
  var NAME_KEY = 'pvsw_name_' + COHORT;
  var CACHE_KEY = 'pvsw_cache_' + COHORT;
  var SEEN_KEY = 'pvsw_seen_' + COHORT;
  var COMMENT_MAX = 100;

  var REJECT_LABELS = {
    D1: '交代は取りやめになった（申請の取り下げ）',
    D2: '内容を確認できない／要再連絡',
    D9: 'その他'
  };
  var ERROR_MESSAGES = {
    stale_from_person: 'この道具の担当は既に更新されています。「最新に更新」でご確認ください。',
    invalid_to_person: '新担当が今回の割振り対象メンバーではありません。',
    invalid_reporter: '連絡者の選択が正しくありません。',
    rate_limited: '短時間に申請が集中しました。少し時間をおいて再度お試しください。',
    duplicate_pending: '同じ内容の申請が既に受付済みです。',
    same_person: '現担当と新担当が同じです。',
    invalid_tool: '対象の道具が見つかりませんでした。最新に更新してお試しください。',
    invalid_day: '対象日が見つかりませんでした。最新に更新してお試しください。',
    not_found_or_revoked: 'この確認用リンクは無効または期限切れです。',
    invalid_share_id: 'この確認用リンクは無効です。'
  };

  var state = {
    data: null,
    shareId: '',
    selectedName: '',
    mode: 'self', // 'self' | 'all'
    offline: false,      // 前回取得分を表示中
    staleReason: '',     // 'offline'（圏外） | 'error'（通信・サーバ障害）
    cachedAt: ''
  };

  /* ========== 汎用ユーティリティ ========== */
  function getShareId() {
    try {
      var u = new URL(location.href);
      var v = (u.searchParams.get('v') || u.searchParams.get('sid') || '').trim();
      if (!v && location.hash) {
        var h = location.hash.replace(/^#/, '');
        var m = h.match(/(?:^|[&?])(?:v|sid)=([0-9a-fA-F]+)/);
        if (m) v = m[1];
      }
      return v;
    } catch (e) { return ''; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
    });
  }
  function teamClass(t) {
    var s = String(t || '').toUpperCase();
    if (s === 'A') return 'A';
    if (s === 'B') return 'B';
    return '';
  }
  function fmtUpdated(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function toast(msg, type) {
    if (window.TCB_Feedback && typeof window.TCB_Feedback.toast === 'function') {
      window.TCB_Feedback.toast(msg, type);
      return;
    }
    window.alert(msg);
  }
  /** 写真URLは https のみ埋め込む（サーバ側でも検証済み） */
  function safeImgUrl(v) {
    var s = String(v || '').trim();
    if (!/^https:\/\//.test(s) || s.length > 500) return '';
    return s;
  }

  function showState(emoji, msg) {
    var el = document.getElementById('pv-content');
    if (el) el.innerHTML = '<div class="pv-state"><span class="pv-state-emoji">' + emoji + '</span>' + msg + '</div>';
  }

  function setNoteVisible(on) {
    var n = document.getElementById('pv-note');
    if (n) n.hidden = !on;
  }

  /* ========== データ由来のヘルパ ========== */
  function jerseyNumFromName(name) {
    var n = parseInt(String(name).split('：')[0], 10);
    return isNaN(n) ? 99999 : n;
  }
  function sortNamesByJerseyAsc(names) {
    return names.slice().sort(function (a, b) {
      var na = jerseyNumFromName(a), nb = jerseyNumFromName(b);
      if (na !== nb) return na - nb;
      return a.localeCompare(b, 'ja');
    });
  }
  function allPersonNames(data) {
    var set = {};
    (data.days || []).forEach(function (d) {
      (d.items || []).forEach(function (it) {
        var p = String(it.person || '').trim();
        if (p) set[p] = true;
      });
    });
    return sortNamesByJerseyAsc(Object.keys(set));
  }
  function primaryDay(data) {
    var days = (data && data.days) || [];
    return days.filter(function (d) { return String(d.role || '') === 'today'; })[0] || days[0] || null;
  }
  function dayByRole(data, role) {
    var days = (data && data.days) || [];
    return days.filter(function (d) { return String(d.role || '') === role; })[0] || null;
  }
  /** items から 氏名→班（A/B） を推定（班またぎ注意の判定用） */
  function personTeamMap(day) {
    var map = {};
    (day.items || []).forEach(function (it) {
      var p = String(it.person || '').trim();
      var t = String(it.team || '').toUpperCase();
      if (p && (t === 'A' || t === 'B') && !map[p]) map[p] = t;
    });
    return map;
  }
  /** 道具→担当者 のマップ */
  function toolHolderMap(day) {
    var map = {};
    ((day && day.items) || []).forEach(function (it) {
      var tool = String(it.tool || '').trim();
      var p = String(it.person || '').trim();
      if (tool && p) map[tool] = p;
    });
    return map;
  }

  /* ========== 受け渡しナビ（あなたが 誰から受け取り／誰へ渡すか） ========== */
  function renderHandoffNav() {
    var me = state.selectedName;
    if (!me) return '';
    var today = dayByRole(state.data, 'today');
    var prev = dayByRole(state.data, 'prev');
    if (!today || !prev) return '';
    var tMap = toolHolderMap(today);
    var pMap = toolHolderMap(prev);
    var receive = [], give = [], keep = [];
    Object.keys(tMap).forEach(function (tool) {
      if (tMap[tool] !== me) return;
      if (pMap[tool] === me) keep.push(tool);
      else if (pMap[tool]) receive.push({ tool: tool, from: pMap[tool] });
      else receive.push({ tool: tool, from: '' });
    });
    Object.keys(pMap).forEach(function (tool) {
      if (pMap[tool] !== me) return;
      if (tMap[tool] && tMap[tool] !== me) give.push({ tool: tool, to: tMap[tool] });
      else if (!tMap[tool]) give.push({ tool: tool, to: '' });
    });
    if (!receive.length && !give.length && !keep.length) return '';

    var html = '<div class="pvsw-handoff"><div class="pvsw-handoff-title">&#128257; あなたの受け渡し（' + esc(today.label || '当日') + '）</div>';
    if (receive.length) {
      html += '<div class="pvsw-handoff-group"><span class="pvsw-handoff-tag pvsw-ho-in">受け取る</span><ul class="pvsw-handoff-list">';
      receive.forEach(function (r) {
        html += '<li>「' + esc(r.tool) + '」'
          + (r.from ? '<strong>' + esc(r.from) + '</strong> さんから' : '<span class="pvsw-handoff-note">（前回の担当なし。受け取り元は当日ご確認ください）</span>')
          + '</li>';
      });
      html += '</ul></div>';
    }
    if (give.length) {
      html += '<div class="pvsw-handoff-group"><span class="pvsw-handoff-tag pvsw-ho-out">渡す</span><ul class="pvsw-handoff-list">';
      give.forEach(function (g) {
        html += '<li>「' + esc(g.tool) + '」'
          + (g.to ? '<strong>' + esc(g.to) + '</strong> さんへ' : '<span class="pvsw-handoff-note">（次の担当は未定。道具担当者の案内をお待ちください）</span>')
          + '</li>';
      });
      html += '</ul></div>';
    }
    if (keep.length) {
      html += '<div class="pvsw-handoff-group"><span class="pvsw-handoff-tag pvsw-ho-keep">継続</span>'
        + '<span class="pvsw-handoff-keep">' + keep.map(function (t) { return '「' + esc(t) + '」'; }).join('') + ' は引き続きあなたの担当です。</span></div>';
    }
    html += '</div>';
    return html;
  }

  /* ========== 描画 ========== */
  function memberOptionsHtml(members, excludeName, selectedValue) {
    var html = '<option value="">—</option>';
    (members || []).forEach(function (m) {
      var name = String(m.name || '');
      if (!name || name === excludeName) return;
      var label = name + (m.ocha ? '（当番）' : '');
      var sel = (selectedValue && selectedValue === name) ? ' selected' : '';
      html += '<option value="' + esc(name) + '"' + sel + '>' + esc(label) + '</option>';
    });
    return html;
  }

  function renderToolSwapForm(day, tool, fromPerson) {
    var members = Array.isArray(day.members) ? day.members : [];
    if (!members.length) return '';
    var reporterOpts = memberOptionsHtml(members, '', state.selectedName);
    return ''
      + '<div class="pvsw-form" hidden>'
      + '<div class="pvsw-main">'
      + '<div class="pvsw-field pvsw-kind-field">'
      + '<label class="pvsw-kind-opt"><input type="radio" name="pvsw-kind-' + esc(day.role || '') + '-' + esc(tool) + '" class="pvsw-kind" value="swap" checked>交代先が決まっている</label>'
      + '<label class="pvsw-kind-opt"><input type="radio" name="pvsw-kind-' + esc(day.role || '') + '-' + esc(tool) + '" class="pvsw-kind" value="unavailable">担当できる人がまだ決まっていない</label>'
      + '</div>'
      + '<div class="pvsw-field pvsw-to-field"><label class="pvsw-label">新担当（交代後の担当）</label>'
      + '<select class="pvsw-select pvsw-to">' + memberOptionsHtml(members, fromPerson, '') + '</select></div>'
      + '<div class="pvsw-unav-note" hidden>後任が未定のまま「担当できない」を道具担当者へ連絡します。調整は道具担当者が行います。</div>'
      + '<div class="pvsw-warn" hidden></div>'
      + '<div class="pvsw-field"><label class="pvsw-label">コメント（任意・' + COMMENT_MAX + '字まで）</label>'
      + '<textarea class="pvsw-comment" maxlength="' + COMMENT_MAX + '" rows="2" placeholder="必要に応じてご記入ください"></textarea>'
      + '<span class="pvsw-counter">0/' + COMMENT_MAX + '</span></div>'
      + '<div class="pvsw-field"><label class="pvsw-label">連絡者（任意）</label>'
      + '<select class="pvsw-select pvsw-reporter">' + reporterOpts + '</select></div>'
      + '<div class="pvsw-btns">'
      + '<button type="button" class="pvsw-apply" disabled>この内容で申請</button>'
      + '<button type="button" class="pvsw-cancel">やめる</button>'
      + '</div>'
      + '</div>'
      + '<div class="pvsw-confirm" hidden>'
      + '<div class="pvsw-confirm-text"></div>'
      + '<div class="pvsw-btns">'
      + '<button type="button" class="pvsw-confirm-yes">はい、申請する</button>'
      + '<button type="button" class="pvsw-confirm-no">戻る</button>'
      + '</div>'
      + '</div>'
      + '<div class="pvsw-result" hidden></div>'
      + '</div>';
  }

  function renderPersonCard(day, person, info, isMe) {
    var tc = teamClass(info.team);
    var tagTxt = info.teamLabel || (info.team ? (info.team + '組') : '');
    var meCls = isMe ? ' pvsw-me' : '';
    var html = '<div class="pv-person' + meCls + '">'
      + '<div class="pv-person-name">' + esc(person)
      + (isMe ? '<span class="pvsw-me-badge">あなた</span>' : '')
      + (tagTxt ? '<span class="pv-team-tag ' + tc + '">' + esc(tagTxt) + '</span>' : '')
      + '</div><ul class="pv-tools">';
    info.tools.forEach(function (t) {
      var img = safeImgUrl(t.img);
      html += '<li class="pv-tool" data-tool="' + esc(t.tool) + '" data-from="' + esc(person) + '" data-daykey="' + esc(day.role || '') + '">'
        + '<div class="pvsw-tool-line">'
        + (img ? '<img class="pvsw-tool-img" src="' + esc(img) + '" alt="' + esc(t.tool) + 'の写真" loading="lazy" data-imgurl="' + esc(img) + '">' : '')
        + '<span>' + esc(t.tool)
        + (t.desc ? '<span class="pv-tool-desc">' + esc(t.desc) + '</span>' : '')
        + '</span></div>';
      if (Array.isArray(day.members) && day.members.length) {
        html += '<div><button type="button" class="pvsw-open">交代・担当できない連絡</button></div>'
          + renderToolSwapForm(day, t.tool, person);
      }
      html += '</li>';
    });
    html += '</ul></div>';
    return html;
  }

  function renderDay(day, idx) {
    var items = Array.isArray(day.items) ? day.items : [];
    var byPerson = {};
    var order = [];
    items.forEach(function (it) {
      var person = String(it.person || '').trim();
      if (!person) return;
      if (!byPerson[person]) { byPerson[person] = { team: it.team || '', teamLabel: it.teamLabel || '', tools: [] }; order.push(person); }
      if (it.team && !byPerson[person].team) byPerson[person].team = it.team;
      if (it.teamLabel && !byPerson[person].teamLabel) byPerson[person].teamLabel = it.teamLabel;
      byPerson[person].tools.push({ tool: it.tool || '', desc: it.desc || '', img: it.img || '' });
    });
    order.sort(function (a, b) {
      var na = jerseyNumFromName(a), nb = jerseyNumFromName(b);
      if (na !== nb) return na - nb;
      return a.localeCompare(b, 'ja');
    });

    var role = day.role || (idx === 0 ? 'today' : 'prev');
    var isToday = role === 'today';
    var badge = isToday
      ? '<span class="pv-day-badge pv-day-badge-today">当日</span>'
      : '<span class="pv-day-badge prev">前回</span>';
    var html = '<div class="pv-card' + (isToday ? ' pv-card-today' : ' pv-card-prev') + '">'
      + '<div class="pv-day-head">' + badge
      + '<span class="pv-day-label">' + esc(day.label || ('活動日 ' + (idx + 1))) + '</span>'
      + (day.date ? '<span class="pv-day-date">' + esc(day.date) + '</span>' : '')
      + '</div>';

    var shownNames = order;
    if (state.mode === 'self' && state.selectedName) {
      shownNames = order.filter(function (p) { return p === state.selectedName; });
    }

    if (!order.length) {
      html += '<div class="pv-empty">担当の登録がありません。</div>';
    } else if (!shownNames.length) {
      html += '<div class="pv-empty">この日の担当はありません。</div>';
    } else {
      shownNames.forEach(function (person) {
        html += renderPersonCard(day, person, byPerson[person], person === state.selectedName);
      });
    }
    html += '</div>';
    return html;
  }

  function renderToolbar() {
    var selfOn = state.mode === 'self' ? ' on' : '';
    var allOn = state.mode === 'all' ? ' on' : '';
    return '<div class="pvsw-toolbar">'
      + '<span class="pvsw-toolbar-name"><span class="pvsw-toolbar-me">あなた</span>' + esc(state.selectedName) + '</span>'
      + '<button type="button" class="pvsw-toggle-btn' + selfOn + '" data-mode="self">自分のみ</button>'
      + '<button type="button" class="pvsw-toggle-btn' + allOn + '" data-mode="all">全員を表示</button>'
      + '<button type="button" class="pvsw-switch-name">氏名を変更</button>'
      + '</div>';
  }

  function renderOfflineBanner() {
    if (!state.offline) return '';
    var when = state.cachedAt ? '（' + esc(fmtUpdated(state.cachedAt)) + '時点）' : '';
    if (state.staleReason === 'error') {
      return '<div class="pvsw-offline">&#9888;&#65039; 最新情報の取得に失敗したため、前回取得した内容' + when + 'を表示しています。'
        + '内容が古い可能性があります。時間をおいて「最新に更新」を押してください。</div>';
    }
    return '<div class="pvsw-offline">&#128246; オフライン表示中：最後に取得した内容' + when + 'を表示しています。'
      + '電波のある場所で「最新に更新」を押してください。</div>';
  }

  function renderStatusSection() {
    return '<div class="pvsw-status" id="pvsw-status">'
      + '<div class="pvsw-status-title">&#128236; あなたの交代報告の受付状況</div>'
      + '<div class="pvsw-status-body pvsw-status-empty">読み込み中…</div>'
      + '</div>';
  }

  function renderPicker(data) {
    var names = allPersonNames(data);
    var btns = names.map(function (n) {
      return '<button type="button" class="pvsw-picker-btn" data-name="' + esc(n) + '">' + esc(n) + '</button>';
    }).join('');
    var html = renderOfflineBanner()
      + '<div class="pvsw-picker">'
      + '<div class="pvsw-picker-title">お名前を選択してください</div>'
      + '<div class="pvsw-picker-desc">選択すると、あなたの担当だけを表示します。あとで「全員を表示」に切り替えできます。</div>'
      + '<div class="pvsw-picker-grid">' + (btns || '<span class="pvsw-status-empty">表示できる氏名がありません。</span>') + '</div>'
      + '</div>';
    document.getElementById('pv-content').innerHTML = html;
  }

  function render() {
    var data = state.data;
    if (!data) return;
    var te = document.getElementById('pv-team');
    if (te && data.teamName) {
      var sl = te.getAttribute('data-slogan') || '';
      te.textContent = data.teamName + (sl ? '　｜　' + sl : '');
    }

    var days = Array.isArray(data.days) ? data.days : [];
    if (!days.length) {
      setNoteVisible(true);
      showState('&#128203;', 'まだ公開された割振りがありません。<br>チームからの案内をお待ちください。');
      return;
    }

    // 氏名未選択ならピッカーを表示（説明文はこの画面だけ表示して圧迫を防ぐ）
    if (!state.selectedName) { setNoteVisible(true); renderPicker(data); return; }
    setNoteVisible(false);

    var html = renderOfflineBanner() + renderToolbar() + renderHandoffNav() + renderStatusSection();
    days.forEach(function (d, i) { html += renderDay(d, i); });
    if (data.updatedAt) html += '<div class="pv-updated">最終更新: ' + esc(fmtUpdated(data.updatedAt)) + '</div>';
    document.getElementById('pv-content').innerHTML = html;
    loadStatus();
  }

  /* ========== 交代報告フォームの操作（イベント委任） ========== */
  function personTeamForPrimary() {
    var d = primaryDay(state.data) || {};
    return personTeamMap(d);
  }

  function formKind(li) {
    var checked = li.querySelector('.pvsw-kind:checked');
    return (checked && checked.value === 'unavailable') ? 'unavailable' : 'swap';
  }

  function onContentClick(ev) {
    var t = ev.target;
    if (!t) return;

    // 氏名ピッカー
    if (t.classList && t.classList.contains('pvsw-picker-btn')) {
      selectName(t.getAttribute('data-name') || '');
      return;
    }
    // 自分のみ／全員 トグル
    if (t.classList && t.classList.contains('pvsw-toggle-btn')) {
      var m = t.getAttribute('data-mode');
      if (m && m !== state.mode) { state.mode = m; render(); }
      return;
    }
    // 氏名変更
    if (t.classList && t.classList.contains('pvsw-switch-name')) {
      state.selectedName = '';
      lsDel(NAME_KEY);
      state.mode = 'self';
      render();
      return;
    }
    // 道具写真の拡大（新しいタブで開く）
    if (t.classList && t.classList.contains('pvsw-tool-img')) {
      var u = t.getAttribute('data-imgurl') || '';
      if (/^https:\/\//.test(u)) window.open(u, '_blank', 'noopener');
      return;
    }
    // 交代フォームを開く
    if (t.classList && t.classList.contains('pvsw-open')) {
      var li = t.closest('.pv-tool');
      if (!li) return;
      var form = li.querySelector('.pvsw-form');
      if (form) { form.hidden = !form.hidden; t.textContent = form.hidden ? '交代・担当できない連絡' : '閉じる'; }
      return;
    }
    // やめる
    if (t.classList && t.classList.contains('pvsw-cancel')) {
      var li2 = t.closest('.pv-tool');
      if (!li2) return;
      resetForm(li2);
      return;
    }
    // 申請 → ページ内確認へ
    if (t.classList && t.classList.contains('pvsw-apply')) {
      showConfirm(t.closest('.pv-tool'));
      return;
    }
    // ページ内確認：はい
    if (t.classList && t.classList.contains('pvsw-confirm-yes')) {
      submitReport(t.closest('.pv-tool'));
      return;
    }
    // ページ内確認：戻る
    if (t.classList && t.classList.contains('pvsw-confirm-no')) {
      var li3 = t.closest('.pv-tool');
      if (li3) hideConfirm(li3);
      return;
    }
  }

  function onContentInput(ev) {
    var t = ev.target;
    if (!t) return;
    var li = t.closest ? t.closest('.pv-tool') : null;
    if (!li) return;
    if (t.classList.contains('pvsw-comment')) {
      var counter = li.querySelector('.pvsw-counter');
      if (counter) counter.textContent = (t.value || '').length + '/' + COMMENT_MAX;
    }
    if (t.classList.contains('pvsw-to') || t.classList.contains('pvsw-kind')) {
      updateFormValidity(li);
    }
  }

  function updateFormValidity(li) {
    var toSel = li.querySelector('.pvsw-to');
    var applyBtn = li.querySelector('.pvsw-apply');
    var warn = li.querySelector('.pvsw-warn');
    var toField = li.querySelector('.pvsw-to-field');
    var unavNote = li.querySelector('.pvsw-unav-note');
    var fromPerson = li.getAttribute('data-from') || '';
    var kind = formKind(li);
    var toPerson = toSel ? toSel.value : '';

    if (toField) toField.hidden = (kind === 'unavailable');
    if (unavNote) unavNote.hidden = (kind !== 'unavailable');
    if (applyBtn) applyBtn.disabled = (kind === 'swap') ? (!toPerson || toPerson === fromPerson) : false;

    // 班（A/B）またぎの注意（判定できる範囲のみ）
    if (warn) {
      var msg = '';
      if (kind === 'swap' && toPerson) {
        var teams = personTeamForPrimary();
        var ta = teams[fromPerson], tb = teams[toPerson];
        if (ta && tb && ta !== tb) {
          msg = '※ 現担当と新担当は別の班です。会場が分かれる場合はご注意ください。';
        }
      }
      warn.textContent = msg;
      warn.hidden = !msg;
    }
  }

  function resetForm(li) {
    var form = li.querySelector('.pvsw-form');
    var openBtn = li.querySelector('.pvsw-open');
    if (form) {
      form.hidden = true;
      var kindSwap = form.querySelector('.pvsw-kind[value="swap"]');
      if (kindSwap) kindSwap.checked = true;
      var toSel = form.querySelector('.pvsw-to');
      if (toSel) toSel.value = '';
      var cm = form.querySelector('.pvsw-comment');
      if (cm) cm.value = '';
      var counter = form.querySelector('.pvsw-counter');
      if (counter) counter.textContent = '0/' + COMMENT_MAX;
      var applyBtn = form.querySelector('.pvsw-apply');
      if (applyBtn) applyBtn.disabled = true;
      var warn = form.querySelector('.pvsw-warn');
      if (warn) { warn.textContent = ''; warn.hidden = true; }
      hideConfirm(li);
      var result = form.querySelector('.pvsw-result');
      if (result) { result.hidden = true; result.textContent = ''; }
    }
    if (openBtn) openBtn.textContent = '交代・担当できない連絡';
  }

  /* ページ内確認（window.confirm の置き換え） */
  function showConfirm(li) {
    if (!li) return;
    var tool = li.getAttribute('data-tool') || '';
    var fromPerson = li.getAttribute('data-from') || '';
    var kind = formKind(li);
    var toSel = li.querySelector('.pvsw-to');
    var toPerson = toSel ? toSel.value : '';
    if (kind === 'swap' && (!toPerson || toPerson === fromPerson)) return;

    var text = (kind === 'unavailable')
      ? '「' + tool + '」の担当（' + fromPerson + '）が担当できないことを、後任未定のまま道具担当者へ連絡します。よろしいですか？'
      : '「' + tool + '」の担当を ' + fromPerson + ' → ' + toPerson + ' で交代申請します。よろしいですか？';

    var main = li.querySelector('.pvsw-main');
    var conf = li.querySelector('.pvsw-confirm');
    var confText = li.querySelector('.pvsw-confirm-text');
    if (confText) confText.textContent = text;
    if (main) main.hidden = true;
    if (conf) conf.hidden = false;
  }
  function hideConfirm(li) {
    var main = li.querySelector('.pvsw-main');
    var conf = li.querySelector('.pvsw-confirm');
    if (main) main.hidden = false;
    if (conf) conf.hidden = true;
  }

  function submitReport(li) {
    if (!li) return;
    var tool = li.getAttribute('data-tool') || '';
    var dayKey = li.getAttribute('data-daykey') || '';
    var fromPerson = li.getAttribute('data-from') || '';
    var kind = formKind(li);
    var toSel = li.querySelector('.pvsw-to');
    var toPerson = toSel ? toSel.value : '';
    var comment = (li.querySelector('.pvsw-comment') || {}).value || '';
    var reporter = (li.querySelector('.pvsw-reporter') || {}).value || '';
    if (kind === 'swap' && (!toPerson || toPerson === fromPerson)) return;

    var yesBtn = li.querySelector('.pvsw-confirm-yes');
    if (yesBtn) { yesBtn.disabled = true; yesBtn.textContent = '送信中…'; }

    fetch(API_BASE + '/api/public/swap-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shareId: state.shareId,
        dayKey: dayKey,
        tool: tool,
        type: kind,
        fromPerson: fromPerson,
        toPerson: (kind === 'unavailable') ? '' : toPerson,
        reporter: reporter,
        comment: comment
      })
    }).then(function (res) {
      return res.text().then(function (txt) {
        var payload = {};
        try { payload = txt ? JSON.parse(txt) : {}; } catch (e) { payload = {}; }
        if (!res.ok || payload.error) throw new Error(payload.error || ('HTTP ' + res.status));
        return payload;
      });
    }).then(function () {
      resetForm(li);
      var form = li.querySelector('.pvsw-form');
      var result = li.querySelector('.pvsw-result');
      if (form && result) {
        form.hidden = false;
        var main = li.querySelector('.pvsw-main');
        if (main) main.hidden = true;
        result.className = 'pvsw-result pvsw-result-ok';
        result.textContent = (kind === 'unavailable')
          ? '連絡を受け付けました。担当の調整は道具担当者が行います。'
          : '交代の申請を受け付けました。道具担当者が確認します。';
        result.hidden = false;
        var openBtn = li.querySelector('.pvsw-open');
        if (openBtn) openBtn.textContent = '閉じる';
      }
      toast(kind === 'unavailable' ? '担当できない連絡を送信しました。' : '交代の申請を受け付けました。', 'success');
      loadStatus();
    }).catch(function (err) {
      var code = String((err && err.message) || '');
      var msg = ERROR_MESSAGES[code] || '送信に失敗しました。通信環境をご確認のうえ、時間をおいて再度お試しください。';
      hideConfirm(li);
      var warn = li.querySelector('.pvsw-warn');
      if (warn) { warn.textContent = msg; warn.hidden = false; }
      toast(msg, 'error');
    }).finally(function () {
      if (yesBtn) { yesBtn.disabled = false; yesBtn.textContent = 'はい、申請する'; }
      updateFormValidity(li);
    });
  }

  /* ========== 氏名選択 ========== */
  function selectName(name) {
    name = String(name || '').trim();
    if (!name) return;
    state.selectedName = name;
    state.mode = 'self';
    lsSet(NAME_KEY, name);
    render();
  }

  /* ========== 受付状況 ========== */
  function statusBadge(status) {
    if (status === 'applied') return '<span class="pvsw-badge applied">反映済み</span>';
    if (status === 'dismissed') return '<span class="pvsw-badge dismissed">見送り</span>';
    return '<span class="pvsw-badge pending">未対応</span>';
  }
  function loadSeenStatuses() {
    try { return JSON.parse(lsGet(SEEN_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveSeenStatuses(map) {
    lsSet(SEEN_KEY, JSON.stringify(map || {}));
  }
  function loadStatus() {
    var box = document.getElementById('pvsw-status');
    if (!box) return;
    var body = box.querySelector('.pvsw-status-body');
    fetch(API_BASE + '/api/public/swap-status?sid=' + encodeURIComponent(state.shareId) + '&person=' + encodeURIComponent(state.selectedName), { method: 'GET' })
      .then(function (res) { return res.text().then(function (t) { try { return t ? JSON.parse(t) : {}; } catch (e) { return {}; } }); })
      .then(function (data) {
        var reports = (data && Array.isArray(data.reports)) ? data.reports : [];
        if (!reports.length) {
          if (body) { body.className = 'pvsw-status-body pvsw-status-empty'; body.textContent = 'あなたに関する交代報告はまだありません。'; }
          return;
        }
        var seen = loadSeenStatuses();
        var nextSeen = {};
        var changedAny = false;
        var html = '';
        reports.forEach(function (r) {
          var st = String(r.status || '');
          nextSeen[r.id] = st;
          /* 前回見たときから状態が変わった申請をハイライト（初見の pending は除く） */
          var changed = (r.id in seen) && seen[r.id] !== st;
          if (changed) changedAny = true;
          var isUnav = !String(r.toPerson || '');
          var line = isUnav
            ? esc(r.dayLabel || '') + '　「' + esc(r.tool || '') + '」　' + esc(r.fromPerson || '') + '（担当できない連絡・後任未定）'
            : esc(r.dayLabel || '') + '　「' + esc(r.tool || '') + '」　' + esc(r.fromPerson || '') + ' → ' + esc(r.toPerson || '');
          html += '<div class="pvsw-status-item' + (changed ? ' pvsw-status-changed' : '') + '"><div class="pvsw-status-main">'
            + line + statusBadge(st)
            + (changed ? '<span class="pvsw-changed-chip">更新あり</span>' : '')
            + '</div>';
          if (st === 'dismissed') {
            var reason = REJECT_LABELS[r.rejectCode] || '';
            var extra = r.rejectReason ? ('（' + r.rejectReason + '）') : '';
            html += '<div class="pvsw-reject">見送り理由：' + esc(reason || 'ー') + esc(extra) + '</div>';
          }
          html += '</div>';
        });
        saveSeenStatuses(nextSeen);
        if (body) { body.className = 'pvsw-status-body'; body.innerHTML = html; }
        if (changedAny) toast('交代報告の受付状況に更新があります。', 'info');
      })
      .catch(function () {
        if (body) { body.className = 'pvsw-status-body pvsw-status-empty'; body.textContent = '受付状況の取得に失敗しました。'; }
      });
  }

  /* ========== オフラインキャッシュ ========== */
  function saveCache(sid, data) {
    try {
      lsSet(CACHE_KEY, JSON.stringify({ sid: sid, data: data, fetchedAt: new Date().toISOString() }));
    } catch (e) {}
  }
  function loadCache(sid) {
    try {
      var o = JSON.parse(lsGet(CACHE_KEY) || 'null');
      if (o && o.sid === sid && o.data) return o;
    } catch (e) {}
    return null;
  }

  /* ========== 読み込み ========== */
  function applyLoadedData(data) {
    state.data = data;
    var remembered = lsGet(NAME_KEY);
    var names = allPersonNames(data);
    state.selectedName = (remembered && names.indexOf(remembered) >= 0) ? remembered : '';
    render();
  }

  function load() {
    var sid = getShareId();
    state.shareId = sid;
    if (!sid) { showState('&#128273;', 'URL が正しくありません。<br>チームから案内された確認用リンクを開いてください。'); return; }
    if (!API_BASE) { showState('&#9888;&#65039;', '設定が正しくありません。管理者にお問い合わせください。'); return; }
    var btn = document.getElementById('pv-reload');
    if (btn) btn.disabled = true;
    showState('&#8987;', '読み込み中です…');
    fetch(API_BASE + '/api/public/day?sid=' + encodeURIComponent(sid), { method: 'GET' })
      .then(function (res) {
        return res.text().then(function (t) {
          var payload = {};
          try { payload = t ? JSON.parse(t) : {}; } catch (e) { payload = {}; }
          if (!res.ok || payload.error) throw new Error(payload.error || ('HTTP ' + res.status));
          return payload;
        });
      })
      .then(function (data) {
        state.offline = false;
        state.staleReason = '';
        state.cachedAt = '';
        saveCache(sid, data);
        applyLoadedData(data);
      })
      .catch(function (err) {
        var msg = String(err && err.message || '');
        if (msg === 'not_found_or_revoked' || msg === 'invalid_share_id') {
          showState('&#128273;', 'この確認用リンクは<strong>無効または期限切れ</strong>です。<br>最新のリンクをチームにご確認ください。');
          return;
        }
        /* 取得失敗：前回取得分があれば表示するが、圏外と障害でバナー文言を分けて誤解を防ぐ */
        var cached = loadCache(sid);
        if (cached) {
          state.offline = true;
          state.staleReason = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'error';
          state.cachedAt = cached.fetchedAt || '';
          applyLoadedData(cached.data);
          return;
        }
        showState('&#9888;&#65039;', '読み込みに失敗しました。<br>通信環境をご確認のうえ、時間をおいて再度お試しください。');
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function init() {
    var reload = document.getElementById('pv-reload');
    if (reload) reload.addEventListener('click', load);
    var content = document.getElementById('pv-content');
    if (content) {
      content.addEventListener('click', onContentClick);
      content.addEventListener('input', onContentInput);
      content.addEventListener('change', onContentInput);
    }
    /* オフラインキャッシュ用に SW を登録（ページ資材のキャッシュ。API は対象外） */
    if ('serviceWorker' in navigator) {
      try { navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () {}); } catch (e) {}
    }
    window.addEventListener('online', function () { if (state.offline) load(); });
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
