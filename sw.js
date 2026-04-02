const CACHE_NAME = 'cain-cache-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/script.js',
  '/manifest.json',
  '/cain_face.png',
  '/favicon.ico'
];

// Instalação - Cacheia ativos estáticos
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Ativação - Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Busca - Estratégia de Cache First, falling back to Network
self.addEventListener('fetch', (event) => {
  // Ignora requisições de API (o script.js cuida da persistência local para elas)
  if (event.request.url.includes('/chat') || event.request.url.includes('/stats') || event.request.url.includes('/knowledge')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        // Opcionalmente cacheia novos recursos estáticos encontrados (como modelos face-api do CDN)
        if (event.request.url.includes('jsdelivr') || event.request.url.includes('google')) {
           return caches.open(CACHE_NAME).then(cache => {
             cache.put(event.request, fetchRes.clone());
             return fetchRes;
           });
        }
        return fetchRes;
      });
    })
  );
});
