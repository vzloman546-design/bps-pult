/*
  ДОБАВЬ ЭТОТ БЛОК В КОНЕЦ СУЩЕСТВУЮЩЕГО sw.js.
  Не удаляй существующие install/activate/fetch/update обработчики.
*/

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data?.json() || {};
  } catch {
    data = {
      title: "БПС Пульт",
      body: event.data?.text() || "Есть новое рабочее напоминание.",
    };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "БПС Пульт", {
      body: data.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: data.tag || "bps-pult",
      renotify: true,
      data: {
        url: data.url || "./",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./",
    self.registration.scope,
  ).href;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(async (windowClients) => {
        const existing = windowClients.find((client) =>
          client.url.startsWith(self.registration.scope),
        );

        if (existing) {
          if ("navigate" in existing) await existing.navigate(targetUrl);
          return existing.focus();
        }

        return clients.openWindow(targetUrl);
      }),
  );
});
