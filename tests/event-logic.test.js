'use strict';
const assert = require('node:assert/strict');
const logic = require('../event-logic.js');

function event(template='blank') {
  const value = logic.createEventFromTemplate(template, logic.DEFAULT_RESOURCE_CATALOG, {
    name:'Тестовое мероприятие',
    date:'2026-08-08T19:00',
  });
  return value;
}

function setGate(e, gateId, status, active=[], reserve=[]) {
  const gate=e.gates.find(g=>g.id===gateId);
  gate.status=status;
  gate.turnstiles.forEach((t,i)=>{
    const n=i+1;
    t.mode=active.includes(n)?'active':reserve.includes(n)?'reserve':'not_requested';
  });
  return e;
}

(function matchWithoutSib() {
  const e=event('match-no-sib');
  setGate(e,'kpp1','partial',[1,2,3,4],[5]);
  setGate(e,'kpp2','partial',[1,2,3,4,5,6]);
  e.gates.find(g=>g.id==='kpp3').status='planned_closed';
  e.gates.find(g=>g.id==='kpp4').status='planned_closed';
  e.cashDesks[0].mode='active';
  e.cashDesks[1].mode='active';
  e.cashDesks[2].mode='closed';
  const checklist=logic.generateChecklist(e);
  assert.equal(checklist.some(x=>x.key.startsWith('system:sib:')),false,'СИБ не должен появляться');
  assert.equal(checklist.filter(x=>x.key.includes(':reader')).length,10,'Проверки считывателей только у 10 рабочих турникетов');
  assert.equal(checklist.filter(x=>x.key.includes(':reserve-ready')).length,1,'Одна сокращённая проверка резерва');
  assert.equal(checklist.filter(x=>x.key.includes('planned-closed')).length,2,'Закрытые по плану гейты имеют только подтверждение закрытия');
  assert.equal(checklist.filter(x=>x.key.startsWith('cash:') && x.key.endsWith(':test-sale')).length,2,'Две активные кассы');
})();

(function matchWithSib() {
  const e=event('match-with-sib');
  setGate(e,'kpp1','active',[1,2,3,4,5,6,7,8]);
  const checklist=logic.generateChecklist(e);
  assert.equal(checklist.filter(x=>x.key.startsWith('system:sib:')).length,3,'Полный СИБ даёт три проверки');
  assert.ok(checklist.find(x=>x.key==='system:sib:test')?.critical,'Тест СИБ критический');
})();

(function reserveSib() {
  const e=event('blank');
  e.systems.sib='reserve';
  const checklist=logic.generateChecklist(e);
  assert.equal(checklist.filter(x=>x.key.startsWith('system:sib:')).length,2,'Резервный СИБ без полного сценария');
  assert.equal(checklist.some(x=>x.key==='system:sib:test'),false);
})();

(function reserveGate() {
  const e=event('blank');
  setGate(e,'kpp4','reserve',[],[1,2]);
  const checklist=logic.generateChecklist(e);
  assert.equal(checklist.filter(x=>x.key.includes('gate:kpp4') && x.key.includes('reserve-ready')).length,2);
  assert.equal(checklist.filter(x=>x.key.includes('gate:kpp4') && x.key.includes(':reader')).length,0);
})();

(function noOfflineSales() {
  const e=event('blank');
  e.systems.offlineSales=false;
  e.cashDesks[0].mode='active';
  const checklist=logic.generateChecklist(e);
  assert.equal(checklist.some(x=>x.key.startsWith('cash:')),false,'Кассы не проверяются, если офлайн-продажи выключены');
  const validation=logic.validateEvent(e);
  assert.ok(validation.warnings.some(x=>x.includes('офлайн-продажи')),'Несогласованность должна быть предупреждением');
})();

(function readinessExcludesUnused() {
  const e=event('blank');
  setGate(e,'kpp1','partial',[1]);
  e.checklist=logic.generateChecklist(e);
  e.checklist.forEach(item=>item.status='ok');
  const ready=logic.calculateReadiness(e);
  assert.equal(ready.percent,100);
  assert.equal(ready.label,'Готово');
  assert.equal(e.checklist.some(x=>x.resourceId==='kpp2'),false,'Неиспользуемый гейт не влияет');
})();

(function criticalFailure() {
  const e=event('blank');
  setGate(e,'kpp1','partial',[1]);
  e.checklist=logic.generateChecklist(e);
  e.checklist.forEach(item=>item.status='ok');
  const reader=e.checklist.find(item=>item.key.endsWith(':reader'));
  reader.status='failed';
  const ready=logic.calculateReadiness(e);
  assert.equal(ready.label,'Есть критические неисправности');
  assert.equal(ready.tone,'danger');
})();

(function preserveChecklistState() {
  const e=event('blank');
  setGate(e,'kpp1','partial',[1]);
  let list=logic.generateChecklist(e);
  const server=list.find(x=>x.key==='system:bps:server');
  server.status='ok'; server.note='Проверено';
  setGate(e,'kpp1','partial',[1,2]);
  list=logic.generateChecklist(e,list);
  assert.equal(list.find(x=>x.key==='system:bps:server').status,'ok');
  assert.equal(list.find(x=>x.key==='system:bps:server').note,'Проверено');
  assert.ok(list.some(x=>x.key.includes('kpp1-t2') && x.key.endsWith(':reader')),'Новый турникет создаёт новые проверки');
})();

(function assignmentsAreFlexible() {
  const e=event('match-no-sib');
  e.cashDesks[0].assignments=[
    {id:'a1',person:'Иванова',from:'15:00',to:'18:00'},
    {id:'a2',person:'Петрова',from:'18:00',to:'21:00'},
  ];
  e.cashDesks[1].assignments=[{id:'a3',person:'Сидорова',from:'15:00',to:'21:00'}];
  const summary=logic.summarizeConfiguration(e);
  assert.equal(summary.assignments,3);
})();

console.log('event-logic: 9 сценариев пройдены');
