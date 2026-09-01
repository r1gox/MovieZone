const CACHE = "moviezone-v3";
const ASSETS = ["/", "/index.html", "/styles.css"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
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

  // Nunca cachear JS ni API → siempre red (evita Brave vs Chrome distinto)
  if (
    url.pathname.endsWith("app.js") ||
    url.pathname.endsWith("sw.js") ||
    url.pathname.endsWith("styles.css") ||
    url.pathname.startsWith("/api/")
  ) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).catch(() => caches.match("/")))
  );
});
