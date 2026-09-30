// js/perf/snappy.js — sensación de página real: cache + UI inmediata
const DETAIL_CACHE_PREFIX = "mz_det_v1:";
const DETAIL_CACHE_MAX = 40;
const DETAIL_TTL_MS = 30 * 60 * 1000; // 30 min

function _slugKey(item) {
  if (!item) return "";
  const sid = String(item.source_id || item.fuente || item.source || "").toLowerCase();
  const slug = String(item.slug || item.id || "").toLowerCase();
  const link = String(item.link || item.url || item.url_extract || "").toLowerCase();
  return (sid || "x") + "|" + (slug || link || String(item.nombre || item.titulo || "").toLowerCase());
}

export function detailCacheKey(item) {
  return DETAIL_CACHE_PREFIX + _slugKey(item);
}

export function getCachedDetail(item) {
  try {
    const raw = sessionStorage.getItem(detailCacheKey(item));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.data) return null;
    if (obj.ts && Date.now() - obj.ts > DETAIL_TTL_MS) {
      sessionStorage.removeItem(detailCacheKey(item));
      return null;
    }
    return obj.data;
  } catch (_) {
    return null;
  }
}

export function setCachedDetail(item, data) {
  try {
    if (!item || !data) return;
    const key = detailCacheKey(item);
    sessionStorage.setItem(
      key,
      JSON.stringify({ ts: Date.now(), data: data })
    );
    // LRU simple: limitar entradas
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.indexOf(DETAIL_CACHE_PREFIX) === 0) keys.push(k);
    }
    if (keys.length > DETAIL_CACHE_MAX) {
      keys.sort();
      for (let j = 0; j < keys.length - DETAIL_CACHE_MAX; j++) {
        try { sessionStorage.removeItem(keys[j]); } catch (_) {}
      }
    }
  } catch (_) {}
}

/** Mezcla meta de caché sobre el item del listado (sin pisar source_id del listado) */
export function applyCachedMeta(item, cached) {
  if (!item || !cached) return item;
  const lockSid = item.source_id != null ? String(item.source_id) : null;
  const keepPortada = item.portada || item.poster || null;
  const fields = [
    "descripcion", "descripcion_corta", "synopsis", "overview",
    "year", "fecha_estreno", "rating", "calificacion", "rating_source", "rating_imdb",
    "generos", "genero", "duracion_texto", "duracion", "estado",
    "logo", "logo_imdb", "backdrop", "portada_imdb",
    "titulo", "nombre", "titulo_original",
    "temporadas", "episodios", "total_temporadas", "total_episodios",
    "imdb_id", "formato", "tipo",
  ];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (cached[f] != null && cached[f] !== "") item[f] = cached[f];
  }
  // Portada del listado tiene prioridad (no reemplazar por metahub al cachear)
  if (keepPortada) item.portada = keepPortada;
  if (lockSid) {
    item.source_id = lockSid;
  }
  return item;
}

/** Feedback inmediato en el cuadro del player */
export function showPlayerLoadingShell(msg) {
  try {
    const hint = document.getElementById("mz-kp-poster-hint");
    if (hint) hint.textContent = msg || "Cargando…";
    const ph = document.getElementById("mz-kp-placeholder");
    if (ph) {
      ph.classList.remove("hidden");
      const span = ph.querySelector("span");
      if (span) span.textContent = msg || "Cargando…";
    }
    const layer = document.getElementById("mz-kp-poster-layer");
    if (layer) layer.classList.remove("hidden");
    // Player clásico
    const title = document.getElementById("player-title");
    if (title) title.textContent = msg || "Cargando…";
  } catch (_) {}
}

/** Abre panel detalle al instante (sin esperar API) */
export function openDetailsShell() {
  try {
    const detailsEmpty = document.getElementById("details-empty");
    const detailsContent = document.getElementById("details-content");
    const detailsPanel = document.getElementById("details-panel");
    if (detailsEmpty) detailsEmpty.classList.add("hidden");
    if (detailsContent) detailsContent.classList.remove("hidden");
    if (detailsPanel) detailsPanel.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    document.body.classList.add("details-open");
  } catch (_) {}
}
