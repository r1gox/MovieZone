// public/js/data/catalogo.js
import { get } from '../core/http.js';

export async function getCatalog(type, page = 1, limit = 28) {
  let path = '/catalogo';
  if (type === 'series') path = '/series';
  if (type === 'anime') path = '/animes';

  const data = await get(path, { page, limit });
  const lista = data.resultados || data.results || [];
  return {
    resultados: lista,
    total: data.total ?? data.count ?? lista.length,
    page: data.page ?? page,
    limit: data.limit ?? limit
  };
}

export async function searchCatalog(termino, source = "online", page = 1, limit = 28) {
  // Por defecto ONLINE (API Worker vía /api/buscar)
  const src = source === "local" ? "local" : "online";
  const data = await get("/buscar", { q: termino, source: src, page, limit });
  const lista = data.resultados || data.results || [];
  return {
    resultados: lista,
    total: data.total ?? data.count ?? lista.length,
    page: data.page ?? page,
    limit: data.limit ?? limit,
    source: data.source || src
  };
}
