'use strict';
const assert = require('assert');
global.window = global;
require('../knowledge-logic.js');
const K = global.BpsKnowledgeLogic;

assert.equal(K.DEFAULT_CATEGORIES.length, 12, 'Должно быть 12 стартовых разделов');

const normalized = K.normalizeArticle({
  id:'a1', title:' Ошибка ОФД 32 ', type:'troubleshooting', categoryId:'kb_cash',
  prerequisites:'Интернет\n Доступ к кассе ', steps:'Проверить сеть\nПерезапустить службу',
  tags:'ОФД, касса, #Срочно, касса'
});
assert.deepEqual(normalized.prerequisites, ['Интернет','Доступ к кассе']);
assert.deepEqual(normalized.steps, ['Проверить сеть','Перезапустить службу']);
assert.deepEqual(normalized.tags, ['офд','касса','срочно']);

const invalid = K.validateArticle({ title:'Проверка', type:'instruction', categoryId:'kb_bps', steps:[] });
assert.equal(invalid.valid, false, 'Инструкция без шагов должна быть невалидна');
const valid = K.validateArticle({ title:'Проверка', type:'instruction', categoryId:'kb_bps', steps:['Шаг 1'] });
assert.equal(valid.valid, true);

const categories = [
  {id:'root',name:'Кассы',parentId:null,order:0},
  {id:'child',name:'ОФД',parentId:'root',order:0},
  {id:'other',name:'Турникеты',parentId:null,order:1},
];
const articles = [
  K.normalizeArticle({id:'a1',title:'Ошибка 32',type:'troubleshooting',categoryId:'child',summary:'Нет связи с ОФД',steps:['Проверить интернет'],status:'current',updatedAt:'2026-07-01T00:00:00Z'}),
  K.normalizeArticle({id:'a2',title:'Контрольный проход',type:'instruction',categoryId:'other',steps:['Считать билет'],status:'current',updatedAt:'2026-07-02T00:00:00Z'}),
];
assert.equal(K.filterArticles(articles,categories,{query:'офд'}).length,1,'Поиск должен находить текст и раздел');
assert.equal(K.filterArticles(articles,categories,{categoryId:'root'}).length,1,'Родительский раздел должен включать вложенные');
assert.equal(K.categoryCounts(articles,categories).get('root'),1,'Количество должно подниматься в родительский раздел');

const stale = K.normalizeArticle({id:'old',title:'Старая',categoryId:'root',type:'reference',status:'current',updatedAt:'2024-01-01T00:00:00Z'});
assert.equal(K.effectiveStatus(stale,new Date('2026-07-31T00:00:00Z')),'review');

const original = K.normalizeArticle({id:'v1',title:'Версия 1',categoryId:'root',type:'instruction',steps:['Первый шаг'],status:'current',updatedAt:'2026-07-01T00:00:00Z'});
const changed = K.mergeForSave(original,{...original,title:'Версия 2',steps:['Новый шаг']},'2026-07-31T00:00:00Z');
assert.equal(changed.versions.length,1,'При изменении должна сохраниться история');
assert.equal(changed.versions[0].data.title,'Версия 1');
const restored = K.restoreVersion(changed,changed.versions[0].id,'2026-08-01T00:00:00Z');
assert.equal(restored.title,'Версия 1','Восстановление должно вернуть старое содержимое');
assert.equal(restored.versions.length,2,'Текущая версия должна сохраниться перед восстановлением');

const linkedArticle = K.normalizeArticle({
  id:'linked', title:'Сервисная памятка', categoryId:'root', type:'reference',
  linkedEquipmentIds:['eq1'], linkedEventIds:['event1'], status:'current',
});
const context = {
  equipment:[{id:'eq1',name:'Турникет северный',designation:'Т-17',ip:'192.168.10.17'}],
  events:[{id:'event1',name:'Кубковый матч',type:'Матч'}],
};
assert.equal(K.filterArticles([linkedArticle],categories,{query:'т-17'},context).length,1,'Поиск должен учитывать обозначение связанного оборудования');
assert.equal(K.filterArticles([linkedArticle],categories,{query:'кубковый'},context).length,1,'Поиск должен учитывать связанное мероприятие');

const malformedLinks = K.normalizeArticle({ linkedEquipmentIds:'eq1', linkedEventIds:{id:'event1'} });
assert.deepEqual(malformedLinks.linkedEquipmentIds,[]);
assert.deepEqual(malformedLinks.linkedEventIds,[]);

const documentAttachment = { id:'doc1', name:'Регламент.pdf', mime:'application/pdf', size:3, data:'data:application/pdf;base64,AQID' };
const withDocument = K.normalizeArticle({ id:'doc-article', title:'Регламент', categoryId:'root', type:'reference', attachments:[documentAttachment] });
assert.equal(withDocument.attachments.length, 1, 'Документ должен сохраняться в материале');
assert.equal(K.filterArticles([withDocument], categories, { query:'регламент.pdf' }).length, 1, 'Имя документа должно участвовать в поиске');
assert.equal(K.validateAttachments([documentAttachment]).valid, true);
assert.equal(K.validateAttachments([{ ...documentAttachment, size:4 }]).valid, false, 'Размер документа должен совпадать с данными');
assert.equal(K.validateAttachments(Array.from({ length: K.MAX_ATTACHMENTS + 1 }, (_, index) => ({ ...documentAttachment, id:`doc-${index}` }))).valid, false, 'Лимит документов должен проверяться');
assert.equal(K.validateAttachments([{ ...documentAttachment, mime:'application/x-msdownload' }]).valid, false, 'Исполняемые типы не должны приниматься');

let capped = K.normalizeArticle({id:'capped',title:'До',categoryId:'root',type:'reference',versions:Array.from({length:20},(_,index)=>({id:`v${index}`,number:index+10,data:{}}))});
capped = K.mergeForSave(capped,{...capped,title:'После'},'2026-08-02T00:00:00Z');
assert.equal(capped.versions.length,20,'История должна оставаться ограниченной');
assert.equal(capped.versions.at(-1).number,30,'Номер версии не должен повторяться после ограничения истории');

console.log('knowledge-logic: 17 сценариев пройдены');
