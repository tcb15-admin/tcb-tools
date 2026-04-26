(function(global){
  'use strict';

  function safeJson(res){
    return res.text().then(function(t){
      if(!t)return {};
      try{return JSON.parse(t);}catch(e){return {raw:t};}
    });
  }

  function createSyncClient(opts){
    opts=opts||{};
    var base=String(opts.baseUrl||'').replace(/\/+$/,'');
    var token=String(opts.token||'');
    var cohort=String(opts.cohort||'');
    if(!base||!token||!cohort)return null;

    function req(path, method, body){
      return fetch(base+path,{
        method:method||'GET',
        headers:{
          'Content-Type':'application/json',
          'Authorization':'Bearer '+token
        },
        body:body?JSON.stringify(body):undefined
      }).then(function(res){
        return safeJson(res).then(function(payload){
          if(!res.ok){
            var msg=(payload&&payload.error)?payload.error:('HTTP '+res.status);
            throw new Error(msg);
          }
          return payload;
        });
      });
    }

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
        return req('/api/history-upsert','POST',{
          cohort:cohort,
          snap:snap
        });
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
      }
    };
  }

  global.TCB_createSyncClient=createSyncClient;
})(window);
