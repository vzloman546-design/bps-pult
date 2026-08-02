'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert.match(sw,/const VERSION = '2\.7\.0'/);
for (const asset of ['styles.css','stability-logic.js','event-logic.js','knowledge-logic.js','productivity-logic.js','push-notifications.js','app.js','push-ui.js','event-ui.js','knowledge-ui.js']) {
  assert.equal(html.includes(`${asset}?v=2.7.0`),true,`${asset} должен иметь версионный URL`);
}
assert.match(sw, /PUSH-PRIVACY\.md/);
const installBlock=sw.slice(sw.indexOf("addEventListener('install'"),sw.indexOf("addEventListener('activate'"));
assert.doesNotMatch(installBlock,/skipWaiting/,'Новая версия не должна активироваться во время работы пользователя');
assert.match(sw,/event\.data\?\.type === 'SKIP_WAITING'/);
assert.match(sw,/caches\.keys\(\)/);
assert.match(sw,/event\.request\.mode === 'navigate'/);
assert.match(sw,/cache: 'no-store'/,'Навигация должна получать свежий index при наличии сети');
assert.doesNotMatch(sw,/caches\.match\(/,'Worker не должен читать чужие версии кэша');

(async () => {
  const handlers={};
  let networkCalls=0;
  const networkResponse={ok:true,source:'network',clone(){return this;}};
  const assetResponse={source:'active-asset'};
  const cache={
    match:async request=>typeof request==='string'?{source:'fallback-index'}:assetResponse,
    put:async()=>{},
    addAll:async()=>{},
  };
  const context={
    URL,
    Response:{error:()=>({source:'error'})},
      caches:{open:async name=>{assert.equal(name,'bps-pult-2.7.0');return cache;},keys:async()=>[],delete:async()=>true},
      fetch:async()=>{networkCalls++;return networkResponse;},
      self:{
        location:{origin:'https://example.test'},
        clients:{claim:async()=>{}},
        skipWaiting:async()=>{skipWaitingCalls+=1;},
        addEventListener:(name,handler)=>{handlers[name]=handler;},
      },
    };
  let skipWaitingCalls=0;
  vm.runInNewContext(sw,context);
  let responsePromise;
  handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://example.test/route'},respondWith:value=>{responsePromise=value;}});
  assert.equal(await responsePromise,networkResponse,'Онлайн-навигация должна использовать свежий index');
  handlers.fetch({request:{method:'GET',mode:'cors',url:'https://example.test/app.js'},respondWith:value=>{responsePromise=value;}});
  assert.equal(await responsePromise,assetResponse,'Статический ресурс должен браться из активного кэша');
  assert.equal(networkCalls,1);
  handlers.message({data:{type:'SKIP_WAITING'}});
  assert.equal(skipWaitingCalls,1,'Активация должна выполняться только по явному сообщению приложения');
  console.log('service-worker: controlled update, navigation and cache checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
