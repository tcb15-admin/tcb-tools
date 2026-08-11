(function(global){
  'use strict';

  /*
   * 週末確定案内（親父LINE向け長文）
   * 練習組／試合組の定型を展開し、スタッフが編集してコピーする。
   */

  function F(){ return global.TCB_AttFormat || {}; }

  function dayHeadBrief(iso){
    if(F().dayHeadBrief)return F().dayHeadBrief(iso);
    if(F().dayHead){
      var h=F().dayHead(iso);
      return h.replace(/^(\d+)月(\d+)日/, '$2日').replace(/^\d+月/, '');
    }
    return iso||'';
  }

  function timeJa(t){
    var m=String(t||'').match(/^(\d{1,2}):(\d{2})/);
    if(!m)return String(t||'').trim()||'（未定）';
    return String(parseInt(m[1],10))+':'+m[2];
  }

  function linesOrDefault(text, fallbackLines){
    var s=String(text==null?'':text).trim();
    if(s)return s.split(/\r?\n/).map(function(x){return x.replace(/^\s+/, '');}).filter(Boolean);
    return (fallbackLines||[]).slice();
  }

  function bulletBlock(title, items){
    var out=['【'+title+'】'];
    (items||[]).forEach(function(it){
      var line=String(it||'').trim();
      if(!line)return;
      if(line.charAt(0)==='◇'||line.charAt(0)==='⚠️'||line.charAt(0)==='※')out.push(line);
      else out.push('◇'+line);
    });
    return out;
  }

  var DEFAULT_PRACTICE={
    gearSpot:'現地にて確認',
    meetWear:[
      'チームTシャツ',
      'チームハーフパンツ',
      'ストッキング&ソックス',
      '練習用帽子',
      'ランニングシューズ'
    ],
    teamTools:[
      '野球道具一式',
      'キャッチャー道具',
      '雑カゴ',
      '練習用ボール',
      '投手用ボール',
      'ベース一式',
      'タープ',
      '縄とび、チューブ'
    ],
    belongings:[
      '野球道具一式',
      'スパイク(練習用は指定なし)',
      'マスクの予備(リュック)',
      'OS-1',
      '塩分チャージ',
      '⚠️練習着上下',
      '⚠️ベルト',
      '着替え',
      '飲み物⚠️多めに',
      'タオル',
      '氷嚢'
    ],
    parentWear:[
      '華美でない服装',
      '黒or紺系の長ズボン/ジャージ',
      '　※父はハーフパンツ着用可',
      '父はチーム帽子着用',
      'グローブ(練習時の手伝い使用）'
    ]
  };

  var DEFAULT_GAME={
    gearSpot:'現地にて確認とします。',
    teamTools:[
      '内外ノックボール',
      '投手用ボール',
      'キャッチャー道具',
      '雑カゴ',
      'バットケース',
      '審判道具',
      'タープ'
    ],
    meetWear:[
      'ユニフォーム《紺色》',
      '　⬆️色間違えのないように‼',
      '公式戦用ズボン《紺ライン》',
      '　⬆️お間違えのないように‼',
      'ベルト《紺色》',
      '　⬆️色間違えのないように‼',
      '試合用帽子',
      '　⬆️試合用になります‼',
      '試合用ストッキング&ソックス',
      '　⬆️試合用になります‼',
      'ZETTトレシュー'
    ],
    belongings:[
      '野球道具一式',
      'スパイク《白色》',
      'OS-1',
      '塩分チャージ',
      '着替え',
      '飲み物⚠️多め',
      'タオル',
      'バスタオル',
      '氷嚢'
    ],
    parentWear:[
      '試合用Tシャツ',
      '黒or紺系の長ズボン、ジャージ',
      '試合はハーフパンツ不可',
      '父は帽子着用'
    ]
  };

  /** 練習組向け確定案内 */
  function formatPracticeBriefing(data){
    data=data||{};
    var cohort=String(data.cohortLabel||'15期生');
    var group=String(data.groupLabel||'練習組');
    var lines=[];
    lines.push('お疲れ様です。');
    lines.push('');
    lines.push('◇'+dayHeadBrief(data.activityDate));
    lines.push('《'+cohort+' : '+group+'》');
    lines.push('');
    lines.push('【集合時間】 '+timeJa(data.meetTime||data.startTime));
    lines.push('【集合場所】 '+(data.meetPlace||data.place||'（未定）'));
    lines.push('【練習場所】 '+(data.activityPlace||data.place||'（未定）'));
    if(data.address)lines.push('【住所】 '+data.address);
    if(data.mapCode)lines.push('【マップコード】 '+data.mapCode);
    lines.push('');
    lines.push('【'+(data.gearSpotTitle||'道具置場')+'】');
    lines.push('◇'+(data.gearSpot||DEFAULT_PRACTICE.gearSpot));
    lines.push('');
    lines=lines.concat(bulletBlock('集合時服装', linesOrDefault(data.meetWearText, DEFAULT_PRACTICE.meetWear)));
    lines.push('');
    lines=lines.concat(bulletBlock('練習で使用する道具', linesOrDefault(data.teamToolsText, DEFAULT_PRACTICE.teamTools)));
    lines.push('');
    lines=lines.concat(bulletBlock('持ち物', linesOrDefault(data.belongingsText, DEFAULT_PRACTICE.belongings)));
    lines.push('');
    lines=lines.concat(bulletBlock('父兄の服装・持物', linesOrDefault(data.parentWearText, DEFAULT_PRACTICE.parentWear)));
    lines.push('');
    if(data.extra){lines.push(String(data.extra).trim());lines.push('');}
    lines.push('以上、よろしくお願いいたします。');
    return lines.join('\n');
  }

  /** 試合組向け確定案内 */
  function formatGameBriefing(data){
    data=data||{};
    var cohort=String(data.cohortLabel||'15期生');
    var group=String(data.groupLabel||'試合組');
    var lines=[];
    lines.push('お疲れ様です。');
    lines.push('');
    lines.push('◇'+dayHeadBrief(data.activityDate));
    lines.push('【'+cohort+' : '+group+'】');
    lines.push('');
    if(data.route){
      lines.push(String(data.route).trim());
      lines.push('');
    }
    lines.push('【集合時間】 '+timeJa(data.meetTime||data.startTime));
    if(data.meetNote)lines.push('※'+String(data.meetNote).trim());
    lines.push('');
    lines.push('【集合場所】 '+(data.meetPlace||'（未定）'));
    lines.push('【練習場所】 '+(data.activityPlace||data.place||'（未定）'));
    if(data.meetAddress)lines.push('【住所】 '+data.meetAddress);
    if(data.meetMapCode)lines.push('【マップコード】 '+data.meetMapCode);
    if(data.activityAddress)lines.push('【住所】 '+data.activityAddress);
    if(data.activityMapCode)lines.push('【マップコード】 '+data.activityMapCode);
    if(data.opponent)lines.push('【試合相手】 '+data.opponent);
    if(data.gameTime)lines.push('【試合時間】 '+timeJa(data.gameTime));
    if(data.bench)lines.push('【ベンチ】'+data.bench);
    lines.push('');
    lines.push('【チーム道具/選手道具置場】');
    lines.push(data.gearSpot||DEFAULT_GAME.gearSpot);
    lines.push('');
    lines=lines.concat(bulletBlock('試合に持って行くチーム道具', linesOrDefault(data.teamToolsText, DEFAULT_GAME.teamTools)));
    lines.push('');
    lines=lines.concat(bulletBlock('集合時服装', linesOrDefault(data.meetWearText, DEFAULT_GAME.meetWear)));
    lines.push('');
    lines=lines.concat(bulletBlock('持ち物', linesOrDefault(data.belongingsText, DEFAULT_GAME.belongings)));
    lines.push('');
    lines=lines.concat(bulletBlock('父兄の服装', linesOrDefault(data.parentWearText, DEFAULT_GAME.parentWear)));
    lines.push('');
    if(data.extra){lines.push(String(data.extra).trim());lines.push('');}
    lines.push('以上、よろしくお願いいたします。');
    return lines.join('\n');
  }

  function defaultFieldPack(mode){
    var d=mode==='game'?DEFAULT_GAME:DEFAULT_PRACTICE;
    return {
      meetWearText:d.meetWear.join('\n'),
      teamToolsText:d.teamTools.join('\n'),
      belongingsText:d.belongings.join('\n'),
      parentWearText:d.parentWear.join('\n'),
      gearSpot:d.gearSpot
    };
  }

  global.TCB_AttBriefing={
    formatPracticeBriefing:formatPracticeBriefing,
    formatGameBriefing:formatGameBriefing,
    defaultFieldPack:defaultFieldPack,
    DEFAULT_PRACTICE:DEFAULT_PRACTICE,
    DEFAULT_GAME:DEFAULT_GAME
  };
})(typeof window!=='undefined'?window:this);
