'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('async function withBusyButton');
const end = app.indexOf('function photoPickerHtml', start);
assert.ok(start >= 0 && end > start, 'Не удалось найти защиту кнопки сохранения');
for (const saveId of ['saveEntry', 'saveTask', 'saveInspection', 'saveEquipment']) {
  assert.match(app, new RegExp(`querySelector\\('#${saveId}'\\)[\\s\\S]{0,260}withBusyButton`), `${saveId} должен использовать защиту от повторного сохранения`);
}
for (const [file, saveId] of [['event-ui.js', 'saveEvent'], ['knowledge-ui.js', 'saveKnowledgeArticle'], ['knowledge-ui.js', 'saveKnowledgeCategory']]) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(source, new RegExp(`querySelector\\('#${saveId}'\\)[\\s\\S]{0,5000}withBusyButton`), `${saveId} должен использовать защиту от повторного сохранения`);
}

const context = {
  rememberRuntimeError() {},
  toast() {},
};
vm.runInNewContext(`${app.slice(start, end)}\nthis.testWithBusyButton = withBusyButton;`, context);

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const button = {
  dataset: {},
  disabled: false,
  textContent: 'Сохранить',
  isConnected: true,
  setAttribute() {},
  removeAttribute() {},
};

(async () => {
  let writes = 0;
  const first = context.testWithBusyButton(button, 'Сохранение…', async () => {
    writes += 1;
    await delay(25);
  });
  const second = context.testWithBusyButton(button, 'Сохранение…', async () => {
    writes += 1;
  });

  assert.equal(await second, false, 'Второе нажатие не должно запускать запись');
  assert.equal(await first, true, 'Первая запись должна завершиться успешно');
  assert.equal(writes, 1, 'Должна выполниться только одна запись');
  assert.equal(button.disabled, false, 'После сохранения кнопка должна разблокироваться');
  assert.equal(button.textContent, 'Сохранить', 'После сохранения текст кнопки должен восстановиться');

  const failed = await context.testWithBusyButton(button, 'Сохранение…', async () => {
    throw new Error('test failure');
  });
  assert.equal(failed, false, 'Ошибка сохранения должна возвращаться как неуспешная');
  assert.equal(button.disabled, false, 'После ошибки кнопку можно нажать повторно');

  console.log('form-save-guard: двойное нажатие и повтор после ошибки проверены');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
