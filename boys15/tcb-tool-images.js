/* マスタ：道具写真の選択・圧縮・アップロード（道具名へ紐付け・最大5枚）
   保管先: Worker → GitHub boys{N}/images/（GitHub Pages で公開）
   DESCS[name] = { text, img, imgs[] }  （img は互換用の代表＝imgs[0]）
   依存: SYNC_CLIENT.uploadToolImage / deleteToolImage、DESCS、saveMaster、tcbToast/showMasterAlert */
(function (global) {
  'use strict';

  var MAX_EDGE = 1200;
  var JPEG_QUALITY = 0.82;
  var MAX_BYTES = 1.5 * 1024 * 1024;
  var MAX_IMGS = 5;

  function toast(msg, type) {
    if (global.TCB_Feedback && typeof global.TCB_Feedback.toast === 'function') {
      global.TCB_Feedback.toast(msg, type || 'info');
      return;
    }
    if (typeof global.showMasterAlert === 'function') {
      global.showMasterAlert(msg, type === 'error' || type === 'warn' ? 'alw' : 'als');
      return;
    }
    window.alert(msg);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** DESCS エントリから画像URL配列を得る（旧 img のみも互換） */
  function listImgsFromDesc(d) {
    var out = [];
    var seen = {};
    function push(u) {
      u = String(u || '').trim();
      if (!u || seen[u]) return;
      if (!/^https:\/\//i.test(u)) return;
      seen[u] = 1;
      out.push(u);
    }
    if (d && typeof d === 'object') {
      if (Array.isArray(d.imgs) && d.imgs.length) {
        d.imgs.forEach(push);
      } else {
        push(d.img);
      }
    }
    return out.slice(0, MAX_IMGS);
  }

  function writeDescImgs(toolName, urls) {
    if (!global.DESCS) global.DESCS = {};
    if (!global.DESCS[toolName] || typeof global.DESCS[toolName] !== 'object') {
      global.DESCS[toolName] = { text: '', img: '', imgs: [] };
    }
    var cleaned = [];
    var seen = {};
    (urls || []).forEach(function (u) {
      u = String(u || '').trim();
      if (!u || seen[u] || !/^https:\/\//i.test(u)) return;
      seen[u] = 1;
      cleaned.push(u);
    });
    cleaned = cleaned.slice(0, MAX_IMGS);
    global.DESCS[toolName].imgs = cleaned;
    global.DESCS[toolName].img = cleaned[0] || '';
  }

  function newUniqueId() {
    try {
      if (global.crypto && crypto.getRandomValues) {
        var a = new Uint8Array(4);
        crypto.getRandomValues(a);
        return Array.prototype.map.call(a, function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      }
    } catch (e) {}
    return String(Date.now()).slice(-8);
  }

  function isLikelyHeic(file) {
    var t = String((file && file.type) || '').toLowerCase();
    var n = String((file && file.name) || '').toLowerCase();
    return t.indexOf('heic') >= 0 || t.indexOf('heif') >= 0 || /\.heic$|\.heif$/i.test(n);
  }

  var _heicLibPromise = null;
  function heicScriptUrl() {
    try {
      var cur = document.querySelector('script[src*="tcb-tool-images.js"]');
      if (cur && cur.src) {
        return cur.src.replace(/tcb-tool-images\.js(\?[^#]*)?/, function (_, q) {
          return 'heic-to.js' + (q || '');
        });
      }
    } catch (e) {}
    try {
      return new URL('heic-to.js', global.location.href).href;
    } catch (e2) {
      return 'heic-to.js';
    }
  }

  /** HEIC変換ライブラリは必要なときだけ遅延読込（約3MB） */
  function loadHeicLib() {
    if (global.HeicTo) return Promise.resolve(global.HeicTo);
    if (_heicLibPromise) return _heicLibPromise;
    _heicLibPromise = new Promise(function (resolve, reject) {
      var primary = heicScriptUrl();
      var triedCdn = false;
      function attach(src) {
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = function () {
          if (global.HeicTo) resolve(global.HeicTo);
          else reject(new Error('heic_lib_missing'));
        };
        s.onerror = function () {
          if (!triedCdn) {
            triedCdn = true;
            /* ローカル読込失敗時の予備（CDN） */
            attach('https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/iife/heic-to.js');
            return;
          }
          _heicLibPromise = null;
          reject(new Error('heic_lib_missing'));
        };
        document.head.appendChild(s);
      }
      attach(primary);
    });
    return _heicLibPromise;
  }

  function convertHeicToJpegBlob(file) {
    toast('HEIC写真をJPEGに変換しています…', 'info');
    return loadHeicLib().then(function (HeicTo) {
      var check = typeof HeicTo.isHeic === 'function' ? HeicTo.isHeic(file) : Promise.resolve(true);
      return Promise.resolve(check).then(function (isH) {
        if (!isH && !isLikelyHeic(file)) throw new Error('image_decode_failed');
        return HeicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
      }).then(function (out) {
        if (!out) throw new Error('heic_convert_failed');
        if (out instanceof Blob) return out;
        return new Blob([out], { type: 'image/jpeg' });
      });
    });
  }

  function loadViaImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('image_decode_failed'));
      };
      img.src = url;
    });
  }

  /** JPEG/PNG/WebP（および Safari の HEIC）をデコード */
  function loadImageFromFile(file) {
    if (!file) return Promise.reject(new Error('image_decode_failed'));
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file)
        .then(function (bmp) {
          if (!bmp || !(bmp.width > 0) || !(bmp.height > 0)) {
            throw new Error('image_decode_failed');
          }
          return bmp;
        })
        .catch(function () {
          return loadViaImageElement(file);
        });
    }
    return loadViaImageElement(file);
  }

  function canvasToJpegBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(
          function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('画像の変換に失敗しました'));
          },
          'image/jpeg',
          quality
        );
        return;
      }
      try {
        var dataUrl = canvas.toDataURL('image/jpeg', quality);
        var bin = atob(dataUrl.split(',')[1] || '');
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: 'image/jpeg' }));
      } catch (e) {
        reject(e);
      }
    });
  }

  function compressDecodedImage(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('画像サイズを取得できませんでした');
    var scale = 1;
    var longEdge = Math.max(w, h);
    if (longEdge > MAX_EDGE) scale = MAX_EDGE / longEdge;
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas が使えません');
    ctx.drawImage(img, 0, 0, cw, ch);
    return canvasToJpegBlob(canvas, JPEG_QUALITY).then(function (blob) {
      if (typeof img.close === 'function') {
        try { img.close(); } catch (e) {}
      }
      if (blob.size > MAX_BYTES) {
        return canvasToJpegBlob(canvas, 0.7).then(function (blob2) {
          if (blob2.size > MAX_BYTES) throw new Error('画像が大きすぎます（圧縮後も上限超過）');
          return blob2;
        });
      }
      return blob;
    });
  }

  /**
   * 端末の写真を JPEG に圧縮。
   * 1) まずブラウザ標準で読込（iPhone Safari は HEIC をそのまま読めることが多い）
   * 2) 失敗時のみ heic-to で JPEG 化して再試行
   */
  function compressImageFile(file) {
    function run(f) {
      return loadImageFromFile(f).then(compressDecodedImage);
    }
    return run(file).catch(function (err) {
      var msg = String((err && err.message) || '');
      if (msg === 'image_decode_failed' || isLikelyHeic(file)) {
        return convertHeicToJpegBlob(file).then(run);
      }
      throw err;
    });
  }

  function fillThumb(el, url) {
    if (!el) return;
    el.innerHTML = '';
    var u = String(url || '').trim();
    if (!u) {
      el.textContent = '\ud83d\udcf7';
      return;
    }
    var ni = document.createElement('img');
    ni.alt = '';
    ni.decoding = 'async';
    ni.width = 56;
    ni.height = 42;
    ni.style.cssText = 'width:100%;height:100%;object-fit:cover;cursor:zoom-in;';
    var attempt = 0;
    function tryLoad() {
      attempt += 1;
      ni.onerror = function () {
        if (attempt < 4) {
          setTimeout(tryLoad, 1000 * attempt);
          return;
        }
        el.innerHTML = '';
        el.textContent = '\u26a0\ufe0f';
        el.title = '画像を表示できません';
      };
      ni.src = attempt === 1 ? u : u + (u.indexOf('?') >= 0 ? '&' : '?') + '_r=' + Date.now();
    }
    ni.addEventListener('click', function () {
      if (/^https:\/\//.test(u)) window.open(u, '_blank', 'noopener');
    });
    el.appendChild(ni);
    tryLoad();
  }

  function persistAfterImgChange() {
    if (typeof global.ensureSyncClient === 'function') global.ensureSyncClient();
    if (typeof global.syncEnabled === 'function' && global.syncEnabled() && typeof global.saveMaster === 'function') {
      global.saveMaster();
      return;
    }
    toast('写真を更新しました。マスタの「保存」を押してください。', 'info');
  }

  function setBusy(card, on) {
    if (!card) return;
    card.classList.toggle('tcb-tool-img-busy', !!on);
    card.querySelectorAll('.tcb-tool-img-pick, .tcb-tool-img-del').forEach(function (b) {
      b.disabled = !!on;
    });
  }

  function renderGallery(card, toolName) {
    var gallery = card.querySelector('.tcb-tool-img-gallery');
    var pickBtn = card.querySelector('.tcb-tool-img-pick');
    if (!gallery) return;
    var urls = listImgsFromDesc(global.DESCS && global.DESCS[toolName]);
    gallery.innerHTML = '';
    urls.forEach(function (u) {
      var cell = document.createElement('div');
      cell.className = 'tcb-tool-img-cell';
      var thumb = document.createElement('div');
      thumb.className = 'master-desc-preview tcb-tool-img-thumb';
      fillThumb(thumb, u);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'tcb-tool-img-del';
      del.setAttribute('aria-label', 'この写真を削除');
      del.textContent = '×';
      del.addEventListener('click', function () {
        removeOne(toolName, u, card);
      });
      cell.appendChild(thumb);
      cell.appendChild(del);
      gallery.appendChild(cell);
    });
    if (pickBtn) {
      pickBtn.disabled = urls.length >= MAX_IMGS;
      pickBtn.textContent = urls.length >= MAX_IMGS
        ? '上限' + MAX_IMGS + '枚'
        : (urls.length ? '写真を追加' : '写真を選ぶ');
    }
  }

  function uploadForTool(toolName, file, card) {
    if (typeof global.ensureSyncClient === 'function') global.ensureSyncClient();
    if (!global.SYNC_CLIENT || typeof global.SYNC_CLIENT.uploadToolImage !== 'function') {
      toast('クラウド同期の準備ができていません。ページを再読み込みしてから再度お試しください。', 'warn');
      return Promise.resolve();
    }
    if (!file) return Promise.resolve();
    var cur = listImgsFromDesc(global.DESCS && global.DESCS[toolName]);
    if (cur.length >= MAX_IMGS) {
      toast('1つの道具につき写真は最大' + MAX_IMGS + '枚までです。', 'warn');
      return Promise.resolve();
    }
    var uniqueId = newUniqueId();
    setBusy(card, true);
    toast('写真を登録中…', 'info');
    return compressImageFile(file)
      .then(function (blob) {
        return global.SYNC_CLIENT.uploadToolImage(toolName, blob, 'image/jpeg', uniqueId);
      })
      .then(function (res) {
        var url = res && res.url ? String(res.url) : '';
        if (!url) throw new Error('upload_failed');
        var next = listImgsFromDesc(global.DESCS && global.DESCS[toolName]).concat([url]);
        writeDescImgs(toolName, next);
        renderGallery(card, toolName);
        persistAfterImgChange();
        toast('「' + toolName + '」に写真を追加しました（' + Math.min(next.length, MAX_IMGS) + '/' + MAX_IMGS + '）。', 'success');
      })
      .catch(function (err) {
        console.error(err);
        var msg = String((err && err.message) || '');
        if (msg === 'unsupported_image_type') msg = '対応していない画像形式です（JPEG/PNG/WebP）';
        else if (msg === 'heic_unsupported' || msg === 'heic_convert_failed') msg = 'HEIC写真の変換に失敗しました。JPEG/PNGで選び直すか、時間をおいて再度お試しください。';
        else if (msg === 'heic_lib_missing') msg = 'HEIC変換機能の読み込みに失敗しました。通信状況を確認して再読み込みしてください。';
        else if (msg === 'image_decode_failed' || msg === '画像を読み込めませんでした') msg = '画像を開けませんでした。別の写真かJPEG/PNGでもう一度お試しください。';
        else if (msg === 'file_too_large') msg = '画像が大きすぎます';
        else if (msg === 'github_not_configured') msg = '画像保管の設定が未完了です（Worker の GITHUB_TOKEN）';
        else if (msg === 'github_auth_failed') msg = 'GitHub への書き込み権限がありません（GITHUB_TOKEN）';
        else if (msg.indexOf('github_api_error') === 0) msg = 'GitHub への保存に失敗しました';
        else if (msg === 'too_many_images') msg = '1つの道具につき写真は最大' + MAX_IMGS + '枚までです';
        else if (!msg || msg === 'upload_failed') msg = 'アップロードに失敗しました';
        toast(msg, 'error');
      })
      .finally(function () {
        setBusy(card, false);
      });
  }

  function removeOne(toolName, url, card) {
    if (!confirm('この写真を削除しますか？')) return;
    var run = Promise.resolve();
    if (global.SYNC_CLIENT && typeof global.SYNC_CLIENT.deleteToolImage === 'function') {
      setBusy(card, true);
      run = global.SYNC_CLIENT.deleteToolImage(toolName, url).catch(function (err) {
        console.warn(err);
      });
    }
    run
      .then(function () {
        var next = listImgsFromDesc(global.DESCS && global.DESCS[toolName]).filter(function (u) {
          return u !== url;
        });
        writeDescImgs(toolName, next);
        renderGallery(card, toolName);
        persistAfterImgChange();
        toast('写真を削除しました。', 'info');
      })
      .finally(function () {
        setBusy(card, false);
      });
  }

  function enhanceDescCard(card, toolName, currentImgOrDesc) {
    if (!card || !toolName) return;
    var urlRow = card.querySelector('.master-desc-url-row');
    if (!urlRow) return;
    urlRow.innerHTML = '';
    urlRow.className = 'master-desc-url-row tcb-tool-img-row';

    var seed = [];
    if (currentImgOrDesc && typeof currentImgOrDesc === 'object') {
      seed = listImgsFromDesc(currentImgOrDesc);
    } else if (currentImgOrDesc) {
      seed = listImgsFromDesc({ img: currentImgOrDesc });
    } else {
      seed = listImgsFromDesc(global.DESCS && global.DESCS[toolName]);
    }
    writeDescImgs(toolName, seed);

    var gallery = document.createElement('div');
    gallery.className = 'tcb-tool-img-gallery';

    var actions = document.createElement('div');
    actions.className = 'tcb-tool-img-actions';

    var fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.accept = 'image/jpeg,image/png,image/webp,image/*';
    fileInp.className = 'tcb-tool-img-file';
    fileInp.setAttribute('aria-hidden', 'true');
    fileInp.tabIndex = -1;

    var pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'tcb-tool-img-pick';
    pickBtn.title = 'フォルダやアルバムから画像を選んで登録（スマホは撮影も可）。HEICも自動変換。最大' + MAX_IMGS + '枚';

    var note = document.createElement('span');
    note.className = 'tcb-tool-img-cap';
    note.textContent = '最大' + MAX_IMGS + '枚';

    pickBtn.addEventListener('click', function () {
      fileInp.click();
    });
    fileInp.addEventListener('change', function () {
      var f = fileInp.files && fileInp.files[0];
      fileInp.value = '';
      if (f) uploadForTool(toolName, f, card);
    });

    actions.appendChild(pickBtn);
    actions.appendChild(note);
    urlRow.appendChild(gallery);
    urlRow.appendChild(actions);
    urlRow.appendChild(fileInp);
    renderGallery(card, toolName);
  }

  global.TCB_ToolImages = {
    MAX_IMGS: MAX_IMGS,
    compressImageFile: compressImageFile,
    enhanceDescCard: enhanceDescCard,
    listImgsFromDesc: listImgsFromDesc,
    writeDescImgs: writeDescImgs,
    uploadForTool: uploadForTool
  };
})(typeof window !== 'undefined' ? window : this);
