'use strict';

const APP_VERSION = '2.0.0-alpha.1';
const SCHEMA_VERSION = 2;
const DB_NAME = 'bps-pult-local';
const DB_VERSION = 2;
const STORE_NAMES = ['entries', 'tasks', 'inspections', 'equipment', 'events', 'settings'];

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
  data: { entries: [], tasks: [], inspections: [], equipment: [], events: [] },
};

const interactionState = { modalClosing: false, openSwipeRow: null };
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
function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
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
        store.createIndex('date', 'date');
        store.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
async function storeAction(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try { result = action(store); } catch (error) { reject(error); return; }
    if (result && typeof result.onsuccess !== 'undefined') {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    } else {
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    }
  });
}
const dbGetAll = store => storeAction(store, 'readonly', s => s.getAll());
const dbGet = (store, id) => storeAction(store, 'readonly', s => s.get(id));
const dbPut = (store, value) => storeAction(store, 'readwrite', s => s.put(value));
const dbDelete = (store, id) => storeAction(store, 'readwrite', s => s.delete(id));
const dbClear = store => storeAction(store, 'readwrite', s => s.clear());
async function getSetting(key, fallback = null) { const v = await dbGet('settings', key); return v ? v.value : fallback; }
async function setSetting(key, value) { await dbPut('settings', { key, value }); }

async function refreshData() {
  const [entries, tasks, inspections, equipment, events] = await Promise.all(['entries','tasks','inspections','equipment','events'].map(dbGetAll));
  state.data.entries = entries.sort((a,b) => new Date(b.date) - new Date(a.date));
  state.data.tasks = tasks.sort((a,b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    if (!a.dueAt) return 1; if (!b.dueAt) return -1; return new Date(a.dueAt) - new Date(b.dueAt);
  });
  state.data.inspections = inspections.sort((a,b) => new Date(b.date) - new Date(a.date));
  state.data.equipment = equipment.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
  state.data.events = events.sort((a,b) => new Date(a.date || 0) - new Date(b.date || 0));
}

function toast(message) {
  const root = document.getElementById('toastRoot');
  root.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { root.innerHTML = ''; }, 2600);
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
  tasks: 'Задачи', events: 'Мероприятия', equipment: 'Оборудование', report: 'Итоги дня', settings: 'Настройки', install: 'Как установить'
};
function go(route) {
  location.hash = route;
}
function currentRoute() {
  const value = location.hash.replace('#','').split('?')[0];
  return routeTitles[value] ? value : 'today';
}
function updateNav() {
  document.querySelectorAll('.nav-button').forEach(btn => btn.classList.toggle('active', btn.dataset.route === state.route || (btn.dataset.route === 'more' && ['tasks','events','equipment','report','settings','install'].includes(state.route))));
}

async function render() {
  const previousRoute = state.route;
  state.route = currentRoute();
  await refreshData();
  document.getElementById('pageTitle').textContent = routeTitles[state.route];
  updateNav();
  const main = document.getElementById('appMain');
  const pages = {
    today: renderToday, journal: renderJournal, inspections: renderInspections, more: renderMore,
    tasks: renderTasks, events: renderEvents, equipment: renderEquipment, report: renderReport, settings: renderSettings, install: renderInstall
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
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const todayLabel = formatDate(new Date(), { weekday:'long', day:'numeric', month:'long' });
  const install = !isStandalone() ? `<div class="section"><div class="inline-notice"><span class="inline-notice-icon">${icon('install')}</span><span><strong>Установить на iPhone</strong><small>Работает офлайн после первого запуска</small></span><button class="text-button" data-route-link="install">Открыть</button></div></div>` : '';
  return `
    <section class="today-intro">
      <div class="today-greeting">${greeting}, Артём</div>
      <div class="today-date">${todayLabel}</div>
      <div class="local-state">${icon('database')} Данные хранятся только на этом iPhone</div>
    </section>
    ${install}
    ${renderNextEventSection()}
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
      ${recentToday.length ? `<div class="list-card">${recentToday.map(entryRow).join('')}</div>` : `<div class="quiet-state">${icon('journal')}<span><strong>Записей ещё нет</strong><small>Нажмите «Записать» в нижней панели</small></span></div>`}
    </section>`;
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
  const groups = Object.groupBy ? Object.groupBy(entries, e => dayKey(e.date)) : entries.reduce((acc,e)=>((acc[dayKey(e.date)] ||= []).push(e),acc),{});
  return `
    <section class="section filters">
      <div class="search-input-wrap">${icon('search')}<input id="journalSearch" type="search" placeholder="Поиск по журналу" value="${esc(state.journal.query)}" autocomplete="off"></div>
      <div class="form-grid two">
        <select id="journalType" aria-label="Тип записи">${optionsHtml(['Все типы',...ENTRY_TYPES],state.journal.type)}</select>
        <select id="journalObject" aria-label="Объект">${optionsHtml(['Все объекты',...OBJECTS],state.journal.object)}</select>
        <select id="journalStatus" aria-label="Статус">${optionsHtml(['Все статусы',...ENTRY_STATUSES],state.journal.status)}</select>
        <select id="journalPeriod" aria-label="Период">${optionsHtml(['Все даты','Сегодня','7 дней','30 дней'],state.journal.period)}</select>
      </div>
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
  return `<section class="section"><div class="filter-row">${['Открытые','Сегодня','Просрочено','Без срока','Выполнено'].map(f=>`<button class="chip ${f===filter?'active':''}" data-task-filter="${f}">${f}</button>`).join('')}</div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">${tasks.length} ${plural(tasks.length,'задача','задачи','задач')}</h2></div><button class="button primary small" data-action="new-task">${icon('plus')}Добавить</button></div>
      ${tasks.length ? `<div class="list-card">${tasks.map(taskRow).join('')}</div>` : emptyState('task','Здесь пока пусто','Для выбранного фильтра задач нет.', '<button class="button primary small" data-action="new-task">Создать задачу</button>')}
    </section>`;
}

function renderInspections() {
  const list = state.data.inspections;
  return `<section class="page-lead"><p>Единый чек-лист для турникетов, касс и рабочих мест. Результаты сохраняются в локальной истории.</p><button class="button primary" data-action="new-inspection">${icon('inspection')}Начать осмотр</button></section>
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
    ${listRow({id:'events',action:'route',iconName:'calendar',title:'Мероприятия',meta:'Гибкая схема гейтов, турникетов, СИБ и касс',side:state.data.events.length?`${state.data.events.length}`:''})}
    ${listRow({id:'tasks',action:'route',iconName:'task',title:'Задачи',meta:'Сроки, приоритеты и выполненные работы',side:open?`<span class="status-pill info">${open}</span>`:''})}
    ${listRow({id:'equipment',action:'route',iconName:'equipment',title:'Оборудование',meta:'Локальный реестр турникетов, касс и серверов',side:`${state.data.equipment.length}`})}
    ${listRow({id:'report',action:'route',iconName:'report',title:'Итоги дня',meta:'Готовая хронология для отчёта'})}
    ${listRow({id:'settings',action:'route',iconName:'settings',title:'Настройки и данные',meta:'Тема, резервная копия и хранилище'})}
    ${listRow({id:'install',action:'route',iconName:'install',title:'Как установить',meta:'Добавить приложение на экран «Домой»'})}
  </div></section>
  <section class="section"><div class="card notice-card"><div class="notice-icon info">${icon('database')}</div><div><h3>Только локальные данные</h3><p>Записи не отправляются на сервер. Регулярно делайте резервную копию в настройках.</p></div></div></section>`;
}

function renderEquipment() {
  const list = state.data.equipment;
  return `<section class="section"><div class="section-head"><div><h2 class="section-title">${list.length} ${plural(list.length,'объект','объекта','объектов')}</h2><p class="section-subtitle">Локальный реестр оборудования</p></div><button class="button primary small" data-action="new-equipment">${icon('plus')}Добавить</button></div>
    ${list.length ? `<div class="list-card">${list.map(e=>listRow({id:e.id,action:'equipment-detail',iconName:'equipment',tone:statusTone(e.status),title:e.name,meta:`${e.object || 'Без объекта'} · ${e.designation || e.type || 'Без обозначения'}`,side:`<span class="status-pill ${statusTone(e.status)}">${esc(e.status)}</span>`})).join('')}</div>` : emptyState('equipment','Реестр пуст','Добавьте турникеты, кассы, серверы и другое оборудование.', '<button class="button primary small" data-action="new-equipment">Добавить оборудование</button>')}
  </section>`;
}

function buildDailyReport() {
  const entries = state.data.entries.filter(e=>isToday(e.date)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const completed = state.data.tasks.filter(t=>t.completed && t.completedAt && isToday(t.completedAt));
  const inspections = state.data.inspections.filter(i=>isToday(i.date));
  const lines = [`ИТОГИ РАБОЧЕГО ДНЯ — ${formatDate(new Date(),{day:'numeric',month:'long',year:'numeric'})}`, ''];
  if (entries.length) {
    lines.push('СОБЫТИЯ И ВЫПОЛНЕННЫЕ РАБОТЫ');
    entries.forEach(e => lines.push(`• ${formatDate(e.date,{hour:'2-digit',minute:'2-digit'})} — ${e.object}${e.equipment?`, ${e.equipment}`:''}: ${e.description} (${e.status}).`));
    lines.push('');
  }
  if (inspections.length) {
    lines.push('ТЕХНИЧЕСКИЕ ОСМОТРЫ');
    inspections.forEach(i => {
      const issues = i.items.filter(x=>x.status==='issue').map(x=>x.name);
      lines.push(`• ${i.object}${i.equipment?`, ${i.equipment}`:''}: ${issues.length ? `замечания — ${issues.join(', ')}` : 'нарушений не обнаружено'}.`);
    });
    lines.push('');
  }
  if (completed.length) {
    lines.push('ВЫПОЛНЕННЫЕ ЗАДАЧИ');
    completed.forEach(t => lines.push(`• ${t.title}${t.object?` (${t.object})`:''}.`));
    lines.push('');
  }
  const unresolved = state.data.entries.filter(e=>isToday(e.date) && ['Не устранено','Повторная проверка','Ожидается ответ','Работает — наблюдать'].includes(e.status));
  if (unresolved.length) {
    lines.push('ОСТАЛОСЬ НА КОНТРОЛЕ');
    unresolved.forEach(e=>lines.push(`• ${e.object}${e.equipment?`, ${e.equipment}`:''} — ${e.status}: ${e.description}.`));
  }
  if (!entries.length && !completed.length && !inspections.length) lines.push('За сегодняшний день записи отсутствуют.');
  return lines.join('\n').replace(/\.{2,}/g,'.');
}
function renderReport() {
  const text = buildDailyReport();
  return `<section class="section"><div class="card notice-card"><div class="notice-icon accent">${icon('report')}</div><div><h3>Отчёт собран автоматически</h3><p>Используются сегодняшние записи, осмотры и завершённые задачи.</p></div></div></section>
    <section class="section"><div class="report-box" id="reportText">${esc(text)}</div></section>
    <section class="section"><div class="button-row"><button class="button" data-action="copy-report">${icon('copy')}Скопировать</button><button class="button primary" data-action="share-report">${icon('share')}Поделиться</button></div></section>`;
}

async function storageInfo() {
  if (!navigator.storage?.estimate) return { text:'Недоступно', percent:0 };
  const e = await navigator.storage.estimate();
  const usage = e.usage || 0, quota = e.quota || 0;
  return { usage, quota, percent: quota ? Math.min(100, usage/quota*100) : 0, text:`${formatBytes(usage)} из ${formatBytes(quota)}` };
}
function formatBytes(bytes) {
  if (!bytes) return '0 Б';
  const units=['Б','КБ','МБ','ГБ']; let i=0, n=bytes;
  while(n>=1024 && i<units.length-1){n/=1024;i++;}
  return `${n.toFixed(i?1:0)} ${units[i]}`;
}
async function renderSettings() {
  const theme = await getSetting('theme','system');
  const s = await storageInfo();
  return `<section class="section"><div class="section-head"><div><h2 class="section-title">Внешний вид</h2></div></div><div class="card"><div class="field flush"><label>Тема приложения</label><div class="segmented">${['system','light','dark'].map(t=>`<button class="segment-button ${t===theme?'active':''}" data-theme-choice="${t}">${{system:'Системная',light:'Светлая',dark:'Тёмная'}[t]}</button>`).join('')}</div></div></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Локальное хранилище</h2><p class="section-subtitle">Данные находятся только на этом устройстве</p></div></div><div class="card"><div class="data-stat"><span>Использовано</span><strong>${s.text}</strong></div><div class="data-stat"><span>Записи</span><strong>${state.data.entries.length}</strong></div><div class="data-stat"><span>Задачи</span><strong>${state.data.tasks.length}</strong></div><div class="data-stat"><span>Техосмотры</span><strong>${state.data.inspections.length}</strong></div><div class="data-stat"><span>Оборудование</span><strong>${state.data.equipment.length}</strong></div><div class="progress-bar progress-spaced"><div class="progress-fill" style="width:${s.percent}%"></div></div></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Резервная копия</h2></div></div><div class="warning-box">Удаление PWA, очистка данных Safari или сброс iPhone могут удалить журнал. Экспортируйте резервную копию после важных изменений.</div><div class="button-row spaced"><button class="button" data-action="export-data">${icon('download')}Экспорт JSON</button><label class="button primary file-button">${icon('upload')}Импорт JSON<input id="importInput" type="file" accept="application/json,.json" hidden></label></div></section>
    <section class="section"><div class="section-head"><div><h2 class="section-title">Тестирование</h2></div></div><div class="button-row"><button class="button" data-action="add-samples">Добавить примеры</button><button class="button" data-action="remove-samples">Удалить примеры</button></div></section>
    <section class="section"><div class="danger-zone"><h3>Удалить все данные</h3><p>Действие нельзя отменить без резервной копии.</p><button class="button danger full" data-action="clear-data">${icon('trash')}Очистить приложение</button></div></section>
    <section class="section"><div class="card"><div class="data-stat"><span>Версия</span><strong>${APP_VERSION}</strong></div><div class="data-stat"><span>Схема данных</span><strong>${SCHEMA_VERSION}</strong></div><div class="data-stat"><span>Режим</span><strong>${isStandalone()?'Установлено':'Safari'}</strong></div></div></section>`;
}

function renderInstall() {
  const standalone = isStandalone();
  return `<section class="page-lead"><p>Добавьте сайт на экран «Домой». После первого открытия оболочка сохранится на iPhone и будет работать без интернета.</p></section>
    <section class="section"><div class="card">${standalone ? `<div class="notice-card"><div class="notice-icon success">${icon('check')}</div><div><h3>Приложение уже установлено</h3><p>Вы открыли его в автономном режиме с экрана «Домой».</p></div></div>` : `<div class="detail-grid"><div class="detail-field"><div class="detail-field-label">Шаг 1</div><div class="detail-field-value">Откройте эту страницу именно в Safari.</div></div><div class="detail-field"><div class="detail-field-label">Шаг 2</div><div class="detail-field-value">Нажмите кнопку «Поделиться» в нижней панели Safari.</div></div><div class="detail-field"><div class="detail-field-label">Шаг 3</div><div class="detail-field-value">Выберите «На экран Домой», затем «Добавить».</div></div><div class="detail-field"><div class="detail-field-label">Шаг 4</div><div class="detail-field-value">Откройте новую иконку один раз при наличии интернета. После этого включите авиарежим и проверьте запуск.</div></div></div>`}</div></section>
    <section class="section"><div class="card notice-card"><div class="notice-icon">${icon('alert')}</div><div><h3>Важно о данных</h3><p>Записи хранятся локально. Перед удалением приложения сделайте экспорт JSON в разделе «Настройки и данные».</p></div></div></section>`;
}

function openModal(title, bodyHtml, options = {}) {
  if (document.querySelector('[data-modal-backdrop]')) closeModal({ immediate: true });
  const template = document.getElementById('modalTemplate');
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('#modalTitle').textContent = title;
  node.querySelector('.modal-body').innerHTML = bodyHtml;
  node.querySelector('.modal-header-action').innerHTML = options.actionHtml || '';
  document.getElementById('modalRoot').replaceChildren(node);
  document.body.style.overflow = 'hidden';
  document.body.classList.add('sheet-open');
  interactionState.modalClosing = false;
  node.querySelectorAll('[data-modal-close]').forEach(btn=>btn.addEventListener('click',()=>closeModal()));
  node.addEventListener('click', e=>{ if(e.target.matches('[data-modal-backdrop]')) closeModal(); });
  setupSheetGestures(node);
  options.onOpen?.(node);
  requestAnimationFrame(()=>{
    node.classList.add('visible');
    if (matchMedia('(min-width: 700px)').matches) {
      node.querySelector('.modal-body input:not([type="file"]), .modal-body select, .modal-body textarea')?.focus({preventScroll:true});
    }
  });
  return node;
}
function closeModal(options = {}) {
  const node = document.querySelector('[data-modal-backdrop]');
  if (!node || interactionState.modalClosing) return;
  interactionState.modalClosing = true;
  const finish = () => {
    document.getElementById('modalRoot').innerHTML='';
    document.body.style.overflow='';
    document.body.classList.remove('sheet-open');
    interactionState.modalClosing = false;
  };
  if (options.immediate || prefersReducedMotion()) return finish();
  node.classList.add('closing');
  node.querySelector('[data-sheet]')?.classList.add('closing');
  setTimeout(finish, 230);
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
  return `<div class="photo-grid" id="photoGrid">${photos.map((p,i)=>`<div class="photo-thumb"><img src="${p}" alt="Фото ${i+1}"><button type="button" class="photo-remove" data-remove-photo="${i}" aria-label="Удалить фото">${icon('close')}</button></div>`).join('')}${photos.length<3?`<label class="photo-add">${icon('camera')}<input type="file" id="photoInput" accept="image/*" multiple></label>`:''}</div><div class="field-help">До 3 фотографий. Они сжимаются и сохраняются только на устройстве.</div>`;
}
async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Выбранный файл не является изображением');
  const fallback = () => new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.readAsDataURL(file); });
  try {
    let bitmap;
    if ('createImageBitmap' in window) bitmap = await createImageBitmap(file);
    else {
      const url=URL.createObjectURL(file); const img=new Image();
      await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url;});
      bitmap=img; URL.revokeObjectURL(url);
    }
    const max=1600, scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg',.76);
  } catch { return fallback(); }
}
async function handlePhotoFiles(files, photos, rerender) {
  for (const file of [...files].slice(0,3-photos.length)) {
    try { photos.push(await compressImage(file)); } catch(e) { toast(e.message || 'Не удалось обработать фото'); }
  }
  rerender();
}

function openEntryForm(existing = null) {
  const photos = [...(existing?.photos || [])];
  const body = `<form id="entryForm">
    ${eventSelectField(existing?.eventId)}
    <div class="form-grid two"><div class="field"><label class="required" for="entryType">Тип</label><select id="entryType" required>${optionsHtml(ENTRY_TYPES,existing?.type||'Неисправность')}</select></div><div class="field"><label class="required" for="entryObject">Объект</label><select id="entryObject" required>${optionsHtml(OBJECTS,existing?.object||'КПП-1')}</select></div></div>
    <div class="field"><label for="entryEquipment">Оборудование или рабочее место</label><input id="entryEquipment" value="${esc(existing?.equipment||'')}" placeholder="Например: турникет №3"></div>
    <div class="field"><label class="required" for="entryDescription">Описание</label><textarea id="entryDescription" required placeholder="Что произошло и что было сделано">${esc(existing?.description||'')}</textarea><div class="field-help">Можно использовать диктовку клавиатуры iPhone.</div></div>
    <div class="form-grid two"><div class="field"><label class="required" for="entryStatus">Статус</label><select id="entryStatus" required>${optionsHtml(ENTRY_STATUSES,existing?.status||'Информация')}</select></div><div class="field"><label class="required" for="entryDate">Дата и время</label><input id="entryDate" type="datetime-local" required value="${localDateTimeValue(existing?.date?new Date(existing.date):new Date())}"></div></div>
    <div class="field"><label>Фотографии</label><div id="entryPhotos">${photoPickerHtml(photos)}</div></div>
    ${!existing?.id?`<div class="card toggle-card"><div class="toggle-row"><div class="toggle-copy"><strong>Создать связанную задачу</strong><span>Напомнить о повторной проверке</span></div><button type="button" class="switch" id="linkedTaskSwitch" aria-label="Создать задачу"></button></div><div id="linkedTaskFields" hidden><div class="form-grid two nested-grid"><div class="field"><label for="linkedDue">Срок</label><input type="datetime-local" id="linkedDue"></div><div class="field"><label for="linkedPriority">Приоритет</label><select id="linkedPriority">${optionsHtml(PRIORITIES,'Обычный')}</select></div></div></div></div>`:''}
    ${existing?.id?`<button type="button" class="button danger full" data-delete-entry="${esc(existing.id)}">${icon('trash')}Удалить запись</button>`:''}
  </form>`;
  const node = openModal(existing?.id?'Редактировать запись':'Новая запись', body, { actionHtml:'<button class="text-button" id="saveEntry">Сохранить</button>' });
  const renderPhotos = () => {
    node.querySelector('#entryPhotos').innerHTML = photoPickerHtml(photos);
    const input=node.querySelector('#photoInput'); if(input) input.addEventListener('change',e=>handlePhotoFiles(e.target.files,photos,renderPhotos));
    node.querySelectorAll('[data-remove-photo]').forEach(b=>b.addEventListener('click',()=>{photos.splice(Number(b.dataset.removePhoto),1);renderPhotos();}));
  };
  renderPhotos();
  const sw=node.querySelector('#linkedTaskSwitch');
  if(sw) sw.addEventListener('click',()=>{sw.classList.toggle('on');node.querySelector('#linkedTaskFields').hidden=!sw.classList.contains('on');});
  node.querySelector('#saveEntry').addEventListener('click',async()=>{
    const form=node.querySelector('#entryForm'); if(!form.reportValidity()) return;
    const record={
      id:existing?.id||uid('entry'), type:node.querySelector('#entryType').value, object:node.querySelector('#entryObject').value,
      equipment:node.querySelector('#entryEquipment').value.trim(), description:node.querySelector('#entryDescription').value.trim(),
      status:node.querySelector('#entryStatus').value, date:new Date(node.querySelector('#entryDate').value).toISOString(), eventId:node.querySelector('#linkedEvent')?.value||null, photos,
      createdAt:existing?.createdAt||nowISO(), updatedAt:nowISO(), sample:existing?.sample||false
    };
    await dbPut('entries',record);
    if(!existing?.id && sw?.classList.contains('on')) {
      await dbPut('tasks',{id:uid('task'),title:`${record.object}${record.equipment?` · ${record.equipment}`:''}: ${record.status}`,object:record.object,description:record.description,dueAt:node.querySelector('#linkedDue').value?new Date(node.querySelector('#linkedDue').value).toISOString():null,priority:node.querySelector('#linkedPriority').value,completed:false,eventId:record.eventId||null,linkedEntryId:record.id,createdAt:nowISO(),updatedAt:nowISO()});
    }
    closeModal();toast(existing?.id?'Запись обновлена':'Запись сохранена');await render();
  });
  node.querySelector('[data-delete-entry]')?.addEventListener('click',()=>confirmModal('Удалить запись?','Фотографии и связанные данные записи будут удалены.','Удалить',async()=>{await dbDelete('entries',existing.id);closeModal();toast('Запись удалена');await render();},true));
}

function openEntryDetail(id) {
  const e=state.data.entries.find(x=>x.id===id); if(!e)return;
  const photos=e.photos||[];
  const node=openModal('Запись журнала',`<div class="detail-hero"><span class="status-pill ${statusTone(e.status)}">${esc(e.status)}</span><h3 class="detail-title">${esc(e.equipment||e.type)}</h3><div class="detail-meta">${esc(e.object)} · ${formatFullDate(e.date)}</div><div class="detail-grid"><div class="detail-field"><div class="detail-field-label">Тип</div><div class="detail-field-value">${esc(e.type)}</div></div><div class="detail-field"><div class="detail-field-label">Описание</div><div class="detail-field-value">${nl2br(e.description)}</div></div></div></div>${photos.length?`<div class="modal-section"><h3 class="modal-section-title">Фотографии</h3><div class="photo-gallery">${photos.map(p=>`<img src="${p}" alt="Фото записи">`).join('')}</div></div>`:''}<div class="button-row"><button class="button" id="editEntry">${icon('edit')}Редактировать</button><button class="button" id="taskFromEntry">${icon('task')}Создать задачу</button></div>`);
  node.querySelector('#editEntry').addEventListener('click',()=>{closeModal();openEntryForm(e);});
  node.querySelector('#taskFromEntry').addEventListener('click',()=>{closeModal();openTaskForm({object:e.object,description:e.description,eventId:e.eventId||null,linkedEntryId:e.id,title:`${e.equipment||e.type}: ${e.status}`});});
}

function openTaskForm(existing = null) {
  const preset=existing||{};
  const body=`<form id="taskForm">${eventSelectField(preset.eventId)}<div class="field"><label class="required" for="taskTitle">Название</label><input id="taskTitle" required value="${esc(preset.title||'')}" placeholder="Что нужно сделать"></div><div class="form-grid two"><div class="field"><label for="taskObject">Объект</label><select id="taskObject"><option value="">Без объекта</option>${optionsHtml(OBJECTS,preset.object||'')}</select></div><div class="field"><label for="taskPriority">Приоритет</label><select id="taskPriority">${optionsHtml(PRIORITIES,preset.priority||'Обычный')}</select></div></div><div class="field"><label for="taskDue">Срок</label><input id="taskDue" type="datetime-local" value="${preset.dueAt?localDateTimeValue(new Date(preset.dueAt)):''}"></div><div class="field"><label for="taskDescription">Подробности</label><textarea id="taskDescription" placeholder="Дополнительная информация">${esc(preset.description||'')}</textarea></div>${preset.id?`<button type="button" class="button danger full" data-delete-task="${esc(preset.id)}">${icon('trash')}Удалить задачу</button>`:''}</form>`;
  const node=openModal(preset.id?'Редактировать задачу':'Новая задача',body,{actionHtml:'<button class="text-button" id="saveTask">Сохранить</button>'});
  node.querySelector('#saveTask').addEventListener('click',async()=>{
    const form=node.querySelector('#taskForm');if(!form.reportValidity())return;
    await dbPut('tasks',{id:preset.id||uid('task'),title:node.querySelector('#taskTitle').value.trim(),object:node.querySelector('#taskObject').value,priority:node.querySelector('#taskPriority').value,dueAt:node.querySelector('#taskDue').value?new Date(node.querySelector('#taskDue').value).toISOString():null,description:node.querySelector('#taskDescription').value.trim(),completed:preset.completed||false,completedAt:preset.completedAt||null,eventId:node.querySelector('#linkedEvent')?.value||null,linkedEntryId:preset.linkedEntryId||null,createdAt:preset.createdAt||nowISO(),updatedAt:nowISO(),sample:preset.sample||false});
    closeModal();toast(preset.id?'Задача обновлена':'Задача создана');await render();
  });
  node.querySelector('[data-delete-task]')?.addEventListener('click',()=>confirmModal('Удалить задачу?','Задача будет удалена без возможности восстановления.','Удалить',async()=>{await dbDelete('tasks',preset.id);closeModal();toast('Задача удалена');await render();},true));
}
function openTaskDetail(id) {
  const t=state.data.tasks.find(x=>x.id===id);if(!t)return;
  const node=openModal('Задача',`<div class="detail-hero"><span class="status-pill ${t.completed?'success':isOverdue(t)?'danger':statusTone(t.priority)}">${t.completed?'Выполнена':isOverdue(t)?'Просрочено':esc(t.priority)}</span><h3 class="detail-title">${esc(t.title)}</h3><div class="detail-meta">${esc(t.object||'Без объекта')} · ${t.dueAt?formatFullDate(t.dueAt):'Без срока'}</div><div class="detail-grid">${t.description?`<div class="detail-field"><div class="detail-field-label">Подробности</div><div class="detail-field-value">${nl2br(t.description)}</div></div>`:''}</div></div><div class="button-row"><button class="button primary" id="toggleTaskDetail">${icon(t.completed?'clock':'check')}${t.completed?'Вернуть в работу':'Выполнить'}</button><button class="button" id="editTask">${icon('edit')}Изменить</button></div>`);
  node.querySelector('#toggleTaskDetail').addEventListener('click',async()=>{t.completed=!t.completed;t.completedAt=t.completed?nowISO():null;t.updatedAt=nowISO();await dbPut('tasks',t);closeModal();toast(t.completed?'Задача выполнена':'Задача возвращена');await render();});
  node.querySelector('#editTask').addEventListener('click',()=>{closeModal();openTaskForm(t);});
}

function openInspectionForm(existing = null) {
  const photos=[...(existing?.photos||[])];
  const values=existing?.items?.map(x=>({...x}))||INSPECTION_ITEMS.map(name=>({name,status:'skip'}));
  const checklist=()=>`<div class="checklist">${values.map((item,i)=>`<div class="check-row"><div class="check-label">${esc(item.name)}</div><div class="check-options">${[['good','Исправно'],['issue','Замечание'],['skip','Не проверено']].map(([v,l])=>`<button type="button" class="check-option ${item.status===v?`active ${v}`:''}" data-check-index="${i}" data-check-value="${v}">${l}</button>`).join('')}</div></div>`).join('')}</div>`;
  const body=`<form id="inspectionForm">${eventSelectField(existing?.eventId)}<div class="form-grid two"><div class="field"><label class="required" for="inspectionObject">Объект</label><select id="inspectionObject" required>${optionsHtml(OBJECTS,existing?.object||'КПП-1')}</select></div><div class="field"><label class="required" for="inspectionDate">Дата и время</label><input id="inspectionDate" type="datetime-local" required value="${localDateTimeValue(existing?.date?new Date(existing.date):new Date())}"></div></div><div class="field"><label class="required" for="inspectionEquipment">Оборудование</label><input id="inspectionEquipment" required value="${esc(existing?.equipment||'')}" placeholder="Например: турникеты №1–8"></div><div class="field"><label>Чек-лист</label><div id="inspectionChecklist">${checklist()}</div></div><div class="field"><label for="inspectionConclusion">Заключение и замечания</label><textarea id="inspectionConclusion" placeholder="Опишите обнаруженные недостатки и выполненные действия">${esc(existing?.conclusion||'')}</textarea></div><div class="field"><label>Фотографии</label><div id="inspectionPhotos">${photoPickerHtml(photos)}</div></div><div class="card toggle-card"><div class="toggle-row"><div class="toggle-copy"><strong>Создать задачу по замечаниям</strong><span>Доступно, если есть замечания</span></div><button type="button" class="switch" id="inspectionTaskSwitch"></button></div></div>${existing?`<button type="button" class="button danger full" data-delete-inspection="${esc(existing.id)}">${icon('trash')}Удалить осмотр</button>`:''}</form>`;
  const node=openModal(existing?'Редактировать осмотр':'Новый техосмотр',body,{actionHtml:'<button class="text-button" id="saveInspection">Сохранить</button>'});
  const bindChecks=()=>node.querySelectorAll('[data-check-index]').forEach(btn=>btn.addEventListener('click',()=>{values[Number(btn.dataset.checkIndex)].status=btn.dataset.checkValue;node.querySelector('#inspectionChecklist').innerHTML=checklist();bindChecks();}));bindChecks();
  const renderPhotos=()=>{node.querySelector('#inspectionPhotos').innerHTML=photoPickerHtml(photos);node.querySelector('#photoInput')?.addEventListener('change',e=>handlePhotoFiles(e.target.files,photos,renderPhotos));node.querySelectorAll('[data-remove-photo]').forEach(b=>b.addEventListener('click',()=>{photos.splice(Number(b.dataset.removePhoto),1);renderPhotos();}));};renderPhotos();
  const sw=node.querySelector('#inspectionTaskSwitch');sw.addEventListener('click',()=>sw.classList.toggle('on'));
  node.querySelector('#saveInspection').addEventListener('click',async()=>{
    const form=node.querySelector('#inspectionForm');if(!form.reportValidity())return;
    const record={id:existing?.id||uid('inspection'),object:node.querySelector('#inspectionObject').value,equipment:node.querySelector('#inspectionEquipment').value.trim(),date:new Date(node.querySelector('#inspectionDate').value).toISOString(),eventId:node.querySelector('#linkedEvent')?.value||null,items:values,conclusion:node.querySelector('#inspectionConclusion').value.trim(),photos,createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO(),sample:existing?.sample||false};
    await dbPut('inspections',record);
    const issues=values.filter(x=>x.status==='issue');
    if(sw.classList.contains('on')&&issues.length) await dbPut('tasks',{id:uid('task'),title:`Устранить замечания: ${record.equipment}`,object:record.object,priority:'Важный',dueAt:null,description:`Замечания: ${issues.map(x=>x.name).join(', ')}.${record.conclusion?`\n${record.conclusion}`:''}`,completed:false,eventId:record.eventId||null,linkedInspectionId:record.id,createdAt:nowISO(),updatedAt:nowISO()});
    closeModal();toast(existing?'Осмотр обновлён':'Техосмотр сохранён');await render();
  });
  node.querySelector('[data-delete-inspection]')?.addEventListener('click',()=>confirmModal('Удалить техосмотр?','Запись техосмотра и его фотографии будут удалены.','Удалить',async()=>{await dbDelete('inspections',existing.id);closeModal();toast('Осмотр удалён');await render();},true));
}
function openInspectionDetail(id) {
  const i=state.data.inspections.find(x=>x.id===id);if(!i)return;
  const issues=i.items.filter(x=>x.status==='issue');
  const node=openModal('Техосмотр',`<div class="detail-hero"><span class="status-pill ${issues.length?'warning':'success'}">${issues.length?`${issues.length} замечаний`:'Нарушений нет'}</span><h3 class="detail-title">${esc(i.equipment)}</h3><div class="detail-meta">${esc(i.object)} · ${formatFullDate(i.date)}</div></div><div class="modal-section"><h3 class="modal-section-title">Результаты</h3><div class="list-card">${i.items.map(x=>`<div class="list-row"><span class="row-icon ${x.status==='good'?'success':x.status==='issue'?'warning':''}">${icon(x.status==='good'?'check':x.status==='issue'?'alert':'more')}</span><span class="list-row-main"><span class="list-row-title">${esc(x.name)}</span><span class="list-row-meta">${x.status==='good'?'Исправно':x.status==='issue'?'Замечание':'Не проверено'}</span></span></div>`).join('')}</div></div>${i.conclusion?`<div class="detail-field"><div class="detail-field-label">Заключение</div><div class="detail-field-value">${nl2br(i.conclusion)}</div></div>`:''}${i.photos?.length?`<div class="modal-section"><h3 class="modal-section-title">Фотографии</h3><div class="photo-gallery">${i.photos.map(p=>`<img src="${p}" alt="Фото техосмотра">`).join('')}</div></div>`:''}<button class="button full" id="editInspection">${icon('edit')}Редактировать</button>`);
  node.querySelector('#editInspection').addEventListener('click',()=>{closeModal();openInspectionForm(i);});
}

function openEquipmentForm(existing = null) {
  const e=existing||{};
  const body=`<form id="equipmentForm"><div class="field"><label class="required" for="equipmentName">Название</label><input id="equipmentName" required value="${esc(e.name||'')}" placeholder="Например: Турникет КПП-1 №3"></div><div class="form-grid two"><div class="field"><label for="equipmentType">Тип</label><input id="equipmentType" value="${esc(e.type||'')}" placeholder="Турникет, касса, сервер"></div><div class="field"><label for="equipmentObject">Объект</label><select id="equipmentObject"><option value="">Без объекта</option>${optionsHtml(OBJECTS,e.object||'')}</select></div><div class="field"><label for="equipmentDesignation">Номер / обозначение</label><input id="equipmentDesignation" value="${esc(e.designation||'')}" placeholder="Т-03"></div><div class="field"><label for="equipmentStatus">Статус</label><select id="equipmentStatus">${optionsHtml(EQUIPMENT_STATUSES,e.status||'Работает')}</select></div><div class="field"><label for="equipmentIp">IP-адрес</label><input id="equipmentIp" inputmode="decimal" value="${esc(e.ip||'')}" placeholder="192.168.0.10"></div><div class="field"><label for="equipmentSerial">Серийный номер</label><input id="equipmentSerial" value="${esc(e.serial||'')}"></div></div><div class="field"><label for="equipmentNote">Заметка</label><textarea id="equipmentNote">${esc(e.note||'')}</textarea></div>${e.id?`<button type="button" class="button danger full" data-delete-equipment="${esc(e.id)}">${icon('trash')}Удалить оборудование</button>`:''}</form>`;
  const node=openModal(e.id?'Редактировать':'Новое оборудование',body,{actionHtml:'<button class="text-button" id="saveEquipment">Сохранить</button>'});
  node.querySelector('#saveEquipment').addEventListener('click',async()=>{const form=node.querySelector('#equipmentForm');if(!form.reportValidity())return;await dbPut('equipment',{id:e.id||uid('equipment'),name:node.querySelector('#equipmentName').value.trim(),type:node.querySelector('#equipmentType').value.trim(),object:node.querySelector('#equipmentObject').value,designation:node.querySelector('#equipmentDesignation').value.trim(),status:node.querySelector('#equipmentStatus').value,ip:node.querySelector('#equipmentIp').value.trim(),serial:node.querySelector('#equipmentSerial').value.trim(),note:node.querySelector('#equipmentNote').value.trim(),createdAt:e.createdAt||nowISO(),updatedAt:nowISO(),sample:e.sample||false});closeModal();toast(e.id?'Оборудование обновлено':'Оборудование добавлено');await render();});
  node.querySelector('[data-delete-equipment]')?.addEventListener('click',()=>confirmModal('Удалить оборудование?','Карточка будет удалена. Записи журнала и осмотры останутся.','Удалить',async()=>{await dbDelete('equipment',e.id);closeModal();toast('Оборудование удалено');await render();},true));
}
function openEquipmentDetail(id) {
  const e=state.data.equipment.find(x=>x.id===id);if(!e)return;
  const needle=(e.designation||e.name).toLowerCase();
  const history=state.data.entries.filter(x=>`${x.equipment} ${x.description}`.toLowerCase().includes(needle));
  const inspections=state.data.inspections.filter(x=>x.equipment.toLowerCase().includes(needle));
  const node=openModal('Оборудование',`<div class="detail-hero"><span class="status-pill ${statusTone(e.status)}">${esc(e.status)}</span><h3 class="detail-title">${esc(e.name)}</h3><div class="detail-meta">${esc(e.object||'Без объекта')} · ${esc(e.type||'Тип не указан')}</div><div class="detail-grid">${e.designation?`<div class="detail-field"><div class="detail-field-label">Обозначение</div><div class="detail-field-value">${esc(e.designation)}</div></div>`:''}${e.ip?`<div class="detail-field"><div class="detail-field-label">IP-адрес</div><div class="detail-field-value">${esc(e.ip)}</div></div>`:''}${e.serial?`<div class="detail-field"><div class="detail-field-label">Серийный номер</div><div class="detail-field-value">${esc(e.serial)}</div></div>`:''}${e.note?`<div class="detail-field"><div class="detail-field-label">Заметка</div><div class="detail-field-value">${nl2br(e.note)}</div></div>`:''}</div></div><div class="modal-section"><h3 class="modal-section-title">Связанная история</h3>${history.length||inspections.length?`<div class="list-card">${history.slice(0,5).map(entryRow).join('')}${inspections.slice(0,5).map(i=>listRow({id:i.id,action:'inspection-detail',iconName:'inspection',title:i.equipment,meta:`Техосмотр · ${formatDateTime(i.date)}`})).join('')}</div>`:emptyState('journal','История не найдена','Связь определяется по обозначению или названию оборудования.')}</div><button class="button full" id="editEquipment">${icon('edit')}Редактировать</button>`);
  node.querySelector('#editEquipment').addEventListener('click',()=>{closeModal();openEquipmentForm(e);});
  node.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>{const action=b.dataset.action,id=b.dataset.id;closeModal();if(action==='entry-detail')openEntryDetail(id);if(action==='inspection-detail')openInspectionDetail(id);}));
}

async function exportData() {
  const data = {}; for (const store of STORE_NAMES) data[store] = await dbGetAll(store);
  const payload={app:'БПС Пульт',version:APP_VERSION,schemaVersion:SCHEMA_VERSION,exportedAt:nowISO(),data};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`bps-pult-backup-${dayKey(new Date())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Резервная копия создана');
}
async function importData(file) {
  const text=await file.text();let payload;try{payload=JSON.parse(text);}catch{throw new Error('Файл не является корректным JSON');}
  if(payload.app!=='БПС Пульт'||!payload.data||![1,2].includes(payload.schemaVersion))throw new Error('Неподдерживаемая резервная копия');
  for(const store of STORE_NAMES) await dbClear(store);
  for(const store of STORE_NAMES) for(const item of payload.data[store]||[]) await dbPut(store,item);
  toast('Данные восстановлены');await applyStoredTheme();await render();
}
async function clearAll() { for(const store of STORE_NAMES)await dbClear(store);await setSetting('theme','system');await applyStoredTheme();toast('Все данные удалены');await render(); }
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
    inspections:[{id:'sample_inspection_1',object:'КПП-1',equipment:'Турникеты №1–8',date:yesterday.toISOString(),items:INSPECTION_ITEMS.map(name=>({name,status:'good'})),conclusion:'Нарушений не обнаружено.',photos:[],createdAt:nowISO(),updatedAt:nowISO(),sample:true}]
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
  for(const [store,items] of Object.entries(samples))for(const item of items)await dbPut(store,item);toast('Примеры добавлены');await render();
}
async function removeSamples() {
  for(const store of ['entries','tasks','inspections','equipment','events']) { const all=await dbGetAll(store);for(const item of all.filter(x=>x.sample))await dbDelete(store,item.id); }
  toast('Примеры удалены');await render();
}


function openClearDataModal() {
  const node = openModal('Удалить все данные', `<div class="warning-box spaced-bottom">Будут безвозвратно удалены все мероприятия, записи, задачи, техосмотры, оборудование и фотографии.</div><div class="field"><label for="clearPhrase">Для подтверждения напишите УДАЛИТЬ</label><input id="clearPhrase" autocomplete="off" autocapitalize="characters" placeholder="УДАЛИТЬ"></div><button class="button danger full" id="clearEverything" disabled>${icon('trash')}Удалить всё</button>`);
  const input = node.querySelector('#clearPhrase');
  const button = node.querySelector('#clearEverything');
  input.addEventListener('input', () => { button.disabled = input.value.trim().toUpperCase() !== 'УДАЛИТЬ'; });
  button.addEventListener('click', async () => { await clearAll(); closeModal(); });
}

async function handleAppAction(action, id) {
  if(action==='new-event')openEventForm();
  else if(action==='event-detail')openEventDetail(id);
  else if(action==='edit-event'){const item=state.data.events.find(x=>x.id===id);if(item)openEventForm(item);}
  else if(action==='duplicate-event'){const item=state.data.events.find(x=>x.id===id);if(item)duplicateEvent(item);}
  else if(action==='delete-event')confirmModal('Удалить мероприятие?','Конфигурация и чек-лист мероприятия будут удалены. Связанные записи и задачи останутся.','Удалить',async()=>{await dbDelete('events',id);toast('Мероприятие удалено');await render();},true);
  else if(action==='new-entry')openEntryForm();
  else if(action==='new-task')openTaskForm();
  else if(action==='new-inspection')openInspectionForm();
  else if(action==='new-equipment')openEquipmentForm();
  else if(action==='entry-detail')openEntryDetail(id);
  else if(action==='task-detail')openTaskDetail(id);
  else if(action==='inspection-detail')openInspectionDetail(id);
  else if(action==='equipment-detail')openEquipmentDetail(id);
  else if(action==='edit-entry'){const item=state.data.entries.find(x=>x.id===id);if(item)openEntryForm(item);}
  else if(action==='edit-task'){const item=state.data.tasks.find(x=>x.id===id);if(item)openTaskForm(item);}
  else if(action==='edit-inspection'){const item=state.data.inspections.find(x=>x.id===id);if(item)openInspectionForm(item);}
  else if(action==='edit-equipment'){const item=state.data.equipment.find(x=>x.id===id);if(item)openEquipmentForm(item);}
  else if(action==='delete-entry')confirmModal('Удалить запись?','Фотографии и связанные данные записи будут удалены.','Удалить',async()=>{await dbDelete('entries',id);toast('Запись удалена');await render();},true);
  else if(action==='delete-inspection')confirmModal('Удалить техосмотр?','Запись техосмотра и фотографии будут удалены.','Удалить',async()=>{await dbDelete('inspections',id);toast('Осмотр удалён');await render();},true);
  else if(action==='delete-equipment')confirmModal('Удалить оборудование?','Карточка будет удалена. Журнал и осмотры останутся.','Удалить',async()=>{await dbDelete('equipment',id);toast('Оборудование удалено');await render();},true);
  else if(action==='route')go(id);
  else if(action==='toggle-task'){const t=state.data.tasks.find(x=>x.id===id);if(t){t.completed=!t.completed;t.completedAt=t.completed?nowISO():null;t.updatedAt=nowISO();await dbPut('tasks',t);toast(t.completed?'Задача выполнена':'Задача возвращена');await render();}}
  else if(action==='copy-report'){await navigator.clipboard.writeText(buildDailyReport());toast('Отчёт скопирован');}
  else if(action==='share-report'){const text=buildDailyReport();if(navigator.share)await navigator.share({title:'Итоги рабочего дня',text});else{await navigator.clipboard.writeText(text);toast('Web Share недоступен — текст скопирован');}}
  else if(action==='export-data')await exportData();
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
    if(!['tasks','events','equipment','report','settings','install'].includes(state.route))return;
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
  const q=main.querySelector('#journalSearch');if(q)q.addEventListener('input',debounce(()=>{state.journal.query=q.value;render();},180));
  [['journalType','type'],['journalObject','object'],['journalStatus','status'],['journalPeriod','period']].forEach(([id,key])=>main.querySelector(`#${id}`)?.addEventListener('change',e=>{state.journal[key]=e.target.value;render();}));
  main.querySelectorAll('[data-task-filter]').forEach(b=>b.addEventListener('click',()=>{state.taskFilter=b.dataset.taskFilter;render();}));
  main.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',async()=>{await setSetting('theme',b.dataset.themeChoice);setTheme(b.dataset.themeChoice);render();}));
  main.querySelector('#importInput')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;confirmModal('Импортировать данные?','Текущие локальные данные будут полностью заменены содержимым резервной копии.','Импортировать',async()=>{try{await importData(file);}catch(err){toast(err.message||'Ошибка импорта');}},false);});
}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}

async function applyStoredTheme(){const theme=await getSetting('theme','system');setTheme(theme);}
async function init(){
  if(!('indexedDB' in window)){document.getElementById('appMain').innerHTML=emptyState('alert','IndexedDB недоступна','Этот браузер не поддерживает локальную базу данных. Откройте приложение в Safari.');return;}
  await openDatabase();await applyStoredTheme();
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  document.getElementById('themeQuickBtn').addEventListener('click',cycleTheme);
  document.querySelectorAll('.nav-button').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.route)));
  document.getElementById('recordButton').addEventListener('click',()=>openEntryForm());
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  document.addEventListener('pointerdown',e=>{if(interactionState.openSwipeRow&&!e.target.closest('[data-swipe-row]'))closeOpenSwipeRow();});
  bindEdgeBackGesture();
  addEventListener('hashchange',render);addEventListener('online',updateOnlineStatus);addEventListener('offline',updateOnlineStatus);updateOnlineStatus();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',async()=>{if(await getSetting('theme','system')==='system'){setTheme('system');}});
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js',{scope:'./'});}catch(e){console.warn('Service worker registration failed',e);}}
  await render();
}

document.addEventListener('DOMContentLoaded',init);
