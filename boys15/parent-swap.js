/* 保護者確認画面 メインスクリプト
   - 割振り閲覧（当日／前回）
   - 氏名選択で「自分のみ表示」／「全員を表示」トグル
   - 各道具の交代報告（申請）フォーム＋事前防止＋確認
   - 受付状況（反映／見送り＋却下理由）の表示
   設定値（APIベースURL）は HTML 側の window.PVSW_CONFIG から受け取る（トークンは埋め込まない）。 */
(function () {
  'use strict';

  var CFG = window.PVSW_CONFIG || {};
  var API_BASE = String(CFG.apiBase || '').replace(/\/+$/, '');
  var COHORT = document.documentElement.getAttribute('data-cohort') || '';
  var NAME_KEY = 'pvsw_name_' + COHORT;
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
    mode: 'self' // 'self' | 'all'
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

  function showState(emoji, msg) {
    var el = document.getElementById('pv-content');
    if (el) el.innerHTML = '<div class="pv-state"><span class="pv-state-emoji">' + emoji + '</span>' + msg + '</div>';
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
      + '<div class="pvsw-field"><label class="pvsw-label">新担当（交代後の担当）</label>'
      + '<select class="pvsw-select pvsw-to">' + memberOptionsHtml(members, fromPerson, '') + '</select></div>'
      + '<div class="pvsw-warn" hidden></div>'
      + '<div class="pvsw-field"><label class="pvsw-label">コメント（任意・' + COMMENT_MAX + '字まで）</label>'
      + '<textarea class="pvsw-comment" maxlength="' + COMMENT_MAX + '" rows="2" placeholder="必要に応じてご記入ください"></textarea>'
      + '<span class="pvsw-counter">0/' + COMMENT_MAX + '</span></div>'
      + '<div class="pvsw-field"><label class="pvsw-label">連絡者（任意）</label>'
      + '<select class="pvsw-select pvsw-reporter">' + reporterOpts + '</select></div>'
      + '<div class="pvsw-btns">'
      + '<button type="button" class="pvsw-apply" disabled>この内容で申請</button>'
      + '<button type="button" class="pvsw-cancel">やめる</button>'
      + '</div></div>';
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
      html += '<li class="pv-tool" data-tool="' + esc(t.tool) + '" data-from="' + esc(person) + '" data-daykey="' + esc(day.role || '') + '">'
        + esc(t.tool)
        + (t.desc ? '<span class="pv-tool-desc">' + esc(t.desc) + '</span>' : '');
      if (Array.isArray(day.members) && day.members.length) {
        html += '<div><button type="button" class="pvsw-open">交代を申請</button></div>'
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
      byPerson[person].tools.push({ tool: it.tool || '', desc: it.desc || '' });
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
    var html = '<div class="pvsw-picker">'
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
      showState('&#128203;', 'まだ公開された割振りがありません。<br>チームからの案内をお待ちください。');
      return;
    }

    // 氏名未選択ならピッカーを表示
    if (!state.selectedName) { renderPicker(data); return; }

    var html = renderToolbar() + renderStatusSection();
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
    // 交代フォームを開く
    if (t.classList && t.classList.contains('pvsw-open')) {
      var li = t.closest('.pv-tool');
      if (!li) return;
      var form = li.querySelector('.pvsw-form');
      if (form) { form.hidden = !form.hidden; t.textContent = form.hidden ? '交代を申請' : '閉じる'; }
      return;
    }
    // やめる
    if (t.classList && t.classList.contains('pvsw-cancel')) {
      var li2 = t.closest('.pv-tool');
      if (!li2) return;
      resetForm(li2);
      return;
    }
    // 申請
    if (t.classList && t.classList.contains('pvsw-apply')) {
      submitReport(t.closest('.pv-tool'));
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
    if (t.classList.contains('pvsw-to')) {
      updateFormValidity(li);
    }
  }

  function updateFormValidity(li) {
    var toSel = li.querySelector('.pvsw-to');
    var applyBtn = li.querySelector('.pvsw-apply');
    var warn = li.querySelector('.pvsw-warn');
    var fromPerson = li.getAttribute('data-from') || '';
    var toPerson = toSel ? toSel.value : '';
    if (applyBtn) applyBtn.disabled = !toPerson || toPerson === fromPerson;

    // 班（A/B）またぎの注意（判定できる範囲のみ）
    if (warn) {
      var msg = '';
      if (toPerson) {
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
    }
    if (openBtn) openBtn.textContent = '交代を申請';
  }

  function submitReport(li) {
    if (!li) return;
    var tool = li.getAttribute('data-tool') || '';
    var dayKey = li.getAttribute('data-daykey') || '';
    var fromPerson = li.getAttribute('data-from') || '';
    var toSel = li.querySelector('.pvsw-to');
    var toPerson = toSel ? toSel.value : '';
    var comment = (li.querySelector('.pvsw-comment') || {}).value || '';
    var reporter = (li.querySelector('.pvsw-reporter') || {}).value || '';
    if (!toPerson || toPerson === fromPerson) return;

    var confirmMsg = '「' + tool + '」の担当を\n' + fromPerson + ' → ' + toPerson + '\nで交代申請します。よろしいですか？';
    if (!window.confirm(confirmMsg)) return;

    var applyBtn = li.querySelector('.pvsw-apply');
    if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = '送信中…'; }

    fetch(API_BASE + '/api/public/swap-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shareId: state.shareId,
        dayKey: dayKey,
        tool: tool,
        fromPerson: fromPerson,
        toPerson: toPerson,
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
      alert('交代の申請を受け付けました。道具担当者が確認します。');
      resetForm(li);
      loadStatus();
    }).catch(function (err) {
      var code = String((err && err.message) || '');
      alert(ERROR_MESSAGES[code] || '送信に失敗しました。通信環境をご確認のうえ、時間をおいて再度お試しください。');
    }).finally(function () {
      if (applyBtn) { applyBtn.textContent = 'この内容で申請'; updateFormValidity(li); }
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
        var html = '';
        reports.forEach(function (r) {
          html += '<div class="pvsw-status-item"><div class="pvsw-status-main">'
            + esc(r.dayLabel || '') + '　「' + esc(r.tool || '') + '」　' + esc(r.fromPerson || '') + ' → ' + esc(r.toPerson || '')
            + statusBadge(r.status) + '</div>';
          if (r.status === 'dismissed') {
            var reason = REJECT_LABELS[r.rejectCode] || '';
            var extra = r.rejectReason ? ('（' + r.rejectReason + '）') : '';
            html += '<div class="pvsw-reject">見送り理由：' + esc(reason || 'ー') + esc(extra) + '</div>';
          }
          html += '</div>';
        });
        if (body) { body.className = 'pvsw-status-body'; body.innerHTML = html; }
      })
      .catch(function () {
        if (body) { body.className = 'pvsw-status-body pvsw-status-empty'; body.textContent = '受付状況の取得に失敗しました。'; }
      });
  }

  /* ========== 読み込み ========== */
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
        state.data = data;
        // 記憶した氏名が今回の公開に存在すれば復元、なければピッカーへ
        var remembered = lsGet(NAME_KEY);
        var names = allPersonNames(data);
        state.selectedName = (remembered && names.indexOf(remembered) >= 0) ? remembered : '';
        render();
      })
      .catch(function (err) {
        var msg = String(err && err.message || '');
        if (msg === 'not_found_or_revoked' || msg === 'invalid_share_id') {
          showState('&#128273;', 'この確認用リンクは<strong>無効または期限切れ</strong>です。<br>最新のリンクをチームにご確認ください。');
        } else {
          showState('&#9888;&#65039;', '読み込みに失敗しました。<br>通信環境をご確認のうえ、時間をおいて再度お試しください。');
        }
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
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
