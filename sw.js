// ═══════════════════════════════════════════════════════════════
// AURAVOX STUDIO — Service Worker v1.0.0
// © 2026 AURAVOX STUDIO App. Todos los derechos reservados.
// Creado por Jaime Andrés Dueñas Vicuña
// ═══════════════════════════════════════════════════════════════

'use strict';

const CACHE_NAME = 'auravox-v1.0.0';
const CACHE_STATIC = 'auravox-static-v1.0.0';

// Recursos que se cachean en la instalación (shell de la app)
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon.png'
];

// Dominios de APIs — siempre van a red, nunca al caché
const API_ORIGINS = [
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'openrouter.ai',
  'api.perplexity.ai',
  'api.x.ai'
];

// ─── INSTALL ─────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Llamadas a APIs externas → siempre red, sin caché
  if (API_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. Peticiones no-GET (POST, etc.) → siempre red
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Recursos externos (CDN, Google Fonts, etc.) → network-first con fallback caché
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 4. Shell de la app (index.html y assets locales) → cache-first con actualización en background
  event.respondWith(
    caches.match(request)
      .then(cached => {
        const networkFetch = fetch(request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_STATIC).then(cache => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);

        // Devuelve caché inmediatamente si existe, actualiza en background
        return cached || networkFetch;
      })
  );
});

// ─── MESSAGE (forzar actualización desde la app) ─────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
