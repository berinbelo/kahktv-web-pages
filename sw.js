// KahKTV Web Service Worker
const CACHE_NAME = "kahktv-pwa-v2.4.0";
const SCOPE_PATH = new URL("./", self.location.href).pathname;
const STATIC_ASSETS = [
  SCOPE_PATH,
  `${SCOPE_PATH}manifest.json`,
  `${SCOPE_PATH}icons/icon-192.png`,
  `${SCOPE_PATH}icons/icon-512.png`,
  `${SCOPE_PATH}icons/icon-192.svg`,
  `${SCOPE_PATH}icons/icon-512.svg`
];

// Instalação: pré-cache dos assets estáticos fundamentais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação: limpeza agressiva de caches antigos de versões anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições:
// Para streams de vídeo (/api/stream), chamadas dinâmicas e catálogo comprimido, não usar cache de SW
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const relPath = url.pathname.startsWith(SCOPE_PATH)
    ? `/${url.pathname.slice(SCOPE_PATH.length)}`
    : url.pathname;

  if (
    relPath.startsWith("/api/stream") ||
    relPath.startsWith("/api/catalog") ||
    relPath.startsWith("/api/standings") ||
    relPath.startsWith("/api/matches") ||
    relPath.endsWith(".json.gz") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // Navegação HTML em Network-First para refletir novas versões no PWA imediatamente
  if (
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    url.pathname === SCOPE_PATH
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match(SCOPE_PATH)))
    );
    return;
  }

  // Stale-while-revalidate para chunks estáticos e imagens
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
