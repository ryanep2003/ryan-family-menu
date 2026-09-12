const CACHE_NAME = "ryan-family-menu-v191";
// v191: Change dinner does not invent a reel selection; List titles wrap on phones.
// Review hosts must stay network-first so branch/deploy previews cannot serve a stale app shell.
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./assistant-logic.js",
  "./assistant-conversation.js",
  "./assistant-proposals.js",
  "./assistant-ui.js",
  "./almanac-selectors.js",
  "./cook-along-ui.js",
  "./app-lifecycle.js",
  "./available-food.js",
  "./api.js",
  "./dashboard-ui.js",
  "./dinner-flow.js",
  "./activity-logic.js",
  "./activity-ui.js",
  "./audit-logic.js",
  "./audit-ui.js",
  "./budget-logic.js",
  "./budget-ui.js",
  "./handoff-ui.js",
  "./family-state.js",
  "./family-ui.js",
  "./memory-logic.js",
  "./plan-from-what-we-have.js",
  "./dirty-form-state.js",
  "./shared-save-coordinator.js",
  "./shared-state-authority.js",
  "./images.js",
  "./localized-data.js",
  "./language-quality.js",
  "./onboarding-ui.js",
  "./grocery-ui.js",
  "./shop-ui.js",
  "./shopping-list-logic.js",
  "./household-attribution.js",
  "./household-access.js",
  "./inventory-ui.js",
  "./lunch-ui.js",
  "./lunch-logic.js",
  "./recipe-form-ui.js",
  "./recipe-library-ui.js",
  "./recipe-reel-logic.js",
  "./recipe-reel.js",
  "./recipe-reel.css",
  "./receipt-ui.js",
  "./schedule-ui.js",
  "./shared-state-loader.js",
  "./storage-utils.js",
  "./sync-status.js",
  "./translations.js",
  "./versioned-collection-client.js",
  "./grocery-logic.js",
  "./inventory-logic.js",
  "./recipe-utils.js",
  "./recipe-catalog-utils.js",
  "./schedule-utils.js",
  "./manifest.webmanifest",
  "./assets/app-icon.svg",
  "./assets/app-icon-180.png",
  "./assets/app-icon-192.png",
  "./assets/app-icon-512.png",
];

const hostname = self.location.hostname;
const IS_NETLIFY_HOST = hostname.endsWith(".netlify.app");
const IS_PRODUCTION_HOST = hostname === "ryanfamilymenu.netlify.app" || hostname === "main--ryanfamilymenu.netlify.app";
const IS_REVIEW_HOST = IS_NETLIFY_HOST && !IS_PRODUCTION_HOST;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (IS_REVIEW_HOST) return;
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => IS_REVIEW_HOST || key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/.netlify/functions/")) return;
  if (url.origin !== self.location.origin) return;

  // Any non-production Netlify hostname is a review environment. Always use the network
  // so a previous branch/deploy preview cannot pin an older document, CSP, or app shell.
  if (IS_REVIEW_HOST) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    } catch {
      return caches.match("./index.html");
    }
  })());
});
