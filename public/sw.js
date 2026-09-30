const CACHE = "moviezone-v9-20260927f";
const PRECACHE = [
  "/manifest.json",
  "/icons/moviezone-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  var p = url.pathname;

  // API: siempre red
  if (p.indexOf("/api/") === 0) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(function () {
        return new Response(JSON.stringify({ resultados: [], error: "offline" }), {
          headers: { "Content-Type": "application/json" }
        });
      })
    );
    return;
  }

  // JS/CSS: network first (updates sin borrar datos)
  if (/\.(js|css)$/i.test(p) || p.indexOf("/js/") === 0 || p.indexOf("/css/") === 0) {
    e.respondWith(
      fetch(e.request)
        .then(function (res) { return res; })
        .catch(function () { return caches.match(e.request); })
    );
    return;
  }

  // HTML: network first
  if (p === "/" || p.indexOf("/detalle") === 0 || /\/index\.html$/i.test(p) || !/\.[a-z0-9]+$/i.test(p)) {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match(e.request).then(function (c) { return c || caches.match("/"); });
      })
    );
    return;
  }

  // Imágenes y resto
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      var net = fetch(e.request)
        .then(function (res) {
          if (res && res.ok && /\.(png|jpg|jpeg|webp|svg|ico)$/i.test(p)) {
            try {
              var copy = res.clone();
              caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
            } catch (_) {}
          }
          return res;
        })
        .catch(function () { return cached; });
      return cached || net;
    })
  );
});
