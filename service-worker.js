const CACHE_NAME = "ryan-family-menu-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/meatballs-1.jpg",
  "./assets/meatballs-2.jpg",
  "./assets/meatballs-3.jpg",
  "./assets/milanese-1.jpg",
  "./assets/milanese-2.jpg",
  "./assets/milanese-3.jpg",
  "./assets/milanese-4.jpg",
  "./assets/halibut-summer-1.jpg",
  "./assets/halibut-summer-2.jpg",
  "./assets/halibut-summer-3.jpg",
  "./assets/lemon-chicken-1.jpg",
  "./assets/zaatar-potatoes-1.jpg",
  "./assets/lemon-bucatini-1.jpg",
  "./assets/pasta-meat-sauce-1.jpg",
  "./assets/strawberry-crunch-salad-1.jpg",
  "./assets/strawberry-crunch-salad-2.jpg",
  "./assets/roasted-brussels-salad-1.jpg",
  "./assets/roasted-brussels-salad-2.jpg",
  "./assets/chicken-noodle-soup-1.jpg",
  "./assets/pot-roast-1.jpg",
  "./assets/pot-roast-2.jpg",
  "./assets/pot-roast-3.jpg",
  "./assets/basil-pesto-1.jpg",
  "./assets/basil-pesto-2.jpg",
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

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
