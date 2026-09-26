// =====================================================================
// KNOWLEDGE BRAIN — SERVICE WORKER (PWA)
// Stale-While-Revalidate for app shell & Network-First for dynamic API/DB
// =====================================================================

const CACHE_NAME = "knowledge-brain-v1";
const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/icon.svg",
  "/favicon.ico",
];

// Install: precache core app shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Pre-caching encountered issues:", err);
      }),
  );
});

// Activate: prune obsolete cache versions and take immediate control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch event router
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass non-GET requests (e.g. POST, PUT, DELETE)
  if (request.method !== "GET") {
    return;
  }

  // 1. Dynamic API & Supabase queries: Network-First with Cache Fallback
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/rest/v1/")
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, clone and update cache
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          // Fallback to cache if network is offline
          const cached = await caches.match(request);
          if (cached) return cached;

          // Graceful JSON offline response for Supabase / REST
          return new Response(
            JSON.stringify({
              data: [],
              error: null,
              offline: true,
              message: "Offline mode: Showing cached knowledge state.",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }),
    );
    return;
  }

  // 2. Navigation requests: Network-first with App Shell Fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;

          const appShell = await caches.match("/");
          if (appShell) return appShell;

          return new Response(
            "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0B0F17;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'><h2>Knowledge Brain is offline</h2></body></html>",
            { headers: { "Content-Type": "text/html" } },
          );
        }),
    );
    return;
  }

  // 3. Static Assets (CSS, JS, Fonts, Images): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    }),
  );
});
