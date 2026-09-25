(() => {
  'use strict';

  let deferredPrompt = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function updateBanner() {
    const banner = document.getElementById('teamInstallBanner');
    const text = document.getElementById('teamInstallText');
    const button = document.getElementById('teamInstallAction');

    if (!banner || !button || !text) return;

    if (isStandalone()) {
      banner.classList.add('hidden');
      return;
    }

    if (isIOS()) {
      text.textContent = 'Добавь приложение на экран Домой';
      button.textContent = 'Как установить';
      banner.classList.remove('hidden');
      return;
    }

    if (deferredPrompt) {
      text.textContent = 'Установить приложение на телефон';
      button.textContent = 'Установить';
      banner.classList.remove('hidden');
      return;
    }

    banner.classList.add('hidden');
  }

  async function install() {
    if (isStandalone()) return { outcome: 'already-installed' };

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      updateBanner();
      return choice;
    }

    if (isIOS()) {
      return { outcome: 'ios-manual' };
    }

    return { outcome: 'unavailable' };
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    updateBanner();
    window.dispatchEvent(new CustomEvent('turnstile:install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    updateBanner();
    window.dispatchEvent(new CustomEvent('turnstile:installed'));
  });

  window.addEventListener('DOMContentLoaded', () => {
    updateBanner();

    const button = document.getElementById('teamInstallAction');
    button?.addEventListener('click', async () => {
      const result = await install();

      if (result.outcome === 'ios-manual') {
        window.TeamUi?.toast('Safari → Поделиться → «На экран Домой»', 5200);
      } else if (result.outcome === 'accepted') {
        button.disabled = true;
        button.textContent = 'Установка…';
      } else if (result.outcome === 'unavailable') {
        window.TeamUi?.toast('Используй пункт установки приложения в меню браузера.', 5200);
      }
    });
  });

  window.TeamInstall = {
    isStandalone,
    isIOS,
    install,
    updateBanner,

    get available() {
      return !!deferredPrompt || (isIOS() && !isStandalone());
    }
  };
})();
