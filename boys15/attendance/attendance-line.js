(function(global){
  'use strict';

  /*
   * LINE 投稿文フォーマッタ（出欠）
   * トラックは汎用キー a / b。チーム固有の呼称（例: MG LINE／親父 LINE）や
   * 役職語尾（例: 「父」）は呼び出し側が config（TCB_ATT_CFG.tracks）から渡す。
   * 文面テンプレート自体の完全な設定化（他チーム展開）は将来課題。
   */

  function markChar(m){
    if(m==='o')return '◯';
    if(m==='x')return '✕';
    if(m==='t')return '△';
    return '―';
  }

  function wd(dateStr){
    try{
      var d=new Date(String(dateStr)+'T12:00:00');
      return ['日','月','火','水','木','金','土'][d.getDay()]||'';
    }catch(e){return '';}
  }

  function dayHead(dateStr){
    var m=String(dateStr||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return dateStr;
    var mon=String(parseInt(m[2],10));
    var day=String(parseInt(m[3],10));
    return mon+'月'+day+'日('+wd(dateStr)+')';
  }

  function dayHeadShort(dateStr){
    var m=String(dateStr||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return dateStr;
    return String(parseInt(m[3],10))+'日（'+wd(dateStr)+'）';
  }

  function shortName(memberName){
    return String(memberName||'').replace(/^\d+：/, '').trim()||memberName;
  }

  /** 詳細（family）フォームの投稿文。15期 MG LINE の現行書式を踏襲 */
  function formatFamilyLine(memberName, days, payload){
    var p=payload&&payload.days?payload.days:{};
    var lines=[];
    lines.push(shortName(memberName));
    lines.push('');
    (days||[]).forEach(function(d){
      var dt=d.activityDate;
      var row=p[dt];
      lines.push(dayHeadShort(dt));
      if(!row){
        lines.push('（未回答）');
        lines.push('');
        return;
      }
      if(row.mode==='off'){
        lines.push('休み'+(row.note?'（'+row.note+'）':''));
        lines.push('');
        return;
      }
      lines.push('①父：'+markChar(row.father)+'　母：'+markChar(row.mother));
      lines.push('②兄弟：'+(row.siblings||'なし')+' / その他：'+(row.other||'―'));
      lines.push('③配車の可否 ：'+markChar(row.carOk));
      lines.push('④車種：'+(row.carModel||'―'));
      lines.push('⑤乗車可能人数：'+(row.seats!=null?row.seats+'名':'―'));
      lines.push('⑥送り：'+(row.send||'―'));
      lines.push('⑦迎え：'+(row.pickup||'―'));
      lines.push('');
    });
    lines.push('よろしくお願いします');
    return lines.join('\n');
  }

  /** 簡易（marks）フォームの投稿文。15期 親父 LINE の現行書式を踏襲 */
  function formatMarksLine(memberName, days, payload, roleSuffix){
    var p=payload&&payload.days?payload.days:{};
    var lines=[];
    lines.push('おはようございます。');
    lines.push(shortName(memberName)+(roleSuffix?'　'+roleSuffix:''));
    (days||[]).forEach(function(d){
      var dt=d.activityDate;
      lines.push(dayHead(dt)+' '+markChar(p[dt]));
    });
    lines.push('宜しくお願いします。');
    return lines.join('\n');
  }

  /** グループ向け案内文（トラック共通・ラベルと補足は config から） */
  function formatInvite(trackLabel, campaign, url, extraNote){
    var days=campaign&&campaign.days?campaign.days:[];
    var title=campaign&&campaign.title?campaign.title:'出欠確認';
    var lines=['【'+(trackLabel||'出欠')+'：出欠のお願い】', title, ''];
    if(days.length){
      lines.push('対象日: '+days.map(function(d){return dayHead(d.activityDate);}).join(' / '));
      lines.push('');
    }
    if(campaign&&campaign.memo){lines.push(campaign.memo);lines.push('');}
    lines.push('▼回答フォーム');
    lines.push(url||'（URL未発行）');
    lines.push('');
    lines.push('回答後、生成される文面をこのグループへ投稿してください。');
    if(extraNote)lines.push(extraNote);
    return lines.join('\n');
  }

  /** 催促文（未回答者つき） */
  function formatRemind(trackLabel, campaign, url, unansweredNames){
    var title=campaign&&campaign.title?campaign.title:'出欠確認';
    var lines=['【出欠リマインド／'+(trackLabel||'')+'】', title, ''];
    if(url){
      lines.push('▼回答はこちら');
      lines.push(url);
      lines.push('');
    }
    if(!unansweredNames||!unansweredNames.length){
      lines.push('現在、未回答の方はいません。');
    }else{
      lines.push('未回答:');
      lines.push(unansweredNames.join('、'));
      lines.push('');
      lines.push('お手数ですがご回答お願いします。');
    }
    return lines.join('\n');
  }

  global.TCB_AttFormat={
    markChar:markChar,
    dayHead:dayHead,
    dayHeadShort:dayHeadShort,
    formatFamilyLine:formatFamilyLine,
    formatMarksLine:formatMarksLine,
    formatInvite:formatInvite,
    formatRemind:formatRemind
  };
})(window);
