/* DashInvest — service worker de notificações (Web Push).
 * Recebe o push mesmo com o app fechado, mostra a notificação, atualiza o
 * contador do ícone e, ao tocar, abre a análise relacionada (deep link). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function setBadge(count) {
  const nav = self.navigator;
  if (typeof count !== "number" || !nav || !nav.setAppBadge) return Promise.resolve();
  return (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => undefined);
}

/** Só caminhos do próprio DashInvest. */
function safeUrl(url) {
  try {
    const u = new URL(url || "/", self.location.origin);
    return u.origin === self.location.origin ? u.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "DashInvest", body: event.data ? event.data.text() : "" };
  }
  // O iOS exige que todo push mostre uma notificação visível.
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || "DashInvest", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: "/pwa-icon?s=192",
      badge: "/pwa-icon?s=192",
      data: { url: data.url || "/", ids: Array.isArray(data.ids) ? data.ids : [] },
    }),
    setBadge(data.badge),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, ids } = event.notification.data || {};
  const target = safeUrl(url);
  event.waitUntil((async () => {
    if (ids && ids.length) {
      try {
        const res = await fetch("/api/notifications/opened", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }),
        });
        if (res.ok) await setBadge((await res.json()).unread);
      } catch { /* sem rede: abre mesmo assim */ }
    }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of windows) {
      if ("navigate" in w) {
        await w.focus();
        return w.navigate(target);
      }
    }
    return self.clients.openWindow(target);
  })());
});
