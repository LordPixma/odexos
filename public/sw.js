/* OdexOS service worker.
 *
 * Two jobs: keep the app shell openable when the network is flaky, and receive
 * Web Push notifications. It deliberately never caches /api responses — a
 * family looking at a stale budget or a chore someone else already ticked off
 * is worse than an honest error.
 */

// Bump when this file changes, to drop the previous caches on activate. It is
// not tied to app deploys: build assets are content-hashed and navigations are
// network-first, so a new release is picked up without touching this.
const VERSION = "v2";
// Hashed assets accumulate one set per release. They are immutable so they can
// never go stale, but they shouldn't grow on someone's phone forever either.
const MAX_CACHED_ASSETS = 60;
const SHELL = `odexos-shell-${VERSION}`;
const ASSETS = `odexos-assets-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL && k !== ASSETS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve the API from cache — see the note at the top.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets are immutable: cache first, and keep what we fetch.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then(async (cache) => {
                await cache.put(request, copy);
                // keys() is insertion-ordered, so the oldest entries go first.
                const keys = await cache.keys();
                for (const stale of keys.slice(0, keys.length - MAX_CACHED_ASSETS)) {
                  await cache.delete(stale);
                }
              });
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else is a navigation into the SPA. Network first so a deploy is
  // picked up immediately; fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
    );
  }
});

// --- Web Push ---

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "OdexOS", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "OdexOS";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "odexos",
      // A second notification with the same tag replaces the first silently;
      // renotify makes the phone buzz again when it's genuinely new.
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an open tab rather than piling up new ones.
        for (const client of clients) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        for (const client of clients) {
          if ("navigate" in client) return client.navigate(target).then((c) => c?.focus());
        }
        return self.clients.openWindow(target);
      }),
  );
});
