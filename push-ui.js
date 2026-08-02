(() => {
  'use strict';

  const PREFS_KEY = 'bps-push-preferences-v1';
  const DEFAULTS = Object.freeze({ taskLeadMinutes: 60, eventLeadHours: 24, doorsLeadMinutes: 60, backupDays: 14 });
  let syncTimer = null;
  let syncRunning = null;

  const readPrefs = () => {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}) }; }
    catch (_) { return { ...DEFAULTS }; }
  };
  const savePrefs = value => localStorage.setItem(PREFS_KEY, JSON.stringify(value));
  const safeState = () => window.BpsPush?.state?.() || { supported:false, standalone:false, permission:'unsupported', paired:false, scheduledCount:0 };
  const escLocal = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  function statusInfo(snapshot) {
    if (!snapshot.supported) return ['danger','Не поддерживается','На этом устройстве Web Push недоступен.'];
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !snapshot.standalone) return ['warning','Откройте с экрана «Домой»','В Safari-вкладке iPhone системные push не подключаются.'];
    if (snapshot.permission === 'denied') return ['danger','Запрещены в iOS','Разрешите уведомления в системных настройках iPhone.'];
    if (snapshot.paired && snapshot.permission === 'granted') return ['success','Подключены',`${snapshot.scheduledCount || 0} плановых уведомлений.`];
    return ['warning','Не подключены','Введите код подключения, сохранённый в Cloudflare.'];
  }

  function notificationSection() {
    const snapshot = safeState();
    const [tone,label,detail] = statusInfo(snapshot);
    const prefs = readPrefs();
    const options = (values,current) => values.map(([value,text]) => `<option value="${value}" ${Number(current)===value?'selected':''}>${text}</option>`).join('');
    const canEnable = snapshot.supported && snapshot.permission !== 'denied' && !snapshot.paired;
    return `<section class="section" id="pushSettingsSection">
      <div class="section-head"><div><h2 class="section-title">Уведомления</h2><p class="section-subtitle">Системные push через Cloudflare Worker</p></div></div>
      <div class="card">
        <div class="notice-card"><div class="notice-icon ${tone}">${typeof icon==='function'?icon(snapshot.paired?'check':'alert'):''}</div><div><h3>${escLocal(label)}</h3><p>${escLocal(detail)}</p></div></div>
        <div class="push-settings-grid">
          <label><span>Задачи</span><select data-push-pref="taskLeadMinutes">${options([[0,'Точно в срок'],[15,'За 15 минут'],[60,'За 1 час'],[1440,'За сутки']],prefs.taskLeadMinutes)}</select></label>
          <label><span>Мероприятия</span><select data-push-pref="eventLeadHours">${options([[3,'За 3 часа'],[12,'За 12 часов'],[24,'За сутки'],[48,'За 2 суток']],prefs.eventLeadHours)}</select></label>
          <label><span>Открытие входов</span><select data-push-pref="doorsLeadMinutes">${options([[15,'За 15 минут'],[30,'За 30 минут'],[60,'За 1 час'],[120,'За 2 часа']],prefs.doorsLeadMinutes)}</select></label>
          <label><span>Резервная копия</span><select data-push-pref="backupDays">${options([[7,'Через 7 дней'],[14,'Через 14 дней'],[30,'Через 30 дней']],prefs.backupDays)}</select></label>
        </div>
        <div class="button-stack spaced-top">
          ${canEnable?'<button class="button primary full" data-push-action="enable">Включить уведомления</button>':''}
          ${snapshot.paired?'<button class="button full" data-push-action="test">Отправить тестовое</button><button class="button full" data-push-action="test-delayed">Тест через 2 минуты</button><button class="button full" data-push-action="sync">Синхронизировать расписание</button><button class="button danger full" data-push-action="disable">Отключить уведомления</button>':''}
        </div>
        <p class="settings-note">Ошибки сервера уведомлений не блокируют работу приложения и не изменяют локальные данные.</p>
        <p class="settings-note">При включении наружу уходят только данные, необходимые для уведомлений; рабочие записи и фотографии не отправляются. <a href="./PUSH-PRIVACY.md" target="_blank" rel="noopener">Подробнее о приватности</a></p>
      </div>
    </section>`;
  }

  function injectSettings(html) {
    const section = notificationSection();
    const marker = '<section class="section"><div class="section-head"><div><h2 class="section-title">Локальное хранилище';
    return html.includes(marker) ? html.replace(marker, `${section}${marker}`) : `${section}${html}`;
  }

  if (typeof renderSettings === 'function') {
    const originalRenderSettings = renderSettings;
    renderSettings = async function(...args) {
      return injectSettings(await originalRenderSettings(...args));
    };
  }

  function combineDateAndTime(dateValue, timeValue) {
    const date = new Date(dateValue);
    const match = String(timeValue || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!Number.isFinite(date.getTime()) || !match) return null;
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date;
  }
  function futureRun(target, leadMs) {
    const timestamp = target instanceof Date ? target.getTime() : new Date(target).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now() + 60000) return null;
    const preferred = timestamp - Math.max(0, leadMs);
    return new Date(preferred > Date.now() + 60000 ? preferred : timestamp);
  }

  async function desiredNotifications() {
    if (typeof refreshData === 'function') await refreshData();
    const prefs = readPrefs();
    const items = [];
    for (const task of state?.data?.tasks || []) {
      if (task.completed || !task.dueAt) continue;
      const runAt = futureRun(task.dueAt, Number(prefs.taskLeadMinutes) * 60000);
      if (!runAt) continue;
      items.push({ key:`task:${task.id}`, payload:{ localId:task.id, type:'task_due', title:'Напоминание о задаче', body:task.title, runAt, url:'./#tasks', tag:`task-${task.id}` } });
    }
    for (const event of state?.data?.events || []) {
      if (event.status === 'completed' || !event.date) continue;
      const eventRun = futureRun(event.date, Number(prefs.eventLeadHours) * 3600000);
      if (eventRun) items.push({ key:`event:${event.id}`, payload:{ localId:event.id, type:'event_start', title:'Приближается мероприятие', body:`${event.name}. Проверьте готовность БПС.`, runAt:eventRun, url:'./#events', tag:`event-${event.id}` } });
      const doorsAt = combineDateAndTime(event.date, event.doorsOpenAt);
      const doorsRun = doorsAt && futureRun(doorsAt, Number(prefs.doorsLeadMinutes) * 60000);
      if (doorsRun) items.push({ key:`event:${event.id}:doors`, payload:{ localId:event.id, type:'event_doors', title:'Скоро открытие входов', body:event.name, runAt:doorsRun, url:'./#events', tag:`event-${event.id}-doors` } });
    }
    if (typeof getSetting === 'function' && typeof setSetting === 'function') {
      const lastBackup = await getSetting('lastBackupAt', null);
      let base = lastBackup || await getSetting('pushBackupBaseAt', null);
      if (!base) { base = new Date().toISOString(); await setSetting('pushBackupBaseAt', base); }
      const due = new Date(new Date(base).getTime() + Number(prefs.backupDays) * 86400000);
      const runAt = futureRun(due, 0);
      if (runAt) items.push({ key:'backup:due', payload:{ localId:'backup', type:'backup_due', title:'Создайте резервную копию', body:`Архив не создавался ${prefs.backupDays} дней.`, runAt, url:'./#settings', tag:'bps-backup' } });
    }
    return items;
  }

  async function syncNotifications({ announce = false } = {}) {
    if (syncRunning) return syncRunning;
    syncRunning = (async () => {
      const snapshot = safeState();
      if (!snapshot.paired || snapshot.permission !== 'granted' || !navigator.onLine) return { skipped:true };
      await BpsPush.syncSubscription().catch(() => false);
      const result = await BpsPush.reconcile(await desiredNotifications());
      if (announce && typeof toast === 'function') toast('Расписание уведомлений обновлено');
      return result;
    })();
    try { return await syncRunning; }
    catch (error) { if (announce && typeof toast === 'function') toast(error.message || 'Не удалось синхронизировать уведомления'); else console.warn('Push sync failed', error); return { skipped:true, error }; }
    finally { syncRunning = null; }
  }
  function scheduleSync(delay = 1200) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNotifications(), delay);
  }

  if (typeof render === 'function') {
    const originalRender = render;
    render = async function(...args) {
      const result = await originalRender(...args);
      scheduleSync();
      return result;
    };
  }

  function openEnableModal() {
    if (typeof openModal !== 'function') {
      const code = prompt('Введите PAIRING_CODE');
      if (code) void enableWithCode(code);
      return;
    }
    const node = openModal('Подключить уведомления', `<form id="pushConnectForm"><div class="field"><label for="pushPairingCode">Код подключения</label><input id="pushPairingCode" type="password" required autocomplete="one-time-code" autocapitalize="off" spellcheck="false" placeholder="PAIRING_CODE"></div><div id="pushConnectError" class="field-error" hidden></div></form>`, { actionHtml:'<button class="text-button" id="pushConnectButton">Подключить</button>' });
    const input = node.querySelector('#pushPairingCode');
    const button = node.querySelector('#pushConnectButton');
    const errorBox = node.querySelector('#pushConnectError');
    button?.addEventListener('click', async () => {
      if (!node.querySelector('#pushConnectForm')?.reportValidity()) return;
      button.disabled = true; button.textContent = 'Подключение…'; errorBox.hidden = true;
      try { await enableWithCode(input.value); closeModal({ immediate:true }); }
      catch (error) { errorBox.textContent = error.message || 'Не удалось подключить'; errorBox.hidden = false; button.disabled = false; button.textContent = 'Подключить'; }
    });
    setTimeout(() => input?.focus({ preventScroll:true }), 200);
  }
  async function enableWithCode(code) {
    await BpsPush.enable(code);
    await syncNotifications();
    if (typeof toast === 'function') toast('Уведомления подключены');
    if (typeof render === 'function') await render();
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-push-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.pushAction;
    if (action === 'enable') { openEnableModal(); return; }
    button.disabled = true;
    try {
      if (action === 'test') { await BpsPush.sendTest(); toast('Тестовое уведомление отправлено'); }
      else if (action === 'test-delayed') { await BpsPush.schedule({ localId:'manual-test', type:'test', title:'БПС Пульт', body:'Плановое push-уведомление работает.', runAt:new Date(Date.now()+120000), url:'./#today', tag:`manual-test-${Date.now()}` }); toast('Тест запланирован через 2 минуты'); }
      else if (action === 'sync') await syncNotifications({ announce:true });
      else if (action === 'disable') { await BpsPush.disable(); toast('Уведомления отключены'); await render(); }
    } catch (error) { if (typeof toast === 'function') toast(error.message || 'Ошибка уведомлений'); }
    finally { button.disabled = false; }
  });

  document.addEventListener('change', event => {
    const control = event.target.closest('[data-push-pref]');
    if (!control) return;
    const prefs = readPrefs();
    prefs[control.dataset.pushPref] = Number(control.value);
    savePrefs(prefs);
    scheduleSync(100);
    if (typeof toast === 'function') toast('Настройка уведомлений сохранена');
  });

  addEventListener('online', () => scheduleSync(200));
  addEventListener('bps-push-state', () => { if (typeof render === 'function' && location.hash.replace('#','') === 'settings') void render(); });
  addEventListener('DOMContentLoaded', () => scheduleSync(2500));
})();
