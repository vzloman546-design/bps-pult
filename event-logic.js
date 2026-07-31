(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BpsEventLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EVENT_SCHEMA_VERSION = 1;

  const GATE_STATUSES = [
    { value: 'active', label: 'Открыт' },
    { value: 'partial', label: 'Используется частично' },
    { value: 'reserve', label: 'Резерв' },
    { value: 'planned_closed', label: 'Закрыт по плану' },
    { value: 'not_requested', label: 'Не запрошен' },
    { value: 'unavailable', label: 'Недоступен' },
  ];

  const TURNSTILE_MODES = [
    { value: 'active', label: 'Рабочий' },
    { value: 'reserve', label: 'Резерв' },
    { value: 'not_requested', label: 'Не запрошен' },
    { value: 'closed', label: 'Закрыт' },
    { value: 'faulty', label: 'Неисправен' },
  ];

  const SIB_MODES = [
    { value: 'none', label: 'Не используется' },
    { value: 'full', label: 'Используется полностью' },
    { value: 'partial', label: 'Используется частично' },
    { value: 'reserve', label: 'Резервный режим' },
  ];

  const DEFAULT_RESOURCE_CATALOG = {
    gates: [
      { id: 'kpp1', name: 'КПП-1', turnstileCount: 8 },
      { id: 'kpp2', name: 'КПП-2', turnstileCount: 8 },
      { id: 'kpp3', name: 'КПП-3', turnstileCount: 8 },
      { id: 'kpp4', name: 'КПП-4', turnstileCount: 8 },
      { id: 'vsa1', name: 'ВСА-1', turnstileCount: 4 },
      { id: 'vsa2', name: 'ВСА-2', turnstileCount: 4 },
    ],
    cashDesks: [
      { id: 'cash1', name: 'Касса 1' },
      { id: 'cash2', name: 'Касса 2' },
      { id: 'cash3', name: 'Касса 3' },
    ],
  };

  const EVENT_TEMPLATES = [
    {
      id: 'blank',
      name: 'Пустая конфигурация',
      description: 'Ничего не включено автоматически.',
      systems: { bps: true, sib: 'none', onlineSales: true, offlineSales: false, printing: false, accessControl: true, reserveInternet: false },
      gateDefaults: { status: 'not_requested', activeCount: 0, reserveCount: 0 },
      activeCashDesks: 0,
    },
    {
      id: 'match-no-sib',
      name: 'Матч без СИБ',
      description: 'БПС, онлайн-продажи и контроль прохода. Состав гейтов уточняется вручную.',
      systems: { bps: true, sib: 'none', onlineSales: true, offlineSales: true, printing: true, accessControl: true, reserveInternet: true },
      gateDefaults: { status: 'not_requested', activeCount: 0, reserveCount: 0 },
      activeCashDesks: 2,
    },
    {
      id: 'match-with-sib',
      name: 'Матч с СИБ',
      description: 'Полная проверка БПС и СИБ, кассовые продажи включены.',
      systems: { bps: true, sib: 'full', onlineSales: true, offlineSales: true, printing: true, accessControl: true, reserveInternet: true },
      gateDefaults: { status: 'not_requested', activeCount: 0, reserveCount: 0 },
      activeCashDesks: 2,
    },
    {
      id: 'small-event',
      name: 'Небольшое мероприятие',
      description: 'Один основной гейт, без СИБ, одна касса.',
      systems: { bps: true, sib: 'none', onlineSales: true, offlineSales: true, printing: true, accessControl: true, reserveInternet: false },
      gateDefaults: { status: 'not_requested', activeCount: 0, reserveCount: 0 },
      activeCashDesks: 1,
      firstGate: { status: 'partial', activeCount: 4, reserveCount: 1 },
    },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeTurnstiles(gate, defaults) {
    const activeCount = Math.max(0, Math.min(gate.turnstileCount, defaults.activeCount || 0));
    const reserveCount = Math.max(0, Math.min(gate.turnstileCount - activeCount, defaults.reserveCount || 0));
    return Array.from({ length: gate.turnstileCount }, (_, index) => {
      let mode = 'not_requested';
      if (index < activeCount) mode = 'active';
      else if (index < activeCount + reserveCount) mode = 'reserve';
      return {
        id: `${gate.id}-t${index + 1}`,
        name: `Турникет ${index + 1}`,
        mode,
      };
    });
  }

  function createEventFromTemplate(templateId, catalog = DEFAULT_RESOURCE_CATALOG, overrides = {}) {
    const template = EVENT_TEMPLATES.find(item => item.id === templateId) || EVENT_TEMPLATES[0];
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const event = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      id: overrides.id || '',
      name: overrides.name || '',
      type: overrides.type || 'Матч',
      date: overrides.date || now.toISOString().slice(0, 16),
      doorsOpenAt: overrides.doorsOpenAt || '',
      expectedAudience: Number(overrides.expectedAudience || 0),
      status: overrides.status || 'planned',
      note: overrides.note || '',
      systems: clone(template.systems),
      gates: catalog.gates.map((gate, index) => {
        const defaults = index === 0 && template.firstGate ? template.firstGate : template.gateDefaults;
        return {
          id: gate.id,
          name: gate.name,
          status: defaults.status,
          turnstiles: makeTurnstiles(gate, defaults),
        };
      }),
      cashDesks: catalog.cashDesks.map((desk, index) => ({
        id: desk.id,
        name: desk.name,
        mode: index < template.activeCashDesks ? 'active' : 'closed',
        assignments: [],
      })),
      checklist: [],
      configurationChanges: [],
      createdAt: overrides.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return normalizeEvent({ ...event, ...overrides, systems: { ...event.systems, ...(overrides.systems || {}) } }, catalog);
  }

  function normalizeEvent(input, catalog = DEFAULT_RESOURCE_CATALOG) {
    const base = createBareEvent(input || {});
    const sourceGates = Array.isArray(input && input.gates) ? input.gates : [];
    base.gates = catalog.gates.map((catalogGate) => {
      const source = sourceGates.find(gate => gate.id === catalogGate.id) || {};
      const sourceTurnstiles = Array.isArray(source.turnstiles) ? source.turnstiles : [];
      return {
        id: catalogGate.id,
        name: source.name || catalogGate.name,
        status: GATE_STATUSES.some(item => item.value === source.status) ? source.status : 'not_requested',
        turnstiles: Array.from({ length: catalogGate.turnstileCount }, (_, index) => {
          const id = `${catalogGate.id}-t${index + 1}`;
          const sourceTurnstile = sourceTurnstiles.find(item => item.id === id) || sourceTurnstiles[index] || {};
          return {
            id,
            name: sourceTurnstile.name || `Турникет ${index + 1}`,
            mode: TURNSTILE_MODES.some(item => item.value === sourceTurnstile.mode) ? sourceTurnstile.mode : 'not_requested',
          };
        }),
      };
    });
    const sourceDesks = Array.isArray(input && input.cashDesks) ? input.cashDesks : [];
    base.cashDesks = catalog.cashDesks.map((catalogDesk) => {
      const source = sourceDesks.find(desk => desk.id === catalogDesk.id) || {};
      return {
        id: catalogDesk.id,
        name: source.name || catalogDesk.name,
        mode: ['active', 'reserve', 'closed'].includes(source.mode) ? source.mode : 'closed',
        assignments: Array.isArray(source.assignments)
          ? source.assignments.map((assignment, index) => ({
              id: assignment.id || `${catalogDesk.id}-assignment-${index + 1}`,
              person: String(assignment.person || ''),
              from: String(assignment.from || ''),
              to: String(assignment.to || ''),
            }))
          : [],
      };
    });
    base.checklist = Array.isArray(input && input.checklist) ? clone(input.checklist) : [];
    base.configurationChanges = Array.isArray(input && input.configurationChanges) ? clone(input.configurationChanges) : [];
    return base;
  }

  function createBareEvent(input) {
    return {
      schemaVersion: EVENT_SCHEMA_VERSION,
      id: String(input.id || ''),
      name: String(input.name || ''),
      type: String(input.type || 'Матч'),
      date: String(input.date || ''),
      doorsOpenAt: String(input.doorsOpenAt || ''),
      expectedAudience: Math.max(0, Number(input.expectedAudience || 0)),
      status: ['planned', 'preparing', 'live', 'completed'].includes(input.status) ? input.status : 'planned',
      note: String(input.note || ''),
      systems: {
        bps: input.systems?.bps !== false,
        sib: SIB_MODES.some(item => item.value === input.systems?.sib) ? input.systems.sib : 'none',
        onlineSales: input.systems?.onlineSales !== false,
        offlineSales: Boolean(input.systems?.offlineSales),
        printing: Boolean(input.systems?.printing),
        accessControl: input.systems?.accessControl !== false,
        reserveInternet: Boolean(input.systems?.reserveInternet),
      },
      gates: [],
      cashDesks: [],
      checklist: [],
      configurationChanges: [],
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: input.updatedAt || new Date().toISOString(),
    };
  }

  function checklistItem(key, title, options = {}) {
    return {
      id: key,
      key,
      title,
      group: options.group || 'Общее',
      resourceType: options.resourceType || 'system',
      resourceId: options.resourceId || '',
      weight: Number(options.weight || 1),
      required: options.required !== false,
      critical: Boolean(options.critical),
      status: options.status || 'pending',
      note: options.note || '',
    };
  }

  function generateChecklist(eventInput, existingChecklist = null) {
    const event = normalizeEvent(eventInput);
    const previous = new Map((existingChecklist || event.checklist || []).map(item => [item.key || item.id, item]));
    const items = [];
    const add = (item) => {
      const old = previous.get(item.key);
      if (old) {
        item.status = ['pending', 'ok', 'issue', 'failed', 'na'].includes(old.status) ? old.status : 'pending';
        item.note = old.note || '';
      }
      items.push(item);
    };

    if (event.systems.bps) {
      add(checklistItem('system:bps:server', 'Проверить доступность сервера БПС', { group: 'Системы', weight: 3, critical: true }));
      add(checklistItem('system:bps:event-sync', 'Проверить загрузку и синхронизацию мероприятия', { group: 'Системы', weight: 3, critical: true }));
      add(checklistItem('system:bps:time', 'Сверить дату и время на сервере и контроллерах', { group: 'Системы', weight: 2 }));
    }
    if (event.systems.sib !== 'none') {
      const reserve = event.systems.sib === 'reserve';
      add(checklistItem('system:sib:server', reserve ? 'Проверить готовность сервера СИБ к резервному включению' : 'Проверить доступность сервера СИБ', { group: 'СИБ', weight: reserve ? 1 : 3, critical: !reserve, required: true }));
      add(checklistItem('system:sib:connection', 'Проверить связь БПС с СИБ', { group: 'СИБ', weight: reserve ? 1 : 3, critical: !reserve }));
      if (!reserve) add(checklistItem('system:sib:test', 'Выполнить тестовый сценарий идентификации', { group: 'СИБ', weight: 3, critical: true }));
    }
    if (event.systems.onlineSales) {
      add(checklistItem('system:sales:online', 'Проверить доступ к билетному агрегатору и онлайн-продажам', { group: 'Продажи', weight: 2 }));
    }
    if (event.systems.reserveInternet) {
      add(checklistItem('system:network:reserve', 'Проверить резервный канал интернета', { group: 'Сети', weight: 2 }));
    }

    event.gates.forEach((gate) => {
      const group = gate.name;
      if (gate.status === 'planned_closed') {
        add(checklistItem(`gate:${gate.id}:planned-closed`, `Подтвердить закрытие ${gate.name} по схеме мероприятия`, { group, resourceType: 'gate', resourceId: gate.id, weight: 1 }));
        return;
      }
      if (gate.status === 'not_requested') return;
      if (gate.status === 'unavailable') {
        add(checklistItem(`gate:${gate.id}:unavailable`, `Определить замену или изменить схему для ${gate.name}`, { group, resourceType: 'gate', resourceId: gate.id, weight: 3, critical: true }));
        return;
      }

      const reserveGate = gate.status === 'reserve';
      add(checklistItem(`gate:${gate.id}:controller`, reserveGate ? `Проверить готовность контроллера ${gate.name}` : `Проверить контроллер ${gate.name}`, { group, resourceType: 'gate', resourceId: gate.id, weight: reserveGate ? 1 : 3, critical: !reserveGate }));
      add(checklistItem(`gate:${gate.id}:emergency`, reserveGate ? `Проверить аварийное открытие ${gate.name} в резервном режиме` : `Проверить аварийное открытие ${gate.name}`, { group, resourceType: 'gate', resourceId: gate.id, weight: reserveGate ? 1 : 3, critical: !reserveGate }));

      gate.turnstiles.forEach((turnstile) => {
        const prefix = `gate:${gate.id}:turnstile:${turnstile.id}`;
        const label = `${gate.name} · ${turnstile.name}`;
        if (turnstile.mode === 'active') {
          add(checklistItem(`${prefix}:network`, `${label}: питание и сетевая связь`, { group, resourceType: 'turnstile', resourceId: turnstile.id, weight: 2 }));
          add(checklistItem(`${prefix}:reader`, `${label}: считывание билета`, { group, resourceType: 'turnstile', resourceId: turnstile.id, weight: 3, critical: true }));
          add(checklistItem(`${prefix}:mechanics`, `${label}: створки, датчики и индикация`, { group, resourceType: 'turnstile', resourceId: turnstile.id, weight: 2 }));
          add(checklistItem(`${prefix}:duplicate`, `${label}: блокировка повторного прохода`, { group, resourceType: 'turnstile', resourceId: turnstile.id, weight: 3, critical: true }));
        } else if (turnstile.mode === 'reserve') {
          add(checklistItem(`${prefix}:reserve-ready`, `${label}: готовность к быстрому вводу в работу`, { group, resourceType: 'turnstile', resourceId: turnstile.id, weight: 1, required: true }));
        } else if (turnstile.mode === 'faulty') {
          add(checklistItem(`${prefix}:faulty-plan`, `${label}: вывести из схемы или назначить замену`, { group, resourceType: 'turnstile', resourceId: turnstile.id, weight: 3, critical: true }));
        }
      });
    });

    if (event.systems.offlineSales) {
      event.cashDesks.forEach((desk) => {
        if (desk.mode === 'closed') return;
        const reserve = desk.mode === 'reserve';
        const group = desk.name;
        add(checklistItem(`cash:${desk.id}:workstation`, reserve ? `${desk.name}: готовность рабочего места к резервному включению` : `${desk.name}: проверить рабочее место кассира`, { group, resourceType: 'cashDesk', resourceId: desk.id, weight: reserve ? 1 : 2 }));
        if (event.systems.printing) add(checklistItem(`cash:${desk.id}:printer`, `${desk.name}: проверить печать билета`, { group, resourceType: 'cashDesk', resourceId: desk.id, weight: reserve ? 1 : 2 }));
        if (!reserve) add(checklistItem(`cash:${desk.id}:test-sale`, `${desk.name}: выполнить тестовую продажу`, { group, resourceType: 'cashDesk', resourceId: desk.id, weight: 3, critical: true }));
      });
    }

    return items;
  }

  function calculateReadiness(eventInput) {
    const checklist = Array.isArray(eventInput?.checklist) && eventInput.checklist.length
      ? eventInput.checklist
      : generateChecklist(eventInput);
    const applicable = checklist.filter(item => item.required !== false && item.status !== 'na');
    const totalWeight = applicable.reduce((sum, item) => sum + Number(item.weight || 1), 0);
    const completedWeight = applicable.reduce((sum, item) => {
      if (item.status === 'ok') return sum + Number(item.weight || 1);
      if (item.status === 'issue') return sum + Number(item.weight || 1) * 0.5;
      return sum;
    }, 0);
    const percent = totalWeight ? Math.round((completedWeight / totalWeight) * 100) : 100;
    const criticalFailed = applicable.filter(item => item.critical && item.status === 'failed');
    const criticalPending = applicable.filter(item => item.critical && item.status === 'pending');
    const issues = applicable.filter(item => item.status === 'issue');
    let label = 'Готово';
    let tone = 'success';
    if (criticalFailed.length) { label = 'Есть критические неисправности'; tone = 'danger'; }
    else if (criticalPending.length) { label = 'Не готово'; tone = 'warning'; }
    else if (issues.length) { label = 'Готово с замечаниями'; tone = 'warning'; }
    else if (percent < 100) { label = 'Подготовка не завершена'; tone = 'info'; }
    return {
      percent,
      label,
      tone,
      total: applicable.length,
      completed: applicable.filter(item => item.status === 'ok' || item.status === 'issue').length,
      pending: applicable.filter(item => item.status === 'pending').length,
      failed: applicable.filter(item => item.status === 'failed').length,
      issues: issues.length,
      criticalFailed,
      criticalPending,
    };
  }

  function summarizeConfiguration(eventInput) {
    const event = normalizeEvent(eventInput);
    const activeGates = event.gates.filter(gate => ['active', 'partial'].includes(gate.status));
    const reserveGates = event.gates.filter(gate => gate.status === 'reserve');
    const activeTurnstiles = event.gates.flatMap(gate => gate.turnstiles).filter(item => item.mode === 'active').length;
    const reserveTurnstiles = event.gates.flatMap(gate => gate.turnstiles).filter(item => item.mode === 'reserve').length;
    const activeCashDesks = event.cashDesks.filter(item => item.mode === 'active').length;
    const assignments = event.cashDesks.flatMap(item => item.assignments || []).filter(item => item.person.trim()).length;
    return { activeGates: activeGates.length, reserveGates: reserveGates.length, activeTurnstiles, reserveTurnstiles, activeCashDesks, assignments };
  }

  function validateEvent(eventInput) {
    const event = normalizeEvent(eventInput);
    const errors = [];
    const warnings = [];
    if (!event.name.trim()) errors.push('Укажите название мероприятия.');
    if (!event.date) errors.push('Укажите дату и время мероприятия.');
    const summary = summarizeConfiguration(event);
    if (event.systems.accessControl && summary.activeTurnstiles === 0) warnings.push('Не выбран ни один рабочий турникет.');
    if (event.systems.offlineSales && summary.activeCashDesks === 0) warnings.push('Кассовые продажи включены, но активные кассы не выбраны.');
    if (!event.systems.offlineSales && summary.activeCashDesks > 0) warnings.push('Есть активные кассы, но офлайн-продажи выключены.');
    event.gates.forEach(gate => {
      if (['active', 'partial'].includes(gate.status) && !gate.turnstiles.some(item => item.mode === 'active')) {
        warnings.push(`${gate.name} открыт, но на нём не выбран ни один рабочий турникет.`);
      }
    });
    return { valid: errors.length === 0, errors, warnings };
  }

  return {
    EVENT_SCHEMA_VERSION,
    GATE_STATUSES,
    TURNSTILE_MODES,
    SIB_MODES,
    DEFAULT_RESOURCE_CATALOG,
    EVENT_TEMPLATES,
    createEventFromTemplate,
    normalizeEvent,
    generateChecklist,
    calculateReadiness,
    summarizeConfiguration,
    validateEvent,
  };
});
