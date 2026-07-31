'use strict';
const assert = require('node:assert/strict');
const S = require('../stability-logic.js');

const baseData = Object.fromEntries(S.DATA_STORES.map(store => [store, []]));
baseData.entries = [{ id:'e1', type:'Неисправность', object:'КПП-1', description:'Тест', status:'Не устранено', date:'2026-07-31T08:00:00.000Z', photos:['data:image/jpeg;base64,AQID'], createdAt:'2026-07-31T08:00:00.000Z', updatedAt:'2026-07-31T08:00:00.000Z' }];
baseData.settings = [{ key:'theme', value:'dark' }];

{
  const old = { app:'БПС Пульт', version:'1.0', schemaVersion:1, data:{ entries:baseData.entries } };
  const result = S.validatePayload(old);
  assert.equal(result.valid, true);
  assert.equal(result.payload.schemaVersion, 4);
  assert.equal(result.payload.data.entries[0].id, 'e1');
  assert.equal(result.payload.data.settings.some(item => item.key === 'dataSchemaVersion'), true);
}

{
  const archive = S.buildBackupArchive(baseData, { version:'2.0.0' });
  assert.equal(archive.manifest.attachmentCount, 1);
  const unpacked = S.readBackupArchive(archive.bytes);
  const validated = S.validatePayload(unpacked.payload);
  assert.equal(validated.valid, true);
  assert.equal(validated.payload.data.entries[0].photos[0], 'data:image/jpeg;base64,AQID');
  const corrupted = archive.bytes.slice();
  corrupted[50] ^= 0xff;
  assert.throws(() => S.readBackupArchive(corrupted), /поврежд|контрольн/i);
}

{
  const current = structuredClone(baseData);
  current.entries[0].updatedAt = '2026-07-31T09:00:00.000Z';
  const incoming = structuredClone(baseData);
  incoming.entries[0].description = 'Старое';
  incoming.entries[0].updatedAt = '2026-07-31T07:00:00.000Z';
  incoming.entries.push({ ...incoming.entries[0], id:'e2', description:'Новое' });
  const merged = S.mergeData(current, incoming);
  assert.equal(merged.entries.find(item => item.id === 'e1').description, 'Тест');
  assert.equal(merged.entries.some(item => item.id === 'e2'), true);
}

{
  const broken = structuredClone(baseData);
  broken.tasks = [{ id:'t1', title:'Задача', eventId:'missing', createdAt:'bad-date', updatedAt:'bad-date' }];
  const report = S.checkIntegrity(broken);
  assert.equal(report.errors.length, 0);
  assert.equal(report.warnings.some(item => item.code === 'orphan-event'), true);
  assert.equal(report.warnings.some(item => item.code === 'invalid-date'), true);
}

{
  const duplicate = { app:'БПС Пульт', schemaVersion:4, data:structuredClone(baseData) };
  duplicate.data.entries.push(structuredClone(duplicate.data.entries[0]));
  const result = S.validatePayload(duplicate);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /повторяется идентификатор/i);
}


{
  for (const schemaVersion of [2, 3]) {
    const payload = {
      app:'БПС Пульт', version:`2.0-alpha-schema-${schemaVersion}`, schemaVersion,
      data:{
        events:[{id:'ev1',name:'Матч',date:'2026-08-01T16:00:00Z',systems:{bps:true},gates:[],cashDesks:[],checklist:[]}],
        knowledgeArticles:[{id:'kb1',title:'Инструкция',categoryId:'kb_bps',steps:['Шаг 1']}],
        knowledgeCategories:[{id:'kb_bps',name:'БПС'}],
      }
    };
    const result=S.validatePayload(payload);
    assert.equal(result.valid,true);
    assert.equal(result.payload.schemaVersion,4);
    assert.equal(result.payload.data.events[0].id,'ev1');
    assert.equal(result.payload.data.knowledgeArticles[0].id,'kb1');
  }
}


{
  const missing = { app:'БПС Пульт', schemaVersion:4, data:{ entries:[{description:'без id'}] } };
  const result = S.validatePayload(missing);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /отсутствует идентификатор/i);
}

console.log('stability-logic: 8 групп сценариев пройдены');
