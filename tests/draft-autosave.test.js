'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('function debounce(');
const end = app.indexOf('async function applyStoredTheme', start);
assert.ok(start >= 0 && end > start, 'Не удалось найти реализацию debounce');

const context = { setTimeout, clearTimeout };
vm.runInNewContext(`${app.slice(start, end)}\nthis.testDebounce = debounce;`, context);

(async () => {
  let writes = 0;
  const pending = context.testDebounce(() => { writes += 1; }, 20);
  pending();
  pending.cancel();
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(writes, 0, 'Отменённое автосохранение не должно выполняться');

  pending();
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.equal(writes, 1, 'Неотменённое автосохранение должно выполниться один раз');

  console.log('draft-autosave: 2 сценария отмены debounce пройдены');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
