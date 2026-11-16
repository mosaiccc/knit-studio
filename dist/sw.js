/* Retire the former offline worker at its original URL. Keep this file for returning visitors. */
'use strict';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Only remove this app's shell caches. Never touch projects, localStorage, or other paths.
    try {
      const scope = self.registration.scope;
      for (const name of await caches.keys()) {
        if (!name.startsWith('knit-studio-shell-')) continue;
        try {
          const keys = await (await caches.open(name)).keys();
          if (keys.length && keys.every(request => request.url.startsWith(scope))) await caches.delete(name);
        } catch { /* Cache cleanup is optional; retirement must still complete. */ }
      }
    } catch { /* Storage may be unavailable in some browser contexts. */ }
    try { await self.clients.claim(); }
    finally { await self.registration.unregister(); }
    // No fetch handler and no forced reload: current edits remain in the open page.
  })());
});
