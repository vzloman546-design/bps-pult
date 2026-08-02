'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BpsStability = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const CURRENT_SCHEMA = 6;
  const DATA_STORES = ['entries', 'tasks', 'inspections', 'equipment', 'events', 'knowledgeArticles', 'knowledgeCategories', 'settings'];
  const BACKUP_FORMAT = 2;
  const APP_NAME = 'БПС Пульт';
  const SAFE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);
  const MAX_PHOTOS_PER_RECORD = 3;
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
  const SAFE_DOCUMENT_MIMES = new Set([
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/rtf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/json', 'application/xml', 'text/xml', 'application/zip',
  ]);
  const MAX_DOCUMENTS_PER_ARTICLE = 5;
  const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
  const MAX_DOCUMENT_TOTAL_BYTES = 30 * 1024 * 1024;

  const clone = value => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
  const text = value => String(value ?? '').trim();
  const iso = value => {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : text(value);
  };
  const nullableIso = value => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : text(value);
  };
  const array = value => Array.isArray(value) ? value : [];
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const uniqueStrings = value => [...new Set(array(value).map(text).filter(Boolean))];
  const stableId = (prefix, fallback) => text(fallback) || `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const parseBase64DataUrl = (value, allowedMimes, message) => {
    const match = /^data:([^;,]+);base64,([a-z0-9+/]+={0,2})$/i.exec(String(value || ''));
    if (!match || !allowedMimes.has(match[1].toLowerCase()) || match[2].length % 4 === 1) {
      throw new Error(message);
    }
    return { mime: match[1].toLowerCase(), base64: match[2] };
  };
  const parseImageDataUrl = value => parseBase64DataUrl(value, SAFE_IMAGE_MIMES, 'Некорректное или небезопасное изображение в резервной копии.');
  const parseDocumentDataUrl = value => parseBase64DataUrl(value, SAFE_DOCUMENT_MIMES, 'Некорректный или неподдерживаемый документ в резервной копии.');
  const isSafeImageDataUrl = value => {
    try { parseImageDataUrl(value); return true; } catch (_) { return false; }
  };

  function normalizeRecord(store, input = {}) {
    const item = record(input) ? clone(input) : {};
    const createdAt = iso(item.createdAt || item.date || item.updatedAt);
    const updatedAt = iso(item.updatedAt || item.createdAt || item.date);
    if (store === 'entries') return {
      ...item,
      id: stableId('entry', item.id),
      type: text(item.type) || 'Прочее',
      object: text(item.object) || 'Другое',
      equipment: text(item.equipment),
      description: text(item.description),
      status: text(item.status) || 'Информация',
      date: iso(item.date),
      eventId: text(item.eventId) || null,
      photos: array(item.photos).filter(value => typeof value === 'string' && isSafeImageDataUrl(value)),
      createdAt, updatedAt,
    };
    if (store === 'tasks') return {
      ...item,
      id: stableId('task', item.id),
      title: text(item.title) || 'Задача',
      object: text(item.object),
      priority: text(item.priority) || 'Обычный',
      dueAt: nullableIso(item.dueAt),
      description: text(item.description),
      completed: Boolean(item.completed),
      completedAt: item.completed ? nullableIso(item.completedAt || item.updatedAt) : null,
      eventId: text(item.eventId) || null,
      linkedEntryId: text(item.linkedEntryId) || null,
      linkedInspectionId: text(item.linkedInspectionId) || null,
      createdAt, updatedAt,
    };
    if (store === 'inspections') return {
      ...item,
      id: stableId('inspection', item.id),
      object: text(item.object) || 'Другое',
      equipment: text(item.equipment),
      date: iso(item.date),
      eventId: text(item.eventId) || null,
      items: array(item.items).map(row => ({ name: text(row?.name), status: ['good', 'issue', 'pending', 'skip'].includes(row?.status) ? row.status : 'pending' })).filter(row => row.name),
      conclusion: text(item.conclusion),
      photos: array(item.photos).filter(value => typeof value === 'string' && isSafeImageDataUrl(value)),
      createdAt, updatedAt,
    };
    if (store === 'equipment') return {
      ...item,
      id: stableId('equipment', item.id),
      name: text(item.name) || 'Оборудование',
      type: text(item.type),
      object: text(item.object),
      location: text(item.location),
      designation: text(item.designation),
      status: text(item.status) || 'Работает',
      ip: text(item.ip),
      serial: text(item.serial),
      note: text(item.note),
      favorite: Boolean(item.favorite),
      createdAt, updatedAt,
    };
    if (store === 'events') {
      const normalized = {
        ...item,
        id: stableId('event', item.id),
        name: text(item.name) || 'Мероприятие',
        type: text(item.type) || 'Другое',
        date: nullableIso(item.date),
        doorsOpenAt: text(item.doorsOpenAt),
        expectedAudience: Math.max(0, Number(item.expectedAudience) || 0),
        note: text(item.note),
        status: text(item.status) || 'planned',
        systems: record(item.systems) ? item.systems : {},
        gates: array(item.gates),
        cashDesks: array(item.cashDesks),
        checklist: array(item.checklist),
        verifiedAt: nullableIso(item.verifiedAt),
        verifiedBy: text(item.verifiedBy),
        readinessHistory: array(item.readinessHistory).slice(-20),
        createdAt, updatedAt,
      };
      return typeof window !== 'undefined' && window.BpsEventLogic?.normalizeEvent
        ? window.BpsEventLogic.normalizeEvent(normalized)
        : normalized;
    }
    if (store === 'knowledgeArticles') {
      const normalized = {
        ...item,
        id: stableId('article', item.id),
        title: text(item.title) || 'Материал',
        categoryId: text(item.categoryId) || null,
        linkedEquipmentIds: uniqueStrings(item.linkedEquipmentIds),
        linkedEventIds: uniqueStrings(item.linkedEventIds),
        attachments: array(item.attachments).filter(attachment => record(attachment)).map(attachment => ({ ...attachment })),
        versions: array(item.versions).slice(-20),
        createdAt, updatedAt,
      };
      return typeof window !== 'undefined' && window.BpsKnowledgeLogic?.normalizeArticle
        ? window.BpsKnowledgeLogic.normalizeArticle(normalized)
        : normalized;
    }
    if (store === 'knowledgeCategories') {
      const normalized = {
        ...item,
        id: stableId('category', item.id),
        name: text(item.name) || 'Раздел',
        parentId: text(item.parentId) || null,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
        system: Boolean(item.system),
        createdAt, updatedAt,
      };
      return typeof window !== 'undefined' && window.BpsKnowledgeLogic?.normalizeCategory
        ? window.BpsKnowledgeLogic.normalizeCategory(normalized)
        : normalized;
    }
    if (store === 'settings') return { key: text(item.key), value: item.value };
    return item;
  }

  function migratePayload(payload) {
    if (!record(payload)) throw new Error('Архив не содержит корневой объект.');
    const sourceSchema = Number(payload.schemaVersion || 1);
    if (!Number.isInteger(sourceSchema) || sourceSchema < 1 || sourceSchema > CURRENT_SCHEMA) {
      throw new Error(`Схема резервной копии ${sourceSchema || 'не указана'} не поддерживается.`);
    }
    if (payload.app !== APP_NAME) throw new Error('Это не резервная копия БПС Пульта.');
    if (!record(payload.data)) throw new Error('В архиве отсутствует раздел data.');
    const migrated = {};
    for (const store of DATA_STORES) {
      const items = array(payload.data[store]);
      migrated[store] = items.map(item => normalizeRecord(store, item));
    }
    const settings = new Map(migrated.settings.filter(item => item.key).map(item => [item.key, item]));
    settings.set('dataSchemaVersion', { key: 'dataSchemaVersion', value: CURRENT_SCHEMA });
    migrated.settings = [...settings.values()];
    return {
      app: APP_NAME,
      version: text(payload.version) || 'unknown',
      schemaVersion: CURRENT_SCHEMA,
      sourceSchemaVersion: sourceSchema,
      exportedAt: nullableIso(payload.exportedAt),
      data: migrated,
      migrations: sourceSchema === CURRENT_SCHEMA ? [] : [`${sourceSchema} → ${CURRENT_SCHEMA}`],
    };
  }

  function validatePayload(payload) {
    const rawErrors = [];
    if (record(payload?.data)) {
      for (const store of DATA_STORES) {
        const seenRaw = new Set();
        array(payload.data[store]).forEach((item, index) => {
          const key = store === 'settings' ? text(item?.key) : text(item?.id);
          if (!key) rawErrors.push(`${store}[${index}]: отсутствует идентификатор.`);
          else if (seenRaw.has(key)) rawErrors.push(`${store}: повторяется идентификатор ${key}.`);
          else seenRaw.add(key);
          if (['entries', 'inspections'].includes(store)) {
            const photos = array(item?.photos);
            if (photos.length > MAX_PHOTOS_PER_RECORD) {
              rawErrors.push(`${store}[${index}].photos: допускается не более ${MAX_PHOTOS_PER_RECORD} фотографий.`);
            }
            photos.forEach((photo, photoIndex) => {
              if (typeof photo !== 'string' || !isSafeImageDataUrl(photo)) {
                rawErrors.push(`${store}[${index}].photos[${photoIndex}]: небезопасный или неподдерживаемый формат изображения.`);
                return;
              }
              try {
                if (dataUrlToBytes(photo).bytes.length > MAX_PHOTO_BYTES) {
                  rawErrors.push(`${store}[${index}].photos[${photoIndex}]: фотография больше 4 МБ.`);
                }
              } catch (_) {
                rawErrors.push(`${store}[${index}].photos[${photoIndex}]: не удалось проверить размер фотографии.`);
              }
            });
          }
          if (store === 'knowledgeArticles') {
            const attachments = array(item?.attachments);
            if (attachments.length > MAX_DOCUMENTS_PER_ARTICLE) {
              rawErrors.push(`${store}[${index}].attachments: допускается не более ${MAX_DOCUMENTS_PER_ARTICLE} документов.`);
            }
            let totalBytes = 0;
            attachments.forEach((attachment, attachmentIndex) => {
              const mime = text(attachment?.mime).toLowerCase();
              const data = attachment?.data;
              const size = Number(attachment?.size);
              if (!record(attachment) || !text(attachment.name)) rawErrors.push(`${store}[${index}].attachments[${attachmentIndex}]: отсутствует имя документа.`);
              if (!SAFE_DOCUMENT_MIMES.has(mime)) rawErrors.push(`${store}[${index}].attachments[${attachmentIndex}]: тип документа не поддерживается.`);
              if (typeof data !== 'string' || !data.startsWith(`data:${mime};base64,`)) {
                rawErrors.push(`${store}[${index}].attachments[${attachmentIndex}]: документ повреждён или прочитан некорректно.`);
                return;
              }
              try {
                const decoded = documentDataUrlToBytes(data);
                if (decoded.bytes.length > MAX_DOCUMENT_BYTES || size !== decoded.bytes.length) {
                  rawErrors.push(`${store}[${index}].attachments[${attachmentIndex}]: размер документа не должен превышать 10 МБ и должен совпадать с данными.`);
                }
                totalBytes += decoded.bytes.length;
              } catch (_) {
                rawErrors.push(`${store}[${index}].attachments[${attachmentIndex}]: не удалось проверить документ.`);
              }
            });
            if (totalBytes > MAX_DOCUMENT_TOTAL_BYTES) rawErrors.push(`${store}[${index}].attachments: общий размер документов не должен превышать 30 МБ.`);
          }
        });
      }
    }
    const migrated = migratePayload(payload);
    const errors = [...rawErrors];
    const warnings = [];
    for (const store of DATA_STORES) {
      const seen = new Set();
      migrated.data[store].forEach((item, index) => {
        const id = store === 'settings' ? item.key : item.id;
        if (!id) errors.push(`${store}[${index}]: отсутствует идентификатор.`);
        else if (seen.has(id)) errors.push(`${store}: повторяется идентификатор ${id}.`);
        else seen.add(id);
      });
    }
    const integrity = checkIntegrity(migrated.data);
    errors.push(...integrity.errors.map(item => item.message));
    warnings.push(...integrity.warnings.map(item => item.message));
    return { valid: errors.length === 0, errors, warnings, payload: migrated, counts: countStores(migrated.data) };
  }

  function countStores(data) {
    return Object.fromEntries(DATA_STORES.map(store => [store, array(data?.[store]).length]));
  }

  function previewImport(importedData, currentData = {}) {
    const counts = countStores(importedData);
    const duplicates = {};
    for (const store of DATA_STORES) {
      const currentIds = new Set(array(currentData[store]).map(item => store === 'settings' ? item.key : item.id));
      duplicates[store] = array(importedData[store]).filter(item => currentIds.has(store === 'settings' ? item.key : item.id)).length;
    }
    return { counts, duplicates, total: Object.values(counts).reduce((sum, value) => sum + value, 0), duplicateTotal: Object.values(duplicates).reduce((sum, value) => sum + value, 0) };
  }

  function mergeData(currentData, importedData) {
    const result = {};
    for (const store of DATA_STORES) {
      const keyOf = item => store === 'settings' ? item.key : item.id;
      const map = new Map(array(currentData[store]).map(item => [keyOf(item), clone(item)]));
      for (const item of array(importedData[store])) {
        const key = keyOf(item);
        const existing = map.get(key);
        if (!existing) { map.set(key, clone(item)); continue; }
        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const incomingTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
        if (store === 'settings') {
          if (key === 'dataSchemaVersion') map.set(key, { key, value: CURRENT_SCHEMA });
          continue;
        }
        if (Number.isFinite(incomingTime) && (!Number.isFinite(existingTime) || incomingTime >= existingTime)) {
          map.set(key, clone(item));
        }
      }
      result[store] = [...map.values()];
    }
    return result;
  }

  function checkIntegrity(data = {}) {
    const errors = [];
    const warnings = [];
    const info = [];
    const ids = store => new Set(array(data[store]).map(item => item.id));
    const eventIds = ids('events');
    const equipmentIds = ids('equipment');
    const articleIds = ids('knowledgeArticles');
    const categoryIds = ids('knowledgeCategories');
    const entryIds = ids('entries');
    const inspectionIds = ids('inspections');
    const validDate = value => !value || Number.isFinite(new Date(value).getTime());
    const add = (severity, code, message, store, id) => ({ severity, code, message, store, id });

    for (const store of DATA_STORES.filter(name => name !== 'settings')) {
      const seen = new Set();
      for (const item of array(data[store])) {
        if (!item?.id) errors.push(add('error', 'missing-id', `В ${store} найдена запись без идентификатора.`, store, null));
        else if (seen.has(item.id)) errors.push(add('error', 'duplicate-id', `В ${store} повторяется идентификатор ${item.id}.`, store, item.id));
        else seen.add(item.id);
        for (const field of ['date', 'dueAt', 'createdAt', 'updatedAt', 'completedAt', 'lastReviewedAt', 'lastOpenedAt']) {
          if (item?.[field] && !validDate(item[field])) warnings.push(add('warning', 'invalid-date', `${store}/${item.id}: некорректная дата в поле ${field}.`, store, item.id));
        }
      }
    }

    for (const item of array(data.entries)) if (item.eventId && !eventIds.has(item.eventId)) warnings.push(add('warning', 'orphan-event', `Запись ${item.id} ссылается на отсутствующее мероприятие.`, 'entries', item.id));
    for (const item of array(data.tasks)) {
      if (item.eventId && !eventIds.has(item.eventId)) warnings.push(add('warning', 'orphan-event', `Задача ${item.id} ссылается на отсутствующее мероприятие.`, 'tasks', item.id));
      if (item.linkedEntryId && !entryIds.has(item.linkedEntryId)) warnings.push(add('warning', 'orphan-entry', `Задача ${item.id} ссылается на отсутствующую запись.`, 'tasks', item.id));
      if (item.linkedInspectionId && !inspectionIds.has(item.linkedInspectionId)) warnings.push(add('warning', 'orphan-inspection', `Задача ${item.id} ссылается на отсутствующий осмотр.`, 'tasks', item.id));
    }
    for (const item of array(data.inspections)) if (item.eventId && !eventIds.has(item.eventId)) warnings.push(add('warning', 'orphan-event', `Осмотр ${item.id} ссылается на отсутствующее мероприятие.`, 'inspections', item.id));
    for (const item of array(data.knowledgeArticles)) {
      if (item.categoryId && !categoryIds.has(item.categoryId)) warnings.push(add('warning', 'orphan-category', `Материал ${item.id} находится в отсутствующем разделе.`, 'knowledgeArticles', item.id));
      uniqueStrings(item.linkedEquipmentIds).filter(id => !equipmentIds.has(id)).forEach(id => warnings.push(add('warning', 'orphan-equipment', `Материал ${item.id} ссылается на отсутствующее оборудование ${id}.`, 'knowledgeArticles', item.id)));
      uniqueStrings(item.linkedEventIds).filter(id => !eventIds.has(id)).forEach(id => warnings.push(add('warning', 'orphan-event', `Материал ${item.id} ссылается на отсутствующее мероприятие ${id}.`, 'knowledgeArticles', item.id)));
    }
    for (const category of array(data.knowledgeCategories)) {
      if (category.parentId && !categoryIds.has(category.parentId)) warnings.push(add('warning', 'orphan-parent', `Раздел ${category.id} ссылается на отсутствующий родительский раздел.`, 'knowledgeCategories', category.id));
      if (category.parentId === category.id) errors.push(add('error', 'category-cycle', `Раздел ${category.id} ссылается сам на себя.`, 'knowledgeCategories', category.id));
    }
    const categoryById = new Map(array(data.knowledgeCategories).map(item => [item.id, item]));
    const reportedCycles = new Set();
    for (const category of categoryById.values()) {
      if (category.parentId === category.id) continue;
      const path = [];
      const positions = new Map();
      let current = category;
      while (current?.parentId && categoryById.has(current.parentId)) {
        if (positions.has(current.id)) {
          const cycle = path.slice(positions.get(current.id)).sort().join('|');
          if (!reportedCycles.has(cycle)) {
            reportedCycles.add(cycle);
            errors.push(add('error', 'category-cycle', `Обнаружен цикл вложенности разделов: ${path.slice(positions.get(current.id)).join(' → ')}.`, 'knowledgeCategories', current.id));
          }
          break;
        }
        positions.set(current.id, path.length);
        path.push(current.id);
        current = categoryById.get(current.parentId);
      }
    }
    for (const event of array(data.events)) {
      const gateIds = new Set();
      for (const gate of array(event.gates)) {
        if (!gate.id) warnings.push(add('warning', 'gate-missing-id', `В мероприятии ${event.id} найден гейт без идентификатора.`, 'events', event.id));
        else if (gateIds.has(gate.id)) errors.push(add('error', 'duplicate-gate', `В мероприятии ${event.id} повторяется гейт ${gate.id}.`, 'events', event.id));
        else gateIds.add(gate.id);
        const turnstileIds = new Set();
        for (const turnstile of array(gate.turnstiles)) {
          if (turnstile.id && turnstileIds.has(turnstile.id)) errors.push(add('error', 'duplicate-turnstile', `В гейте ${gate.id} повторяется турникет ${turnstile.id}.`, 'events', event.id));
          if (turnstile.id) turnstileIds.add(turnstile.id);
        }
      }
    }
    info.push({ code: 'objects-checked', message: `Проверено объектов: ${Object.values(countStores(data)).reduce((sum, value) => sum + value, 0)}.` });
    return { ok: errors.length === 0, errors, warnings, info, checkedAt: new Date().toISOString(), counts: countStores(data), referencedArticleCount: articleIds.size };
  }

  function sanitizeDiagnostic(error, context = {}) {
    const safeError = error || {};
    return {
      app: APP_NAME,
      version: text(context.version),
      schemaVersion: Number(context.schemaVersion || CURRENT_SCHEMA),
      generatedAt: new Date().toISOString(),
      phase: text(context.phase) || 'runtime',
      error: {
        name: text(safeError.name) || 'Error',
        message: text(safeError.message).slice(0, 500) || 'Неизвестная ошибка',
        stack: text(safeError.stack).split('\n').slice(0, 8).join('\n').replace(/(description|summary|notes|title)=([^&\s]+)/gi, '$1=[hidden]'),
      },
      environment: {
        userAgent: text(context.userAgent).slice(0, 300),
        standalone: Boolean(context.standalone),
        online: Boolean(context.online),
        persisted: context.persisted === true,
        storageUsage: Number(context.storageUsage || 0),
        storageQuota: Number(context.storageQuota || 0),
      },
      counts: record(context.counts) ? context.counts : {},
    };
  }

  function relatedChangesForDelete(store, id, data = {}, updatedAt = new Date().toISOString()) {
    const changes = [];
    const add = (relatedStore, before, patch) => changes.push({
      store: relatedStore,
      before: clone(before),
      after: { ...clone(before), ...patch, updatedAt },
    });
    if (store === 'entries') {
      array(data.tasks).filter(item => item.linkedEntryId === id).forEach(item => add('tasks', item, { linkedEntryId: null }));
    } else if (store === 'inspections') {
      array(data.tasks).filter(item => item.linkedInspectionId === id).forEach(item => add('tasks', item, { linkedInspectionId: null }));
    } else if (store === 'events') {
      array(data.entries).filter(item => item.eventId === id).forEach(item => add('entries', item, { eventId: null }));
      array(data.tasks).filter(item => item.eventId === id).forEach(item => add('tasks', item, { eventId: null }));
      array(data.inspections).filter(item => item.eventId === id).forEach(item => add('inspections', item, { eventId: null }));
      array(data.knowledgeArticles).filter(item => array(item.linkedEventIds).includes(id)).forEach(item => {
        add('knowledgeArticles', item, { linkedEventIds: array(item.linkedEventIds).filter(value => value !== id) });
      });
    } else if (store === 'equipment') {
      array(data.knowledgeArticles).filter(item => array(item.linkedEquipmentIds).includes(id)).forEach(item => {
        add('knowledgeArticles', item, { linkedEquipmentIds: array(item.linkedEquipmentIds).filter(value => value !== id) });
      });
    }
    return changes;
  }

  function reverseRelatedChange(current, change, updatedAt = new Date().toISOString()) {
    if (!current || !change?.before) return null;
    if (!change.after) return clone(change.before);
    const before = change.before;
    const after = change.after;
    const next = clone(current);
    let changed = false;
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.delete('updatedAt');
    for (const key of keys) {
      if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
      if (Array.isArray(before[key]) && Array.isArray(after[key]) && Array.isArray(current[key])) {
        const removed = before[key].filter(value => !after[key].includes(value));
        const added = after[key].filter(value => !before[key].includes(value));
        next[key] = current[key].filter(value => !added.includes(value));
        removed.forEach(value => { if (!next[key].includes(value)) next[key].push(clone(value)); });
        changed = JSON.stringify(next[key]) !== JSON.stringify(current[key]) || changed;
      } else if (JSON.stringify(current[key]) === JSON.stringify(after[key])) {
        next[key] = clone(before[key]);
        changed = true;
      }
    }
    if (changed) next.updatedAt = updatedAt;
    return next;
  }

  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }
  const write16 = (view, offset, value) => view.setUint16(offset, value, true);
  const write32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);
  const read16 = (view, offset) => view.getUint16(offset, true);
  const read32 = (view, offset) => view.getUint32(offset, true);
  const concatBytes = chunks => {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => { output.set(chunk, offset); offset += chunk.length; });
    return output;
  };

  function createZip(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let localOffset = 0;
    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const lv = new DataView(local.buffer);
      write32(lv, 0, 0x04034b50); write16(lv, 4, 20); write16(lv, 6, 0); write16(lv, 8, 0);
      write16(lv, 10, 0); write16(lv, 12, 0); write32(lv, 14, crc); write32(lv, 18, data.length); write32(lv, 22, data.length);
      write16(lv, 26, nameBytes.length); write16(lv, 28, 0);
      local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length); locals.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      write32(cv, 0, 0x02014b50); write16(cv, 4, 20); write16(cv, 6, 20); write16(cv, 8, 0); write16(cv, 10, 0);
      write16(cv, 12, 0); write16(cv, 14, 0); write32(cv, 16, crc); write32(cv, 20, data.length); write32(cv, 24, data.length);
      write16(cv, 28, nameBytes.length); write16(cv, 30, 0); write16(cv, 32, 0); write16(cv, 34, 0); write16(cv, 36, 0);
      write32(cv, 38, 0); write32(cv, 42, localOffset); central.set(nameBytes, 46); centrals.push(central);
      localOffset += local.length;
    }
    const centralOffset = localOffset;
    const centralBytes = concatBytes(centrals);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    write32(ev, 0, 0x06054b50); write16(ev, 4, 0); write16(ev, 6, 0); write16(ev, 8, files.length); write16(ev, 10, files.length);
    write32(ev, 12, centralBytes.length); write32(ev, 16, centralOffset); write16(ev, 20, 0);
    return concatBytes([...locals, centralBytes, eocd]);
  }

  function parseZip(bytesInput) {
    const bytes = bytesInput instanceof Uint8Array ? bytesInput : new Uint8Array(bytesInput);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
      if (read32(view, offset) === 0x06054b50) { eocd = offset; break; }
    }
    if (eocd < 0) throw new Error('ZIP-архив повреждён: не найден центральный каталог.');
    const entries = read16(view, eocd + 10);
    let cursor = read32(view, eocd + 16);
    const decoder = new TextDecoder();
    const files = new Map();
    for (let index = 0; index < entries; index++) {
      if (read32(view, cursor) !== 0x02014b50) throw new Error('ZIP-архив повреждён: неверная запись каталога.');
      const compression = read16(view, cursor + 10);
      if (compression !== 0) throw new Error('Архив использует неподдерживаемое сжатие.');
      const crc = read32(view, cursor + 16);
      const size = read32(view, cursor + 24);
      const nameLength = read16(view, cursor + 28);
      const extraLength = read16(view, cursor + 30);
      const commentLength = read16(view, cursor + 32);
      const localOffset = read32(view, cursor + 42);
      const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
      if (read32(view, localOffset) !== 0x04034b50) throw new Error(`ZIP-архив повреждён: отсутствует файл ${name}.`);
      const localNameLength = read16(view, localOffset + 26);
      const localExtraLength = read16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.slice(dataStart, dataStart + size);
      if (crc32(data) !== crc) throw new Error(`ZIP-архив повреждён: контрольная сумма ${name} не совпадает.`);
      files.set(name, data);
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return files;
  }

  function dataUrlToBytes(value) {
    const parsed = parseImageDataUrl(value);
    const binary = typeof atob === 'function' ? atob(parsed.base64) : Buffer.from(parsed.base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mime: parsed.mime, bytes };
  }
  function documentDataUrlToBytes(value) {
    const parsed = parseDocumentDataUrl(value);
    const binary = typeof atob === 'function' ? atob(parsed.base64) : Buffer.from(parsed.base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { mime: parsed.mime, bytes };
  }
  function bytesToDataUrl(mime, bytes) {
    const safeMime = text(mime).toLowerCase();
    if (!SAFE_IMAGE_MIMES.has(safeMime)) throw new Error('Архив содержит неподдерживаемый тип изображения.');
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
    return `data:${safeMime};base64,${base64}`;
  }
  function bytesToDocumentDataUrl(mime, bytes) {
    const safeMime = text(mime).toLowerCase();
    if (!SAFE_DOCUMENT_MIMES.has(safeMime)) throw new Error('Архив содержит неподдерживаемый тип документа.');
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
    return `data:${safeMime};base64,${base64}`;
  }

  function buildBackupArchive(data, meta = {}) {
    const clean = Object.fromEntries(DATA_STORES.map(store => [store, clone(array(data[store]))]));
    const files = [];
    for (const store of ['entries', 'inspections']) {
      for (const item of clean[store]) {
        item.photos = array(item.photos).map((photo, index) => {
          if (record(photo) && photo.attachment) return photo;
          if (typeof photo !== 'string' || !photo.startsWith('data:')) return null;
          const decoded = dataUrlToBytes(photo);
          const extension = decoded.mime === 'image/png' ? 'png' : 'jpg';
          const path = `attachments/${store}-${files.length}-${index}.${extension}`;
          files.push({ name: path, data: decoded.bytes });
          return { attachment: path, mime: decoded.mime, size: decoded.bytes.length };
        }).filter(Boolean);
      }
    }
    for (const item of clean.knowledgeArticles) {
      item.attachments = array(item.attachments).map((attachment, index) => {
        if (record(attachment) && attachment.attachment) return attachment;
        if (!record(attachment) || typeof attachment.data !== 'string') return null;
        const decoded = documentDataUrlToBytes(attachment.data);
        const path = `attachments/knowledge-${files.length}-${index}.bin`;
        files.push({ name: path, data: decoded.bytes });
        const { data, ...metadata } = attachment;
        return { ...metadata, attachment: path, mime: decoded.mime, size: decoded.bytes.length };
      }).filter(Boolean);
    }
    const manifest = {
      app: APP_NAME,
      backupFormat: BACKUP_FORMAT,
      version: text(meta.version),
      schemaVersion: CURRENT_SCHEMA,
      exportedAt: new Date().toISOString(),
      counts: countStores(clean),
      attachmentCount: files.length,
    };
    const encoder = new TextEncoder();
    files.unshift({ name: 'data.json', data: encoder.encode(JSON.stringify({ app: APP_NAME, version: manifest.version, schemaVersion: CURRENT_SCHEMA, exportedAt: manifest.exportedAt, data: clean })) });
    files.unshift({ name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) });
    return { bytes: createZip(files), manifest };
  }

  function readBackupArchive(bytes) {
    const files = parseZip(bytes);
    const decoder = new TextDecoder();
    if (!files.has('manifest.json') || !files.has('data.json')) throw new Error('Архив не содержит manifest.json или data.json.');
    let manifest;
    let payload;
    try { manifest = JSON.parse(decoder.decode(files.get('manifest.json'))); }
    catch (_) { throw new Error('Архив повреждён: manifest.json содержит некорректный JSON.'); }
    if (manifest.app !== APP_NAME || Number(manifest.backupFormat) !== BACKUP_FORMAT) throw new Error('Формат архива не поддерживается.');
    const actualAttachmentCount = [...files.keys()].filter(name => name.startsWith('attachments/')).length;
    if (Number(manifest.attachmentCount || 0) !== actualAttachmentCount) throw new Error('Архив повреждён: количество вложений не совпадает с манифестом.');
    try { payload = JSON.parse(decoder.decode(files.get('data.json'))); }
    catch (_) { throw new Error('Архив повреждён: data.json содержит некорректный JSON.'); }
    for (const store of ['entries', 'inspections']) {
      for (const item of array(payload.data?.[store])) {
        item.photos = array(item.photos).map(photo => {
          if (typeof photo === 'string') return photo;
          if (!record(photo) || !photo.attachment || !files.has(photo.attachment)) throw new Error(`В архиве отсутствует вложение ${photo?.attachment || ''}.`);
          if (!/^attachments\/[a-z0-9._-]+$/i.test(String(photo.attachment))) throw new Error('Архив содержит некорректный путь вложения.');
          const attachment = files.get(photo.attachment);
          if (Number(photo.size) !== attachment.length) throw new Error(`Архив повреждён: размер вложения ${photo.attachment} не совпадает.`);
          return bytesToDataUrl(photo.mime || 'image/jpeg', attachment);
        });
      }
    }
    for (const item of array(payload.data?.knowledgeArticles)) {
      item.attachments = array(item.attachments).map(attachment => {
        if (typeof attachment?.data === 'string') return attachment;
        if (!record(attachment) || !attachment.attachment || !files.has(attachment.attachment)) {
          throw new Error(`В архиве отсутствует вложение документа ${attachment?.attachment || ''}.`);
        }
        if (!/^attachments\/[a-z0-9._-]+$/i.test(String(attachment.attachment))) throw new Error('Архив содержит некорректный путь документа.');
        const file = files.get(attachment.attachment);
        if (Number(attachment.size) !== file.length) throw new Error(`Архив повреждён: размер документа ${attachment.attachment} не совпадает.`);
        return { ...attachment, data: bytesToDocumentDataUrl(attachment.mime, file) };
      });
    }
    return { manifest, payload };
  }

  return {
    APP_NAME, CURRENT_SCHEMA, DATA_STORES, BACKUP_FORMAT, SAFE_IMAGE_MIMES, MAX_PHOTOS_PER_RECORD, MAX_PHOTO_BYTES,
    SAFE_DOCUMENT_MIMES, MAX_DOCUMENTS_PER_ARTICLE, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_TOTAL_BYTES,
    normalizeRecord, migratePayload, validatePayload, countStores, previewImport, mergeData,
    checkIntegrity, sanitizeDiagnostic, relatedChangesForDelete, reverseRelatedChange, crc32, createZip, parseZip,
    buildBackupArchive, readBackupArchive, dataUrlToBytes, bytesToDataUrl, documentDataUrlToBytes, bytesToDocumentDataUrl, isSafeImageDataUrl,
  };
});
