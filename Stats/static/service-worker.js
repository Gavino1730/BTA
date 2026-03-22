// Service Worker for offline support and caching
const CACHE_NAME = 'vc-stats-v1.4';  // Bumped version to clear stale cache
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
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for pages, cache-first for static assets
self.addEventListener('fetch', event => {
    // Skip API calls - always go to network
    if (event.request.url.includes('/api/')) {
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

    // For static assets, use cache-first
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    // Cache successful responses
                    if (!response || response.status !== 200 || response.type === 'error') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    return response;
                });
            })
    );
});
