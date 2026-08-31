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
  var Br=window.TCB_AttBriefing||null;
  var Cal=window.TCB_AttCalendar||null;
  var TRACKS=cfg.tracks||{
    a:{label:'A',short:'A',form:'family',role:'',note:''},
    b:{label:'B',short:'B',form:'marks',role:'',note:''}
  };
  var LS_OK=(cfg.lsPrefix||'tcb15')+'_att_ok';
  var LS_TPL=(cfg.lsPrefix||'tcb15')+'_att_create_tpl';
  var DEFAULT_TPL={
    title:'{dates}出欠確認',
    memo:''
  };
  var sync=null;
  var state={campaigns:[], detail:null, selectedId:'', unanswered:{a:[],b:[]}, flow:'make'};

  var ERR_JA={
    unauthorized:'認証に失敗しました（トークン設定を確認してください）',
    cohort_required:'世代キーが未設定です',
    campaign_not_found:'出欠が見つかりません',
    days_required:'日付を1つ以上入力してください',
    days_too_many:'日付が多すぎます（最大14日）',
    activity_date_invalid:'日付の形式が不正です',
    kind_invalid:'種別が不正です',
    deadline_invalid:'回答締切の形式が不正です',
    deadline_passed:'回答締切を過ぎています',
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

  function loadTpl(){
    var out={title:DEFAULT_TPL.title, memo:DEFAULT_TPL.memo};
    try{
      var raw=localStorage.getItem(LS_TPL);
      if(!raw)return out;
      var o=JSON.parse(raw);
      if(o&&typeof o==='object'){
        if(typeof o.title==='string')out.title=o.title.slice(0,120);
        if(typeof o.memo==='string')out.memo=o.memo.slice(0,500);
      }
    }catch(e){}
    return out;
  }

  function saveTpl(title, memo){
    var payload={
      title:String(title==null?'':title).slice(0,120),
      memo:String(memo==null?'':memo).slice(0,500)
    };
    try{
      localStorage.setItem(LS_TPL, JSON.stringify(payload));
    }catch(e){
      throw new Error('定型の保存に失敗しました（ブラウザの保存領域を確認してください）');
    }
    return payload;
  }

  function fillTplEditors(tpl){
    if($('att-tpl-title'))$('att-tpl-title').value=tpl.title||'';
    if($('att-tpl-memo'))$('att-tpl-memo').value=tpl.memo||'';
  }

  function expandTitleTpl(tplTitle, isos){
    var t=String(tplTitle==null?'':tplTitle);
    var datesText=(Cal&&Cal.formatDatesJa)?Cal.formatDatesJa(isos):isos.join('、');
    if(t.indexOf('{dates}')>=0)return t.split('{dates}').join(datesText);
    if(!t.trim())return datesText?datesText+'出欠確認':'';
    return t;
  }

  function applyTplToForm(opts){
    opts=opts||{};
    var tpl=loadTpl();
    var isos=collectDays().map(function(d){return d.activityDate;});
    if($('att-title'))$('att-title').value=expandTitleTpl(tpl.title, isos).slice(0,120);
    if($('att-memo'))$('att-memo').value=String(tpl.memo||'').slice(0,500);
    if(opts.status!==false)setStatus('定型を作成欄に適用しました');
  }

  function nextWednesday1700Local(){
    var d=new Date();
    var day=d.getDay(); /* 0=日 */
    var add=(3-day+7)%7;
    if(add===0 && (d.getHours()>17 || (d.getHours()===17 && d.getMinutes()>0)))add=7;
    if(add===0 && d.getHours()===17 && d.getMinutes()===0){/* ちょうどなら当日 */ }
    d.setDate(d.getDate()+add);
    d.setHours(17,0,0,0);
    var y=d.getFullYear();
    var m=String(d.getMonth()+1).padStart(2,'0');
    var dd=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+dd+'T17:00';
  }

  function deadlineInputValue(iso){
    if(!iso)return '';
    var d=new Date(String(iso));
    if(Number.isNaN(d.getTime())){
      var m=String(iso).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
      return m?m[1]:'';
    }
    var y=d.getFullYear();
    var mo=String(d.getMonth()+1).padStart(2,'0');
    var dd=String(d.getDate()).padStart(2,'0');
    var hh=String(d.getHours()).padStart(2,'0');
    var mi=String(d.getMinutes()).padStart(2,'0');
    return y+'-'+mo+'-'+dd+'T'+hh+':'+mi;
  }

  function selectedBriefingDay(){
    var c=state.detail&&state.detail.campaign;
    if(!c||!c.days||!c.days.length)return null;
    var iso=($('att-br-day')&&$('att-br-day').value)||'';
    for(var i=0;i<c.days.length;i++){
      if(c.days[i].activityDate===iso)return c.days[i];
    }
    return c.days[0];
  }

  var FLOW_HINTS={
    make:'土日祝を仮登録 → 締切設定 → 作成。完了後は「2. 回答確認」でURL発行・LINE案内',
    check:'一覧から出欠を選ぶ → URL発行 → MG／親父案内をコピー。催促・受付終了もここで',
    brief:'活動パターンを選び、確定案内を生成して親父LINEへコピー'
  };
  var FLOW_EMPTY={
    check:'一覧から出欠を選ぶと、回答状況・URL発行・LINE案内が表示されます。',
    brief:'一覧から出欠を選ぶと、確定案内を作成できます。'
  };

  function setPanelVisible(el, on){
    if(!el)return;
    if(on)el.classList.remove('att-hidden');
    else el.classList.add('att-hidden');
  }

  function setAttFlow(mode, opts){
    mode=mode||'make';
    opts=opts||{};
    if(mode!=='make'&&mode!=='check'&&mode!=='brief')mode='make';
    state.flow=mode;
    document.querySelectorAll('.att-flow-btn').forEach(function(btn){
      btn.classList.toggle('is-active', btn.getAttribute('data-att-flow')===mode);
    });
    if($('att-flow-hint'))$('att-flow-hint').textContent=FLOW_HINTS[mode]||FLOW_HINTS.make;

    var hasDetail=!!(state.detail&&state.detail.campaign);
    var make=$('att-panel-make');
    var list=$('att-panel-list');
    var detail=$('att-detail');
    var empty=$('att-detail-empty');
    var check=$('att-panel-check');
    var brief=$('att-panel-brief');

    if(mode==='make'){
      setPanelVisible(make, true);
      setPanelVisible(list, true);
      setPanelVisible(detail, false);
      setPanelVisible(empty, false);
      setPanelVisible(check, false);
      setPanelVisible(brief, false);
    }else if(mode==='check'){
      setPanelVisible(make, false);
      setPanelVisible(list, true);
      setPanelVisible(check, true);
      setPanelVisible(brief, false);
      setPanelVisible(detail, hasDetail);
      setPanelVisible(empty, !hasDetail);
      if(empty&&!hasDetail)empty.textContent=FLOW_EMPTY.check;
    }else{
      setPanelVisible(make, false);
      setPanelVisible(list, true);
      setPanelVisible(check, false);
      setPanelVisible(brief, true);
      setPanelVisible(detail, hasDetail);
      setPanelVisible(empty, !hasDetail);
      if(empty&&!hasDetail)empty.textContent=FLOW_EMPTY.brief;
    }

    if(!opts.scroll)return;
    var scrollId='att-panel-list';
    if(mode==='make')scrollId='att-panel-make';
    else if(hasDetail)scrollId=mode==='brief'?'att-panel-brief':'att-panel-check';
    var el=$(scrollId);
    if(el){
      try{el.scrollIntoView({behavior:'smooth', block:'start'});}catch(e){}
    }
  }

  function briefingMode(){
    return ($('att-br-mode')&&$('att-br-mode').value)||'renshu';
  }

  function briefingPackKind(){
    if(Br&&Br.packKindOf)return Br.packKindOf(briefingMode());
    return briefingMode().indexOf('game')>=0||briefingMode().indexOf('ryoho')>=0?'game':'practice';
  }

  function syncBriefingModeUi(){
    var game=briefingPackKind()==='game';
    document.querySelectorAll('.att-br-practice-fields').forEach(function(el){
      el.classList.toggle('att-hidden', game);
    });
    document.querySelectorAll('.att-br-game-fields').forEach(function(el){
      el.classList.toggle('att-hidden', !game);
    });
    if($('att-br-group') && !$('att-br-group').dataset.touched){
      var pre=Br&&Br.patternPreset?Br.patternPreset(briefingMode()):null;
      $('att-br-group').value=(pre&&pre.groupLabel)||(game?'試合組':'練習組');
    }
  }

  function applyBriefingPack(mode){
    if(!Br||!Br.defaultFieldPack)return;
    var pack=Br.defaultFieldPack(mode||briefingMode());
    if($('att-br-wear'))$('att-br-wear').value=pack.meetWearText||'';
    if($('att-br-tools'))$('att-br-tools').value=pack.teamToolsText||'';
    if($('att-br-bag'))$('att-br-bag').value=pack.belongingsText||'';
    if($('att-br-parent'))$('att-br-parent').value=pack.parentWearText||'';
    if($('att-br-gear') && !String($('att-br-gear').value||'').trim())$('att-br-gear').value=pack.gearSpot||'';
  }

  function fillBriefingFromDay(day, opts){
    opts=opts||{};
    day=day||{};
    if($('att-br-meet-time'))$('att-br-meet-time').value=day.startTime||'';
    if($('att-br-meet-place') && (opts.force||!$('att-br-meet-place').value))
      $('att-br-meet-place').value=day.place||'';
    if($('att-br-act-place') && (opts.force||!$('att-br-act-place').value))
      $('att-br-act-place').value=day.place||'';
    if(opts.setMode!==false && $('att-br-mode')){
      var kind=String(day.kind||'');
      if(kind==='game' && $('att-br-mode').value.indexOf('game')<0 && $('att-br-mode').value.indexOf('ryoho')<0){
        $('att-br-mode').value='kata_game';
      }else if(kind==='practice' && $('att-br-mode').value.indexOf('renshu')<0 && $('att-br-mode').value.indexOf('kata_practice')<0){
        $('att-br-mode').value='renshu';
      }
    }
    syncBriefingModeUi();
    if(opts.resetPack)applyBriefingPack(briefingMode());
  }

  function collectBriefingData(){
    var day=selectedBriefingDay()||{};
    var mode=briefingMode();
    var pre=Br&&Br.patternPreset?Br.patternPreset(mode):null;
    return {
      activityDate:day.activityDate||'',
      startTime:day.startTime||'',
      place:day.place||'',
      cohortLabel:(cfg.cohortLabel||(cfg.cohort?cfg.cohort+'期生':''))||'15期生',
      groupLabel:($('att-br-group')&&$('att-br-group').value.trim())||(pre&&pre.groupLabel)||'練習組',
      meetTime:($('att-br-meet-time')&&$('att-br-meet-time').value)||'',
      meetPlace:($('att-br-meet-place')&&$('att-br-meet-place').value.trim())||'',
      activityPlace:($('att-br-act-place')&&$('att-br-act-place').value.trim())||'',
      address:($('att-br-address')&&$('att-br-address').value.trim())||'',
      mapCode:($('att-br-map')&&$('att-br-map').value.trim())||'',
      gearSpotTitle:($('att-br-gear-title')&&$('att-br-gear-title').value.trim())||'',
      gearSpot:($('att-br-gear')&&$('att-br-gear').value.trim())||'',
      route:($('att-br-route')&&$('att-br-route').value.trim())||'',
      meetNote:($('att-br-meet-note')&&$('att-br-meet-note').value.trim())||'',
      opponent:($('att-br-opponent')&&$('att-br-opponent').value.trim())||'',
      gameTime:($('att-br-game-time')&&$('att-br-game-time').value)||'',
      bench:($('att-br-bench')&&$('att-br-bench').value.trim())||'',
      meetAddress:($('att-br-meet-addr')&&$('att-br-meet-addr').value.trim())||'',
      meetMapCode:($('att-br-meet-map')&&$('att-br-meet-map').value.trim())||'',
      activityAddress:($('att-br-act-addr')&&$('att-br-act-addr').value.trim())||'',
      activityMapCode:($('att-br-act-map')&&$('att-br-act-map').value.trim())||'',
      meetWearText:($('att-br-wear')&&$('att-br-wear').value)||'',
      teamToolsText:($('att-br-tools')&&$('att-br-tools').value)||'',
      belongingsText:($('att-br-bag')&&$('att-br-bag').value)||'',
      parentWearText:($('att-br-parent')&&$('att-br-parent').value)||'',
      extra:($('att-br-extra')&&$('att-br-extra').value)||''
    };
  }

  function rebuildBriefingPreview(){
    if(!Br)return;
    var data=collectBriefingData();
    var text=briefingPackKind()==='game'
      ? Br.formatGameBriefing(data)
      : Br.formatPracticeBriefing(data);
    if($('att-br-preview'))$('att-br-preview').value=text;
  }

  function renderBriefingPanel(){
    var c=state.detail&&state.detail.campaign;
    var daySel=$('att-br-day');
    if(!daySel)return;
    var days=(c&&c.days)||[];
    daySel.innerHTML=days.map(function(d){
      return '<option value="'+esc(d.activityDate)+'">'+esc(d.activityDate)
        +(d.kind?'（'+esc(d.kind)+'）':'')+'</option>';
    }).join('');
    if(days.length){
      fillBriefingFromDay(days[0], {resetPack:!$('att-br-wear')||!$('att-br-wear').value, force:true});
      rebuildBriefingPreview();
    }else if($('att-br-preview')){
      $('att-br-preview').value='';
    }
  }

  function clearDayRows(){
    var box=$('att-day-rows');
    if(box)box.innerHTML='';
  }

  function addDayRow(prefill){
    prefill=prefill||{};
    var box=$('att-day-rows');
    var row=document.createElement('div');
    row.className='att-row att-day-row';
    var tagHtml=prefill.tagLabel
      ?(' <span class="att-day-row-label">'+esc(prefill.tagLabel)+'</span>')
      :'';
    row.innerHTML=
      '<div class="att-field att-day-date-field">'+
        '<label>日付'+tagHtml+'</label>'+
        '<input type="date" class="att-d-date" required>'+
      '</div>'+
      '<div class="att-field"><label>開始</label><input type="time" class="att-d-time"></div>'+
      '<div class="att-field"><label>種別</label><select class="att-d-kind">'+
        '<option value="practice" selected>練習</option>'+
        '<option value="game">試合</option>'+
        '<option value="other">その他</option>'+
        '<option value="undecided">未定</option>'+
      '</select></div>'+
      '<div class="att-field att-day-place-field">'+
        '<label>場所</label>'+
        '<div class="att-day-place-line">'+
          '<input class="att-d-place" maxlength="120" placeholder="任意">'+
          '<button type="button" class="att-btn att-btn-ghost att-btn-ico att-d-del" aria-label="この日付を削除" title="削除">'+
            '<svg class="att-btn-svg" viewBox="0 0 24 24"><use href="#att-i-trash"/></svg>'+
          '</button>'+
        '</div>'+
      '</div>';
    box.appendChild(row);
    if(prefill.activityDate)row.querySelector('.att-d-date').value=prefill.activityDate;
    if(prefill.startTime)row.querySelector('.att-d-time').value=prefill.startTime;
    if(prefill.kind){
      var kind=String(prefill.kind);
      var kindEl=row.querySelector('.att-d-kind');
      if([].some.call(kindEl.options, function(o){return o.value===kind;}))kindEl.value=kind;
    }
    if(prefill.place)row.querySelector('.att-d-place').value=prefill.place;
    var kindEl0=row.querySelector('.att-d-kind');
    function syncKindTbd(){
      if(kindEl0)kindEl0.classList.toggle('tcb-val-tbd', kindEl0.value==='undecided');
    }
    syncKindTbd();
    if(kindEl0)kindEl0.addEventListener('change', syncKindTbd);
    row.querySelector('.att-d-del').addEventListener('click', function(){
      if(box.querySelectorAll('.att-day-row').length<=1)return;
      row.remove();
      refreshTitleFromTplIfPlaceholder();
    });
    row.querySelector('.att-d-date').addEventListener('change', function(){
      refreshTitleFromTplIfPlaceholder();
    });
  }

  function refreshTitleFromTplIfPlaceholder(){
    var tpl=loadTpl();
    var titleEl=$('att-title');
    if(!titleEl||!tpl.title||tpl.title.indexOf('{dates}')<0)return;
    if(!titleEl.value.trim()||titleEl.dataset.attFromTpl==='1'){
      titleEl.value=expandTitleTpl(tpl.title, collectDays().map(function(d){return d.activityDate;})).slice(0,120);
      titleEl.dataset.attFromTpl='1';
    }
  }

  function setDayHint(items){
    var el=$('att-day-hint');
    if(!el)return;
    if(!items||!items.length){
      el.textContent='';
      return;
    }
    el.textContent='仮登録: '+items.map(function(it){
      return it.iso+(it.label?'（'+it.label+'）':'');
    }).join(' / ');
  }

  function fillWeekendHolidayDates(opts){
    opts=opts||{};
    if(!Cal||typeof Cal.nextSatSunHolidayDates!=='function'){
      setStatus('日付補助モジュールを読み込めませんでした', true);
      return;
    }
    var items=Cal.nextSatSunHolidayDates(new Date());
    clearDayRows();
    if(!items.length){
      addDayRow();
      setDayHint([]);
      setStatus('仮登録できる日付がありません', true);
      return;
    }
    items.forEach(function(it){
      addDayRow({
        activityDate:it.iso,
        kind:it.kindHint||'practice',
        tagLabel:it.label||''
      });
    });
    setDayHint(items);
    var titleEl=$('att-title');
    if(titleEl){
      titleEl.dataset.attFromTpl='1';
      applyTplToForm({status:false});
    }
    if(opts.status!==false){
      setStatus('直近の土・日・祝を仮登録しました（必要なら日付や種別を直してください）');
    }
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
      box.innerHTML='<p class="att-act-meta">まだ出欠がありません。上で作成してください。</p>';
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
    if(!d||!d.campaign){
      setAttFlow(state.flow||'make');
      return;
    }
    var c=d.campaign;
    var ans=d.answered||{};
    $('att-d-title').textContent=c.title||'出欠';
    var metaParts=(c.days||[]).map(function(x){return x.activityDate;});
    if(c.deadlineAt && F.formatDeadlineJa){
      metaParts.push('締切 '+F.formatDeadlineJa(c.deadlineAt));
    }
    $('att-d-meta').textContent=metaParts.join(' ・ ');
    $('att-d-counts').innerHTML=
      '<span class="ok">'+esc(TRACKS.a.short)+'回答 '+(ans.a||0)+'/'+(d.memberTotal||0)+'</span>'+
      '<span class="maybe">'+esc(TRACKS.b.short)+'回答 '+(ans.b||0)+'/'+(d.memberTotal||0)+'</span>';
    var closed=c.status==='closed';
    var pastDl=false;
    if(c.deadlineAt){
      var t=Date.parse(String(c.deadlineAt));
      pastDl=!Number.isNaN(t)&&Date.now()>t;
    }
    $('att-status-badge').textContent=closed
      ?'状態: 受付終了（保護者は新規回答不可）'
      :(pastDl?'状態: 受付中（回答締切済み・新規回答は不可）':'状態: 受付中');
    var toggle=$('att-btn-toggle-status');
    var toggleLab=$('att-btn-toggle-lab');
    if(toggleLab)toggleLab.textContent=closed?'受付再開':'受付終了';
    else if(toggle)toggle.textContent=closed?'受付を再開する':'受付を終了する';
    $('att-url-a').textContent=parentUrl(c.shareIdA)||'（未発行）';
    $('att-url-b').textContent=parentUrl(c.shareIdB)||'（未発行）';
    if($('att-d-deadline'))$('att-d-deadline').value=deadlineInputValue(c.deadlineAt||'');

    var unA=[], unB=[];
    $('att-roster').innerHTML=(d.roster||[]).map(function(r){
      if(!r.a)unA.push(r.name);
      if(!r.b)unB.push(r.name);
      var aText=r.a?trackLineText('a', r.name, c.days, r.a.payload):'';
      var bText=r.b?trackLineText('b', r.name, c.days, r.b.payload):'';
      var marksSummary='';
      if(r.b&&r.b.payload&&r.b.payload.days&&F.markChar){
        marksSummary=(c.days||[]).map(function(day){
          var mk=r.b.payload.days[day.activityDate];
          return (F.dayHeadShort?F.dayHeadShort(day.activityDate):day.activityDate)+F.markChar(mk);
        }).join(' ');
      }
      return '<div class="att-member">'
        +'<div class="att-member-name">'+esc(r.name)
        +' <span class="att-pill '+(r.a?'ok':'warn')+'">'+esc(TRACKS.a.short)+':'+(r.a?'済':'未')+'</span> '
        +'<span class="att-pill '+(r.b?'ok':'warn')+'">'+esc(TRACKS.b.short)+':'+(r.b?'済':'未')+'</span></div>'
        +(marksSummary?'<p class="att-act-meta">'+esc(TRACKS.b.short)+' '+esc(marksSummary)+'</p>':'')
        +(aText?'<details><summary class="att-act-meta">'+esc(TRACKS.a.short)+'投稿文</summary><pre class="att-preview">'+esc(aText)+'</pre></details>':'')
        +(bText?'<details><summary class="att-act-meta">'+esc(TRACKS.b.short)+'投稿文</summary><pre class="att-preview">'+esc(bText)+'</pre></details>':'')
        +'</div>';
    }).join('');
    state.unanswered={a:unA, b:unB};

    var alert=$('att-unanswered-alert');
    if(alert){
      var parts=[];
      if(unA.length)parts.push(TRACKS.a.short+'未回答 '+unA.length+'名');
      if(unB.length)parts.push(TRACKS.b.short+'未回答 '+unB.length+'名');
      if(parts.length && !closed){
        alert.classList.remove('att-hidden');
        alert.innerHTML='<strong>未回答あり</strong> — '+esc(parts.join(' ／ '))
          +'<br><span class="att-alert-names">'+esc((unB.length?unB:unA).slice(0,12).join('、'))
          +((unB.length?unB:unA).length>12?'…':'')+'</span>';
      }else{
        alert.classList.add('att-hidden');
        alert.textContent='';
      }
    }
    renderBriefingPanel();
    setAttFlow(state.flow||'check');
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

  async function openCampaign(id, opts){
    opts=opts||{};
    var client=ensureSync();
    if(!client)return;
    state.selectedId=id;
    setStatus('詳細を読込中…');
    state.detail=await client.getCampaign(id);
    renderList();
    var flow=opts.flow!=null?opts.flow:(state.flow==='make'?'check':(state.flow||'check'));
    state.flow=flow;
    renderDetail();
    if(opts.scroll)setAttFlow(flow, {scroll:true});
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
      deadlineAt:($('att-deadline')&&$('att-deadline').value)||'',
      days:days
    });
    await refreshList();
    if(res.campaign&&res.campaign.id){
      await openCampaign(res.campaign.id, {flow:'check', scroll:true});
      setStatus('出欠確認を作成しました。次に URL発行 → LINEへ案内コピー');
      return;
    }
    setStatus('出欠確認を作成しました');
  }

  async function publish(){
    var client=ensureSync();
    if(!client||!state.selectedId)return;
    setStatus('URL発行中…');
    await client.publishAttendance({id:state.selectedId, track:'both'});
    await openCampaign(state.selectedId, {flow:'check'});
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
    fillTplEditors(loadTpl());
    fillWeekendHolidayDates({status:false});
    if($('att-deadline') && !$('att-deadline').value){
      $('att-deadline').value=nextWednesday1700Local();
    }
    applyBriefingPack('renshu');
    syncBriefingModeUi();
    setAttFlow('make');

    document.querySelectorAll('.att-flow-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        setAttFlow(btn.getAttribute('data-att-flow')||'make', {scroll:true});
      });
    });

    $('att-tpl-save').addEventListener('click', function(){
      try{
        var saved=saveTpl(
          ($('att-tpl-title')&&$('att-tpl-title').value)||'',
          ($('att-tpl-memo')&&$('att-tpl-memo').value)||''
        );
        fillTplEditors(saved);
        setStatus('定型を保存しました（この端末に保持）');
      }catch(e){
        setStatus(jaErr(e), true);
      }
    });
    $('att-tpl-apply').addEventListener('click', function(){
      var titleEl=$('att-title');
      if(titleEl)titleEl.dataset.attFromTpl='1';
      applyTplToForm();
    });
    if($('att-title')){
      $('att-title').addEventListener('input', function(){
        $('att-title').dataset.attFromTpl='0';
      });
    }

    $('att-fill-weekend').addEventListener('click', function(){
      fillWeekendHolidayDates();
    });
    if($('att-deadline-wed')){
      $('att-deadline-wed').addEventListener('click', function(){
        if($('att-deadline'))$('att-deadline').value=nextWednesday1700Local();
        setStatus('回答締切を次の水曜 17:00 に設定しました');
      });
    }
    $('att-add-day').addEventListener('click', function(){addDayRow();});
    $('att-create-form').addEventListener('submit', function(ev){
      createCampaign(ev).catch(function(e){setStatus(jaErr(e), true);});
    });
    $('att-list').addEventListener('click', function(ev){
      var item=ev.target.closest('.att-act-item');
      if(!item)return;
      var nextFlow=state.flow==='brief'?'brief':'check';
      openCampaign(item.getAttribute('data-id'), {flow:nextFlow, scroll:true}).catch(function(e){setStatus(jaErr(e), true);});
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
        .then(function(){return openCampaign(state.selectedId, {flow:state.flow||'check'});})
        .then(function(){return refreshList();})
        .then(function(){
          setStatus(next==='closed'?'受付を終了しました':'受付を再開しました');
        })
        .catch(function(e){setStatus(jaErr(e), true);});
    });
    $('att-btn-refresh').addEventListener('click', function(){
      var p;
      if(state.selectedId && state.flow!=='make'){
        p=openCampaign(state.selectedId, {flow:state.flow});
      }else{
        p=refreshList();
      }
      Promise.resolve(p).catch(function(e){setStatus(jaErr(e), true);});
    });

    if($('att-br-day')){
      $('att-br-day').addEventListener('change', function(){
        fillBriefingFromDay(selectedBriefingDay(), {resetPack:false, force:true});
        rebuildBriefingPreview();
      });
    }
    if($('att-br-mode')){
      $('att-br-mode').addEventListener('change', function(){
        if($('att-br-group'))$('att-br-group').dataset.touched='';
        syncBriefingModeUi();
        applyBriefingPack(briefingMode());
        rebuildBriefingPreview();
      });
    }
    if($('att-d-deadline-save')){
      $('att-d-deadline-save').addEventListener('click', function(){
        var client=ensureSync();
        if(!client||!state.detail||!state.detail.campaign)return;
        var c=state.detail.campaign;
        setStatus('締切を保存中…');
        client.upsertCampaign({
          id:c.id,
          title:c.title||'',
          memo:c.memo||'',
          deadlineAt:($('att-d-deadline')&&$('att-d-deadline').value)||'',
          days:c.days||[]
        }).then(function(){return openCampaign(c.id, {flow:state.flow||'check'});})
          .then(function(){setStatus('締切を更新しました');})
          .catch(function(e){setStatus(jaErr(e), true);});
      });
    }
    if($('att-br-group')){
      $('att-br-group').addEventListener('input', function(){
        $('att-br-group').dataset.touched='1';
      });
    }
    if($('att-br-reset-pack')){
      $('att-br-reset-pack').addEventListener('click', function(){
        applyBriefingPack(briefingMode());
        rebuildBriefingPreview();
        setStatus('服装・道具の定型を戻しました');
      });
    }
    if($('att-br-rebuild')){
      $('att-br-rebuild').addEventListener('click', function(){
        rebuildBriefingPreview();
        setStatus('案内文を再生成しました');
      });
    }
    if($('att-br-copy')){
      $('att-br-copy').addEventListener('click', function(){
        var t=($('att-br-preview')&&$('att-br-preview').value)||'';
        if(!t.trim()){
          rebuildBriefingPreview();
          t=($('att-br-preview')&&$('att-br-preview').value)||'';
        }
        copyText(t);
      });
    }
    ['att-br-meet-time','att-br-meet-place','att-br-act-place','att-br-address','att-br-map',
     'att-br-gear-title','att-br-gear','att-br-route','att-br-meet-note','att-br-opponent',
     'att-br-game-time','att-br-bench','att-br-meet-addr','att-br-meet-map','att-br-act-addr',
     'att-br-act-map','att-br-wear','att-br-tools','att-br-bag','att-br-parent','att-br-extra','att-br-group'
    ].forEach(function(id){
      var el=$(id);
      if(!el)return;
      el.addEventListener('change', rebuildBriefingPreview);
      el.addEventListener('input', rebuildBriefingPreview);
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
