(function(){
  'use strict';

  function $(id){return document.getElementById(id);}
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function qs(name){
    try{return new URLSearchParams(location.search).get(name)||'';}catch(e){return '';}
  }

  var cfg=window.TCB_ATT_CFG||{};
  var F=window.TCB_AttFormat||{};
  var TRACKS=cfg.tracks||{
    a:{label:'A',short:'A',form:'family',role:'',note:''},
    b:{label:'B',short:'B',form:'marks',role:'',note:''}
  };
  var sid=qs('sid');
  var client=null;
  var data=null;
  var submitting=false;
  var LS_PREF='tcb_att_pref_'+(cfg.cohort||'15');

  /** 親父LINE（marks）に母は回答しない想定のため母を出さない */
  function respondentsForForm(form){
    if(form==='marks'){
      return [
        {id:'father', label:'父'},
        {id:'other', label:'その他'}
      ];
    }
    return [
      {id:'mother', label:'母'},
      {id:'father', label:'父'},
      {id:'other', label:'その他'}
    ];
  }

  var ERR_JA={
    invalid_share_id:'URLが正しくありません。案内のリンクを開き直してください',
    not_found:'この回答ページは見つかりません。最新の案内URLをご確認ください',
    campaign_closed:'受付が終了しています',
    member_required:'先に選手名を選んでください',
    member_not_found:'選手が名簿に見つかりません。管理担当へご連絡ください',
    too_fast:'連続送信のため、少し待ってから再度お試しください'
  };
  function jaErr(e){
    var m=(e&&e.message)?e.message:String(e||'');
    return ERR_JA[m]||m;
  }

  function trackKey(){return (data&&data.track)||'a';}
  function trackInfo(){
    var t=trackKey();
    return TRACKS[t]||TRACKS.a;
  }

  function setStatus(msg, isErr){
    var el=$('att-status');
    if(!el)return;
    el.textContent=msg||'';
    el.className='att-status'+(isErr?' err':'');
  }

  function ensureClient(){
    if(client)return client;
    client=TCB_createPublicAttendanceClient({baseUrl:cfg.apiBase||''});
    if(!client)setStatus('API設定がありません', true);
    return client;
  }

  function loadPrefs(){
    try{
      var raw=localStorage.getItem(LS_PREF);
      if(!raw)return {};
      var o=JSON.parse(raw);
      return o&&typeof o==='object'?o:{};
    }catch(e){return {};}
  }

  function savePrefs(partial){
    try{
      var cur=loadPrefs();
      Object.keys(partial||{}).forEach(function(k){cur[k]=partial[k];});
      localStorage.setItem(LS_PREF, JSON.stringify(cur));
    }catch(e){}
  }

  function markOnClass(m){
    if(m==='o')return 'is-on-in';
    if(m==='x')return 'is-on-out';
    if(m==='t')return 'is-on-maybe';
    if(m==='n')return 'is-on-none';
    return '';
  }

  /** allowNone: ひとり親向け「― なし」（父／母欄のみ） */
  function markBtns(name, current, datescope, allowNone){
    var cur=current||'unset';
    var items=[
      {m:'o', label:'◯ 出'},
      {m:'t', label:'△ 未定'},
      {m:'x', label:'✕ 欠'}
    ];
    if(allowNone)items.push({m:'n', label:'― なし'});
    return items.map(function(item){
      var on=cur===item.m?' '+markOnClass(item.m):'';
      return '<button type="button" class="'+on.trim()+'" data-mark-field="'+name+'" data-mark="'+item.m+'" data-date="'+esc(datescope||'')+'">'+item.label+'</button>';
    }).join('');
  }

  /** 配車の可否: 可／否のみ */
  function ynBtns(name, current, datescope){
    var cur=current||'unset';
    return [
      {m:'o', label:'可'},
      {m:'x', label:'否'}
    ].map(function(item){
      var on=cur===item.m?' '+markOnClass(item.m):'';
      return '<button type="button" class="'+on.trim()+'" data-mark-field="'+name+'" data-mark="'+item.m+'" data-date="'+esc(datescope||'')+'">'+item.label+'</button>';
    }).join('');
  }

  function getRespondent(){
    var on=document.querySelector('#att-respondent-seg button.att-respondent.is-on');
    return on?String(on.getAttribute('data-respondent')||''):'';
  }

  function setRespondentUI(role){
    document.querySelectorAll('#att-respondent-seg button.att-respondent').forEach(function(btn){
      var on=btn.getAttribute('data-respondent')===role;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on?'true':'false');
    });
    var otherWrap=$('att-other-role-wrap');
    if(otherWrap){
      if(role==='other')otherWrap.classList.remove('att-hidden');
      else otherWrap.classList.add('att-hidden');
    }
  }

  function roleSuffixFromRespondent(role){
    if(role==='father')return '父';
    if(role==='mother')return '母';
    if(role==='other'){
      var el=$('att-other-role');
      var custom=el?String(el.value||'').trim():'';
      return custom||'その他';
    }
    return '';
  }

  function respondentPrompt(){
    return trackInfo().form==='marks'
      ? '回答者（父／その他）を選んでください。'
      : '回答者（父／母／その他）を選んでください。';
  }

  function updateGuide(){
    var el=$('att-respondent-guide');
    if(!el)return;
    var role=getRespondent();
    if(!role){
      el.textContent=respondentPrompt();
      el.className='att-respondent-guide att-guide-info';
      return;
    }
    if(trackInfo().form==='family'&&role==='mother'){
      el.textContent='「父側の保護者」は自動で「なし」にしています。父も来る場合は変更してください。';
      el.className='att-respondent-guide att-guide-info';
      return;
    }
    if(trackInfo().form==='family'&&role==='father'){
      el.textContent='「母側の保護者」は自動で「なし」にしています。母も来る場合は変更してください。';
      el.className='att-respondent-guide att-guide-info';
      return;
    }
    el.textContent='';
    el.className='att-respondent-guide att-hidden';
  }

  function canUnlockForm(){
    var name=($('att-pick')&&$('att-pick').value)||'';
    var role=getRespondent();
    return !!(name&&role);
  }

  function syncFormLock(){
    if(canUnlockForm())unlockForm();
    else lockForm();
    updateGuide();
    var btn=$('att-submit');
    if(btn&&!submitting){
      btn.disabled=!canUnlockForm();
      btn.textContent='送信する';
    }
  }

  function renderRespondentBlock(prefs){
    var form=trackInfo().form;
    var allowed=respondentsForForm(form);
    var cur=prefs.respondentRole||'';
    var allowedIds=allowed.map(function(r){return r.id;});
    if(cur&&allowedIds.indexOf(cur)<0)cur='';
    var btns=allowed.map(function(r){
      var on=cur===r.id?' is-on':'';
      return '<button type="button" class="att-respondent'+on+'" data-respondent="'+r.id+'" aria-pressed="'+(cur===r.id?'true':'false')+'">'+esc(r.label)+'</button>';
    }).join('');
    var otherVal=prefs.otherRoleLabel||'';
    return '<div class="att-step" style="margin-top:14px"><span class="att-step-num">1b</span><span>回答者を選ぶ</span></div>'
      +'<div id="att-respondent-seg" class="att-seg att-respondent-seg" role="group" aria-label="回答者">'
      +btns
      +'</div>'
      +'<div id="att-other-role-wrap" class="att-field'+(cur==='other'?'':' att-hidden')+'" style="margin-top:8px">'
      +'<label for="att-other-role">続柄の表記（任意）</label>'
      +'<input id="att-other-role" maxlength="20" placeholder="例: 祖母／祖父　空欄なら「その他」" value="'+esc(otherVal)+'" autocomplete="off">'
      +'</div>'
      +'<p id="att-respondent-guide" class="att-respondent-guide att-guide-info" style="margin-top:10px"></p>';
  }

  function render(){
    if(!data||!data.campaign){
      $('att-main').innerHTML='<div class="att-card"><p>出欠情報を表示できません。</p></div>';
      return;
    }
    var t=trackInfo();
    var title=data.campaign.title||'出欠確認';
    $('att-hdr-title').innerHTML=esc(t.label||'出欠')+' 回答<span>'+esc(cfg.teamName||'')+'</span>';

    if(data.closed==1||data.closed==='1'){
      $('att-main').innerHTML='<div class="att-card"><h2>'+esc(title)+'</h2><p>受付終了しています。</p></div>';
      return;
    }

    var prefs=loadPrefs();
    var opts=(data.members||[]).map(function(n){
      var done=data.responses&&data.responses[n]?'（回答済）':'';
      var sel=prefs.memberName===n?' selected':'';
      return '<option value="'+esc(n)+'"'+sel+'>'+esc(n)+done+'</option>';
    }).join('');

    var note=(t.form==='family')
      ? '① 選手と回答者を選ぶ → ② 日ごとに入力 → ③ 送信 → ④ 投稿文をコピーしてLINEへ。'
        +(t.note?'\n'+t.note:'')
      : '① 選手と回答者を選ぶ → ② 日ごとに◯／△／✕ → ③ 送信 → ④ 投稿文をコピーしてLINEへ。'
        +(t.note?'\n'+t.note:'');

    var daysHtml=(data.days||[]).map(function(d){
      return t.form==='family'?renderFamilyDay(d):renderMarksDay(d);
    }).join('');

    $('att-main').innerHTML=
      '<div class="att-card"><h2>'+esc(title)+'</h2>'
      +(data.campaign.memo?'<p class="att-act-meta">'+esc(data.campaign.memo)+'</p>':'')
      +'</div>'
      +'<div class="att-parent-note">'+esc(note).replace(/\n/g,'<br>')+'</div>'
      +'<div class="att-card">'
      +'<div class="att-step"><span class="att-step-num">1</span><label for="att-pick">選手名を選ぶ</label></div>'
      +'<select id="att-pick" class="att-pick" aria-label="選手名"><option value="">選択してください</option>'+opts+'</select>'
      +'<p id="att-pick-hint" class="att-act-meta">選手と回答者を選ぶと、下の入力欄が使えます。</p>'
      +renderRespondentBlock(prefs)
      +'</div>'
      +'<div id="att-form-panel" class="att-form-panel att-form-locked" aria-disabled="true">'
      +'<div class="att-card">'
      +'<div class="att-step"><span class="att-step-num">2</span><span>日ごとの回答</span></div>'
      +daysHtml
      +'</div>'
      +'<div class="att-sticky-actions">'
      +'<button type="button" id="att-submit" class="att-btn att-btn-primary" style="width:100%" disabled>送信する</button>'
      +'</div></div>'
      +'<div id="att-result" class="att-card att-hidden">'
      +'<div class="att-step"><span class="att-step-num">3</span><span>LINE投稿用テキスト</span></div>'
      +'<p class="att-act-meta" style="margin:8px 0">コピーして、該当のLINEグループへ貼り付けてください。</p>'
      +'<pre id="att-line-out" class="att-preview" tabindex="0"></pre>'
      +'<div class="att-row" style="margin-top:8px">'
      +'<button type="button" id="att-copy" class="att-btn att-btn-line" style="flex:1">コピー</button>'
      +'<button type="button" id="att-share" class="att-btn att-btn-ghost" style="flex:1">共有</button>'
      +'</div>'
      +'<p id="att-copy-hint" class="att-act-meta" style="margin-top:8px"></p>'
      +'</div>';

    wireDayToggles();
    var allowedIds=respondentsForForm(t.form).map(function(r){return r.id;});
    if(prefs.respondentRole&&allowedIds.indexOf(prefs.respondentRole)>=0){
      setRespondentUI(prefs.respondentRole);
    }
    var pick=$('att-pick');
    if(pick&&pick.value){
      fillExisting(pick.value);
      applyPrefsToForm();
      applyRespondentDefaults(false);
    }
    syncFormLock();
  }

  function lockForm(){
    var panel=$('att-form-panel');
    var hint=$('att-pick-hint');
    if(panel){
      panel.classList.add('att-form-locked');
      panel.setAttribute('aria-disabled','true');
    }
    if(hint)hint.classList.remove('att-hidden');
  }

  function unlockForm(){
    var panel=$('att-form-panel');
    var hint=$('att-pick-hint');
    if(panel){
      panel.classList.remove('att-form-locked');
      panel.setAttribute('aria-disabled','false');
    }
    if(hint)hint.classList.add('att-hidden');
  }

  function renderFamilyDay(d){
    var dt=d.activityDate;
    return '<div class="att-member" data-day="'+esc(dt)+'">'
      +'<div class="att-member-name">'+(F.dayHead?F.dayHead(dt):esc(dt))+'</div>'
      +'<div class="att-seg" style="margin-bottom:8px">'
      +'<button type="button" class="att-mode is-on-in" data-mode="on" data-date="'+esc(dt)+'">出席</button>'
      +'<button type="button" class="att-mode" data-mode="off" data-date="'+esc(dt)+'">欠席</button>'
      +'</div>'
      +'<div class="att-on-block" data-date="'+esc(dt)+'">'
      +'<p class="att-act-meta">①父側の保護者 <span class="att-hint-inline">いない場合は「なし」</span></p>'
      +'<div class="att-seg">'+markBtns('father','unset',dt,true)+'</div>'
      +'<p class="att-act-meta">①母側の保護者 <span class="att-hint-inline">いない場合は「なし」</span></p>'
      +'<div class="att-seg">'+markBtns('mother','unset',dt,true)+'</div>'
      +'<div class="att-field"><label>②兄弟</label><input data-f="siblings" data-date="'+esc(dt)+'" value="なし" autocomplete="off"></div>'
      +'<div class="att-field"><label>②その他</label><input data-f="other" data-date="'+esc(dt)+'" value="―" autocomplete="off"></div>'
      +'<p class="att-act-meta">③配車の可否</p><div class="att-seg">'+ynBtns('carOk','unset',dt)+'</div>'
      +'<div class="att-field"><label>④車種</label><input data-f="carModel" data-date="'+esc(dt)+'" placeholder="例: RAV4" autocomplete="off"></div>'
      +'<div class="att-field"><label>⑤乗車可能人数</label><input data-f="seats" data-date="'+esc(dt)+'" inputmode="numeric" placeholder="例: 2" autocomplete="off"></div>'
      +'<div class="att-field"><label>⑥送り</label><input data-f="send" data-date="'+esc(dt)+'" placeholder="例: 母（RAV4）／祖母 など" autocomplete="off"></div>'
      +'<div class="att-field"><label>⑦迎え</label><input data-f="pickup" data-date="'+esc(dt)+'" placeholder="例: 母（RAV4）／祖父 など" autocomplete="off"></div>'
      +'</div>'
      +'<div class="att-off-block att-hidden" data-date="'+esc(dt)+'">'
      +'<div class="att-field"><label>欠席の理由</label><input data-f="offNote" data-date="'+esc(dt)+'" placeholder="例: 学校行事" autocomplete="off"></div>'
      +'</div></div>';
  }

  function renderMarksDay(d){
    var dt=d.activityDate;
    return '<div class="att-member" data-day="'+esc(dt)+'">'
      +'<div class="att-member-name">'+(F.dayHead?F.dayHead(dt):esc(dt))+'</div>'
      +'<div class="att-seg">'+markBtns('dayMark','unset',dt)+'</div>'
      +'</div>';
  }

  function wireDayToggles(){
    $('att-main').querySelectorAll('button.att-mode').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(isFormLocked())return;
        var dt=btn.getAttribute('data-date');
        var mode=btn.getAttribute('data-mode');
        var wrap=btn.closest('.att-member');
        wrap.querySelectorAll('button.att-mode').forEach(function(b){
          b.classList.remove('is-on-in','is-on-out');
        });
        btn.classList.add(mode==='off'?'is-on-out':'is-on-in');
        var on=wrap.querySelector('.att-on-block[data-date="'+dt+'"]');
        var off=wrap.querySelector('.att-off-block[data-date="'+dt+'"]');
        if(mode==='off'){
          if(on)on.classList.add('att-hidden');
          if(off)off.classList.remove('att-hidden');
        }else{
          if(on)on.classList.remove('att-hidden');
          if(off)off.classList.add('att-hidden');
        }
      });
    });
    $('att-main').querySelectorAll('button[data-mark]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(isFormLocked())return;
        var field=btn.getAttribute('data-mark-field');
        var dt=btn.getAttribute('data-date');
        var seg=btn.parentElement;
        seg.querySelectorAll('button[data-mark-field="'+field+'"]').forEach(function(b){
          if(b.getAttribute('data-date')===dt)b.className='';
        });
        var m=btn.getAttribute('data-mark');
        btn.className=markOnClass(m);
      });
    });
  }

  function isFormLocked(){
    var panel=$('att-form-panel');
    return !!(panel&&panel.classList.contains('att-form-locked'));
  }

  function selectedMark(wrap, field, dt){
    var on=wrap.querySelector(
      'button[data-mark-field="'+field+'"][data-date="'+dt+'"].is-on-in,'
      +'button[data-mark-field="'+field+'"][data-date="'+dt+'"].is-on-out,'
      +'button[data-mark-field="'+field+'"][data-date="'+dt+'"].is-on-maybe,'
      +'button[data-mark-field="'+field+'"][data-date="'+dt+'"].is-on-none'
    );
    if(!on)return 'unset';
    return on.getAttribute('data-mark')||'unset';
  }

  function fieldVal(wrap, f, dt){
    var el=wrap.querySelector('[data-f="'+f+'"][data-date="'+dt+'"]');
    return el?String(el.value||'').trim():'';
  }

  /**
   * 回答者に応じて父／母欄の初期値をセット。
   * force=true のときは回答者変更時に「なし」側を上書き。
   */
  function applyRespondentDefaults(force){
    if(trackInfo().form!=='family')return;
    var role=getRespondent();
    if(role!=='mother'&&role!=='father')return;
    var field=role==='mother'?'father':'mother';
    (data.days||[]).forEach(function(d){
      var dt=d.activityDate;
      var wrap=document.querySelector('.att-member[data-day="'+dt+'"]');
      if(!wrap)return;
      var onBlock=wrap.querySelector('.att-on-block');
      if(!onBlock||onBlock.classList.contains('att-hidden'))return;
      if(!force&&selectedMark(wrap,field,dt)!=='unset')return;
      var btn=wrap.querySelector('button[data-mark-field="'+field+'"][data-date="'+dt+'"][data-mark="n"]');
      if(!btn)return;
      wrap.querySelectorAll('button[data-mark-field="'+field+'"][data-date="'+dt+'"]').forEach(function(x){x.className='';});
      btn.className=markOnClass('n');
    });
  }

  function collectFamilyPayload(){
    var days={};
    (data.days||[]).forEach(function(d){
      var dt=d.activityDate;
      var wrap=document.querySelector('.att-member[data-day="'+dt+'"]');
      if(!wrap)return;
      var modeBtn=wrap.querySelector('button.att-mode.is-on-out,button.att-mode.is-on-in');
      var mode=modeBtn&&modeBtn.getAttribute('data-mode')==='off'?'off':'on';
      if(mode==='off'){
        days[dt]={mode:'off', note:fieldVal(wrap,'offNote',dt)};
      }else{
        days[dt]={
          mode:'on',
          father:selectedMark(wrap,'father',dt),
          mother:selectedMark(wrap,'mother',dt),
          siblings:fieldVal(wrap,'siblings',dt)||'なし',
          other:fieldVal(wrap,'other',dt)||'―',
          carOk:selectedMark(wrap,'carOk',dt),
          carModel:fieldVal(wrap,'carModel',dt),
          seats:fieldVal(wrap,'seats',dt),
          send:fieldVal(wrap,'send',dt),
          pickup:fieldVal(wrap,'pickup',dt)
        };
      }
    });
    var role=getRespondent();
    return {
      days:days,
      respondentRole:role,
      roleSuffix:roleSuffixFromRespondent(role)
    };
  }

  function collectMarksPayload(){
    var days={};
    (data.days||[]).forEach(function(d){
      var dt=d.activityDate;
      var wrap=document.querySelector('.att-member[data-day="'+dt+'"]');
      if(!wrap)return;
      days[dt]=selectedMark(wrap,'dayMark',dt);
    });
    var role=getRespondent();
    return {
      days:days,
      respondentRole:role,
      roleSuffix:roleSuffixFromRespondent(role)
    };
  }

  function collectPayload(){
    return trackInfo().form==='family'?collectFamilyPayload():collectMarksPayload();
  }

  function hasUnsetAnswers(payload){
    var days=payload&&payload.days?payload.days:{};
    var keys=Object.keys(days);
    if(!keys.length)return true;
    if(trackInfo().form!=='family'){
      return keys.some(function(k){return !days[k]||days[k]==='unset';});
    }
    return keys.some(function(k){
      var row=days[k];
      if(!row)return true;
      if(row.mode==='off')return false;
      return row.father==='unset'||row.mother==='unset'||row.carOk==='unset';
    });
  }

  function fillExisting(name){
    var prev=data.responses&&data.responses[name];
    if(!prev)return;
    if(prev.respondentRole){
      var allowed=respondentsForForm(trackInfo().form).map(function(r){return r.id;});
      if(allowed.indexOf(prev.respondentRole)>=0){
        setRespondentUI(prev.respondentRole);
        if(prev.respondentRole==='other'&&prev.roleSuffix&&prev.roleSuffix!=='その他'){
          var oel=$('att-other-role');
          if(oel)oel.value=String(prev.roleSuffix);
        }
      }
    }
    if(trackInfo().form!=='family'){
      if(!prev.days)return;
      (data.days||[]).forEach(function(d){
        var dt=d.activityDate;
        var mk=prev.days[dt];
        if(!mk||mk==='unset')return;
        var btn=document.querySelector('button[data-mark-field="dayMark"][data-date="'+dt+'"][data-mark="'+mk+'"]');
        if(btn)btn.click();
      });
      return;
    }
    if(!prev.days)return;
    (data.days||[]).forEach(function(d){
      var dt=d.activityDate;
      var row=prev.days[dt];
      if(!row)return;
      var wrap=document.querySelector('.att-member[data-day="'+dt+'"]');
      if(!wrap)return;
      if(row.mode==='off'){
        var offBtn=wrap.querySelector('button.att-mode[data-mode="off"]');
        if(offBtn)offBtn.click();
        var note=wrap.querySelector('[data-f="offNote"]');
        if(note)note.value=row.note||'';
      }else{
        var onBtn=wrap.querySelector('button.att-mode[data-mode="on"]');
        if(onBtn)onBtn.click();
        ['father','mother','carOk'].forEach(function(f){
          if(!row[f]||row[f]==='unset')return;
          var b=wrap.querySelector('button[data-mark-field="'+f+'"][data-date="'+dt+'"][data-mark="'+row[f]+'"]');
          if(b)b.click();
        });
        ['siblings','other','carModel','seats','send','pickup'].forEach(function(f){
          var el=wrap.querySelector('[data-f="'+f+'"][data-date="'+dt+'"]');
          if(el&&row[f]!=null&&row[f]!=='')el.value=row[f];
        });
      }
    });
  }

  /** サーバー未回答の日に、端末に覚えた車情報を埋める（family フォームのみ） */
  function applyPrefsToForm(){
    if(trackInfo().form!=='family')return;
    var prefs=loadPrefs();
    (data.days||[]).forEach(function(d){
      var dt=d.activityDate;
      var wrap=document.querySelector('.att-member[data-day="'+dt+'"]');
      if(!wrap)return;
      var onBlock=wrap.querySelector('.att-on-block');
      if(!onBlock||onBlock.classList.contains('att-hidden'))return;
      ['carModel','seats','send','pickup'].forEach(function(f){
        var el=wrap.querySelector('[data-f="'+f+'"][data-date="'+dt+'"]');
        if(el&&!el.value&&prefs[f])el.value=prefs[f];
      });
    });
  }

  function persistPrefsFromPayload(name, payload){
    var patch={memberName:name};
    if(payload&&payload.respondentRole)patch.respondentRole=payload.respondentRole;
    if(payload&&payload.respondentRole==='other'){
      var oel=$('att-other-role');
      patch.otherRoleLabel=oel?String(oel.value||'').trim():'';
    }
    if(payload&&payload.roleSuffix!=null)patch.roleSuffix=String(payload.roleSuffix);
    if(trackInfo().form==='family'&&payload&&payload.days){
      Object.keys(payload.days).forEach(function(dt){
        var row=payload.days[dt];
        if(!row||row.mode==='off')return;
        if(row.carModel)patch.carModel=row.carModel;
        if(row.seats!=null&&String(row.seats)!=='')patch.seats=String(row.seats);
        if(row.send)patch.send=row.send;
        if(row.pickup)patch.pickup=row.pickup;
      });
    }
    savePrefs(patch);
  }

  function setBusy(on){
    submitting=!!on;
    var btn=$('att-submit');
    if(!btn)return;
    if(on){
      btn.disabled=true;
      btn.textContent='送信中…';
      btn.classList.add('att-btn-busy');
    }else{
      btn.classList.remove('att-btn-busy');
      syncFormLock();
    }
  }

  async function copyText(text){
    var hint=$('att-copy-hint');
    var pre=$('att-line-out');
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
        setStatus('コピーしました。LINEに貼り付けてください');
        if(hint)hint.textContent='クリップボードにコピー済みです。';
        return true;
      }
      throw new Error('no_clipboard');
    }catch(e){
      if(pre){
        try{
          var range=document.createRange();
          range.selectNodeContents(pre);
          var sel=window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }catch(e2){}
      }
      setStatus('自動コピーできないため、上の文を長押ししてコピーしてください', true);
      if(hint)hint.textContent='文面を選択しました。長押し→コピーでLINEへ貼れます。';
      return false;
    }
  }

  async function shareText(text){
    if(navigator.share){
      try{
        await navigator.share({text:text});
        setStatus('共有シートを開きました');
        return;
      }catch(e){
        if(e&&e.name==='AbortError')return;
      }
    }
    await copyText(text);
  }

  async function load(){
    var c=ensureClient();
    if(!c)return;
    if(!sid){setStatus('URLが不正です（sidがありません）', true);return;}
    setStatus('読み込み中…');
    data=await c.load(sid);
    render();
    setStatus('選手名と回答者を選んで回答を始めてください');
  }

  async function submit(){
    if(submitting)return;
    var c=ensureClient();
    if(!c)return;
    var name=($('att-pick')&&$('att-pick').value)||'';
    var role=getRespondent();
    if(!name){
      setStatus('先に選手名を選んでください', true);
      var pick=$('att-pick');
      if(pick)pick.focus();
      return;
    }
    if(!role){
      setStatus(respondentPrompt(), true);
      return;
    }
    var payload=collectPayload();
    if(hasUnsetAnswers(payload)){
      var ok=window.confirm('まだ選んでいない項目（◯△✕など）があります。このまま送信しますか？');
      if(!ok)return;
    }
    setBusy(true);
    setStatus('送信中…しばらくお待ちください');
    try{
      data=await c.respond({sid:sid, memberName:name, payload:payload});
      persistPrefsFromPayload(name, payload);
      render();
      if($('att-pick'))$('att-pick').value=name;
      if(payload.respondentRole)setRespondentUI(payload.respondentRole);
      fillExisting(name);
      applyPrefsToForm();
      applyRespondentDefaults(false);
      syncFormLock();
      var t=trackInfo();
      var text=t.form==='family'
        ? F.formatFamilyLine(name, data.days, payload)
        : F.formatMarksLine(name, data.days, payload, payload.roleSuffix||'');
      var result=$('att-result');
      var out=$('att-line-out');
      if(result)result.classList.remove('att-hidden');
      if(out)out.textContent=text;
      setStatus('受け付けました。下の投稿文をコピーしてLINEへ貼ってください');
      if(result&&result.scrollIntoView){
        setTimeout(function(){result.scrollIntoView({behavior:'smooth', block:'start'});}, 50);
      }
    }finally{
      setBusy(false);
    }
  }

  function onPickChanged(){
    var pick=$('att-pick');
    var name=pick?pick.value:'';
    if(name){
      savePrefs({memberName:name});
      fillExisting(name);
      applyPrefsToForm();
      applyRespondentDefaults(false);
    }
    syncFormLock();
    if(!name)setStatus('選手名と回答者を選んで回答を始めてください');
    else if(!getRespondent())setStatus(respondentPrompt());
    else setStatus(name+' の回答を入力できます');
  }

  function onRespondentChosen(role){
    var allowed=respondentsForForm(trackInfo().form).map(function(r){return r.id;});
    if(allowed.indexOf(role)<0)return;
    setRespondentUI(role);
    var patch={respondentRole:role};
    if(role==='other'){
      var oel=$('att-other-role');
      patch.otherRoleLabel=oel?String(oel.value||'').trim():'';
    }
    savePrefs(patch);
    applyRespondentDefaults(true);
    syncFormLock();
    var name=($('att-pick')&&$('att-pick').value)||'';
    if(name)setStatus(name+' の回答を入力できます');
    else setStatus('選手名を選んでください');
  }

  document.addEventListener('DOMContentLoaded', function(){
    $('att-main').addEventListener('change', function(ev){
      if(!ev.target)return;
      if(ev.target.id==='att-pick')onPickChanged();
      if(ev.target.id==='att-other-role'){
        savePrefs({otherRoleLabel:String(ev.target.value||'').trim()});
      }
    });
    $('att-main').addEventListener('click', function(ev){
      var t=ev.target;
      if(!t)return;
      var resp=t.closest?t.closest('button.att-respondent'):null;
      if(resp){
        onRespondentChosen(resp.getAttribute('data-respondent')||'');
        return;
      }
      if(t.id==='att-submit'||(t.closest&&t.closest('#att-submit'))){
        submit().catch(function(e){
          setStatus(jaErr(e), true);
          setBusy(false);
        });
      }
      if(t.id==='att-copy'||(t.closest&&t.closest('#att-copy'))){
        var text=($('att-line-out')&&$('att-line-out').textContent)||'';
        copyText(text);
      }
      if(t.id==='att-share'||(t.closest&&t.closest('#att-share'))){
        var text2=($('att-line-out')&&$('att-line-out').textContent)||'';
        shareText(text2);
      }
    });
    load().catch(function(e){setStatus(jaErr(e), true);});
  });
})();
