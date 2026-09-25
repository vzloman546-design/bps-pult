(() => {
  'use strict';

  const toastEl = document.getElementById('teamToast');
  const dialog = document.getElementById('teamDialog');
  const dialogTitle = document.getElementById('teamDialogTitle');
  const dialogText = document.getElementById('teamDialogText');
  let toastTimer = null;

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      "'":'&#39;',
      '"':'&quot;'
    }[char]));
  }

  function toast(message, duration = 2600) {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  function confirmAction(title, text) {
    if (!dialog?.showModal) return Promise.resolve(window.confirm(title + '\n\n' + text));

    dialogTitle.textContent = title;
    dialogText.textContent = text;
    dialog.showModal();

    return new Promise(resolve => {
      const done = () => {
        dialog.removeEventListener('close', done);
        resolve(dialog.returnValue === 'ok');
      };
      dialog.addEventListener('close', done);
    });
  }

  function statusClass(status) {
    if (status === 'Исправно' || status === 'completed' || status === 'ready') return 'ok';
    if (status === 'Требует обслуживания' || status === 'in_progress' || status === 'pending') return 'warn';
    if (status === 'Неисправно' || status === 'failed' || status === 'cancelled') return 'bad';
    return '';
  }

  function statusLabel(status) {
    return ({
      pending:'Не начат',
      in_progress:'В работе',
      completed:'Завершён',
      active:'Активен',
      cancelled:'Отменён',
      draft:'Черновик',
      ready:'Готов',
      failed:'Ошибка'
    })[status] || status || 'Не заполнено';
  }

  function formatDate(value, withTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ru-RU', {
      day:'2-digit',
      month:'2-digit',
      year:'numeric',
      ...(withTime ? { hour:'2-digit', minute:'2-digit' } : {})
    }).format(date);
  }

  function progressBar(completed, total) {
    const percent = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
    return `
      <div class="team-progress"><div style="width:${percent}%"></div></div>
      <div class="team-muted" style="margin-top:5px">${completed} из ${total}</div>
    `;
  }

  function syncLabel() {
    const queued = window.TeamApi?.queueCount || 0;
    if (!navigator.onLine) {
      return '<span class="team-sync offline">Нет сети — сохраняется на телефоне</span>';
    }
    if (queued) {
      return '<span class="team-sync pending">Ожидает синхронизации: ' + queued + '</span>';
    }
    return '<span class="team-sync">Синхронизировано</span>';
  }

  function errorMessage(error) {
    const code = error?.payload?.error || error?.message || '';
    const map = {
      invalid_credentials:'Неверный логин или пароль',
      unauthorized:'Необходимо войти заново',
      admin_required:'Недостаточно прав',
      inspection_forbidden:'Нет доступа к этому осмотру',
      gate_forbidden:'Этот гейт назначен другому сотруднику',
      username_exists:'Такой логин уже существует',
      password_too_short:'Пароль должен содержать не менее 8 символов',
      at_least_one_gate_required:'Выбери хотя бы один гейт',
      assignee_required:'Для выбранного гейта укажи сотрудника',
      invalid_assignee:'Выбранный сотрудник недоступен',
      document_not_ready:'Акт ещё формируется',
      inspection_not_completed:'Осмотр ещё не завершён'
    };
    return map[code] || 'Не удалось выполнить операцию';
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('push_not_supported');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('push_denied');

    const publicKey = await window.TeamApi.pushPublicKey();
    if (!publicKey) throw new Error('push_not_configured');

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const normalized = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - normalized.length % 4) % 4);
      const raw = atob(normalized + padding);
      const key = Uint8Array.from(raw, char => char.charCodeAt(0));

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key
      });
    }

    await window.TeamApi.savePushSubscription(subscription);
    return subscription;
  }

  window.TeamUi = {
    escapeHtml,
    toast,
    confirmAction,
    statusClass,
    statusLabel,
    formatDate,
    progressBar,
    syncLabel,
    errorMessage,
    enablePush
  };
})();
