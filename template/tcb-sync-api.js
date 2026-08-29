(function(global){
  'use strict';

  function safeJson(res){
    return res.text().then(function(t){
      if(!t)return {};
      try{return JSON.parse(t);}catch(e){return {raw:t};}
    });
  }

  var REQ_TIMEOUT_MS=30000;

  /* ヘッダーの同期状態インジケーターへ通知（読み込まれていない画面では何もしない） */
  function notifySync(ev){
    try{
      if(global.TCB_Feedback&&typeof global.TCB_Feedback.syncStatus==='function'){
        global.TCB_Feedback.syncStatus(ev);
      }
    }catch(e){}
  }

  function createSyncClient(opts){
    opts=opts||{};
    var base=String(opts.baseUrl||'').replace(/\/+$/,'');
    var token=String(opts.token||'');
    var cohort=String(opts.cohort||'');
    if(!base||!token||!cohort)return null;

    function req(path, method, body){
      /* 遅い回線で無限に待たないよう30秒でタイムアウト */
      var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
      var timer=ctrl?setTimeout(function(){ctrl.abort();},REQ_TIMEOUT_MS):null;
      notifySync('start');
      return fetch(base+path,{
        method:method||'GET',
        headers:{
          'Content-Type':'application/json',
          'Authorization':'Bearer '+token
        },
        body:body?JSON.stringify(body):undefined,
        signal:ctrl?ctrl.signal:undefined
      }).then(function(res){
        return safeJson(res).then(function(payload){
          if(!res.ok){
            var msg=(payload&&payload.error)?payload.error:('HTTP '+res.status);
            throw new Error(msg);
          }
          notifySync('ok');
          return payload;
        });
      }).catch(function(err){
        notifySync('error');
        if(err&&err.name==='AbortError'){
          throw new Error('通信がタイムアウトしました（30秒）。電波状況を確認して再度お試しください。');
        }
        throw err;
      }).finally(function(){
        if(timer)clearTimeout(timer);
      });
    }

    /* 履歴追記は並行POSTで後勝ちにならないよう直列化する */
    var historyQueue=Promise.resolve();

    return {
      loadState:function(){
        return req('/api/state?cohort='+encodeURIComponent(cohort),'GET');
      },
      saveMaster:function(master, expectedVersion){
        return req('/api/save-master','POST',{
          cohort:cohort,
          expectedVersion:expectedVersion,
          master:master
        });
      },
      appendHistory:function(snap){
        var run=function(){
          return req('/api/history-upsert','POST',{
            cohort:cohort,
            snap:snap
          });
        };
        var p=historyQueue.then(run,run);
        historyQueue=p.catch(function(){});
        return p;
      },
      fetchHistory:function(days){
        return req('/api/history?cohort='+encodeURIComponent(cohort)+'&days='+encodeURIComponent(days||365),'GET');
      },
      deleteHistoryByDates:function(dates){
        return req('/api/history-delete','POST',{
          cohort:cohort,
          dates:dates||[]
        });
      },
      clearHistory:function(){
        return req('/api/history-clear','POST',{cohort:cohort});
      },
      confirmCarryout:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/confirm-carryout','POST',payload);
      },
      publishDay:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/publish-day','POST',payload);
      },
      unpublishDay:function(){
        return req('/api/unpublish-day','POST',{cohort:cohort});
      },
      /** 道具写真を R2 へアップロード（FormData・自動圧縮済み Blob 想定） */
      uploadToolImage:function(toolName, blob, contentType){
        var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
        var timer=ctrl?setTimeout(function(){ctrl.abort();},REQ_TIMEOUT_MS):null;
        var fd=new FormData();
        fd.append('cohort',cohort);
        fd.append('toolName',String(toolName||''));
        fd.append('file',blob,String(toolName||'tool').replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/g,'_').slice(0,40)+'.jpg');
        notifySync('start');
        return fetch(base+'/api/tool-image',{
          method:'POST',
          headers:{Authorization:'Bearer '+token},
          body:fd,
          signal:ctrl?ctrl.signal:undefined
        }).then(function(res){
          return safeJson(res).then(function(payload){
            if(!res.ok){
              var msg=(payload&&payload.error)?payload.error:('HTTP '+res.status);
              throw new Error(msg);
            }
            notifySync('ok');
            return payload;
          });
        }).catch(function(err){
          notifySync('error');
          if(err&&err.name==='AbortError'){
            throw new Error('通信がタイムアウトしました（30秒）。電波状況を確認して再度お試しください。');
          }
          throw err;
        }).finally(function(){
          if(timer)clearTimeout(timer);
        });
      },
      deleteToolImage:function(toolName){
        return req('/api/tool-image','DELETE',{cohort:cohort,toolName:toolName});
      },
      fetchSwapReports:function(){
        return req('/api/swap-reports?cohort='+encodeURIComponent(cohort),'GET');
      },
      handleSwapReport:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/swap-reports/handle','POST',payload);
      },
      pushSubscribe:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/push/subscribe','POST',payload);
      },
      listCampaigns:function(){
        return req('/api/attendance/campaigns?cohort='+encodeURIComponent(cohort),'GET');
      },
      upsertCampaign:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/attendance/campaigns','POST',payload);
      },
      getCampaign:function(id){
        return req('/api/attendance/campaign?cohort='+encodeURIComponent(cohort)+'&id='+encodeURIComponent(id||''),'GET');
      },
      publishAttendance:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/attendance/publish','POST',payload);
      },
      setCampaignStatus:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/attendance/campaign-status','POST',payload);
      },
      setTrackResponse:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/attendance/response','POST',payload);
      },
      listCrossRoleEvents:function(since){
        var q='/api/attendance/cross-events?cohort='+encodeURIComponent(cohort);
        if(since)q+='&since='+encodeURIComponent(since);
        return req(q,'GET');
      },
      getTeaSettings:function(){
        return req('/api/tea/settings?cohort='+encodeURIComponent(cohort),'GET');
      },
      saveTeaSettings:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/tea/settings','POST',payload);
      },
      listTeaMembers:function(){
        return req('/api/tea/members?cohort='+encodeURIComponent(cohort),'GET');
      },
      listTeaMonths:function(){
        return req('/api/tea/months?cohort='+encodeURIComponent(cohort),'GET');
      },
      getTeaMonth:function(ym){
        return req('/api/tea/month?cohort='+encodeURIComponent(cohort)+'&ym='+encodeURIComponent(ym||''),'GET');
      },
      saveTeaMonth:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/tea/month','POST',payload);
      },
      listTeaSupplies:function(){
        return req('/api/tea/supplies?cohort='+encodeURIComponent(cohort),'GET');
      },
      saveTeaSupplies:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/tea/supplies','POST',payload);
      },
      getTeaReflect:function(activityDate){
        return req('/api/tea/reflect?cohort='+encodeURIComponent(cohort)+'&activityDate='+encodeURIComponent(activityDate||''),'GET');
      },
      getTeaDutyOnDate:function(activityDate){
        return req('/api/tea/duty-on-date?cohort='+encodeURIComponent(cohort)+'&activityDate='+encodeURIComponent(activityDate||''),'GET');
      },
      listCarpoolSheets:function(){
        return req('/api/carpool/sheets?cohort='+encodeURIComponent(cohort),'GET');
      },
      getCarpoolSheet:function(id){
        return req('/api/carpool/sheet?cohort='+encodeURIComponent(cohort)+'&id='+encodeURIComponent(id||''),'GET');
      },
      upsertCarpoolSheet:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/carpool/sheets','POST',payload);
      },
      carpoolAction:function(payload){
        payload=payload||{};
        payload.cohort=cohort;
        return req('/api/carpool/action','POST',payload);
      },
      listCarpoolEvents:function(id){
        return req('/api/carpool/events?cohort='+encodeURIComponent(cohort)+'&id='+encodeURIComponent(id||''),'GET');
      },
      getCarpoolCandidates:function(campaignId, date, sheetId){
        var q='/api/carpool/candidates?cohort='+encodeURIComponent(cohort)
          +'&campaignId='+encodeURIComponent(campaignId||'')
          +'&date='+encodeURIComponent(date||'');
        if(sheetId)q+='&sheetId='+encodeURIComponent(sheetId);
        return req(q,'GET');
      },
      getPortalSummary:function(){
        return req('/api/portal/summary?cohort='+encodeURIComponent(cohort),'GET');
      }
    };
  }

  /** 保護者向け（トークン不要）。baseUrl のみ必須。 */
  function createPublicAttendanceClient(opts){
    opts=opts||{};
    var base=String(opts.baseUrl||'').replace(/\/+$/,'');
    if(!base)return null;

    function req(path, method, body){
      var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
      var timer=ctrl?setTimeout(function(){ctrl.abort();},REQ_TIMEOUT_MS):null;
      return fetch(base+path,{
        method:method||'GET',
        headers:{'Content-Type':'application/json'},
        body:body?JSON.stringify(body):undefined,
        signal:ctrl?ctrl.signal:undefined
      }).then(function(res){
        return safeJson(res).then(function(payload){
          if(!res.ok){
            var msg=(payload&&payload.error)?payload.error:('HTTP '+res.status);
            throw new Error(msg);
          }
          return payload;
        });
      }).catch(function(err){
        if(err&&err.name==='AbortError'){
          throw new Error('通信がタイムアウトしました（30秒）。電波状況を確認して再度お試しください。');
        }
        throw err;
      }).finally(function(){
        if(timer)clearTimeout(timer);
      });
    }

    return {
      load:function(sid){
        return req('/api/public/attendance?sid='+encodeURIComponent(sid||''),'GET');
      },
      respond:function(payload){
        return req('/api/public/attendance-response','POST',payload||{});
      }
    };
  }

  global.TCB_createSyncClient=createSyncClient;
  global.TCB_createPublicAttendanceClient=createPublicAttendanceClient;
})(window);
