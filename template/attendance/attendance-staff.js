(function(){
  'use strict';

  function $(id){return document.getElementById(id);}
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function simpleHash(str){
    var h=5381,i=0,s=String(str||'');
    for(;i<s.length;i++)h=((h<<5)+h)+s.charCodeAt(i);
    return (h>>>0).toString(16);
  }

  var cfg=window.TCB_ATT_CFG||{};
  var F=window.TCB_AttFormat||{};
  var TRACKS=cfg.tracks||{
    a:{label:'A',short:'A',form:'family',role:'',note:''},
    b:{label:'B',short:'B',form:'marks',role:'',note:''}
  };
  var LS_OK=(cfg.lsPrefix||'tcb15')+'_att_ok';
  var sync=null;
  var state={campaigns:[], detail:null, selectedId:'', unanswered:{a:[],b:[]}};

  var ERR_JA={
    unauthorized:'認証に失敗しました（トークン設定を確認してください）',
    cohort_required:'世代キーが未設定です',
    campaign_not_found:'キャンペーンが見つかりません',
    days_required:'日付を1つ以上入力してください',
    days_too_many:'日付が多すぎます（最大14日）',
    activity_date_invalid:'日付の形式が不正です',
    kind_invalid:'種別が不正です',
    member_not_found:'選手がマスタに見つかりません',
    track_invalid:'トラック指定が不正です',
    version_conflict:'他の端末で更新されています。再読込してください'
  };
  function jaErr(e){
    var m=(e&&e.message)?e.message:String(e||'');
    return ERR_JA[m]||m;
  }

  function setStatus(msg, isErr){
    var el=$('att-status');
    if(!el)return;
    el.textContent=msg||'';
    el.className='att-status'+(isErr?' err':'');
  }

  function ensureSync(){
    if(sync)return sync;
    sync=TCB_createSyncClient({
      baseUrl:cfg.apiBase||'',
      token:cfg.apiToken||'',
      cohort:String(cfg.cohort||'')
    });
    if(!sync)setStatus('同期設定が無効です（トークン未注入の可能性）', true);
    return sync;
  }

  function parentUrl(shareId){
    if(!shareId)return '';
    var base=String(cfg.pagesBase||'').replace(/\/+$/,'');
    if(base)return base+'/attendance/kaito.html?sid='+encodeURIComponent(shareId);
    try{
      var u=new URL('kaito.html', location.href);
      u.searchParams.set('sid', shareId);
      return u.toString();
    }catch(e){
      return 'kaito.html?sid='+encodeURIComponent(shareId);
    }
  }

  function addDayRow(prefill){
    prefill=prefill||{};
    var box=$('att-day-rows');
    var row=document.createElement('div');
    row.className='att-row att-day-row';
    row.innerHTML=
      '<div class="att-field"><label>日付</label><input type="date" class="att-d-date" required></div>'+
      '<div class="att-field"><label>開始</label><input type="time" class="att-d-time"></div>'+
      '<div class="att-field"><label>種別</label><select class="att-d-kind"><option value="practice">練習</option><option value="game">試合</option><option value="other">その他</option></select></div>'+
      '<div class="att-field"><label>場所</label><input class="att-d-place" maxlength="120" placeholder="任意"></div>'+
      '<button type="button" class="att-btn att-btn-ghost att-d-del">削除</button>';
    box.appendChild(row);
    if(prefill.activityDate)row.querySelector('.att-d-date').value=prefill.activityDate;
    if(prefill.startTime)row.querySelector('.att-d-time').value=prefill.startTime;
    if(prefill.kind)row.querySelector('.att-d-kind').value=prefill.kind;
    if(prefill.place)row.querySelector('.att-d-place').value=prefill.place;
    row.querySelector('.att-d-del').addEventListener('click', function(){
      if(box.querySelectorAll('.att-day-row').length<=1)return;
      row.remove();
    });
  }

  function collectDays(){
    var rows=[].slice.call(document.querySelectorAll('.att-day-row'));
    return rows.map(function(r){
      return {
        activityDate:r.querySelector('.att-d-date').value,
        startTime:r.querySelector('.att-d-time').value,
        kind:r.querySelector('.att-d-kind').value,
        place:r.querySelector('.att-d-place').value.trim()
      };
    }).filter(function(d){return !!d.activityDate;});
  }

  function renderList(){
    var box=$('att-list');
    if(!state.campaigns.length){
      box.innerHTML='<p class="att-act-meta">キャンペーンがありません。</p>';
      return;
    }
    box.innerHTML=state.campaigns.map(function(c){
      var days=(c.days||[]).map(function(d){return d.activityDate;}).join(' / ');
      var active=c.id===state.selectedId?' is-active':'';
      var ans=c.answered||{};
      return '<div class="att-act-item'+active+'" data-id="'+esc(c.id)+'">'
        +'<div class="att-act-title">'+esc(c.title||'（無題）')
        +(c.status==='closed'?' <span class="att-pill">受付終了</span>':'')
        +'</div>'
        +'<div class="att-act-meta">'+esc(days)+'</div>'
        +'<div class="att-counts">'
        +'<span class="ok">'+esc(TRACKS.a.short)+' '+(ans.a||0)+'</span>'
        +'<span class="maybe">'+esc(TRACKS.b.short)+' '+(ans.b||0)+'</span>'
        +'</div></div>';
    }).join('');
  }

  function trackLineText(trackKey, name, days, payload){
    var t=TRACKS[trackKey]||{};
    if(t.form==='family')return F.formatFamilyLine(name, days, payload);
    return F.formatMarksLine(name, days, payload, t.role||'');
  }

  function renderDetail(){
    var d=state.detail;
    var panel=$('att-detail');
    var empty=$('att-detail-empty');
    if(!d||!d.campaign){
      if(panel)panel.classList.add('att-hidden');
      if(empty)empty.classList.remove('att-hidden');
      return;
    }
    if(empty)empty.classList.add('att-hidden');
    if(panel)panel.classList.remove('att-hidden');
    var c=d.campaign;
    var ans=d.answered||{};
    $('att-d-title').textContent=c.title||'出欠';
    $('att-d-meta').textContent=(c.days||[]).map(function(x){return x.activityDate;}).join(' ・ ');
    $('att-d-counts').innerHTML=
      '<span class="ok">'+esc(TRACKS.a.short)+'回答 '+(ans.a||0)+'/'+(d.memberTotal||0)+'</span>'+
      '<span class="maybe">'+esc(TRACKS.b.short)+'回答 '+(ans.b||0)+'/'+(d.memberTotal||0)+'</span>';
    var closed=c.status==='closed';
    $('att-status-badge').textContent=closed?'状態: 受付終了（保護者は新規回答不可）':'状態: 受付中';
    var toggle=$('att-btn-toggle-status');
    if(toggle)toggle.textContent=closed?'受付を再開する':'受付を終了する';
    $('att-url-a').textContent=parentUrl(c.shareIdA)||'（未発行）';
    $('att-url-b').textContent=parentUrl(c.shareIdB)||'（未発行）';

    var unA=[], unB=[];
    $('att-roster').innerHTML=(d.roster||[]).map(function(r){
      if(!r.a)unA.push(r.name);
      if(!r.b)unB.push(r.name);
      var aText=r.a?trackLineText('a', r.name, c.days, r.a.payload):'';
      var bText=r.b?trackLineText('b', r.name, c.days, r.b.payload):'';
      return '<div class="att-member">'
        +'<div class="att-member-name">'+esc(r.name)
        +' <span class="att-pill '+(r.a?'ok':'none')+'">'+esc(TRACKS.a.short)+':'+(r.a?'済':'未')+'</span> '
        +'<span class="att-pill '+(r.b?'ok':'none')+'">'+esc(TRACKS.b.short)+':'+(r.b?'済':'未')+'</span></div>'
        +(aText?'<details><summary class="att-act-meta">'+esc(TRACKS.a.short)+'投稿文</summary><pre class="att-preview">'+esc(aText)+'</pre></details>':'')
        +(bText?'<details><summary class="att-act-meta">'+esc(TRACKS.b.short)+'投稿文</summary><pre class="att-preview">'+esc(bText)+'</pre></details>':'')
        +'</div>';
    }).join('');
    state.unanswered={a:unA, b:unB};
  }

  async function refreshList(){
    var client=ensureSync();
    if(!client)return;
    setStatus('一覧を読込中…');
    var res=await client.listCampaigns();
    state.campaigns=res.campaigns||[];
    renderList();
    setStatus('一覧を更新しました');
  }

  async function openCampaign(id){
    var client=ensureSync();
    if(!client)return;
    state.selectedId=id;
    setStatus('詳細を読込中…');
    state.detail=await client.getCampaign(id);
    renderList();
    renderDetail();
    setStatus('詳細を更新しました');
  }

  async function createCampaign(ev){
    ev.preventDefault();
    var client=ensureSync();
    if(!client)return;
    var days=collectDays();
    if(!days.length){
      setStatus('日付を1つ以上入力してください', true);
      return;
    }
    setStatus('作成中…');
    var res=await client.upsertCampaign({
      title:$('att-title').value.trim(),
      memo:$('att-memo').value.trim(),
      days:days
    });
    await refreshList();
    if(res.campaign&&res.campaign.id)await openCampaign(res.campaign.id);
    setStatus('キャンペーンを作成しました');
  }

  async function publish(){
    var client=ensureSync();
    if(!client||!state.selectedId)return;
    setStatus('URL発行中…');
    await client.publishAttendance({id:state.selectedId, track:'both'});
    await openCampaign(state.selectedId);
    setStatus('回答URLを発行しました（'+TRACKS.a.short+'／'+TRACKS.b.short+'）');
  }

  async function copyText(t){
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(t);
        setStatus('コピーしました');
        return;
      }
      throw new Error('no_clipboard');
    }catch(e){
      try{
        var ta=document.createElement('textarea');
        ta.value=t;
        ta.setAttribute('readonly','');
        ta.style.position='fixed';
        ta.style.top='0';
        ta.style.left='0';
        ta.style.opacity='0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok=document.execCommand('copy');
        document.body.removeChild(ta);
        if(ok){setStatus('コピーしました');return;}
      }catch(e2){}
      setStatus('コピーに失敗しました。表示中の文面を長押ししてコピーしてください', true);
      window.prompt('コピーできませんでした。次の文面を選択してコピーしてください:', t);
    }
  }

  function gateOk(){
    try{return sessionStorage.getItem(LS_OK)==='1';}catch(e){return false;}
  }
  function setGateOk(){
    try{sessionStorage.setItem(LS_OK,'1');}catch(e){}
  }
  function tryLogin(){
    var v=($('att-pw-inp')&&$('att-pw-inp').value)||'';
    if(simpleHash(v)===simpleHash(cfg.initialPw||'')){
      setGateOk();
      $('att-pw').classList.add('att-hidden');
      bootApp();
    }else{
      $('att-pw-err').textContent='パスワードが違います';
    }
  }

  function bind(){
    addDayRow();
    addDayRow();
    $('att-add-day').addEventListener('click', function(){addDayRow();});
    $('att-create-form').addEventListener('submit', function(ev){
      createCampaign(ev).catch(function(e){setStatus(jaErr(e), true);});
    });
    $('att-list').addEventListener('click', function(ev){
      var item=ev.target.closest('.att-act-item');
      if(!item)return;
      openCampaign(item.getAttribute('data-id')).catch(function(e){setStatus(jaErr(e), true);});
    });
    $('att-btn-publish').addEventListener('click', function(){
      publish().catch(function(e){setStatus(jaErr(e), true);});
    });
    $('att-btn-copy-a-inv').addEventListener('click', function(){
      if(!state.detail)return;
      var c=state.detail.campaign;
      copyText(F.formatInvite(TRACKS.a.label, c, parentUrl(c.shareIdA), TRACKS.a.note||'', TRACKS.a.form));
    });
    $('att-btn-copy-b-inv').addEventListener('click', function(){
      if(!state.detail)return;
      var c=state.detail.campaign;
      copyText(F.formatInvite(TRACKS.b.label, c, parentUrl(c.shareIdB), TRACKS.b.note||'', TRACKS.b.form));
    });
    $('att-btn-remind-a').addEventListener('click', function(){
      if(!state.detail)return;
      var c=state.detail.campaign;
      copyText(F.formatRemind(TRACKS.a.label, c, parentUrl(c.shareIdA), state.unanswered.a||[]));
    });
    $('att-btn-remind-b').addEventListener('click', function(){
      if(!state.detail)return;
      var c=state.detail.campaign;
      copyText(F.formatRemind(TRACKS.b.label, c, parentUrl(c.shareIdB), state.unanswered.b||[]));
    });
    $('att-btn-toggle-status').addEventListener('click', function(){
      var client=ensureSync();
      if(!client||!state.selectedId||!state.detail)return;
      var cur=state.detail.campaign.status==='closed'?'closed':'open';
      var next=cur==='closed'?'open':'closed';
      setStatus(next==='closed'?'受付を終了しています…':'受付を再開しています…');
      client.setCampaignStatus({id:state.selectedId, status:next})
        .then(function(){return openCampaign(state.selectedId);})
        .then(function(){return refreshList();})
        .then(function(){
          setStatus(next==='closed'?'受付を終了しました':'受付を再開しました');
        })
        .catch(function(e){setStatus(jaErr(e), true);});
    });
    $('att-btn-refresh').addEventListener('click', function(){
      var p=state.selectedId?openCampaign(state.selectedId):refreshList();
      Promise.resolve(p).catch(function(e){setStatus(jaErr(e), true);});
    });
    $('att-pw-btn').addEventListener('click', tryLogin);
    $('att-pw-inp').addEventListener('keydown', function(ev){if(ev.key==='Enter')tryLogin();});
  }

  function bootApp(){
    refreshList().catch(function(e){setStatus(jaErr(e), true);});
  }

  document.addEventListener('DOMContentLoaded', function(){
    bind();
    if(gateOk()){
      $('att-pw').classList.add('att-hidden');
      bootApp();
    }
  });
})();
