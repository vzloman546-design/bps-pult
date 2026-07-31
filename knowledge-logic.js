'use strict';

window.BpsKnowledgeLogic = (() => {
  const ARTICLE_TYPES = [
    { value: 'instruction', label: 'Инструкция' },
    { value: 'troubleshooting', label: 'Решение неисправности' },
    { value: 'regulation', label: 'Регламент' },
    { value: 'reference', label: 'Справочная информация' },
    { value: 'checklist', label: 'Чек-лист' },
    { value: 'memo', label: 'Важная памятка' },
  ];

  const ARTICLE_STATUSES = [
    { value: 'current', label: 'Актуально' },
    { value: 'review', label: 'Требует проверки' },
    { value: 'draft', label: 'Черновик' },
    { value: 'outdated', label: 'Устарело' },
    { value: 'archived', label: 'Архив' },
  ];

  const DEFAULT_CATEGORIES = [
    ['kb_bps', 'Билетно-пропускная система', null],
    ['kb_turnstiles', 'Турникеты и гейты', null],
    ['kb_aggregator', 'Билетный агрегатор', null],
    ['kb_cash', 'Кассы и ОФД', null],
    ['kb_sib', 'СИБ', null],
    ['kb_network', 'Сеть и серверы', null],
    ['kb_events', 'Подготовка мероприятий', null],
    ['kb_emergency', 'Аварийные ситуации', null],
    ['kb_maintenance', 'Регламентные работы', null],
    ['kb_contacts', 'Контакты и подрядчики', null],
    ['kb_documents', 'Документы и договоры', null],
    ['kb_experience', 'Личный опыт и решения', null],
  ].map(([id, name, parentId], order) => ({ id, name, parentId, order, system: true }));

  const text = value => String(value ?? '').trim();
  const unique = items => [...new Set(items.filter(Boolean))];
  const lines = value => Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : String(value ?? '').split(/\r?\n/).map(text).filter(Boolean);
  const tags = value => unique(Array.isArray(value)
    ? value.map(item => text(item).replace(/^#/, '').toLowerCase())
    : String(value ?? '').split(/[,;\n]/).map(item => text(item).replace(/^#/, '').toLowerCase()));

  function normalizeCategory(input = {}) {
    return {
      id: text(input.id),
      name: text(input.name),
      parentId: text(input.parentId) || null,
      order: Number.isFinite(Number(input.order)) ? Number(input.order) : 0,
      system: Boolean(input.system),
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: input.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeArticle(input = {}) {
    const type = ARTICLE_TYPES.some(item => item.value === input.type) ? input.type : 'instruction';
    const status = ARTICLE_STATUSES.some(item => item.value === input.status) ? input.status : 'draft';
    return {
      id: text(input.id),
      title: text(input.title),
      type,
      categoryId: text(input.categoryId) || null,
      summary: text(input.summary),
      appliesWhen: text(input.appliesWhen),
      prerequisites: lines(input.prerequisites),
      steps: lines(input.steps),
      expectedResult: text(input.expectedResult),
      troubleshooting: text(input.troubleshooting),
      notes: text(input.notes),
      tags: tags(input.tags),
      status,
      favorite: Boolean(input.favorite),
      linkedEquipmentIds: unique((Array.isArray(input.linkedEquipmentIds) ? input.linkedEquipmentIds : []).map(text)),
      linkedEventIds: unique((Array.isArray(input.linkedEventIds) ? input.linkedEventIds : []).map(text)),
      versions: Array.isArray(input.versions) ? input.versions.slice(-20) : [],
      lastReviewedAt: input.lastReviewedAt || null,
      lastOpenedAt: input.lastOpenedAt || null,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: input.updatedAt || new Date().toISOString(),
      sample: Boolean(input.sample),
    };
  }

  function validateArticle(article) {
    const normalized = normalizeArticle(article);
    const errors = [];
    if (!normalized.title) errors.push('Укажите название материала.');
    if (!normalized.categoryId) errors.push('Выберите раздел базы знаний.');
    if (['instruction', 'checklist', 'regulation'].includes(normalized.type) && normalized.steps.length === 0) {
      errors.push('Добавьте хотя бы один шаг.');
    }
    if (normalized.type === 'troubleshooting' && !normalized.summary && !normalized.troubleshooting && normalized.steps.length === 0) {
      errors.push('Опишите симптом, порядок диагностики или решение.');
    }
    return { valid: errors.length === 0, errors, article: normalized };
  }

  const VERSION_FIELDS = [
    'title','type','categoryId','summary','appliesWhen','prerequisites','steps','expectedResult',
    'troubleshooting','notes','tags','status','linkedEquipmentIds','linkedEventIds'
  ];

  function snapshot(article) {
    const clean = normalizeArticle(article);
    const data = {};
    VERSION_FIELDS.forEach(field => { data[field] = clean[field]; });
    const lastNumber = clean.versions.reduce((maximum, version) => {
      const number = Number(version?.number);
      return Number.isFinite(number) ? Math.max(maximum, number) : maximum;
    }, 0);
    return {
      id: `version_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      number: lastNumber + 1,
      savedAt: clean.updatedAt || new Date().toISOString(),
      data,
    };
  }

  function meaningfulChanged(previous, next) {
    return VERSION_FIELDS.some(field => JSON.stringify(previous?.[field] ?? null) !== JSON.stringify(next?.[field] ?? null));
  }

  function mergeForSave(existing, input, now = new Date().toISOString()) {
    const next = normalizeArticle({ ...existing, ...input, id: input.id || existing?.id, updatedAt: now });
    if (!existing) return next;
    const prev = normalizeArticle(existing);
    if (meaningfulChanged(prev, next)) next.versions = [...prev.versions, snapshot(prev)].slice(-20);
    else next.versions = prev.versions;
    next.createdAt = prev.createdAt;
    next.lastOpenedAt = prev.lastOpenedAt;
    return next;
  }

  function effectiveStatus(article, now = new Date(), staleDays = 365) {
    const normalized = normalizeArticle(article);
    if (normalized.status !== 'current') return normalized.status;
    const source = normalized.lastReviewedAt || normalized.updatedAt || normalized.createdAt;
    const timestamp = new Date(source).getTime();
    if (!Number.isFinite(timestamp)) return 'review';
    return now.getTime() - timestamp > staleDays * 86400000 ? 'review' : 'current';
  }

  function categoryMap(categories = []) {
    return new Map(categories.map(item => [item.id, normalizeCategory(item)]));
  }

  function categoryPath(categoryId, categories = []) {
    const map = categoryMap(categories);
    const result = [];
    const seen = new Set();
    let current = map.get(categoryId);
    while (current && !seen.has(current.id)) {
      result.unshift(current.name);
      seen.add(current.id);
      current = current.parentId ? map.get(current.parentId) : null;
    }
    return result.join(' → ');
  }

  function descendantIds(categoryId, categories = []) {
    const children = new Map();
    categories.forEach(item => {
      const key = item.parentId || '__root__';
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(item.id);
    });
    const result = new Set([categoryId]);
    const walk = id => (children.get(id) || []).forEach(child => {
      if (!result.has(child)) { result.add(child); walk(child); }
    });
    walk(categoryId);
    return result;
  }

  function linkedContextText(article, context = {}) {
    const equipmentById = new Map((Array.isArray(context.equipment) ? context.equipment : []).map(item => [item.id, item]));
    const eventsById = new Map((Array.isArray(context.events) ? context.events : []).map(item => [item.id, item]));
    const equipment = article.linkedEquipmentIds.flatMap(id => {
      const item = equipmentById.get(id);
      return item ? [id, item.name, item.type, item.object, item.designation, item.ip, item.serial] : [id];
    });
    const events = article.linkedEventIds.flatMap(id => {
      const item = eventsById.get(id);
      return item ? [id, item.name, item.type, item.date] : [id];
    });
    return [...equipment, ...events].map(text).join(' ');
  }

  function searchBlob(article, categories = [], context = {}) {
    const normalized = normalizeArticle(article);
    return [
      normalized.title, normalized.summary, normalized.appliesWhen,
      normalized.prerequisites.join(' '), normalized.steps.join(' '),
      normalized.expectedResult, normalized.troubleshooting, normalized.notes,
      normalized.tags.join(' '), categoryPath(normalized.categoryId, categories),
      linkedContextText(normalized, context),
    ].join(' ').toLocaleLowerCase('ru-RU');
  }

  function filterArticles(articles = [], categories = [], filters = {}, contextOrNow = {}, now = new Date()) {
    const context = contextOrNow instanceof Date ? {} : contextOrNow;
    const currentDate = contextOrNow instanceof Date ? contextOrNow : now;
    const query = text(filters.query).toLocaleLowerCase('ru-RU');
    const allowedCategoryIds = filters.categoryId ? descendantIds(filters.categoryId, categories) : null;
    return articles
      .map(normalizeArticle)
      .filter(article => {
        const effective = effectiveStatus(article, currentDate);
        if (query && !searchBlob(article, categories, context).includes(query)) return false;
        if (filters.type && filters.type !== 'all' && article.type !== filters.type) return false;
        if (filters.status && filters.status !== 'all' && effective !== filters.status) return false;
        if (filters.favorite && !article.favorite) return false;
        if (allowedCategoryIds && !allowedCategoryIds.has(article.categoryId)) return false;
        if (!filters.includeArchived && effective === 'archived') return false;
        return true;
      })
      .sort((a, b) => {
        if (Boolean(a.favorite) !== Boolean(b.favorite)) return Number(b.favorite) - Number(a.favorite);
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });
  }

  function categoryCounts(articles = [], categories = []) {
    const result = new Map(categories.map(item => [item.id, 0]));
    articles.forEach(article => {
      const map = categoryMap(categories);
      let category = map.get(article.categoryId);
      const seen = new Set();
      while (category && !seen.has(category.id)) {
        result.set(category.id, (result.get(category.id) || 0) + 1);
        seen.add(category.id);
        category = category.parentId ? map.get(category.parentId) : null;
      }
    });
    return result;
  }

  function restoreVersion(article, versionId, now = new Date().toISOString()) {
    const normalized = normalizeArticle(article);
    const version = normalized.versions.find(item => item.id === versionId);
    if (!version) return normalized;
    return mergeForSave(normalized, { ...version.data, id: normalized.id }, now);
  }

  return {
    ARTICLE_TYPES, ARTICLE_STATUSES, DEFAULT_CATEGORIES,
    normalizeCategory, normalizeArticle, validateArticle, mergeForSave,
    effectiveStatus, categoryPath, descendantIds, filterArticles,
    categoryCounts, restoreVersion, searchBlob, lines, tags,
  };
})();
