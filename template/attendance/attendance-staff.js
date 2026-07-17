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
  var LS_OK=(cfg.lsPrefix||'tcb15')+'_att_ok';
  var sync=null;
  var state={campaigns:[], detail:null, selectedId:''};

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
      return '<div class="att-act-item'+active+'" data-id="'+esc(c.id)+'">'
        +'<div class="att-act-title">'+esc(c.title||'（無題）')+'</div>'
        +'<div class="att-act-meta">'+esc(days)+'</div>'
        +'<div class="att-counts">'
        +'<span class="ok">MG '+(c.motherAnswered||0)+'</span>'
        +'<span class="maybe">親父 '+(c.fatherAnswered||0)+'</span>'
        +'</div></div>';
    }).join('');
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
    $('att-d-title').textContent=c.title||'出欠';
    $('att-d-meta').textContent=(c.days||[]).map(function(x){return x.activityDate;}).join(' ・ ');
    $('att-d-counts').innerHTML=
      '<span class="ok">MG回答 '+(d.motherAnswered||0)+'/'+(d.memberTotal||0)+'</span>'+
      '<span class="maybe">親父回答 '+(d.fatherAnswered||0)+'/'+(d.memberTotal||0)+'</span>';
    var closed=c.status==='closed';
    $('att-status-badge').textContent=closed?'状態: 受付終了（保護者は新規回答不可）':'状態: 受付中';
    var toggle=$('att-btn-toggle-status');
    if(toggle)toggle.textContent=closed?'受付を再開する':'受付を終了する';
    $('att-url-mg').textContent=parentUrl(c.shareIdMg)||'（未発行）';
    $('att-url-fa').textContent=parentUrl(c.shareIdFather)||'（未発行）';

    var unansweredMg=[];
    var unansweredFa=[];
    $('att-roster').innerHTML=(d.roster||[]).map(function(r){
      var mg=r.mother?'済':'未';
      var fa=r.father?'済':'未';
      if(!r.mother)unansweredMg.push(r.name);
      if(!r.father)unansweredFa.push(r.name);
      var mgCls=r.mother?'ok':'none';
      var faCls=r.father?'ok':'none';
      var mgText='';
      var faText='';
      if(r.mother&&F.formatMotherLine){
        mgText=F.formatMotherLine(r.name, c.days, r.mother.payload);
      }
      if(r.father&&F.formatFatherLine){
        faText=F.formatFatherLine(r.name, c.days, r.father.payload);
      }
      return '<div class="att-member">'
        +'<div class="att-member-name">'+esc(r.name)
        +' <span class="att-pill '+mgCls+'">MG:'+mg+'</span> '
        +'<span class="att-pill '+faCls+'">親父:'+fa+'</span></div>'
        +(mgText?'<details><summary class="att-act-meta">MG投稿文</summary><pre class="att-preview">'+esc(mgText)+'</pre></details>':'')
        +(faText?'<details><summary class="att-act-meta">親父投稿文</summary><pre class="att-preview">'+esc(faText)+'</pre></details>':'')
        +'</div>';
    }).join('');
    state.unansweredMg=unansweredMg;
    state.unansweredFa=unansweredFa;
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
    setStatus('MG／親父の回答URLを発行しました');
  }

  async function copyText(t){
    try{
      await navigator.clipboard.writeText(t);
      setStatus('コピーしました');
    }catch(e){
      setStatus('コピーに失敗しました', true);
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
      createCampaign(ev).catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-list').addEventListener('click', function(ev){
      var item=ev.target.closest('.att-act-item');
      if(!item)return;
      openCampaign(item.getAttribute('data-id')).catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-btn-publish').addEventListener('click', function(){
      publish().catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-btn-copy-mg-inv').addEventListener('click', function(){
      if(!state.detail)return;
      var c=state.detail.campaign;
      copyText(F.formatMgInvite(c, parentUrl(c.shareIdMg)));
    });
    $('att-btn-copy-fa-inv').addEventListener('click', function(){
      if(!state.detail)return;
      var c=state.detail.campaign;
      copyText(F.formatFatherInvite(c, parentUrl(c.shareIdFather)));
    });
    $('att-btn-remind-mg').addEventListener('click', function(){
      if(!state.detail||!F.formatRemind)return;
      var c=state.detail.campaign;
      copyText(F.formatRemind('mg', c, parentUrl(c.shareIdMg), state.unansweredMg||[]));
    });
    $('att-btn-remind-fa').addEventListener('click', function(){
      if(!state.detail||!F.formatRemind)return;
      var c=state.detail.campaign;
      copyText(F.formatRemind('father', c, parentUrl(c.shareIdFather), state.unansweredFa||[]));
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
        .catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-btn-refresh').addEventListener('click', function(){
      var p=state.selectedId?openCampaign(state.selectedId):refreshList();
      Promise.resolve(p).catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-pw-btn').addEventListener('click', tryLogin);
    $('att-pw-inp').addEventListener('keydown', function(ev){if(ev.key==='Enter')tryLogin();});
  }

  function bootApp(){
    refreshList().catch(function(e){setStatus(e.message||String(e), true);});
  }

  document.addEventListener('DOMContentLoaded', function(){
    bind();
    if(gateOk()){
      $('att-pw').classList.add('att-hidden');
      bootApp();
    }
  });
})();
