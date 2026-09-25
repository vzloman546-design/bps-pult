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

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('turnstile:install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('turnstile:installed'));
  });

  window.TeamInstall = {
    isStandalone,
    isIOS,

    get available() {
      return !!deferredPrompt || (isIOS() && !isStandalone());
    },

    async install() {
      if (isStandalone()) return { outcome: 'already-installed' };

      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        return choice;
      }

      if (isIOS()) {
        return { outcome: 'ios-manual' };
      }

      return { outcome: 'unavailable' };
    }
  };
})();
