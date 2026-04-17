// BTA Courtside iPad Operator — App Shell Service Worker
// Caches static assets so the app loads offline even in gym environments
// with no connectivity. API and Socket.IO calls always go to the network.

const CACHE_NAME = "bta-courtside-operator-v3";

// Core app shell — always cache these on install.
const SHELL_URLS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  // Activate immediately without waiting for existing clients to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open clients immediately.
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests.
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Always go to the network for API calls, socket connections, and cross-origin requests.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/socket.io/") ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Immutable hashed assets (e.g. /assets/index-BLLPwzau.js) — cache-first.
  // Vite content-hashes these filenames so they never change; safe to serve from cache forever.
  const isHashedAsset = url.pathname.startsWith("/assets/");

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests and HTML — network-first so the browser always gets the latest
  // index.html with correct asset references. Fall back to cache only when offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Everything else (manifest, icons, fonts subset, sw.js itself) — stale-while-revalidate.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => undefined);

      return cached ?? networkFetch;
    })
  );
});
