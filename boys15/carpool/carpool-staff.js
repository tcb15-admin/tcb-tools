(function(){
  'use strict';

  function $(id){return document.getElementById(id);}
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  var cfg=window.TCB_CP_CFG||{};
  var client=null;
  var state={sheets:[], campaigns:[], sheet:null, candidates:null};
  var LS_OK=(cfg.lsPrefix||'tcb')+'_cp_ok';

  var CATEGORIES=['スタッフ車','当番車','道具車','選手車','当番補佐車','保護者車'];

  function setStatus(msg, isErr){
    var el=$('cp-status');
    if(!el)return;
    el.textContent=msg||'';
    el.className='cp-status'+(isErr?' err':'');
  }

  function ensureClient(){
    if(client)return client;
    client=TCB_createSyncClient({
      baseUrl:cfg.apiBase||'',
      token:cfg.apiToken||'',
      cohort:String(cfg.cohort||'')
    });
    if(!client)setStatus('API設定がありません', true);
    return client;
  }

  function emptyRow(n){
    return {
      sortOrder:n||1, category:'', carModel:'', duty:'',
      driver:'', front:'', rear1:'', rear2:'', rear3:'', rear4:'', rear5:'',
      note:'', block:'general'
    };
  }

  function unlock(){
    try{sessionStorage.setItem(LS_OK,'1');}catch(e){}
    var pw=$('cp-pw');
    if(pw)pw.classList.add('cp-hidden');
  }

  function needLogin(){
    try{return sessionStorage.getItem(LS_OK)!=='1';}catch(e){return true;}
  }

  function tryLogin(){
    var inp=$('cp-pw-inp');
    var err=$('cp-pw-err');
    var v=inp?String(inp.value||''):'';
    if(v===String(cfg.initialPw||'')){
      if(err)err.textContent='';
      unlock();
      boot().catch(function(e){setStatus(e.message||String(e), true);});
    }else if(err){
      err.textContent='パスワードが違います';
    }
  }

  async function loadCampaigns(){
    var c=ensureClient();
    if(!c)return;
    var res=await c.listCampaigns();
    state.campaigns=res.campaigns||[];
    var sel=$('cp-camp');
    if(!sel)return;
    var opts='<option value="">（選ばない）</option>';
    state.campaigns.forEach(function(camp){
      var days=(camp.days||[]).map(function(d){return d.activityDate;}).join(',');
      opts+='<option value="'+esc(camp.id)+'" data-days="'+esc(days)+'">'+esc(camp.title||camp.id)+'</option>';
    });
    sel.innerHTML=opts;
  }

  async function loadSheets(){
    var c=ensureClient();
    if(!c)return;
    var res=await c.listCarpoolSheets();
    state.sheets=res.sheets||[];
    renderList();
  }

  function renderList(){
    var box=$('cp-list');
    if(!box)return;
    if(!state.sheets.length){
      box.innerHTML='<p class="cp-meta">まだ配車表がありません。</p>';
      return;
    }
    box.innerHTML=state.sheets.map(function(s){
      var active=state.sheet&&state.sheet.id===s.id?' is-active':'';
      return '<div class="cp-act'+active+'" data-id="'+esc(s.id)+'">'
        +'<div class="cp-act-title">'+esc(s.title||'配車表')+'</div>'
        +'<div class="cp-meta">'+esc(s.activityDate||'（日付未設定）')
        +'　'+esc(s.fromPlace||'')+(s.toPlace?' ⇒ '+esc(s.toPlace):'')
        +'　'+(s.rows?s.rows.length:0)+'台</div></div>';
    }).join('');
  }

  function countPeople(rows){
    var names={};
    function add(v){
      var t=String(v||'').trim();
      if(!t)return;
      names[t]=1;
    }
    (rows||[]).forEach(function(r){
      add(r.driver);add(r.front);
      add(r.rear1);add(r.rear2);add(r.rear3);add(r.rear4);add(r.rear5);
    });
    return Object.keys(names).length;
  }

  function renderDetail(){
    var d=state.sheet;
    var panel=$('cp-detail');
    var empty=$('cp-detail-empty');
    if(!d){
      if(panel)panel.classList.add('cp-hidden');
      if(empty)empty.classList.remove('cp-hidden');
      return;
    }
    if(empty)empty.classList.add('cp-hidden');
    if(panel)panel.classList.remove('cp-hidden');
    $('cp-d-title').textContent=d.title||'配車表';
    $('cp-d-title-inp').value=d.title||'';
    $('cp-d-date').value=d.activityDate||'';
    $('cp-d-from').value=d.fromPlace||'';
    $('cp-d-to').value=d.toPlace||'';
    $('cp-counts').innerHTML=
      '<span>台数 '+(d.rows?d.rows.length:0)+'</span>'
      +'<span>乗車名（重複除く） '+countPeople(d.rows)+'</span>';
    renderTable();
    renderList();
  }

  function catOptions(cur){
    var html='<option value=""></option>';
    CATEGORIES.forEach(function(c){
      html+='<option value="'+esc(c)+'"'+(cur===c?' selected':'')+'>'+esc(c)+'</option>';
    });
    if(cur&&CATEGORIES.indexOf(cur)<0){
      html+='<option value="'+esc(cur)+'" selected>'+esc(cur)+'</option>';
    }
    return html;
  }

  function renderTable(){
    var tb=$('cp-tbody');
    if(!tb||!state.sheet)return;
    var rows=state.sheet.rows||[];
    tb.innerHTML=rows.map(function(r, idx){
      return '<tr data-idx="'+idx+'">'
        +'<td class="cp-num"><input data-k="sortOrder" value="'+esc(r.sortOrder)+'" inputmode="numeric"></td>'
        +'<td><select data-k="category">'+catOptions(r.category)+'</select></td>'
        +'<td><input data-k="carModel" value="'+esc(r.carModel)+'"></td>'
        +'<td><input data-k="duty" value="'+esc(r.duty)+'"></td>'
        +'<td><input data-k="driver" value="'+esc(r.driver)+'"></td>'
        +'<td><input data-k="front" value="'+esc(r.front)+'"></td>'
        +'<td><input data-k="rear1" value="'+esc(r.rear1)+'"></td>'
        +'<td><input data-k="rear2" value="'+esc(r.rear2)+'"></td>'
        +'<td><input data-k="rear3" value="'+esc(r.rear3)+'"></td>'
        +'<td><input data-k="rear4" value="'+esc(r.rear4)+'"></td>'
        +'<td><input data-k="rear5" value="'+esc(r.rear5)+'"></td>'
        +'<td><input data-k="note" value="'+esc(r.note)+'"></td>'
        +'<td><button type="button" class="cp-btn cp-btn-ghost cp-del" data-del="'+idx+'">削除</button></td>'
        +'</tr>';
    }).join('');
  }

  function readTableIntoSheet(){
    if(!state.sheet)return;
    var rows=[];
    $('cp-tbody').querySelectorAll('tr').forEach(function(tr){
      var r=emptyRow(rows.length+1);
      tr.querySelectorAll('[data-k]').forEach(function(el){
        var k=el.getAttribute('data-k');
        var v=el.tagName==='SELECT'?el.value:el.value;
        if(k==='sortOrder')r[k]=parseInt(v,10)||(rows.length+1);
        else r[k]=String(v||'');
      });
      rows.push(r);
    });
    rows.sort(function(a,b){return (a.sortOrder||0)-(b.sortOrder||0);});
    state.sheet.rows=rows;
    state.sheet.title=$('cp-d-title-inp').value||state.sheet.title;
    state.sheet.activityDate=$('cp-d-date').value||'';
    state.sheet.fromPlace=$('cp-d-from').value||'';
    state.sheet.toPlace=$('cp-d-to').value||'';
  }

  async function openSheet(id){
    var c=ensureClient();
    if(!c)return;
    setStatus('読込中…');
    var res=await c.getCarpoolSheet(id);
    state.sheet=res.sheet;
    state.candidates=null;
    var box=$('cp-cand-box');
    if(box){box.classList.add('cp-hidden');box.textContent='';}
    renderDetail();
    setStatus('配車表を開きました');
  }

  async function createSheet(){
    var c=ensureClient();
    if(!c)return;
    var title=($('cp-title')&&$('cp-title').value)||((cfg.teamShort||'')+' 配車表');
    var date=($('cp-date')&&$('cp-date').value)||'';
    var campId=($('cp-camp')&&$('cp-camp').value)||'';
    var from=($('cp-from')&&$('cp-from').value)||'';
    var to=($('cp-to')&&$('cp-to').value)||'';
    setStatus('作成中…');
    var res=await c.upsertCarpoolSheet({
      title:title,
      activityDate:date,
      fromPlace:from,
      toPlace:to,
      attendanceCampaignId:campId,
      rows:[emptyRow(1)]
    });
    state.sheet=res.sheet;
    await loadSheets();
    renderDetail();
    setStatus('配車表を作成しました');
  }

  async function saveSheet(){
    var c=ensureClient();
    if(!c||!state.sheet)return;
    readTableIntoSheet();
    setStatus('保存中…');
    var res=await c.upsertCarpoolSheet(state.sheet);
    state.sheet=res.sheet;
    await loadSheets();
    renderDetail();
    setStatus('保存しました');
  }

  function addRow(){
    if(!state.sheet)return;
    readTableIntoSheet();
    var n=(state.sheet.rows||[]).length+1;
    state.sheet.rows.push(emptyRow(n));
    renderTable();
    $('cp-counts').innerHTML=
      '<span>台数 '+state.sheet.rows.length+'</span>'
      +'<span>乗車名（重複除く） '+countPeople(state.sheet.rows)+'</span>';
  }

  function guessDriver(car){
    if(car.send)return car.send;
    if(car.mother==='o')return String(car.memberName||'').replace(/^\d+：/, '')+'母';
    if(car.father==='o')return String(car.memberName||'').replace(/^\d+：/, '')+'父';
    return String(car.memberName||'').replace(/^\d+：/, '');
  }

  async function loadCandidates(){
    var c=ensureClient();
    if(!c||!state.sheet)return;
    var campId=state.sheet.attendanceCampaignId||'';
    var date=state.sheet.activityDate||'';
    if(!campId||!date){
      setStatus('出欠と日付を設定して保存してから取り込んでください', true);
      return;
    }
    setStatus('MG候補を取得中…');
    var cand=await c.getCarpoolCandidates(campId, date);
    state.candidates=cand;
    var lines=[];
    lines.push('配車可の車: '+(cand.carCount||0)+'台');
    (cand.cars||[]).forEach(function(car, i){
      lines.push((i+1)+'. '+car.memberName+' / '+ (car.carModel||'（車種未記入）')
        +' / 空き'+ (car.seats||'―')
        +' / 送り:'+(car.send||'―')+' 迎え:'+(car.pickup||'―'));
    });
    lines.push('');
    lines.push('出席選手: '+(cand.riderCount||0)+'名 / 欠席・未回答: '+(cand.absentCount||0)+'名');
    lines.push('下の「候補から行を追加」で配車可の車を表へ足せます。');
    var box=$('cp-cand-box');
    if(box){
      box.classList.remove('cp-hidden');
      box.innerHTML=esc(lines.join('\n')).replace(/\n/g,'<br>')
        +'<div style="margin-top:10px"><button type="button" id="cp-btn-apply-cand" class="cp-btn cp-btn-primary">候補から行を追加</button></div>';
    }
    setStatus('候補を取得しました');
  }

  function isBlankRow(r){
    if(!r)return true;
    return !String(r.category||r.carModel||r.duty||r.driver||r.front||
      r.rear1||r.rear2||r.rear3||r.rear4||r.rear5||r.note||'').trim();
  }

  function applyCandidates(){
    if(!state.sheet||!state.candidates)return;
    readTableIntoSheet();
    var rows=(state.sheet.rows||[]).filter(function(r){return !isBlankRow(r);});
    var start=rows.length;
    (state.candidates.cars||[]).forEach(function(car, i){
      var r=emptyRow(start+i+1);
      r.category='選手車';
      r.carModel=car.carModel||'';
      r.duty='着替え袋・水筒';
      r.driver=guessDriver(car);
      r.note=car.seats?'空き'+car.seats+'名':'';
      rows.push(r);
    });
    if(!rows.length)rows=[emptyRow(1)];
    state.sheet.rows=rows;
    renderDetail();
    setStatus((state.candidates.cars||[]).length+'行を追加しました（内容は手直ししてください）');
  }

  function buildPrintHtml(){
    if(!state.sheet)return '';
    readTableIntoSheet();
    var s=state.sheet;
    var rows=(s.rows||[]).slice().sort(function(a,b){return (a.sortOrder||0)-(b.sortOrder||0);});
    var body=rows.map(function(r){
      return '<tr>'
        +'<td>'+esc(r.sortOrder)+'</td><td>'+esc(r.category)+'</td><td>'+esc(r.carModel)+'</td>'
        +'<td>'+esc(r.duty)+'</td><td>'+esc(r.driver)+'</td><td>'+esc(r.front)+'</td>'
        +'<td>'+esc(r.rear1)+'</td><td>'+esc(r.rear2)+'</td><td>'+esc(r.rear3)+'</td>'
        +'<td>'+esc(r.rear4)+'</td><td>'+esc(r.rear5)+'</td><td>'+esc(r.note)+'</td></tr>';
    }).join('');
    return '<h1>'+esc(s.title||'配車表')+'</h1>'
      +'<div class="cp-print-route">'+esc(s.activityDate||'')+'　'
      +esc(s.fromPlace||'')+(s.toPlace?' ⇒ '+esc(s.toPlace):'')+'</div>'
      +'<div class="cp-print-counts">台数 '+(rows.length)+'　／　乗車名（重複除く） '+countPeople(rows)+'</div>'
      +'<table><thead><tr>'
      +'<th>配車順</th><th>分類</th><th>車種</th><th>担当</th><th>運転手</th><th>助手席</th>'
      +'<th>後部①</th><th>後部②</th><th>後部③</th><th>後部④</th><th>後部⑤</th><th>備考</th>'
      +'</tr></thead><tbody>'+body+'</tbody></table>'
      +'<div class="cp-print-foot">'+esc(s.noteFooter||'')+'</div>';
  }

  async function exportPdf(){
    if(!state.sheet)return;
    var host=$('cp-print');
    if(!host)return;
    host.innerHTML=buildPrintHtml();
    if(typeof html2pdf==='undefined'){
      setStatus('PDFライブラリがありません。印刷ダイアログを開きます', true);
      window.print();
      return;
    }
    setStatus('PDFを生成中…');
    var fname=(state.sheet.title||'配車表')+'_'+(state.sheet.activityDate||'')+'.pdf';
    await html2pdf().set({
      margin:8,
      filename:fname,
      image:{type:'jpeg', quality:0.95},
      html2canvas:{scale:2, useCORS:true},
      jsPDF:{unit:'mm', format:'a4', orientation:'landscape'}
    }).from(host).save();
    setStatus('PDFを保存しました（MG／親父LINEへ展開してください）');
  }

  async function boot(){
    setStatus('読込中…');
    await loadCampaigns();
    await loadSheets();
    setStatus('準備できました');
  }

  document.addEventListener('DOMContentLoaded', function(){
    if(!needLogin()){
      unlock();
      boot().catch(function(e){setStatus(e.message||String(e), true);});
    }
    $('cp-pw-btn').addEventListener('click', tryLogin);
    $('cp-pw-inp').addEventListener('keydown', function(ev){
      if(ev.key==='Enter')tryLogin();
    });
    var campSel=$('cp-camp');
    if(campSel){
      campSel.addEventListener('change', function(){
        var opt=campSel.options[campSel.selectedIndex];
        var days=opt?String(opt.getAttribute('data-days')||'').split(',').filter(Boolean):[];
        var dateEl=$('cp-date');
        if(dateEl&&!dateEl.value&&days.length)dateEl.value=days[0];
      });
    }
    $('cp-btn-create').addEventListener('click', function(){
      createSheet().catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('cp-btn-refresh').addEventListener('click', function(){
      boot().catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('cp-list').addEventListener('click', function(ev){
      var el=ev.target.closest('[data-id]');
      if(!el)return;
      openSheet(el.getAttribute('data-id')).catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('cp-btn-save').addEventListener('click', function(){
      saveSheet().catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('cp-btn-add-row').addEventListener('click', addRow);
    $('cp-btn-load-cand').addEventListener('click', function(){
      loadCandidates().catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('cp-btn-pdf').addEventListener('click', function(){
      exportPdf().catch(function(e){setStatus(e.message||String(e), true);});
    });
    $('cp-detail').addEventListener('click', function(ev){
      if(ev.target&&ev.target.id==='cp-btn-apply-cand'){
        applyCandidates();
        return;
      }
      var del=ev.target.closest('[data-del]');
      if(!del||!state.sheet)return;
      readTableIntoSheet();
      var idx=parseInt(del.getAttribute('data-del'),10);
      if(isNaN(idx))return;
      state.sheet.rows.splice(idx,1);
      state.sheet.rows.forEach(function(r,i){r.sortOrder=i+1;});
      renderTable();
    });
  });
})();
