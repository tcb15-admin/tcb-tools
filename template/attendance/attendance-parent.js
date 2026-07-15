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
  function qs(name){
    try{return new URLSearchParams(location.search).get(name)||'';}catch(e){return '';}
  }

  var cfg=window.TCB_ATT_CFG||{};
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
    if(typeof TCB_createPublicAttendanceClient!=='function'){
      setStatus('通信ライブラリを読み込めませんでした', true);
      return null;
    }
    client=TCB_createPublicAttendanceClient({baseUrl:cfg.apiBase||''});
    if(!client)setStatus('API 設定がありません', true);
    return client;
  }

  function render(){
    if(!data||!data.activity){
      $('att-main').innerHTML='<div class="att-card"><p>出欠情報を表示できません。</p></div>';
      return;
    }
    var a=data.activity;
    var closed=data.closed==1||data.closed==='1';
    var head='<div class="att-card">'
      +'<h2>'+esc(a.title||kindLabel(a.kind))+'</h2>'
      +'<p class="att-act-meta">'+esc([a.activityDate,a.startTime,a.place,kindLabel(a.kind)].filter(Boolean).join(' ・ '))+'</p>'
      +(a.memo?'<p class="att-act-meta" style="margin-top:8px">'+esc(a.memo)+'</p>':'')
      +'</div>';

    if(closed){
      $('att-main').innerHTML=head+'<div class="att-card"><p>この活動の出欠受付は終了しています。</p></div>';
      return;
    }

    var opts=(data.roster||[]).map(function(m){
      return '<option value="'+esc(m.name)+'">'+esc(m.name)
        +(m.status&&m.status!=='unset'?'（'+statusShort(m.status)+'）':'')
        +'</option>';
    }).join('');

    $('att-main').innerHTML=head
      +'<div class="att-parent-note">お子さまのお名前を選び、「出／欠／未定」をタップしてください。あとから変更もできます。</div>'
      +'<div class="att-card">'
      +'<label for="att-pick" style="font-size:12px;font-weight:700;color:#6e6e78">お名前</label>'
      +'<select id="att-pick" class="att-pick"><option value="">選択してください</option>'+opts+'</select>'
      +'<div class="att-seg" id="att-parent-seg">'
      +'<button type="button" data-status="in">出</button>'
      +'<button type="button" data-status="out">欠</button>'
      +'<button type="button" data-status="maybe">未定</button>'
      +'</div>'
      +'<div class="att-field" style="margin-top:10px"><label for="att-comment">コメント（任意）</label>'
      +'<input id="att-comment" maxlength="200" placeholder="例: 遅刻します"></div>'
      +'</div>';
  }

  function statusShort(s){
    if(s==='in')return '出';
    if(s==='out')return '欠';
    if(s==='maybe')return '未定';
    return '';
  }

  async function load(){
    var c=ensureClient();
    if(!c)return;
    if(!sid){
      setStatus('URLが不正です（sid がありません）', true);
      return;
    }
    setStatus('読み込み中…');
    data=await c.load(sid);
    render();
    setStatus('回答できます');
  }

  async function respond(status){
    var c=ensureClient();
    if(!c)return;
    var name=($('att-pick')&&$('att-pick').value)||'';
    if(!name){
      setStatus('お名前を選んでください', true);
      return;
    }
    var comment=($('att-comment')&&$('att-comment').value)||'';
    setStatus('送信中…');
    data=await c.respond({sid:sid, memberName:name, status:status, comment:comment});
    render();
    if($('att-pick'))$('att-pick').value=name;
    setStatus(name+' を「'+statusShort(status)+'」で受付しました');
  }

  document.addEventListener('DOMContentLoaded', function(){
    $('att-main').addEventListener('click', function(ev){
      var btn=ev.target.closest('#att-parent-seg button[data-status]');
      if(!btn)return;
      respond(btn.getAttribute('data-status')).catch(function(e){
        var msg=e.message||String(e);
        if(msg==='too_fast')msg='連続送信のため少し待ってから再度お試しください';
        setStatus(msg, true);
      });
    });
    load().catch(function(e){setStatus(e.message||String(e), true);});
  });
})();
