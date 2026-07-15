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
  var sid=qs('sid');
  var client=null;
  var data=null;

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

  function markBtns(name, current, datescope){
    var cur=current||'unset';
    return ['o','t','x'].map(function(m){
      var label=m==='o'?'◯':(m==='t'?'△':'✕');
      var on=cur===m?' is-on-'+(m==='o'?'in':(m==='x'?'out':'maybe')):'';
      return '<button type="button" class="'+on.trim()+'" data-mark-field="'+name+'" data-mark="'+m+'" data-date="'+esc(datescope||'')+'">'+label+'</button>';
    }).join('');
  }

  function render(){
    if(!data||!data.campaign){
      $('att-main').innerHTML='<div class="att-card"><p>出欠情報を表示できません。</p></div>';
      return;
    }
    var track=data.track;
    var title=data.campaign.title||'出欠確認';
    $('att-hdr-title').innerHTML=(track==='mg'?'MG（母）回答':'親父回答')+'<span>'+esc(cfg.teamName||'')+'</span>';

    if(data.closed==1||data.closed==='1'){
      $('att-main').innerHTML='<div class="att-card"><h2>'+esc(title)+'</h2><p>受付終了しています。</p></div>';
      return;
    }

    var opts=(data.members||[]).map(function(n){
      var done=data.responses&&data.responses[n]?'（回答済）':'';
      return '<option value="'+esc(n)+'">'+esc(n)+done+'</option>';
    }).join('');

    var note=track==='mg'
      ? '選手（お子さま）を選び、日ごとに母フォーム（父／母／配車など）を入力してください。送信後、MG LINE用の投稿文をコピーできます。'
      : '選手を選び、日ごとに◯／△／✕を選んで送信してください。送信後、親父LINE用の本文をコピーできます。※当面はLINEスケジュールへの回答も従来どおりお願いします。';

    var daysHtml=(data.days||[]).map(function(d){
      return track==='mg'?renderMgDay(d):renderFaDay(d);
    }).join('');

    $('att-main').innerHTML=
      '<div class="att-card"><h2>'+esc(title)+'</h2>'
      +(data.campaign.memo?'<p class="att-act-meta">'+esc(data.campaign.memo)+'</p>':'')
      +'</div>'
      +'<div class="att-parent-note">'+note+'</div>'
      +'<div class="att-card">'
      +'<label for="att-pick" style="font-size:12px;font-weight:700;color:#6e6e78">選手名</label>'
      +'<select id="att-pick" class="att-pick"><option value="">選択してください</option>'+opts+'</select>'
      +daysHtml
      +'<button type="button" id="att-submit" class="att-btn att-btn-primary" style="width:100%;margin-top:10px">送信する</button>'
      +'</div>'
      +'<div id="att-result" class="att-card att-hidden">'
      +'<h2>LINE投稿用テキスト</h2>'
      +'<pre id="att-line-out" class="att-preview"></pre>'
      +'<button type="button" id="att-copy" class="att-btn att-btn-line" style="width:100%;margin-top:8px">コピー</button>'
      +'</div>';

    wireDayToggles();
  }

  function renderMgDay(d){
    var dt=d.activityDate;
    return '<div class="att-member" data-day="'+esc(dt)+'">'
      +'<div class="att-member-name">'+(F.dayHead?F.dayHead(dt):esc(dt))+'</div>'
      +'<div class="att-seg" style="margin-bottom:8px">'
      +'<button type="button" class="att-mode is-on-in" data-mode="on" data-date="'+esc(dt)+'">出席連絡</button>'
      +'<button type="button" class="att-mode" data-mode="off" data-date="'+esc(dt)+'">休み</button>'
      +'</div>'
      +'<div class="att-on-block" data-date="'+esc(dt)+'">'
      +'<p class="att-act-meta">①父</p><div class="att-seg">'+markBtns('father','unset',dt)+'</div>'
      +'<p class="att-act-meta">①母</p><div class="att-seg">'+markBtns('mother','unset',dt)+'</div>'
      +'<div class="att-field"><label>②兄弟</label><input data-f="siblings" data-date="'+esc(dt)+'" value="なし"></div>'
      +'<div class="att-field"><label>②その他</label><input data-f="other" data-date="'+esc(dt)+'" value="―"></div>'
      +'<p class="att-act-meta">③配車の可否</p><div class="att-seg">'+markBtns('carOk','unset',dt)+'</div>'
      +'<div class="att-field"><label>④車種</label><input data-f="carModel" data-date="'+esc(dt)+'" placeholder="例: RAV4"></div>'
      +'<div class="att-field"><label>⑤乗車可能人数</label><input data-f="seats" data-date="'+esc(dt)+'" inputmode="numeric" placeholder="例: 2"></div>'
      +'<div class="att-field"><label>⑥送り</label><input data-f="send" data-date="'+esc(dt)+'" placeholder="例: 父（RAV4）"></div>'
      +'<div class="att-field"><label>⑦迎え</label><input data-f="pickup" data-date="'+esc(dt)+'" placeholder="例: 父（RAV4）"></div>'
      +'</div>'
      +'<div class="att-off-block att-hidden" data-date="'+esc(dt)+'">'
      +'<div class="att-field"><label>休みの理由</label><input data-f="offNote" data-date="'+esc(dt)+'" placeholder="例: 学校行事"></div>'
      +'</div></div>';
  }

  function renderFaDay(d){
    var dt=d.activityDate;
    return '<div class="att-member" data-day="'+esc(dt)+'">'
      +'<div class="att-member-name">'+(F.dayHead?F.dayHead(dt):esc(dt))+'</div>'
      +'<div class="att-seg">'+markBtns('fatherDay','unset',dt)+'</div>'
      +'</div>';
  }

  function wireDayToggles(){
    $('att-main').querySelectorAll('button.att-mode').forEach(function(btn){
      btn.addEventListener('click', function(){
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
        var field=btn.getAttribute('data-mark-field');
        var dt=btn.getAttribute('data-date');
        var seg=btn.parentElement;
        seg.querySelectorAll('button[data-mark-field="'+field+'"]').forEach(function(b){
          if(b.getAttribute('data-date')===dt)b.className='';
        });
        var m=btn.getAttribute('data-mark');
        btn.className='is-on-'+(m==='o'?'in':(m==='x'?'out':'maybe'));
      });
    });
  }

  function selectedMark(wrap, field, dt){
    var on=wrap.querySelector('button[data-mark-field="'+field+'"][data-date="'+dt+'"].is-on-in,button[data-mark-field="'+field+'"][data-date="'+dt+'"].is-on-out,button[data-mark-field="'+field+'"][data-date="'+dt+'"].is-on-maybe');
    if(!on)return 'unset';
    return on.getAttribute('data-mark')||'unset';
  }

  function fieldVal(wrap, f, dt){
    var el=wrap.querySelector('[data-f="'+f+'"][data-date="'+dt+'"]');
    return el?String(el.value||'').trim():'';
  }

  function collectMgPayload(){
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

  function collectFaPayload(){
    var days={};
    (data.days||[]).forEach(function(d){
      var dt=d.activityDate;
      var wrap=document.querySelector('.att-member[data-day="'+dt+'"]');
      if(!wrap)return;
      days[dt]=selectedMark(wrap,'fatherDay',dt);
    });
    return {days:days};
  }

  function fillExisting(name){
    var prev=data.responses&&data.responses[name];
    if(!prev||!prev.days)return;
    if(data.track==='father'){
      (data.days||[]).forEach(function(d){
        var dt=d.activityDate;
        var mk=prev.days[dt];
        if(!mk||mk==='unset')return;
        var btn=document.querySelector('button[data-mark-field="fatherDay"][data-date="'+dt+'"][data-mark="'+mk+'"]');
        if(btn)btn.click();
      });
      return;
    }
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
          if(el&&row[f]!=null)el.value=row[f];
        });
      }
    });
  }

  async function load(){
    var c=ensureClient();
    if(!c)return;
    if(!sid){setStatus('URLが不正です（sidがありません）', true);return;}
    setStatus('読み込み中…');
    data=await c.load(sid);
    render();
    setStatus('入力できます');
  }

  async function submit(){
    var c=ensureClient();
    if(!c)return;
    var name=($('att-pick')&&$('att-pick').value)||'';
    if(!name){setStatus('選手名を選んでください', true);return;}
    var payload=data.track==='mg'?collectMgPayload():collectFaPayload();
    setStatus('送信中…');
    data=await c.respond({sid:sid, memberName:name, payload:payload});
    render();
    if($('att-pick'))$('att-pick').value=name;
    fillExisting(name);
    var text=data.track==='mg'
      ? F.formatMotherLine(name, data.days, payload)
      : F.formatFatherLine(name, data.days, payload);
    $('att-result').classList.remove('att-hidden');
    $('att-line-out').textContent=text;
    setStatus('受け付けました。下の投稿文をLINEへコピーしてください');
  }

  document.addEventListener('DOMContentLoaded', function(){
    $('att-main').addEventListener('change', function(ev){
      if(ev.target&&ev.target.id==='att-pick'&&ev.target.value){
        fillExisting(ev.target.value);
      }
    });
    $('att-main').addEventListener('click', function(ev){
      if(ev.target&&ev.target.id==='att-submit'){
        submit().catch(function(e){
          var msg=e.message||String(e);
          if(msg==='too_fast')msg='連続送信のため少し待ってください';
          setStatus(msg, true);
        });
      }
      if(ev.target&&ev.target.id==='att-copy'){
        var t=$('att-line-out').textContent||'';
        navigator.clipboard.writeText(t).then(function(){setStatus('コピーしました');})
          .catch(function(){setStatus('コピーに失敗しました', true);});
      }
    });
    load().catch(function(e){setStatus(e.message||String(e), true);});
  });
})();
