// Service Worker for offline support and caching
const CACHE_NAME = 'vc-stats-v3.2';
const API_CACHE_NAME = 'vc-api-v1';
const API_CACHE_MAX_ENTRIES = 60; // cap so cache doesn't grow unbounded

const urlsToCache = [
    '/static/style.css',
    '/static/main.js',
    '/static/dashboard.js',
    '/static/games.js',
    '/static/players.js',
    '/static/trends.js',
    '/static/ai-insights.js',
];

// Install: cache static assets only (not pages)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for pages and static assets, cache fallback when offline
self.addEventListener('fetch', event => {
    // Cache safe read-only API calls for offline access
    const url = new URL(event.request.url);
    const isSafeApiRead = event.request.method === 'GET' &&
        (url.pathname === '/api/games' ||
         /^\/api\/games\/[^/]+(\/|$)/.test(url.pathname) ||
         /^\/api\/players/.test(url.pathname));

    if (event.request.method === 'GET' && url.pathname.startsWith('/api/') && !isSafeApiRead) {
        return; // write/mutating API calls bypass cache
    }

    if (isSafeApiRead) {
        event.respondWith(
            fetch(event.request)
                .then(async response => {
                    if (response.ok) {
                        const cache = await caches.open(API_CACHE_NAME);
                        cache.put(event.request, response.clone());
                        // Trim cache to max entries (evict oldest)
                        const keys = await cache.keys();
                        if (keys.length > API_CACHE_MAX_ENTRIES) {
                            await cache.delete(keys[0]);
                        }
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For page navigation requests, always use network-first
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    return response;
                })
                .catch(() => {
                    // Only fall back to cache if network fails
                    return caches.match(event.request);
                })
        );
        return;
    }

    // For static assets, prefer network so UI updates are reflected immediately.
    // Fall back to cache when offline.
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
