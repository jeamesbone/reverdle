/* Reverdle offline cache. Bump CACHE when any asset changes. */
const CACHE = 'reverdle-v2';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'game.js',
  'data/dict.js',
  'data/puzzles.js',
  'data/tutorial.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function store(request, response) {
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy));
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // The page itself goes network-first, so a deploy is picked up on the next
  // load instead of waiting for a cache bump. Everything else is cache-first.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => store(request, response))
        .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches
      .match(request)
      .then((hit) => hit || fetch(request).then((response) => store(request, response)))
  );
});
