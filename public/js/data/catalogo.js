// public/js/data/catalogo.js
import { get } from '../core/http.js';

/**
 * type: 'movie' | 'series' | 'anime'
 * opts.animeSource: 'av1' | 'jk' | null
 */
export async function getCatalog(type, page = 1, limit = 28, opts = {}) {
  let path = '/catalogo';
  if (type === 'series') path = '/series';
  if (type === 'anime') path = '/animes';

  const params = { page, limit };
  if (type === 'anime' && opts.animeSource === 'jk') {
    params.source_id = '5';
    params.source = 'jkanime';
  } else if (type === 'anime' && opts.animeSource === 'av1') {
    params.source_id = '4';
    params.source = 'animeav1';
  }

  const data = await get(path, params);
  let lista = data.resultados || data.results || [];
  if (type === 'anime' && opts.animeSource === 'jk') {
    lista = lista.filter((it) => {
      const s = String(it.source_id || it.fuente || it.source || '').toLowerCase();
      const link = String(it.link || it.url || '').toLowerCase();
      if (!s && !link) return true;
      return s === '5' || s === 'jkanime' || s === 'jk' || link.includes('jkanime') || link.includes('/5/');
    });
  }
  return {
    resultados: lista,
    total: data.total ?? data.count ?? lista.length,
    page: data.page ?? page,
    limit: data.limit ?? limit,
  };
}

/**
 * Búsqueda. animeSource jk → /api/buscar con source_id=5 (Worker /5?q=)
 * sin animeSource → búsqueda general
 */
export async function searchCatalog(termino, source = 'online', page = 1, limit = 28, opts = {}) {
  const src = source === 'local' ? 'local' : 'online';
  const params = {
    q: termino,
    source: src,
    page,
    limit,
  };
  if (opts.animeSource === 'jk') {
    params.source_id = '5';
    params.anime_source = 'jk';
  } else if (opts.animeSource === 'av1') {
    params.source_id = '4';
    params.anime_source = 'av1';
  }
  const data = await get('/buscar', params);
  // No filtrar agresivo: el server ya limitó por fuente
  let lista = data.resultados || data.results || [];
  return {
    resultados: lista,
    total: data.total ?? data.count ?? lista.length,
    page: data.page ?? page,
    limit: data.limit ?? limit,
    source: data.source || src,
  };
}
