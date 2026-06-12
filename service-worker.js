const CACHE_NAME = "ryan-family-menu-v6";
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
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
