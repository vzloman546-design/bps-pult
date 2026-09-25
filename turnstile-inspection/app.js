(() => {
  'use strict';

  const PX_PER_PT = 300 / 72;
  const PAGE_W = 3508;
  const PAGE_H = 2481;
  const PDF_W = 841.889764;
  const PDF_H = 595.303937;
  const STORAGE_KEY = 'turnstileInspection.v1';

  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const STATUS_OPTIONS = ['', 'Исправно', 'Требует обслуживания', 'Неисправно'];
  const SECTIONS = [
    { id: 'gate1', label: '1 гейт' },
    { id: 'gate2', label: '2 гейт' },
    { id: 'gate3', label: '3 гейт' },
    { id: 'gate4', label: '4 гейт' },
    { id: 'conclusion', label: 'Заключение' },
    { id: 'export', label: 'PDF' }
  ];

  const GATE_CODES = {
    1: ['SRS.G1 ТДМГН1', ...Array.from({length:8},(_,i)=>`SRS.G1 ТД${i+1}`), 'SRS.G1 ТДМГН2'],
    2: ['SRS.G2 ТДМГН1', ...Array.from({length:18},(_,i)=>`SRS.G2 ТД${i+1}`), 'SRS.G2 ТДМГН2'],
    3: ['SRS.G3 ТДМГН1', ...Array.from({length:18},(_,i)=>`SRS.G3 ТД${i+1}`), 'SRS.G3 ТДМГН2'],
    4: ['SRS.G4 ТДМГН1', ...Array.from({length:18},(_,i)=>`SRS.G4 ТД${i+1}`), 'SRS.G4 ТДМГН2']
  };

  const els = {
    tabs: document.getElementById('tabs'),
    view: document.getElementById('view'),
    prev: document.getElementById('prevBtn'),
    next: document.getElementById('nextBtn'),
    footerProgress: document.getElementById('footerProgress'),
    toast: document.getElementById('toast'),
    saveDot: document.getElementById('saveDot'),
    saveState: document.getElementById('saveState'),
    installBtn: document.getElementById('installBtn'),
    dialog: document.getElementById('confirmDialog'),
    dialogTitle: document.getElementById('dialogTitle'),
    dialogText: document.getElementById('dialogText'),
    dialogOk: document.getElementById('dialogOk')
  };

  let activeSection = localStorage.getItem('turnstileInspection.activeSection') || 'gate1';
  if (!SECTIONS.some(section => section.id === activeSection)) activeSection = 'gate1';
  let state = loadState();
  let saveTimer = null;
  let toastTimer = null;
  let deferredInstallPrompt = null;
  let renderAssetsPromise = null;

  function todayIso() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,10);
  }

  function makeDefaultTurnstile(code) {
    return { code, visual: '', power: '', reader: '', status: '', remarks: '' };
  }

  function makeDefaultState() {
    return {
      version: 1,
      general: {
        organization: '', actNo: '', object: '', date: todayIso(), place: '',
        timeFrom: '', timeTo: '', inspectors: '', basis: ''
      },
      gates: {
        1: GATE_CODES[1].map(makeDefaultTurnstile),
        2: GATE_CODES[2].map(makeDefaultTurnstile),
        3: GATE_CODES[3].map(makeDefaultTurnstile),
        4: GATE_CODES[4].map(makeDefaultTurnstile)
      },
      conclusion: {
        generalCondition: '', faults: '', recommendations: '', deadline: '',
        signers: [
          { person: '', date: '' }, { person: '', date: '' }, { person: '', date: '' }
        ]
      },
      updatedAt: Date.now()
    };
  }

  function normalizeState(raw) {
    const d = makeDefaultState();
    if (!raw || typeof raw !== 'object') return d;
    d.general = { ...d.general, ...(raw.general || {}) };
    for (const g of [1,2,3,4]) {
      const source = raw.gates?.[g] || raw.gates?.[String(g)] || [];
      d.gates[g] = GATE_CODES[g].map((code, i) => ({ ...makeDefaultTurnstile(code), ...(source[i] || {}), code }));
    }
    d.conclusion = { ...d.conclusion, ...(raw.conclusion || {}) };
    d.conclusion.signers = [0,1,2].map(i => ({ person:'', date:'', ...(raw.conclusion?.signers?.[i] || {}) }));
    d.updatedAt = raw.updatedAt || Date.now();
    return d;
  }

  function loadState() {
    try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch { return makeDefaultState(); }
  }

  function queueSave() {
    els.saveDot?.classList.add('saving');
    if (els.saveState) els.saveState.textContent = 'Сохранение…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 180);
  }

  function saveNow() {
    state.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    els.saveDot?.classList.remove('saving');
    if (els.saveState) els.saveState.textContent = '';
  }

  function escapeHtml(v='') {
    return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function toast(msg, ms=2400) {
    clearTimeout(toastTimer);
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  }

  function totalStatusCounts() {
    const out = { inspected: 70, ok:0, service:0, bad:0, blank:0 };
    for (const g of [1,2,3,4]) {
      for (const t of state.gates[g]) {
        if (t.status === 'Исправно') out.ok++;
        else if (t.status === 'Требует обслуживания') out.service++;
        else if (t.status === 'Неисправно') out.bad++;
        else out.blank++;
      }
    }
    return out;
  }

  function gateCounts(g) {
    const out = { total: state.gates[g].length, ok:0, service:0, bad:0, blank:0 };
    for (const t of state.gates[g]) {
      if (t.status === 'Исправно') out.ok++;
      else if (t.status === 'Требует обслуживания') out.service++;
      else if (t.status === 'Неисправно') out.bad++;
      else out.blank++;
    }
    return out;
  }

  function sectionComplete(id) {
    if (/^gate[1-4]$/.test(id)) return gateCounts(+id.slice(-1)).blank === 0;
    if (id === 'conclusion') return !!state.conclusion.generalCondition;
    if (id === 'export') return totalStatusCounts().blank === 0;
    return false;
  }

  function renderTabs() {
    els.tabs.innerHTML = SECTIONS.map(s => `<button type="button" class="tab ${activeSection===s.id?'active':''} ${sectionComplete(s.id)?'complete':''}" data-tab="${s.id}">${s.label}</button>`).join('');
    els.tabs.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => switchSection(b.dataset.tab)));
    requestAnimationFrame(() => els.tabs.querySelector('.tab.active')?.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'}));
  }

  function sectionIndex(id) {
    return SECTIONS.findIndex(section => section.id === id);
  }

  let sectionAnimation = null;

  function animateSection(direction) {
    if (!els.view?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sectionAnimation?.cancel();
    const offset = direction === 'forward' ? 14 : -14;
    sectionAnimation = els.view.animate([
      { opacity: 0.46, transform: `translate3d(${offset}px, 0, 0) scale(.997)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
    ], {
      duration: 380,
      easing: 'cubic-bezier(.16, 1, .3, 1)',
      fill: 'both'
    });
    sectionAnimation.finished.finally(() => {
      els.view.style.opacity = '';
      els.view.style.transform = '';
      sectionAnimation = null;
    }).catch(() => {});
  }

  function switchSection(id) {
    if (!id || id === activeSection) return;
    const direction = sectionIndex(id) >= sectionIndex(activeSection) ? 'forward' : 'back';
    activeSection = id;
    localStorage.setItem('turnstileInspection.activeSection', id);
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
    requestAnimationFrame(() => animateSection(direction));
  }

  function render() {
    renderTabs();
    if (/^gate[1-4]$/.test(activeSection)) renderGate(+activeSection.slice(-1));
    else if (activeSection === 'conclusion') renderConclusion();
    else renderExport();
    renderFooter();
  }

  function renderFooter() {
    const idx = SECTIONS.findIndex(s => s.id === activeSection);
    els.prev.disabled = idx === 0;
    els.prev.style.opacity = idx === 0 ? '.45' : '1';
    els.next.textContent = idx === SECTIONS.length - 1 ? 'Готово' : 'Далее';
    els.footerProgress.textContent = `${idx+1} из ${SECTIONS.length}`;
    els.prev.onclick = () => idx > 0 && switchSection(SECTIONS[idx-1].id);
    els.next.onclick = () => {
      if (idx < SECTIONS.length - 1) switchSection(SECTIONS[idx+1].id);
      else toast('Акт сохранён локально. Можно экспортировать PDF.');
    };
  }

  function bindValue(selector, getter, setter) {
    const el = els.view.querySelector(selector);
    if (!el) return;
    el.value = getter() ?? '';
    const event = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(event, () => { setter(el.value); queueSave(); renderTabs(); });
  }

  function renderGeneral() {
    els.view.innerHTML = `
      <section class="section-card">
        <h2>Общие данные акта</h2>
        <p class="help">Эти поля попадут на первую страницу исходного шаблона. Сохранение происходит автоматически после каждого изменения.</p>
        <div class="form-grid">
          <div class="field"><label>Организация</label><input id="organization" class="input" autocomplete="organization"></div>
          <div class="field"><label>Акт №</label><input id="actNo" class="input" inputmode="text"></div>
          <div class="field"><label>Объект</label><input id="object" class="input"></div>
          <div class="field"><label>Дата</label><input id="date" class="input" type="date"></div>
          <div class="field"><label>Место проведения</label><input id="place" class="input"></div>
          <div class="field"><label>Время начала</label><input id="timeFrom" class="input" type="time"></div>
          <div class="field"><label>Время окончания</label><input id="timeTo" class="input" type="time"></div>
          <div class="field full"><label>Осмотр провели</label><input id="inspectors" class="input" placeholder="Должности, Ф.И.О. через запятую"></div>
          <div class="field full"><label>Основание / причина осмотра</label><input id="basis" class="input"></div>
        </div>
      </section>
      <section class="section-card">
        <h3>Как работает офлайн</h3>
        <p class="help">После первого полного открытия приложение и шаблон акта сохраняются в кэше устройства. Заполненные данные не отправляются на сервер и остаются в локальном хранилище браузера/PWA.</p>
        <div class="note">Для надёжной автономной работы на iPhone и Android лучше добавить приложение на главный экран после первого открытия.</div>
      </section>`;
    for (const k of ['organization','actNo','object','date','place','timeFrom','timeTo','inspectors','basis']) {
      bindValue(`#${k}`, () => state.general[k], v => state.general[k] = v);
    }
  }

  function statusSelect(id, value, label) {
    return `<div class="field"><label>${label}</label><select id="${id}" class="select">${STATUS_OPTIONS.map(v=>`<option value="${escapeHtml(v)}" ${v===value?'selected':''}>${v || 'Не выбрано'}</option>`).join('')}</select></div>`;
  }

  function statusClass(s) { return s === 'Исправно' ? 'ok' : s === 'Требует обслуживания' ? 'warn' : s === 'Неисправно' ? 'bad' : ''; }
  function statusShort(s) { return s === 'Исправно' ? 'Исправно' : s === 'Требует обслуживания' ? 'Обслуживание' : s === 'Неисправно' ? 'Неисправно' : 'Не заполнено'; }

  function renderGate(g) {
    const c = gateCounts(g);
    els.view.innerHTML = `
      <section class="section-card gate-header-card">
        <h2>${g} гейт</h2>
        <div class="gate-summary">
          <div class="metric"><strong>${c.total-c.blank}</strong><span>заполнено</span></div>
          <div class="metric"><strong>${c.ok}</strong><span>исправно</span></div>
          <div class="metric"><strong>${c.service}</strong><span>обслуживание</span></div>
          <div class="metric"><strong>${c.bad}</strong><span>неисправно</span></div>
        </div>
        <div class="progressbar"><div style="width:${((c.total-c.blank)/c.total*100).toFixed(1)}%"></div></div>
        <div class="progress-text">${c.total-c.blank} из ${c.total} турникетов имеют итоговое состояние</div>
      </section>
      <section class="section-card">
        <div class="quickbar">
          <button type="button" id="clearGate" class="btn secondary small">Очистить гейт</button>
        </div>
        <div class="turnstile-list">
          ${state.gates[g].map((t,i)=>`
          <details class="turnstile" data-index="${i}">
            <summary>
              <span class="row-number">${i+1}</span>
              <span class="turn-code">${escapeHtml(t.code)}</span>
              <span class="status-pill ${statusClass(t.status)}">${statusShort(t.status)}</span>
            </summary>
            <div class="turn-body">
              <div class="form-grid">
                ${statusSelect(`visual-${i}`,t.visual,'Внешний и механический осмотр')}
                ${statusSelect(`power-${i}`,t.power,'Питание и индикация')}
                ${statusSelect(`reader-${i}`,t.reader,'Считыватель / контроль прохода')}
                ${statusSelect(`status-${i}`,t.status,'Итоговое состояние')}
                <div class="field full"><label>Замечания / необходимые работы</label><textarea id="remarks-${i}" class="textarea" placeholder="Оставить пустым, если замечаний нет">${escapeHtml(t.remarks)}</textarea></div>
              </div>
              <div class="turn-actions">
                <button type="button" class="btn success small one-ok" data-index="${i}">Исправен</button>
                <button type="button" class="btn secondary small one-clear" data-index="${i}">Очистить</button>
              </div>
            </div>
          </details>`).join('')}
        </div>
      </section>`;

    const setField = (i,k,v) => { state.gates[g][i][k]=v; queueSave(); updateGateRow(g,i); };
    state.gates[g].forEach((t,i) => {
      ['visual','power','reader','status'].forEach(k => {
        const e=els.view.querySelector(`#${k}-${i}`); e?.addEventListener('change',()=>setField(i,k,e.value));
      });
      const r=els.view.querySelector(`#remarks-${i}`); r?.addEventListener('input',()=>setField(i,'remarks',r.value));
    });
    els.view.querySelectorAll('.one-ok').forEach(b => b.addEventListener('click',()=>{ markTurnstileOk(g,+b.dataset.index); renderGate(g); renderTabs(); }));
    els.view.querySelectorAll('.one-clear').forEach(b => b.addEventListener('click',()=>{ clearTurnstile(g,+b.dataset.index); renderGate(g); renderTabs(); }));
    els.view.querySelector('#clearGate').onclick = async () => {
      if (await confirmAction('Очистить данные гейта?', `Все отметки по ${g} гейту будут удалены только из текущего акта.`)) {
        state.gates[g] = GATE_CODES[g].map(makeDefaultTurnstile); queueSave(); renderGate(g); renderTabs();
      }
    };
  }

  function updateGateRow(g,i) {
    const detail = els.view.querySelector(`.turnstile[data-index="${i}"]`);
    if (!detail) return;
    const t=state.gates[g][i];
    const pill=detail.querySelector('.status-pill');
    pill.className=`status-pill ${statusClass(t.status)}`; pill.textContent=statusShort(t.status);
    const c=gateCounts(g);
    const metrics=els.view.querySelectorAll('.metric strong');
    if(metrics.length>=4){ metrics[0].textContent=c.total-c.blank; metrics[1].textContent=c.ok; metrics[2].textContent=c.service; metrics[3].textContent=c.bad; }
    const bar=els.view.querySelector('.progressbar > div'); if(bar)bar.style.width=`${(c.total-c.blank)/c.total*100}%`;
    const pt=els.view.querySelector('.progress-text'); if(pt)pt.textContent=`${c.total-c.blank} из ${c.total} турникетов имеют итоговое состояние`;
  }

  function markTurnstileOk(g,i){ Object.assign(state.gates[g][i],{visual:'Исправно',power:'Исправно',reader:'Исправно',status:'Исправно',remarks:''}); queueSave(); }
  function clearTurnstile(g,i){ Object.assign(state.gates[g][i],{visual:'',power:'',reader:'',status:'',remarks:''}); queueSave(); }

  function renderConclusion() {
    const counts = [1,2,3,4].map(g=>gateCounts(g));
    els.view.innerHTML = `
      <section class="section-card center-title-card">
        <h2>Итоговое заключение</h2>
        <div class="gate-summary">
          <div class="metric"><strong>${counts.reduce((s,c)=>s+c.ok,0)}</strong><span>исправно</span></div>
          <div class="metric"><strong>${counts.reduce((s,c)=>s+c.service,0)}</strong><span>обслуживание</span></div>
          <div class="metric"><strong>${counts.reduce((s,c)=>s+c.bad,0)}</strong><span>неисправно</span></div>
          <div class="metric"><strong>${counts.reduce((s,c)=>s+c.blank,0)}</strong><span>не заполнено</span></div>
        </div>
        <div class="quickbar"><button id="autoConclusion" type="button" class="btn secondary small">Сформировать текст по результатам</button></div>
        <div class="form-grid one">
          <div class="field"><label>Общее техническое состояние оборудования</label><textarea id="generalCondition" class="textarea"></textarea></div>
          <div class="field"><label>Выявленные неисправности / дефекты, требующие устранения</label><textarea id="faults" class="textarea"></textarea></div>
          <div class="field"><label>Рекомендации и необходимые работы</label><textarea id="recommendations" class="textarea"></textarea></div>
          <div class="field"><label>Срок устранения выявленных замечаний</label><input id="deadline" class="input"></div>
        </div>
      </section>`;
    for(const k of ['generalCondition','faults','recommendations','deadline']) bindValue(`#${k}`,()=>state.conclusion[k],v=>state.conclusion[k]=v);
    els.view.querySelector('#autoConclusion').onclick = () => {
      const all = totalStatusCounts();
      state.conclusion.generalCondition = all.bad ? `По результатам осмотра выявлено ${all.bad} неисправных турникетов.` : all.service ? `Оборудование в целом работоспособно. ${all.service} турникетов требуют технического обслуживания.` : all.blank ? 'Техническое состояние оборудования будет определено после завершения осмотра всех турникетов.' : 'Оборудование исправно и работоспособно.';
      const issues=[];
      for(const g of [1,2,3,4]) for(const t of state.gates[g]) if(t.status!=='Исправно' && t.status && t.remarks) issues.push(`${t.code}: ${t.remarks}`);
      if(issues.length && !state.conclusion.faults) state.conclusion.faults=issues.join('; ');
      if((all.service||all.bad) && !state.conclusion.recommendations) state.conclusion.recommendations='Выполнить техническое обслуживание и устранить выявленные неисправности согласно замечаниям по турникетам.';
      queueSave(); renderConclusion(); renderTabs();
    };
  }

  function renderExport() {
    const all = totalStatusCounts();
    els.view.innerHTML = `
      <section class="section-card center-card">
        <h2>Готовый PDF</h2>
        <div class="gate-summary">
          <div class="metric"><strong>70</strong><span>турникетов</span></div>
          <div class="metric"><strong>${all.ok}</strong><span>исправно</span></div>
          <div class="metric"><strong>${all.service}</strong><span>обслуживание</span></div>
          <div class="metric"><strong>${all.bad}</strong><span>неисправно</span></div>
        </div>
        ${all.blank ? `<div class="note" style="margin-bottom:12px">Не заполнено итоговое состояние у ${all.blank} турникетов. Экспорт всё равно доступен, незаполненные ячейки останутся пустыми.</div>` : ''}
        <div class="export-grid">
          <div class="export-card"><h3>Скачать PDF</h3><p>Сохранить готовый шестистраничный акт на устройстве.</p><button id="downloadPdf" class="btn primary" type="button">Экспортировать PDF</button></div>
          <div class="export-card"><h3>Отправить</h3><p>Открыть системное меню «Поделиться» и выбрать Telegram, WhatsApp, почту и т. п.</p><button id="sharePdf" class="btn primary" type="button">Поделиться PDF</button></div>
          <div class="export-card"><h3>Распечатать</h3><p>Открыть системное окно печати с листами A4 в альбомной ориентации.</p><button id="printPdf" class="btn secondary" type="button">Печать</button></div>
          <div class="export-card"><h3>Предпросмотр</h3><p>Открыть сформированный PDF в новой вкладке без сохранения данных на сервере.</p><button id="previewPdf" class="btn secondary" type="button">Открыть PDF</button></div>
        </div>
      </section>
      <section class="section-card center-card">
        <h3>Управление локальными данными</h3>
        <div class="quickbar"><button id="newAct" class="btn warning" type="button">Новый акт / очистить форму</button></div>
        <p class="help">Очистка удаляет только текущие заполненные данные из локального хранилища этого браузера. Само PWA и шаблон остаются установленными.</p>
      </section>`;

    els.view.querySelector('#downloadPdf').onclick = () => withLoading('Формируется PDF…', async () => {
      const result=await generateDocument(); downloadBlob(result.pdfBlob, fileName()); toast('PDF сформирован');
    });
    els.view.querySelector('#sharePdf').onclick = () => withLoading('Подготавливается файл…', shareGeneratedPdf);
    els.view.querySelector('#previewPdf').onclick = () => {
      const w=window.open('', '_blank');
      withLoading('Формируется PDF…', async()=>{
        const result=await generateDocument(); const url=URL.createObjectURL(result.pdfBlob);
        if(w) w.location.href=url; else window.location.href=url;
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      });
    };
    els.view.querySelector('#printPdf').onclick = () => printGenerated();
    els.view.querySelector('#newAct').onclick = async () => {
      if(await confirmAction('Начать новый акт?', 'Все заполненные поля текущего акта будут очищены.')) {
        state=makeDefaultState(); saveNow(); activeSection='gate1'; localStorage.setItem('turnstileInspection.activeSection', activeSection); render(); toast('Создан новый пустой акт');
      }
    };
  }

  function fileName() {
    const d=state.general.date || todayIso(); const n=(state.general.actNo||'без-номера').replace(/[^0-9A-Za-zА-Яа-яЁё_-]+/g,'_');
    return `Акт_осмотра_турникетов_${d}_№${n}.pdf`;
  }

  async function confirmAction(title,text) {
    if (!els.dialog?.showModal) return confirm(`${title}\n\n${text}`);
    els.dialogTitle.textContent=title; els.dialogText.textContent=text;
    els.dialog.showModal();
    return new Promise(resolve => {
      const done=()=>{ els.dialog.removeEventListener('close',done); resolve(els.dialog.returnValue==='ok'); };
      els.dialog.addEventListener('close',done);
    });
  }

  async function withLoading(text, fn) {
    const overlay=document.createElement('div'); overlay.className='loading-overlay'; overlay.innerHTML=`<div class="loading-box"><div class="spinner"></div><strong>${escapeHtml(text)}</strong><p class="help" style="margin:8px 0 0">Обработка выполняется локально на устройстве.</p></div>`; document.body.appendChild(overlay);
    try { await fn(); } catch(e) { console.error(e); toast(`Ошибка: ${e?.message || e}`, 5000); }
    finally { overlay.remove(); }
  }

  // ---------- Rendering assets ----------
  async function loadImage(src) {
    return new Promise((resolve,reject)=>{ const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error(`Не удалось загрузить ${src}`)); i.src=src; });
  }

  async function getRenderAssets() {
    if(!renderAssetsPromise) renderAssetsPromise=(async()=>{
      const embedded=window.TURNSTILE_ASSETS;
      if(!embedded?.pages?.length || !embedded?.atlas || !embedded?.meta) throw new Error('Не загружен встроенный шаблон документа');
      const [pages,atlas] = await Promise.all([
        Promise.all(embedded.pages.map(src=>loadImage(src))),
        loadImage(embedded.atlas)
      ]);
      return {pages,atlas,meta:embedded.meta};
    })();
    return renderAssetsPromise;
  }

  function measureBitmap(meta, text, fontPt) {
    const scale=(fontPt*PX_PER_PT)/meta.fontSize;
    let w=0; for(const ch of String(text)) w += (meta.glyphs[ch] || meta.glyphs['?'] || {advance:meta.fontSize*.5}).advance*scale;
    return w;
  }

  function drawBitmapText(ctx, assets, text, x, baselineY, fontPt, {align='left'}={}) {
    text=String(text ?? ''); if(!text) return;
    const {atlas,meta}=assets; const scale=(fontPt*PX_PER_PT)/meta.fontSize;
    let cur=x;
    const total=measureBitmap(meta,text,fontPt);
    if(align==='center') cur-=total/2; else if(align==='right') cur-=total;
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    for(const ch of text) {
      const g=meta.glyphs[ch] || meta.glyphs['?']; if(!g) continue;
      if(ch!==' ' && g.w>0 && g.h>0) ctx.drawImage(atlas,g.x,g.y,g.w,g.h,cur+g.left*scale,baselineY+g.top*scale,g.w*scale,g.h*scale);
      cur += g.advance*scale;
    }
  }

  function wrapBitmap(meta, text, fontPt, maxWidth) {
    const paras=String(text||'').replace(/\r/g,'').split('\n'); const lines=[];
    for(const para of paras){
      if(!para.trim()){ lines.push(''); continue; }
      const words=para.trim().split(/\s+/); let line='';
      const pushLongWord=(word)=>{
        let part='';
        for(const ch of word){ const test=part+ch; if(part && measureBitmap(meta,test,fontPt)>maxWidth){ lines.push(part); part=ch; } else part=test; }
        return part;
      };
      for(const word of words){
        const test=line?`${line} ${word}`:word;
        if(measureBitmap(meta,test,fontPt)<=maxWidth){ line=test; }
        else if(!line){ line=pushLongWord(word); }
        else { lines.push(line); line=''; if(measureBitmap(meta,word,fontPt)<=maxWidth) line=word; else line=pushLongWord(word); }
      }
      if(line) lines.push(line);
    }
    return lines;
  }

  function drawTextBox(ctx, assets, text, box, opts={}) {
    if(!String(text||'').trim()) return;
    const {meta}=assets; const pad=opts.pad ?? 12; const align=opts.align||'center'; const valign=opts.valign||'middle';
    const sizes=opts.sizes || [9,8.5,8,7.5,7]; let chosen=sizes[sizes.length-1], lines=[];
    for(const pt of sizes){
      const lh=pt*PX_PER_PT*(opts.lineHeight||1.12); const maxLines=Math.max(1,Math.floor((box.h-pad*2)/lh));
      const candidate=wrapBitmap(meta,text,pt,box.w-pad*2);
      if(candidate.length<=maxLines){chosen=pt;lines=candidate;break;} lines=candidate;
    }
    const lineH=chosen*PX_PER_PT*(opts.lineHeight||1.12); const maxLines=Math.max(1,Math.floor((box.h-pad*2)/lineH));
    if(lines.length>maxLines){ lines=lines.slice(0,maxLines); let last=lines[maxLines-1]; while(last && measureBitmap(meta,last+'…',chosen)>box.w-pad*2) last=last.slice(0,-1); lines[maxLines-1]=last+'…'; }
    const totalH=lines.length*lineH;
    let baseY=box.y+pad+chosen*PX_PER_PT;
    if(valign==='middle') baseY=box.y+(box.h-totalH)/2+chosen*PX_PER_PT*.82;
    else if(valign==='bottom') baseY=box.y+box.h-pad-totalH+chosen*PX_PER_PT*.82;
    lines.forEach((line,i)=>{
      let x=box.x+pad; let a='left';
      if(align==='center'){x=box.x+box.w/2;a='center';} else if(align==='right'){x=box.x+box.w-pad;a='right';}
      drawBitmapText(ctx,assets,line,x,baseY+i*lineH,chosen,{align:a});
    });
  }

  function px(pt){ return pt*PX_PER_PT; }
  function drawLineValue(ctx,assets,text,x1,x2,lineY,fontPt=10,align='left') {
    if(!String(text||'').trim()) return;
    const y=px(lineY-1.4); const aX=align==='center'?px((x1+x2)/2):align==='right'?px(x2):px(x1);
    let t=String(text); let size=fontPt; while(size>7 && measureBitmap(assets.meta,t,size)>px(x2-x1)){size-=.5;}
    drawBitmapText(ctx,assets,t,aX,y,size,{align});
  }

  function formatDateRu(iso) {
    if(!iso) return '';
    const [y,m,d]=iso.split('-').map(Number); if(!y||!m||!d)return iso;
    return `«${String(d).padStart(2,'0')}» ${MONTHS_GEN[m-1]} ${y} г.`;
  }
  function formatShortDate(iso){ if(!iso)return''; const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; }

  function overlayPage1() {
    // Титульная страница нового шаблона не содержит заполняемых полей.
  }

  function drawGateRows(ctx,assets,g,x,y){
    const rows=state.gates[g];
    for(let i=0;i<rows.length;i++){
      const top=y[i], bottom=y[i+1], h=bottom-top;
      const vals=[rows[i].visual,rows[i].power,rows[i].reader,rows[i].status,rows[i].remarks];
      for(let c=0;c<5;c++){
        drawTextBox(ctx,assets,vals[c],{x:x[c+2]+3,y:top+3,w:x[c+3]-x[c+2]-6,h:h-6},{
          align:c===4?'left':'center',
          pad:c===4?12:8,
          sizes:c===4?[8.5,8,7.5,7]:[9,8.5,8,7.5]
        });
      }
    }
  }

  function drawGateSummaryPx(ctx,assets,g,slots,y1,y2){
    const c=gateCounts(g);
    const vals=[c.total,c.ok,c.service,c.bad];
    for(let i=0;i<slots.length;i++){
      const [x1,x2]=slots[i];
      ctx.fillStyle='rgb(237,237,237)';
      ctx.fillRect(x1-5,y1+18,(x2-x1)+10,(y2-y1)-36);
      drawTextBox(ctx,assets,String(vals[i]),{x:x1-5,y:y1+12,w:(x2-x1)+10,h:(y2-y1)-24},{align:'center',sizes:[9]});
    }
  }

  function overlayGatePage(ctx,assets,g,pageNo){
    if(g===1){
      const x=[197,315,817,1277,1655,2115,2493,3309];
      const y=[696,791,885,979,1073,1167,1261,1356,1450,1544,1638];
      drawGateRows(ctx,assets,g,x,y);
      drawGateSummaryPx(ctx,assets,g,[[1017,1116],[1319,1418],[1817,1917],[2153,2252]],1638,1735);
      return;
    }
    const coords={
      2:{x:[197,314,820,1279,1657,2117,2495,3310],slots:[[1021,1120],[1322,1422],[1821,1921],[2157,2256]]},
      3:{x:[199,318,820,1263,1647,2119,2474,3307],slots:[[1020,1120],[1322,1422],[1821,1920],[2157,2256]]},
      4:{x:[206,318,820,1263,1647,2119,2474,3300],slots:[[1020,1120],[1322,1422],[1821,1920],[2157,2256]]}
    };
    const y=[348,438,527,617,706,796,886,975,1065,1154,1244,1333,1423,1513,1602,1692,1781,1871,1961,2050,2140];
    const c=coords[g];
    drawGateRows(ctx,assets,g,c.x,y);
    drawGateSummaryPx(ctx,assets,g,c.slots,2140,2236);
  }

  function overlayConclusionPage(ctx,assets){
    const cols=[513,1044,1457,1871,2521,2993];
    const rows=[308,387,466,546,625];
    for(let g=1;g<=4;g++){
      const c=gateCounts(g);
      const vals=[c.ok,c.service,c.bad];
      const top=rows[g-1], bottom=rows[g];
      for(let j=0;j<3;j++){
        drawTextBox(ctx,assets,String(vals[j]),{
          x:cols[j+2]+3,y:top+3,w:cols[j+3]-cols[j+2]-6,h:bottom-top-6
        },{align:'center',sizes:[10]});
      }
    }
  }

  async function renderPages() {
    const assets=await getRenderAssets();
    const outputs=[];
    for(let p=1;p<=6;p++){
      const canvas=document.createElement('canvas');
      canvas.width=PAGE_W; canvas.height=PAGE_H;
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,PAGE_W,PAGE_H);
      ctx.drawImage(assets.pages[p-1],0,0);
      if(p===2) overlayGatePage(ctx,assets,1,p);
      else if(p===3) overlayGatePage(ctx,assets,2,p);
      else if(p===4) overlayGatePage(ctx,assets,3,p);
      else if(p===5) overlayGatePage(ctx,assets,4,p);
      else if(p===6) overlayConclusionPage(ctx,assets);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(
        b=>b?resolve(b):reject(new Error('Не удалось сформировать страницу PDF')),
        'image/jpeg',1
      ));
      outputs.push({blob,width:PAGE_W,height:PAGE_H});
      await new Promise(r=>setTimeout(r,0));
    }
    return outputs;
  }

  function concatUint8(chunks){ let n=0; chunks.forEach(c=>n+=c.length); const out=new Uint8Array(n); let o=0; chunks.forEach(c=>{out.set(c,o);o+=c.length;}); return out; }
  function ascii(s){ return new TextEncoder().encode(s); }

  async function buildPdfFromJpegs(pages) {
    const jpegs=[]; for(const p of pages) jpegs.push(new Uint8Array(await p.blob.arrayBuffer()));
    const n=pages.length; const objCount=2+n*3; const chunks=[]; const offsets=new Array(objCount+1).fill(0); let length=0;
    const push=c=>{ chunks.push(c); length+=c.length; };
    push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    const obj=(id,parts)=>{ offsets[id]=length; push(ascii(`${id} 0 obj\n`)); for(const p of parts) push(typeof p==='string'?ascii(p):p); push(ascii('\nendobj\n')); };
    obj(1,[`<< /Type /Catalog /Pages 2 0 R >>`]);
    const pageIds=Array.from({length:n},(_,i)=>3+i*3);
    obj(2,[`<< /Type /Pages /Count ${n} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`]);
    for(let i=0;i<n;i++){
      const pageId=3+i*3, imgId=pageId+1, contentId=pageId+2;
      obj(pageId,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W.toFixed(3)} ${PDF_H.toFixed(3)}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
      const jpg=jpegs[i];
      obj(imgId,[`<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,jpg,`\nendstream`]);
      const content=`q\n${PDF_W.toFixed(3)} 0 0 ${PDF_H.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`; const cb=ascii(content);
      obj(contentId,[`<< /Length ${cb.length} >>\nstream\n`,cb,`endstream`]);
    }
    const xrefOffset=length; push(ascii(`xref\n0 ${objCount+1}\n0000000000 65535 f \n`));
    for(let i=1;i<=objCount;i++) push(ascii(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`));
    push(ascii(`trailer\n<< /Size ${objCount+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
    return new Blob([concatUint8(chunks)],{type:'application/pdf'});
  }

  async function generateDocument(){ const pages=await renderPages(); const pdfBlob=await buildPdfFromJpegs(pages); return {pages,pdfBlob}; }

  function downloadBlob(blob,name){ const a=document.createElement('a'); const u=URL.createObjectURL(blob); a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000); }

  async function shareGeneratedPdf(){
    const result=await generateDocument(); const file=new File([result.pdfBlob],fileName(),{type:'application/pdf'});
    if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
      await navigator.share({title:'Акт технического осмотра турникетов',text:'Акт технического осмотра турникетов входных групп',files:[file]});
    } else { downloadBlob(result.pdfBlob,fileName()); toast('Системная отправка файлов недоступна — PDF сохранён на устройство',4200); }
  }

  function printGenerated(){
    const w=window.open('', '_blank');
    if(w) {
      w.document.open();
      w.document.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Подготовка печати…</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;padding:24px;background:#f3f6f9;color:#17202a}</style></head><body>Подготовка страниц…</body></html>');
      w.document.close();
    }
    withLoading('Подготавливаются страницы для печати…',async()=>{
      const pages=await renderPages();
      if(!w){
        const pdf=await buildPdfFromJpegs(pages);
        const u=URL.createObjectURL(pdf);
        window.location.href=u;
        return;
      }
      const urls=pages.map(p=>URL.createObjectURL(p.blob));
      const pageMarkup=urls.map((u,i)=>`<img class="page" src="${u}" alt="Страница ${i+1}">`).join('');
      w.document.open();
      w.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f3f6f9">
  <title>Печать акта</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#72777d;color:#17202a}
    .toolbar{
      position:sticky;top:0;z-index:20;
      display:flex;align-items:center;justify-content:center;gap:10px;
      padding:calc(10px + env(safe-area-inset-top)) 12px 10px;
      background:rgba(255,255,255,.96);
      border-bottom:1px solid #d9e1ea;
      backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)
    }
    .toolbar button{
      min-height:44px;border:0;border-radius:11px;padding:10px 18px;
      font:700 15px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      cursor:pointer
    }
    .print-btn{background:#0b5cab;color:white}
    .close-btn{background:#e9eef4;color:#344255}
    .hint{
      padding:10px 12px;text-align:center;background:#f3f6f9;
      color:#5f6c79;font-size:13px;line-height:1.4
    }
    .pages{padding:12px 0 calc(24px + env(safe-area-inset-bottom))}
    .page{
      width:min(297mm,calc(100vw - 24px));height:auto;display:block;
      margin:0 auto 12px;background:white;box-shadow:0 3px 20px rgba(0,0,0,.32)
    }
    @page{size:A4 landscape;margin:0}
    @media print{
      html,body{background:white}
      .toolbar,.hint{display:none!important}
      .pages{padding:0}
      .page{
        width:297mm;height:210mm;margin:0;box-shadow:none;object-fit:fill;
        page-break-after:always;break-after:page
      }
      .page:last-child{page-break-after:auto;break-after:auto}
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="print-btn" type="button" onclick="window.print()">Печать</button>
    <button class="close-btn" type="button" onclick="window.close()">Закрыть</button>
  </div>
  <div class="hint">Проверь страницы и нажми «Печать». Панель управления в документ не попадёт.</div>
  <main class="pages">${pageMarkup}</main>
</body>
</html>`);
      w.document.close();
      setTimeout(()=>urls.forEach(URL.revokeObjectURL),120000);
    });
  }

  // ---------- Install / offline ----------
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(console.error));
  const isIOSInstall = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  if (isIOSInstall) els.installBtn?.classList.remove('hidden');
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; els.installBtn.classList.remove('hidden'); });
  els.installBtn.addEventListener('click',async()=>{
    if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; els.installBtn.classList.add('hidden'); }
    else if(/iphone|ipad|ipod/i.test(navigator.userAgent)) toast('На iPhone: Поделиться → «На экран Домой»',4500);
  });

  render();
  saveNow();
})();