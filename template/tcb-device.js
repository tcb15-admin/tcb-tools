/* ============================================================
 * 端末・ブラウザ判定と LINE／PDF 共有方針（TCB_Device）
 *
 * 道具MGRが使う端末は Mac / iPhone が中心だが、引き継ぎ後は
 * Windows・Android・iPad もあり得る。UA と能力（canShare）を
 * 組み合わせ、端末ごとに安全な共有手順へ振り分ける。
 *
 * lineShareStrategy():
 *   ios-combined  … 本文+PDF を共有シートへ（iPhone / iPad）
 *   android-share … ファイル付き Web Share を試し、だめならコピー+保存
 *   desktop-copy  … 本文コピー + PDFダウンロード（Mac / Windows / Linux）
 *                   ※デスクトップで PDF を共有シートに載せても、
 *                     Mac版LINE は共有先に出ないことが多い。
 *                     本文+ファイル同時共有はローカルパスが本文に
 *                     混ざる既知問題もあるため使わない。
 * ============================================================ */
(function (global) {
  'use strict';

  function ua() {
    return String((global.navigator && navigator.userAgent) || '');
  }

  /** iPadOS 13+ は UA が Macintosh になるためタッチ点数で判別 */
  function isIPadOs() {
    try {
      return /Macintosh/.test(ua()) && (navigator.maxTouchPoints || 0) > 1;
    } catch (e) {
      return false;
    }
  }

  function isIos() {
    return /iPhone|iPad|iPod/i.test(ua()) || isIPadOs();
  }

  function isAndroid() {
    return /Android/i.test(ua());
  }

  function isMacDesktop() {
    return /Macintosh|Mac OS X/.test(ua()) && !isIos();
  }

  function isWindowsDesktop() {
    return /Windows NT|Windows\s/i.test(ua()) && !isAndroid();
  }

  function isLinuxDesktop() {
    return /Linux/i.test(ua()) && !isAndroid() && !isIos();
  }

  function hasCoarsePointer() {
    try {
      return !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    } catch (e) {
      return false;
    }
  }

  function isMobile() {
    if (isIos() || isAndroid()) return true;
    if ((navigator.maxTouchPoints || 0) > 0 && hasCoarsePointer()) return true;
    return /Mobile/i.test(ua());
  }

  function isDesktop() {
    return !isMobile();
  }

  function platformId() {
    if (isIos()) return isIPadOs() || /iPad/i.test(ua()) ? 'ipad' : 'iphone';
    if (isAndroid()) return 'android';
    if (isMacDesktop()) return 'mac';
    if (isWindowsDesktop()) return 'windows';
    if (isLinuxDesktop()) return 'linux';
    return isDesktop() ? 'desktop' : 'mobile';
  }

  function canShareFiles() {
    try {
      if (typeof navigator.share !== 'function') return false;
      if (typeof navigator.canShare !== 'function') return false;
      if (typeof File !== 'function' || typeof Blob !== 'function') return false;
      var probe = new File([new Blob(['0'], { type: 'application/pdf' })], 'probe.pdf', {
        type: 'application/pdf'
      });
      return !!navigator.canShare({ files: [probe] });
    } catch (e) {
      return false;
    }
  }

  function canShareText() {
    try {
      if (typeof navigator.share !== 'function') return false;
      if (typeof navigator.canShare === 'function') {
        return !!navigator.canShare({ text: 't' });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * LINE 展開の基本方針。
   * デスクトップは常に copy（パス混入・LINE非対応を避ける）。
   * Android は能力があれば share、なければ copy にフォールバック（呼び出し側）。
   */
  function lineShareStrategy() {
    if (isIos()) return 'ios-combined';
    if (isAndroid()) return 'android-share';
    return 'desktop-copy';
  }

  /** デスクトップでは PDF の Web Share（共有シート）を使わない。
   * canShareFiles() が true でも、macOS 共有シートに Mac版LINE が
   * 出ないことが多く「LINEへ展開」が破綻するため。 */
  function shouldAvoidPdfFileWebShare() {
    return lineShareStrategy() === 'desktop-copy';
  }

  /** @deprecated 互換用。デスクトップでは常に false（共有シートにLINEが出ない前提） */
  function desktopCanSharePdf() {
    return false;
  }

  function sharePrimaryLabel() {
    if (lineShareStrategy() !== 'desktop-copy') return 'LINEへ展開';
    return '本文をコピー';
  }

  function pdfOptionLabel() {
    var s = lineShareStrategy();
    if (s === 'desktop-copy') {
      if (isMacDesktop()) {
        return 'PDF（この端末にダウンロード。Mac版LINEへは自動添付されないため、必要なら手動添付）';
      }
      if (isWindowsDesktop()) {
        return 'PDF（この端末にダウンロード。Windows版LINEへは自動添付されないため、必要なら手動添付）';
      }
      return 'PDF（この端末にダウンロード。デスクトップ版LINEへは手動添付）';
    }
    if (s === 'android-share') {
      return 'PDF添付（共有シートでLINEを選ぶと添付できます。端末に残す場合は「ファイルを保存」）';
    }
    return 'PDF添付（端末に残す場合は共有シートで「ファイルに保存」）';
  }

  function sharePanelHint() {
    var s = lineShareStrategy();
    if (s === 'desktop-copy') {
      if (isMacDesktop()) {
        return 'MacではブラウザからLINEへ直接送れません。「本文をコピー」でメッセージをコピーし、LINEのトークに貼り付けてください。PDFはダウンロードしてLINEに手動添付してください（共有シートにLINEが出ないため使いません）。';
      }
      if (isWindowsDesktop()) {
        return 'WindowsではブラウザからLINEへ直接送れないことがあります。「本文をコピー」でメッセージをコピーし、LINEのトークに貼り付けてください。PDFはダウンロードして手動添付してください。';
      }
      return 'この端末では「本文をコピー」でメッセージを取得します。PDFはダウンロードしてLINEに手動添付してください。';
    }
    if (s === 'android-share') {
      return 'Androidでは共有シートからLINEを選ぶと本文とPDFをまとめて送れます。シートにLINEが出ない場合は本文がコピーされます。';
    }
    return '';
  }

  function pasteStatusMessage(opts) {
    opts = opts || {};
    var s = lineShareStrategy();
    if (s === 'desktop-copy') {
      if (opts.pdfSaved) {
        return '本文をコピーし、PDFはダウンロードしました。LINEのトークに本文を貼り付け、必要ならPDFを別途添付してください。';
      }
      return '本文をコピーしました。LINEのトークに貼り付けて送信してください。PDFが必要なときは送る内容でPDFにチェックするか「PDFを保存」を使ってください（PDFはダウンロードされます）。';
    }
    if (opts.pdfSaved) {
      return '本文をコピーしました。続く共有シートでPDFをLINEに添付してください。';
    }
    return '本文をコピーしました。LINEに貼り付けて送信してください。';
  }

  function preferPdfBlobSave() {
    if (isMobile()) return true;
    return false;
  }

  function pwaGuideKind() {
    if (isIos()) return 'ios';
    if (isAndroid()) return 'android';
    if (isWindowsDesktop()) return 'windows';
    if (isMacDesktop()) return 'mac';
    return 'generic';
  }

  global.TCB_Device = {
    ua: ua,
    isIos: isIos,
    isIPadOs: isIPadOs,
    isAndroid: isAndroid,
    isMacDesktop: isMacDesktop,
    isWindowsDesktop: isWindowsDesktop,
    isLinuxDesktop: isLinuxDesktop,
    isMobile: isMobile,
    isDesktop: isDesktop,
    platformId: platformId,
    canShareFiles: canShareFiles,
    canShareText: canShareText,
    lineShareStrategy: lineShareStrategy,
    shouldAvoidPdfFileWebShare: shouldAvoidPdfFileWebShare,
    sharePrimaryLabel: sharePrimaryLabel,
    pdfOptionLabel: pdfOptionLabel,
    sharePanelHint: sharePanelHint,
    pasteStatusMessage: pasteStatusMessage,
    preferPdfBlobSave: preferPdfBlobSave,
    pwaGuideKind: pwaGuideKind
  };
})(window);
