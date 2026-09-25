const CACHE = "moviezone-v4";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.json",
  "/icons/moviezone-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // JS y API siempre red
  if (
    url.pathname.endsWith(".js") ||
    url.pathname.startsWith("/api/") ||
    url.hostname.indexOf("workers.dev") !== -1
  ) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() => caches.match("/"))
    );
    return;
  }

  // HTML/CSS/static: cache-first con actualización en segundo plano
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request)
        .then((res) => {
          try {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          } catch (_) {}
          return res;
        })
        .catch(() => cached || caches.match("/"));
      return cached || net;
    })
  );
});
