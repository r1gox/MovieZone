// public/js/data/catalogo.js
import { get } from '../core/http.js';

/**
 * type: 'movie' | 'series' | 'anime'
 * opts.animeSource: 'av1' | 'jk' | null  → source_id 4 o 5
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
  // Filtro cliente por si el backend aún no filtra
  if (type === 'anime' && opts.animeSource === 'jk') {
    lista = lista.filter((it) => {
      const s = String(it.source_id || it.fuente || it.source || '');
      return s === '5' || /jkanime|jk/i.test(s);
    });
  } else if (type === 'anime' && opts.animeSource === 'av1') {
    lista = lista.filter((it) => {
      const s = String(it.source_id || it.fuente || it.source || '');
      return s === '4' || /animeav1|av1/i.test(s) || (!s && !/jkanime/i.test(String(it.link || '')));
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
 * @param {string} termino
 * @param {string} source online|local
 * @param {number} page
 * @param {number} limit
 * @param {object} opts { animeSource: 'av1'|'jk'|null }
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
  let lista = data.resultados || data.results || [];
  if (opts.animeSource === 'jk') {
    lista = lista.filter((it) => {
      const s = String(it.source_id || it.fuente || it.source || '');
      const link = String(it.link || it.url || '');
      return s === '5' || /jkanime|\/5\//i.test(s + link);
    });
  } else if (opts.animeSource === 'av1') {
    lista = lista.filter((it) => {
      const s = String(it.source_id || it.fuente || it.source || '');
      const link = String(it.link || it.url || '');
      return s === '4' || /animeav1|\/4\//i.test(s + link);
    });
  }
  return {
    resultados: lista,
    total: data.total ?? data.count ?? lista.length,
    page: data.page ?? page,
    limit: data.limit ?? limit,
    source: data.source || src,
  };
}
