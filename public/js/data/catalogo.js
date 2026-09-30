// public/js/data/catalogo.js
import { get } from '../core/http.js';

/** Anime sección = solo AV1. JK = source 5. */
export async function getCatalog(type, page = 1, limit = 28, opts = {}) {
  let path = '/catalogo';
  if (type === 'series') path = '/series';
  if (type === 'anime') path = '/animes';

  const params = { page, limit };
  if (type === 'anime' && opts.animeSource === 'jk') {
    params.source_id = '5';
    params.source = 'jkanime';
  } else if (type === 'anime') {
    params.source_id = '4';
    params.source = 'animeav1';
  }

  const data = await get(path, params);
  let lista = data.resultados || data.results || [];

  if (type === 'anime' && opts.animeSource === 'jk') {
    lista = lista.filter((it) => {
      const s = String(it.source_id || it.fuente || it.source || '').toLowerCase();
      const link = String(it.link || it.url || '').toLowerCase();
      return s === '5' || s === 'jkanime' || s === 'jk' || link.includes('jkanime') || link.includes('/5/');
    });
  } else if (type === 'anime') {
    lista = lista.filter((it) => {
      const s = String(it.source_id || it.fuente || it.source || '').toLowerCase();
      return !(s === '5' || s === 'jkanime' || s === 'jk');
    });
  }

  return {
    resultados: lista,
    total: data.total ?? data.count ?? lista.length,
    page: data.page ?? page,
    limit: data.limit ?? limit,
  };
}

export async function searchCatalog(termino, source = 'online', page = 1, limit = 28, opts = {}) {
  const src = source === 'local' ? 'local' : 'online';
  const params = { q: termino, source: src, page, limit };
  if (opts.animeSource === 'jk') {
    params.source_id = '5';
    params.anime_source = 'jk';
  } else if (opts.animeSource === 'av1') {
    params.source_id = '4';
    params.anime_source = 'av1';
  }
  const data = await get('/buscar', params);
  return {
    resultados: data.resultados || data.results || [],
    total: data.total ?? data.count ?? 0,
    page: data.page ?? page,
    limit: data.limit ?? limit,
    source: data.source || src,
  };
}
