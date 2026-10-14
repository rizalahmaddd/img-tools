/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { set } from 'idb-keyval';
import { createStore } from 'idb-keyval';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Activate immediately: a waiting worker would keep serving a stale (possibly buggy) build until every tab closes.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const store = createStore('racik', 'workspace');

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const data = await event.request.formData();
          const files = data.getAll('files').filter((f): f is File => f instanceof File);
          await set('shared-files', files, store);
        } catch {
          /* fall through to the app without files */
        }
        return Response.redirect('/?shared=1', 303);
      })(),
    );
  }
});

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/share-target/, /^\/models\//, /^\/mediapipe\//] }));

const ok = new CacheableResponsePlugin({ statuses: [0, 200] });

registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname.startsWith('/models/') || url.pathname.startsWith('/mediapipe/') || url.pathname.endsWith('.wasm')),
  new CacheFirst({ cacheName: 'racik-assets', plugins: [ok] }),
);

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({ cacheName: 'racik-chunks', plugins: [ok] }),
);

registerRoute(
  ({ url }) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('onnxruntime-web'),
  new CacheFirst({ cacheName: 'racik-ort', plugins: [ok] }),
);
