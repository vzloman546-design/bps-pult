'use strict';

const EVENT_TYPES = ['Матч', 'Концерт', 'Спортивное мероприятие', 'Корпоративное мероприятие', 'Другое'];
const EVENT_STATUS_LABELS = {
  planned: 'Запланировано',
  preparing: 'Подготовка',
  live: 'Проводится',
  completed: 'Завершено',
};
function eventDateInputValue(value) {
  if (!value) return localDateTimeValue(new Date());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0,16) : localDateTimeValue(parsed);
}

const CHECK_STATUS_LABELS = {
  pending: 'Не проверено',
  ok: 'Исправно',
  issue: 'Замечание',
  failed: 'Неисправно',
  na: 'Не используется',
};

function captureEventFocus(root) {
  const active = root.contains(document.activeElement) ? document.activeElement : null;
  if (!active) return null;
  return {
    id: active.id || null,
    attributes: [...active.attributes]
      .filter(attribute => attribute.name.startsWith('data-'))
      .map(attribute => ({ name:attribute.name, value:attribute.value })),
  };
}

function restoreEventFocus(root, marker) {
  if (!marker) return;
  let replacement = marker.id ? root.querySelector(`#${marker.id}`) : null;
  if (!replacement && marker.attributes.length) {
    replacement = [...root.querySelectorAll(`[${marker.attributes[0].name}]`)]
      .find(element => marker.attributes.every(attribute => element.getAttribute(attribute.name) === attribute.value));
  }
  replacement?.focus({ preventScroll:true });
}

function eventSelectField(selected = '') {
  if (!state.data.events.length) return '';
  const options = state.data.events.map(event => `<option value="${esc(event.id)}" ${event.id === selected ? 'selected' : ''}>${esc(event.name || 'Без названия')} · ${formatDate(event.date, { day:'numeric', month:'short' })}</option>`).join('');
  return `<div class="field"><label for="linkedEvent">Связанное мероприятие</label><select id="linkedEvent"><option value="">Без мероприятия</option>${options}</select></div>`;
}

function getEventById(id) {
  return state.data.events.find(event => event.id === id) || null;
}

function eventStatusTone(status) {
  if (status === 'completed') return 'success';
  if (status === 'live') return 'danger';
  if (status === 'preparing') return 'warning';
  return 'info';
}

function eventSystemSummary(event) {
  const systems = [];
  if (event.systems.bps) systems.push('БПС');
  if (event.systems.sib !== 'none') systems.push(`СИБ: ${BpsEventLogic.SIB_MODES.find(item => item.value === event.systems.sib)?.label || event.systems.sib}`);
  if (event.systems.onlineSales) systems.push('онлайн-продажи');
  if (event.systems.offlineSales) systems.push('кассы');
  return systems.join(' · ') || 'Системы не выбраны';
}

function eventRow(event) {
  const readiness = BpsEventLogic.calculateReadiness(event);
  const summary = BpsEventLogic.summarizeConfiguration(event);
  return listRow({
    id: event.id,
    action: 'event-detail',
    iconName: 'calendar',
    tone: readiness.tone,
    title: event.name || 'Без названия',
    meta: `${formatDate(event.date, { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })} · ${summary.activeGates} ${plural(summary.activeGates,'гейт','гейта','гейтов')} · ${summary.activeTurnstiles} турн.`,
    side: `<span class="status-pill ${readiness.tone}">${readiness.percent}%</span>`,
  });
}

function renderNextEventSection() {
  const now = Date.now();
  const upcoming = state.data.events
    .filter(event => event.status !== 'completed' && (['preparing','live'].includes(event.status) || new Date(event.date || 0).getTime() >= now - 6 * 60 * 60 * 1000))
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  if (!upcoming) {
    return `<section class="section"><div class="section-head"><div><h2 class="section-title">Ближайшее мероприятие</h2></div><button class="text-button" data-action="new-event">Создать</button></div><div class="quiet-state">${icon('calendar')}<span><strong>Мероприятий пока нет</strong><small>Соберите схему гейтов, турникетов, СИБ и касс</small></span></div></section>`;
  }
  const readiness = BpsEventLogic.calculateReadiness(upcoming);
  const summary = BpsEventLogic.summarizeConfiguration(upcoming);
  return `<section class="section">
    <div class="section-head"><div><h2 class="section-title">Ближайшее мероприятие</h2></div><button class="text-button" data-action="event-detail" data-id="${esc(upcoming.id)}">Открыть</button></div>
    <button class="event-next-card" data-action="event-detail" data-id="${esc(upcoming.id)}">
      <span class="event-next-top"><span><strong>${esc(upcoming.name)}</strong><small>${formatFullDate(upcoming.date)}</small></span><span class="readiness-ring ${readiness.tone}" style="--progress:${readiness.percent}"><b>${readiness.percent}</b><small>%</small></span></span>
      <span class="event-next-grid">
        <span><b>${summary.activeGates}</b><small>Открытых гейтов</small></span>
        <span><b>${summary.activeTurnstiles}</b><small>Турникетов</small></span>
        <span><b>${summary.activeCashDesks}</b><small>Касс</small></span>
      </span>
      <span class="event-next-status ${readiness.tone}">${icon(readiness.tone === 'success' ? 'check' : readiness.tone === 'danger' ? 'alert' : 'clock')} ${esc(readiness.label)}</span>
    </button>
  </section>`;
}

function renderEvents() {
  const filters = state.events || (state.events = { query:'', status:'Все статусы' });
  const query = filters.query.trim().toLocaleLowerCase('ru-RU');
  const events = state.data.events.filter(event => {
    const hay = BpsProductivity.itemSearchText('events', event, state.data).join(' ').toLocaleLowerCase('ru-RU');
    if (query && !hay.includes(query)) return false;
    if (filters.status !== 'Все статусы' && EVENT_STATUS_LABELS[event.status] !== filters.status) return false;
    return true;
  });
  const active = events.filter(event => event.status !== 'completed');
  const completed = events.filter(event => event.status === 'completed').slice().sort((a,b) => new Date(b.date)-new Date(a.date));
  const activeFilterCount = [query, filters.status !== 'Все статусы'].filter(Boolean).length;
  return `<section class="section filters"><div class="search-input-wrap">${icon('search')}<input id="eventSearch" type="search" aria-label="Поиск мероприятий" placeholder="Название, дата, гейт или ресурс" value="${esc(filters.query)}" autocomplete="off"></div><div class="filter-row">${['Все статусы',...Object.values(EVENT_STATUS_LABELS)].map(value=>`<button class="chip ${filters.status===value?'active':''}" data-event-filter="${esc(value)}">${esc(value)}</button>`).join('')}</div>${activeFilterCount?`<div class="filter-summary"><span>${activeFilterCount} ${plural(activeFilterCount,'фильтр','фильтра','фильтров')}</span><button class="text-button" data-clear-filters="events">Очистить фильтры</button></div>`:''}</section>
  <section class="section">
    <div class="section-head"><div><h2 class="section-title">${active.length} ${plural(active.length,'активное','активных','активных')}</h2><p class="section-subtitle">Конфигурация создаётся отдельно для каждого мероприятия</p></div><button class="button primary small" data-action="new-event">${icon('plus')}Создать</button></div>
    ${active.length ? `<div class="list-card">${active.map(eventRow).join('')}</div>` : emptyState('calendar',activeFilterCount?'Ничего не найдено':'Нет активных мероприятий',activeFilterCount?'Очистите фильтры или измените запрос.':'Создайте мероприятие с нуля или на основе шаблона.',activeFilterCount?'<button class="button small" data-clear-filters="events">Очистить фильтры</button>':'<button class="button primary small" data-action="new-event">Создать мероприятие</button>')}
  </section>
  ${completed.length ? `<section class="section"><div class="section-head"><div><h2 class="section-title">Завершённые</h2></div></div><div class="list-card">${completed.map(eventRow).join('')}</div></section>` : ''}`;
}

function openEventForm(existing = null) {
  if (!existing) return openEventTemplateChooser();
  return openEventEditor(BpsEventLogic.normalizeEvent(existing), true);
}

function openEventTemplateChooser() {
  const templates = BpsEventLogic.EVENT_TEMPLATES;
  const node = openModal('Новое мероприятие', `<div class="template-list">${templates.map(template => `<button class="template-card" data-template="${esc(template.id)}"><span class="row-icon accent">${icon(template.id.includes('sib') ? 'database' : 'calendar')}</span><span><strong>${esc(template.name)}</strong><small>${esc(template.description)}</small></span>${icon('chevron')}</button>`).join('')}</div>`);
  node.querySelectorAll('[data-template]').forEach(button => button.addEventListener('click', () => {
    const draft = BpsEventLogic.createEventFromTemplate(button.dataset.template);
    closeModal({ immediate:true });
    openEventEditor(draft, false);
  }));
}

function openEventEditor(initialDraft, isExisting, restoredDraft = null) {
  let draft = BpsEventLogic.normalizeEvent(initialDraft);
  let expandedGateId = null;
  let expandedCashId = null;
  let validationMessages = [];
  const node = openModal(isExisting ? 'Редактировать мероприятие' : 'Новое мероприятие', '', { actionHtml:'<button class="text-button" id="saveEvent">Сохранить</button>' });
  const body = node.querySelector('.modal-body');
  let draftController = null;

  const syncBasicFields = (schedule = true) => {
    const pick = selector => node.querySelector(selector);
    if (pick('#eventName')) draft.name = pick('#eventName').value;
    if (pick('#eventType')) draft.type = pick('#eventType').value;
    if (pick('#eventDate')) draft.date = pick('#eventDate').value;
    if (pick('#eventDoors')) draft.doorsOpenAt = pick('#eventDoors').value;
    if (pick('#eventAudience')) draft.expectedAudience = Number(pick('#eventAudience').value || 0);
    if (pick('#eventNote')) draft.note = pick('#eventNote').value;
    if (schedule) draftController?.schedule();
  };

  const gateSummary = gate => {
    const active = gate.turnstiles.filter(turnstile => turnstile.mode === 'active').length;
    const reserve = gate.turnstiles.filter(turnstile => turnstile.mode === 'reserve').length;
    const faulty = gate.turnstiles.filter(turnstile => turnstile.mode === 'faulty').length;
    const status = BpsEventLogic.GATE_STATUSES.find(item => item.value === gate.status)?.label || gate.status;
    return `${status} · ${active} рабочих${reserve ? ` · ${reserve} резерв` : ''}${faulty ? ` · ${faulty} неиспр.` : ''}`;
  };

  const assignmentRows = desk => (desk.assignments || []).map((assignment, index) => `<div class="assignment-row" data-assignment-row="${index}"><input data-assignment-person="${index}" value="${esc(assignment.person)}" placeholder="ФИО кассира" aria-label="Кассир, смена ${index + 1}"><input type="time" data-assignment-from="${index}" value="${esc(assignment.from)}" aria-label="Начало смены ${index + 1}"><input type="time" data-assignment-to="${index}" value="${esc(assignment.to)}" aria-label="Конец смены ${index + 1}"><button type="button" class="icon-button compact danger-ghost" data-remove-assignment="${index}" aria-label="Удалить смену ${index + 1}">${icon('close')}</button></div>`).join('');

  const renderEditor = () => {
    const focusMarker = captureEventFocus(node);
    const checklistPreview = BpsEventLogic.generateChecklist(draft, draft.checklist);
    const summary = BpsEventLogic.summarizeConfiguration(draft);
    body.innerHTML = `<form id="eventForm" class="event-form">
      ${validationMessages.length ? `<div class="validation-stack">${validationMessages.map(message => `<div class="inline-message warning">${icon('alert')}<span>${esc(message)}</span></div>`).join('')}</div>` : ''}
      <section class="form-section"><h3>Основное</h3>
        <div class="field"><label class="required" for="eventName">Название</label><input id="eventName" required value="${esc(draft.name)}" placeholder="Например: ФК Мордовия — ФК ..."></div>
        <div class="form-grid two"><div class="field"><label for="eventType">Тип</label><select id="eventType">${optionsHtml(EVENT_TYPES,draft.type)}</select></div><div class="field"><label class="required" for="eventDate">Дата и время</label><input id="eventDate" type="datetime-local" required value="${esc(eventDateInputValue(draft.date))}"></div></div>
        <div class="form-grid two"><div class="field"><label for="eventDoors">Открытие входов</label><input id="eventDoors" type="time" value="${esc(draft.doorsOpenAt)}"></div><div class="field"><label for="eventAudience">Ожидается зрителей</label><input id="eventAudience" type="number" min="0" inputmode="numeric" value="${draft.expectedAudience || ''}" placeholder="0"></div></div>
        <div class="field"><label for="eventNote">Примечание</label><textarea id="eventNote" placeholder="Особенности схемы или требования организатора">${esc(draft.note)}</textarea></div>
      </section>

      <section class="form-section"><div class="form-section-head"><div><h3>Системы</h3><p>Включите только то, что используется на этом мероприятии</p></div></div>
        <div class="settings-list compact-settings">
          ${systemToggleRow('БПС','Сервер, контроллеры и билетная база','bps',draft.systems.bps)}
          <div class="settings-row"><span class="settings-copy"><strong>СИБ</strong><small>Режим использования системы</small></span><select class="inline-select" data-system-select="sib" aria-label="Режим использования СИБ">${BpsEventLogic.SIB_MODES.map(item => `<option value="${item.value}" ${draft.systems.sib===item.value?'selected':''}>${item.label}</option>`).join('')}</select></div>
          ${systemToggleRow('Онлайн-продажи','Доступ к билетному агрегатору','onlineSales',draft.systems.onlineSales)}
          ${systemToggleRow('Продажи в кассах','Проверки кассовых рабочих мест','offlineSales',draft.systems.offlineSales)}
          ${systemToggleRow('Печать билетов','Принтеры и тестовая печать','printing',draft.systems.printing)}
          ${systemToggleRow('Контроль прохода','Гейты и турникеты','accessControl',draft.systems.accessControl)}
          ${systemToggleRow('Резервный интернет','Проверка запасного канала','reserveInternet',draft.systems.reserveInternet)}
        </div>
      </section>

      <section class="form-section"><div class="form-section-head"><div><h3>Гейты и турникеты</h3><p>${summary.activeGates} гейт. · ${summary.activeTurnstiles} рабочих · ${summary.reserveTurnstiles} резервных</p></div></div>
        <div class="config-stack">${draft.gates.map(gate => `<div class="config-card ${expandedGateId===gate.id?'expanded':''}">
          <button type="button" class="config-card-head" data-toggle-gate="${esc(gate.id)}" aria-expanded="${expandedGateId===gate.id}"><span class="row-icon ${gate.status==='unavailable'?'danger':gate.status==='active'||gate.status==='partial'?'success':''}">${icon('inspection')}</span><span><strong>${esc(gate.name)}</strong><small>${esc(gateSummary(gate))}</small></span>${icon(expandedGateId===gate.id?'close':'chevron')}</button>
          ${expandedGateId===gate.id ? `<div class="config-card-body">
            <div class="field"><label>Режим гейта</label><select data-gate-status="${esc(gate.id)}" aria-label="Режим гейта ${esc(gate.name)}">${BpsEventLogic.GATE_STATUSES.map(item => `<option value="${item.value}" ${gate.status===item.value?'selected':''}>${item.label}</option>`).join('')}</select></div>
            <div class="quick-preset-row"><button type="button" class="chip" data-gate-preset="all" data-gate-id="${esc(gate.id)}">Все рабочие</button><button type="button" class="chip" data-gate-preset="first4" data-gate-id="${esc(gate.id)}">Первые 4</button><button type="button" class="chip" data-gate-preset="reset" data-gate-id="${esc(gate.id)}">Сбросить</button></div>
            <div class="turnstile-list">${gate.turnstiles.map(turnstile => `<div class="turnstile-row"><span><strong>${esc(turnstile.name)}</strong><small>${esc(BpsEventLogic.TURNSTILE_MODES.find(item=>item.value===turnstile.mode)?.label||turnstile.mode)}</small></span><select data-turnstile-mode="${esc(turnstile.id)}" data-gate-id="${esc(gate.id)}" aria-label="Режим ${esc(gate.name)}, ${esc(turnstile.name)}">${BpsEventLogic.TURNSTILE_MODES.map(item => `<option value="${item.value}" ${turnstile.mode===item.value?'selected':''}>${item.label}</option>`).join('')}</select></div>`).join('')}</div>
          </div>` : ''}
        </div>`).join('')}</div>
      </section>

      <section class="form-section"><div class="form-section-head"><div><h3>Кассы и кассиры</h3><p>${summary.activeCashDesks} активных касс · ${summary.assignments} назначений</p></div></div>
        <div class="config-stack">${draft.cashDesks.map(desk => `<div class="config-card ${expandedCashId===desk.id?'expanded':''}">
          <button type="button" class="config-card-head" data-toggle-cash="${esc(desk.id)}" aria-expanded="${expandedCashId===desk.id}"><span class="row-icon ${desk.mode==='active'?'success':desk.mode==='reserve'?'info':''}">${icon('ticket')}</span><span><strong>${esc(desk.name)}</strong><small>${desk.mode==='active'?'Работает':desk.mode==='reserve'?'Резерв':'Не используется'}${desk.assignments.length?` · ${desk.assignments.length} назнач.`:''}</small></span>${icon(expandedCashId===desk.id?'close':'chevron')}</button>
          ${expandedCashId===desk.id ? `<div class="config-card-body"><div class="field"><label>Режим кассы</label><select data-cash-mode="${esc(desk.id)}" aria-label="Режим ${esc(desk.name)}"><option value="active" ${desk.mode==='active'?'selected':''}>Работает</option><option value="reserve" ${desk.mode==='reserve'?'selected':''}>Резерв</option><option value="closed" ${desk.mode==='closed'?'selected':''}>Не используется</option></select></div><div class="assignment-list">${assignmentRows(desk)}</div><button type="button" class="button small full" data-add-assignment="${esc(desk.id)}">${icon('plus')}Добавить кассира или смену</button></div>` : ''}
        </div>`).join('')}</div>
      </section>

      <section class="form-section"><div class="event-checklist-preview"><span class="row-icon accent">${icon('check')}</span><span><strong>${checklistPreview.length} пунктов будет создано</strong><small>Чек-лист зависит только от выбранных систем и ресурсов</small></span></div></section>
      ${isExisting ? `<button type="button" class="button danger full" data-delete-event="${esc(draft.id)}">${icon('trash')}Удалить мероприятие</button>` : ''}
    </form>`;
    bindEditorEvents();
    restoreEventFocus(node, focusMarker);
  };

  function systemToggleRow(title, subtitle, key, enabled) {
    return `<div class="settings-row"><span class="settings-copy"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span><button type="button" class="switch ${enabled?'on':''}" data-system-toggle="${esc(key)}" role="switch" aria-checked="${enabled}" aria-label="${esc(title)}"></button></div>`;
  }

  function bindEditorEvents() {
    ['#eventName','#eventType','#eventDate','#eventDoors','#eventAudience','#eventNote'].forEach(selector => node.querySelector(selector)?.addEventListener('input', syncBasicFields));
    node.querySelectorAll('[data-system-toggle]').forEach(button => button.addEventListener('click', () => {
      syncBasicFields();
      const key = button.dataset.systemToggle;
      draft.systems[key] = !draft.systems[key];
      if (key === 'offlineSales' && !draft.systems.offlineSales) draft.cashDesks.forEach(desk => desk.mode = 'closed');
      renderEditor();
      draftController?.schedule();
    }));
    node.querySelector('[data-system-select="sib"]')?.addEventListener('change', event => { syncBasicFields(); draft.systems.sib = event.target.value; renderEditor(); draftController?.schedule(); });
    node.querySelectorAll('[data-toggle-gate]').forEach(button => button.addEventListener('click', () => { syncBasicFields(); expandedGateId = expandedGateId === button.dataset.toggleGate ? null : button.dataset.toggleGate; expandedCashId = null; renderEditor(); }));
    node.querySelectorAll('[data-gate-status]').forEach(select => select.addEventListener('change', event => { syncBasicFields(); const gate = draft.gates.find(item => item.id === select.dataset.gateStatus); gate.status = event.target.value; renderEditor(); draftController?.schedule(); }));
    node.querySelectorAll('[data-turnstile-mode]').forEach(select => select.addEventListener('change', event => { syncBasicFields(); const gate = draft.gates.find(item => item.id === select.dataset.gateId); const turnstile = gate.turnstiles.find(item => item.id === select.dataset.turnstileMode); turnstile.mode = event.target.value; if (turnstile.mode === 'active' && ['not_requested','planned_closed'].includes(gate.status)) gate.status = 'partial'; renderEditor(); draftController?.schedule(); }));
    node.querySelectorAll('[data-gate-preset]').forEach(button => button.addEventListener('click', () => {
      syncBasicFields();
      const gate = draft.gates.find(item => item.id === button.dataset.gateId);
      gate.turnstiles.forEach((turnstile, index) => {
        turnstile.mode = button.dataset.gatePreset === 'all' ? 'active' : button.dataset.gatePreset === 'first4' ? (index < 4 ? 'active' : 'not_requested') : 'not_requested';
      });
      if (button.dataset.gatePreset === 'all') gate.status = 'active';
      else if (button.dataset.gatePreset === 'first4') gate.status = 'partial';
      else gate.status = 'not_requested';
      renderEditor();
      draftController?.schedule();
    }));
    node.querySelectorAll('[data-toggle-cash]').forEach(button => button.addEventListener('click', () => { syncBasicFields(); expandedCashId = expandedCashId === button.dataset.toggleCash ? null : button.dataset.toggleCash; expandedGateId = null; renderEditor(); }));
    node.querySelectorAll('[data-cash-mode]').forEach(select => select.addEventListener('change', event => { syncBasicFields(); const desk = draft.cashDesks.find(item => item.id === select.dataset.cashMode); desk.mode = event.target.value; if (desk.mode !== 'closed') draft.systems.offlineSales = true; renderEditor(); draftController?.schedule(); }));
    node.querySelectorAll('[data-add-assignment]').forEach(button => button.addEventListener('click', () => { syncBasicFields(); syncAssignments(); const desk = draft.cashDesks.find(item => item.id === button.dataset.addAssignment); desk.assignments.push({ id:uid('assignment'), person:'', from:'', to:'' }); renderEditor(); draftController?.schedule(); }));
    node.querySelectorAll('[data-remove-assignment]').forEach(button => button.addEventListener('click', () => { syncBasicFields(); syncAssignments(); const desk = draft.cashDesks.find(item => item.id === expandedCashId); desk.assignments.splice(Number(button.dataset.removeAssignment), 1); renderEditor(); draftController?.schedule(); }));
    node.querySelectorAll('[data-assignment-person],[data-assignment-from],[data-assignment-to]').forEach(input => input.addEventListener('input', () => { syncAssignments(); draftController?.schedule(); }));
    node.querySelector('[data-delete-event]')?.addEventListener('click', () => confirmModal('Удалить мероприятие?','Конфигурация и чек-лист будут перемещены в корзину. Связанные записи и задачи останутся.','Удалить',async()=>{await draftController?.clear();closeModal({immediate:true});await deleteEventWithUndo(draft.id);},true));
  }

  function syncAssignments() {
    if (!expandedCashId) return;
    const desk = draft.cashDesks.find(item => item.id === expandedCashId);
    if (!desk) return;
    desk.assignments.forEach((assignment, index) => {
      const person = node.querySelector(`[data-assignment-person="${index}"]`);
      const from = node.querySelector(`[data-assignment-from="${index}"]`);
      const to = node.querySelector(`[data-assignment-to="${index}"]`);
      if (person) assignment.person = person.value;
      if (from) assignment.from = from.value;
      if (to) assignment.to = to.value;
    });
  }

  node.querySelector('#saveEvent').addEventListener('click', async () => {
    syncBasicFields();
    syncAssignments();
    const validation = BpsEventLogic.validateEvent(draft);
    validationMessages = [...validation.errors, ...validation.warnings];
    if (!validation.valid) { renderEditor(); body.scrollTo({ top:0, behavior:'smooth' }); return; }
    const existingChecklist = isExisting ? initialDraft.checklist : [];
    draft = BpsEventLogic.normalizeEvent({
      ...draft,
      id: draft.id || uid('event'),
      date: draft.date ? new Date(draft.date).toISOString() : '',
      checklist: BpsEventLogic.generateChecklist(draft, existingChecklist),
      createdAt: draft.createdAt || nowISO(),
      updatedAt: nowISO(),
    });
    await dbPut('events', draft);
    await draftController?.clear();
    closeModal();
    toast(isExisting ? 'Мероприятие обновлено' : 'Мероприятие создано');
    await render();
    await reconcilePushNotifications();
  });

  renderEditor();
  draftController = attachDraftAutosave(node, {
    type:'event',
    entityId:isExisting ? draft.id : '',
    restored:restoredDraft,
    formSelector:'#eventForm',
    snapshot:()=>{ syncBasicFields(false); syncAssignments(); return { event:BpsEventLogic.normalizeEvent(draft) }; },
    restore:()=>{},
  });
  return node;
}

function checklistStatusButton(item, status) {
  return `<button type="button" class="check-status-button ${item.status===status?`active ${status}`:''}" data-check-key="${esc(item.key)}" data-check-status="${status}" aria-label="${esc(CHECK_STATUS_LABELS[status])} — ${esc(item.title)}">${status==='ok'?icon('check'):status==='issue'?icon('alert'):status==='failed'?icon('close'):status==='na'?icon('more'):icon('clock')}</button>`;
}

function openEventDetail(id) {
  const event = getEventById(id); if (!event) return;
  rememberRecent('events',event.id,event.name);
  event.checklist = BpsEventLogic.generateChecklist(event, event.checklist);
  const node = openModal('Мероприятие', '', { actionHtml:'<button class="text-button" id="editEventTop">Изменить</button>' });
  const body = node.querySelector('.modal-body');

  const renderDetail = () => {
    const focusMarker = captureEventFocus(node);
    const readiness = BpsEventLogic.calculateReadiness(event);
    const blockers = BpsEventLogic.readinessBlockers(event);
    const summary = BpsEventLogic.summarizeConfiguration(event);
    const linkedEntries = state.data.entries.filter(item => item.eventId === event.id);
    const linkedTasks = state.data.tasks.filter(item => item.eventId === event.id);
    const groups = event.checklist.reduce((acc, item) => ((acc[item.group] ||= []).push(item), acc), {});
    const snapshots = [...(event.readinessHistory || [])].sort((a,b)=>new Date(b.at)-new Date(a.at));
    const latestSnapshot = snapshots[0] || null;
    const previousSnapshot = snapshots[1] || null;
    const comparison = latestSnapshot && previousSnapshot ? latestSnapshot.percent - previousSnapshot.percent : null;
    body.innerHTML = `<section class="event-detail-hero">
      <div class="event-detail-title"><span class="status-pill ${eventStatusTone(event.status)}">${EVENT_STATUS_LABELS[event.status]}</span><h3>${esc(event.name)}</h3><p>${formatFullDate(event.date)}${event.doorsOpenAt?` · входы ${esc(event.doorsOpenAt)}`:''}</p></div>
      <div class="readiness-large"><div class="readiness-ring large ${readiness.tone}" style="--progress:${readiness.percent}"><b>${readiness.percent}</b><small>%</small></div><span><strong>${esc(readiness.label)}</strong><small>${readiness.completed} из ${readiness.total} пунктов обработано</small></span></div>
    </section>
    <section class="modal-section readiness-verification"><div class="detail-list"><div><span>Последняя проверка</span><strong>${event.verifiedAt?`${formatFullDate(event.verifiedAt)} · ${esc(event.verifiedBy||'Инженер')}`:'Ещё не зафиксирована'}</strong></div>${comparison!==null?`<div><span>К предыдущей проверке</span><strong class="${comparison>0?'status-text success':comparison<0?'status-text danger':''}">${comparison>0?'+':''}${comparison} п. п.</strong></div>`:''}</div><button class="button full spaced-top" id="recordEventVerification">${icon('check')}Зафиксировать проверку</button></section>
    ${blockers.length?`<section class="modal-section"><div class="inline-message ${readiness.tone==='danger'?'danger':'warning'}">${icon('alert')}<span><strong>Почему мероприятие не готово</strong><small>${blockers.length} ${plural(blockers.length,'блокирующий пункт','блокирующих пункта','блокирующих пунктов')}</small></span></div><div class="blocker-list">${blockers.slice(0,8).map(item=>`<div><span class="status-pill ${item.status==='failed'?'danger':'warning'}">${esc(item.reason)}</span><strong>${esc(item.title)}</strong><small>${esc(item.group)}</small></div>`).join('')}</div></section>`:''}
    <section class="event-summary-grid"><div><b>${summary.activeGates}</b><span>Гейты</span></div><div><b>${summary.activeTurnstiles}</b><span>Турникеты</span></div><div><b>${summary.activeCashDesks}</b><span>Кассы</span></div><div><b>${summary.assignments}</b><span>Кассиры</span></div></section>
    <section class="modal-section"><h3 class="modal-section-title">Конфигурация</h3><div class="detail-list"><div><span>Системы</span><strong>${esc(eventSystemSummary(event))}</strong></div>${event.gates.filter(g=>g.status!=='not_requested').map(g=>`<div><span>${esc(g.name)}</span><strong>${esc(BpsEventLogic.GATE_STATUSES.find(item=>item.value===g.status)?.label||g.status)} · ${g.turnstiles.filter(t=>t.mode==='active').length} раб.</strong></div>`).join('')}</div></section>
    <section class="modal-section"><div class="section-head"><div><h3 class="modal-section-title">Чек-лист готовности</h3><p class="section-subtitle">Неиспользуемые ресурсы не входят в расчёт</p></div><span class="count-badge">${event.checklist.length}</span></div>
      <div class="checklist-groups">${Object.entries(groups).map(([group, items])=>`<div class="checklist-group"><h4>${esc(group)}</h4>${items.map(item=>`<div class="event-check-row ${item.critical?'critical':''}"><span><strong>${esc(item.title)}</strong>${item.critical?'<small>Критический пункт</small>':''}</span><div class="check-status-actions">${['pending','ok','issue','failed','na'].map(status=>checklistStatusButton(item,status)).join('')}</div></div>`).join('')}</div>`).join('')}</div>
    </section>
    <section class="modal-section"><h3 class="modal-section-title">Связанные данные</h3><div class="detail-list"><div><span>Записи журнала</span><strong>${linkedEntries.length}</strong></div><div><span>Задачи</span><strong>${linkedTasks.length}</strong></div></div><div class="button-row"><button class="button" data-new-linked="entry">${icon('journal')}Запись</button><button class="button" data-new-linked="task">${icon('task')}Задача</button></div></section>
    ${relatedEntitiesHtml('events',event.id)}
    <section class="modal-section"><div class="button-row"><button class="button" id="duplicateEvent">${icon('copy')}Копировать</button><button class="button" id="advanceEventStatus">${icon('clock')}${event.status==='planned'?'Начать подготовку':event.status==='preparing'?'Открыть режим проведения':event.status==='live'?'Завершить':'Вернуть в план'}</button></div></section>`;
    bindDetail();
    restoreEventFocus(node, focusMarker);
  };

  const bindDetail = () => {
    body.querySelectorAll('[data-check-key]').forEach(button => button.addEventListener('click', async () => {
      const item = event.checklist.find(check => check.key === button.dataset.checkKey);
      if (!item) return;
      item.status = button.dataset.checkStatus;
      event.updatedAt = nowISO();
      await dbPut('events', event);
      renderDetail();
    }));
    body.querySelector('[data-new-linked="entry"]')?.addEventListener('click', () => { closeModal({immediate:true}); openEntryForm({ eventId:event.id, object:event.gates.find(g=>['active','partial'].includes(g.status))?.name || 'КПП-1', type:'Подготовка мероприятия', status:'Информация', date:nowISO(), photos:[] }); });
    body.querySelector('[data-new-linked="task"]')?.addEventListener('click', () => { closeModal({immediate:true}); openTaskForm({ eventId:event.id, title:`${event.name}: `, object:'', priority:'Обычный' }); });
    body.querySelectorAll('[data-kb-action="open-article"]').forEach(button=>button.addEventListener('click',()=>{const articleId=button.dataset.id;closeModal({immediate:true});openKnowledgeArticleDetail(articleId);}));
    bindSwipeRows(body);
    body.querySelector('#duplicateEvent')?.addEventListener('click', () => { closeModal({immediate:true}); duplicateEvent(event); });
    body.querySelector('#recordEventVerification')?.addEventListener('click', async () => {
      const verified = BpsEventLogic.recordReadinessSnapshot(event, state.preferences.operatorName || 'Инженер', nowISO());
      Object.assign(event, verified);
      await dbPut('events', event);
      toast('Проверка готовности зафиксирована');
      renderDetail();
    });
    body.querySelector('#advanceEventStatus')?.addEventListener('click', async () => {
      const previous = event.status;
      const next = { planned:'preparing', preparing:'live', live:'completed', completed:'planned' }[event.status];
      event.status = next;
      event.updatedAt = nowISO();
      await dbPut('events', event);
      await refreshData();
      await reconcilePushNotifications();
      toast(`Статус: ${EVENT_STATUS_LABELS[next]}`,{actionText:'Отменить',duration:6500,onAction:async()=>{event.status=previous;event.updatedAt=nowISO();await dbPut('events',event);renderDetail();await refreshData();await reconcilePushNotifications();}});
      renderDetail();
    });
    bindRelatedEntityLinks(body);
  };

  node.querySelector('#editEventTop').addEventListener('click', () => { closeModal({immediate:true}); openEventForm(event); });
  renderDetail();
}

async function duplicateEvent(source) {
  const copy = BpsEventLogic.normalizeEvent(JSON.parse(JSON.stringify(source)));
  copy.id = uid('event');
  copy.name = `${source.name} — копия`;
  copy.status = 'planned';
  const date = new Date(source.date || Date.now());
  date.setDate(date.getDate() + 7);
  copy.date = date.toISOString();
  copy.checklist = BpsEventLogic.generateChecklist(copy).map(item => ({ ...item, status:'pending', note:'' }));
  copy.configurationChanges = [];
  copy.verifiedAt = null;
  copy.verifiedBy = '';
  copy.readinessHistory = [];
  copy.createdAt = nowISO();
  copy.updatedAt = nowISO();
  await dbPut('events', copy);
  toast('Создана копия мероприятия');
  await render();
  openEventDetail(copy.id);
}

function bindEventPageEvents(main) {
  if (state.route !== 'events') return;
  const search = main.querySelector('#eventSearch');
  search?.addEventListener('input', debounce(async () => {
    state.events.query = search.value;
    await setSetting('filter:events', state.events);
    await render();
    document.querySelector('#eventSearch')?.focus({ preventScroll:true });
  }, 160));
  main.querySelectorAll('[data-event-filter]').forEach(button => button.addEventListener('click', async () => {
    state.events.status = button.dataset.eventFilter;
    await setSetting('filter:events', state.events);
    await render();
  }));
}
window.bindEventPageEvents = bindEventPageEvents;

window.openEventDetail = openEventDetail;
