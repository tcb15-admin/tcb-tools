(function(){
  'use strict';

  function $(id){return document.getElementById(id);}
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function kindLabel(k){
    if(k==='game')return '試合';
    if(k==='other')return 'その他';
    return '練習';
  }
  function statusLabel(s){
    if(s==='in')return '出';
    if(s==='out')return '欠';
    if(s==='maybe')return '未定';
    return '未回答';
  }
  /* tool と同じ簡易ハッシュ（djb2 系）。名前は sha だが暗号ではない */
  function simpleHash(str){
    var h=5381,i=0,s=String(str||'');
    for(;i<s.length;i++)h=((h<<5)+h)+s.charCodeAt(i);
    return (h>>>0).toString(16);
  }

  var cfg=window.TCB_ATT_CFG||{};
  var LS_OK=(cfg.lsPrefix||'tcb15')+'_att_ok';
  var sync=null;
  var state={activities:[], detail:null, selectedId:''};

  function setStatus(msg, isErr){
    var el=$('att-status');
    if(!el)return;
    el.textContent=msg||'';
    el.className='att-status'+(isErr?' err':'');
  }

  function ensureSync(){
    if(sync)return sync;
    if(typeof TCB_createSyncClient!=='function'){
      setStatus('同期ライブラリを読み込めませんでした', true);
      return null;
    }
    sync=TCB_createSyncClient({
      baseUrl:cfg.apiBase||'',
      token:cfg.apiToken||'',
      cohort:String(cfg.cohort||'')
    });
    if(!sync){
      setStatus('同期設定が無効です（トークン未注入のビルドの可能性）', true);
    }
    return sync;
  }

  function countsHtml(c){
    c=c||{};
    return '<div class="att-counts">'
      +'<span class="ok">出 '+(c.in||0)+'</span>'
      +'<span class="ng">欠 '+(c.out||0)+'</span>'
      +'<span class="maybe">未定 '+(c.maybe||0)+'</span>'
      +'<span class="none">未回答 '+(c.unset||0)+'</span>'
      +'</div>';
  }

  function renderList(){
    var box=$('att-list');
    if(!box)return;
    if(!state.activities.length){
      box.innerHTML='<p class="att-act-meta">活動がありません。上のフォームから作成してください。</p>';
      return;
    }
    box.innerHTML=state.activities.map(function(a){
      var title=a.title|| (kindLabel(a.kind)+' '+a.activityDate);
      var meta=[a.activityDate, a.startTime, a.place].filter(Boolean).join(' ・ ');
      var active=a.id===state.selectedId?' is-active':'';
      return '<div class="att-act-item'+active+'" data-id="'+esc(a.id)+'">'
        +'<div class="att-act-title">'+esc(title)+' <span class="att-pill">'+esc(kindLabel(a.kind))+'</span></div>'
        +'<div class="att-act-meta">'+esc(meta)+'</div>'
        +countsHtml(a.counts)
        +'</div>';
    }).join('');
  }

  function renderDetail(){
    var d=state.detail;
    var panel=$('att-detail');
    var empty=$('att-detail-empty');
    if(!d||!d.activity){
      if(panel)panel.classList.add('att-hidden');
      if(empty)empty.classList.remove('att-hidden');
      return;
    }
    if(empty)empty.classList.add('att-hidden');
    if(panel)panel.classList.remove('att-hidden');
    var a=d.activity;
    $('att-d-title').textContent=a.title|| (kindLabel(a.kind)+' '+a.activityDate);
    $('att-d-meta').textContent=[a.activityDate, a.startTime, a.place, kindLabel(a.kind)].filter(Boolean).join(' ・ ');
    $('att-d-counts').innerHTML=countsHtml(a.counts);
    var url=parentAnswerUrl(a.shareId);
    $('att-share-url').textContent=url||'（まだ公開URLがありません。「回答URLを発行」を押してください）';
    $('att-line-preview').textContent=buildLineText(d, url);

    var rosterBox=$('att-roster');
    rosterBox.innerHTML=(d.roster||[]).map(function(m){
      return '<div class="att-member" data-name="'+esc(m.name)+'">'
        +'<div class="att-member-name">'+esc(m.name)+'</div>'
        +'<div class="att-seg">'
        +segBtn(m,'in','出')+segBtn(m,'out','欠')+segBtn(m,'maybe','未定')+segBtn(m,'unset','未')
        +'</div>'
        +(m.comment?'<div class="att-act-meta">コメント: '+esc(m.comment)+'</div>':'')
        +'</div>';
    }).join('');
  }

  function segBtn(m, st, label){
    var on=m.status===st?' is-on-'+st:'';
    return '<button type="button" data-status="'+st+'" class="'+on.trim()+'">'+label+'</button>';
  }

  function parentAnswerUrl(shareId){
    if(!shareId)return '';
    var base=String(cfg.pagesBase||'').replace(/\/+$/,'');
    if(base){
      return base+'/attendance/kaito.html?sid='+encodeURIComponent(shareId);
    }
    try{
      var u=new URL('kaito.html', window.location.href);
      u.searchParams.set('sid', shareId);
      return u.toString();
    }catch(e){
      return 'kaito.html?sid='+encodeURIComponent(shareId);
    }
  }

  function buildLineText(detail, url){
    var a=detail.activity||{};
    var c=a.counts||{};
    var lines=[];
    lines.push('【出欠のお願い】');
    lines.push((a.title||kindLabel(a.kind))+'（'+a.activityDate+(a.startTime?' '+a.startTime:'')+'）');
    if(a.place)lines.push('場所: '+a.place);
    if(a.memo)lines.push(a.memo);
    lines.push('');
    if(url){
      lines.push('▼回答はこちら');
      lines.push(url);
    }else{
      lines.push('（回答URL未発行）');
    }
    lines.push('');
    lines.push('状況: 出'+(c.in||0)+' / 欠'+(c.out||0)+' / 未定'+(c.maybe||0)+' / 未回答'+(c.unset||0));
    var unanswered=(detail.roster||[]).filter(function(m){return m.status==='unset';}).map(function(m){return m.name;});
    if(unanswered.length){
      lines.push('');
      lines.push('【未回答の方】');
      lines.push(unanswered.join('、'));
      lines.push('お手数ですがご回答お願いします。');
    }
    return lines.join('\n');
  }

  function buildRemindText(detail){
    var unanswered=(detail.roster||[]).filter(function(m){return m.status==='unset';}).map(function(m){return m.name;});
    var a=detail.activity||{};
    var url=parentAnswerUrl(a.shareId);
    var lines=['【出欠リマインド】', a.title||kindLabel(a.kind), a.activityDate+(a.startTime?' '+a.startTime:'')];
    if(url){lines.push('');lines.push(url);}
    lines.push('');
    if(!unanswered.length){
      lines.push('現在、未回答の方はいません。');
    }else{
      lines.push('未回答: '+unanswered.join('、'));
      lines.push('ご回答をお願いします。');
    }
    return lines.join('\n');
  }

  async function refreshList(){
    var client=ensureSync();
    if(!client)return;
    setStatus('一覧を読込中…');
    var res=await client.listActivities();
    state.activities=res.activities||[];
    renderList();
    setStatus('一覧を更新しました');
  }

  async function openActivity(id){
    var client=ensureSync();
    if(!client)return;
    state.selectedId=id;
    setStatus('詳細を読込中…');
    var res=await client.getActivity(id);
    state.detail=res;
    renderList();
    renderDetail();
    setStatus('詳細を更新しました');
  }

  async function createActivity(ev){
    ev.preventDefault();
    var client=ensureSync();
    if(!client)return;
    var payload={
      activityDate:$('att-date').value,
      startTime:$('att-time').value,
      place:$('att-place').value.trim(),
      kind:$('att-kind').value,
      title:$('att-title').value.trim(),
      memo:$('att-memo').value.trim()
    };
    if(!payload.activityDate){
      setStatus('日付を入力してください', true);
      return;
    }
    setStatus('作成中…');
    var res=await client.upsertActivity(payload);
    await refreshList();
    if(res.activity&&res.activity.id)await openActivity(res.activity.id);
    setStatus('活動を作成しました');
  }

  async function publishUrl(){
    var client=ensureSync();
    if(!client||!state.selectedId)return;
    setStatus('URL発行中…');
    var pub=await client.publishAttendance({id:state.selectedId});
    await openActivity(state.selectedId);
    setStatus('回答URLを発行しました');
    if(pub.shareId){
      try{await navigator.clipboard.writeText(parentAnswerUrl(pub.shareId));setStatus('回答URLをコピーしました');}catch(e){}
    }
  }

  async function setMemberStatus(name, status){
    var client=ensureSync();
    if(!client||!state.selectedId)return;
    setStatus(name+' を更新中…');
    var res=await client.setAttendanceResponse({
      activityId:state.selectedId,
      memberName:name,
      status:status
    });
    state.detail=res;
    /* 一覧の counts も合わせる */
    state.activities=state.activities.map(function(a){
      if(a.id===state.selectedId&&res.activity){
        return Object.assign({}, a, {counts:res.activity.counts, responsesUpdatedAt:res.activity.responsesUpdatedAt});
      }
      return a;
    });
    renderList();
    renderDetail();
    setStatus(name+' を「'+statusLabel(status)+'」に更新しました');
  }

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      setStatus('LINE用テキストをコピーしました');
    }catch(e){
      setStatus('コピーに失敗しました。テキストを手動選択してください', true);
    }
  }

  function gateOk(){
    try{return sessionStorage.getItem(LS_OK)==='1';}catch(e){return false;}
  }
  function setGateOk(){
    try{sessionStorage.setItem(LS_OK,'1');}catch(e){}
  }

  function tryLogin(){
    var inp=$('att-pw-inp');
    var err=$('att-pw-err');
    var v=(inp&&inp.value)||'';
    var expect=simpleHash(cfg.initialPw||'');
    if(simpleHash(v)===expect){
      setGateOk();
      $('att-pw').classList.add('att-hidden');
      bootApp();
    }else if(err){
      err.textContent='パスワードが違います';
    }
  }

  function bind(){
    var form=$('att-create-form');
    if(form)form.addEventListener('submit', function(ev){
      createActivity(ev).catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-list').addEventListener('click', function(ev){
      var item=ev.target.closest('.att-act-item');
      if(!item)return;
      openActivity(item.getAttribute('data-id')).catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-roster').addEventListener('click', function(ev){
      var btn=ev.target.closest('button[data-status]');
      if(!btn)return;
      var card=btn.closest('.att-member');
      if(!card)return;
      setMemberStatus(card.getAttribute('data-name'), btn.getAttribute('data-status'))
        .catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-btn-publish').addEventListener('click', function(){
      publishUrl().catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-btn-copy-line').addEventListener('click', function(){
      if(!state.detail)return;
      copyText(buildLineText(state.detail, parentAnswerUrl(state.detail.activity.shareId)));
    });
    $('att-btn-copy-remind').addEventListener('click', function(){
      if(!state.detail)return;
      copyText(buildRemindText(state.detail));
    });
    $('att-btn-refresh').addEventListener('click', function(){
      var p=state.selectedId?openActivity(state.selectedId):refreshList();
      Promise.resolve(p).catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('att-pw-btn').addEventListener('click', tryLogin);
    $('att-pw-inp').addEventListener('keydown', function(ev){
      if(ev.key==='Enter')tryLogin();
    });
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
