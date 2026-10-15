const CACHE_VERSION = 'jop.shell.v1';
const SHELL = [
  './', './index.html', './app.js', './app.css', './parser.js', './filter.js',
  './store.js', './github.js', './manifest.webmanifest',
  './icon-180.png', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith('jop.shell.') && name !== CACHE_VERSION)
      .map(name => caches.delete(name)),
  )));
});

self.addEventListener('fetch', event => {
  if (new URL(event.request.url).origin !== self.location.origin || event.request.method !== 'GET') return;
  event.respondWith(caches.open(CACHE_VERSION).then(async cache => {
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  }));
});
