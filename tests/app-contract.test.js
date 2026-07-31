'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const mergeBlock = app.slice(app.indexOf('async function atomicMergeData'),app.indexOf('async function putRecordsAtomically'));
const migrationBlock = app.slice(app.indexOf('async function atomicMigrateCurrent'),app.indexOf('async function putRecordsAtomically'));

assert.match(mergeBlock,/runTransaction\(STORE_NAMES,\s*'readwrite'/,'Merge должен читать и писать в одной транзакции');
assert.doesNotMatch(mergeBlock,/getAllData\(/,'Merge не должен читать устаревающий снимок до транзакции записи');
assert.match(app,/putRecordsAtomically\(\{\s*entries:record,\s*tasks:linkedTask\s*\}\)/,'Запись и связанная задача должны сохраняться атомарно');
assert.match(app,/putRecordsAtomically\(\{\s*inspections:record,\s*tasks:linkedTask\s*\}\)/,'Осмотр и связанная задача должны сохраняться атомарно');
assert.match(app,/linkedInspectionId:preset\.linkedInspectionId\|\|null/,'Редактирование задачи должно сохранять связь с осмотром');
assert.match(app,/relatedChangesForDelete\('inspections'/,'Удаление осмотра должно атомарно очищать ссылки задач');
assert.match(app,/<img src="\$\{esc\(p\)\}"/,'Фото должны экранироваться перед вставкой в HTML');
assert.match(app,/clearTimeout\(interactionState\.modalCloseTimer\)/,'Новое окно не должно быть удалено таймером закрытия предыдущего');
assert.match(migrationBlock,/runTransaction\(STORE_NAMES,\s*'readwrite'/,'Миграция должна читать и писать в одной транзакции');
assert.match(app,/callbackError \|\| tx\.error/,'Ошибка внутри асинхронного обработчика должна приводить к понятному откату транзакции');

console.log('app-contract: 10 контрактов сохранности данных пройдены');
