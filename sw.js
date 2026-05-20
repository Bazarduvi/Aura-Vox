// ═══════════════════════════════════════════════════════════════
// AURAVOX STUDIO — Service Worker v2.0.0
// © 2026 AURAVOX STUDIO App. Todos los derechos reservados.
// Creado por Jaime Andrés Dueñas Vicuña
// ── Incluye receptor de webhooks Manus AI ──────────────────────
// ═══════════════════════════════════════════════════════════════

'use strict';

const CACHE_NAME   = 'auravox-v2.0.0';
const CACHE_STATIC = 'auravox-static-v2.0.0';

const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon.png',
  './webhook.html'
];

const API_ORIGINS = [
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'openrouter.ai',
  'api.perplexity.ai',
  'api.x.ai',
  'api.manus.ai',
  'api.openai.com'
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

  // ── MANUS WEBHOOK RECEIVER ─────────────────────────────────────
  // Intercepts POST to /webhook or /webhook.html from Manus AI
  // Responds 200 immediately (required by Manus within 10s)
  // Then broadcasts event to all app clients via postMessage
  if (
    request.method === 'POST' &&
    (url.pathname.endsWith('/webhook') ||
     url.pathname.endsWith('/webhook.html') ||
     url.pathname.endsWith('/manus-webhook'))
  ) {
    event.respondWith(
      request.json()
        .then(payload => {
          // Broadcast to all open app clients
          self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'MANUS_WEBHOOK',
                  payload
                });
              });
            });

          // Also fire a push notification if task stopped
          if (payload.event_type === 'task_stopped') {
            const detail   = payload.task_detail || {};
            const finished = detail.stop_reason === 'finish';
            const title    = finished
              ? '✅ Manus AI — ¡Tarea completada!'
              : '⏳ Manus AI — Requiere tu input';
            const body = (detail.task_title || '') +
              (detail.message ? ': ' + detail.message.substring(0, 100) : '');

            self.registration.showNotification(title, {
              body,
              icon:             'icon.png',
              badge:            'icon.png',
              tag:              'manus-' + (detail.task_id || 'task'),
              requireInteraction: true,
              data:             { task_url: detail.task_url, task_id: detail.task_id }
            });
          }

          // Always respond 200 OK within deadline
          return new Response(
            JSON.stringify({ ok: true, received: true }),
            { status: 200, headers: { 'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*' } }
          );
        })
        .catch(() =>
          // Respond 200 even on parse error so Manus doesn't retry endlessly
          new Response(
            JSON.stringify({ ok: true }),
            { status: 200, headers: { 'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*' } }
          )
        )
    );
    return;
  }

  // ── OPTIONS preflight for webhook (CORS) ───────────────────────
  if (
    request.method === 'OPTIONS' &&
    (url.pathname.endsWith('/webhook') || url.pathname.endsWith('/webhook.html'))
  ) {
    event.respondWith(new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Manus-Signature'
      }
    }));
    return;
  }

  // 1. APIs externas → red siempre
  if (API_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. POST no-webhook → red
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Externos (CDN, Fonts) → network-first + caché
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 4. Shell local → cache-first + actualización background
  event.respondWith(
    caches.match(request)
      .then(cached => {
        const net = fetch(request)
          .then(response => {
            if (response && response.status === 200)
              caches.open(CACHE_STATIC).then(c => c.put(request, response.clone()));
            return response;
          })
          .catch(() => cached);
        return cached || net;
      })
  );
});

// ─── NOTIFICATION CLICK ──────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const taskUrl = event.notification.data?.task_url;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Focus existing tab if open
        const appClient = clients.find(c => c.url.includes('Aura-Vox') || c.url.includes('auravox'));
        if (appClient) { appClient.focus(); return; }
        // Open new tab
        return self.clients.openWindow(taskUrl || './index.html');
      })
  );
});

// ─── MESSAGE (app → SW) ──────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING')  self.skipWaiting();
  if (event.data === 'CLEAR_CACHE')
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
});
