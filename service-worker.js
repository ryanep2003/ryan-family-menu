const CACHE_NAME = "ryan-family-menu-v49";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./app-lifecycle.js",
  "./api.js",
  "./dashboard-ui.js",
  "./family-state.js",
  "./images.js",
  "./localized-data.js",
  "./grocery-ui.js",
  "./inventory-ui.js",
  "./recipe-form-ui.js",
  "./recipe-library-ui.js",
  "./receipt-ui.js",
  "./schedule-ui.js",
  "./storage-utils.js",
  "./translations.js",
  "./versioned-collection-client.js",
  "./recipes-data.js",
  "./grocery-logic.js",
  "./inventory-logic.js",
  "./recipe-utils.js",
  "./schedule-utils.js",
  "./manifest.webmanifest",
  "./assets/meatballs-2.jpg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/.netlify/functions/")) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || caches.match("./index.html");
      })
  );
});
