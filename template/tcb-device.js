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

  function canSaveFilePicker() {
    try {
      return typeof window.showSaveFilePicker === 'function';
    } catch (e) {
      return false;
    }
  }

  /**
   * PDF 等をユーザーが選んだ場所へ保存（iCloud Drive / Google ドライブ等）。
   * Chromium 系で showSaveFilePicker が使えるときのみ。未対応・失敗時は通常のダウンロード。
   * @returns {Promise<{method:'picker'|'download'}>}
   */
  function saveBlobPreferPicker(blob, opts) {
    opts = opts || {};
    var fileName = String(opts.fileName || 'file.pdf');
    var mimeType = String(opts.mimeType || blob.type || 'application/octet-stream');

    function downloadFallback() {
      var url = URL.createObjectURL(blob);
      try {
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 4000);
      }
      return Promise.resolve({ method: 'download' });
    }

    if (!canSaveFilePicker() || !(blob instanceof Blob) || !blob.size) {
      return downloadFallback();
    }

    return window
      .showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'PDF',
            accept: { 'application/pdf': ['.pdf'] }
          }
        ]
      })
      .then(function (handle) {
        return handle.createWritable().then(function (writable) {
          return writable.write(blob).then(function () {
            return writable.close();
          });
        });
      })
      .then(function () {
        return { method: 'picker' };
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') throw err;
        /* 権限拒否・非対応などはダウンロードへ */
        return downloadFallback();
      });
  }

  function pdfOptionLabel() {
    var s = lineShareStrategy();
    if (s === 'desktop-copy') {
      if (isMacDesktop()) {
        return 'PDF（「PDFを保存」で保存先を選択可。iCloud／Googleドライブ等へ直接保存できる場合があります。Mac版LINEへは手動添付）';
      }
      if (isWindowsDesktop()) {
        return 'PDF（「PDFを保存」で保存先を選択可。Googleドライブ等へ直接保存できる場合があります。Windows版LINEへは手動添付）';
      }
      return 'PDF（この端末に保存。デスクトップ版LINEへは手動添付）';
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
        return 'MacではブラウザからLINEへ直接送れません。「本文をコピー」でメッセージをコピーし、LINEのトークに貼り付けてください。PDFは「PDFを保存」で保存先（iCloud Drive や Google ドライブなど）を選べます。対応ブラウザでない場合はダウンロードフォルダへ保存されます。';
      }
      if (isWindowsDesktop()) {
        return 'WindowsではブラウザからLINEへ直接送れないことがあります。「本文をコピー」でメッセージをコピーし、LINEのトークに貼り付けてください。PDFは「PDFを保存」で保存先を選べます（未対応ブラウザはダウンロード）。';
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
        return '本文をコピーし、PDFを保存しました。LINEのトークに本文を貼り付け、必要ならPDFを別途添付してください。';
      }
      return '本文をコピーしました。LINEのトークに貼り付けて送信してください。PDFが必要なときは送る内容でPDFにチェックするか「PDFを保存」を使ってください（保存先を選べる場合があります）。';
    }
    if (opts.pdfSaved) {
      return '本文をコピーしました。続く共有シートでPDFをLINEに添付してください。';
    }
    return '本文をコピーしました。LINEに貼り付けて送信してください。';
  }

  function pdfSavedDownloadHint() {
    if (isMacDesktop()) {
      return 'PDFをダウンロードしました。Finderの「ダウンロード」から iCloud Drive や Google ドライブへ移動できます。Chrome／Edge では次回から保存ダイアログで直接選べることがあります。';
    }
    if (isWindowsDesktop()) {
      return 'PDFをダウンロードしました。必要ならダウンロードフォルダから Google ドライブ等へ移動してください。Chrome／Edge では保存ダイアログで直接選べることがあります。';
    }
    return 'PDFをダウンロードしました。';
  }

  /** 「PDFを保存」は端末を問わず Blob 保存（Mac の print() ダイアログを避ける） */
  function preferPdfBlobSave() {
    return true;
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
    pdfSavedDownloadHint: pdfSavedDownloadHint,
    canSaveFilePicker: canSaveFilePicker,
    saveBlobPreferPicker: saveBlobPreferPicker,
    preferPdfBlobSave: preferPdfBlobSave,
    pwaGuideKind: pwaGuideKind
  };
})(window);
