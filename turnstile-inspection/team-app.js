(() => {
  'use strict';

  const api = window.TeamApi;
  const ui = window.TeamUi;
  const cfg = window.TURNSTILE_TEAM_CONFIG || {};

  const els = {
    app: document.getElementById('teamApp'),
    nav: document.getElementById('teamNav'),
    back: document.getElementById('teamBackBtn'),
    bell: document.getElementById('teamBellBtn'),
    bellBadge: document.getElementById('teamBellBadge'),
    context: document.getElementById('teamContext')
  };

  const STATUS_OPTIONS = ['', 'Исправно', 'Требует обслуживания', 'Неисправно'];

  const state = {
    user: null,
    route: { name: 'boot' },
    realtime: [],
    refreshTimer: null,
    generating: new Set()
  };

  function closeRealtime() {
    for (const socket of state.realtime || []) {
      try { socket?.close(); } catch {}
    }
    state.realtime = [];
    clearTimeout(state.refreshTimer);
  }

  function trackRealtime(socket) {
    if (socket) state.realtime.push(socket);
    return socket;
  }

  function setChrome({ back = false, nav = true, bell = true, context = '' } = {}) {
    els.back.classList.toggle('hidden', !back);
    els.nav.classList.toggle('hidden', !nav);
    els.bell.classList.toggle('hidden', !bell);
    els.context.textContent = context;

    els.nav.querySelectorAll('[data-team-nav]').forEach(button => {
      const section = button.dataset.teamNav;
      const active =
        section === state.route.name ||
        (section === 'home' && ['gate','inspection','new-inspection','users','notifications','events'].includes(state.route.name));
      button.classList.toggle('active', active);
    });
  }

  function loading(text = 'Загрузка…') {
    els.app.innerHTML = `
      <section class="team-card team-empty">
        <div class="spinner"></div>
        <strong>${ui.escapeHtml(text)}</strong>
      </section>
    `;
  }

  function statusSelect(id, value, label, disabled = false) {
    return `
      <div class="field">
        <label for="${id}">${ui.escapeHtml(label)}</label>
        <select id="${id}" class="select" ${disabled ? 'disabled' : ''}>
          ${STATUS_OPTIONS.map(option =>
            `<option value="${ui.escapeHtml(option)}" ${option === value ? 'selected' : ''}>
              ${ui.escapeHtml(option || 'Не выбрано')}
            </option>`
          ).join('')}
        </select>
      </div>
    `;
  }

  function route(name, data = {}) {
    closeRealtime();
    state.route = { name, ...data };
    renderRoute().catch(handleError);
  }

  function handleError(error) {
    console.error(error);
    ui.toast(ui.errorMessage(error), 4200);
    if (error?.status === 401) showLogin();
  }

  async function refreshBell() {
    if (!state.user) return;
    try {
      const notifications = await api.notifications();
      const unread = notifications.filter(item => !item.read_at).length;
      els.bellBadge.textContent = String(unread);
      els.bellBadge.classList.toggle('hidden', unread === 0);
    } catch {}
  }

  async function boot() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => registration.update())
        .catch(() => {});
    }

    if (!api?.session?.token) {
      showLogin();
      return;
    }

    loading('Проверка учётной записи…');

    try {
      state.user = await api.me();
      await api.flushQueue();
      await refreshBell();

      const params = new URLSearchParams(location.search);
      const requestedInspection = Number(params.get('inspection'));
      const requestedGate = Number(params.get('gate'));

      if (Number.isInteger(requestedInspection) && requestedInspection > 0) {
        history.replaceState(null, '', location.pathname);

        if ([1,2,3,4].includes(requestedGate)) {
          route('gate', {
            inspectionId: requestedInspection,
            gateNo: requestedGate,
            fromHome: true
          });
        } else {
          route('inspection', { inspectionId: requestedInspection });
        }
      } else {
        route('home');
      }
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    closeRealtime();
    state.user = null;
    state.route = { name: 'login' };
    setChrome({ back: false, nav: false, bell: false, context: '' });

    els.app.innerHTML = `
      <div class="team-login-wrap">
        <section class="team-login">
          <h2>Вход</h2>
          <p class="help">Войди под своей учётной записью. После первого входа приложение запомнит сессию на этом телефоне.</p>
          <form id="teamLoginForm" class="team-stack">
            <div class="field">
              <label for="loginName">Логин</label>
              <input id="loginName" class="input" autocomplete="username" autocapitalize="none" required>
            </div>
            <div class="field">
              <label for="loginPassword">Пароль</label>
              <input id="loginPassword" class="input" type="password" autocomplete="current-password" required>
            </div>
            <button class="btn primary" type="submit">Войти</button>
            <div id="loginError" class="team-required-note hidden"></div>
          </form>
        </section>
      </div>
    `;

    const form = document.getElementById('teamLoginForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const errorBox = document.getElementById('loginError');
      button.disabled = true;
      button.textContent = 'Вход…';
      errorBox.classList.add('hidden');

      try {
        state.user = await api.login(
          document.getElementById('loginName').value,
          document.getElementById('loginPassword').value
        );
        await refreshBell();
        route('home');
      } catch (error) {
        errorBox.textContent = ui.errorMessage(error);
        errorBox.classList.remove('hidden');
      } finally {
        button.disabled = false;
        button.textContent = 'Войти';
      }
    });
  }

  async function loadActiveAssignments() {
    const rows = await api.inspections();
    const active = rows.filter(item => item.status === 'active');
    const assignments = [];

    for (const row of active) {
      const inspection = await api.inspection(row.id);
      for (const gate of inspection.gates || []) {
        if (gate.assigneeUserId === state.user.id && gate.status !== 'completed') {
          assignments.push({ inspection, gate });
        }
      }
    }

    return assignments;
  }

  async function renderInspectorHome() {
    setChrome({
      back: false,
      nav: true,
      bell: true,
      context: state.user.displayName
    });
    loading('Проверяю задания…');

    const assignments = await loadActiveAssignments();

    if (assignments.length === 1) {
      const only = assignments[0];
      route('gate', {
        inspectionId: only.inspection.id,
        gateNo: only.gate.gateNo,
        fromHome: true
      });
      return;
    }

    const assignmentHtml = assignments.length
      ? assignments.map(({ inspection, gate }) => `
          <button type="button" class="team-assignment" data-open-gate="${inspection.id}:${gate.gateNo}">
            <span class="team-assignment-main">
              <span class="team-assignment-title">${gate.gateNo} гейт</span>
              <span class="team-assignment-meta">${ui.escapeHtml(inspection.title || ('Осмотр №' + inspection.id))}</span>
              ${ui.progressBar(gate.completed, gate.total)}
            </span>
            <span aria-hidden="true">›</span>
          </button>
        `).join('')
      : `
        <div class="team-empty">
          <strong>Активных заданий нет</strong>
          <div class="team-muted">Когда будет назначен новый осмотр, он появится здесь автоматически.</div>
        </div>
      `;

    els.app.innerHTML = `
      <section class="team-card">
        <div class="team-card-title">
          <div>
            <h2>Мои задания</h2>
            <div class="team-muted">${ui.escapeHtml(state.user.displayName)}</div>
          </div>
          <div id="homeSync">${ui.syncLabel()}</div>
        </div>
        <div class="team-stack" style="margin-top:12px">${assignmentHtml}</div>
      </section>
    `;

    els.app.querySelectorAll('[data-open-gate]').forEach(button => {
      button.addEventListener('click', () => {
        const [inspectionId, gateNo] = button.dataset.openGate.split(':').map(Number);
        route('gate', { inspectionId, gateNo, fromHome: true });
      });
    });

    const inspectionIds = [...new Set(assignments.map(item => item.inspection.id))];
    for (const inspectionId of inspectionIds) {
      trackRealtime(api.connectRealtime(inspectionId, event => {
        if (['gate_progress','gate_reassigned','inspection_completed'].includes(event.type)) {
          clearTimeout(state.refreshTimer);
          state.refreshTimer = setTimeout(() => {
            if (state.route.name !== 'home') return;
            closeRealtime();
            renderInspectorHome().catch(() => {});
          }, 450);
        }
      }));
    }
  }

  function inspectionProgress(inspection) {
    const gates = inspection.gates || [];
    const completed = gates.reduce((sum, gate) => sum + gate.completed, 0);
    const total = gates.reduce((sum, gate) => sum + gate.total, 0);
    return { completed, total };
  }

  async function renderAdminHome() {
    setChrome({
      back: false,
      nav: true,
      bell: true,
      context: state.user.displayName + ' · Администратор'
    });
    loading('Загружаю осмотры…');

    const rows = await api.inspections();
    const activeRows = rows.filter(item => item.status === 'active');
    const active = [];

    for (const row of activeRows.slice(0, 10)) {
      active.push(await api.inspection(row.id));
    }

    const cards = active.length
      ? active.map(inspection => {
          const progress = inspectionProgress(inspection);
          return `
            <button class="team-assignment" type="button" data-open-inspection="${inspection.id}">
              <span class="team-assignment-main">
                <span class="team-assignment-title">${ui.escapeHtml(inspection.title || ('Осмотр №' + inspection.id))}</span>
                <span class="team-assignment-meta">
                  ${inspection.gates.map(g => g.gateNo + ' гейт').join(' · ')}
                </span>
                ${ui.progressBar(progress.completed, progress.total)}
              </span>
              <span aria-hidden="true">›</span>
            </button>
          `;
        }).join('')
      : '<div class="team-empty"><strong>Сейчас активных осмотров нет</strong><div class="team-muted">Создай новый осмотр и выбери только нужные сегодня гейты.</div></div>';

    els.app.innerHTML = `
      <section class="team-card">
        <div class="team-card-title">
          <div>
            <h2>Текущие осмотры</h2>
            <div class="team-muted">Прогресс обновляется у всех участников.</div>
          </div>
          <button id="newInspectionBtn" class="btn primary small" type="button">Новый осмотр</button>
        </div>
        <div class="team-stack" style="margin-top:12px">${cards}</div>
      </section>

      <section class="team-card">
        <h3>Управление</h3>
        <div class="team-actions">
          <button id="manageUsersBtn" class="btn secondary" type="button">Сотрудники</button>
          <button id="adminHistoryBtn" class="btn secondary" type="button">Архив актов</button>
        </div>
      </section>
    `;

    document.getElementById('newInspectionBtn').onclick = () => route('new-inspection');
    document.getElementById('manageUsersBtn').onclick = () => route('users');
    document.getElementById('adminHistoryBtn').onclick = () => route('history');

    els.app.querySelectorAll('[data-open-inspection]').forEach(button => {
      button.onclick = () => route('inspection', { inspectionId: Number(button.dataset.openInspection) });
    });

    for (const inspection of active) {
      trackRealtime(api.connectRealtime(inspection.id, event => {
        if (['gate_progress','gate_reassigned','gate_reopened','inspection_completed','document_ready'].includes(event.type)) {
          refreshBell().catch(() => {});
          clearTimeout(state.refreshTimer);
          state.refreshTimer = setTimeout(() => {
            if (state.route.name !== 'home') return;
            closeRealtime();
            renderAdminHome().catch(() => {});
          }, 450);
        }
      }));
    }
  }

  async function renderHome() {
    if (state.user.role === 'admin') return renderAdminHome();
    return renderInspectorHome();
  }

  async function renderGate() {
    setChrome({
      back: true,
      nav: false,
      bell: false,
      context: state.route.gateNo + ' гейт'
    });
    loading('Загружаю гейт…');

    const gate = await api.gate(state.route.inspectionId, state.route.gateNo);
    const checks = gate.checks || [];

    const completed = checks.filter(check => {
      if (!check.visual || !check.power || !check.reader || !check.status) return false;
      if (['Требует обслуживания','Неисправно'].includes(check.status) && !String(check.remarks || '').trim()) return false;
      return true;
    }).length;

    const ok = checks.filter(check => check.status === 'Исправно').length;
    const service = checks.filter(check => check.status === 'Требует обслуживания').length;
    const bad = checks.filter(check => check.status === 'Неисправно').length;

    els.app.innerHTML = `
      <div class="team-gate-screen">
        <section class="team-card gate-header-card">
          <h2>${gate.gateNo} гейт</h2>
          ${gate.readOnly ? '<div class="team-status-row" style="justify-content:center"><span class="team-chip brand">Только просмотр</span></div>' : ''}
          <div class="gate-summary">
            <div class="metric"><strong>${completed}</strong><span>заполнено</span></div>
            <div class="metric"><strong>${ok}</strong><span>исправно</span></div>
            <div class="metric"><strong>${service}</strong><span>обслуживание</span></div>
            <div class="metric"><strong>${bad}</strong><span>неисправно</span></div>
          </div>
          ${ui.progressBar(completed, checks.length)}
          <div id="gateSync" style="margin-top:8px">${ui.syncLabel()}</div>
        </section>

        <section class="team-card">
          <div class="turnstile-list">
            ${checks.map((check, index) => `
              <details class="turnstile" data-check-index="${index}">
                <summary>
                  <span class="row-number">${index + 1}</span>
                  <span class="turn-code">${ui.escapeHtml(check.code)}</span>
                  <span class="status-pill ${ui.statusClass(check.status)}">
                    ${ui.escapeHtml(check.status === 'Требует обслуживания' ? 'Обслуживание' : (check.status || 'Не заполнено'))}
                  </span>
                </summary>
                <div class="turn-body">
                  <div class="form-grid">
                    ${statusSelect('visual-' + index, check.visual, 'Внешний и механический осмотр', gate.readOnly)}
                    ${statusSelect('power-' + index, check.power, 'Питание и индикация', gate.readOnly)}
                    ${statusSelect('reader-' + index, check.reader, 'Считыватель / контроль прохода', gate.readOnly)}
                    ${statusSelect('status-' + index, check.status, 'Итоговое состояние', gate.readOnly)}
                    <div class="field full">
                      <label for="remarks-${index}">Замечания / необходимые работы</label>
                      <textarea id="remarks-${index}" class="textarea" placeholder="Обязательно при неисправности или обслуживании" ${gate.readOnly ? 'disabled' : ''}>${ui.escapeHtml(check.remarks || '')}</textarea>
                      <div id="remark-note-${index}" class="team-required-note ${(['Требует обслуживания','Неисправно'].includes(check.status) && !check.remarks) ? '' : 'hidden'}">
                        Для этого статуса нужно указать замечание.
                      </div>
                    </div>
                  </div>
                  ${state.user.role === 'admin' && check.lastUpdatedByName ? `
                    <div class="team-muted" style="margin-top:9px">
                      Последнее изменение: ${ui.escapeHtml(check.lastUpdatedByName)}
                      ${check.updatedAt ? ' · ' + ui.formatDate(check.updatedAt, true) : ''}
                    </div>
                  ` : ''}
                  ${gate.readOnly ? '' : `
                    <div class="turn-actions">
                      <button class="btn success small" type="button" data-all-ok="${index}">Исправен</button>
                      <button class="btn secondary small" type="button" data-clear-check="${index}">Очистить</button>
                    </div>
                  `}
                </div>
              </details>
            `).join('')}
          </div>
        </section>
      </div>
    `;

    const syncEl = document.getElementById('gateSync');

    const updateSync = () => {
      if (syncEl) syncEl.innerHTML = ui.syncLabel();
    };

    async function save(index, patch) {
      if (gate.readOnly) return;
      Object.assign(checks[index], patch);
      updateSync();

      try {
        const result = await api.updateCheck(
          state.route.inspectionId,
          state.route.gateNo,
          checks[index].code,
          patch
        );
        updateSync();

        if (result?.queued) {
          ui.toast('Нет сети. Изменение сохранено на телефоне.');
        }

        if (result?.inspectionStatus === 'completed') {
          ui.toast('Осмотр завершён. Акт формируется автоматически.', 3500);
        }
      } catch (error) {
        handleError(error);
      }
    }

    checks.forEach((check, index) => {
      ['visual','power','reader','status'].forEach(field => {
        const input = document.getElementById(field + '-' + index);
        input?.addEventListener('change', () => {
          const patch = { [field]: input.value };
          const note = document.getElementById('remark-note-' + index);

          if (field === 'status') {
            const needsRemark = ['Требует обслуживания','Неисправно'].includes(input.value);
            note?.classList.toggle('hidden', !(needsRemark && !String(checks[index].remarks || '').trim()));
          }

          save(index, patch);
          const pill = els.app.querySelector(`[data-check-index="${index}"] .status-pill`);
          if (field === 'status' && pill) {
            pill.className = 'status-pill ' + ui.statusClass(input.value);
            pill.textContent = input.value === 'Требует обслуживания'
              ? 'Обслуживание'
              : (input.value || 'Не заполнено');
          }
        });
      });

      const remarks = document.getElementById('remarks-' + index);
      let remarksTimer = null;

      remarks?.addEventListener('input', () => {
        checks[index].remarks = remarks.value;
        const note = document.getElementById('remark-note-' + index);
        const needsRemark = ['Требует обслуживания','Неисправно'].includes(checks[index].status);
        note?.classList.toggle('hidden', !(needsRemark && !remarks.value.trim()));

        clearTimeout(remarksTimer);
        remarksTimer = setTimeout(() => save(index, { remarks: remarks.value }), 450);
      });
    });

    els.app.querySelectorAll('[data-all-ok]').forEach(button => {
      button.onclick = async () => {
        const index = Number(button.dataset.allOk);
        const patch = {
          visual:'Исправно',
          power:'Исправно',
          reader:'Исправно',
          status:'Исправно',
          remarks:''
        };
        await save(index, patch);
        renderGate().catch(handleError);
      };
    });

    els.app.querySelectorAll('[data-clear-check]').forEach(button => {
      button.onclick = async () => {
        const index = Number(button.dataset.clearCheck);
        await save(index, {
          visual:'',
          power:'',
          reader:'',
          status:'',
          remarks:''
        });
        renderGate().catch(handleError);
      };
    });

    trackRealtime(api.connectRealtime(state.route.inspectionId, event => {
      if (event.type === 'gate_progress' && event.gateNo === state.route.gateNo) {
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => {
          if (state.route.name === 'gate') renderGate().catch(() => {});
        }, 600);
      }
      if (event.type === 'inspection_completed') {
        ui.toast('Все выбранные гейты завершены. Акт формируется автоматически.', 3800);
      }
      if (event.type === 'document_ready') {
        ui.toast('Акт сформирован и готов.');
      }
    }));
  }

  async function renderNewInspection() {
    setChrome({
      back: true,
      nav: false,
      bell: false,
      context: 'Новый осмотр'
    });
    loading('Загружаю сотрудников…');

    const users = (await api.users()).filter(user => user.active);

    const options = users.map(user =>
      `<option value="${ui.escapeHtml(user.id)}">${ui.escapeHtml(user.displayName)}</option>`
    ).join('');

    els.app.innerHTML = `
      <section class="team-card">
        <h2>Новый технический осмотр</h2>
        <p class="help">Включи только те гейты, которые нужно осмотреть сейчас. Сотрудника можно поменять позже без потери заполненных данных.</p>

        <form id="newInspectionForm" class="team-stack">
          <div class="field">
            <label for="inspectionTitle">Название</label>
            <input id="inspectionTitle" class="input" placeholder="Например: Плановый осмотр">
          </div>

          <div>
            ${[1,2,3,4].map(gateNo => `
              <div class="team-form-row">
                <input id="gate-enabled-${gateNo}" type="checkbox" data-gate-enabled="${gateNo}">
                <div class="field">
                  <label for="gate-user-${gateNo}">${gateNo} гейт</label>
                  <select id="gate-user-${gateNo}" class="select" disabled>
                    <option value="">Выбрать сотрудника</option>
                    ${options}
                  </select>
                </div>
              </div>
            `).join('')}
          </div>

          <button class="btn primary" type="submit">Начать осмотр</button>
        </form>
      </section>
    `;

    els.app.querySelectorAll('[data-gate-enabled]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const select = document.getElementById('gate-user-' + checkbox.dataset.gateEnabled);
        select.disabled = !checkbox.checked;
        if (!checkbox.checked) select.value = '';
      });
    });

    document.getElementById('newInspectionForm').addEventListener('submit', async event => {
      event.preventDefault();

      const gates = [];
      for (const gateNo of [1,2,3,4]) {
        if (!document.getElementById('gate-enabled-' + gateNo).checked) continue;
        gates.push({
          gateNo,
          assigneeUserId: document.getElementById('gate-user-' + gateNo).value
        });
      }

      if (!gates.length) {
        ui.toast('Выбери хотя бы один гейт.');
        return;
      }

      if (gates.some(gate => !gate.assigneeUserId)) {
        ui.toast('Для каждого выбранного гейта укажи сотрудника.');
        return;
      }

      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Создание…';

      try {
        const inspection = await api.createInspection({
          title: document.getElementById('inspectionTitle').value,
          gates
        });
        ui.toast('Осмотр создан.');
        route('inspection', { inspectionId: inspection.id });
      } catch (error) {
        handleError(error);
      } finally {
        button.disabled = false;
        button.textContent = 'Начать осмотр';
      }
    });
  }

  async function openDocument(inspectionId) {
    const target = window.open('', '_blank');
    if (target) {
      target.document.write('<!doctype html><title>Открытие акта…</title><body style="font-family:sans-serif;padding:24px">Загрузка PDF…</body>');
    }

    try {
      const blob = await api.documentBlob(inspectionId);
      const url = URL.createObjectURL(blob);
      if (target) target.location.href = url;
      else location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error) {
      if (target) target.close();
      handleError(error);
    }
  }

  async function ensureDocumentGenerated(inspectionId) {
    if (state.generating.has(inspectionId) || !window.TeamPdf) return;

    state.generating.add(inspectionId);

    try {
      const documentInfo = await api.document(inspectionId);
      if (!documentInfo || documentInfo.status !== 'pending') return;

      const snapshot = await api.generationSnapshot(inspectionId);
      const result = await window.TeamPdf.generate(snapshot);
      await api.uploadDocument(inspectionId, result.pdfBlob);
      await refreshBell();
    } finally {
      state.generating.delete(inspectionId);
    }
  }


  async function renderInspection() {
    setChrome({
      back: true,
      nav: false,
      bell: false,
      context: 'Осмотр'
    });
    loading('Загружаю осмотр…');

    const inspection = await api.inspection(state.route.inspectionId);
    const users = state.user.role === 'admin' ? (await api.users()).filter(user => user.active) : [];
    const progress = inspectionProgress(inspection);

    els.context.textContent = inspection.title || ('Осмотр №' + inspection.id);

    els.app.innerHTML = `
      <section class="team-card">
        <div class="team-card-title">
          <div>
            <h2>${ui.escapeHtml(inspection.title || ('Осмотр №' + inspection.id))}</h2>
            <div class="team-status-row">
              <span class="team-chip ${ui.statusClass(inspection.status)}">${ui.statusLabel(inspection.status)}</span>
              <span class="team-muted">${ui.formatDate(inspection.startedAt, true)}</span>
            </div>
          </div>
        </div>
        ${ui.progressBar(progress.completed, progress.total)}
        ${state.user.role === 'admin' && inspection.status === 'active' ? `
          <div class="team-actions" style="margin-top:12px">
            <button id="cancelInspectionBtn" class="btn danger" type="button">Отменить осмотр</button>
          </div>
        ` : ''}
      </section>

      <section class="team-card">
        <h3>Гейты</h3>
        <div class="team-stack">
          ${inspection.gates.map(gate => `
            <div class="team-assignment">
              <div class="team-assignment-main">
                <div class="team-assignment-title">${gate.gateNo} гейт</div>
                <div class="team-assignment-meta">
                  ${ui.escapeHtml(gate.assigneeName || 'Не назначен')} ·
                  ${ui.statusLabel(gate.status)}
                </div>
                ${ui.progressBar(gate.completed, gate.total)}
                ${state.user.role === 'admin' && inspection.status === 'active' && gate.status !== 'completed' ? `
                  <div class="field" style="margin-top:9px">
                    <label>Исполнитель</label>
                    <select class="select" data-reassign-gate="${gate.gateNo}">
                      ${users.map(user => `
                        <option value="${ui.escapeHtml(user.id)}" ${user.id === gate.assigneeUserId ? 'selected' : ''}>
                          ${ui.escapeHtml(user.displayName)}
                        </option>
                      `).join('')}
                    </select>
                  </div>
                ` : ''}
              </div>
              <div class="team-actions" style="justify-content:flex-end">
                <button class="btn secondary small" type="button" data-admin-open-gate="${gate.gateNo}">Открыть</button>
                ${state.user.role === 'admin' && inspection.status === 'completed' && gate.status === 'completed'
                  ? `<button class="btn warning small" type="button" data-reopen-gate="${gate.gateNo}">Переоткрыть</button>`
                  : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      ${state.user.role === 'admin' ? `
        <section class="team-card">
          <h3>Контроль</h3>
          <div class="team-actions">
            <button id="inspectionEventsBtn" class="btn secondary" type="button">Журнал действий</button>
          </div>
        </section>
      ` : ''}

      ${inspection.document ? `
        <section class="team-card">
          <h3>Акт</h3>
          <div class="team-status-row">
            <span class="team-chip ${ui.statusClass(inspection.document.status)}">
              ${inspection.document.status === 'ready'
                ? (inspection.status === 'active' ? 'Предыдущая версия PDF' : 'PDF готов')
                : 'Формируется'}
            </span>
            <span class="team-muted">Версия ${inspection.document.version}</span>
          </div>
          <div class="team-actions" style="margin-top:12px">
            ${inspection.document.status === 'ready'
              ? '<button id="openDocumentBtn" class="btn primary" type="button">Открыть PDF</button>'
              : '<button id="generateDocumentBtn" class="btn secondary" type="button">Сформировать на устройстве</button>'}
          </div>
        </section>
      ` : ''}
    `;

    const eventsButton = document.getElementById('inspectionEventsBtn');
    if (eventsButton) {
      eventsButton.onclick = () => route('events', { inspectionId: inspection.id });
    }

    const cancelButton = document.getElementById('cancelInspectionBtn');
    if (cancelButton) {
      cancelButton.onclick = async () => {
        const confirmed = await ui.confirmAction(
          'Отменить осмотр?',
          'Заполненные данные останутся в истории, но задания будут сняты и акт формироваться не будет.'
        );
        if (!confirmed) return;

        cancelButton.disabled = true;
        try {
          await api.cancelInspection(inspection.id);
          ui.toast('Осмотр отменён.');
          route('home');
        } catch (error) {
          handleError(error);
          cancelButton.disabled = false;
        }
      };
    }

    els.app.querySelectorAll('[data-admin-open-gate]').forEach(button => {
      button.onclick = () => route('gate', {
        inspectionId: inspection.id,
        gateNo: Number(button.dataset.adminOpenGate)
      });
    });

    els.app.querySelectorAll('[data-reopen-gate]').forEach(button => {
      button.onclick = async () => {
        const gateNo = Number(button.dataset.reopenGate);
        const confirmed = await ui.confirmAction(
          'Переоткрыть ' + gateNo + ' гейт?',
          'Гейт снова станет рабочим заданием. После исправления будет сформирована новая версия PDF.'
        );
        if (!confirmed) return;

        try {
          await api.reopenGate(inspection.id, gateNo);
          ui.toast('Гейт возвращён в работу.');
          renderInspection().catch(handleError);
        } catch (error) {
          handleError(error);
        }
      };
    });

    els.app.querySelectorAll('[data-reassign-gate]').forEach(select => {
      select.addEventListener('change', async () => {
        const gateNo = Number(select.dataset.reassignGate);
        try {
          await api.assign(inspection.id, gateNo, select.value);
          ui.toast('Исполнитель изменён.');
          renderInspection().catch(handleError);
        } catch (error) {
          handleError(error);
        }
      });
    });

    const openButton = document.getElementById('openDocumentBtn');
    if (openButton) openButton.onclick = () => openDocument(inspection.id);

    const generateButton = document.getElementById('generateDocumentBtn');
    if (generateButton) {
      generateButton.onclick = async () => {
        generateButton.disabled = true;
        generateButton.textContent = 'Формирование…';
        try {
          await ensureDocumentGenerated(inspection.id);
          await renderInspection();
        } catch (error) {
          handleError(error);
        }
      };
    }

    trackRealtime(api.connectRealtime(inspection.id, event => {
      if (['gate_progress','gate_reassigned','inspection_completed','document_ready'].includes(event.type)) {
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => {
          if (state.route.name === 'inspection') renderInspection().catch(() => {});
        }, 500);
      }
    }));
  }

  async function renderEvents() {
    setChrome({
      back: true,
      nav: false,
      bell: false,
      context: 'Журнал действий'
    });
    loading('Загружаю журнал…');

    const events = await api.events(state.route.inspectionId);

    const labels = {
      gate_assigned: 'Гейт назначен',
      gate_reassigned: 'Гейт переназначен',
      turnstile_updated: 'Изменены данные турникета',
      gate_status_changed: 'Изменён статус гейта',
      gate_reopened: 'Гейт переоткрыт',
      inspection_completed: 'Осмотр завершён',
      inspection_cancelled: 'Осмотр отменён',
      document_ready: 'PDF сформирован',
      document_generation_retry: 'Повторная попытка формирования PDF'
    };

    function details(event) {
      if (event.type === 'turnstile_updated') {
        const changed = event.payload?.changed || {};
        const names = {
          visual: 'внешний осмотр',
          power: 'питание',
          reader: 'считыватель',
          status: 'итоговый статус',
          remarks: 'замечание'
        };
        const fields = Object.keys(changed).map(key => names[key] || key);
        return fields.length ? 'Изменено: ' + fields.join(', ') : '';
      }

      if (event.type === 'gate_status_changed') {
        return 'Новый статус: ' + ui.statusLabel(event.payload?.status || '');
      }

      if (event.type === 'gate_reassigned') {
        return 'Назначение изменено администратором';
      }

      if (event.type === 'inspection_completed') {
        return event.payload?.documentVersion
          ? 'Создана версия акта №' + event.payload.documentVersion
          : '';
      }

      if (event.type === 'document_ready') {
        return event.payload?.version
          ? 'PDF версии ' + event.payload.version + ' готов'
          : '';
      }

      return '';
    }

    els.app.innerHTML = `
      <section class="team-card">
        <h2>Журнал действий</h2>
        <p class="help">Хронология действий по этому осмотру. Записи журнала сотрудниками не редактируются.</p>
        <div class="team-stack">
          ${events.length ? events.map(event => `
            <div class="team-history-row">
              <div class="team-history-top">
                <strong>${ui.escapeHtml(labels[event.type] || event.type)}</strong>
                <span class="team-muted">${ui.formatDate(event.createdAt, true)}</span>
              </div>
              <div class="team-muted">
                ${event.gateNo ? event.gateNo + ' гейт' : 'Весь осмотр'}
                ${event.turnstileCode ? ' · ' + ui.escapeHtml(event.turnstileCode) : ''}
              </div>
              <div class="team-muted">
                ${ui.escapeHtml(event.actorName || 'Система')}
                ${details(event) ? ' · ' + ui.escapeHtml(details(event)) : ''}
              </div>
            </div>
          `).join('') : '<div class="team-empty"><strong>Записей пока нет</strong></div>'}
        </div>
      </section>
    `;
  }

  async function renderHistory() {
    setChrome({
      back: false,
      nav: true,
      bell: true,
      context: state.user.role === 'admin' ? 'Архив осмотров' : 'Моя история'
    });
    loading('Загружаю историю…');

    const rows = state.user.role === 'admin'
      ? await api.inspections()
      : await api.history();

    const html = rows.length
      ? rows.map(item => `
          <button class="team-history-row" type="button" data-history-id="${item.id}">
            <span class="team-history-top">
              <strong>${ui.escapeHtml(item.title || ('Осмотр №' + item.id))}</strong>
              <span class="team-chip ${ui.statusClass(item.status)}">${ui.statusLabel(item.status)}</span>
            </span>
            <span class="team-muted">
              ${ui.formatDate(item.completedAt || item.startedAt || item.createdAt, true)}
            </span>
            ${item.gateStates?.length ? `
              <span class="team-muted">
                ${item.gateStates.map(gate =>
                  gate.gateNo + ' гейт — ' + ui.statusLabel(gate.state)
                ).join(' · ')}
              </span>
            ` : (item.gateNos?.length ? `
              <span class="team-muted">${item.gateNos.map(no => no + ' гейт').join(' · ')}</span>
            ` : '')}
          </button>
        `).join('')
      : '<div class="team-empty"><strong>История пока пустая</strong></div>';

    els.app.innerHTML = `
      <section class="team-card">
        <h2>${state.user.role === 'admin' ? 'Архив осмотров' : 'История моих осмотров'}</h2>
        <div class="team-stack">${html}</div>
      </section>
    `;

    els.app.querySelectorAll('[data-history-id]').forEach(button => {
      button.onclick = () => route('inspection', { inspectionId: Number(button.dataset.historyId) });
    });
  }

  async function renderUsers() {
    setChrome({
      back: true,
      nav: false,
      bell: false,
      context: 'Сотрудники'
    });
    loading('Загружаю пользователей…');

    const users = await api.users();

    els.app.innerHTML = `
      <section class="team-card">
        <h2>Добавить сотрудника</h2>
        <form id="createUserForm" class="team-stack">
          <div class="field">
            <label for="employeeName">Ф.И.О.</label>
            <input id="employeeName" class="input" required>
          </div>
          <div class="field">
            <label for="employeeLogin">Логин</label>
            <input id="employeeLogin" class="input" autocomplete="off" autocapitalize="none" required>
          </div>
          <div class="field">
            <label for="employeePassword">Начальный пароль</label>
            <input id="employeePassword" class="input" type="password" autocomplete="new-password" minlength="8" required>
          </div>
          <button class="btn primary" type="submit">Создать учётную запись</button>
        </form>
      </section>

      <section class="team-card">
        <h2>Пользователи</h2>
        <div class="team-stack">
          ${users.map(user => `
            <div class="team-assignment">
              <div class="team-assignment-main">
                <div class="team-assignment-title">${ui.escapeHtml(user.displayName)}</div>
                <div class="team-assignment-meta">@${ui.escapeHtml(user.username)} · ${user.role === 'admin' ? 'Администратор' : 'Сотрудник'}</div>
                ${user.role !== 'admin' ? `
                  <div class="team-actions" style="margin-top:9px">
                    <button class="btn secondary small" type="button" data-reset-user="${ui.escapeHtml(user.id)}">Сменить пароль</button>
                    <button class="btn ${user.active ? 'warning' : 'success'} small" type="button" data-toggle-user="${ui.escapeHtml(user.id)}" data-user-active="${user.active ? '1' : '0'}">
                      ${user.active ? 'Отключить' : 'Включить'}
                    </button>
                  </div>
                ` : ''}
              </div>
              <span class="team-chip ${user.active ? 'ok' : 'bad'}">${user.active ? 'Активен' : 'Отключён'}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;

    els.app.querySelectorAll('[data-toggle-user]').forEach(button => {
      button.onclick = async () => {
        const id = button.dataset.toggleUser;
        const active = button.dataset.userActive !== '1';

        try {
          await api.updateUser(id, { active });
          ui.toast(active ? 'Сотрудник включён.' : 'Сотрудник отключён.');
          renderUsers().catch(handleError);
        } catch (error) {
          handleError(error);
        }
      };
    });

    els.app.querySelectorAll('[data-reset-user]').forEach(button => {
      button.onclick = async () => {
        const password = window.prompt('Новый пароль сотрудника (минимум 8 символов):');
        if (password == null) return;
        if (password.length < 8) {
          ui.toast('Пароль должен содержать не менее 8 символов.');
          return;
        }

        try {
          await api.updateUser(button.dataset.resetUser, { password });
          ui.toast('Пароль изменён. Старые сессии сотрудника завершены.');
        } catch (error) {
          handleError(error);
        }
      };
    });

    document.getElementById('createUserForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;

      try {
        await api.createUser({
          displayName: document.getElementById('employeeName').value,
          username: document.getElementById('employeeLogin').value,
          password: document.getElementById('employeePassword').value,
          role: 'inspector'
        });
        ui.toast('Учётная запись создана.');
        renderUsers().catch(handleError);
      } catch (error) {
        handleError(error);
      } finally {
        button.disabled = false;
      }
    });
  }

  async function renderNotifications() {
    setChrome({
      back: true,
      nav: false,
      bell: false,
      context: 'Уведомления'
    });
    loading('Загружаю уведомления…');

    const notifications = await api.notifications();

    els.app.innerHTML = `
      <section class="team-card">
        <h2>Уведомления</h2>
        ${notifications.length ? notifications.map(item => `
          <div
            class="team-notification ${item.read_at ? '' : 'unread'}"
            data-notification-id="${item.id}"
            data-inspection-id="${item.inspection_id || ''}"
            data-gate-no="${item.gate_no || ''}"
            role="${item.inspection_id ? 'button' : 'status'}"
            tabindex="${item.inspection_id ? '0' : '-1'}"
          >
            <div>${ui.escapeHtml(item.title)}</div>
            <div class="team-muted">${ui.escapeHtml(item.body)}</div>
            <div class="team-muted">${ui.formatDate(item.created_at, true)}</div>
          </div>
        `).join('') : '<div class="team-empty"><strong>Новых уведомлений нет</strong></div>'}
      </section>
    `;

    els.app.querySelectorAll('[data-notification-id]').forEach(item => {
      const open = () => {
        const inspectionId = Number(item.dataset.inspectionId);
        const gateNo = Number(item.dataset.gateNo);
        if (!Number.isInteger(inspectionId) || inspectionId <= 0) return;

        if ([1,2,3,4].includes(gateNo)) {
          route('gate', { inspectionId, gateNo, fromHome: true });
        } else {
          route('inspection', { inspectionId });
        }
      };

      item.addEventListener('click', open);
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });

    await Promise.all(
      notifications
        .filter(item => !item.read_at)
        .map(item => api.markNotificationRead(item.id).catch(() => {}))
    );

    await refreshBell();
  }

  async function renderProfile() {
    setChrome({
      back: false,
      nav: true,
      bell: true,
      context: 'Профиль'
    });

    els.app.innerHTML = `
      <section class="team-card">
        <h2>${ui.escapeHtml(state.user.displayName)}</h2>
        <div class="team-muted">@${ui.escapeHtml(state.user.username)}</div>
        <div class="team-status-row" style="margin-top:10px">
          <span class="team-chip brand">${state.user.role === 'admin' ? 'Администратор' : 'Сотрудник'}</span>
        </div>
      </section>

      <section class="team-card">
        <h3>Синхронизация</h3>
        <div id="profileSync">${ui.syncLabel()}</div>
      </section>

      <section class="team-card">
        <h3>Уведомления</h3>
        <p class="team-muted">Разрешение запрашивается только после нажатия этой кнопки.</p>
        <button id="enablePushBtn" class="btn secondary" type="button">Включить уведомления</button>
      </section>

      <section class="team-card">
        <div class="team-actions">
          ${state.user.role === 'admin' ? '<button id="profileUsersBtn" class="btn secondary" type="button">Сотрудники</button>' : ''}
          <button id="logoutBtn" class="btn danger" type="button">Выйти</button>
        </div>
      </section>
    `;

    document.getElementById('enablePushBtn').onclick = async () => {
      const button = document.getElementById('enablePushBtn');
      button.disabled = true;
      try {
        await ui.enablePush();
        button.textContent = 'Уведомления включены';
        ui.toast('Уведомления включены.');
      } catch (error) {
        const message = error.message === 'push_not_supported'
          ? 'Уведомления не поддерживаются этим браузером.'
          : error.message === 'push_denied'
            ? 'Разрешение на уведомления не выдано.'
            : error.message === 'push_not_configured'
              ? 'Push ещё не настроен на сервере.'
              : 'Не удалось включить уведомления.';
        ui.toast(message, 4200);
      } finally {
        button.disabled = false;
      }
    };

    const usersButton = document.getElementById('profileUsersBtn');
    if (usersButton) usersButton.onclick = () => route('users');

    document.getElementById('logoutBtn').onclick = async () => {
      if (!(await ui.confirmAction('Выйти?', 'На этом телефоне потребуется снова ввести логин и пароль.'))) return;
      await api.logout();
      showLogin();
    };
  }

  async function renderRoute() {
    if (!state.user && state.route.name !== 'login') {
      showLogin();
      return;
    }

    switch (state.route.name) {
      case 'home': return renderHome();
      case 'gate': return renderGate();
      case 'new-inspection': return renderNewInspection();
      case 'inspection': return renderInspection();
      case 'events': return renderEvents();
      case 'history': return renderHistory();
      case 'users': return renderUsers();
      case 'notifications': return renderNotifications();
      case 'profile': return renderProfile();
      default: return renderHome();
    }
  }

  els.nav.querySelectorAll('[data-team-nav]').forEach(button => {
    button.addEventListener('click', () => route(button.dataset.teamNav));
  });

  els.back.addEventListener('click', () => {
    if (
      (state.route.name === 'gate' && state.user?.role === 'admin') ||
      state.route.name === 'events'
    ) {
      route('inspection', { inspectionId: state.route.inspectionId });
    } else {
      route('home');
    }
  });

  els.bell.addEventListener('click', () => route('notifications'));

  window.addEventListener('turnstile:session-expired', showLogin);

  window.addEventListener('turnstile:queue-flushed', event => {
    if (event.detail?.sent) refreshBell().catch(() => {});
  });

  window.addEventListener('turnstile:sync-conflict', event => {
    const gateNo = Number(event.detail?.gateNo);
    ui.toast(
      gateNo
        ? 'Изменение по ' + gateNo + ' гейту не отправлено: гейт уже переназначен. Запись сохранена на телефоне.'
        : 'Одно изменение не отправлено из-за изменения назначения. Оно сохранено на телефоне.',
      5200
    );
  });

  window.addEventListener('turnstile:queue-changed', () => {
    const gateSync = document.getElementById('gateSync');
    const profileSync = document.getElementById('profileSync');
    const homeSync = document.getElementById('homeSync');
    if (gateSync) gateSync.innerHTML = ui.syncLabel();
    if (profileSync) profileSync.innerHTML = ui.syncLabel();
    if (homeSync) homeSync.innerHTML = ui.syncLabel();
  });

  window.addEventListener('online', () => {
    api.flushQueue()
      .then(async result => {
        if (result.sent) ui.toast('Отложенные изменения синхронизированы.');

        if (state.route.name === 'gate') {
          renderGate().catch(() => {});
        } else if (state.route.name === 'inspection') {
          renderInspection().catch(() => {});
        }
      })
      .catch(() => {});
  });

  window.addEventListener('offline', () => {
    ui.toast('Нет сети. Изменения будут сохранены на телефоне.', 3500);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !state.user) return;
    refreshBell().catch(() => {});

    if (state.route.name === 'home') {
      closeRealtime();
      renderHome().catch(() => {});
    }
  });

  boot().catch(handleError);
})();
