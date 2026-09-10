const CACHE_NAME = "ryan-family-menu-v181";
// v181: force the recipe gravity-field preview to refresh and keep deploy previews network-first.
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

const IS_DEPLOY_PREVIEW = self.location.hostname.startsWith("deploy-preview-") && self.location.hostname.endsWith(".netlify.app");

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (IS_DEPLOY_PREVIEW) return;
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

  // Deploy previews must always reflect the branch that Netlify just built.
  // Never let a stale app-shell cache make a successful preview look unchanged.
  if (IS_DEPLOY_PREVIEW) {
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
