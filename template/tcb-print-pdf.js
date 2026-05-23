/**
 * 印刷プレビュー用HTML から PDF Blob を生成する。
 * 依存: html2pdf.js（グローバル html2pdf）を先に読み込むこと。
 */
(function (global) {
  'use strict';

  var A4_W_MM = 210;
  var A4_H_MM = 297;

  /**
   * @param {string} htmlFullDocument 完全な HTML 文字列（<!DOCTYPE> 〜）
   * @param {{ orientation?: 'portrait'|'landscape' }} [opts]
   * @returns {Promise<Blob>}
   */
  function generatePdfBlobFromHtml(htmlFullDocument, opts) {
    opts = opts || {};
    var orientation = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
    var isAssignPortrait = orientation === 'portrait';
    var iframeW = (isAssignPortrait ? A4_W_MM : A4_H_MM) + 'mm';
    var iframeH = (isAssignPortrait ? A4_H_MM : A4_W_MM) + 'mm';

    return new Promise(function (resolve, reject) {
      if (typeof html2pdf === 'undefined') {
        reject(new Error('PDFライブラリが読み込まれていません'));
        return;
      }
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.title = '';
      iframe.style.cssText =
        'position:fixed;left:-9999px;top:0;width:' +
        iframeW +
        ';height:' +
        iframeH +
        ';border:0;opacity:0;pointer-events:none;';
      document.body.appendChild(iframe);
      var finished = false;
      function cleanup() {
        if (finished) return;
        finished = true;
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (e) {
          /* ignore */
        }
      }
      function runCapture() {
        try {
          var doc = iframe.contentDocument;
          if (!doc || !doc.body) {
            cleanup();
            reject(new Error('プレビュー文書を読み込めませんでした'));
            return;
          }
          var pageEl = doc.querySelector('.page') || doc.body;
          if (!isAssignPortrait) {
            pageEl.style.height = 'auto';
            pageEl.style.minHeight = 'auto';
            pageEl.style.maxHeight = 'none';
            pageEl.style.overflow = 'visible';
            doc.documentElement.style.height = 'auto';
            doc.documentElement.style.overflow = 'visible';
            doc.body.style.height = 'auto';
            doc.body.style.overflow = 'visible';
          }

          var opt = {
            margin: isAssignPortrait ? [0, 0, 0, 0] : [4, 4, 4, 4],
            image: { type: 'jpeg', quality: 0.92 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              allowTaint: true,
              logging: false,
              scrollX: 0,
              scrollY: 0
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: orientation },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
          };
          html2pdf()
            .set(opt)
            .from(pageEl)
            .outputPdf('blob')
            .then(function (blob) {
              cleanup();
              resolve(blob);
            })
            .catch(function (err) {
              cleanup();
              reject(err);
            });
        } catch (err2) {
          cleanup();
          reject(err2);
        }
      }
      iframe.onload = function () {
        setTimeout(function () {
          requestAnimationFrame(runCapture);
        }, 80);
      };
      iframe.onerror = function () {
        cleanup();
        reject(new Error('iframeの読み込みに失敗しました'));
      };
      iframe.srcdoc = htmlFullDocument;
    });
  }

  /**
   * 印刷プレビュー iframe から担当表 PDF を生成（プレビューと同一 HTML）
   * @param {HTMLIFrameElement} printFrame
   * @returns {Promise<Blob>}
   */
  function generateAssignPdfBlobFromFrame(printFrame) {
    if (!printFrame || !printFrame.contentDocument || !printFrame.contentDocument.body) {
      return Promise.reject(new Error('印刷プレビューが読み込まれていません'));
    }
    var html = printFrame.srcdoc;
    if (!html) {
      try {
        html = '<!DOCTYPE html>\n' + printFrame.contentDocument.documentElement.outerHTML;
      } catch (e) {
        return Promise.reject(new Error('プレビュー文書を取得できませんでした'));
      }
    }
    return generatePdfBlobFromHtml(html, { orientation: 'portrait' });
  }

  /** 担当表（縦A4） */
  global.TCB_generateAssignPdfBlob = function (htmlFullDocument) {
    return generatePdfBlobFromHtml(htmlFullDocument, { orientation: 'portrait' });
  };

  /** 印刷プレビュー iframe から担当表 PDF */
  global.TCB_generateAssignPdfBlobFromFrame = generateAssignPdfBlobFromFrame;

  /** 履歴一覧など横長1ページ向け */
  global.TCB_generateLandscapePdfBlob = function (htmlFullDocument) {
    return generatePdfBlobFromHtml(htmlFullDocument, { orientation: 'landscape' });
  };
})(window);
