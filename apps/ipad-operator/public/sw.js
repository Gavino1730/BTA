// BTA iPad Operator — App Shell Service Worker
// Caches static assets so the app loads offline even in gym environments
// with no connectivity. API and Socket.IO calls always go to the network.

const CACHE_NAME = "bta-operator-v1";

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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Return cached version immediately and revalidate in background (stale-while-revalidate).
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Network failed — fall back to cached index.html for navigation requests.
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
          return undefined;
        });

      return cached ?? networkFetch;
    })
  );
});
