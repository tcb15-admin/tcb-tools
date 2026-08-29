/* マスタ：道具写真の選択・圧縮・R2アップロード（道具名へ紐付け）
   依存: SYNC_CLIENT.uploadToolImage / deleteToolImage、DESCS、saveMaster、tcbToast/showMasterAlert */
(function (global) {
  'use strict';

  var MAX_EDGE = 1200;
  var JPEG_QUALITY = 0.82;
  var MAX_BYTES = 1.5 * 1024 * 1024;

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

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('画像を読み込めませんでした'));
      };
      img.src = url;
    });
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

  /** 端末の写真／ファイルを JPEG に圧縮（横長辺 MAX_EDGE） */
  function compressImageFile(file) {
    return loadImageFromFile(file).then(function (img) {
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
        if (blob.size > MAX_BYTES) {
          return canvasToJpegBlob(canvas, 0.7).then(function (blob2) {
            if (blob2.size > MAX_BYTES) throw new Error('画像が大きすぎます（圧縮後も上限超過）');
            return blob2;
          });
        }
        return blob;
      });
    });
  }

  function fillPreview(el, url) {
    if (!el) return;
    el.innerHTML = '';
    var u = String(url || '').trim();
    if (!u) {
      el.textContent = '\ud83d\udcf7';
      return;
    }
    var ni = document.createElement('img');
    ni.src = u;
    ni.alt = '';
    ni.loading = 'lazy';
    ni.decoding = 'async';
    ni.width = 48;
    ni.height = 36;
    ni.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    ni.onerror = function () {
      el.innerHTML = '';
      el.textContent = '\u26a0\ufe0f';
    };
    el.appendChild(ni);
  }

  function setDescImg(toolName, url) {
    if (!global.DESCS) global.DESCS = {};
    if (!global.DESCS[toolName]) global.DESCS[toolName] = { text: '', img: '' };
    global.DESCS[toolName].img = String(url || '').trim();
  }

  function persistAfterImgChange() {
    if (typeof global.syncEnabled === 'function' && global.syncEnabled() && typeof global.saveMaster === 'function') {
      global.saveMaster();
      return;
    }
    toast('写真を更新しました。マスタの「保存」を押してください。', 'info');
  }

  function setBusy(card, on) {
    if (!card) return;
    card.classList.toggle('tcb-tool-img-busy', !!on);
    card.querySelectorAll('.tcb-tool-img-pick, .tcb-tool-img-clear').forEach(function (b) {
      b.disabled = !!on;
    });
  }

  function uploadForTool(toolName, file, card) {
    if (!global.SYNC_CLIENT || typeof global.SYNC_CLIENT.uploadToolImage !== 'function') {
      toast('クラウド同期が有効な環境でのみ写真を登録できます。', 'warn');
      return Promise.resolve();
    }
    if (!file) return Promise.resolve();
    setBusy(card, true);
    toast('写真を登録中…', 'info');
    return compressImageFile(file)
      .then(function (blob) {
        return global.SYNC_CLIENT.uploadToolImage(toolName, blob, 'image/jpeg');
      })
      .then(function (res) {
        var url = res && res.url ? String(res.url) : '';
        if (!url) throw new Error('upload_failed');
        setDescImg(toolName, url);
        var pv = card && card.querySelector('.master-desc-preview');
        fillPreview(pv, url);
        var clearBtn = card && card.querySelector('.tcb-tool-img-clear');
        if (clearBtn) clearBtn.hidden = false;
        persistAfterImgChange();
        toast('「' + toolName + '」に写真を紐付けました。', 'success');
      })
      .catch(function (err) {
        console.error(err);
        var msg = String((err && err.message) || '');
        if (msg === 'unsupported_image_type') msg = '対応していない画像形式です（JPEG/PNG/WebP）';
        else if (msg === 'file_too_large') msg = '画像が大きすぎます';
        else if (msg === 'r2_not_configured') msg = '画像保管の設定が未完了です（管理者へ）';
        else if (!msg || msg === 'upload_failed') msg = 'アップロードに失敗しました';
        toast(msg, 'error');
      })
      .finally(function () {
        setBusy(card, false);
      });
  }

  function clearForTool(toolName, card) {
    if (!confirm('「' + toolName + '」の写真を削除しますか？')) return;
    var run = Promise.resolve();
    if (global.SYNC_CLIENT && typeof global.SYNC_CLIENT.deleteToolImage === 'function') {
      setBusy(card, true);
      run = global.SYNC_CLIENT.deleteToolImage(toolName).catch(function (err) {
        console.warn(err);
      });
    }
    run
      .then(function () {
        setDescImg(toolName, '');
        fillPreview(card && card.querySelector('.master-desc-preview'), '');
        var clearBtn = card && card.querySelector('.tcb-tool-img-clear');
        if (clearBtn) clearBtn.hidden = true;
        persistAfterImgChange();
        toast('写真を削除しました。', 'info');
      })
      .finally(function () {
        setBusy(card, false);
      });
  }

  /** マスタ説明カードに「写真を選ぶ／削除」UIを付ける */
  function enhanceDescCard(card, toolName, currentImg) {
    if (!card || !toolName) return;
    var urlRow = card.querySelector('.master-desc-url-row');
    if (!urlRow) return;
    urlRow.innerHTML = '';
    urlRow.className = 'master-desc-url-row tcb-tool-img-row';

    var preview = document.createElement('div');
    preview.className = 'master-desc-preview';
    fillPreview(preview, currentImg || '');

    var actions = document.createElement('div');
    actions.className = 'tcb-tool-img-actions';

    var fileInp = document.createElement('input');
    fileInp.type = 'file';
    fileInp.accept = 'image/*';
    fileInp.className = 'tcb-tool-img-file';
    fileInp.setAttribute('aria-hidden', 'true');
    fileInp.tabIndex = -1;

    var pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'tcb-tool-img-pick';
    pickBtn.textContent = '写真を選ぶ';
    pickBtn.title = 'フォルダやアルバムから画像を選んで登録（スマホは撮影も可）';

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'tcb-tool-img-clear';
    clearBtn.textContent = '削除';
    clearBtn.hidden = !String(currentImg || '').trim();

    pickBtn.addEventListener('click', function () {
      fileInp.click();
    });
    fileInp.addEventListener('change', function () {
      var f = fileInp.files && fileInp.files[0];
      fileInp.value = '';
      if (f) uploadForTool(toolName, f, card);
    });
    clearBtn.addEventListener('click', function () {
      clearForTool(toolName, card);
    });

    actions.appendChild(pickBtn);
    actions.appendChild(clearBtn);
    urlRow.appendChild(preview);
    urlRow.appendChild(actions);
    urlRow.appendChild(fileInp);
  }

  global.TCB_ToolImages = {
    compressImageFile: compressImageFile,
    enhanceDescCard: enhanceDescCard,
    fillPreview: fillPreview,
    uploadForTool: uploadForTool
  };
})(typeof window !== 'undefined' ? window : this);
