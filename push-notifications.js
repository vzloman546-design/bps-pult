(() => {
  "use strict";

  // ВСТАВЬ URL после `npx wrangler deploy`.
  const PUSH_API = "https://bps-pult-push.vzloman546.workers.dev";
  const AUTH_KEY = "bps-push-auth-v1";

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function base64UrlToUint8Array(value) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  function readAuth() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    } catch {
      return null;
    }
  }

  function writeAuth(value) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(value));
  }

  function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
  }

  async function request(path, options = {}, requireAuth = true) {
    const auth = readAuth();
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");

    if (requireAuth) {
      if (!auth?.token) throw new Error("Устройство не подключено к push-сервису.");
      headers.set("Authorization", `Bearer ${auth.token}`);
    }

    const response = await fetch(`${PUSH_API}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.code || `HTTP ${response.status}`);
    }
    return data;
  }

  async function enable(pairingCode) {
    if (!isStandalone()) {
      throw new Error(
        "На iPhone уведомления включаются только в приложении, добавленном на экран «Домой».",
      );
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Этот браузер не поддерживает Web Push.");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Разрешение на уведомления не выдано.");
    }

    const config = await request("/api/config", { method: "GET" }, false);
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
      });
    }

    const result = await request(
      "/api/pair",
      {
        method: "POST",
        body: JSON.stringify({
          pairingCode,
          subscription: subscription.toJSON(),
        }),
      },
      false,
    );

    writeAuth({
      deviceId: result.deviceId,
      token: result.token,
      pairedAt: new Date().toISOString(),
    });

    return result;
  }

  async function syncSubscription() {
    const auth = readAuth();
    if (!auth?.token || Notification.permission !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;

    await request("/api/subscription", {
      method: "PUT",
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return true;
  }

  async function sendTest() {
    return request("/api/test", {
      method: "POST",
      body: "{}",
    });
  }

  async function schedule({
    localId = null,
    type = "reminder",
    title,
    body = "",
    runAt,
    url = "./",
    tag = null,
  }) {
    const timestamp =
      runAt instanceof Date ? runAt.toISOString() : new Date(runAt).toISOString();

    return request("/api/reminders", {
      method: "POST",
      body: JSON.stringify({
        localId,
        type,
        title,
        body,
        runAt: timestamp,
        url,
        tag,
      }),
    });
  }

  async function cancel(reminderId) {
    return request(`/api/reminders/${encodeURIComponent(reminderId)}`, {
      method: "DELETE",
    });
  }

  async function disable() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    try {
      if (readAuth()?.token) {
        await request("/api/unsubscribe", {
          method: "POST",
          body: "{}",
        });
      }
    } finally {
      await subscription?.unsubscribe();
      clearAuth();
    }
  }

  function state() {
    return {
      supported:
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
      standalone: isStandalone(),
      permission: "Notification" in window ? Notification.permission : "unsupported",
      paired: Boolean(readAuth()?.token),
    };
  }

  window.BpsPush = {
    enable,
    syncSubscription,
    sendTest,
    schedule,
    cancel,
    disable,
    state,
  };
})();
