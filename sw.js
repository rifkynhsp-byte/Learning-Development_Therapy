/**
 * Offline-first service worker.
 *
 * The app shell is precached on install. The MediaPipe WASM runtime and the
 * pose model (~6 MB combined) are cached the first time they are requested, so
 * a therapy session never re-downloads them and works with no connection at
 * all after the first run.
 */
const VERSION = 'sensory-runner-v1';
const SHELL = `${VERSION}-shell`;
const VENDOR = `${VERSION}-vendor`;

const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './js/app.js',
  './js/game.js',
  './js/pose.js',
  './js/audio.js',
];

const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'storage.googleapis.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL && k !== VENDOR).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (VENDOR_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, VENDOR));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) return hit;
  try {
    const response = await fetch(request);
    // Opaque cross-origin responses are still worth keeping: replaying them
    // is what makes the tracker work offline.
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await cache.match('./index.html');
    if (request.mode === 'navigate' && fallback) return fallback;
    throw err;
  }
}
