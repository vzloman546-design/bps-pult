'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const mergeBlock = app.slice(app.indexOf('async function atomicMergeData'),app.indexOf('async function putRecordsAtomically'));
const migrationBlock = app.slice(app.indexOf('async function atomicMigrateCurrent'),app.indexOf('async function putRecordsAtomically'));

assert.match(mergeBlock,/runTransaction\(\[\.\.\.STORE_NAMES,\s*'drafts'\],\s*'readwrite'/,'Merge должен читать и писать в одной транзакции и очищать устаревшие черновики');
assert.doesNotMatch(mergeBlock,/getAllData\(/,'Merge не должен читать устаревающий снимок до транзакции записи');
assert.match(app,/putRecordsAtomically\(\{\s*entries:record,\s*tasks:linkedTask\s*\}\)/,'Запись и связанная задача должны сохраняться атомарно');
assert.match(app,/putRecordsAtomically\(\{\s*inspections:record,\s*tasks:linkedTask\s*\}\)/,'Осмотр и связанная задача должны сохраняться атомарно');
assert.match(app,/linkedInspectionId:preset\.linkedInspectionId\|\|null/,'Редактирование задачи должно сохранять связь с осмотром');
assert.match(app,/relatedChangesForDelete\('inspections'/,'Удаление осмотра должно атомарно очищать ссылки задач');
assert.match(app,/<img src="\$\{esc\(p\)\}"/,'Фото должны экранироваться перед вставкой в HTML');
assert.match(app,/clearTimeout\(interactionState\.modalCloseTimer\)/,'Новое окно не должно быть удалено таймером закрытия предыдущего');
assert.match(migrationBlock,/runTransaction\(STORE_NAMES,\s*'readwrite'/,'Миграция должна читать и писать в одной транзакции');
assert.match(app,/callbackError \|\| tx\.error/,'Ошибка внутри асинхронного обработчика должна приводить к понятному откату транзакции');
assert.match(app,/createObjectStore\('drafts'/,'Для черновиков должно использоваться отдельное внутреннее хранилище');
assert.match(app,/async function restoreLatestDraft/,'После перезапуска должен восстанавливаться последний черновик');
assert.match(app,/requestUpdateActivation/,'Обновление должно проверять черновики и резервную копию');
assert.match(app,/ensureStorageCapacity/,'Фото и импорт должны проходить предварительную проверку квоты');
assert.match(app,/findEquipmentDuplicates/,'Сохранение оборудования должно предупреждать о дубликатах');
const relatedBlock = app.slice(app.indexOf('function relatedEntitiesHtml'),app.indexOf('function bindRelatedEntityLinks'));
assert.doesNotMatch(relatedBlock,/listRow\(/,'Компактный блок связей не должен добавлять свайп-действия редактирования и удаления');
assert.match(app,/draftControllers\.get\(id\)\?\.cancel\?\.\(\)/,'Удаление черновика должно отменять ожидающее автосохранение');
assert.match(app,/wrapped\.cancel=/,'Debounce должен позволять отменить ожидающую запись черновика');

console.log('app-contract: 18 контрактов сохранности данных пройдены');
