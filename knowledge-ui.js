'use strict';

const KNOWLEDGE_TYPE_ICONS = {
  instruction: 'book', troubleshooting: 'wrench', regulation: 'inspection',
  reference: 'info', checklist: 'check', memo: 'alert'
};

function knowledgeTypeLabel(type) {
  return BpsKnowledgeLogic.ARTICLE_TYPES.find(item => item.value === type)?.label || type;
}
function knowledgeStatusLabel(status) {
  return BpsKnowledgeLogic.ARTICLE_STATUSES.find(item => item.value === status)?.label || status;
}
function knowledgeStatusTone(status) {
  if (status === 'current') return 'success';
  if (status === 'review') return 'warning';
  if (status === 'outdated') return 'danger';
  if (status === 'draft') return 'info';
  return 'neutral';
}
function knowledgeCategoryName(id) {
  return BpsKnowledgeLogic.categoryPath(id, state.data.knowledgeCategories) || 'Без раздела';
}
function knowledgeEffectiveStatus(article) {
  return BpsKnowledgeLogic.effectiveStatus(article);
}

async function ensureKnowledgeSeed() {
  const now = nowISO();
  let seeded = false;
  await runTransaction('knowledgeCategories', 'readwrite', stores => {
    const request = stores.knowledgeCategories.count();
    request.onsuccess = () => {
      if (request.result) return;
      seeded = true;
      for (const category of BpsKnowledgeLogic.DEFAULT_CATEGORIES) {
        stores.knowledgeCategories.put({ ...category, createdAt: now, updatedAt: now });
      }
    };
  });
  if (seeded) noteDataChange('knowledgeCategories');
}
window.ensureKnowledgeSeed = ensureKnowledgeSeed;

function knowledgeArticleRow(article) {
  const status = knowledgeEffectiveStatus(article);
  const type = knowledgeTypeLabel(article.type);
  const category = knowledgeCategoryName(article.categoryId);
  const content = `<button class="list-row swipe-content" data-kb-action="open-article" data-id="${esc(article.id)}">
    <span class="row-icon ${article.favorite ? 'accent' : knowledgeStatusTone(status)}">${icon(article.favorite ? 'star' : (KNOWLEDGE_TYPE_ICONS[article.type] || 'book'))}</span>
    <span class="list-row-main">
      <span class="list-row-title">${esc(article.title)}</span>
      <span class="list-row-meta">${esc(type)} · ${esc(category)}</span>
    </span>
    <span class="list-row-side"><span class="status-pill ${knowledgeStatusTone(status)}">${esc(knowledgeStatusLabel(status))}</span></span>
    <span class="list-row-chevron">${icon('chevron')}</span>
  </button>`;
  const actions = `<button class="swipe-action edit" data-gesture-action="edit-knowledge" data-id="${esc(article.id)}">${icon('edit')}<span>Изменить</span></button><button class="swipe-action delete" data-gesture-action="delete-knowledge" data-id="${esc(article.id)}">${icon('trash')}<span>Удалить</span></button>`;
  return `<div class="swipe-row" data-swipe-row data-id="${esc(article.id)}"><div class="swipe-actions">${actions}</div>${content}</div>`;
}

function knowledgeCategoryRows() {
  const categories = state.data.knowledgeCategories;
  const counts = BpsKnowledgeLogic.categoryCounts(state.data.knowledgeArticles, categories);
  const children = new Map();
  categories.forEach(category => {
    const key = category.parentId || '__root__';
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(category);
  });
  for (const items of children.values()) items.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'ru'));
  const rows = [];
  const walk = (parentId, depth = 0) => {
    (children.get(parentId || '__root__') || []).forEach(category => {
      const count = counts.get(category.id) || 0;
      rows.push(`<button class="knowledge-category-row" data-kb-action="select-category" data-id="${esc(category.id)}" style="--category-depth:${Math.min(depth, 3)}">
        <span class="row-icon">${icon(depth ? 'folder' : 'book')}</span>
        <span class="list-row-main"><span class="list-row-title">${esc(category.name)}</span><span class="list-row-meta">${count} ${plural(count, 'материал', 'материала', 'материалов')}</span></span>
        <span class="list-row-chevron">${icon('chevron')}</span>
      </button>`);
      walk(category.id, depth + 1);
    });
  };
  walk(null);
  return rows.join('');
}

function currentKnowledgeFilters() {
  return state.knowledge || (state.knowledge = { query: '', type: 'all', status: 'all', categoryId: null, favorite: false, showAll: false });
}

function knowledgeResultsHtml() {
  const filters = currentKnowledgeFilters();
  const articles = BpsKnowledgeLogic.filterArticles(
    state.data.knowledgeArticles,
    state.data.knowledgeCategories,
    filters,
    { equipment: state.data.equipment, events: state.data.events }
  );
  const hasActiveFilters = Boolean(filters.query || filters.categoryId || filters.favorite || filters.type !== 'all' || filters.status !== 'all');
  const context = filters.categoryId ? knowledgeCategoryName(filters.categoryId) : filters.favorite ? 'Избранное' : filters.query ? 'Результаты поиска' : filters.showAll ? 'Все материалы' : 'Последние материалы';
  return `<div class="section-head"><div><h2 class="section-title">${esc(context)}</h2><p class="section-subtitle">${articles.length} ${plural(articles.length, 'материал', 'материала', 'материалов')}</p></div>${filters.categoryId || filters.query || filters.favorite || filters.type !== 'all' || filters.status !== 'all' ? `<button class="text-button" data-kb-action="reset-filters">Сбросить</button>` : ''}</div>
    ${articles.length ? `<div class="list-card">${articles.map(knowledgeArticleRow).join('')}</div>` : emptyState(hasActiveFilters ? 'search' : 'book',hasActiveFilters ? 'Ничего не найдено' : 'База знаний пока пуста',hasActiveFilters ? 'Измените запрос или очистите фильтры.' : 'Создайте первую инструкцию, памятку или решение неисправности.', `<button class="button primary" ${hasActiveFilters ? 'data-kb-action="reset-filters"' : 'data-kb-action="new-article"'}>${icon(hasActiveFilters ? 'close' : 'plus')}${hasActiveFilters ? 'Очистить фильтры' : 'Создать материал'}</button>`)}`;
}

function renderKnowledge() {
  const filters = currentKnowledgeFilters();
  const articles = state.data.knowledgeArticles;
  const favorites = articles.filter(item => item.favorite);
  const review = articles.filter(item => knowledgeEffectiveStatus(item) === 'review');
  const recent = articles.filter(item => item.lastOpenedAt).sort((a,b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt)).slice(0,4);
  const hasActiveFilters = Boolean(filters.query || filters.categoryId || filters.favorite || filters.showAll || filters.type !== 'all' || filters.status !== 'all');
  return `<section class="page-lead knowledge-lead">
      <p>Структурированные инструкции, решения неисправностей и рабочие регламенты БПС.</p>
      <div class="button-row knowledge-actions"><button class="button primary" data-kb-action="new-article">${icon('plus')}Новый материал</button><button class="button" data-kb-action="manage-categories">${icon('folder')}Разделы</button></div>
    </section>
    <section class="section filters knowledge-filters">
      <div class="search-input-wrap">${icon('search')}<input id="knowledgeSearch" type="search" enterkeyhint="search" autocomplete="off" value="${esc(filters.query)}" placeholder="Ошибка, оборудование, работа или код" aria-label="Поиск по базе знаний"></div>
      <div class="filter-row" aria-label="Тип материала">
        <button class="chip ${filters.type === 'all' ? 'active' : ''}" data-kb-type="all">Все</button>
        ${BpsKnowledgeLogic.ARTICLE_TYPES.map(item => `<button class="chip ${filters.type === item.value ? 'active' : ''}" data-kb-type="${item.value}">${esc(item.label)}</button>`).join('')}
      </div>
      <div class="filter-row" aria-label="Дополнительные фильтры">
        <button class="chip ${filters.favorite ? 'active' : ''}" data-kb-favorite>${icon('star')}Избранное</button>
        <button class="chip ${filters.status === 'review' ? 'active' : ''}" data-kb-status="review">Требует проверки</button>
        <button class="chip ${filters.status === 'draft' ? 'active' : ''}" data-kb-status="draft">Черновики</button>
      </div>
    </section>
    <section class="section">
      <div class="knowledge-status-strip">
        <button data-kb-action="show-all"><strong>${articles.length}</strong><span>Материалы</span></button>
        <button data-kb-action="show-favorites"><strong>${favorites.length}</strong><span>Избранное</span></button>
        <button data-kb-action="show-review" class="${review.length ? 'is-warning' : ''}"><strong>${review.length}</strong><span>Проверить</span></button>
      </div>
    </section>
    ${!hasActiveFilters ? `<section class="section" data-knowledge-discovery><div class="section-head"><div><h2 class="section-title">Разделы</h2><p class="section-subtitle">Ищите материал по предметной области</p></div><button class="text-button" data-kb-action="manage-categories">Изменить</button></div><div class="list-card knowledge-category-list">${knowledgeCategoryRows()}</div></section>` : ''}
    ${!hasActiveFilters && recent.length ? `<section class="section" data-knowledge-discovery><div class="section-head"><div><h2 class="section-title">Недавно открытые</h2></div></div><div class="list-card">${recent.map(knowledgeArticleRow).join('')}</div></section>` : ''}
    ${hasActiveFilters || !recent.length ? `<section class="section" id="knowledgeResults">${knowledgeResultsHtml()}</section>` : '<section class="section" id="knowledgeResults" hidden></section>'}`;
}
window.renderKnowledge = renderKnowledge;

function knowledgeLinkedOptions(items, selectedIds, kind) {
  if (!items.length) return `<div class="quiet-state compact">${icon(kind === 'equipment' ? 'equipment' : 'calendar')}<span><strong>Нет доступных объектов</strong><small>${kind === 'equipment' ? 'Сначала добавьте оборудование' : 'Сначала создайте мероприятие'}</small></span></div>`;
  return `<div class="knowledge-link-list">${items.map(item => `<label class="knowledge-link-row"><input type="checkbox" value="${esc(item.id)}" ${selectedIds.includes(item.id) ? 'checked' : ''}><span><strong>${esc(item.name)}</strong><small>${kind === 'equipment' ? esc([item.object,item.type].filter(Boolean).join(' · ') || 'Оборудование') : esc(formatDate(item.date,{day:'numeric',month:'short',year:'numeric'}))}</small></span></label>`).join('')}</div>`;
}

function categoryOptions(selectedId, excludedIds = new Set()) {
  const categories = state.data.knowledgeCategories.filter(item => !excludedIds.has(item.id));
  return categories
    .slice()
    .sort((a,b) => knowledgeCategoryName(a.id).localeCompare(knowledgeCategoryName(b.id),'ru'))
    .map(item => `<option value="${esc(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${esc(knowledgeCategoryName(item.id))}</option>`).join('');
}

function openKnowledgeArticleForm(existing = null, restoredDraft = null) {
  const article = BpsKnowledgeLogic.normalizeArticle(existing || { type:'instruction', status:'current', favorite:false });
  let steps = [...(restoredDraft?.data?.steps || article.steps)];
  const body = `<form id="knowledgeForm" class="knowledge-form">
    <section class="form-section"><h3>Карточка материала</h3>
      <div class="field"><label class="required" for="knowledgeTitle">Название</label><input id="knowledgeTitle" required value="${esc(article.title)}" placeholder="Например: Диагностика считывателя турникета"></div>
      <div class="form-grid two"><div class="field"><label for="knowledgeType">Тип</label><select id="knowledgeType">${BpsKnowledgeLogic.ARTICLE_TYPES.map(item => `<option value="${item.value}" ${article.type === item.value ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></div><div class="field"><label class="required" for="knowledgeCategory">Раздел</label><select id="knowledgeCategory" required><option value="">Выберите раздел</option>${categoryOptions(article.categoryId)}</select></div></div>
      <div class="form-grid two"><div class="field"><label for="knowledgeStatus">Актуальность</label><select id="knowledgeStatus">${BpsKnowledgeLogic.ARTICLE_STATUSES.map(item => `<option value="${item.value}" ${article.status === item.value ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select></div><div class="field"><label for="knowledgeTags">Теги</label><input id="knowledgeTags" value="${esc(article.tags.join(', '))}" placeholder="ОФД, касса, срочно"></div></div>
      <div class="card toggle-card"><div class="toggle-row"><div class="toggle-copy"><strong>Добавить в избранное</strong><span>Показывать в быстром доступе</span></div><button type="button" class="switch ${article.favorite ? 'on' : ''}" id="knowledgeFavorite" role="switch" aria-checked="${article.favorite}" aria-label="Добавить материал в избранное"></button></div></div>
    </section>
    <section class="form-section"><h3>Содержание</h3>
      <div class="field"><label for="knowledgeSummary">Кратко</label><textarea id="knowledgeSummary" class="textarea-compact" placeholder="Что это за материал и какую задачу решает">${esc(article.summary)}</textarea></div>
      <div class="field"><label for="knowledgeApplies">Когда применяется</label><textarea id="knowledgeApplies" class="textarea-compact" placeholder="В какой ситуации открывать эту инструкцию">${esc(article.appliesWhen)}</textarea></div>
      <div class="field"><label for="knowledgePrerequisites">Что требуется</label><textarea id="knowledgePrerequisites" placeholder="Каждый пункт с новой строки">${esc(article.prerequisites.join('\n'))}</textarea><div class="field-help">Инструменты, доступы, тестовые билеты и предварительные условия.</div></div>
      <div class="field"><label>Порядок работы</label><div id="knowledgeStepsList" class="knowledge-step-editor"></div><button type="button" class="button small full" id="addKnowledgeStep">${icon('plus')}Добавить шаг</button><div class="field-help">Шаги можно перемещать вверх и вниз без переписывания текста.</div></div>
      <div class="field"><label for="knowledgeExpected">Ожидаемый результат</label><textarea id="knowledgeExpected" class="textarea-compact">${esc(article.expectedResult)}</textarea></div>
      <div class="field"><label for="knowledgeTroubleshooting">Если не получилось</label><textarea id="knowledgeTroubleshooting" placeholder="Диагностика, обходное решение и дальнейшие действия">${esc(article.troubleshooting)}</textarea></div>
      <div class="field"><label for="knowledgeNotes">Дополнительные сведения</label><textarea id="knowledgeNotes" placeholder="Команды, адреса, контакты и личный опыт">${esc(article.notes)}</textarea></div>
    </section>
    <section class="form-section"><div class="form-section-head"><div><h3>Связи</h3><p>Материал появится в контексте выбранных объектов</p></div></div>
      <div class="field"><label>Оборудование</label>${knowledgeLinkedOptions(state.data.equipment, article.linkedEquipmentIds, 'equipment')}</div>
      <div class="field"><label>Мероприятия</label>${knowledgeLinkedOptions(state.data.events, article.linkedEventIds, 'event')}</div>
    </section>
    ${existing ? `<button type="button" class="button danger full" data-kb-form-delete>${icon('trash')}Удалить материал</button>` : ''}
  </form>`;
  const node = openModal(existing ? 'Редактировать материал' : 'Новый материал', body, { actionHtml:'<button class="text-button" id="saveKnowledgeArticle">Сохранить</button>' });
  const favorite = node.querySelector('#knowledgeFavorite');
  favorite.addEventListener('click', () => {
    favorite.classList.toggle('on');
    favorite.setAttribute('aria-checked', String(favorite.classList.contains('on')));
  });
  const stepList = node.querySelector('#knowledgeStepsList');
  const syncSteps = () => {
    steps = [...stepList.querySelectorAll('[data-knowledge-step]')].map(input=>input.value.trim()).filter(Boolean);
  };
  const renderSteps = () => {
    stepList.innerHTML = steps.length ? steps.map((step,index)=>`<div class="knowledge-step-edit-row"><span class="step-number">${index+1}</span><textarea data-knowledge-step="${index}" aria-label="Шаг ${index+1}" placeholder="Действие">${esc(step)}</textarea><span class="step-reorder-actions"><button type="button" class="icon-button compact" data-step-up="${index}" ${index===0?'disabled':''} aria-label="Переместить шаг ${index+1} вверх">${icon('chevron')}</button><button type="button" class="icon-button compact step-down" data-step-down="${index}" ${index===steps.length-1?'disabled':''} aria-label="Переместить шаг ${index+1} вниз">${icon('chevron')}</button><button type="button" class="icon-button compact danger-ghost" data-step-remove="${index}" aria-label="Удалить шаг ${index+1}">${icon('trash')}</button></span></div>`).join('') : `<div class="quiet-state compact">${icon('info')}<span><strong>Шагов пока нет</strong><small>Добавьте первый шаг инструкции</small></span></div>`;
    stepList.querySelectorAll('[data-knowledge-step]').forEach(input=>input.addEventListener('input',()=>{const index=Number(input.dataset.knowledgeStep);steps[index]=input.value;}));
    stepList.querySelectorAll('[data-step-up]').forEach(button=>button.addEventListener('click',()=>{syncSteps();const index=Number(button.dataset.stepUp);[steps[index-1],steps[index]]=[steps[index],steps[index-1]];renderSteps();draftController?.schedule();}));
    stepList.querySelectorAll('[data-step-down]').forEach(button=>button.addEventListener('click',()=>{syncSteps();const index=Number(button.dataset.stepDown);[steps[index+1],steps[index]]=[steps[index],steps[index+1]];renderSteps();draftController?.schedule();}));
    stepList.querySelectorAll('[data-step-remove]').forEach(button=>button.addEventListener('click',()=>{syncSteps();steps.splice(Number(button.dataset.stepRemove),1);renderSteps();draftController?.schedule();}));
  };
  let draftController = null;
  renderSteps();
  node.querySelector('#addKnowledgeStep').addEventListener('click',()=>{syncSteps();steps.push('');renderSteps();const inputs=stepList.querySelectorAll('[data-knowledge-step]');inputs[inputs.length-1]?.focus();draftController?.schedule();});
  draftController=attachDraftAutosave(node,{
    type:'knowledge',entityId:existing?.id||'',restored:restoredDraft,formSelector:'#knowledgeForm',
    snapshot:()=>{
      syncSteps();
      const checked=[...node.querySelectorAll('.knowledge-link-list input[type="checkbox"]:checked')];
      return {
        values:formValues(node.querySelector('#knowledgeForm')),
        steps:[...steps],
        linkedEquipmentIds:checked.filter(input=>state.data.equipment.some(item=>item.id===input.value)).map(input=>input.value),
        linkedEventIds:checked.filter(input=>state.data.events.some(item=>item.id===input.value)).map(input=>input.value),
      };
    },
    restore:data=>{
      applyFormValues(node.querySelector('#knowledgeForm'),data.values);
      node.querySelectorAll('.knowledge-link-list input[type="checkbox"]').forEach(input=>{input.checked=[...(data.linkedEquipmentIds||[]),...(data.linkedEventIds||[])].includes(input.value);});
      steps=[...(data.steps||[])];renderSteps();
    },
  });
  node.querySelector('#saveKnowledgeArticle').addEventListener('click', async () => {
    const form = node.querySelector('#knowledgeForm');
    if (!form.reportValidity()) return;
    const linkedEquipmentIds = [...node.querySelectorAll('.knowledge-link-list input[type="checkbox"]')]
      .filter(input => input.checked && state.data.equipment.some(item => item.id === input.value)).map(input => input.value);
    const linkedEventIds = [...node.querySelectorAll('.knowledge-link-list input[type="checkbox"]')]
      .filter(input => input.checked && state.data.events.some(item => item.id === input.value)).map(input => input.value);
    const draft = {
      id: existing?.id || uid('knowledge'),
      title: node.querySelector('#knowledgeTitle').value,
      type: node.querySelector('#knowledgeType').value,
      categoryId: node.querySelector('#knowledgeCategory').value,
      status: node.querySelector('#knowledgeStatus').value,
      tags: node.querySelector('#knowledgeTags').value,
      favorite: favorite.classList.contains('on'),
      summary: node.querySelector('#knowledgeSummary').value,
      appliesWhen: node.querySelector('#knowledgeApplies').value,
      prerequisites: node.querySelector('#knowledgePrerequisites').value,
      steps: (syncSteps(), steps),
      expectedResult: node.querySelector('#knowledgeExpected').value,
      troubleshooting: node.querySelector('#knowledgeTroubleshooting').value,
      notes: node.querySelector('#knowledgeNotes').value,
      linkedEquipmentIds, linkedEventIds,
      createdAt: existing?.createdAt || nowISO(),
      lastReviewedAt: existing?.lastReviewedAt || null,
      lastOpenedAt: existing?.lastOpenedAt || null,
    };
    const validation = BpsKnowledgeLogic.validateArticle(draft);
    if (!validation.valid) { toast(validation.errors[0]); return; }
    const saved = BpsKnowledgeLogic.mergeForSave(existing, validation.article, nowISO());
    await dbPut('knowledgeArticles', saved);
    await draftController.clear();
    closeModal(); toast(existing ? 'Материал обновлён' : 'Материал сохранён'); await render();
  });
  node.querySelector('[data-kb-form-delete]')?.addEventListener('click', async () => {
    await draftController.clear();
    closeModal({ immediate:true });
    await softDelete('knowledgeArticles', existing.id, 'Материал');
  });
}
window.openKnowledgeArticleForm = openKnowledgeArticleForm;

function knowledgeDetailSection(title, content, className = '') {
  if (!content) return '';
  return `<section class="modal-section knowledge-detail-section ${className}"><h3 class="modal-section-title">${esc(title)}</h3>${content}</section>`;
}

async function openKnowledgeArticleDetail(id) {
  let article = state.data.knowledgeArticles.find(item => item.id === id);
  if (!article) return;
  article = { ...article, lastOpenedAt: nowISO() };
  await dbPut('knowledgeArticles', article);
  rememberRecent('knowledgeArticles',article.id,article.title);
  const status = knowledgeEffectiveStatus(article);
  const equipment = state.data.equipment.filter(item => article.linkedEquipmentIds.includes(item.id));
  const events = state.data.events.filter(item => article.linkedEventIds.includes(item.id));
  const prerequisites = article.prerequisites.length ? `<ul class="knowledge-bullet-list">${article.prerequisites.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
  const steps = article.steps.length ? `<ol class="knowledge-step-list">${article.steps.map(item => `<li><span>${esc(item)}</span></li>`).join('')}</ol>` : '';
  const links = [...equipment.map(item => `<button class="knowledge-related-row" data-related-action="equipment-detail" data-related-id="${esc(item.id)}">${icon('equipment')}<span><strong>${esc(item.name)}</strong><small>${esc([item.object,item.type].filter(Boolean).join(' · '))}</small></span>${icon('chevron')}</button>`), ...events.map(item => `<button class="knowledge-related-row" data-related-action="event-detail" data-related-id="${esc(item.id)}">${icon('calendar')}<span><strong>${esc(item.name)}</strong><small>${formatDate(item.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>${icon('chevron')}</button>`)].join('');
  const node = openModal('База знаний', `<article class="knowledge-article-detail">
    <header class="knowledge-article-header">
      <div class="knowledge-article-badges"><span class="status-pill ${knowledgeStatusTone(status)}">${esc(knowledgeStatusLabel(status))}</span><span class="tag">${esc(knowledgeTypeLabel(article.type))}</span></div>
      <h3>${esc(article.title)}</h3>
      <p>${esc(knowledgeCategoryName(article.categoryId))}</p>
    </header>
    ${status === 'review' ? `<div class="inline-message warning">${icon('alert')}<span>Материал давно не проверялся. Подтвердите актуальность после выполнения работ.</span></div>` : ''}
    ${knowledgeDetailSection('Кратко', article.summary ? `<p class="knowledge-prose">${nl2br(article.summary)}</p>` : '')}
    ${knowledgeDetailSection('Когда применяется', article.appliesWhen ? `<p class="knowledge-prose">${nl2br(article.appliesWhen)}</p>` : '')}
    ${knowledgeDetailSection('Что требуется', prerequisites)}
    ${knowledgeDetailSection('Порядок работы', steps, 'knowledge-steps-section')}
    ${knowledgeDetailSection('Ожидаемый результат', article.expectedResult ? `<div class="knowledge-callout success">${icon('check')}<p>${nl2br(article.expectedResult)}</p></div>` : '')}
    ${knowledgeDetailSection('Если не получилось', article.troubleshooting ? `<div class="knowledge-callout warning">${icon('wrench')}<p>${nl2br(article.troubleshooting)}</p></div>` : '')}
    ${knowledgeDetailSection('Дополнительные сведения', article.notes ? `<p class="knowledge-prose">${nl2br(article.notes)}</p>` : '')}
    ${article.tags.length ? knowledgeDetailSection('Теги', `<div class="knowledge-tags">${article.tags.map(tag => `<span class="tag">#${esc(tag)}</span>`).join('')}</div>`) : ''}
    ${links ? knowledgeDetailSection('Связано с', `<div class="knowledge-related-list">${links}</div>`) : ''}
    <div class="knowledge-detail-actions">
      <button class="button" id="toggleKnowledgeFavorite">${icon(article.favorite ? 'star-filled' : 'star')}${article.favorite ? 'В избранном' : 'В избранное'}</button>
      <button class="button" id="markKnowledgeReviewed">${icon('refresh')}Подтвердить актуальность</button>
      <button class="button" id="duplicateKnowledgeArticle">${icon('copy')}Дублировать</button>
      <button class="button" id="printKnowledgeArticle">${icon('report')}Печать</button>
      ${article.versions.length ? `<button class="button" id="openKnowledgeHistory">${icon('history')}История · ${article.versions.length}</button>` : ''}
      <button class="button primary" id="editKnowledgeArticle">${icon('edit')}Редактировать</button>
    </div>
  </article>`);
  node.querySelector('#toggleKnowledgeFavorite').addEventListener('click', async () => {
    article.favorite = !article.favorite; article.updatedAt = nowISO(); await dbPut('knowledgeArticles', article); closeModal(); toast(article.favorite ? 'Добавлено в избранное' : 'Удалено из избранного'); await render();
  });
  node.querySelector('#markKnowledgeReviewed').addEventListener('click', async () => {
    article.lastReviewedAt = nowISO(); if (article.status === 'review') article.status = 'current'; article.updatedAt = nowISO(); await dbPut('knowledgeArticles', article); closeModal(); toast('Актуальность подтверждена'); await render();
  });
  node.querySelector('#editKnowledgeArticle').addEventListener('click', () => { closeModal({ immediate:true }); openKnowledgeArticleForm(article); });
  node.querySelector('#duplicateKnowledgeArticle').addEventListener('click',async()=>{
    const copy=BpsKnowledgeLogic.normalizeArticle({...article,id:uid('knowledge'),title:`${article.title} — копия`,favorite:false,versions:[],lastOpenedAt:null,createdAt:nowISO(),updatedAt:nowISO()});
    await dbPut('knowledgeArticles',copy);closeModal({immediate:true});toast('Создана копия материала');await render();openKnowledgeArticleForm(copy);
  });
  node.querySelector('#printKnowledgeArticle').addEventListener('click',()=>{document.body.classList.add('printing-knowledge');window.print();setTimeout(()=>document.body.classList.remove('printing-knowledge'),500);});
  node.querySelectorAll('[data-related-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.relatedAction,targetId=button.dataset.relatedId;closeModal({immediate:true});handleAppAction(action,targetId);}));
  node.querySelector('#openKnowledgeHistory')?.addEventListener('click', () => { closeModal({ immediate:true }); openKnowledgeHistory(article); });
}
window.openKnowledgeArticleDetail = openKnowledgeArticleDetail;

function openKnowledgeHistory(article) {
  const versions = [...article.versions].reverse();
  const node = openModal('История изменений', versions.length ? `<div class="knowledge-history-list">${versions.map(version => `<div class="knowledge-history-row"><span class="row-icon">${icon('history')}</span><span><strong>Версия ${version.number}</strong><small>${formatFullDate(version.savedAt)}</small></span><button class="button small" data-restore-version="${esc(version.id)}">Восстановить</button></div>`).join('')}</div>` : emptyState('history','Истории пока нет','Предыдущая версия появится после первого изменения материала.'));
  node.querySelectorAll('[data-restore-version]').forEach(button => button.addEventListener('click', () => {
    confirmModal('Восстановить версию?', 'Текущее содержимое сохранится в истории, после чего будет восстановлена выбранная версия.', 'Восстановить', async () => {
      const restored = BpsKnowledgeLogic.restoreVersion(article, button.dataset.restoreVersion, nowISO());
      await dbPut('knowledgeArticles', restored); closeModal(); toast('Версия восстановлена'); await render();
    });
  }));
}

function openKnowledgeCategoryForm(existing = null) {
  const descendants = existing ? BpsKnowledgeLogic.descendantIds(existing.id, state.data.knowledgeCategories) : new Set();
  const body = `<form id="knowledgeCategoryForm"><div class="field"><label class="required" for="knowledgeCategoryName">Название</label><input id="knowledgeCategoryName" required value="${esc(existing?.name || '')}" placeholder="Например: Контроллеры"></div><div class="field"><label for="knowledgeCategoryParent">Родительский раздел</label><select id="knowledgeCategoryParent"><option value="">Корневой раздел</option>${categoryOptions(existing?.parentId || '', descendants)}</select></div>${existing && !existing.system ? `<button type="button" class="button danger full" id="deleteKnowledgeCategory">${icon('trash')}Удалить раздел</button>` : ''}</form>`;
  const node = openModal(existing ? 'Изменить раздел' : 'Новый раздел', body, { actionHtml:'<button class="text-button" id="saveKnowledgeCategory">Сохранить</button>' });
  node.querySelector('#saveKnowledgeCategory').addEventListener('click', async () => {
    const form = node.querySelector('#knowledgeCategoryForm'); if (!form.reportValidity()) return;
    const record = BpsKnowledgeLogic.normalizeCategory({
      ...existing, id: existing?.id || uid('kbcat'), name: node.querySelector('#knowledgeCategoryName').value,
      parentId: node.querySelector('#knowledgeCategoryParent').value || null,
      order: existing?.order ?? state.data.knowledgeCategories.length,
      createdAt: existing?.createdAt || nowISO(), updatedAt: nowISO(),
    });
    await dbPut('knowledgeCategories', record); closeModal({ immediate:true }); toast(existing ? 'Раздел обновлён' : 'Раздел создан'); await refreshData(); openKnowledgeCategoryManager();
  });
  node.querySelector('#deleteKnowledgeCategory')?.addEventListener('click', () => {
    const hasArticles = state.data.knowledgeArticles.some(item => item.categoryId === existing.id);
    const hasChildren = state.data.knowledgeCategories.some(item => item.parentId === existing.id);
    if (hasArticles || hasChildren) { toast('Сначала перенесите вложенные разделы и материалы'); return; }
    confirmModal('Удалить раздел?', 'Пустой раздел будет перемещён в корзину.', 'Удалить', async () => {
      closeModal({ immediate:true }); await softDelete('knowledgeCategories', existing.id, 'Раздел');
    }, true);
  });
}

function openKnowledgeCategoryManager() {
  const counts = BpsKnowledgeLogic.categoryCounts(state.data.knowledgeArticles, state.data.knowledgeCategories);
  const ordered = state.data.knowledgeCategories.slice().sort((a,b) => knowledgeCategoryName(a.id).localeCompare(knowledgeCategoryName(b.id),'ru'));
  const node = openModal('Разделы базы', `<div class="button-row spaced-bottom"><button class="button primary full" id="newKnowledgeCategory">${icon('plus')}Новый раздел</button></div><div class="list-card">${ordered.map(category => `<button class="list-row" data-edit-category="${esc(category.id)}"><span class="row-icon">${icon(category.parentId ? 'folder' : 'book')}</span><span class="list-row-main"><span class="list-row-title">${esc(category.name)}</span><span class="list-row-meta">${esc(category.parentId ? knowledgeCategoryName(category.parentId) : 'Корневой раздел')} · ${counts.get(category.id) || 0} материалов</span></span><span class="list-row-chevron">${icon('chevron')}</span></button>`).join('')}</div>`);
  node.querySelector('#newKnowledgeCategory').addEventListener('click', () => { closeModal({ immediate:true }); openKnowledgeCategoryForm(); });
  node.querySelectorAll('[data-edit-category]').forEach(button => button.addEventListener('click', () => {
    const category = state.data.knowledgeCategories.find(item => item.id === button.dataset.editCategory);
    closeModal({ immediate:true }); openKnowledgeCategoryForm(category);
  }));
}
window.openKnowledgeCategoryManager = openKnowledgeCategoryManager;

function updateKnowledgeResults(root) {
  const target = root.querySelector('#knowledgeResults');
  if (!target) return;
  target.innerHTML = knowledgeResultsHtml();
  const filters = currentKnowledgeFilters();
  const hideDiscovery = Boolean(filters.query || filters.categoryId || filters.favorite || filters.showAll || filters.type !== 'all' || filters.status !== 'all');
  const hasRecent = state.data.knowledgeArticles.some(article => article.lastOpenedAt);
  target.hidden = !hideDiscovery && hasRecent;
  root.querySelectorAll('[data-knowledge-discovery]').forEach(section => { section.hidden = hideDiscovery; });
  bindSwipeRows(target);
}

function bindKnowledgePageEvents(main) {
  if (state.route !== 'knowledge') return;
  const search = main.querySelector('#knowledgeSearch');
  search?.addEventListener('input', debounce(async () => {
    currentKnowledgeFilters().query = search.value;
    await setSetting('filter:knowledge', currentKnowledgeFilters());
    updateKnowledgeResults(main);
  }, 140));
  main.addEventListener('click', async event => {
    const target = event.target.closest('[data-kb-action],[data-kb-type],[data-kb-status],[data-kb-favorite]');
    if (!target) return;
    event.preventDefault();
    const filters = currentKnowledgeFilters();
    if (target.dataset.kbType) { filters.type = target.dataset.kbType; await setSetting('filter:knowledge',filters); await render(); return; }
    if (target.dataset.kbStatus) { filters.status = filters.status === target.dataset.kbStatus ? 'all' : target.dataset.kbStatus; await setSetting('filter:knowledge',filters); await render(); return; }
    if (target.hasAttribute('data-kb-favorite')) { filters.favorite = !filters.favorite; await setSetting('filter:knowledge',filters); await render(); return; }
    const action = target.dataset.kbAction;
    const id = target.dataset.id;
    if (action === 'new-article') openKnowledgeArticleForm();
    else if (action === 'manage-categories') openKnowledgeCategoryManager();
    else if (action === 'open-article') openKnowledgeArticleDetail(id);
    else if (action === 'select-category') { filters.categoryId = id; await setSetting('filter:knowledge',filters); await render(); }
    else if (action === 'show-all') { state.knowledge = { query:'', type:'all', status:'all', categoryId:null, favorite:false, showAll:true }; await setSetting('filter:knowledge',state.knowledge); await render(); }
    else if (action === 'show-favorites') { filters.favorite = true; filters.categoryId = null; filters.showAll = false; await setSetting('filter:knowledge',filters); await render(); }
    else if (action === 'show-review') { filters.status = 'review'; filters.categoryId = null; filters.showAll = false; await setSetting('filter:knowledge',filters); await render(); }
    else if (action === 'reset-filters') { state.knowledge = { query:'', type:'all', status:'all', categoryId:null, favorite:false, showAll:false }; await setSetting('filter:knowledge',state.knowledge); await render(); }
  });
}
window.bindKnowledgePageEvents = bindKnowledgePageEvents;

function knowledgeLinkedArticlesHtml(equipmentId = null, eventId = null) {
  const articles = state.data.knowledgeArticles.filter(article =>
    (equipmentId && article.linkedEquipmentIds?.includes(equipmentId)) ||
    (eventId && article.linkedEventIds?.includes(eventId))
  );
  if (!articles.length) return '';
  return `<div class="modal-section"><h3 class="modal-section-title">База знаний</h3><div class="list-card">${articles.slice(0,6).map(knowledgeArticleRow).join('')}</div></div>`;
}
window.knowledgeLinkedArticlesHtml = knowledgeLinkedArticlesHtml;
