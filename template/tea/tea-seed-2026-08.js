/**
 * 15期 お茶当番の初期基準データ（2026年8月共有表／2026.7.31更新 PDF より）
 * UIからの「共有表を登録」用ではなく、初回の8月表・選手班の土台として使う。
 * 短名（背番号なし）。読込時にマスタ名（例: 78：榎本）へ解決する。
 */
(function (global) {
  'use strict';

  var AUG_2026_DAYS = [
    { activityDate: '2026-08-01', dutyA: '榎本', dutyB: '伊郷', playerGroup: 2 },
    { activityDate: '2026-08-02', dutyA: '伊藤（櫂）', dutyB: '伊藤（天）', playerGroup: 3 },
    { activityDate: '2026-08-08', dutyA: '伊藤（魁）', dutyB: '石川', playerGroup: 4 },
    { activityDate: '2026-08-09', dutyA: '鮫島', dutyB: '植松', playerGroup: 5 },
    { activityDate: '2026-08-11', dutyA: '池田', dutyB: '柴', playerGroup: 6 },
    { activityDate: '2026-08-15', dutyA: '大脇', dutyB: '岡村', playerGroup: 1 },
    { activityDate: '2026-08-16', dutyA: '長坂', dutyB: '丸井', playerGroup: 2 },
    { activityDate: '2026-08-22', dutyA: '伊郷', dutyB: '清水', playerGroup: 3 },
    { activityDate: '2026-08-23', dutyA: '鵜飼', dutyB: 'ディグ', playerGroup: 4 },
    { activityDate: '2026-08-29', dutyA: '西本', dutyB: '神野', playerGroup: 5 },
    { activityDate: '2026-08-30', dutyA: '高橋（龍）', dutyB: '林', playerGroup: 6 }
  ];

  var AUG_2026_GROUPS = {
    '1': ['秋田', '池田', '伊郷', '石川', '伊藤（櫂）', '伊藤（魁）'],
    '2': ['伊藤（天）', '伊奈', '植松', '鵜飼', '榎本', '遠藤'],
    '3': ['大脇', '岡村', '鮫島', '柴', '柴田', '清水'],
    '4': ['神野', '高橋（龍）', 'ディグ', '長坂', '西本'],
    '5': ['濱田', '林', '半田', '増田', '松永', '松原'],
    '6': ['丸井', '三浦', '見並', '本山', '八重']
  };

  /** 共有PDF下部の備考欄（定型・編集可） */
  var DEFAULT_NOTE = [
    '■選手当番■',
    '◎選手当番の仕事…トイレ掃除',
    '',
    '■お茶当番の仕事■',
    '当番道具(カップ・トレー・ウエス等)掃除道具セット、ポットの掃除、管理をする。',
    'ゴミは当日の当番が持ち帰る。',
    '都合の悪い方は各自交代して頂き、交代をお願いした方が15期MG LINEにて周知連絡する事。',
    '※真夏、真冬に限りお茶当番ではなく、選手当番で氷(真夏)、お湯(真冬)を用意していただく'
  ].join('\n');

  global.TCB_TeaSeed = {
    yearMonth: '2026-08',
    revisedAt: '2026.7.31更新',
    note: DEFAULT_NOTE,
    defaultNote: DEFAULT_NOTE,
    days: AUG_2026_DAYS,
    playerGroups: AUG_2026_GROUPS
  };
})(typeof window !== 'undefined' ? window : this);
