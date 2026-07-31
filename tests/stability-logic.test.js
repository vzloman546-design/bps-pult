'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../stability-logic.js');

const baseData = Object.fromEntries(S.DATA_STORES.map(store => [store, []]));
baseData.entries = [{ id:'e1', type:'Неисправность', object:'КПП-1', description:'Тест', status:'Не устранено', date:'2026-07-31T08:00:00.000Z', photos:['data:image/jpeg;base64,AQID'], createdAt:'2026-07-31T08:00:00.000Z', updatedAt:'2026-07-31T08:00:00.000Z' }];
baseData.settings = [{ key:'theme', value:'dark' }];

{
  const old = { app:'БПС Пульт', version:'1.0', schemaVersion:1, data:{ entries:baseData.entries } };
  const result = S.validatePayload(old);
  assert.equal(result.valid, true);
  assert.equal(result.payload.schemaVersion, 5);
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
  const duplicate = { app:'БПС Пульт', schemaVersion:5, data:structuredClone(baseData) };
  duplicate.data.entries.push(structuredClone(duplicate.data.entries[0]));
  const result = S.validatePayload(duplicate);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /повторяется идентификатор/i);
}


{
  for (const schemaVersion of [2, 3, 4]) {
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
    assert.equal(result.payload.schemaVersion,5);
    assert.equal(result.payload.data.events[0].id,'ev1');
    assert.equal(result.payload.data.knowledgeArticles[0].id,'kb1');
  }
}


{
  const missing = { app:'БПС Пульт', schemaVersion:5, data:{ entries:[{description:'без id'}] } };
  const result = S.validatePayload(missing);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /отсутствует идентификатор/i);
}

{
  const unsafe = { app:'БПС Пульт', schemaVersion:5, data:structuredClone(baseData) };
  unsafe.data.entries[0].photos = ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='];
  const result = S.validatePayload(unsafe);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /небезопасный|неподдерживаемый/i);
  assert.equal(S.isSafeImageDataUrl('data:image/jpeg;base64,'), false, 'Пустое изображение недопустимо');
}

{
  const payload = { app:'БПС Пульт', schemaVersion:5, data:structuredClone(baseData) };
  payload.data.entries[0].date = 'не дата';
  payload.data.inspections = [{ id:'i1', object:'КПП-1', equipment:'Турникет', date:'2026-07-31T08:00:00Z', items:[{name:'Питание',status:'skip'}] }];
  payload.data.tasks = [{ id:'t1', title:'Проверить', linkedInspectionId:'i1' }];
  const result = S.validatePayload(payload);
  assert.equal(result.valid, true);
  assert.equal(result.payload.data.entries[0].date, 'не дата', 'Некорректную дату нельзя молча заменять текущей');
  assert.equal(result.payload.data.inspections[0].items[0].status, 'skip');
  assert.equal(result.payload.data.tasks[0].linkedInspectionId, 'i1');
  assert.match(result.warnings.join(' '), /некорректная дата/i);
}

{
  const data = structuredClone(baseData);
  data.inspections = [{ id:'i1' }];
  data.tasks = [
    { id:'t1', linkedEntryId:'e1', updatedAt:'2026-07-01T00:00:00Z' },
    { id:'t2', linkedInspectionId:'i1', updatedAt:'2026-07-01T00:00:00Z' },
  ];
  assert.equal(S.relatedChangesForDelete('entries','e1',data).at(0).after.linkedEntryId, null);
  assert.equal(S.relatedChangesForDelete('inspections','i1',data).at(0).after.linkedInspectionId, null);
  const orphan = structuredClone(data);
  orphan.inspections = [];
  assert.equal(S.checkIntegrity(orphan).warnings.some(item => item.code === 'orphan-inspection'), true);
}

{
  const before = { id:'t1', title:'До', linkedEntryId:'e1', tags:['старый'], updatedAt:'2026-07-01T00:00:00Z' };
  const after = { ...before, linkedEntryId:null, tags:['старый','служебный'], updatedAt:'2026-07-02T00:00:00Z' };
  const concurrentlyEdited = { ...after, title:'Изменено параллельно', tags:['старый','служебный','новый'] };
  const restored = S.reverseRelatedChange(concurrentlyEdited,{before,after},'2026-07-03T00:00:00Z');
  assert.equal(restored.linkedEntryId,'e1','Undo должен восстановить удалённую связь');
  assert.equal(restored.title,'Изменено параллельно','Undo не должен затирать параллельное изменение');
  assert.deepEqual(restored.tags,['старый','новый'],'Undo должен обратить только собственное изменение массива');
}

{
  const cyclic = structuredClone(baseData);
  cyclic.knowledgeCategories = [
    { id:'c1', name:'Один', parentId:'c2' },
    { id:'c2', name:'Два', parentId:'c1' },
  ];
  const report = S.checkIntegrity(cyclic);
  assert.equal(report.errors.filter(item => item.code === 'category-cycle').length, 1);
}

{
  const current = structuredClone(baseData);
  current.entries[0].updatedAt = 'не дата';
  const incoming = structuredClone(baseData);
  incoming.entries[0].description = 'Валидная новая запись';
  incoming.entries[0].updatedAt = '2026-07-31T10:00:00Z';
  assert.equal(S.mergeData(current,incoming).entries[0].description, 'Валидная новая запись');
}

{
  const encoder = new TextEncoder();
  const payload = { app:'БПС Пульт', version:'2.5.1', schemaVersion:5, data:structuredClone(baseData) };
  payload.data.entries[0].photos = [{ attachment:'attachments/photo.jpg', mime:'image/svg+xml', size:3 }];
  const manifest = { app:'БПС Пульт', backupFormat:2, attachmentCount:1 };
  const archive = S.createZip([
    { name:'manifest.json', data:encoder.encode(JSON.stringify(manifest)) },
    { name:'data.json', data:encoder.encode(JSON.stringify(payload)) },
    { name:'attachments/photo.jpg', data:new Uint8Array([1,2,3]) },
  ]);
  assert.throws(() => S.readBackupArchive(archive), /тип изображения/i);
}

{
  const payload = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','legacy-schema-4.json'),'utf8'));
  const result = S.validatePayload(payload);
  assert.equal(result.valid, true);
  assert.equal(result.payload.schemaVersion, 5);
  assert.equal(result.payload.data.equipment[0].favorite, true);
  assert.equal(result.payload.data.equipment[0].location, 'Правая линия');
  assert.equal(result.payload.data.events[0].verifiedBy, 'Артём');
  assert.equal(result.payload.data.events[0].readinessHistory.length, 1);
}

console.log('stability-logic: 16 групп сценариев пройдены');
