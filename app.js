'use strict';

const APP_VERSION = '2.5.1';
const SCHEMA_VERSION = 5;
const DB_NAME = 'bps-pult-local';
const DB_VERSION = 5;
const STORE_NAMES = [...BpsStability.DATA_STORES];
const INTERNAL_STORE_NAMES = ['trash', 'drafts'];

const ENTRY_TYPES = [
  'Неисправность', 'Выполненная работа', 'Наблюдение', 'Обращение кассира',
  'Продажа билетов', 'Возврат билета', 'Работа с агрегатором', 'Подготовка мероприятия', 'Прочее'
];
const OBJECTS = ['КПП-1', 'КПП-2', 'КПП-3', 'КПП-4', 'ВСА-1', 'ВСА-2', 'Кассы', 'Сервер БПС', 'Билетный агрегатор', 'Офис', 'Другое'];
const ENTRY_STATUSES = ['Устранено', 'Работает — наблюдать', 'Повторная проверка', 'Не устранено', 'Ожидается ответ', 'Информация'];
const PRIORITIES = ['Обычный', 'Важный', 'Критический'];
const EQUIPMENT_STATUSES = ['Работает', 'Требует внимания', 'Не работает', 'Резерв', 'Списано'];
const INSPECTION_ITEMS = [
  'Внешний вид', 'Питание', 'Сетевая связь', 'Считыватель билетов', 'Световая индикация',
  'Звуковая индикация', 'Створки и механика', 'Датчики прохода', 'Аварийное открытие',
  'Контрольный билет', 'Синхронизация данных'
];

const state = {
  route: 'today',
  journal: { query: '', type: 'Все типы', object: 'Все объекты', status: 'Все статусы', period: 'Все даты' },
  taskFilter: 'Открытые',
  inspectionFilter: 'Все',
  equipment: { query:'', status:'Все статусы', favorite:false },
  events: { query:'', status:'Все статусы' },
  globalSearch: { query:'', type:'all' },
  report: {
    from: dayKey(new Date()),
    to: dayKey(new Date()),
    sections: ['entries','completedTasks','overdueTasks','inspections','equipment','events'],
  },
  knowledge: { query: '', type: 'all', status: 'all', categoryId: null, favorite: false, showAll: false },
  preferences: { startupRoute:'last', operatorName:'Артём', highContrast:false },
  recentItems: [],
  data: { entries: [], tasks: [], inspections: [], equipment: [], events: [], knowledgeArticles: [], knowledgeCategories: [] },
};

const interactionState = {
  modalClosing: false,
  modalCloseTimer: null,
  openSwipeRow: null,
  previousFocus: null,
  modalKeyHandler: null,
  updateRegistration: null,
  dirtyDraftKeys: new Set(),
  draftControllers: new Map(),
};
const runtimeErrors = [];
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const iconPaths = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5"/><path d="M9 21v-6h6v6"/>',
  journal: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inspection: '<path d="M9 3h6l1 3h3v15H5V6h3z"/><path d="m8 13 2.5 2.5L16 10"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  moon: '<path d="M20.5 14.2A8 8 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  task: '<path d="M9 4h11v16H4V9"/><path d="m4 4 3 3 5-5"/><path d="M10 11h7M10 15h7"/>',
  alert: '<path d="M10.3 3.4 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.4a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  camera: '<path d="M4 7h4l1.5-2h5L16 7h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  equipment: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/>',
  report: '<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h6M9 8h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 4h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  wifiOff: '<path d="m2 2 20 20M8.5 8.5A9 9 0 0 1 19 10M5 10a11 11 0 0 1 1.5-1M8 14a6 6 0 0 1 6.5-.9M12 19h.01"/>',
  install: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 6v9M9 12l3 3 3-3M10 19h4"/>',
  ticket: '<path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><path d="M13 7v12"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9z"/>',
  'star-filled': '<path fill="currentColor" stroke="none" d="m12 2.6 3 6.1 6.7 1-4.8 4.7 1.1 6.7-6-3.2-6 3.2 1.1-6.7-4.8-4.7 6.7-1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4L3 10"/><path d="M3 4v6h6M4 13a8 8 0 0 0 14.8 4l2.2-3"/><path d="M21 20v-6h-6"/>',
};

function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.info}</svg>`;
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
function nowISO() { return new Date().toISOString(); }
function localDateTimeValue(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function nl2br(value) { return esc(value).replace(/\n/g, '<br>'); }
function parseDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
function dayKey(value) {
  const d = parseDate(value) || new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isToday(value) { return dayKey(value) === dayKey(new Date()); }
function isThisMonth(value) {
  const d = parseDate(value); const n = new Date();
  return d && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
}
function isOverdue(task) { return !task.completed && task.dueAt && new Date(task.dueAt) < new Date() && !isToday(task.dueAt); }
function formatDate(value, options = {}) {
  const d = parseDate(value);
  if (!d) return 'Без даты';
  return new Intl.DateTimeFormat('ru-RU', options).format(d);
}
function formatDateTime(value) { return formatDate(value, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
function formatFullDate(value) { return formatDate(value, { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
function relativeDay(value) {
  const key = dayKey(value), today = dayKey(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return 'Сегодня';
  if (key === dayKey(y)) return 'Вчера';
  return formatDate(value, { day:'numeric', month:'long', year: new Date(value).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}
function statusTone(status) {
  if (['Устранено', 'Работает', 'Выполнена'].includes(status)) return 'success';
  if (['Не устранено', 'Не работает', 'Критический'].includes(status)) return 'danger';
  if (['Работает — наблюдать', 'Повторная проверка', 'Требует внимания', 'Важный'].includes(status)) return 'warning';
  if (['Ожидается ответ', 'Информация', 'Резерв'].includes(status)) return 'info';
  return 'neutral';
}
function entryIcon(type) {
  if (type === 'Неисправность') return 'alert';
  if (type === 'Выполненная работа') return 'wrench';
  if (type.includes('билет') || type === 'Продажа билетов') return 'ticket';
  if (type === 'Подготовка мероприятия') return 'calendar';
  return 'journal';
}
function optionsHtml(items, selected) {
  return items.map(item => `<option value="${esc(item)}" ${item === selected ? 'selected' : ''}>${esc(item)}</option>`).join('');
}

let dbPromise;
let activeDb = null;
let lastStorageError = null;

function storageError(error, fallback = 'Ошибка локального хранилища') {
  const source = error || {};
  const quota = source.name === 'QuotaExceededError' || source.name === 'NS_ERROR_DOM_QUOTA_REACHED';
  const message = quota
    ? 'Недостаточно свободного места. Создайте резервную копию и удалите ненужные фотографии.'
    : (source.message || fallback);
  const wrapped = new Error(message);
  wrapped.name = source.name || 'StorageError';
  wrapped.cause = source;
  lastStorageError = wrapped;
  return wrapped;
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('date', 'date'); store.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('dueAt', 'dueAt'); store.createIndex('completed', 'completed');
      }
      if (!db.objectStoreNames.contains('inspections')) {
        const store = db.createObjectStore('inspections', { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('equipment')) db.createObjectStore('equipment', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events')) {
        const store = db.createObjectStore('events', { keyPath: 'id' });
        store.createIndex('date', 'date'); store.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('knowledgeArticles')) {
        const store = db.createObjectStore('knowledgeArticles', { keyPath: 'id' });
        store.createIndex('categoryId', 'categoryId'); store.createIndex('status', 'status'); store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('knowledgeCategories')) {
        const store = db.createObjectStore('knowledgeCategories', { keyPath: 'id' });
        store.createIndex('parentId', 'parentId');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('trash')) {
        const store = db.createObjectStore('trash', { keyPath: 'id' });
        store.createIndex('expiresAt', 'expiresAt');
      }
      if (!db.objectStoreNames.contains('drafts')) {
        const store = db.createObjectStore('drafts', { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt');
      }
    };
    request.onblocked = () => {
      window.dispatchEvent(new CustomEvent('bps-db-blocked'));
      if (!settled) { settled = true; dbPromise = null; reject(storageError({ name: 'BlockedError', message: 'Обновление базы заблокировано другой вкладкой. Закройте БПС Пульт во всех вкладках и повторите.' })); }
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      activeDb = request.result;
      activeDb.onversionchange = () => {
        activeDb.close(); activeDb = null; dbPromise = null;
        window.dispatchEvent(new CustomEvent('bps-db-versionchange'));
      };
      activeDb.onerror = event => { lastStorageError = storageError(event.target?.error || activeDb.error); };
      resolve(activeDb);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true; dbPromise = null; reject(storageError(request.error, 'Не удалось открыть локальную базу.'));
    };
  });
  return dbPromise;
}

async function runTransaction(storeNames, mode, executor) {
  const db = await openDatabase();
  const names = [...new Set(Array.isArray(storeNames) ? storeNames : [storeNames])];
  return new Promise((resolve, reject) => {
    let result;
    let failed = false;
    let callbackError = null;
    let tx;
    try { tx = db.transaction(names, mode, { durability: mode === 'readwrite' ? 'strict' : 'default' }); }
    catch (error) {
      try { tx = db.transaction(names, mode); } catch (fallbackError) { reject(storageError(fallbackError)); return; }
    }
    const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
    tx.oncomplete = () => { if (!failed) resolve(result); };
    tx.onerror = () => { failed = true; reject(storageError(tx.error)); };
    tx.onabort = () => { failed = true; reject(storageError(callbackError || tx.error || new DOMException('Транзакция отменена', 'AbortError'))); };
    const abortWithError = error => {
      callbackError = error;
      try { tx.abort(); }
      catch (abortError) { failed = true; reject(storageError(error || abortError)); }
    };
    try {
      result = executor(stores, tx, value => { result = value; }, abortWithError);
      if (result && typeof result.onsuccess !== 'undefined') result.onsuccess = () => { result = result.result; };
    } catch (error) {
      failed = true;
      try { tx.abort(); } catch (_) {}
      reject(storageError(error));
    }
  });
}

async function storeAction(storeName, mode, action) {
  let requestResult;
  await runTransaction(storeName, mode, stores => {
    const request = action(stores[storeName]);
    if (request && typeof request.onsuccess !== 'undefined') request.onsuccess = () => { requestResult = request.result; };
  });
  return requestResult;
}
function noteDataChange(store) {
  if (store === 'settings' || store === 'trash') return;
  try { localStorage.setItem('bps-last-data-change', nowISO()); } catch (_) {}
}
const dbGetAll = store => storeAction(store, 'readonly', s => s.getAll());
const dbGet = (store, id) => storeAction(store, 'readonly', s => s.get(id));
async function dbPut(store, value) { const result = await storeAction(store, 'readwrite', s => s.put(value)); noteDataChange(store); return result; }
async function dbDelete(store, id) { const result = await storeAction(store, 'readwrite', s => s.delete(id)); noteDataChange(store); return result; }
async function dbClear(store) { const result = await storeAction(store, 'readwrite', s => s.clear()); noteDataChange(store); return result; }
async function getSetting(key, fallback = null) { const v = await dbGet('settings', key); return v ? v.value : fallback; }
async function setSetting(key, value) { await storeAction('settings', 'readwrite', s => s.put({ key, value })); }

function formValues(form) {
  const values = {};
  form?.querySelectorAll('input[id],select[id],textarea[id]').forEach(input => {
    if (input.type === 'file' || input.type === 'button' || input.type === 'submit') return;
    values[input.id] = input.type === 'checkbox' || input.type === 'radio' ? input.checked : input.value;
  });
  form?.querySelectorAll('[role="switch"][id]').forEach(button => {
    values[button.id] = button.getAttribute('aria-checked') === 'true';
  });
  return values;
}

function applyFormValues(form, values = {}) {
  for (const [id, value] of Object.entries(values || {})) {
    const input = form?.querySelector(`#${CSS.escape(id)}`);
    if (!input) continue;
    if (input.matches('[role="switch"]')) {
      input.classList.toggle('on', Boolean(value));
      input.setAttribute('aria-checked', String(Boolean(value)));
    } else if (input.type === 'checkbox' || input.type === 'radio') {
      input.checked = Boolean(value);
    } else {
      input.value = String(value ?? '');
    }
  }
}

function draftId(type, entityId = '') {
  return `${type}:${entityId || 'new'}`;
}

async function deleteDraft(id) {
  if (!id) return;
  interactionState.draftControllers.get(id)?.cancel?.();
  await storeAction('drafts', 'readwrite', store => store.delete(id));
  interactionState.dirtyDraftKeys.delete(id);
  interactionState.draftControllers.delete(id);
}

function attachDraftAutosave(node, options) {
  const {
    type,
    entityId = '',
    restored = null,
    formSelector = 'form',
    snapshot = null,
    restore = null,
  } = options;
  const id = draftId(type, entityId);
  const form = node.querySelector(formSelector);
  if (restored?.data) {
    if (restore) restore(restored.data);
    else applyFormValues(form, restored.data.values);
  }
  const save = debounce(async () => {
    try {
      const data = snapshot ? snapshot() : { values:formValues(form) };
      await storeAction('drafts', 'readwrite', store => store.put({
        id,
        type,
        entityId: entityId || null,
        route: state.route,
        savedAt: nowISO(),
        data,
      }));
      interactionState.dirtyDraftKeys.add(id);
    } catch (error) {
      rememberRuntimeError(error, 'draft-save');
      toast('Не удалось сохранить черновик');
    }
  }, 350);
  const schedule = event => {
    if (event?.target?.closest?.('[data-no-draft]')) return;
    save();
  };
  form?.addEventListener('input', schedule);
  form?.addEventListener('change', schedule);
  form?.addEventListener('click', event => {
    if (event.target.closest('button[type="button"],[role="switch"]')) schedule(event);
  });
  const controller = {
    id,
    save,
    schedule,
    cancel: () => save.cancel?.(),
    clear: () => deleteDraft(id),
  };
  interactionState.draftControllers.set(id, controller);
  if (restored) interactionState.dirtyDraftKeys.add(id);
  return controller;
}

async function cleanupDrafts() {
  const drafts = await dbGetAll('drafts');
  const cutoff = Date.now() - 30 * 86400000;
  for (const draft of drafts) {
    if (new Date(draft.savedAt || 0).getTime() < cutoff) await deleteDraft(draft.id);
  }
}

async function restoreLatestDraft() {
  const drafts = (await dbGetAll('drafts')).sort((a,b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  const draft = drafts[0];
  if (!draft) return false;
  const existingByType = {
    entry: () => state.data.entries.find(item => item.id === draft.entityId),
    task: () => state.data.tasks.find(item => item.id === draft.entityId),
    inspection: () => state.data.inspections.find(item => item.id === draft.entityId),
    equipment: () => state.data.equipment.find(item => item.id === draft.entityId),
    event: () => state.data.events.find(item => item.id === draft.entityId),
    knowledge: () => state.data.knowledgeArticles.find(item => item.id === draft.entityId),
  };
  const existing = existingByType[draft.type]?.() || null;
  if (draft.entityId && !existing) {
    await deleteDraft(draft.id);
    return false;
  }
  if (draft.type === 'entry') openEntryForm(existing, draft);
  else if (draft.type === 'task') openTaskForm(existing, draft);
  else if (draft.type === 'inspection') openInspectionForm(existing, draft);
  else if (draft.type === 'equipment') openEquipmentForm(existing, draft);
  else if (draft.type === 'event') openEventEditor(draft.data?.event || BpsEventLogic.normalizeEvent(existing || {}), Boolean(existing), draft);
  else if (draft.type === 'knowledge') openKnowledgeArticleForm(existing, draft);
  else return false;
  toast(`Восстановлен черновик от ${formatDateTime(draft.savedAt)}`, { duration:5000 });
  return true;
}

async function loadUiPreferences() {
  const stored = await getSetting('uiPreferences', {});
  state.preferences = {
    startupRoute: stored?.startupRoute || 'last',
    operatorName: stored?.operatorName || 'Артём',
    highContrast: Boolean(stored?.highContrast),
  };
  state.recentItems = await getSetting('recentItems', []);
  state.taskFilter = await getSetting('filter:tasks', 'Открытые');
  state.inspectionFilter = await getSetting('filter:inspections', 'Все');
  state.equipment = { ...state.equipment, ...(await getSetting('filter:equipment', {})) };
  state.events = { ...state.events, ...(await getSetting('filter:events', {})) };
  state.journal = { ...state.journal, ...(await getSetting('filter:journal', {})) };
  state.knowledge = { ...state.knowledge, ...(await getSetting('filter:knowledge', {})) };
  document.documentElement.dataset.contrast = state.preferences.highContrast ? 'high' : 'normal';
}

async function saveUiPreferences() {
  await setSetting('uiPreferences', state.preferences);
}

async function rememberRecent(store, id, title) {
  const item = { store, id, title, openedAt:nowISO() };
  state.recentItems = [item, ...state.recentItems.filter(entry => !(entry.store === store && entry.id === id))].slice(0, 12);
  await setSetting('recentItems', state.recentItems);
}

function recentItemRow(item) {
  const meta = BpsProductivity.TYPE_META[item.store];
  if (!meta) return '';
  return listRow({
    id:item.id,
    action:meta.action,
    iconName:meta.icon,
    title:item.title,
    meta:`${meta.label} · ${formatDateTime(item.openedAt)}`,
  });
}

function relatedEntitiesHtml(store, id) {
  const related = BpsProductivity.relatedEntities(state.data, store, id);
  if (!related.length) return '';
  return `<section class="modal-section related-section"><h3 class="modal-section-title">Связано с</h3><div class="list-card">${related.slice(0,8).map(item => `<button class="list-row" data-action="${esc(item.action)}" data-id="${esc(item.id)}">
    <span class="row-icon">${icon(item.icon)}</span>
    <span class="list-row-main"><span class="list-row-title">${esc(item.title)}</span><span class="list-row-meta">${esc(`${item.relationship}${item.meta ? ` · ${item.meta}` : ''}`)}</span></span>
    <span class="list-row-chevron">${icon('chevron')}</span>
  </button>`).join('')}</div></section>`;
}

function bindRelatedEntityLinks(root) {
  root.querySelectorAll('.related-section [data-action]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const { action, id } = button.dataset;
    closeModal({ immediate:true });
    handleAppAction(action, id);
  }));
}

async function getAllData() {
  const result = {};
  const rows = await Promise.all(STORE_NAMES.map(dbGetAll));
  STORE_NAMES.forEach((store, index) => { result[store] = rows[index]; });
  return result;
}

async function atomicReplaceData(data, { clearTrash = true, settings = [] } = {}) {
  const names = clearTrash ? [...STORE_NAMES, ...INTERNAL_STORE_NAMES] : STORE_NAMES;
  await runTransaction(names, 'readwrite', stores => {
    for (const store of STORE_NAMES) {
      stores[store].clear();
      for (const item of data[store] || []) stores[store].put(item);
    }
    for (const setting of settings) stores.settings.put(setting);
    if (clearTrash) {
      stores.trash.clear();
      stores.drafts.clear();
    }
  });
  noteDataChange('import');
}

async function atomicMergeData(importedData, { settings = [] } = {}) {
  await runTransaction([...STORE_NAMES, 'drafts'], 'readwrite', (stores, tx, setResult, abortWithError) => {
    const current = {};
    let remaining = STORE_NAMES.length;
    const finish = () => {
      if (--remaining) return;
      try {
        const merged = BpsStability.mergeData(current, importedData);
        for (const store of STORE_NAMES) {
          stores[store].clear();
          for (const item of merged[store] || []) stores[store].put(item);
        }
        for (const setting of settings) stores.settings.put(setting);
        stores.drafts.clear();
      } catch (error) {
        abortWithError(error);
      }
    };
    for (const store of STORE_NAMES) {
      const request = stores[store].getAll();
      request.onsuccess = () => { current[store] = request.result; finish(); };
    }
  });
  noteDataChange('import');
}

async function atomicMigrateCurrent(sourceSchema) {
  let migrations = [];
  await runTransaction(STORE_NAMES, 'readwrite', (stores, tx, setResult, abortWithError) => {
    const current = {};
    let remaining = STORE_NAMES.length;
    const finish = () => {
      if (--remaining) return;
      try {
        const migrated = BpsStability.migratePayload({
          app:'БПС Пульт',
          version:APP_VERSION,
          schemaVersion:Math.min(sourceSchema, SCHEMA_VERSION),
          data:current,
        });
        for (const store of STORE_NAMES) {
          stores[store].clear();
          for (const item of migrated.data[store] || []) stores[store].put(item);
        }
        migrations = migrated.migrations;
      } catch (error) {
        abortWithError(error);
      }
    };
    for (const store of STORE_NAMES) {
      const request = stores[store].getAll();
      request.onsuccess = () => { current[store] = request.result; finish(); };
    }
  });
  noteDataChange('migration');
  return migrations;
}

async function putRecordsAtomically(recordsByStore) {
  const names = Object.keys(recordsByStore).filter(store => STORE_NAMES.includes(store));
  if (!names.length) return;
  await runTransaction(names, 'readwrite', stores => {
    for (const store of names) {
      const records = Array.isArray(recordsByStore[store]) ? recordsByStore[store] : [recordsByStore[store]];
      records.filter(Boolean).forEach(item => stores[store].put(item));
    }
  });
  names.forEach(noteDataChange);
}

async function runLiveMigrations() {
  const storedSchema = Number(await getSetting('dataSchemaVersion', 1)) || 1;
  if (storedSchema >= SCHEMA_VERSION) return [];
  return atomicMigrateCurrent(storedSchema);
}

async function cleanupTrash() {
  const items = await dbGetAll('trash');
  const now = Date.now();
  const expired = items.filter(item => new Date(item.expiresAt || 0).getTime() <= now);
  if (!expired.length) return;
  await runTransaction('trash', 'readwrite', stores => expired.forEach(item => stores.trash.delete(item.id)));
}


async function refreshData() {
  const [entries, tasks, inspections, equipment, events, knowledgeArticles, knowledgeCategories] = await Promise.all(['entries','tasks','inspections','equipment','events','knowledgeArticles','knowledgeCategories'].map(dbGetAll));
  state.data.entries = entries.sort((a,b) => new Date(b.date) - new Date(a.date));
  state.data.tasks = tasks.sort((a,b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    if (!a.dueAt) return 1; if (!b.dueAt) return -1; return new Date(a.dueAt) - new Date(b.dueAt);
  });
  state.data.inspections = inspections.sort((a,b) => new Date(b.date) - new Date(a.date));
  state.data.equipment = equipment.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
  state.data.events = events.sort((a,b) => new Date(a.date || 0) - new Date(b.date || 0));
  state.data.knowledgeArticles = knowledgeArticles.sort((a,b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  state.data.knowledgeCategories = knowledgeCategories.sort((a,b) => (a.order - b.order) || a.name.localeCompare(b.name, 'ru'));
}

function toast(message, options = {}) {
  const root = document.getElementById('toastRoot');
  const action = options.actionText ? `<button type="button" class="toast-action">${esc(options.actionText)}</button>` : '';
  root.innerHTML = `<div class="toast"><span>${esc(message)}</span>${action}</div>`;
  clearTimeout(toast.timer);
  const close = () => { root.innerHTML = ''; };
  root.querySelector('.toast-action')?.addEventListener('click', async () => {
    clearTimeout(toast.timer);
    try { await options.onAction?.(); } finally { close(); }
  });
  toast.timer = setTimeout(close, Number(options.duration || 4200));
}

async function restoreTrashItem(trashId) {
  const item = await dbGet('trash', trashId);
  if (!item?.record || !item.store) return false;
  const related = (Array.isArray(item.related) ? item.related : [])
    .filter(change => change?.store && change?.before && STORE_NAMES.includes(change.store));
  const storeNames = [item.store, 'trash', ...related.map(change => change.store)];
  await runTransaction(storeNames, 'readwrite', (stores, tx, setResult, abortWithError) => {
    const currentRelated = new Array(related.length);
    let primary = null;
    let remaining = related.length + 1;
    const finish = () => {
      if (--remaining) return;
      try {
        if (!primary) stores[item.store].put(item.record);
        related.forEach((change, index) => {
          const restored = BpsStability.reverseRelatedChange(currentRelated[index], change, nowISO());
          if (restored) stores[change.store].put(restored);
        });
        stores.trash.delete(trashId);
      } catch (error) {
        abortWithError(error);
      }
    };
    const primaryRequest = stores[item.store].get(item.record.id);
    primaryRequest.onsuccess = () => { primary = primaryRequest.result; finish(); };
    related.forEach((change, index) => {
      const request = stores[change.store].get(change.before.id);
      request.onsuccess = () => { currentRelated[index] = request.result; finish(); };
    });
  });
  noteDataChange(item.store);
  await render();
  return true;
}

async function softDelete(store, id, label = 'Объект', relatedStores = [], collectRelated = null) {
  const relatedNames = [...new Set(relatedStores.filter(name => STORE_NAMES.includes(name) && name !== store))];
  const trashId = `trash_${store}_${id}_${Date.now().toString(36)}`;
  let deleted = false;
  await runTransaction([store, 'trash', ...relatedNames], 'readwrite', (stores, tx, setResult, abortWithError) => {
    const source = {};
    const requests = [{ name:store, request:stores[store].get(id), single:true }, ...relatedNames.map(name => ({ name, request:stores[name].getAll(), single:false }))];
    let remaining = requests.length;
    const finish = () => {
      if (--remaining) return;
      try {
        const value = source[store];
        if (!value) return;
        const related = typeof collectRelated === 'function' ? collectRelated(source, value) : [];
        const cleanRelated = related.filter(change => change?.store && change?.before && change?.after && stores[change.store]);
        const deletedAt = nowISO();
        const trashItem = {
          id: trashId,
          store,
          record: value,
          related: cleanRelated.map(change => ({ store:change.store, before:change.before, after:change.after })),
          label,
          deletedAt,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        };
        stores[store].delete(id);
        cleanRelated.forEach(change => stores[change.store].put(change.after));
        stores.trash.put(trashItem);
        deleted = true;
      } catch (error) {
        abortWithError(error);
      }
    };
    requests.forEach(({ name, request }) => {
      request.onsuccess = () => { source[name] = request.result; finish(); };
    });
  });
  if (!deleted) return false;
  noteDataChange(store);
  await render();
  toast(`${label} удалён`, {
    actionText: 'Отменить',
    duration: 8000,
    onAction: async () => {
      if (await restoreTrashItem(trashId)) toast(`${label} восстановлен`);
    },
  });
  return true;
}

async function deleteEntryWithUndo(id) {
  return softDelete('entries', id, 'Запись', ['tasks'], source =>
    BpsStability.relatedChangesForDelete('entries', id, source, nowISO()));
}
async function deleteEventWithUndo(id) {
  return softDelete('events', id, 'Мероприятие', ['entries','tasks','inspections','knowledgeArticles'], source =>
    BpsStability.relatedChangesForDelete('events', id, source, nowISO()));
}
async function deleteEquipmentWithUndo(id) {
  return softDelete('equipment', id, 'Оборудование', ['knowledgeArticles'], source =>
    BpsStability.relatedChangesForDelete('equipment', id, source, nowISO()));
}
async function deleteInspectionWithUndo(id) {
  return softDelete('inspections', id, 'Техосмотр', ['tasks'], source =>
    BpsStability.relatedChangesForDelete('inspections', id, source, nowISO()));
}


function setTheme(theme) {
  const resolved = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = theme;
  try { localStorage.setItem('bps-theme', theme); } catch (_) {}
  const color = resolved === 'dark' ? '#0e100f' : '#f4f4f2';
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = resolved;
  if (document.body) document.body.style.backgroundColor = color;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', color);
  const iconSuffix = resolved === 'dark' ? 'dark' : 'light';
  const favicon = document.getElementById('appFavicon');
  const appleTouchIcon = document.getElementById('appleTouchIcon');
  if (favicon) favicon.setAttribute('href', `./favicon-${iconSuffix}-32.png?v=2.5.1`);
  if (appleTouchIcon) appleTouchIcon.setAttribute('href', `./apple-touch-icon-${iconSuffix}.png?v=2.5.1`);
  document.getElementById('themeQuickBtn').innerHTML = icon(resolved === 'dark' ? 'sun' : 'moon');
}
async function cycleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  await setSetting('theme', next); setTheme(next);
  if (state.route === 'settings') render();
}

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function updateOnlineStatus() {
  document.getElementById('offlineBar').hidden = navigator.onLine;
}

const routeTitles = {
  today: 'Сегодня', journal: 'Журнал', inspections: 'Техосмотры', more: 'Ещё',
  tasks: 'Задачи', events: 'Мероприятия', knowledge: 'База знаний', equipment: 'Оборудование',
  search: 'Поиск', report: 'Отчёты', settings: 'Настройки', install: 'Как установить'
};
function go(route) {
  location.hash = route;
}
function currentRoute() {
  const value = location.hash.replace('#','').split('?')[0];
  return routeTitles[value] ? value : 'today';
}
function updateNav() {
  document.querySelectorAll('.nav-button').forEach(btn => btn.classList.toggle('active', btn.dataset.route === state.route || (btn.dataset.route === 'more' && ['tasks','events','knowledge','equipment','search','report','settings','install'].includes(state.route))));
}

async function render() {
  const previousRoute = state.route;
  state.route = currentRoute();
  await refreshData();
  if (previousRoute !== state.route) await setSetting('lastRoute', state.route);
  document.getElementById('pageTitle').textContent = routeTitles[state.route];
  updateNav();
  const main = document.getElementById('appMain');
  const pages = {
    today: renderToday, journal: renderJournal, inspections: renderInspections, more: renderMore,
    tasks: renderTasks, events: renderEvents, knowledge: renderKnowledge, equipment: renderEquipment,
    search: renderGlobalSearch, report: renderReport, settings: renderSettings, install: renderInstall
  };
  const update = async () => {
    main.classList.remove('page-ready');
    main.innerHTML = await pages[state.route]();
    main.dataset.route = state.route;
    bindPageEvents();
    requestAnimationFrame(() => main.classList.add('page-ready'));
  };
  if (document.startViewTransition && !prefersReducedMotion()) {
    const transition = document.startViewTransition(update);
    await transition.finished.catch(() => {});
  } else {
    await update();
  }
  if (previousRoute !== state.route) window.scrollTo({ top: 0, behavior: 'instant' });
}

function emptyState(iconName, title, text, action = '') {
  return `<div class="empty-state"><div class="empty-state-icon">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
function swipeActionsFor(action, id) {
  const safeId = esc(id);
  if (action === 'entry-detail') return `<button class="swipe-action edit" data-gesture-action="edit-entry" data-id="${safeId}">${icon('edit')}<span>Изменить</span></button><button class="swipe-action delete" data-gesture-action="delete-entry" data-id="${safeId}">${icon('trash')}<span>Удалить</span></button>`;
  if (action === 'task-detail') return `<button class="swipe-action complete" data-gesture-action="toggle-task" data-id="${safeId}">${icon('check')}<span>Готово</span></button><button class="swipe-action edit" data-gesture-action="edit-task" data-id="${safeId}">${icon('edit')}<span>Изменить</span></button>`;
  if (action === 'inspection-detail') return `<button class="swipe-action edit" data-gesture-action="edit-inspection" data-id="${safeId}">${icon('edit')}<span>Изменить</span></button><button class="swipe-action delete" data-gesture-action="delete-inspection" data-id="${safeId}">${icon('trash')}<span>Удалить</span></button>`;
  if (action === 'equipment-detail') return `<button class="swipe-action edit" data-gesture-action="edit-equipment" data-id="${safeId}">${icon('edit')}<span>Изменить</span></button><button class="swipe-action delete" data-gesture-action="delete-equipment" data-id="${safeId}">${icon('trash')}<span>Удалить</span></button>`;
  if (action === 'event-detail') return `<button class="swipe-action edit" data-gesture-action="edit-event" data-id="${safeId}">${icon('edit')}<span>Изменить</span></button><button class="swipe-action delete" data-gesture-action="delete-event" data-id="${safeId}">${icon('trash')}<span>Удалить</span></button>`;
  if (action === 'knowledge-detail') return `<button class="swipe-action edit" data-gesture-action="edit-knowledge" data-id="${safeId}">${icon('edit')}<span>Изменить</span></button><button class="swipe-action delete" data-gesture-action="delete-knowledge" data-id="${safeId}">${icon('trash')}<span>Удалить</span></button>`;
  return '';
}
function swipeRow(content, action, id) {
  const actions = swipeActionsFor(action, id);
  return actions ? `<div class="swipe-row" data-swipe-row data-id="${esc(id)}"><div class="swipe-actions">${actions}</div>${content}</div>` : content;
}
function listRow({ id, action, iconName = 'journal', tone = '', title, meta, side = '', extra = '' }) {
  const content = `<button class="list-row swipe-content" data-action="${action}" data-id="${esc(id)}">
    <span class="row-icon ${tone}">${icon(iconName)}</span>
    <span class="list-row-main"><span class="list-row-title">${esc(title)}</span><span class="list-row-meta">${esc(meta)}</span>${extra}</span>
    ${side ? `<span class="list-row-side">${side}</span>` : ''}<span class="list-row-chevron">${icon('chevron')}</span>
  </button>`;
  return swipeRow(content, action, id);
}

async function renderToday() {
  const { entries, tasks, inspections } = state.data;
  const open = tasks.filter(t => !t.completed);
  const overdue = open.filter(isOverdue);
  const todayEntries = entries.filter(e => isToday(e.date));
  const monthInspections = inspections.filter(i => isThisMonth(i.date));
  const unresolved = entries.filter(e => ['Не устранено','Повторная проверка','Работает — наблюдать','Ожидается ответ'].includes(e.status));
  const attention = [...overdue.map(t => ({ kind:'task', ...t })), ...unresolved.slice(0,4).map(e => ({ kind:'entry', ...e }))].slice(0,5);
  const nearest = open.slice().sort((a,b) => (a.dueAt ? new Date(a.dueAt) : Infinity) - (b.dueAt ? new Date(b.dueAt) : Infinity)).slice(0,5);
  const recentToday = todayEntries.slice(0,4);
  const recentObjects = state.recentItems
    .filter(item => state.data[item.store]?.some(record => record.id === item.id))
    .slice(0,4);
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const todayLabel = formatDate(new Date(), { weekday:'long', day:'numeric', month:'long' });
  const install = !isStandalone() ? `<div class="section"><div class="inline-notice"><span class="inline-notice-icon">${icon('install')}</span><span><strong>Установить на iPhone</strong><small>Работает офлайн после первого запуска</small></span><button class="text-button" data-route-link="install">Открыть</button></div></div>` : '';
  const lastBackupAt = await getSetting('lastBackupAt', null);
  const backupDays = daysSince(lastBackupAt);
  const hasData = entries.length + tasks.length + inspections.length + state.data.equipment.length + state.data.events.length + state.data.knowledgeArticles.length > 0;
  const backupNotice = hasData && (backupDays === null || backupDays >= 14)
    ? `<div class="section"><div class="inline-notice warning"><span class="inline-notice-icon">${icon('download')}</span><span><strong>${backupDays===null?'Нет резервной копии':'Копия старше 14 дней'}</strong><small>Создайте проверяемый архив в настройках</small></span><button class="text-button" data-route-link="settings">Открыть</button></div></div>`
    : '';
  return `
    <section class="today-intro">
      <div class="today-greeting">${greeting}, Артём</div>
      <div class="today-date">${todayLabel}</div>
      <div class="local-state">${icon('database')} Данные хранятся только на этом iPhone</div>
    </section>
    ${install}
    ${backupNotice}
    ${renderNextEventSection()}
    <section class="section quick-filter-section" aria-label="Быстрые фильтры">
      <div class="filter-row">
        <button class="chip" data-quick-filter="today">${icon('calendar')}Сегодня</button>
        <button class="chip ${overdue.length?'has-count':''}" data-quick-filter="overdue">${icon('clock')}Просрочено${overdue.length?` <span>${overdue.length}</span>`:''}</button>
        <button class="chip" data-quick-filter="without-result">${icon('inspection')}Без результата</button>
        <button class="chip" data-quick-filter="attention">${icon('alert')}Требует внимания</button>
      </div>
    </section>
    <section class="section">
      <div class="status-strip" aria-label="Сводка">
        <button class="status-cell" data-route-link="tasks"><strong>${open.length}</strong><span>Задачи</span></button>
        <button class="status-cell ${overdue.length ? 'is-danger' : ''}" data-route-link="tasks"><strong>${overdue.length}</strong><span>Просрочено</span></button>
        <button class="status-cell" data-route-link="journal"><strong>${todayEntries.length}</strong><span>Записи</span></button>
        <button class="status-cell" data-route-link="inspections"><strong>${monthInspections.length}</strong><span>Осмотры</span></button>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><div><h2 class="section-title">Требует внимания</h2><p class="section-subtitle">Просрочки и незакрытые проблемы</p></div>${attention.length ? `<span class="count-badge">${attention.length}</span>` : ''}</div>
      ${attention.length ? `<div class="list-card">${attention.map(item => item.kind === 'task'
        ? listRow({ id:item.id, action:'task-detail', iconName:'clock', tone:isOverdue(item)?'danger':'warning', title:item.title, meta:`${item.object || 'Без объекта'} · ${item.dueAt ? formatDateTime(item.dueAt) : 'Без срока'}`, side:`<span class="status-pill ${statusTone(item.priority)}">${esc(item.priority)}</span>` })
        : listRow({ id:item.id, action:'entry-detail', iconName:entryIcon(item.type), tone:statusTone(item.status), title:item.equipment || item.type, meta:`${item.object} · ${item.status}`, side:formatDate(item.date,{day:'numeric',month:'short'}) })
      ).join('')}</div>` : `<div class="quiet-state">${icon('check')}<span><strong>Всё спокойно</strong><small>Нет просроченных задач и незакрытых проблем</small></span></div>`}
    </section>
    <section class="section">
      <div class="section-head"><div><h2 class="section-title">Ближайшие задачи</h2></div><button class="text-button" data-action="new-task">Новая задача</button></div>
      ${nearest.length ? `<div class="list-card">${nearest.map(taskRow).join('')}</div>` : `<div class="quiet-state">${icon('task')}<span><strong>Задач пока нет</strong><small>Новая задача создаётся одной кнопкой</small></span></div>`}
    </section>
    <section class="section">
      <div class="section-head"><div><h2 class="section-title">Сегодня в журнале</h2></div><button class="text-button" data-route-link="journal">Все записи</button></div>
      ${recentToday.length ? `<div class="list-card">${recentToday.map(entryRow).join('')}</div>` : `<div class="quiet-state">${icon('journal')}<span><strong>Записей ещё нет</strong><small>Нажмите «Создать» в нижней панели</small></span></div>`}
    </section>
    ${recentObjects.length ? `<section class="section"><div class="section-head"><div><h2 class="section-title">Недавно открытые</h2></div></div><div class="list-card">${recentObjects.map(recentItemRow).join('')}</div></section>` : ''}`;
}
function plural(number, one, few, many) {
  const n = Math.abs(number) % 100, n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function filteredEntries() {
  const f = state.journal;
  return state.data.entries.filter(e => {
    const hay = `${e.type} ${e.object} ${e.equipment} ${e.description} ${e.status}`.toLowerCase();
    if (f.query && !hay.includes(f.query.toLowerCase())) return false;
    if (f.type !== 'Все типы' && e.type !== f.type) return false;
    if (f.object !== 'Все объекты' && e.object !== f.object) return false;
    if (f.status !== 'Все статусы' && e.status !== f.status) return false;
    if (f.period === 'Сегодня' && !isToday(e.date)) return false;
    if (f.period === '7 дней' && new Date(e.date) < new Date(Date.now()-7*864e5)) return false;
    if (f.period === '30 дней' && new Date(e.date) < new Date(Date.now()-30*864e5)) return false;
    return true;
  });
}
function renderJournal() {
  const entries = filteredEntries();
  const activeFilterCount = [
    state.journal.query,
    state.journal.type !== 'Все типы',
    state.journal.object !== 'Все объекты',
    state.journal.status !== 'Все статусы',
    state.journal.period !== 'Все даты',
  ].filter(Boolean).length;
  const groups = Object.groupBy ? Object.groupBy(entries, e => dayKey(e.date)) : entries.reduce((acc,e)=>((acc[dayKey(e.date)] ||= []).push(e),acc),{});
  return `
    <section class="section filters">
      <div class="search-input-wrap">${icon('search')}<input id="journalSearch" type="search" aria-label="Поиск по журналу" placeholder="Поиск по журналу" value="${esc(state.journal.query)}" autocomplete="off"></div>
      <div class="form-grid two">
        <select id="journalType" aria-label="Тип записи">${optionsHtml(['Все типы',...ENTRY_TYPES],state.journal.type)}</select>
        <select id="journalObject" aria-label="Объект">${optionsHtml(['Все объекты',...OBJECTS],state.journal.object)}</select>
        <select id="journalStatus" aria-label="Статус">${optionsHtml(['Все статусы',...ENTRY_STATUSES],state.journal.status)}</select>
        <select id="journalPeriod" aria-label="Период">${optionsHtml(['Все даты','Сегодня','7 дней','30 дней'],state.journal.period)}</select>
      </div>
      ${activeFilterCount ? `<div class="filter-summary"><span>${activeFilterCount} ${plural(activeFilterCount,'фильтр','фильтра','фильтров')}</span><button class="text-button" data-clear-filters="journal">Очистить фильтры</button></div>` : ''}
    </section>
    <section class="section">
      <div class="section-head"><div><h2 class="section-title">${entries.length} ${plural(entries.length,'запись','записи','записей')}</h2></div><button class="button primary small" data-action="new-entry">${icon('plus')}Добавить</button></div>
      ${entries.length ? Object.values(groups).map(group => `<div class="date-group"><h3 class="date-group-title">${relativeDay(group[0].date)}</h3><div class="list-card">${group.map(entryRow).join('')}</div></div>`).join('') : emptyState('journal','Журнал пуст','Добавьте событие, выполненную работу или наблюдение.', '<button class="button primary small" data-action="new-entry">Записать событие</button>')}
    </section>`;
}
function entryRow(entry) {
  return listRow({
    id: entry.id, action:'entry-detail', iconName:entryIcon(entry.type), tone:statusTone(entry.status),
    title: entry.equipment || entry.type,
    meta: `${entry.object} · ${entry.type} · ${formatDate(entry.date,{hour:'2-digit',minute:'2-digit'})}`,
    side: `<span class="status-pill ${statusTone(entry.status)}">${esc(entry.status)}</span>`
  });
}

function taskRow(task) {
  const due = task.dueAt ? (isToday(task.dueAt) ? `Сегодня, ${formatDate(task.dueAt,{hour:'2-digit',minute:'2-digit'})}` : formatDate(task.dueAt,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})) : 'Без срока';
  const content = `<div class="list-row swipe-content" data-action="task-detail" data-id="${esc(task.id)}">
    <button class="task-check ${task.completed ? 'done' : ''}" data-action="toggle-task" data-id="${esc(task.id)}" aria-label="${task.completed?'Вернуть задачу':'Выполнить задачу'}">${task.completed ? icon('check') : ''}</button>
    <button class="list-row-main list-row-main-button" data-action="task-detail" data-id="${esc(task.id)}">
      <span class="list-row-title ${task.completed?'task-title-done':''}">${esc(task.title)}</span><span class="list-row-meta">${esc(task.object || 'Без объекта')} · ${esc(due)}</span>
    </button>
    <span class="list-row-side"><span class="status-pill ${isOverdue(task)?'danger':statusTone(task.priority)}">${isOverdue(task)?'Просрочено':esc(task.priority)}</span></span>
  </div>`;
  return swipeRow(content, 'task-detail', task.id);
}
function renderTasks() {
  const filter = state.taskFilter;
  const tasks = state.data.tasks.filter(t => {
    if (filter === 'Открытые') return !t.completed;
    if (filter === 'Сегодня') return !t.completed && t.dueAt && isToday(t.dueAt);
    if (filter === 'Просрочено') return isOverdue(t);
    if (filter === 'Без срока') return !t.completed && !t.dueAt;
    if (filter === 'Выполнено') return t.completed;
    return true;
  });
  return `<section class="section"><div class="filter-row">${['Открытые','Сегодня','Просрочено','Без срока','Выполнено'].map(f=>`<button class="chip ${f===filter?'active':''}" data-task-filter="${f}">${f}</button>`).join('')}</div>${filter !== 'Открытые' ? `<div class="filter-summary"><span>1 фильтр</span><button class="text-button" data-clear-filters="tasks">Очистить фильтры</button></div>` : ''}</section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">${tasks.length} ${plural(tasks.length,'задача','задачи','задач')}</h2></div><button class="button primary small" data-action="new-task">${icon('plus')}Добавить</button></div>
      ${tasks.length ? `<div class="list-card">${tasks.map(taskRow).join('')}</div>` : emptyState('task','Здесь пока пусто','Для выбранного фильтра задач нет.', '<button class="button primary small" data-action="new-task">Создать задачу</button>')}
    </section>`;
}

function renderInspections() {
  const filter = state.inspectionFilter;
  const list = state.data.inspections.filter(item => {
    const checked = item.items?.some(row => ['good','issue'].includes(row.status));
    const issues = item.items?.some(row => row.status === 'issue');
    if (filter === 'Сегодня') return isToday(item.date);
    if (filter === 'Без результата') return !checked;
    if (filter === 'Требует внимания') return issues;
    return true;
  });
  return `<section class="page-lead"><p>Единый чек-лист для турникетов, касс и рабочих мест. Результаты сохраняются в локальной истории.</p><button class="button primary" data-action="new-inspection">${icon('inspection')}Начать осмотр</button></section>
    <section class="section"><div class="filter-row">${['Все','Сегодня','Без результата','Требует внимания'].map(value => `<button class="chip ${filter===value?'active':''}" data-inspection-filter="${value}">${value}</button>`).join('')}</div>${filter!=='Все'?`<div class="filter-summary"><span>1 фильтр</span><button class="text-button" data-clear-filters="inspections">Очистить фильтры</button></div>`:''}</section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">История осмотров</h2><p class="section-subtitle">${list.length} ${plural(list.length,'осмотр','осмотра','осмотров')}</p></div></div>
      ${list.length ? `<div class="list-card">${list.map(i => {
        const issues = i.items.filter(x=>x.status==='issue').length;
        return listRow({ id:i.id, action:'inspection-detail', iconName:'inspection', tone:issues?'warning':'success', title:i.equipment || 'Техосмотр', meta:`${i.object} · ${formatDateTime(i.date)}`, side:`<span class="status-pill ${issues?'warning':'success'}">${issues?`${issues} замеч.`:'Исправно'}</span>` });
      }).join('')}</div>` : emptyState('inspection','Осмотров ещё нет','Начните первый осмотр турникета или рабочего места.', '<button class="button primary small" data-action="new-inspection">Начать осмотр</button>')}
    </section>`;
}

function renderMore() {
  const open = state.data.tasks.filter(t=>!t.completed).length;
  return `<section class="section"><div class="list-card">
    ${listRow({id:'search',action:'route',iconName:'search',title:'Глобальный поиск',meta:'Журнал, задачи, осмотры, оборудование и инструкции'})}
    ${listRow({id:'events',action:'route',iconName:'calendar',title:'Мероприятия',meta:'Гибкая схема гейтов, турникетов, СИБ и касс',side:state.data.events.length?`${state.data.events.length}`:''})}
    ${listRow({id:'knowledge',action:'route',iconName:'book',title:'База знаний',meta:'Инструкции, решения, регламенты и личный опыт',side:state.data.knowledgeArticles.length?`${state.data.knowledgeArticles.length}`:''})}
    ${listRow({id:'tasks',action:'route',iconName:'task',title:'Задачи',meta:'Сроки, приоритеты и выполненные работы',side:open?`<span class="status-pill info">${open}</span>`:''})}
    ${listRow({id:'equipment',action:'route',iconName:'equipment',title:'Оборудование',meta:'Локальный реестр турникетов, касс и серверов',side:`${state.data.equipment.length}`})}
    ${listRow({id:'report',action:'route',iconName:'report',title:'Отчёты',meta:'Сводка за период, CSV и печать'})}
    ${listRow({id:'settings',action:'route',iconName:'settings',title:'Настройки и данные',meta:'Тема, резервная копия и хранилище'})}
    ${listRow({id:'install',action:'route',iconName:'install',title:'Как установить',meta:'Добавить приложение на экран «Домой»'})}
  </div></section>
  <section class="section"><div class="card notice-card"><div class="notice-icon info">${icon('database')}</div><div><h3>Только локальные данные</h3><p>Записи не отправляются на сервер. Регулярно делайте резервную копию в настройках.</p></div></div></section>`;
}

function renderEquipment() {
  const filters = state.equipment;
  const query = filters.query.trim().toLowerCase();
  const list = state.data.equipment.filter(item => {
    const hay = `${item.name} ${item.type} ${item.object} ${item.location} ${item.designation} ${item.ip} ${item.serial} ${item.status} ${item.note}`.toLowerCase();
    if (query && !hay.includes(query)) return false;
    if (filters.status !== 'Все статусы' && item.status !== filters.status) return false;
    if (filters.favorite && !item.favorite) return false;
    return true;
  });
  const activeFilterCount = [query, filters.status !== 'Все статусы', filters.favorite].filter(Boolean).length;
  return `<section class="section filters"><div class="search-input-wrap">${icon('search')}<input id="equipmentSearch" type="search" aria-label="Поиск оборудования" placeholder="Название, IP, серийный номер, место" value="${esc(filters.query)}" autocomplete="off"></div><div class="filter-row"><button class="chip ${filters.favorite?'active':''}" data-equipment-favorite>${icon('star')}Избранное</button>${['Все статусы','Требует внимания','Не работает','Работает'].map(value=>`<button class="chip ${filters.status===value?'active':''}" data-equipment-status="${value}">${value}</button>`).join('')}</div>${activeFilterCount?`<div class="filter-summary"><span>${activeFilterCount} ${plural(activeFilterCount,'фильтр','фильтра','фильтров')}</span><button class="text-button" data-clear-filters="equipment">Очистить фильтры</button></div>`:''}</section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">${list.length} ${plural(list.length,'объект','объекта','объектов')}</h2><p class="section-subtitle">Локальный реестр оборудования</p></div><button class="button primary small" data-action="new-equipment">${icon('plus')}Добавить</button></div>
    ${list.length ? `<div class="list-card">${list.map(e=>listRow({id:e.id,action:'equipment-detail',iconName:e.favorite?'star-filled':'equipment',tone:statusTone(e.status),title:e.name,meta:`${e.object || e.location || 'Без объекта'} · ${e.designation || e.type || 'Без обозначения'}`,side:`<span class="status-pill ${statusTone(e.status)}">${esc(e.status)}</span>`})).join('')}</div>` : emptyState('equipment','Ничего не найдено',activeFilterCount?'Очистите фильтры или измените запрос.':'Добавьте турникеты, кассы, серверы и другое оборудование.', `<button class="button primary small" ${activeFilterCount?'data-clear-filters="equipment"':'data-action="new-equipment"'}>${activeFilterCount?'Очистить фильтры':'Добавить оборудование'}</button>`)}
  </section>`;
}

function renderGlobalSearch() {
  const filters = state.globalSearch;
  const results = BpsProductivity.searchEntities(state.data, filters.query, filters.type);
  return `<section class="section filters global-search-panel"><div class="search-input-wrap large">${icon('search')}<input id="globalSearchInput" type="search" aria-label="Глобальный поиск" placeholder="Что найти в БПС Пульте" value="${esc(filters.query)}" autocomplete="off" enterkeyhint="search"></div><div class="filter-row">${BpsProductivity.SEARCH_TYPES.map(item=>`<button class="chip ${filters.type===item.value?'active':''}" data-search-type="${item.value}">${esc(item.label)}</button>`).join('')}</div>${filters.query||filters.type!=='all'?`<div class="filter-summary"><span>${results.length} ${plural(results.length,'результат','результата','результатов')}</span><button class="text-button" data-clear-filters="search">Очистить фильтры</button></div>`:''}</section>
    <section class="section">${filters.query.length < 2
      ? emptyState('search','Поиск по всему приложению','Введите не меньше двух символов. Можно искать IP, серийный номер, название мероприятия или текст инструкции.')
      : results.length
        ? `<div class="list-card search-results">${results.slice(0,80).map(item=>listRow({id:item.id,action:item.action,iconName:item.icon,title:item.title,meta:`${item.typeLabel}${item.meta?` · ${item.meta}`:''}`,side:item.date?formatDate(item.date,{day:'numeric',month:'short'}):''})).join('')}</div>`
        : emptyState('search','Ничего не найдено','Попробуйте другое слово или выберите поиск по всем разделам.','<button class="button small" data-clear-filters="search">Очистить поиск</button>')}
    </section>`;
}

function buildDailyReport() {
  const report = BpsProductivity.reportData(state.data, state.report);
  return BpsProductivity.formatReport(report, formatDateTime);
}
function renderReport() {
  const report = BpsProductivity.reportData(state.data, state.report);
  const text = BpsProductivity.formatReport(report, formatDateTime);
  const sectionOptions = [
    ['entries','Журнал'],
    ['completedTasks','Выполненные задачи'],
    ['overdueTasks','Просроченные задачи'],
    ['inspections','Осмотры'],
    ['equipment','Проблемное оборудование'],
    ['events','Мероприятия'],
  ];
  const total = report.entries.length + report.completedTasks.length + report.overdueTasks.length + report.inspections.length + report.equipment.length + report.events.length;
  return `<section class="section report-controls"><div class="card"><div class="form-grid two"><div class="field flush"><label for="reportFrom">С даты</label><input id="reportFrom" type="date" value="${esc(state.report.from)}"></div><div class="field flush"><label for="reportTo">По дату</label><input id="reportTo" type="date" value="${esc(state.report.to)}"></div></div><div class="quick-preset-row spaced-top"><button class="chip" data-report-period="today">Сегодня</button><button class="chip" data-report-period="week">7 дней</button></div><fieldset class="report-section-picker"><legend>Состав отчёта</legend>${sectionOptions.map(([value,label])=>`<label><input type="checkbox" data-report-section="${value}" ${state.report.sections.includes(value)?'checked':''}><span>${esc(label)}</span></label>`).join('')}</fieldset></div></section>
    <section class="section"><div class="summary-strip report-summary"><div><b>${total}</b><span>Объектов</span></div><div><b>${report.overdueTasks.length}</b><span>Просрочено</span></div><div><b>${report.equipment.length}</b><span>Оборудование</span></div></div></section>
    <section class="section"><div class="report-box" id="reportText">${esc(text)}</div><div id="printReport" class="print-report" aria-hidden="true"><pre>${esc(text)}</pre></div></section>
    <section class="section"><div class="button-row wrap"><button class="button" data-action="copy-report">${icon('copy')}Копировать</button><button class="button" data-action="export-report-csv">${icon('download')}CSV</button><button class="button" data-action="print-report">${icon('report')}Печать</button><button class="button primary" data-action="share-report">${icon('share')}Поделиться</button></div></section>`;
}

async function storageInfo() {
  const result = { usage: 0, quota: 0, percent: 0, text: 'Недоступно', persisted: false, warning: null };
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      result.usage = estimate.usage || 0;
      result.quota = estimate.quota || 0;
      result.percent = result.quota ? Math.min(100, result.usage / result.quota * 100) : 0;
      result.text = `${formatBytes(result.usage)} из ${formatBytes(result.quota)}`;
      if (result.percent >= 85) result.warning = 'Хранилище заполнено более чем на 85%. Срочно создайте резервную копию и удалите ненужные фотографии.';
      else if (result.percent >= 70) result.warning = 'Хранилище заполнено более чем на 70%. Проверьте резервную копию.';
    } catch (_) {}
  }
  if (navigator.storage?.persisted) {
    try { result.persisted = await navigator.storage.persisted(); } catch (_) {}
  }
  return result;
}
async function ensureStorageCapacity(requiredBytes, purpose = 'данных') {
  const storage = await storageInfo();
  if (!storage.quota) return true;
  const available = Math.max(0, storage.quota - storage.usage);
  const reserve = Math.max(8 * 1024 * 1024, storage.quota * 0.03);
  if (available - Number(requiredBytes || 0) < reserve) {
    throw new Error(`Недостаточно места для ${purpose}. Доступно ${formatBytes(available)}, требуется не менее ${formatBytes(Number(requiredBytes || 0) + reserve)} с безопасным резервом. Создайте backup и удалите ненужные фотографии.`);
  }
  return true;
}
function formatBytes(bytes) {
  if (!bytes) return '0 Б';
  const units=['Б','КБ','МБ','ГБ']; let i=0, n=bytes;
  while(n>=1024 && i<units.length-1){n/=1024;i++;}
  return `${n.toFixed(i?1:0)} ${units[i]}`;
}
function daysSince(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 ? Math.floor((Date.now() - time) / 86400000) : null;
}
function latestDataChange() {
  const values = STORE_NAMES.filter(store => store !== 'settings').flatMap(store => state.data[store] || []);
  const timestamps = values.map(item => new Date(item.updatedAt || item.createdAt || item.date || 0).getTime()).filter(Number.isFinite);
  try {
    const local = new Date(localStorage.getItem('bps-last-data-change') || 0).getTime();
    if (Number.isFinite(local)) timestamps.push(local);
  } catch (_) {}
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}
async function requestStoragePersistence() {
  if (!navigator.storage?.persist) throw new Error('Запрос постоянного хранения не поддерживается этим браузером.');
  const granted = await navigator.storage.persist();
  await setSetting('storagePersistenceRequestedAt', nowISO());
  toast(granted ? 'Постоянное хранение разрешено' : 'iOS не предоставила гарантию постоянного хранения');
  await render();
  return granted;
}
async function renderSettings() {
  const theme = await getSetting('theme','system');
  const storage = await storageInfo();
  const trashCount = (await dbGetAll('trash')).length;
  const lastBackupAt = await getSetting('lastBackupAt', null);
  const backupDays = daysSince(lastBackupAt);
  const changedAt = latestDataChange();
  const changedAfterBackup = changedAt && (!lastBackupAt || new Date(changedAt) > new Date(lastBackupAt));
  const backupTone = backupDays === null || backupDays >= 14 ? 'danger' : backupDays >= 7 || changedAfterBackup ? 'warning' : 'success';
  const backupText = lastBackupAt ? `${formatFullDate(lastBackupAt)}${changedAfterBackup ? ' · есть новые изменения' : ''}` : 'Ещё не создавалась';
  const storageWarning = storage.warning ? `<div class="warning-box spaced-bottom">${esc(storage.warning)}</div>` : '';
  return `<section class="section"><div class="section-head"><div><h2 class="section-title">Внешний вид</h2></div></div><div class="card"><div class="field flush"><label>Тема приложения</label><div class="segmented">${['system','light','dark'].map(t=>`<button class="segment-button ${t===theme?'active':''}" data-theme-choice="${t}">${{system:'Системная',light:'Светлая',dark:'Тёмная'}[t]}</button>`).join('')}</div></div><div class="toggle-row settings-toggle"><div class="toggle-copy"><strong>Повышенный контраст</strong><span>Для работы на улице и при ярком свете</span></div><button type="button" class="switch ${state.preferences.highContrast?'on':''}" id="highContrastSwitch" role="switch" aria-checked="${state.preferences.highContrast}" aria-label="Повышенный контраст"></button></div></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Рабочий профиль</h2></div></div><div class="card"><div class="field"><label for="operatorName">Имя в отметках проверки</label><input id="operatorName" value="${esc(state.preferences.operatorName)}" maxlength="80" placeholder="Например: Артём"></div><div class="field flush"><label for="startupRoute">Раздел при запуске</label><select id="startupRoute"><option value="last" ${state.preferences.startupRoute==='last'?'selected':''}>Продолжить с последнего</option>${Object.entries(routeTitles).filter(([route])=>!['install','settings'].includes(route)).map(([route,title])=>`<option value="${route}" ${state.preferences.startupRoute===route?'selected':''}>${esc(title)}</option>`).join('')}</select></div></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Локальное хранилище</h2><p class="section-subtitle">Данные находятся только на этом устройстве</p></div></div>${storageWarning}<div class="card"><div class="data-stat"><span>Использовано</span><strong>${storage.text}</strong></div><div class="data-stat"><span>Защита хранения</span><strong class="status-text ${storage.persisted?'success':'warning'}">${storage.persisted?'Постоянное':'Не гарантировано'}</strong></div><div class="data-stat"><span>Корзина</span><strong>${trashCount} объектов</strong></div><div class="progress-bar progress-spaced"><div class="progress-fill" style="width:${storage.percent}%"></div></div>${!storage.persisted?`<button class="button full spaced-top" data-action="request-persistence">Запросить постоянное хранение</button>`:''}${trashCount?`<button class="button full spaced-top" data-action="empty-trash">Очистить корзину сейчас</button>`:''}</div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Резервная копия</h2><p class="section-subtitle">Проверяемый архив с отдельными вложениями</p></div></div><div class="card"><div class="data-stat"><span>Последняя копия</span><strong class="status-text ${backupTone}">${esc(backupText)}</strong></div><div class="data-stat"><span>Формат</span><strong>BPSBACKUP v2</strong></div></div><div class="button-row spaced"><button class="button" data-action="export-data">${icon('download')}Создать архив</button><label class="button primary file-button">${icon('upload')}Восстановить<input id="importInput" type="file" accept=".bpsbackup,.zip,.json,application/json,application/zip" hidden></label></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Надёжность</h2></div></div><div class="list-card"><button class="list-row" data-action="check-integrity"><span class="row-icon">${icon('check')}</span><span class="list-row-main"><span class="list-row-title">Проверить целостность базы</span><span class="list-row-meta">Связи, идентификаторы, даты и конфигурации</span></span><span class="list-row-chevron">${icon('chevron')}</span></button><button class="list-row" data-action="download-diagnostic"><span class="row-icon">${icon('report')}</span><span class="list-row-main"><span class="list-row-title">Диагностический отчёт</span><span class="list-row-meta">Без текстов записей и рабочих данных</span></span><span class="list-row-chevron">${icon('download')}</span></button></div></section>
    <section class="section"><div class="danger-zone"><h3>Удалить все данные</h3><p>Действие нельзя отменить без резервной копии.</p><button class="button danger full" data-action="clear-data">${icon('trash')}Очистить приложение</button></div></section>
    <section class="section"><div class="card"><div class="data-stat"><span>Версия</span><strong>${APP_VERSION}</strong></div><div class="data-stat"><span>Схема данных</span><strong>${SCHEMA_VERSION}</strong></div><div class="data-stat"><span>Режим</span><strong>${isStandalone()?'Установлено':'Safari'}</strong></div></div></section>`;
}

function renderInstall() {
  const standalone = isStandalone();
  return `<section class="page-lead"><p>Добавьте сайт на экран «Домой». После первого открытия оболочка сохранится на iPhone и будет работать без интернета.</p></section>
    <section class="section"><div class="card">${standalone ? `<div class="notice-card"><div class="notice-icon success">${icon('check')}</div><div><h3>Приложение уже установлено</h3><p>Вы открыли его в автономном режиме с экрана «Домой».</p></div></div>` : `<div class="detail-grid"><div class="detail-field"><div class="detail-field-label">Шаг 1</div><div class="detail-field-value">Откройте эту страницу именно в Safari.</div></div><div class="detail-field"><div class="detail-field-label">Шаг 2</div><div class="detail-field-value">Нажмите кнопку «Поделиться» в нижней панели Safari.</div></div><div class="detail-field"><div class="detail-field-label">Шаг 3</div><div class="detail-field-value">Выберите «На экран Домой», затем «Добавить».</div></div><div class="detail-field"><div class="detail-field-label">Шаг 4</div><div class="detail-field-value">Откройте новую иконку один раз при наличии интернета. После этого включите авиарежим и проверьте запуск.</div></div></div>`}</div></section>
    <section class="section"><div class="card notice-card"><div class="notice-icon">${icon('alert')}</div><div><h3>Важно о данных</h3><p>Записи хранятся локально. Перед удалением приложения создайте архив .bpsbackup в разделе «Настройки и данные».</p></div></div></section>`;
}

function modalFocusable(node) {
  return [...node.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => element.offsetParent !== null && !element.closest('[hidden]'));
}
function setBackgroundInert(value) {
  for (const selector of ['.app-shell', '.bottom-nav', '#offlineBar', '#updateBar']) {
    const element = document.querySelector(selector);
    if (!element) continue;
    element.inert = value;
    if (value) element.setAttribute('aria-hidden', 'true'); else element.removeAttribute('aria-hidden');
  }
}
function openModal(title, bodyHtml, options = {}) {
  if (interactionState.modalCloseTimer) {
    clearTimeout(interactionState.modalCloseTimer);
    interactionState.modalCloseTimer = null;
    interactionState.modalClosing = false;
  }
  if (document.querySelector('[data-modal-backdrop]')) closeModal({ immediate: true, restoreFocus: false });
  interactionState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const template = document.getElementById('modalTemplate');
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('#modalTitle').textContent = title;
  node.querySelector('.modal-body').innerHTML = bodyHtml;
  node.querySelector('.modal-header-action').innerHTML = options.actionHtml || '';
  document.getElementById('modalRoot').replaceChildren(node);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('sheet-open');
  setBackgroundInert(true);
  interactionState.modalClosing = false;
  node.querySelectorAll('[data-modal-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal()));
  node.addEventListener('click', e=>{ if(e.target.matches('[data-modal-backdrop]') && options.dismissible !== false) closeModal(); });
  setupSheetGestures(node);
  options.onOpen?.(node);
  interactionState.modalKeyHandler = event => {
    if (event.key === 'Escape' && options.dismissible !== false) { event.preventDefault(); closeModal(); return; }
    if (event.key !== 'Tab') return;
    const focusable = modalFocusable(node);
    if (!focusable.length) { event.preventDefault(); node.querySelector('[data-sheet]')?.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!node.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', interactionState.modalKeyHandler, true);
  requestAnimationFrame(()=>{
    node.classList.add('visible');
    const target = options.initialFocus
      ? node.querySelector(options.initialFocus)
      : node.querySelector('[data-modal-close], .modal-header-action button, .modal-body button, .modal-body input, .modal-body select, .modal-body textarea');
    target?.focus({preventScroll:true});
  });
  return node;
}
function closeModal(options = {}) {
  const node = document.querySelector('[data-modal-backdrop]');
  if (!node || interactionState.modalClosing) return;
  interactionState.modalClosing = true;
  const previousFocus = interactionState.previousFocus;
  const finish = () => {
    if (interactionState.modalCloseTimer) clearTimeout(interactionState.modalCloseTimer);
    interactionState.modalCloseTimer = null;
    if (interactionState.modalKeyHandler) document.removeEventListener('keydown', interactionState.modalKeyHandler, true);
    interactionState.modalKeyHandler = null;
    document.getElementById('modalRoot').innerHTML='';
    document.body.style.overflow='';
    document.body.classList.remove('sheet-open');
    setBackgroundInert(false);
    interactionState.modalClosing = false;
    interactionState.previousFocus = null;
    if (options.restoreFocus !== false && previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
  };
  if (options.immediate || prefersReducedMotion()) return finish();
  node.classList.add('closing');
  node.querySelector('[data-sheet]')?.classList.add('closing');
  interactionState.modalCloseTimer = setTimeout(finish, 230);
}
function setupSheetGestures(node) {
  const sheet = node.querySelector('[data-sheet]');
  if (!sheet) return;
  let startX=0, startY=0, lastY=0, lastTime=0, pointerId=null, dragging=false;
  const reset = () => {
    sheet.classList.remove('dragging');
    sheet.style.removeProperty('--sheet-y');
    node.style.removeProperty('--backdrop-opacity');
    pointerId=null; dragging=false;
  };
  const down = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!event.target.closest('[data-sheet-handle]')) return;
    if (event.target.closest('button,input,textarea,select,a,label')) return;
    startX=event.clientX; startY=event.clientY; lastY=startY; lastTime=performance.now(); pointerId=event.pointerId;
    sheet.setPointerCapture?.(pointerId);
  };
  const move = event => {
    if (event.pointerId !== pointerId) return;
    const dx=event.clientX-startX, dy=event.clientY-startY;
    if (Math.abs(dx) > Math.abs(dy) || dy <= 0) return;
    event.preventDefault(); dragging=true; sheet.classList.add('dragging');
    const y = dy < 260 ? dy : 260 + (dy-260)*.35;
    const progress=Math.min(1,y/Math.max(240,sheet.offsetHeight*.42));
    sheet.style.setProperty('--sheet-y',`${y}px`);
    node.style.setProperty('--backdrop-opacity',String(.48*(1-progress*.88)));
    lastY=event.clientY; lastTime=performance.now();
  };
  const up = event => {
    if (event.pointerId !== pointerId) return;
    const dy=Math.max(0,event.clientY-startY);
    const elapsed=Math.max(16,performance.now()-lastTime);
    const velocity=Math.max(0,(event.clientY-lastY)/elapsed);
    sheet.releasePointerCapture?.(pointerId);
    if (dragging && (dy>Math.min(150,sheet.offsetHeight*.23) || velocity>.72)) {
      sheet.style.setProperty('--sheet-y',`${innerHeight+60}px`);
      node.style.setProperty('--backdrop-opacity','0');
      setTimeout(()=>closeModal({immediate:true}),180);
    } else reset();
  };
  sheet.addEventListener('pointerdown',down);
  sheet.addEventListener('pointermove',move,{passive:false});
  sheet.addEventListener('pointerup',up);
  sheet.addEventListener('pointercancel',reset);
}
function confirmModal(title, message, confirmText, onConfirm, dangerous = false) {
  const node = openModal(title, `<p class="confirm-copy">${esc(message)}</p><div class="button-row"><button class="button" data-modal-close>Отмена</button><button class="button ${dangerous?'danger':'primary'}" id="confirmButton">${esc(confirmText)}</button></div>`);
  node.querySelector('#confirmButton').addEventListener('click', async()=>{ await onConfirm(); closeModal(); });
}

function photoPickerHtml(photos) {
  return `<div class="photo-grid" id="photoGrid">${photos.map((p,i)=>`<div class="photo-thumb"><img src="${esc(p)}" alt="Фото ${i+1}"><button type="button" class="photo-remove" data-remove-photo="${i}" aria-label="Удалить фото ${i+1}">${icon('close')}</button></div>`).join('')}${photos.length<3?`<label class="photo-add">${icon('camera')}<input type="file" id="photoInput" accept="image/*" multiple aria-label="Добавить фотографии"></label>`:''}</div><div class="field-help">До 3 фотографий. Они сжимаются и сохраняются только на устройстве.</div>`;
}
async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать изображение.'));
    reader.readAsDataURL(blob);
  });
}
function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось сжать изображение.')), 'image/jpeg', quality));
}
async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch (_) {}
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Формат изображения не поддерживается.')); image.src = url; });
    return image;
  } finally { URL.revokeObjectURL(url); }
}
async function compressImage(file) {
  const MAX_SOURCE = 12 * 1024 * 1024;
  const MAX_OUTPUT = 1400 * 1024;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  const imageByExtension = ['jpg','jpeg','png','webp','gif','heic','heif'].includes(extension);
  if (!file.type.startsWith('image/') && !imageByExtension) throw new Error('Выбранный файл не является поддерживаемым изображением.');
  if (file.size > MAX_SOURCE) throw new Error('Фотография больше 12 МБ. Уменьшите её перед добавлением.');
  const bitmap = await decodeImage(file);
  let maxSide = 1600;
  let quality = .82;
  let output = null;
  for (let attempt = 0; attempt < 7; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    output = await canvasToBlob(canvas, quality);
    if (output.size <= MAX_OUTPUT) break;
    if (quality > .58) quality -= .08; else maxSide = Math.max(900, Math.round(maxSide * .82));
  }
  bitmap.close?.();
  if (!output || output.size > MAX_OUTPUT) throw new Error('Не удалось уменьшить фотографию до безопасного размера.');
  await ensureStorageCapacity(output.size * 2, 'фотографии');
  return blobToDataUrl(output);
}
async function handlePhotoFiles(files, photos, rerender) {
  for (const file of [...files].slice(0,3-photos.length)) {
    try { photos.push(await compressImage(file)); } catch(e) { toast(e.message || 'Не удалось обработать фото'); }
  }
  rerender();
}

function openEntryForm(existing = null, restoredDraft = null) {
  const photos = [...(restoredDraft?.data?.photos || existing?.photos || [])];
  const body = `<form id="entryForm">
    ${eventSelectField(existing?.eventId)}
    <div class="form-grid two"><div class="field"><label class="required" for="entryType">Тип</label><select id="entryType" required>${optionsHtml(ENTRY_TYPES,existing?.type||'Неисправность')}</select></div><div class="field"><label class="required" for="entryObject">Объект</label><select id="entryObject" required>${optionsHtml(OBJECTS,existing?.object||'КПП-1')}</select></div></div>
    <div class="field"><label for="entryEquipment">Оборудование или рабочее место</label><input id="entryEquipment" value="${esc(existing?.equipment||'')}" placeholder="Например: турникет №3"></div>
    <div class="field"><label class="required" for="entryDescription">Описание</label><textarea id="entryDescription" required placeholder="Что произошло и что было сделано">${esc(existing?.description||'')}</textarea><div class="field-help">Можно использовать диктовку клавиатуры iPhone.</div></div>
    <div class="form-grid two"><div class="field"><label class="required" for="entryStatus">Статус</label><select id="entryStatus" required>${optionsHtml(ENTRY_STATUSES,existing?.status||'Информация')}</select></div><div class="field"><label class="required" for="entryDate">Дата и время</label><input id="entryDate" type="datetime-local" required value="${localDateTimeValue(existing?.date?new Date(existing.date):new Date())}"></div></div>
    <div class="field"><label>Фотографии</label><div id="entryPhotos">${photoPickerHtml(photos)}</div></div>
    ${!existing?.id?`<div class="card toggle-card"><div class="toggle-row"><div class="toggle-copy"><strong>Создать связанную задачу</strong><span>Напомнить о повторной проверке</span></div><button type="button" class="switch" id="linkedTaskSwitch" role="switch" aria-checked="false" aria-label="Создать связанную задачу"></button></div><div id="linkedTaskFields" hidden><div class="form-grid two nested-grid"><div class="field"><label for="linkedDue">Срок</label><input type="datetime-local" id="linkedDue"></div><div class="field"><label for="linkedPriority">Приоритет</label><select id="linkedPriority">${optionsHtml(PRIORITIES,'Обычный')}</select></div></div></div></div>`:''}
    ${existing?.id?`<button type="button" class="button danger full" data-delete-entry="${esc(existing.id)}">${icon('trash')}Удалить запись</button>`:''}
  </form>`;
  const node = openModal(existing?.id?'Редактировать запись':'Новая запись', body, { actionHtml:'<button class="text-button" id="saveEntry">Сохранить</button>' });
  const renderPhotos = () => {
    node.querySelector('#entryPhotos').innerHTML = photoPickerHtml(photos);
    const input=node.querySelector('#photoInput'); if(input) input.addEventListener('change',async e=>{await handlePhotoFiles(e.target.files,photos,renderPhotos);interactionState.draftControllers.get(draftId('entry',existing?.id||''))?.schedule();});
    node.querySelectorAll('[data-remove-photo]').forEach(b=>b.addEventListener('click',()=>{photos.splice(Number(b.dataset.removePhoto),1);renderPhotos();interactionState.draftControllers.get(draftId('entry',existing?.id||''))?.schedule();}));
  };
  renderPhotos();
  const sw=node.querySelector('#linkedTaskSwitch');
  if(sw) sw.addEventListener('click',()=>{sw.classList.toggle('on');const enabled=sw.classList.contains('on');sw.setAttribute('aria-checked',String(enabled));node.querySelector('#linkedTaskFields').hidden=!enabled;});
  const draftController=attachDraftAutosave(node,{
    type:'entry',
    entityId:existing?.id||'',
    restored:restoredDraft,
    formSelector:'#entryForm',
    snapshot:()=>({values:formValues(node.querySelector('#entryForm')),photos:[...photos]}),
    restore:data=>{
      applyFormValues(node.querySelector('#entryForm'),data.values);
      const enabled=node.querySelector('#linkedTaskSwitch')?.getAttribute('aria-checked')==='true';
      if(node.querySelector('#linkedTaskFields'))node.querySelector('#linkedTaskFields').hidden=!enabled;
      renderPhotos();
    },
  });
  node.querySelector('#saveEntry').addEventListener('click',async()=>{
    const form=node.querySelector('#entryForm'); if(!form.reportValidity()) return;
    const record={
      id:existing?.id||uid('entry'), type:node.querySelector('#entryType').value, object:node.querySelector('#entryObject').value,
      equipment:node.querySelector('#entryEquipment').value.trim(), description:node.querySelector('#entryDescription').value.trim(),
      status:node.querySelector('#entryStatus').value, date:new Date(node.querySelector('#entryDate').value).toISOString(), eventId:node.querySelector('#linkedEvent')?.value||null, photos,
      createdAt:existing?.createdAt||nowISO(), updatedAt:nowISO(), sample:existing?.sample||false
    };
    let linkedTask = null;
    if(!existing?.id && sw?.classList.contains('on')) {
      linkedTask={id:uid('task'),title:`${record.object}${record.equipment?` · ${record.equipment}`:''}: ${record.status}`,object:record.object,description:record.description,dueAt:node.querySelector('#linkedDue').value?new Date(node.querySelector('#linkedDue').value).toISOString():null,priority:node.querySelector('#linkedPriority').value,completed:false,eventId:record.eventId||null,linkedEntryId:record.id,createdAt:nowISO(),updatedAt:nowISO()};
    }
    if (linkedTask) await putRecordsAtomically({ entries:record, tasks:linkedTask });
    else await dbPut('entries',record);
    await draftController.clear();
    closeModal();toast(existing?.id?'Запись обновлена':'Запись сохранена');await render();
  });
  node.querySelector('[data-delete-entry]')?.addEventListener('click',async()=>{await draftController.clear();closeModal({immediate:true});await deleteEntryWithUndo(existing.id);});
}

function openEntryDetail(id) {
  const e=state.data.entries.find(x=>x.id===id); if(!e)return;
  rememberRecent('entries',e.id,e.equipment||e.type);
  const photos=e.photos||[];
  const node=openModal('Запись журнала',`<div class="detail-hero"><span class="status-pill ${statusTone(e.status)}">${esc(e.status)}</span><h3 class="detail-title">${esc(e.equipment||e.type)}</h3><div class="detail-meta">${esc(e.object)} · ${formatFullDate(e.date)}</div><div class="detail-grid"><div class="detail-field"><div class="detail-field-label">Тип</div><div class="detail-field-value">${esc(e.type)}</div></div><div class="detail-field"><div class="detail-field-label">Описание</div><div class="detail-field-value">${nl2br(e.description)}</div></div></div></div>${photos.length?`<div class="modal-section"><h3 class="modal-section-title">Фотографии</h3><div class="photo-gallery">${photos.map((p,index)=>`<img src="${esc(p)}" alt="Фото записи ${index+1}">`).join('')}</div></div>`:''}${relatedEntitiesHtml('entries',e.id)}<div class="button-row"><button class="button" id="editEntry">${icon('edit')}Редактировать</button><button class="button" id="taskFromEntry">${icon('task')}Создать задачу</button></div>`);
  node.querySelector('#editEntry').addEventListener('click',()=>{closeModal();openEntryForm(e);});
  node.querySelector('#taskFromEntry').addEventListener('click',()=>{closeModal();openTaskForm({object:e.object,description:e.description,eventId:e.eventId||null,linkedEntryId:e.id,title:`${e.equipment||e.type}: ${e.status}`});});
  bindRelatedEntityLinks(node);
}

function openTaskForm(existing = null, restoredDraft = null) {
  const preset=existing||{};
  const body=`<form id="taskForm">${eventSelectField(preset.eventId)}<div class="field"><label class="required" for="taskTitle">Название</label><input id="taskTitle" required value="${esc(preset.title||'')}" placeholder="Что нужно сделать"></div><div class="form-grid two"><div class="field"><label for="taskObject">Объект</label><select id="taskObject"><option value="">Без объекта</option>${optionsHtml(OBJECTS,preset.object||'')}</select></div><div class="field"><label for="taskPriority">Приоритет</label><select id="taskPriority">${optionsHtml(PRIORITIES,preset.priority||'Обычный')}</select></div></div><div class="field"><label for="taskDue">Срок</label><input id="taskDue" type="datetime-local" value="${preset.dueAt?localDateTimeValue(new Date(preset.dueAt)):''}"></div><div class="field"><label for="taskDescription">Подробности</label><textarea id="taskDescription" placeholder="Дополнительная информация">${esc(preset.description||'')}</textarea></div>${preset.id?`<button type="button" class="button danger full" data-delete-task="${esc(preset.id)}">${icon('trash')}Удалить задачу</button>`:''}</form>`;
  const node=openModal(preset.id?'Редактировать задачу':'Новая задача',body,{actionHtml:'<button class="text-button" id="saveTask">Сохранить</button>'});
  const draftController=attachDraftAutosave(node,{type:'task',entityId:preset.id||'',restored:restoredDraft,formSelector:'#taskForm'});
  node.querySelector('#saveTask').addEventListener('click',async()=>{
    const form=node.querySelector('#taskForm');if(!form.reportValidity())return;
    await dbPut('tasks',{id:preset.id||uid('task'),title:node.querySelector('#taskTitle').value.trim(),object:node.querySelector('#taskObject').value,priority:node.querySelector('#taskPriority').value,dueAt:node.querySelector('#taskDue').value?new Date(node.querySelector('#taskDue').value).toISOString():null,description:node.querySelector('#taskDescription').value.trim(),completed:preset.completed||false,completedAt:preset.completedAt||null,eventId:node.querySelector('#linkedEvent')?.value||null,linkedEntryId:preset.linkedEntryId||null,linkedInspectionId:preset.linkedInspectionId||null,createdAt:preset.createdAt||nowISO(),updatedAt:nowISO(),sample:preset.sample||false});
    await draftController.clear();
    closeModal();toast(preset.id?'Задача обновлена':'Задача создана');await render();
  });
  node.querySelector('[data-delete-task]')?.addEventListener('click',async()=>{await draftController.clear();closeModal({immediate:true});await softDelete('tasks',preset.id,'Задача');});
}
function openTaskDetail(id) {
  const t=state.data.tasks.find(x=>x.id===id);if(!t)return;
  rememberRecent('tasks',t.id,t.title);
  const node=openModal('Задача',`<div class="detail-hero"><span class="status-pill ${t.completed?'success':isOverdue(t)?'danger':statusTone(t.priority)}">${t.completed?'Выполнена':isOverdue(t)?'Просрочено':esc(t.priority)}</span><h3 class="detail-title">${esc(t.title)}</h3><div class="detail-meta">${esc(t.object||'Без объекта')} · ${t.dueAt?formatFullDate(t.dueAt):'Без срока'}</div><div class="detail-grid">${t.description?`<div class="detail-field"><div class="detail-field-label">Подробности</div><div class="detail-field-value">${nl2br(t.description)}</div></div>`:''}</div></div>${relatedEntitiesHtml('tasks',t.id)}<div class="button-row"><button class="button primary" id="toggleTaskDetail">${icon(t.completed?'clock':'check')}${t.completed?'Вернуть в работу':'Выполнить'}</button><button class="button" id="editTask">${icon('edit')}Изменить</button></div>`);
  node.querySelector('#toggleTaskDetail').addEventListener('click',async()=>{closeModal();await toggleTaskWithUndo(t);});
  node.querySelector('#editTask').addEventListener('click',()=>{closeModal();openTaskForm(t);});
  bindRelatedEntityLinks(node);
}

function openInspectionForm(existing = null, restoredDraft = null) {
  const isExisting=Boolean(existing?.id);
  const photos=[...(restoredDraft?.data?.photos||existing?.photos||[])];
  const values=(restoredDraft?.data?.items||existing?.items)?.map(x=>({...x}))||INSPECTION_ITEMS.map(name=>({name,status:'skip'}));
  const checklist=()=>`<div class="checklist">${values.map((item,i)=>`<div class="check-row"><div class="check-label">${esc(item.name)}</div><div class="check-options">${[['good','Исправно'],['issue','Замечание'],['skip','Не проверено']].map(([v,l])=>`<button type="button" class="check-option ${item.status===v?`active ${v}`:''}" data-check-index="${i}" data-check-value="${v}">${l}</button>`).join('')}</div></div>`).join('')}</div>`;
  const body=`<form id="inspectionForm">${eventSelectField(existing?.eventId)}<div class="form-grid two"><div class="field"><label class="required" for="inspectionObject">Объект</label><select id="inspectionObject" required>${optionsHtml(OBJECTS,existing?.object||'КПП-1')}</select></div><div class="field"><label class="required" for="inspectionDate">Дата и время</label><input id="inspectionDate" type="datetime-local" required value="${localDateTimeValue(existing?.date?new Date(existing.date):new Date())}"></div></div><div class="field"><label class="required" for="inspectionEquipment">Оборудование</label><input id="inspectionEquipment" required value="${esc(existing?.equipment||'')}" placeholder="Например: турникеты №1–8"></div><div class="field"><label>Чек-лист</label><div id="inspectionChecklist">${checklist()}</div></div><div class="field"><label for="inspectionConclusion">Заключение и замечания</label><textarea id="inspectionConclusion" placeholder="Опишите обнаруженные недостатки и выполненные действия">${esc(existing?.conclusion||'')}</textarea></div><div class="field"><label>Фотографии</label><div id="inspectionPhotos">${photoPickerHtml(photos)}</div></div><div class="card toggle-card"><div class="toggle-row"><div class="toggle-copy"><strong>Создать задачу по замечаниям</strong><span>Доступно, если есть замечания</span></div><button type="button" class="switch" id="inspectionTaskSwitch" role="switch" aria-checked="false" aria-label="Создать задачу по замечаниям"></button></div></div>${existing?`<button type="button" class="button danger full" data-delete-inspection="${esc(existing.id)}">${icon('trash')}Удалить осмотр</button>`:''}</form>`;
  const node=openModal(isExisting?'Редактировать осмотр':'Новый техосмотр',body,{actionHtml:'<button class="text-button" id="saveInspection">Сохранить</button>'});
  const bindChecks=()=>node.querySelectorAll('[data-check-index]').forEach(btn=>btn.addEventListener('click',()=>{values[Number(btn.dataset.checkIndex)].status=btn.dataset.checkValue;node.querySelector('#inspectionChecklist').innerHTML=checklist();bindChecks();}));bindChecks();
  const renderPhotos=()=>{node.querySelector('#inspectionPhotos').innerHTML=photoPickerHtml(photos);node.querySelector('#photoInput')?.addEventListener('change',async e=>{await handlePhotoFiles(e.target.files,photos,renderPhotos);interactionState.draftControllers.get(draftId('inspection',existing?.id||''))?.schedule();});node.querySelectorAll('[data-remove-photo]').forEach(b=>b.addEventListener('click',()=>{photos.splice(Number(b.dataset.removePhoto),1);renderPhotos();interactionState.draftControllers.get(draftId('inspection',existing?.id||''))?.schedule();}));};renderPhotos();
  const sw=node.querySelector('#inspectionTaskSwitch');sw.addEventListener('click',()=>{sw.classList.toggle('on');sw.setAttribute('aria-checked',String(sw.classList.contains('on')));});
  const draftController=attachDraftAutosave(node,{
    type:'inspection',entityId:existing?.id||'',restored:restoredDraft,formSelector:'#inspectionForm',
    snapshot:()=>({values:formValues(node.querySelector('#inspectionForm')),items:values.map(item=>({...item})),photos:[...photos]}),
    restore:data=>{applyFormValues(node.querySelector('#inspectionForm'),data.values);node.querySelector('#inspectionChecklist').innerHTML=checklist();bindChecks();renderPhotos();},
  });
  node.querySelector('#saveInspection').addEventListener('click',async()=>{
    const form=node.querySelector('#inspectionForm');if(!form.reportValidity())return;
    const record={id:existing?.id||uid('inspection'),object:node.querySelector('#inspectionObject').value,equipment:node.querySelector('#inspectionEquipment').value.trim(),date:new Date(node.querySelector('#inspectionDate').value).toISOString(),eventId:node.querySelector('#linkedEvent')?.value||null,items:values,conclusion:node.querySelector('#inspectionConclusion').value.trim(),photos,createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO(),sample:existing?.sample||false};
    const issues=values.filter(x=>x.status==='issue');
    const linkedTask=sw.classList.contains('on')&&issues.length
      ? {id:uid('task'),title:`Устранить замечания: ${record.equipment}`,object:record.object,priority:'Важный',dueAt:null,description:`Замечания: ${issues.map(x=>x.name).join(', ')}.${record.conclusion?`\n${record.conclusion}`:''}`,completed:false,eventId:record.eventId||null,linkedInspectionId:record.id,createdAt:nowISO(),updatedAt:nowISO()}
      : null;
    if (linkedTask) await putRecordsAtomically({ inspections:record, tasks:linkedTask });
    else await dbPut('inspections',record);
    await draftController.clear();
    closeModal();toast(isExisting?'Осмотр обновлён':'Техосмотр сохранён');await render();
  });
  node.querySelector('[data-delete-inspection]')?.addEventListener('click',async()=>{await draftController.clear();closeModal({immediate:true});await deleteInspectionWithUndo(existing.id);});
}
function openInspectionDetail(id) {
  const i=state.data.inspections.find(x=>x.id===id);if(!i)return;
  rememberRecent('inspections',i.id,i.equipment||'Техосмотр');
  const issues=i.items.filter(x=>x.status==='issue');
  const node=openModal('Техосмотр',`<div class="detail-hero"><span class="status-pill ${issues.length?'warning':'success'}">${issues.length?`${issues.length} замечаний`:'Нарушений нет'}</span><h3 class="detail-title">${esc(i.equipment)}</h3><div class="detail-meta">${esc(i.object)} · ${formatFullDate(i.date)}</div></div><div class="modal-section"><h3 class="modal-section-title">Результаты</h3><div class="list-card">${i.items.map(x=>`<div class="list-row"><span class="row-icon ${x.status==='good'?'success':x.status==='issue'?'warning':''}">${icon(x.status==='good'?'check':x.status==='issue'?'alert':'more')}</span><span class="list-row-main"><span class="list-row-title">${esc(x.name)}</span><span class="list-row-meta">${x.status==='good'?'Исправно':x.status==='issue'?'Замечание':'Не проверено'}</span></span></div>`).join('')}</div></div>${i.conclusion?`<div class="detail-field"><div class="detail-field-label">Заключение</div><div class="detail-field-value">${nl2br(i.conclusion)}</div></div>`:''}${i.photos?.length?`<div class="modal-section"><h3 class="modal-section-title">Фотографии</h3><div class="photo-gallery">${i.photos.map((p,index)=>`<img src="${esc(p)}" alt="Фото техосмотра ${index+1}">`).join('')}</div></div>`:''}${relatedEntitiesHtml('inspections',i.id)}<div class="button-row"><button class="button" id="repeatInspection">${icon('copy')}Повторить</button><button class="button" id="editInspection">${icon('edit')}Редактировать</button></div>`);
  node.querySelector('#editInspection').addEventListener('click',()=>{closeModal();openInspectionForm(i);});
  node.querySelector('#repeatInspection').addEventListener('click',()=>{closeModal({immediate:true});openInspectionForm({...i,id:null,date:nowISO(),items:i.items.map(item=>({...item,status:'skip'})),photos:[],conclusion:'',createdAt:null,updatedAt:null});});
  bindRelatedEntityLinks(node);
}

function openEquipmentForm(existing = null, restoredDraft = null) {
  const e=existing||{};
  const body=`<form id="equipmentForm"><div class="field"><label class="required" for="equipmentName">Название</label><input id="equipmentName" required value="${esc(e.name||'')}" placeholder="Например: Турникет КПП-1 №3"></div><div class="form-grid two"><div class="field"><label for="equipmentType">Тип</label><input id="equipmentType" value="${esc(e.type||'')}" placeholder="Турникет, касса, сервер"></div><div class="field"><label for="equipmentObject">Объект</label><select id="equipmentObject"><option value="">Без объекта</option>${optionsHtml(OBJECTS,e.object||'')}</select></div><div class="field"><label for="equipmentLocation">Место установки</label><input id="equipmentLocation" value="${esc(e.location||'')}" placeholder="Например: правая линия, стойка 2"></div><div class="field"><label for="equipmentDesignation">Номер / обозначение</label><input id="equipmentDesignation" value="${esc(e.designation||'')}" placeholder="Т-03"></div><div class="field"><label for="equipmentStatus">Статус</label><select id="equipmentStatus">${optionsHtml(EQUIPMENT_STATUSES,e.status||'Работает')}</select></div><div class="field"><label for="equipmentIp">IP-адрес</label><input id="equipmentIp" inputmode="decimal" value="${esc(e.ip||'')}" placeholder="192.168.0.10"></div><div class="field"><label for="equipmentSerial">Серийный номер</label><input id="equipmentSerial" value="${esc(e.serial||'')}"></div></div><div class="field"><label for="equipmentNote">Заметка</label><textarea id="equipmentNote">${esc(e.note||'')}</textarea></div><div class="card toggle-card"><div class="toggle-row"><div class="toggle-copy"><strong>Избранное оборудование</strong><span>Показывать в быстром фильтре</span></div><button type="button" class="switch ${e.favorite?'on':''}" id="equipmentFavorite" role="switch" aria-checked="${Boolean(e.favorite)}" aria-label="Избранное оборудование"></button></div></div>${e.id?`<button type="button" class="button danger full" data-delete-equipment="${esc(e.id)}">${icon('trash')}Удалить оборудование</button>`:''}</form>`;
  const node=openModal(e.id?'Редактировать':'Новое оборудование',body,{actionHtml:'<button class="text-button" id="saveEquipment">Сохранить</button>'});
  const favorite=node.querySelector('#equipmentFavorite');favorite.addEventListener('click',()=>{favorite.classList.toggle('on');favorite.setAttribute('aria-checked',String(favorite.classList.contains('on')));});
  const draftController=attachDraftAutosave(node,{type:'equipment',entityId:e.id||'',restored:restoredDraft,formSelector:'#equipmentForm'});
  node.querySelector('#saveEquipment').addEventListener('click',async event=>{
    const form=node.querySelector('#equipmentForm');if(!form.reportValidity())return;
    const record={id:e.id||uid('equipment'),name:node.querySelector('#equipmentName').value.trim(),type:node.querySelector('#equipmentType').value.trim(),object:node.querySelector('#equipmentObject').value,location:node.querySelector('#equipmentLocation').value.trim(),designation:node.querySelector('#equipmentDesignation').value.trim(),status:node.querySelector('#equipmentStatus').value,ip:node.querySelector('#equipmentIp').value.trim(),serial:node.querySelector('#equipmentSerial').value.trim(),note:node.querySelector('#equipmentNote').value.trim(),favorite:favorite.classList.contains('on'),createdAt:e.createdAt||nowISO(),updatedAt:nowISO(),sample:e.sample||false};
    const duplicates=BpsProductivity.findEquipmentDuplicates(state.data.equipment,record,e.id||null);
    if(duplicates.length&&!event.currentTarget.dataset.duplicateConfirmed){event.currentTarget.dataset.duplicateConfirmed='true';toast(`Возможный дубликат: ${duplicates.slice(0,2).map(item=>item.name).join(', ')}. Нажмите «Сохранить» ещё раз.` ,{duration:7000});return;}
    await dbPut('equipment',record);await draftController.clear();closeModal();toast(e.id?'Оборудование обновлено':'Оборудование добавлено');await render();
  });
  node.querySelector('[data-delete-equipment]')?.addEventListener('click',async()=>{await draftController.clear();closeModal({immediate:true});await deleteEquipmentWithUndo(e.id);});
}
function openEquipmentDetail(id) {
  const e=state.data.equipment.find(x=>x.id===id);if(!e)return;
  rememberRecent('equipment',e.id,e.name);
  const needle=(e.designation||e.name).toLowerCase();
  const history=state.data.entries.filter(x=>`${x.equipment} ${x.description}`.toLowerCase().includes(needle));
  const inspections=state.data.inspections.filter(x=>x.equipment.toLowerCase().includes(needle));
  const node=openModal('Оборудование',`<div class="detail-hero"><span class="status-pill ${statusTone(e.status)}">${esc(e.status)}</span><h3 class="detail-title">${esc(e.name)}</h3><div class="detail-meta">${esc(e.object||e.location||'Без объекта')} · ${esc(e.type||'Тип не указан')}</div><div class="detail-grid">${e.location?`<div class="detail-field"><div class="detail-field-label">Место установки</div><div class="detail-field-value">${esc(e.location)}</div></div>`:''}${e.designation?`<div class="detail-field"><div class="detail-field-label">Обозначение</div><div class="detail-field-value">${esc(e.designation)}</div></div>`:''}${e.ip?`<div class="detail-field"><div class="detail-field-label">IP-адрес</div><div class="detail-field-value">${esc(e.ip)}</div></div>`:''}${e.serial?`<div class="detail-field"><div class="detail-field-label">Серийный номер</div><div class="detail-field-value">${esc(e.serial)}</div></div>`:''}${e.note?`<div class="detail-field"><div class="detail-field-label">Заметка</div><div class="detail-field-value">${nl2br(e.note)}</div></div>`:''}</div></div><div class="modal-section"><h3 class="modal-section-title">Связанная история</h3>${history.length||inspections.length?`<div class="list-card">${history.slice(0,5).map(entryRow).join('')}${inspections.slice(0,5).map(i=>listRow({id:i.id,action:'inspection-detail',iconName:'inspection',title:i.equipment,meta:`Техосмотр · ${formatDateTime(i.date)}`})).join('')}</div>`:emptyState('journal','История не найдена','Связь определяется по обозначению или названию оборудования.')}</div>${relatedEntitiesHtml('equipment',e.id)}<div class="button-row"><button class="button" id="favoriteEquipment">${icon(e.favorite?'star-filled':'star')}${e.favorite?'В избранном':'В избранное'}</button><button class="button" id="editEquipment">${icon('edit')}Редактировать</button></div>`);
  node.querySelector('#editEquipment').addEventListener('click',()=>{closeModal();openEquipmentForm(e);});
  node.querySelector('#favoriteEquipment').addEventListener('click',async()=>{e.favorite=!e.favorite;e.updatedAt=nowISO();await dbPut('equipment',e);closeModal();toast(e.favorite?'Добавлено в избранное':'Удалено из избранного');await render();});
  node.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{const action=b.dataset.action,id=b.dataset.id;closeModal();if(action==='entry-detail')openEntryDetail(id);if(action==='inspection-detail')openInspectionDetail(id);}));
  node.querySelectorAll('[data-kb-action="open-article"]').forEach(button=>button.addEventListener('click',()=>{const articleId=button.dataset.id;closeModal({immediate:true});openKnowledgeArticleDetail(articleId);}));
  bindRelatedEntityLinks(node);
  bindSwipeRows(node);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function saveUserFile(blob, filename, title = 'Файл БПС Пульта') {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (navigator.share && navigator.canShare?.({ files:[file] })) {
    try { await navigator.share({ title, files:[file] }); return true; }
    catch (error) { if (error?.name === 'AbortError') return false; }
  }
  downloadBlob(blob, filename); return true;
}
async function exportData() {
  const data = await getAllData();
  const integrity = BpsStability.checkIntegrity(data);
  if (integrity.errors.length) throw new Error('Перед экспортом обнаружены критические ошибки целостности. Запустите проверку базы.');
  const archive = BpsStability.buildBackupArchive(data, { version: APP_VERSION });
  if (archive.bytes.length > 120 * 1024 * 1024) throw new Error('Резервная копия больше 120 МБ. Удалите ненужные фотографии и повторите.');
  const blob = new Blob([archive.bytes], { type: 'application/zip' });
  const saved = await saveUserFile(blob, `БПС-Пульт-backup-${dayKey(new Date())}.bpsbackup`, 'Резервная копия БПС Пульта');
  if (!saved) { toast('Сохранение отменено'); return; }
  await setSetting('lastBackupAt', archive.manifest.exportedAt);
  await setSetting('lastBackupCounts', archive.manifest.counts);
  toast('Резервная копия создана');
  if (state.route === 'settings') await render();
}

async function readBackupFile(file) {
  if (!file) throw new Error('Файл не выбран.');
  if (file.size > 120 * 1024 * 1024) throw new Error('Архив больше 120 МБ и не может быть обработан безопасно.');
  await ensureStorageCapacity(file.size * 2, 'проверки и восстановления архива');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let payload;
  let manifest = null;
  const looksLikeZip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (looksLikeZip) {
    const unpacked = BpsStability.readBackupArchive(bytes);
    payload = unpacked.payload; manifest = unpacked.manifest;
  } else {
    let parsed;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
    catch (_) { throw new Error('Файл не является корректным архивом или JSON.'); }
    payload = parsed;
  }
  const validation = BpsStability.validatePayload(payload);
  if (!validation.valid) throw new Error(`Архив не прошёл проверку: ${validation.errors[0] || 'неизвестная ошибка'}`);
  return { validation, manifest };
}

async function importValidatedData(validation, mode) {
  const importedAt = nowISO();
  const settings = [
    { key:'dataSchemaVersion', value:SCHEMA_VERSION },
    { key:'lastImportAt', value:importedAt },
  ];
  if (mode === 'merge') await atomicMergeData(validation.payload.data, { settings });
  else await atomicReplaceData(validation.payload.data, { settings });
  interactionState.dirtyDraftKeys.clear();
  interactionState.draftControllers.clear();
  return importedAt;
}

async function openImportPreview(file) {
  let loaded;
  try { loaded = await readBackupFile(file); }
  catch (error) { toast(error.message || 'Не удалось прочитать архив'); return; }
  const current = await getAllData();
  const preview = BpsStability.previewImport(loaded.validation.payload.data, current);
  const counts = loaded.validation.counts;
  const countLabels = { entries:'Записи',tasks:'Задачи',inspections:'Осмотры',equipment:'Оборудование',events:'Мероприятия',knowledgeArticles:'Материалы',knowledgeCategories:'Разделы',settings:'Настройки' };
  const countRows = Object.entries(counts).filter(([,value])=>value).map(([store,value])=>`<div class="data-stat"><span>${countLabels[store]||store}</span><strong>${value}</strong></div>`).join('');
  const warnings = loaded.validation.warnings.slice(0,5).map(message=>`<li>${esc(message)}</li>`).join('');
  const archiveMeta = loaded.manifest ? `<div class="info-box spaced">Создан: ${esc(formatFullDate(loaded.manifest.exportedAt))} · вложений: ${Number(loaded.manifest.attachmentCount||0)}</div>` : '<div class="info-box spaced">Старая JSON-копия будет преобразована в стабильную схему.</div>';
  const body = `<div class="card">${countRows || '<p>Архив не содержит пользовательских данных.</p>'}</div>${archiveMeta}
    ${loaded.validation.payload.migrations.length?`<div class="info-box spaced">Будет выполнена миграция схемы ${esc(loaded.validation.payload.migrations.join(', '))}.</div>`:''}
    ${warnings?`<div class="warning-box spaced"><strong>Предупреждения проверки</strong><ul class="compact-list">${warnings}</ul></div>`:''}
    <div class="field spaced"><label>Режим восстановления</label><div class="segmented import-mode"><button type="button" class="segment-button active" data-import-mode="replace">Заменить</button><button type="button" class="segment-button" data-import-mode="merge">Объединить</button></div><div class="field-help" id="importModeHelp">Текущая база будет атомарно заменена. При ошибке старые данные сохранятся.</div></div>
    <div class="info-box">Совпадающих идентификаторов с текущей базой: ${preview.duplicateTotal}.</div>
    <button type="button" class="button primary full spaced-top" id="performImport">Восстановить данные</button>`;
  const node = openModal('Проверка резервной копии', body, { dismissible: true });
  let mode = 'replace';
  node.querySelectorAll('[data-import-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.importMode;
    node.querySelectorAll('[data-import-mode]').forEach(item=>item.classList.toggle('active',item===button));
    node.querySelector('#importModeHelp').textContent = mode === 'replace'
      ? 'Текущая база будет атомарно заменена. При ошибке старые данные сохранятся.'
      : 'Записи будут объединены по идентификаторам. Более новая версия совпавшей записи получит приоритет.';
  }));
  node.querySelector('#performImport').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = 'Восстановление…';
    try {
      await importValidatedData(loaded.validation, mode);
      closeModal({ immediate:true });
      toast('Данные успешно восстановлены');
      try {
        if (window.ensureKnowledgeSeed) await window.ensureKnowledgeSeed();
        await applyStoredTheme();
        await render();
      } catch (postImportError) {
        rememberRuntimeError(postImportError, 'post-import');
        toast('Данные восстановлены. Перезапустите приложение для обновления экрана.', { duration:8000 });
      }
    } catch (error) {
      button.disabled = false; button.textContent = 'Повторить восстановление';
      toast(error.message || 'Ошибка восстановления');
    }
  });
}

async function clearAll() {
  const storesToClear=[...STORE_NAMES,...INTERNAL_STORE_NAMES];
  await runTransaction(storesToClear, 'readwrite', stores => { storesToClear.forEach(store => stores[store].clear()); });
  interactionState.dirtyDraftKeys.clear();
  interactionState.draftControllers.clear();
  state.recentItems=[];
  try { localStorage.removeItem('bps-last-data-change'); } catch (_) {}
  if(window.ensureKnowledgeSeed)await window.ensureKnowledgeSeed();
  await setSetting('theme','system');await setSetting('dataSchemaVersion',SCHEMA_VERSION);await applyStoredTheme();toast('Все данные удалены');await render();
}
async function addSamples() {
  const now=new Date();const tomorrow=new Date(now.getTime()+864e5);const yesterday=new Date(now.getTime()-864e5);
  const samples={
    entries:[
      {id:'sample_entry_1',type:'Неисправность',object:'КПП-2',equipment:'Турникет №3',description:'Считыватель два раза не распознал QR-код. Перезапущен контроллер, работа восстановлена.',status:'Работает — наблюдать',date:new Date(now.getTime()-45*60000).toISOString(),photos:[],createdAt:nowISO(),updatedAt:nowISO(),sample:true},
      {id:'sample_entry_2',type:'Выполненная работа',object:'Кассы',equipment:'Касса №2',description:'Проверена печать билетов и связь с кассовым принтером. Нарушений не обнаружено.',status:'Устранено',date:yesterday.toISOString(),photos:[],createdAt:nowISO(),updatedAt:nowISO(),sample:true}
    ],
    tasks:[
      {id:'sample_task_1',title:'Повторно проверить турникет №3',object:'КПП-2',priority:'Важный',dueAt:tomorrow.toISOString(),description:'Проверить считывание тестовых билетов перед мероприятием.',completed:false,createdAt:nowISO(),updatedAt:nowISO(),sample:true},
      {id:'sample_task_2',title:'Получить ответ агрегатора по возврату',object:'Билетный агрегатор',priority:'Обычный',dueAt:null,description:'',completed:false,createdAt:nowISO(),updatedAt:nowISO(),sample:true}
    ],
    equipment:[{id:'sample_equipment_1',name:'Турникет КПП-2 №3',type:'Турникет',object:'КПП-2',designation:'Т-23',status:'Требует внимания',ip:'192.168.2.13',serial:'',note:'Контролировать считыватель QR.',createdAt:nowISO(),updatedAt:nowISO(),sample:true}],
    inspections:[{id:'sample_inspection_1',object:'КПП-1',equipment:'Турникеты №1–8',date:yesterday.toISOString(),items:INSPECTION_ITEMS.map(name=>({name,status:'good'})),conclusion:'Нарушений не обнаружено.',photos:[],createdAt:nowISO(),updatedAt:nowISO(),sample:true}],
    knowledgeArticles:[BpsKnowledgeLogic.normalizeArticle({id:'sample_knowledge_1',title:'Ошибка ОФД 32 — первичная диагностика',type:'troubleshooting',categoryId:'kb_cash',summary:'Касса не может передать фискальные данные оператору ОФД.',appliesWhen:'При появлении ошибки ОФД 32 на кассовом рабочем месте.',prerequisites:['Доступ к кассе','Подключение к сети'],steps:['Проверить сетевое подключение кассы','Проверить доступность адреса ОФД','Перезапустить кассовую службу','Выполнить тестовую продажу'],expectedResult:'Чек отправлен в ОФД, билет сформирован и напечатан.',troubleshooting:'Если связь не восстановилась, проверить настройки адреса ОФД и обратиться к подрядчику.',tags:['офд','касса','ошибка 32'],status:'current',favorite:true,lastReviewedAt:nowISO(),createdAt:nowISO(),updatedAt:nowISO(),sample:true})]
  };
  const sampleEvent = BpsEventLogic.createEventFromTemplate('match-no-sib', BpsEventLogic.DEFAULT_RESOURCE_CATALOG, {
    id:'sample_event_1', name:'Матч без СИБ — пример', type:'Матч', date:tomorrow.toISOString(), sample:true
  });
  const sampleGate = sampleEvent.gates.find(gate => gate.id === 'kpp1');
  sampleGate.status = 'partial';
  sampleGate.turnstiles.forEach((turnstile,index)=>turnstile.mode=index<4?'active':index===4?'reserve':'not_requested');
  sampleEvent.cashDesks[0].mode='active';
  sampleEvent.cashDesks[0].assignments=[{id:'sample_assignment_1',person:'Иванова А. В.',from:'15:00',to:'21:00'}];
  sampleEvent.cashDesks[1].mode='closed';
  sampleEvent.checklist=BpsEventLogic.generateChecklist(sampleEvent);
  samples.events=[sampleEvent];
  await putRecordsAtomically(samples);toast('Примеры добавлены');await render();
}
async function removeSamples() {
  for(const store of ['entries','tasks','inspections','equipment','events','knowledgeArticles']) { const all=await dbGetAll(store);for(const item of all.filter(x=>x.sample))await dbDelete(store,item.id); }
  toast('Примеры удалены');await render();
}


async function createDiagnostic(error = lastStorageError, phase = 'manual') {
  let counts = {};
  try { counts = BpsStability.countStores(await getAllData()); } catch (_) {}
  const storage = await storageInfo();
  return BpsStability.sanitizeDiagnostic(error || new Error('Диагностика запрошена вручную'), {
    version: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    phase,
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    online: navigator.onLine,
    persisted: storage.persisted,
    storageUsage: storage.usage,
    storageQuota: storage.quota,
    counts,
  });
}
async function downloadDiagnostic(error = null, phase = 'manual') {
  const report = await createDiagnostic(error, phase);
  report.recentErrors = runtimeErrors.slice(-5).map(item => ({ name:item.name, message:item.message, phase:item.phase, at:item.at }));
  downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type:'application/json' }), `БПС-Пульт-diagnostic-${dayKey(new Date())}.json`);
  toast('Диагностический отчёт создан');
}
async function runIntegrityAudit() {
  const report = BpsStability.checkIntegrity(await getAllData());
  await setSetting('lastIntegrityCheckAt', report.checkedAt);
  const issues = [...report.errors, ...report.warnings];
  const rows = issues.slice(0, 30).map(item => `<div class="integrity-row ${item.severity}"><span>${icon(item.severity==='error'?'alert':'info')}</span><span>${esc(item.message)}</span></div>`).join('');
  const body = `<div class="summary-strip"><div><b>${Object.values(report.counts).reduce((sum,value)=>sum+value,0)}</b><span>объектов</span></div><div><b>${report.errors.length}</b><span>ошибок</span></div><div><b>${report.warnings.length}</b><span>предупр.</span></div></div>
    ${rows || '<div class="success-box spaced">Ошибок и потерянных связей не найдено.</div>'}
    ${issues.length>30?`<div class="field-help">Показаны первые 30 замечаний.</div>`:''}
    <button class="button full spaced-top" id="downloadIntegrity">${icon('download')}Скачать отчёт</button>`;
  const node = openModal('Проверка целостности', body);
  node.querySelector('#downloadIntegrity').addEventListener('click', () => downloadBlob(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),`БПС-Пульт-integrity-${dayKey(new Date())}.json`));
  return report;
}
function rememberRuntimeError(error, phase = 'runtime') {
  const safe = { name:error?.name||'Error', message:String(error?.message||error||'Неизвестная ошибка').slice(0,300), phase, at:nowISO() };
  runtimeErrors.push(safe); if(runtimeErrors.length>20)runtimeErrors.shift();
}
async function renderFatalError(error, phase = 'init') {
  rememberRuntimeError(error, phase);
  document.body.classList.add('fatal-state');
  const main = document.getElementById('appMain');
  main.innerHTML = `<section class="fatal-card" role="alert"><div class="fatal-icon">${icon('alert')}</div><h2>Не удалось открыть приложение</h2><p>Ваши данные не были очищены. Не удаляйте PWA и не очищайте Safari.</p><div class="error-code">${esc(error?.name||'Error')}: ${esc(error?.message||'Неизвестная ошибка')}</div><div class="button-stack"><button class="button primary full" id="fatalRetry">Повторить запуск</button><button class="button full" id="fatalDiagnostic">Скачать диагностику</button><label class="button full file-button">Восстановить из копии<input id="fatalImport" type="file" accept=".bpsbackup,.zip,.json" hidden></label></div></section>`;
  document.getElementById('fatalRetry').addEventListener('click',()=>location.reload());
  document.getElementById('fatalDiagnostic').addEventListener('click',()=>downloadDiagnostic(error,phase));
  document.getElementById('fatalImport').addEventListener('change',event=>{const file=event.target.files?.[0];if(file)openImportPreview(file);});
}


function openClearDataModal() {
  const node = openModal('Удалить все данные', `<div class="warning-box spaced-bottom">Будут безвозвратно удалены мероприятия, база знаний, записи, задачи, техосмотры, оборудование и фотографии.</div><div class="field"><label for="clearPhrase">Для подтверждения напишите УДАЛИТЬ</label><input id="clearPhrase" autocomplete="off" autocapitalize="characters" placeholder="УДАЛИТЬ"></div><button class="button danger full" id="clearEverything" disabled>${icon('trash')}Удалить всё</button>`);
  const input = node.querySelector('#clearPhrase');
  const button = node.querySelector('#clearEverything');
  input.addEventListener('input', () => { button.disabled = input.value.trim().toUpperCase() !== 'УДАЛИТЬ'; });
  button.addEventListener('click', async () => { await clearAll(); closeModal(); });
}

function openQuickCreate() {
  const options = [
    ['new-entry','journal','Запись журнала','Событие, работа или наблюдение'],
    ['new-task','task','Задача','Срок, приоритет и связанный объект'],
    ['new-inspection','inspection','Техосмотр','Чек-лист и фотографии'],
    ['new-equipment','equipment','Оборудование','Новый объект локального реестра'],
  ];
  const node = openModal('Быстро создать', `<div class="quick-create-grid">${options.map(([action,iconName,title,subtitle])=>`<button class="quick-create-card" data-quick-create="${action}"><span class="row-icon accent">${icon(iconName)}</span><span><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span>${icon('chevron')}</button>`).join('')}</div>`);
  node.querySelectorAll('[data-quick-create]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.quickCreate;
    closeModal({ immediate:true });
    handleAppAction(action);
  }));
}

async function clearFilters(target) {
  if (target === 'journal') state.journal = { query:'', type:'Все типы', object:'Все объекты', status:'Все статусы', period:'Все даты' };
  else if (target === 'tasks') state.taskFilter = 'Открытые';
  else if (target === 'inspections') state.inspectionFilter = 'Все';
  else if (target === 'equipment') state.equipment = { query:'', status:'Все статусы', favorite:false };
  else if (target === 'search') state.globalSearch = { query:'', type:'all' };
  else if (target === 'events') state.events = { query:'', status:'Все статусы' };
  if (target !== 'search') await setSetting(`filter:${target}`, target === 'tasks' ? state.taskFilter : target === 'inspections' ? state.inspectionFilter : state[target]);
  await render();
}

async function toggleTaskWithUndo(task) {
  const previous = { completed:Boolean(task.completed), completedAt:task.completedAt || null };
  task.completed = !task.completed;
  task.completedAt = task.completed ? nowISO() : null;
  task.updatedAt = nowISO();
  await dbPut('tasks', task);
  toast(task.completed ? 'Задача выполнена' : 'Задача возвращена', {
    actionText:'Отменить',
    duration:6500,
    onAction:async () => {
      const fresh = await dbGet('tasks', task.id);
      if (!fresh) return;
      fresh.completed = previous.completed;
      fresh.completedAt = previous.completedAt;
      fresh.updatedAt = nowISO();
      await dbPut('tasks', fresh);
      await render();
    },
  });
  await render();
}

async function handleAppAction(action, id) {
  if(action==='new-knowledge')openKnowledgeArticleForm();
  else if(action==='knowledge-detail')openKnowledgeArticleDetail(id);
  else if(action==='edit-knowledge'){const item=state.data.knowledgeArticles.find(x=>x.id===id);if(item)openKnowledgeArticleForm(item);}
  else if(action==='delete-knowledge')await softDelete('knowledgeArticles',id,'Материал');
  else if(action==='new-event')openEventForm();
  else if(action==='event-detail')openEventDetail(id);
  else if(action==='edit-event'){const item=state.data.events.find(x=>x.id===id);if(item)openEventForm(item);}
  else if(action==='duplicate-event'){const item=state.data.events.find(x=>x.id===id);if(item)duplicateEvent(item);}
  else if(action==='delete-event')confirmModal('Удалить мероприятие?','Конфигурация и чек-лист мероприятия будут удалены. Связанные записи и задачи останутся.','Удалить',async()=>{await deleteEventWithUndo(id);},true);
  else if(action==='new-entry')openEntryForm();
  else if(action==='new-task')openTaskForm();
  else if(action==='new-inspection')openInspectionForm();
  else if(action==='new-equipment')openEquipmentForm();
  else if(action==='quick-create')openQuickCreate();
  else if(action==='entry-detail')openEntryDetail(id);
  else if(action==='task-detail')openTaskDetail(id);
  else if(action==='inspection-detail')openInspectionDetail(id);
  else if(action==='equipment-detail')openEquipmentDetail(id);
  else if(action==='edit-entry'){const item=state.data.entries.find(x=>x.id===id);if(item)openEntryForm(item);}
  else if(action==='edit-task'){const item=state.data.tasks.find(x=>x.id===id);if(item)openTaskForm(item);}
  else if(action==='edit-inspection'){const item=state.data.inspections.find(x=>x.id===id);if(item)openInspectionForm(item);}
  else if(action==='edit-equipment'){const item=state.data.equipment.find(x=>x.id===id);if(item)openEquipmentForm(item);}
  else if(action==='delete-entry')await deleteEntryWithUndo(id);
  else if(action==='delete-inspection')await deleteInspectionWithUndo(id);
  else if(action==='delete-equipment')await deleteEquipmentWithUndo(id);
  else if(action==='route')go(id);
  else if(action==='toggle-task'){const t=state.data.tasks.find(x=>x.id===id);if(t)await toggleTaskWithUndo(t);}
  else if(action==='copy-report'){await navigator.clipboard.writeText(buildDailyReport());toast('Отчёт скопирован');}
  else if(action==='share-report'){const text=buildDailyReport();if(navigator.share)await navigator.share({title:'Итоги рабочего дня',text});else{await navigator.clipboard.writeText(text);toast('Web Share недоступен — текст скопирован');}}
  else if(action==='export-report-csv'){
    const report=BpsProductivity.reportData(state.data,state.report);
    downloadBlob(new Blob([BpsProductivity.reportToCsv(report)],{type:'text/csv;charset=utf-8'}),`БПС-Пульт-отчёт-${state.report.from}-${state.report.to}.csv`);
    toast('CSV-отчёт создан');
  }
  else if(action==='print-report'){document.body.classList.add('printing-report');window.print();setTimeout(()=>document.body.classList.remove('printing-report'),500);}
  else if(action==='export-data'){try{await exportData();}catch(error){toast(error.message||'Ошибка экспорта');}}
  else if(action==='request-persistence'){try{await requestStoragePersistence();}catch(error){toast(error.message||'Не удалось запросить хранение');}}
  else if(action==='empty-trash')confirmModal('Очистить корзину?','Удалённые объекты больше нельзя будет восстановить.','Очистить',async()=>{await dbClear('trash');toast('Корзина очищена');await render();},true);
  else if(action==='check-integrity')await runIntegrityAudit();
  else if(action==='download-diagnostic')await downloadDiagnostic();
  else if(action==='add-samples')await addSamples();
  else if(action==='remove-samples')await removeSamples();
  else if(action==='clear-data')openClearDataModal();
}
function closeOpenSwipeRow(except=null) {
  document.querySelectorAll('[data-swipe-row].open').forEach(row=>{
    if(row!==except){row.classList.remove('open','dragging');row.querySelector('.swipe-content')?.style.removeProperty('--swipe-x');}
  });
  if(!except)interactionState.openSwipeRow=null;
}
function bindSwipeRows(root) {
  root.querySelectorAll('[data-swipe-row]').forEach(row=>{
    const content=row.querySelector('.swipe-content');if(!content)return;
    let startX=0,startY=0,current=0,pointerId=null,axis=null,moved=false;
    const width=132;
    content.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      closeOpenSwipeRow(row);startX=e.clientX;startY=e.clientY;pointerId=e.pointerId;axis=null;moved=false;current=row.classList.contains('open')?-width:0;content.setPointerCapture?.(pointerId);
    });
    content.addEventListener('pointermove',e=>{
      if(e.pointerId!==pointerId)return;const dx=e.clientX-startX,dy=e.clientY-startY;
      if(!axis&&Math.hypot(dx,dy)>7)axis=Math.abs(dx)>Math.abs(dy)*1.18?'x':'y';
      if(axis!=='x')return;e.preventDefault();moved=true;row.classList.add('dragging');
      const next=Math.max(-width,Math.min(12,current+dx));content.style.setProperty('--swipe-x',`${next}px`);
    },{passive:false});
    const finish=e=>{
      if(e.pointerId!==pointerId)return;const dx=e.clientX-startX;content.releasePointerCapture?.(pointerId);row.classList.remove('dragging');
      if(axis==='x'&&current+dx<-48){row.classList.add('open');content.style.setProperty('--swipe-x',`-${width}px`);interactionState.openSwipeRow=row;}
      else{row.classList.remove('open');content.style.setProperty('--swipe-x','0px');if(interactionState.openSwipeRow===row)interactionState.openSwipeRow=null;}
      if(moved){content.dataset.suppressClick='true';setTimeout(()=>delete content.dataset.suppressClick,0);}pointerId=null;
    };
    content.addEventListener('pointerup',finish);content.addEventListener('pointercancel',finish);
    content.addEventListener('click',e=>{if(content.dataset.suppressClick==='true'){e.preventDefault();e.stopImmediatePropagation();}},true);
  });
  root.querySelectorAll('[data-gesture-action]').forEach(btn=>btn.addEventListener('click',async e=>{e.stopPropagation();closeOpenSwipeRow();await handleAppAction(btn.dataset.gestureAction,btn.dataset.id);}));
}
function bindEdgeBackGesture() {
  let startX=0,startY=0,pointerId=null;
  addEventListener('pointerdown',e=>{
    if(e.clientX>22||document.querySelector('[data-modal-backdrop]'))return;
    if(!['tasks','events','knowledge','equipment','search','report','settings','install'].includes(state.route))return;
    startX=e.clientX;startY=e.clientY;pointerId=e.pointerId;
  });
  addEventListener('pointerup',e=>{
    if(e.pointerId!==pointerId)return;
    if(e.clientX-startX>80&&Math.abs(e.clientY-startY)<70)go('more');
    pointerId=null;
  });
}

function bindPageEvents() {
  const main=document.getElementById('appMain');
  main.querySelectorAll('[data-route-link]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.routeLink)));
  main.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',async event=>{
    event.stopPropagation();
    await handleAppAction(el.dataset.action,el.dataset.id);
  }));
  bindSwipeRows(main);
  main.querySelectorAll('[data-clear-filters]').forEach(button=>button.addEventListener('click',()=>clearFilters(button.dataset.clearFilters)));
  const q=main.querySelector('#journalSearch');if(q)q.addEventListener('input',debounce(async()=>{state.journal.query=q.value;await setSetting('filter:journal',state.journal);await render();document.querySelector('#journalSearch')?.focus({preventScroll:true});},180));
  [['journalType','type'],['journalObject','object'],['journalStatus','status'],['journalPeriod','period']].forEach(([id,key])=>main.querySelector(`#${id}`)?.addEventListener('change',async e=>{state.journal[key]=e.target.value;await setSetting('filter:journal',state.journal);await render();}));
  main.querySelectorAll('[data-task-filter]').forEach(b=>b.addEventListener('click',async()=>{state.taskFilter=b.dataset.taskFilter;await setSetting('filter:tasks',state.taskFilter);await render();}));
  main.querySelectorAll('[data-inspection-filter]').forEach(b=>b.addEventListener('click',async()=>{state.inspectionFilter=b.dataset.inspectionFilter;await setSetting('filter:inspections',state.inspectionFilter);await render();}));
  main.querySelectorAll('[data-quick-filter]').forEach(button=>button.addEventListener('click',async()=>{
    const target=button.dataset.quickFilter;
    if(target==='today'){state.journal.period='Сегодня';await setSetting('filter:journal',state.journal);go('journal');}
    else if(target==='overdue'){state.taskFilter='Просрочено';await setSetting('filter:tasks',state.taskFilter);go('tasks');}
    else if(target==='without-result'){state.inspectionFilter='Без результата';await setSetting('filter:inspections',state.inspectionFilter);go('inspections');}
    else if(target==='attention'){state.equipment.status='Требует внимания';await setSetting('filter:equipment',state.equipment);go('equipment');}
  }));
  const equipmentSearch=main.querySelector('#equipmentSearch');
  equipmentSearch?.addEventListener('input',debounce(async()=>{state.equipment.query=equipmentSearch.value;await setSetting('filter:equipment',state.equipment);await render();document.querySelector('#equipmentSearch')?.focus({preventScroll:true});},180));
  main.querySelectorAll('[data-equipment-status]').forEach(button=>button.addEventListener('click',async()=>{state.equipment.status=button.dataset.equipmentStatus;await setSetting('filter:equipment',state.equipment);await render();}));
  main.querySelector('[data-equipment-favorite]')?.addEventListener('click',async()=>{state.equipment.favorite=!state.equipment.favorite;await setSetting('filter:equipment',state.equipment);await render();});
  const globalSearch=main.querySelector('#globalSearchInput');
  globalSearch?.addEventListener('input',debounce(async()=>{state.globalSearch.query=globalSearch.value;await render();const replacement=document.querySelector('#globalSearchInput');replacement?.focus({preventScroll:true});replacement?.setSelectionRange(replacement.value.length,replacement.value.length);},140));
  main.querySelectorAll('[data-search-type]').forEach(button=>button.addEventListener('click',async()=>{state.globalSearch.type=button.dataset.searchType;await render();}));
  const syncReport=async()=>{
    const from=main.querySelector('#reportFrom')?.value||state.report.from;
    const to=main.querySelector('#reportTo')?.value||from;
    state.report.from=from<=to?from:to;
    state.report.to=from<=to?to:from;
    state.report.sections=[...main.querySelectorAll('[data-report-section]:checked')].map(input=>input.dataset.reportSection);
    await render();
  };
  main.querySelectorAll('#reportFrom,#reportTo,[data-report-section]').forEach(input=>input.addEventListener('change',syncReport));
  main.querySelectorAll('[data-report-period]').forEach(button=>button.addEventListener('click',async()=>{
    const end=new Date();
    const start=new Date(end);
    if(button.dataset.reportPeriod==='week')start.setDate(end.getDate()-6);
    state.report.from=dayKey(start);state.report.to=dayKey(end);await render();
  }));
  main.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',async()=>{await setSetting('theme',b.dataset.themeChoice);setTheme(b.dataset.themeChoice);render();}));
  const contrastSwitch=main.querySelector('#highContrastSwitch');
  contrastSwitch?.addEventListener('click',async()=>{state.preferences.highContrast=!state.preferences.highContrast;document.documentElement.dataset.contrast=state.preferences.highContrast?'high':'normal';await saveUiPreferences();await render();});
  main.querySelector('#startupRoute')?.addEventListener('change',async event=>{state.preferences.startupRoute=event.target.value;await saveUiPreferences();toast('Раздел запуска сохранён');});
  const operatorName=main.querySelector('#operatorName');
  operatorName?.addEventListener('change',async()=>{state.preferences.operatorName=operatorName.value.trim()||'Инженер';await saveUiPreferences();toast('Имя для проверок сохранено');});
  main.querySelector('#importInput')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(file)openImportPreview(file);e.target.value='';});
  window.bindEventPageEvents?.(main);
  window.bindKnowledgePageEvents?.(main);
}

function showUpdateAvailable(registration) {
  interactionState.updateRegistration = registration;
  const bar = document.getElementById('updateBar');
  if (!bar) return;
  bar.hidden = false;
  document.body.classList.add('update-available');
}
async function activateWaitingWorker() {
  const waiting = interactionState.updateRegistration?.waiting;
  if (!waiting) { toast('Обновление ещё загружается'); return; }
  sessionStorage.setItem('bps-update-requested','1');
  waiting.postMessage({ type:'SKIP_WAITING' });
}
async function requestUpdateActivation() {
  const drafts = await dbGetAll('drafts');
  const lastBackupAt = await getSetting('lastBackupAt', null);
  const backupDays = daysSince(lastBackupAt);
  if (!drafts.length && backupDays !== null && backupDays < 7) {
    await activateWaitingWorker();
    return;
  }
  const warnings = [
    drafts.length ? `${drafts.length} ${plural(drafts.length,'черновик сохранён','черновика сохранены','черновиков сохранены')} и восстановятся после запуска.` : '',
    backupDays === null ? 'Резервная копия ещё не создавалась.' : backupDays >= 7 ? `Последней резервной копии ${backupDays} дней.` : '',
  ].filter(Boolean);
  const node = openModal('Перед обновлением', `<div class="warning-box spaced-bottom">${warnings.map(message=>`<p>${esc(message)}</p>`).join('')}<p>Для важных рабочих данных рекомендуется сначала создать .bpsbackup.</p></div><div class="button-stack"><button class="button primary full" id="updateNow">Обновить сейчас</button><button class="button full" id="backupBeforeUpdate">${icon('download')}Создать резервную копию</button><button class="button full" data-modal-close>Позже</button></div>`);
  node.querySelector('#updateNow').addEventListener('click',async()=>{closeModal({immediate:true});await activateWaitingWorker();});
  node.querySelector('#backupBeforeUpdate').addEventListener('click',async()=>{
    try { await exportData(); }
    catch(error){toast(error.message||'Не удалось создать резервную копию');return;}
    closeModal({immediate:true});
    await activateWaitingWorker();
  });
}
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('./sw.js', { scope:'./' });
  interactionState.updateRegistration = registration;
  if (registration.waiting && navigator.serviceWorker.controller) showUpdateAvailable(registration);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateAvailable(registration);
    });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !sessionStorage.getItem('bps-update-requested')) return;
    reloading = true; sessionStorage.removeItem('bps-update-requested'); location.reload();
  });
  document.getElementById('applyUpdate')?.addEventListener('click', async () => {
    await requestUpdateActivation();
  });
  document.getElementById('dismissUpdate')?.addEventListener('click', () => {
    document.getElementById('updateBar').hidden = true;
    document.body.classList.remove('update-available');
  });
  try { await registration.update(); } catch (_) {}
  return registration;
}

function debounce(fn,ms){
  let timer;
  const wrapped=(...args)=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      timer=null;
      fn(...args);
    },ms);
  };
  wrapped.cancel=()=>{
    clearTimeout(timer);
    timer=null;
  };
  return wrapped;
}

async function applyStoredTheme(){const theme=await getSetting('theme','system');setTheme(theme);}
async function init(){
  try {
    if(!('indexedDB' in window)) throw new Error('IndexedDB недоступна. Откройте приложение в Safari.');
    await openDatabase();
    await runLiveMigrations();
    await cleanupTrash();
    await cleanupDrafts();
    if(window.ensureKnowledgeSeed)await window.ensureKnowledgeSeed();
    await applyStoredTheme();
    await loadUiPreferences();
    if (!sessionStorage.getItem('bps-session-started')) {
      const startup = state.preferences.startupRoute === 'last'
        ? await getSetting('lastRoute', 'today')
        : state.preferences.startupRoute;
      if (routeTitles[startup] && (!location.hash || currentRoute() === 'today')) history.replaceState(null,'',`#${startup}`);
      sessionStorage.setItem('bps-session-started','1');
    }
    document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
    document.getElementById('themeQuickBtn').addEventListener('click',cycleTheme);
    document.getElementById('globalSearchBtn')?.addEventListener('click',()=>go('search'));
    document.querySelectorAll('.nav-button').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.route)));
    document.getElementById('recordButton').addEventListener('click',openQuickCreate);
    document.addEventListener('pointerdown',e=>{if(interactionState.openSwipeRow&&!e.target.closest('[data-swipe-row]'))closeOpenSwipeRow();});
    bindEdgeBackGesture();
    addEventListener('hashchange',render);addEventListener('online',updateOnlineStatus);addEventListener('offline',updateOnlineStatus);updateOnlineStatus();
    addEventListener('bps-db-blocked',()=>toast('Закройте другие вкладки БПС Пульта для обновления базы',{duration:8000}));
    addEventListener('bps-db-versionchange',()=>{toast('База обновлена в другой вкладке. Приложение будет перезапущено.',{duration:3000});setTimeout(()=>location.reload(),1000);});
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',async()=>{if(await getSetting('theme','system')==='system'){setTheme('system');}});
    await render();
    await registerServiceWorker();
    await restoreLatestDraft();
    const storage = await storageInfo();
    if (!storage.persisted && isStandalone()) console.info('Persistent storage is not guaranteed');
  } catch (error) {
    await renderFatalError(error, 'init');
  }
}

window.addEventListener('error', event => {
  rememberRuntimeError(event.error || new Error(event.message), 'window.error');
});
window.addEventListener('unhandledrejection', event => {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled rejection'));
  rememberRuntimeError(error, 'unhandledrejection');
  if (document.readyState === 'complete') toast(error.message || 'Непредвиденная ошибка');
});

document.addEventListener('DOMContentLoaded',init);
