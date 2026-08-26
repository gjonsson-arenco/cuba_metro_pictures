// Minimal service worker: it exists so the app meets the installability bar,
// and it stays deliberately conservative about caching.
//
// - Navigations go to the network first, so a fresh deploy is picked up on the
//   next load; the cached shell is only a fallback for being offline.
// - Vite emits content-hashed files under /assets, so those are safe to serve
//   cache-first.
// - Everything cross-origin (the API, CloudFront images, presigned S3 URLs) is
//   left alone.

const VERSION = 'metro-v1';
const CACHE = `metro-${VERSION}`;
const SHELL = '/index.html';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(SHELL, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  }
});
