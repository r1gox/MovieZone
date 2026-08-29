// public/js/data/catalog.js
import { get } from '../core/http.js';

/**
 * type: 'movie' | 'series' | 'anime'
 * Usa TUS rutas actuales del backend.
 */
export async function getCatalog(type, page = 1, limit = 28) {
  let path = '/catalogo';
  if (type === 'series') path = '/series';
  if (type === 'anime') path = '/animes';

  const data = await get(path, { page, limit });
  
  return {
    resultados: data.resultados || [],
    total: data.total ?? (data.resultados || []).length,
    page: data.page ?? page,
    limit: data.limit ?? limit
  };
}

export async function searchCatalog(termino, source = "local") {
  const data = await get("/buscar", { q: termino, source });
  return {
    resultados: data.resultados || [],
    total: data.total ?? (data.resultados || []).length,
    source: data.source || source
  };
}
