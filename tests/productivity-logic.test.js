'use strict';

const assert = require('node:assert/strict');
const P = require('../productivity-logic.js');

const now = new Date('2026-07-31T12:00:00+03:00');
const data = {
  entries: [{ id:'e1', type:'Неисправность', object:'КПП-1', equipment:'Турникет 3', description:'Ошибка считывателя', status:'Не устранено', date:'2026-07-31T08:00:00Z' }],
  tasks: [
    { id:'t1', title:'Проверить турникет', object:'КПП-1', description:'QR', priority:'Важный', dueAt:'2026-07-30T08:00:00Z', completed:false },
    { id:'t2', title:'Обновить схему', object:'Офис', completed:true, completedAt:'2026-07-31T09:00:00Z' },
  ],
  inspections: [{ id:'i1', object:'КПП-1', equipment:'Турникеты', date:'2026-07-31T07:00:00Z', items:[{ name:'Считыватель', status:'issue' }] }],
  equipment: [
    { id:'q1', name:'Турникет КПП-1 №3', object:'КПП-1', designation:'Т-03', ip:'192.168.1.3', serial:'ABC-1', status:'Требует внимания' },
    { id:'q2', name:'Сервер', object:'Серверная', designation:'SRV', ip:'192.168.1.5', serial:'ABC-2', status:'Работает' },
  ],
  events: [{ id:'v1', name:'Матч Мордовия', type:'Матч', date:'2026-07-31T16:00:00Z', status:'preparing', gates:[{ name:'КПП-1', turnstiles:[{ name:'Турникет 3', mode:'active' }] }] }],
  knowledgeArticles: [{ id:'k1', title:'Диагностика QR', summary:'Считыватель турникета', status:'current', linkedEquipmentIds:['q1'], linkedEventIds:['v1'] }],
  knowledgeCategories: [],
};

{
  const results = P.searchEntities(data, 'турникет');
  assert.ok(results.some(item => item.store === 'entries' && item.id === 'e1'));
  assert.ok(results.some(item => item.store === 'equipment' && item.id === 'q1'));
  assert.ok(results.some(item => item.store === 'knowledgeArticles' && item.id === 'k1'));
  assert.deepEqual(P.searchEntities(data, 'турникет', 'tasks').map(item => item.id), ['t1']);
  assert.deepEqual(P.searchEntities(data, '31.07.2026', 'events').map(item => item.id), ['v1']);
  assert.match(P.searchEntities(data, '31.07.2026', 'events')[0].meta, /Подготовка/);
  assert.match(P.searchEntities(data, 'диагностика', 'knowledgeArticles')[0].meta, /Актуально/);
  assert.deepEqual(P.searchEntities(data, 'я'), []);
}

{
  const duplicates = P.findEquipmentDuplicates(data.equipment, { ip:'192.168.1.3', serial:'abc1', designation:'T-99' });
  assert.deepEqual(duplicates.map(item => item.id), ['q1']);
  assert.equal(P.findEquipmentDuplicates(data.equipment, { ip:'192.168.1.3' }, 'q1').length, 0);
}

{
  const report = P.reportData(data, {
    from:'2026-07-31',
    to:'2026-07-31',
    sections:['entries','completedTasks','overdueTasks','inspections','equipment','events'],
  }, now);
  assert.equal(report.entries.length, 1);
  assert.equal(report.completedTasks.length, 1);
  assert.equal(report.overdueTasks.length, 1);
  assert.equal(report.inspections.length, 1);
  assert.equal(report.equipment.length, 1);
  assert.equal(report.events.length, 1);
  const text = P.formatReport(report, value => value);
  assert.match(text, /ПРОСРОЧЕННЫЕ ЗАДАЧИ/);
  assert.match(text, /ОБОРУДОВАНИЕ ТРЕБУЕТ ВНИМАНИЯ/);
  assert.match(text, /Подготовка/);
  const csv = P.reportToCsv(report);
  assert.match(csv, /^﻿"Раздел";/);
  assert.match(csv, /"Турникет КПП-1 №3"/);
  assert.match(csv, /"Подготовка"/);
}

{
  const related = P.relatedEntities(data, 'events', 'v1');
  assert.ok(related.some(item => item.store === 'knowledgeArticles' && item.id === 'k1'));
  const articleLinks = P.relatedEntities(data, 'knowledgeArticles', 'k1');
  assert.ok(articleLinks.some(item => item.store === 'equipment' && item.id === 'q1'));
  assert.ok(articleLinks.some(item => item.store === 'events' && item.id === 'v1'));
}

console.log('productivity-logic: 4 группы сценариев пройдены');
