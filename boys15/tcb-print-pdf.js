/**
 * 印刷プレビュー用HTML から PDF Blob を生成する。
 * 依存: html2pdf.js（グローバル html2pdf / html2canvas / jspdf）を先に読み込むこと。
 */
(function (global) {
  'use strict';

  var A4_W_MM = 210;
  var A4_H_MM = 297;
  var ASSIGN_MARGIN_MM = 6;
  var CANVAS_SCALE = 2;
  var PX_PER_MM = 96 / 25.4;
  /** iOS Safari 等の canvas 上限（辺・面積） */
  var MAX_CANVAS_SIDE = 4096;
  var MAX_CANVAS_AREA = 16777216;

  function getJsPDF() {
    if (typeof jspdf !== 'undefined' && jspdf.jsPDF) return jspdf.jsPDF;
    if (typeof jsPDF !== 'undefined') return jsPDF;
    return null;
  }

  function getHtml2Canvas() {
    if (typeof html2canvas !== 'undefined') return html2canvas;
    return null;
  }

  function isMobileLike() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
    if (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer:coarse)').matches) return true;
    return false;
  }

  /**
   * キャプチャサイズに応じて scale を下げ、モバイルの canvas 上限超過を防ぐ
   */
  function computeSafeCanvasScale(capW, capH, preferred) {
    preferred = preferred || CANVAS_SCALE;
    var scale = preferred;
    var minScale = isMobileLike() ? 0.5 : 1;
    while (scale >= minScale) {
      var w = Math.ceil(capW * scale);
      var h = Math.ceil(capH * scale);
      if (w <= MAX_CANVAS_SIDE && h <= MAX_CANVAS_SIDE && w * h <= MAX_CANVAS_AREA) {
        return scale;
      }
      scale -= 0.25;
    }
    return minScale;
  }

  function canvasToJpegDataUrl(canvas) {
    var qualities = [0.92, 0.82, 0.7];
    var i;
    for (i = 0; i < qualities.length; i++) {
      try {
        var url = canvas.toDataURL('image/jpeg', qualities[i]);
        if (url && url.length > 32 && url.indexOf('data:image/jpeg') === 0) return url;
      } catch (e) {
        /* サイズ超過時は品質を下げて再試行 */
      }
    }
    return '';
  }

  /**
   * 担当表（縦A4）の共有PDF用。
   * html2canvas は grid の fr 単位を正しく描画できないため、CSS クラスで auto レイアウトに切替える。
   */
  function prepareAssignPdfExport(doc) {
    if (!doc || !doc.documentElement) return;
    doc.documentElement.classList.add('tcb-pdf-export');
    doc.documentElement.style.width = A4_W_MM + 'mm';
    doc.documentElement.style.height = 'auto';
    doc.documentElement.style.maxHeight = 'none';
    doc.documentElement.style.overflow = 'visible';
    if (doc.body) {
      doc.body.style.width = A4_W_MM + 'mm';
      doc.body.style.height = 'auto';
      doc.body.style.maxHeight = 'none';
      doc.body.style.overflow = 'visible';
    }
    doc.querySelectorAll('.page').forEach(function (page) {
      page.style.height = 'auto';
      page.style.minHeight = 'auto';
      page.style.maxHeight = 'none';
      page.style.overflow = 'visible';
    });
    doc.querySelectorAll('.tcb-print-team-stack,.tcb-print-team-section,.tcb-print-team-cards,.cards').forEach(function (el) {
      el.style.overflow = 'visible';
      el.style.maxHeight = 'none';
    });
  }

  function waitForExportReady(doc) {
    var tasks = [];
    if (doc.fonts && doc.fonts.ready) {
      tasks.push(doc.fonts.ready.catch(function () {}));
    }
    doc.querySelectorAll('img').forEach(function (img) {
      if (img.complete) return;
      tasks.push(
        new Promise(function (resolve) {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        })
      );
    });
    return Promise.all(tasks).then(function () {
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(resolve);
        });
      });
    });
  }

  function measureCaptureSize(doc, pageEl) {
    prepareAssignPdfExport(doc);
    var capEl = pageEl || doc.querySelector('.page') || doc.body;
    var capW = capEl.scrollWidth || capEl.offsetWidth || doc.documentElement.scrollWidth;
    var capH = capEl.scrollHeight || capEl.offsetHeight || doc.documentElement.scrollHeight;
    if (!capW || !capH) {
      capW = Math.round(A4_W_MM * PX_PER_MM);
      capH = capW;
    }
    return { capEl: capEl, capW: capW, capH: capH };
  }

  function syncHiddenIframeSize(iframe, doc, capW, capH) {
    if (!iframe || !doc) return;
    iframe.style.width = Math.max(capW, Math.round(A4_W_MM * PX_PER_MM)) + 'px';
    iframe.style.height = Math.max(capH, 400) + 'px';
  }

  /**
   * キャプチャ結果を A4 1 ページに収めて Blob 化（印刷の @page margin 6mm に合わせる）
   */
  function assignPortraitCanvasToBlob(canvas, usedScale) {
    var JsPDF = getJsPDF();
    if (!JsPDF) {
      return Promise.reject(new Error('PDFライブラリが読み込まれていません'));
    }
    if (!canvas || canvas.width < 10 || canvas.height < 10) {
      return Promise.reject(new Error('キャプチャに失敗しました'));
    }
    usedScale = usedScale || CANVAS_SCALE;
    var dataUrl = canvasToJpegDataUrl(canvas);
    if (!dataUrl) {
      return Promise.reject(new Error('キャプチャ画像の変換に失敗しました'));
    }
    var pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var margin = ASSIGN_MARGIN_MM;
    var availW = A4_W_MM - margin * 2;
    var availH = A4_H_MM - margin * 2;
    var wMm = canvas.width / usedScale / PX_PER_MM;
    var hMm = canvas.height / usedScale / PX_PER_MM;
    var fit = Math.min(availW / wMm, availH / hMm);
    var drawW = wMm * fit;
    var drawH = hMm * fit;
    var x = margin + (availW - drawW) / 2;
    var y = margin;
    pdf.addImage(dataUrl, 'JPEG', x, y, drawW, drawH);
    return Promise.resolve(pdf.output('blob'));
  }

  function captureAssignPortraitBlob(doc, pageEl, opts) {
    opts = opts || {};
    var html2canvasFn = getHtml2Canvas();
    if (!html2canvasFn) {
      return Promise.reject(new Error('PDFライブラリが読み込まれていません'));
    }
    return waitForExportReady(doc).then(function () {
      var measured = measureCaptureSize(doc, pageEl);
      var capEl = measured.capEl;
      var capW = measured.capW;
      var capH = measured.capH;
      if (opts.iframe) syncHiddenIframeSize(opts.iframe, doc, capW, capH);
      var scale = computeSafeCanvasScale(capW, capH, opts.scale || CANVAS_SCALE);
      return html2canvasFn(capEl, {
        scale: scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: capW,
        height: capH,
        windowWidth: capW,
        windowHeight: capH,
        backgroundColor: '#ffffff'
      }).then(function (canvas) {
        return assignPortraitCanvasToBlob(canvas, scale);
      });
    });
  }

  /**
   * @param {string} htmlFullDocument 完全な HTML 文字列（<!DOCTYPE> 〜）
   * @param {{ orientation?: 'portrait'|'landscape' }} [opts]
   * @returns {Promise<Blob>}
   */
  function generatePdfBlobFromHtml(htmlFullDocument, opts) {
    opts = opts || {};
    var orientation = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
    var isAssignPortrait = orientation === 'portrait';
    var iframeW = Math.round(A4_W_MM * PX_PER_MM) + 'px';

    return new Promise(function (resolve, reject) {
      if (isAssignPortrait && !getHtml2Canvas()) {
        reject(new Error('PDFライブラリが読み込まれていません'));
        return;
      }
      if (!isAssignPortrait && typeof html2pdf === 'undefined') {
        reject(new Error('PDFライブラリが読み込まれていません'));
        return;
      }
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.title = '';
      iframe.style.cssText =
        'position:fixed;left:-9999px;top:0;width:' +
        iframeW +
        ';height:800px;border:0;opacity:0;pointer-events:none;';
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
          if (isAssignPortrait) {
            captureAssignPortraitBlob(doc, pageEl, { iframe: iframe })
              .then(function (blob) {
                cleanup();
                resolve(blob);
              })
              .catch(function (err) {
                cleanup();
                reject(err);
              });
            return;
          }
          prepareAssignPdfExport(doc);
          pageEl.style.height = 'auto';
          pageEl.style.minHeight = 'auto';
          pageEl.style.maxHeight = 'none';
          pageEl.style.overflow = 'visible';

          var capW = pageEl.offsetWidth || iframe.clientWidth;
          var capH = pageEl.offsetHeight || iframe.clientHeight;
          syncHiddenIframeSize(iframe, doc, capW, capH);
          var scale = computeSafeCanvasScale(capW, capH, CANVAS_SCALE);
          var opt = {
            margin: [4, 4, 4, 4],
            image: { type: 'jpeg', quality: 0.92 },
            html2canvas: {
              scale: scale,
              useCORS: true,
              allowTaint: true,
              logging: false,
              scrollX: 0,
              scrollY: 0,
              width: capW,
              height: capH,
              windowWidth: capW,
              windowHeight: capH
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
        }, isMobileLike() ? 350 : 150);
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
    var doc = printFrame.contentDocument;
    var pageEl = doc.querySelector('.page') || doc.body;
    return captureAssignPortraitBlob(doc, pageEl);
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
