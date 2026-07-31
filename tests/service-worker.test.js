'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sw=fs.readFileSync(require('node:path').join(__dirname,'..','sw.js'),'utf8');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
assert.match(sw,/const VERSION = '2\.6\.0'/);
for (const asset of ['styles.css','stability-logic.js','event-logic.js','knowledge-logic.js','productivity-logic.js','push-notifications.js','app.js','event-ui.js','knowledge-ui.js']) {
  assert.equal(html.includes(`${asset}?v=2.6.0`),true,`${asset} должен иметь версионный URL`);
}
const installBlock=sw.slice(sw.indexOf("addEventListener('install'"),sw.indexOf("addEventListener('activate'"));
assert.doesNotMatch(installBlock,/skipWaiting/,'install не должен принудительно активировать обновление');
assert.match(sw,/event\.data\?\.type === 'SKIP_WAITING'/);
assert.match(sw,/caches\.keys\(\)/);
assert.match(sw,/event\.request\.mode === 'navigate'/);
assert.doesNotMatch(sw,/caches\.match\(/,'Активный worker не должен видеть кэши waiting-версии');

(async () => {
  const handlers={};
  let networkCalls=0;
  const navigationResponse={source:'active-index'};
  const assetResponse={source:'active-asset'};
  const cache={
    match:async request=>typeof request==='string'?navigationResponse:assetResponse,
    put:async()=>{},
    addAll:async()=>{},
  };
  const context={
    URL,
    caches:{open:async name=>{assert.equal(name,'bps-pult-2.6.0');return cache;},keys:async()=>[],delete:async()=>true},
    fetch:async()=>{networkCalls++;return {ok:true,clone(){return this;}};},
    self:{
      location:{origin:'https://example.test'},
      clients:{claim:async()=>{}},
      skipWaiting:async()=>{},
      addEventListener:(name,handler)=>{handlers[name]=handler;},
    },
  };
  vm.runInNewContext(sw,context);
  let responsePromise;
  handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://example.test/route'},respondWith:value=>{responsePromise=value;}});
  assert.equal(await responsePromise,navigationResponse,'Навигация должна использовать index активной версии');
  handlers.fetch({request:{method:'GET',mode:'cors',url:'https://example.test/app.js'},respondWith:value=>{responsePromise=value;}});
  assert.equal(await responsePromise,assetResponse,'Ресурс должен браться только из активного кэша');
  assert.equal(networkCalls,0,'При заполненном активном кэше сеть не должна смешивать версии');
  console.log('service-worker: controlled update and cache isolation checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
