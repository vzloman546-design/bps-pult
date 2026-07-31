'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BpsProductivity = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SEARCH_TYPES = [
    { value:'all', label:'Всё' },
    { value:'entries', label:'Журнал' },
    { value:'tasks', label:'Задачи' },
    { value:'inspections', label:'Осмотры' },
    { value:'equipment', label:'Оборудование' },
    { value:'events', label:'Мероприятия' },
    { value:'knowledgeArticles', label:'База знаний' },
  ];

  const TYPE_META = {
    entries: { label:'Журнал', action:'entry-detail', icon:'journal' },
    tasks: { label:'Задача', action:'task-detail', icon:'task' },
    inspections: { label:'Осмотр', action:'inspection-detail', icon:'inspection' },
    equipment: { label:'Оборудование', action:'equipment-detail', icon:'equipment' },
    events: { label:'Мероприятие', action:'event-detail', icon:'calendar' },
    knowledgeArticles: { label:'База знаний', action:'knowledge-detail', icon:'book' },
  };

  const EVENT_STATUS_LABELS = {
    planned:'Запланировано',
    preparing:'Подготовка',
    live:'Проводится',
    completed:'Завершено',
  };

  const KNOWLEDGE_TYPE_LABELS = {
    instruction:'Инструкция',
    troubleshooting:'Решение неисправности',
    regulation:'Регламент',
    reference:'Справочная информация',
    checklist:'Чек-лист',
    memo:'Важная памятка',
  };

  const KNOWLEDGE_STATUS_LABELS = {
    current:'Актуально',
    review:'Требует проверки',
    draft:'Черновик',
    outdated:'Устарело',
    archived:'Архив',
  };

  const text = value => String(value ?? '').trim();
  const array = value => Array.isArray(value) ? value : [];
  const normalizeText = value => text(value).toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
  const validDate = value => {
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) ? date : null;
  };
  const dateValue = value => validDate(value)?.getTime() || 0;
  const dateSearchText = value => {
    const date = validDate(value);
    return date ? `${text(value)} ${date.toLocaleDateString('ru-RU')} ${date.toLocaleString('ru-RU')}` : text(value);
  };

  function itemSearchText(store, item, context = {}) {
    const categories = array(context.knowledgeCategories);
    const category = categories.find(entry => entry.id === item.categoryId);
    if (store === 'entries') return [
      item.type, item.object, item.equipment, item.description, item.status,
    ];
    if (store === 'tasks') return [
      item.title, item.object, item.description, item.priority,
    ];
    if (store === 'inspections') return [
      item.object, item.equipment, item.conclusion,
      ...array(item.items).map(row => `${row.name} ${row.status}`),
    ];
    if (store === 'equipment') return [
      item.name, item.type, item.object, item.location, item.designation,
      item.ip, item.serial, item.status, item.note,
    ];
    if (store === 'events') return [
      item.name, item.type, dateSearchText(item.date), item.doorsOpenAt, item.note, item.status,
      ...array(item.gates).flatMap(gate => [
        gate.name, gate.status,
        ...array(gate.turnstiles).flatMap(turnstile => [turnstile.name, turnstile.mode]),
      ]),
      ...array(item.cashDesks).flatMap(desk => [
        desk.name, desk.mode, ...array(desk.assignments).map(assignment => assignment.person),
      ]),
    ];
    if (store === 'knowledgeArticles') return [
      item.title, item.summary, item.appliesWhen, item.expectedResult,
      item.troubleshooting, item.notes, category?.name,
      ...array(item.prerequisites), ...array(item.steps), ...array(item.tags),
    ];
    return Object.values(item || {});
  }

  function resultTitle(store, item) {
    if (store === 'entries') return item.equipment || item.type || 'Запись журнала';
    if (store === 'tasks') return item.title || 'Задача';
    if (store === 'inspections') return item.equipment || 'Техосмотр';
    if (store === 'equipment') return item.name || 'Оборудование';
    if (store === 'events') return item.name || 'Мероприятие';
    if (store === 'knowledgeArticles') return item.title || 'Материал';
    return 'Объект';
  }

  function resultMeta(store, item) {
    if (store === 'entries') return [item.object, item.type, item.status].filter(Boolean).join(' · ');
    if (store === 'tasks') return [item.object, item.priority, item.completed ? 'Выполнена' : 'В работе'].filter(Boolean).join(' · ');
    if (store === 'inspections') {
      const issues = array(item.items).filter(row => row.status === 'issue').length;
      return [item.object, issues ? `${issues} замеч.` : 'Без замечаний'].filter(Boolean).join(' · ');
    }
    if (store === 'equipment') return [item.object, item.designation || item.type, item.status].filter(Boolean).join(' · ');
    if (store === 'events') return [item.type, EVENT_STATUS_LABELS[item.status] || item.status].filter(Boolean).join(' · ');
    if (store === 'knowledgeArticles') return [
      KNOWLEDGE_TYPE_LABELS[item.type] || item.type,
      KNOWLEDGE_STATUS_LABELS[item.status] || item.status,
    ].filter(Boolean).join(' · ');
    return '';
  }

  function resultDate(store, item) {
    if (store === 'tasks') return item.dueAt || item.updatedAt || item.createdAt;
    if (store === 'knowledgeArticles' || store === 'equipment') return item.updatedAt || item.createdAt;
    return item.date || item.updatedAt || item.createdAt;
  }

  function searchEntities(data = {}, query = '', type = 'all') {
    const needle = normalizeText(query);
    if (needle.length < 2) return [];
    const tokens = needle.split(' ').filter(Boolean);
    const stores = type === 'all' ? Object.keys(TYPE_META) : (TYPE_META[type] ? [type] : []);
    const results = [];
    stores.forEach(store => {
      array(data[store]).forEach(item => {
        if (!item || item.deletedAt) return;
        if (store === 'knowledgeArticles' && item.status === 'archived') return;
        const title = resultTitle(store, item);
        const blob = normalizeText(itemSearchText(store, item, data).join(' '));
        if (!tokens.every(token => blob.includes(token))) return;
        const titleText = normalizeText(title);
        const score = titleText === needle ? 100
          : titleText.startsWith(needle) ? 70
          : titleText.includes(needle) ? 50
          : 20;
        results.push({
          store,
          id: text(item.id),
          title,
          meta: resultMeta(store, item),
          date: resultDate(store, item) || null,
          score,
          action: TYPE_META[store].action,
          icon: TYPE_META[store].icon,
          typeLabel: TYPE_META[store].label,
        });
      });
    });
    return results.sort((a, b) => b.score - a.score || dateValue(b.date) - dateValue(a.date) || a.title.localeCompare(b.title, 'ru'));
  }

  function canonicalEquipmentValue(value) {
    return normalizeText(value).replace(/[\s\-.:]/g, '');
  }

  function findEquipmentDuplicates(equipment = [], candidate = {}, excludeId = null) {
    const ip = canonicalEquipmentValue(candidate.ip);
    const serial = canonicalEquipmentValue(candidate.serial);
    const designation = canonicalEquipmentValue(candidate.designation);
    return array(equipment).filter(item => {
      if (!item || item.id === excludeId || item.status === 'Списано') return false;
      return Boolean(
        (ip && canonicalEquipmentValue(item.ip) === ip) ||
        (serial && canonicalEquipmentValue(item.serial) === serial) ||
        (designation && canonicalEquipmentValue(item.designation) === designation)
      );
    });
  }

  function inRange(value, from, to) {
    const time = dateValue(value);
    if (!time) return false;
    const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return time >= start && time <= end;
  }

  function reportData(data = {}, options = {}, now = new Date()) {
    const from = options.from || '';
    const to = options.to || from;
    const sections = new Set(array(options.sections).length ? options.sections : [
      'entries', 'completedTasks', 'overdueTasks', 'inspections', 'equipment', 'events',
    ]);
    const entries = sections.has('entries')
      ? array(data.entries).filter(item => !item.deletedAt && inRange(item.date, from, to))
      : [];
    const completedTasks = sections.has('completedTasks')
      ? array(data.tasks).filter(item => item.completed && !item.deletedAt && inRange(item.completedAt || item.updatedAt, from, to))
      : [];
    const overdueTasks = sections.has('overdueTasks')
      ? array(data.tasks).filter(item => !item.completed && !item.deletedAt && item.dueAt && dateValue(item.dueAt) < now.getTime())
      : [];
    const inspections = sections.has('inspections')
      ? array(data.inspections).filter(item => !item.deletedAt && inRange(item.date, from, to))
      : [];
    const equipment = sections.has('equipment')
      ? array(data.equipment).filter(item => !item.deletedAt && ['Требует внимания', 'Не работает'].includes(item.status))
      : [];
    const events = sections.has('events')
      ? array(data.events).filter(item => !item.deletedAt && inRange(item.date, from, to))
      : [];
    return { from, to, entries, completedTasks, overdueTasks, inspections, equipment, events };
  }

  function formatReport(report, formatDateTime = value => text(value)) {
    const formatDay = value => {
      const date = validDate(value ? `${value}T12:00:00` : '');
      return date ? date.toLocaleDateString('ru-RU') : text(value);
    };
    const period = report.from === report.to ? formatDay(report.from) : `${formatDay(report.from)} — ${formatDay(report.to)}`;
    const lines = [`СВОДКА БПС — ${period || 'весь период'}`, ''];
    if (report.entries.length) {
      lines.push(`ЖУРНАЛ — ${report.entries.length}`);
      report.entries.slice().sort((a,b) => dateValue(a.date)-dateValue(b.date)).forEach(item => {
        lines.push(`• ${formatDateTime(item.date)} — ${item.object || 'Без объекта'}${item.equipment ? `, ${item.equipment}` : ''}: ${item.description || item.type} (${item.status}).`);
      });
      lines.push('');
    }
    if (report.inspections.length) {
      lines.push(`ОСМОТРЫ — ${report.inspections.length}`);
      report.inspections.forEach(item => {
        const issues = array(item.items).filter(row => row.status === 'issue').map(row => row.name);
        lines.push(`• ${item.object || 'Без объекта'}${item.equipment ? `, ${item.equipment}` : ''}: ${issues.length ? `замечания — ${issues.join(', ')}` : 'без замечаний'}.`);
      });
      lines.push('');
    }
    if (report.completedTasks.length) {
      lines.push(`ВЫПОЛНЕННЫЕ ЗАДАЧИ — ${report.completedTasks.length}`);
      report.completedTasks.forEach(item => lines.push(`• ${item.title}${item.object ? ` (${item.object})` : ''}.`));
      lines.push('');
    }
    if (report.overdueTasks.length) {
      lines.push(`ПРОСРОЧЕННЫЕ ЗАДАЧИ — ${report.overdueTasks.length}`);
      report.overdueTasks.forEach(item => lines.push(`• ${item.title}${item.dueAt ? ` — срок ${formatDateTime(item.dueAt)}` : ''}.`));
      lines.push('');
    }
    if (report.equipment.length) {
      lines.push(`ОБОРУДОВАНИЕ ТРЕБУЕТ ВНИМАНИЯ — ${report.equipment.length}`);
      report.equipment.forEach(item => lines.push(`• ${item.name}: ${item.status}${item.object ? ` (${item.object})` : ''}.`));
      lines.push('');
    }
    if (report.events.length) {
      lines.push(`МЕРОПРИЯТИЯ — ${report.events.length}`);
      report.events.forEach(item => lines.push(`• ${formatDateTime(item.date)} — ${item.name} (${EVENT_STATUS_LABELS[item.status] || item.status || EVENT_STATUS_LABELS.planned}).`));
      lines.push('');
    }
    if (lines.length === 2) lines.push('За выбранный период данных нет.');
    return lines.join('\n').trim().replace(/\.{2,}/g, '.');
  }

  function csvCell(value) {
    const string = text(value).replace(/"/g, '""');
    return `"${string}"`;
  }

  function reportToCsv(report) {
    const rows = [['Раздел','Дата','Объект','Название','Статус','Описание']];
    report.entries.forEach(item => rows.push(['Журнал',item.date,item.object,item.equipment || item.type,item.status,item.description]));
    report.completedTasks.forEach(item => rows.push(['Выполненная задача',item.completedAt || item.updatedAt,item.object,item.title,'Выполнена',item.description]));
    report.overdueTasks.forEach(item => rows.push(['Просроченная задача',item.dueAt,item.object,item.title,'Просрочена',item.description]));
    report.inspections.forEach(item => rows.push(['Осмотр',item.date,item.object,item.equipment,array(item.items).some(row=>row.status==='issue')?'Есть замечания':'Без замечаний',item.conclusion]));
    report.equipment.forEach(item => rows.push(['Оборудование',item.updatedAt,item.object,item.name,item.status,item.note]));
    report.events.forEach(item => rows.push(['Мероприятие',item.date,'',item.name,EVENT_STATUS_LABELS[item.status] || item.status,item.note]));
    return `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}`;
  }

  function relatedEntities(data = {}, store, id) {
    const result = [];
    const push = (targetStore, item, relationship) => {
      if (!item || result.some(existing => existing.store === targetStore && existing.id === item.id)) return;
      result.push({
        store: targetStore,
        id: item.id,
        title: resultTitle(targetStore, item),
        meta: resultMeta(targetStore, item),
        relationship,
        action: TYPE_META[targetStore]?.action || '',
        icon: TYPE_META[targetStore]?.icon || 'info',
      });
    };
    if (store === 'entries') {
      const item = array(data.entries).find(entry => entry.id === id);
      if (item?.eventId) push('events', array(data.events).find(event => event.id === item.eventId), 'Мероприятие');
      array(data.tasks).filter(task => task.linkedEntryId === id).forEach(task => push('tasks', task, 'Связанная задача'));
    }
    if (store === 'tasks') {
      const item = array(data.tasks).find(task => task.id === id);
      if (item?.eventId) push('events', array(data.events).find(event => event.id === item.eventId), 'Мероприятие');
      if (item?.linkedEntryId) push('entries', array(data.entries).find(entry => entry.id === item.linkedEntryId), 'Исходная запись');
      if (item?.linkedInspectionId) push('inspections', array(data.inspections).find(inspection => inspection.id === item.linkedInspectionId), 'Исходный осмотр');
    }
    if (store === 'inspections') {
      const item = array(data.inspections).find(inspection => inspection.id === id);
      if (item?.eventId) push('events', array(data.events).find(event => event.id === item.eventId), 'Мероприятие');
      array(data.tasks).filter(task => task.linkedInspectionId === id).forEach(task => push('tasks', task, 'Связанная задача'));
    }
    if (store === 'events') {
      array(data.entries).filter(item => item.eventId === id).forEach(item => push('entries', item, 'Запись журнала'));
      array(data.tasks).filter(item => item.eventId === id).forEach(item => push('tasks', item, 'Задача'));
      array(data.inspections).filter(item => item.eventId === id).forEach(item => push('inspections', item, 'Осмотр'));
      array(data.knowledgeArticles).filter(item => array(item.linkedEventIds).includes(id)).forEach(item => push('knowledgeArticles', item, 'Инструкция'));
    }
    if (store === 'equipment') {
      array(data.knowledgeArticles).filter(item => array(item.linkedEquipmentIds).includes(id)).forEach(item => push('knowledgeArticles', item, 'Инструкция'));
    }
    if (store === 'knowledgeArticles') {
      const article = array(data.knowledgeArticles).find(item => item.id === id);
      array(article?.linkedEquipmentIds).forEach(targetId => push('equipment', array(data.equipment).find(item => item.id === targetId), 'Оборудование'));
      array(article?.linkedEventIds).forEach(targetId => push('events', array(data.events).find(item => item.id === targetId), 'Мероприятие'));
    }
    return result;
  }

  return {
    SEARCH_TYPES,
    TYPE_META,
    normalizeText,
    itemSearchText,
    searchEntities,
    findEquipmentDuplicates,
    inRange,
    reportData,
    formatReport,
    reportToCsv,
    relatedEntities,
  };
});
