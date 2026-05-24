/**
 * MHGym Service Worker
 * Handles push notifications and basic offline caching
 */

const CACHE_NAME = 'mhgym-v1';
const STATIC_ASSETS = ['/', '/index.html'];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch (network-first voor API, cache-first voor assets) ──────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // API calls: altijd netwerk
    event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }
  // Statische assets: netwerk first, daarna cache
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push notificaties ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'MHGym', body: 'Je hebt een nieuwe melding.' };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data?.text() || data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/dashboard' },
      actions: [
        { action: 'open',    title: 'Openen' },
        { action: 'dismiss', title: 'Sluiten' },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NAVIGATE', url });
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});
