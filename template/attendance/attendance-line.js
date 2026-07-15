(function(global){
  'use strict';

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

  /** 母（MG LINE）投稿文。現行フォーマットを踏襲 */
  function formatMotherLine(memberName, days, payload){
    var p=payload&&payload.days?payload.days:{};
    var lines=[];
    lines.push(String(memberName||'').replace(/^\d+：/, '').trim() || memberName);
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

  /** 親父 LINE 本文。現行フォーマットを踏襲（スケジュール回答は別途案内） */
  function formatFatherLine(memberName, days, payload){
    var p=payload&&payload.days?payload.days:{};
    var short=String(memberName||'').replace(/^\d+：/, '').trim() || memberName;
    var lines=[];
    lines.push('おはようございます。');
    lines.push(short+'　父');
    (days||[]).forEach(function(d){
      var dt=d.activityDate;
      var mk=p[dt];
      lines.push(dayHead(dt)+' '+markChar(mk));
    });
    lines.push('宜しくお願いします。');
    return lines.join('\n');
  }

  function formatMgInvite(campaign, url){
    var days=campaign&&campaign.days?campaign.days:[];
    var title=campaign&&campaign.title?campaign.title:'出欠確認';
    var lines=['【MG LINE：出欠・配車のお願い】', title, ''];
    if(days.length){
      lines.push('対象日: '+days.map(function(d){return dayHead(d.activityDate);}).join(' / '));
      lines.push('');
    }
    if(campaign&&campaign.memo){lines.push(campaign.memo);lines.push('');}
    lines.push('▼回答フォーム（お母さま用）');
    lines.push(url||'（URL未発行）');
    lines.push('');
    lines.push('回答後、必要に応じて生成された文面をこのグループへ投稿してください。');
    return lines.join('\n');
  }

  function formatFatherInvite(campaign, url){
    var days=campaign&&campaign.days?campaign.days:[];
    var title=campaign&&campaign.title?campaign.title:'出欠確認';
    var lines=['【親父 LINE：出欠のお願い】', title, ''];
    if(days.length){
      lines.push('対象日: '+days.map(function(d){return dayHead(d.activityDate);}).join(' / '));
      lines.push('');
    }
    lines.push('▼回答フォーム（お父さま用）');
    lines.push(url||'（URL未発行）');
    lines.push('');
    lines.push('※当面は LINEスケジュールへの回答も従来どおりお願いします。');
    lines.push('フォーム回答後、生成される本文をこのグループへ投稿できます。');
    return lines.join('\n');
  }

  global.TCB_AttFormat={
    markChar:markChar,
    dayHead:dayHead,
    dayHeadShort:dayHeadShort,
    formatMotherLine:formatMotherLine,
    formatFatherLine:formatFatherLine,
    formatMgInvite:formatMgInvite,
    formatFatherInvite:formatFatherInvite
  };
})(window);
