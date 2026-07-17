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

  function trackInfo(){
    var t=(data&&data.track)||'a';
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
      ? '① 選手を選ぶ → ② 日ごとに入力 → ③ 送信 → ④ 投稿文をコピーしてLINEへ。車種などは前回の入力を覚えます。'
        +(t.note?'\n'+t.note:'\n※ひとり親・どちらか一方だけのご家庭は、いない方を「― なし」にしてください。')
      : '① 選手を選ぶ → ② 日ごとに◯／△／✕ → ③ 送信 → ④ 投稿文をコピーしてLINEへ。'
        +(t.note?'\n'+t.note:'\n※保護者のどなたでも回答できます。');

    var daysHtml=(data.days||[]).map(function(d){
      return t.form==='family'?renderFamilyDay(d):renderMarksDay(d);
    }).join('');

    var roleBlock=t.form==='marks'
      ? '<div class="att-field" style="margin-top:10px"><label for="att-role-suffix">続柄（任意）</label>'
        +'<input id="att-role-suffix" maxlength="20" placeholder="例: 父／母　空欄でも可" value="'+esc(prefs.roleSuffix!=null?prefs.roleSuffix:(t.role||''))+'" autocomplete="off">'
        +'<p class="att-act-meta" style="margin-top:4px">投稿文の名前の後ろに付きます。不要なら空欄のまま。</p></div>'
      : '';

    $('att-main').innerHTML=
      '<div class="att-card"><h2>'+esc(title)+'</h2>'
      +(data.campaign.memo?'<p class="att-act-meta">'+esc(data.campaign.memo)+'</p>':'')
      +'</div>'
      +'<div class="att-parent-note">'+esc(note).replace(/\n/g,'<br>')+'</div>'
      +'<div class="att-card">'
      +'<div class="att-step"><span class="att-step-num">1</span><label for="att-pick">選手名を選ぶ</label></div>'
      +'<select id="att-pick" class="att-pick" aria-label="選手名"><option value="">選択してください</option>'+opts+'</select>'
      +'<p id="att-pick-hint" class="att-act-meta">選手を選ぶと、下の入力欄が使えます。</p>'
      +roleBlock
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
    var pick=$('att-pick');
    if(pick&&pick.value){
      unlockForm();
      fillExisting(pick.value);
      applyPrefsToForm();
    }else{
      lockForm();
    }
  }

  function lockForm(){
    var panel=$('att-form-panel');
    var btn=$('att-submit');
    var hint=$('att-pick-hint');
    if(panel){
      panel.classList.add('att-form-locked');
      panel.setAttribute('aria-disabled','true');
    }
    if(btn)btn.disabled=true;
    if(hint)hint.classList.remove('att-hidden');
  }

  function unlockForm(){
    var panel=$('att-form-panel');
    var btn=$('att-submit');
    var hint=$('att-pick-hint');
    if(panel){
      panel.classList.remove('att-form-locked');
      panel.setAttribute('aria-disabled','false');
    }
    if(btn&&!submitting)btn.disabled=false;
    if(hint)hint.classList.add('att-hidden');
  }

  function renderFamilyDay(d){
    var dt=d.activityDate;
    return '<div class="att-member" data-day="'+esc(dt)+'">'
      +'<div class="att-member-name">'+(F.dayHead?F.dayHead(dt):esc(dt))+'</div>'
      +'<div class="att-seg" style="margin-bottom:8px">'
      +'<button type="button" class="att-mode is-on-in" data-mode="on" data-date="'+esc(dt)+'">出席連絡</button>'
      +'<button type="button" class="att-mode" data-mode="off" data-date="'+esc(dt)+'">休み</button>'
      +'</div>'
      +'<div class="att-on-block" data-date="'+esc(dt)+'">'
      +'<p class="att-act-meta">①父側の保護者 <span class="att-hint-inline">いない場合は「なし」</span></p>'
      +'<div class="att-seg">'+markBtns('father','unset',dt,true)+'</div>'
      +'<p class="att-act-meta">①母側の保護者 <span class="att-hint-inline">いない場合は「なし」</span></p>'
      +'<div class="att-seg">'+markBtns('mother','unset',dt,true)+'</div>'
      +'<div class="att-field"><label>②兄弟</label><input data-f="siblings" data-date="'+esc(dt)+'" value="なし" autocomplete="off"></div>'
      +'<div class="att-field"><label>②その他</label><input data-f="other" data-date="'+esc(dt)+'" value="―" autocomplete="off"></div>'
      +'<p class="att-act-meta">③配車の可否</p><div class="att-seg">'+markBtns('carOk','unset',dt,false)+'</div>'
      +'<div class="att-field"><label>④車種</label><input data-f="carModel" data-date="'+esc(dt)+'" placeholder="例: RAV4" autocomplete="off"></div>'
      +'<div class="att-field"><label>⑤乗車可能人数</label><input data-f="seats" data-date="'+esc(dt)+'" inputmode="numeric" placeholder="例: 2" autocomplete="off"></div>'
      +'<div class="att-field"><label>⑥送り</label><input data-f="send" data-date="'+esc(dt)+'" placeholder="例: 母（RAV4）／祖母 など" autocomplete="off"></div>'
      +'<div class="att-field"><label>⑦迎え</label><input data-f="pickup" data-date="'+esc(dt)+'" placeholder="例: 母（RAV4）／祖父 など" autocomplete="off"></div>'
      +'</div>'
      +'<div class="att-off-block att-hidden" data-date="'+esc(dt)+'">'
      +'<div class="att-field"><label>休みの理由</label><input data-f="offNote" data-date="'+esc(dt)+'" placeholder="例: 学校行事" autocomplete="off"></div>'
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
    return {days:days};
  }

  function collectMarksPayload(){
    var days={};
    (data.days||[]).forEach(function(d){
      var dt=d.activityDate;
      var wrap=document.querySelector('.att-member[data-day="'+dt+'"]');
      if(!wrap)return;
      days[dt]=selectedMark(wrap,'dayMark',dt);
    });
    var roleEl=$('att-role-suffix');
    var roleSuffix=roleEl?String(roleEl.value||'').trim():'';
    return {days:days, roleSuffix:roleSuffix};
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
    if(trackInfo().form!=='family'){
      var roleEl=$('att-role-suffix');
      if(roleEl&&prev.roleSuffix!=null)roleEl.value=String(prev.roleSuffix||'');
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
    if(trackInfo().form==='marks'&&payload){
      patch.roleSuffix=payload.roleSuffix!=null?String(payload.roleSuffix):'';
    }
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
      btn.disabled=isFormLocked();
      btn.textContent='送信する';
      btn.classList.remove('att-btn-busy');
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
    setStatus('選手名を選んで回答を始めてください');
  }

  async function submit(){
    if(submitting)return;
    var c=ensureClient();
    if(!c)return;
    var name=($('att-pick')&&$('att-pick').value)||'';
    if(!name){
      setStatus('先に選手名を選んでください', true);
      var pick=$('att-pick');
      if(pick)pick.focus();
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
      unlockForm();
      fillExisting(name);
      applyPrefsToForm();
      var t=trackInfo();
      var text=t.form==='family'
        ? F.formatFamilyLine(name, data.days, payload)
        : F.formatMarksLine(name, data.days, payload, (payload&&payload.roleSuffix)!=null?payload.roleSuffix:(t.role||''));
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
    if(!name){
      lockForm();
      setStatus('選手名を選んで回答を始めてください');
      return;
    }
    unlockForm();
    savePrefs({memberName:name});
    fillExisting(name);
    applyPrefsToForm();
    setStatus(name+' の回答を入力できます');
  }

  document.addEventListener('DOMContentLoaded', function(){
    $('att-main').addEventListener('change', function(ev){
      if(ev.target&&ev.target.id==='att-pick')onPickChanged();
    });
    $('att-main').addEventListener('click', function(ev){
      var t=ev.target;
      if(!t)return;
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
