/**
 * MOVIEZONE v2 — Backend sin scraping
 * Fuente de datos: https://moviezone.tvjz.workers.dev/
 * Fuentes Worker: 1=lamovie 2=hackstore 3=pelisplushd 4=animeav1 5=animedbs 6=doramasflix
 * Meta: la fuente manda; IMDb/TMDB solo rellenan huecos (calificacion, year, descripcion, portada)
 * Persistencia: Supabase (misma tabla "movies")
 * Listo para Vercel (serverless) y Node local.
 */
const express = require("express");
const axios = require("axios");
const path = require("path");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Espera un momento." },
});
const limiterBusqueda = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas búsquedas. Espera un momento." },
});
app.use(limiterGeneral);

// No crashear si faltan env en el arranque (Vercel cold start / misconfig)
let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_KEY || "";
  if (!url || !key) {
    console.warn("Supabase no configurado: faltan SUPABASE_URL o SUPABASE_KEY");
    return null;
  }
  supabase = createClient(url, key);
  return supabase;
}

const PORT = process.env.PORT || 3000;
const API_BASE = (process.env.MOVIEZONE_API || "https://moviezone.tvjz.workers.dev").replace(/\/$/, "");
// Fuente por defecto para listados de estrenos / populares (3 = pelisplushd)
// Worker: 1=lamovie 2=hackstore 3=pelisplushd 4=animeav1 5=animedbs 6=doramasflix
const DEFAULT_SOURCE = process.env.MOVIEZONE_SOURCE || "3";

/** Normaliza nombre de fuente o id numérico → "1"…"6" */
function resolverSourceId(val) {
  if (val == null || val === "") return DEFAULT_SOURCE;
  const s = String(val).toLowerCase().trim();
  if (/^[1-6]$/.test(s)) return s;
  const map = {
    lamovie: "1",
    hackstore: "2",
    pelisplushd: "3",
    pelisplus: "3",
    animeav1: "4",
    animedbs: "5",
    doramasflix: "6",
    doramaflix: "6",
  };
  return map[s] || DEFAULT_SOURCE;
}

/**
 * Identidad para pedir detalle a la API Worker:
 * link tipo https://moviezone.tvjz.workers.dev/3/pelicula/la-captura
 * → { source_id: "3", kind: "pelicula", slug: "la-captura" }
 */
function parseIdentidad(input) {
  if (!input) return null;
  // Acepta item completo o { link, slug, source_id, tipo }
  const link = input.link || input.url_extract || input.url || null;
  let slug = input.slug || null;
  let source_id = input.source_id != null ? String(input.source_id) : null;
  let tipo = input.tipo || input.type || null;
  let kind = null;

  if (link) {
    const m = String(link).match(
      /(?:workers\.dev|localhost(?::\d+)?)?\/(\d)\/(pelicula|serie|anime)\/([^\/\?\#]+)/i
    ) || String(link).match(/\/(\d)\/(pelicula|serie|anime)\/([^\/\?\#]+)/i);
    if (m) {
      if (!source_id) source_id = m[1];
      kind = m[2].toLowerCase();
      if (!slug) {
        try {
          slug = decodeURIComponent(m[3]);
        } catch (_) {
          slug = m[3];
        }
      }
    }
  }

  // source_id por nombre de fuente
  if (!source_id && input.fuente) {
    try {
      source_id = String(resolverSourceId(input.fuente));
    } catch (_) {}
  }

  if (!kind && tipo) {
    const t = String(tipo).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes("anime")) kind = "anime";
    else if (t.includes("serie") || t === "tv") kind = "serie";
    else kind = "pelicula";
  }
  if (!kind) kind = "pelicula";

  // source por defecto pelisplus
  if (!source_id) source_id = "3";

  if (!slug) return null;

  return {
    source_id: String(source_id),
    kind,
    slug: String(slug).replace(/\/+$/, ""),
  };
}



const api = axios.create({
  baseURL: API_BASE,
  timeout: 25000,
  headers: {
    "User-Agent": "MovieZone/2.0",
    Accept: "application/json",
  },
});

// ---------- Memoria local (espejo de Supabase) ----------
// En Vercel la memoria es por instancia y se queda vieja: prioritizamos Supabase.
let moviesDB = [];
let knownLinks = new Set();
const discardedLinks = new Set();
let moviesDBLoadedAt = 0;
const MOVIES_DB_TTL_MS = 15 * 1000; // refrescar desde Supabase cada 15s

function esDescartado(item) {
  if (!item) return true;
  if (item.certificacion === "DESCARTADO" || item.descripcion === "__DISCARDED__") return true;
  if (item.link && discardedLinks.has(item.link)) return true;
  return false;
}


/** En búsqueda online: no mostrar lo que no tiene forma de reproducir */
function filtrarSinReproductor(lista) {
  return (lista || []).filter((item) => {
    if (!item) return false;
    const tipo = String(item.tipo || "").toLowerCase();
    const esSA = tipo === "serie" || tipo === "anime";
    if (item.tiene_player === true) return true;
    if (item.embeds && item.embeds.length) return true;
    if (item.reproductor) return true;
    if (esSA) {
      if (item.episodios && item.episodios.length) return true;
      if (item.total_episodios && item.total_episodios > 0) return true;
      if (item.temporadas && item.temporadas.length) return true;
      // Listado de búsqueda de animeav1 solo trae slug: se permite si source_id 4 y slug
      // pero se oculta si ya está en DB marcado sin player y sin episodios
      const sid = resolverSourceId(item.source_id || item.fuente);
      // animeav1 / animedbs / doramasflix: listado con slug basta
      if (["4", "5", "6"].includes(sid)) {
        if (item.tiene_player === false) return false;
        return !!(item.slug || item.link);
      }
      return !!(item.slug || item.link);
    }
    // Películas: solo si tiene player
    if (item.tiene_player === false) return false;
    return false;
  });
}

function filtrarDescartados(lista) {
  return (lista || []).filter((i) => !esDescartado(i));
}

async function cargarDatosSupabase(force = false) {
  const ahora = Date.now();
  if (!force && moviesDB.length && ahora - moviesDBLoadedAt < MOVIES_DB_TTL_MS) {
    return moviesDB;
  }
  try {
    const sb = getSupabase();
    if (!sb) return moviesDB;
    const { data, error } = await sb
      .from("movies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const all = (data || []).map(normalizeItemFromDB).filter(Boolean);
    // Separar descartados
    discardedLinks.clear();
    for (const m of all) {
      if (esDescartado(m) && m.link) discardedLinks.add(m.link);
    }
    moviesDB = all.filter((m) => !esDescartado(m));
    knownLinks = new Set(moviesDB.map((i) => i.link).filter(Boolean));
    moviesDBLoadedAt = Date.now();
    console.log(`Supabase DB cargada: ${moviesDB.length} items (${discardedLinks.size} descartados)`);
  } catch (err) {
    console.error("No se pudo cargar desde Supabase:", err.message);
    if (!moviesDB.length) {
      moviesDB = [];
      knownLinks = new Set();
    }
  }
  return moviesDB;
}

/** Asegura datos frescos de Supabase antes de listados / búsqueda */
async function ensureMoviesDB() {
  await cargarDatosSupabase(false);
  return moviesDB;
}

function itemTieneContenidoValido(item) {
  if (!item) return false;
  if (item.reproductor && String(item.reproductor).length > 10) return true;
  if (Array.isArray(item.embeds) && item.embeds.length > 0) return true;
  if (Array.isArray(item.episodios) && item.episodios.length > 0) return true;
  if (Array.isArray(item.temporadas) && item.temporadas.length > 0) return true;
  return false;
}

async function guardarEnSupabase(items) {
  if (!items || !items.length) return;
  const sb = getSupabase();
  if (!sb) return;

  const paraInsertarRaw = items
    .map((item) => {
      // Asegurar link para upsert
      if (!item.link && item.url_extract) item.link = item.url_extract;
      if (!item.link && item.slug && item.source_id) {
        const k = /anime/i.test(item.tipo || "") ? "anime" : /serie/i.test(item.tipo || "") ? "serie" : "pelicula";
        item.link = `${API_BASE}/${item.source_id}/${k}/${item.slug}`;
      }
      return item;
    })
    .filter((item) => item.link && !discardedLinks.has(item.link) && !esDescartado(item))
    .map((item) => {
      let nombre = item.nombre || null;
      if (nombre && (item.tipo === "Serie" || item.tipo === "Anime")) {
        nombre = nombre
          .replace(/\s*[-–—]\s*(Temporada|Season|Episodio|Episode|Capítulo|Capitulo).*$/i, "")
          .trim();
      }
      // Proteger datos ya guardados: un listado no debe borrar players/descripción
      const existente = moviesDB.find((m) => m.link === item.link) || null;
      const tieneNuevo = itemTieneContenidoValido(item);
      const embedsFinal =
        tieneNuevo && item.embeds?.length
          ? item.embeds
          : (existente?.embeds?.length ? existente.embeds : item.embeds || []);
      // Fusionar episodios: no pisar players ya guardados con stubs vacíos del listado/API
      let episodiosFinal = item.episodios?.length ? item.episodios : (existente?.episodios || []);
      if (item.episodios?.length && existente?.episodios?.length) {
        const byKey = new Map();
        for (const ep of existente.episodios) {
          const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
          byKey.set(k, ep);
        }
        episodiosFinal = item.episodios.map((ep) => {
          const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
          const prev = byKey.get(k);
          if (!prev) return ep;
          const tieneNuevos = Array.isArray(ep.embeds) && ep.embeds.length > 0;
          if (tieneNuevos) return ep;
          if (prev.embeds?.length || prev.video || prev.reproductor) {
            return {
              ...ep,
              embeds: prev.embeds || [],
              video: prev.video || prev.reproductor || ep.video || null,
              reproductor: prev.reproductor || prev.video || ep.reproductor || null,
              downloads: (ep.downloads && ep.downloads.length) ? ep.downloads : (prev.downloads || []),
            };
          }
          return ep;
        });
        const seen = new Set(episodiosFinal.map((ep) => `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`));
        for (const ep of existente.episodios) {
          const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
          if (!seen.has(k) && (ep.embeds?.length || ep.video || ep.reproductor)) {
            episodiosFinal.push(ep);
          }
        }
      }
      const descripcionFinal = elegirMejorDescripcion(item.descripcion, existente?.descripcion);
      return {
        link: item.link,
        nombre: (function () {
          const n = limpiarTitulo(nombre || null);
          const ne = limpiarTitulo(existente?.nombre || null);
          // Nunca guardar slug como nombre
          const slug = item.slug || existente?.slug || "";
          if (n && String(n).toLowerCase().replace(/\s+/g, "-") !== String(slug).toLowerCase()) return n;
          if (ne && String(ne).toLowerCase().replace(/\s+/g, "-") !== String(slug).toLowerCase()) return ne;
          return n || ne || null;
        })(),
        titulo_original: item.titulo_original || existente?.titulo_original || null,
        portada: item.portada || existente?.portada || null,
        backdrop: item.backdrop || existente?.backdrop || null,
        descripcion: descripcionFinal,
        year: (function () {
          const yi = item.year && String(item.year).match(/(19|20)\d{2}/);
          const ye = existente?.year && String(existente.year).match(/(19|20)\d{2}/);
          // Si la API trae año distinto al de DB, confiar en la API (no mezclar 2012 con 2026)
          if (yi) return yi[0];
          if (ye) return ye[0];
          return item.year || existente?.year || null;
        })(),
        genero: item.genero || existente?.genero || null,
        generos: (item.generos && item.generos.length) ? item.generos : (existente?.generos || null),
        tipo: item.tipo || existente?.tipo || "Película",
        idiomas: (item.idiomas && item.idiomas.length) ? item.idiomas : (existente?.idiomas || []),
        calidad: (item.calidad && item.calidad.length) ? item.calidad : (existente?.calidad || []),
        paises: item.paises || existente?.paises || [],
        calificacion: (function () {
          const yi = item.year && String(item.year).match(/(19|20)\d{2}/);
          const ye = existente?.year && String(existente.year).match(/(19|20)\d{2}/);
          if (yi && ye && yi[0] !== ye[0]) return item.calificacion ?? null;
          return item.calificacion ?? existente?.calificacion ?? null;
        })(),
        calificacion_comunidad: item.calificacion_comunidad || existente?.calificacion_comunidad || null,
        votos: (function () {
          const yi = item.year && String(item.year).match(/(19|20)\d{2}/);
          const ye = existente?.year && String(existente.year).match(/(19|20)\d{2}/);
          if (yi && ye && yi[0] !== ye[0]) {
            return item.votos ? Math.trunc(Number(item.votos)) || null : null;
          }
          return item.votos ? Math.trunc(Number(item.votos)) || null : (existente?.votos || null);
        })(),
        fecha_estreno: item.fecha_estreno || existente?.fecha_estreno || null,
        duracion: item.duracion ? Math.trunc(Number(item.duracion)) || null : (existente?.duracion || null),
        certificacion: item.certificacion || existente?.certificacion || null,
        imdb: item.imdb || (existente && (!item.year || !existente.year || String(item.year).slice(0,4) === String(existente.year).slice(0,4)) ? existente.imdb : null) || null,
        tmdb: item.tmdb || (existente && (!item.year || !existente.year || String(item.year).slice(0,4) === String(existente.year).slice(0,4)) ? existente.tmdb : null) || null,
        ultimo_episodio: item.ultimo_episodio || existente?.ultimo_episodio || null,
        reproductor: item.reproductor || existente?.reproductor || null,
        embeds: embedsFinal,
        downloads: (item.downloads && item.downloads.length) ? item.downloads : (existente?.downloads || []),
        solo_trailer: !!(item.soloTrailer || existente?.soloTrailer),
        episodios: episodiosFinal,
        temporadas: (item.temporadas && item.temporadas.length) ? item.temporadas : (existente?.temporadas || []),
        postId: item.postId || existente?.postId || null,
        slug: item.slug || existente?.slug || null,
        source_id: item.source_id || existente?.source_id || null,
        tiene_player: tieneNuevo || !!(existente && (existente.tiene_player || itemTieneContenidoValido(existente))),
      };
    });

  const vistos = new Set();
  const paraInsertar = [];
  for (const row of paraInsertarRaw) {
    if (!row.link || vistos.has(row.link)) continue;
    vistos.add(row.link);
    paraInsertar.push(row);
  }
  if (!paraInsertar.length) return;

  // Campos seguros (evita fallo si la tabla no tiene columnas nuevas)
  function rowSafe(row) {
    const {
      link, nombre, titulo_original, portada, backdrop, descripcion, year, genero, tipo,
      idiomas, calidad, paises, calificacion, calificacion_comunidad, votos, fecha_estreno,
      duracion, certificacion, ultimo_episodio, reproductor, embeds, downloads, solo_trailer,
      episodios, temporadas, postId, slug, source_id, tiene_player,
    } = row;
    return {
      link, nombre, titulo_original, portada, backdrop, descripcion, year, genero, tipo,
      idiomas: idiomas || [],
      calidad: calidad || [],
      paises: paises || [],
      calificacion,
      calificacion_comunidad,
      votos,
      fecha_estreno,
      duracion,
      certificacion,
      ultimo_episodio,
      reproductor,
      embeds: embeds || [],
      downloads: downloads || [],
      solo_trailer: !!solo_trailer,
      episodios: episodios || [],
      temporadas: temporadas || [],
      postId,
      slug,
      source_id: source_id != null ? String(source_id) : null,
      tiene_player: !!tiene_player,
    };
  }

  const safeRows = paraInsertar.map(rowSafe);

  try {
    let { error } = await sb.from("movies").upsert(safeRows, { onConflict: "link" });
    if (error) {
      console.warn("Upsert full falló, reintento mínimo:", error.message);
      // Reintento solo columnas esenciales
      const minimal = safeRows.map((r) => ({
        link: r.link,
        nombre: r.nombre,
        portada: r.portada,
        descripcion: r.descripcion,
        year: r.year,
        genero: r.genero,
        tipo: r.tipo,
        calificacion: r.calificacion,
        embeds: r.embeds,
        downloads: r.downloads,
        episodios: r.episodios,
        temporadas: r.temporadas,
        slug: r.slug,
        source_id: r.source_id,
        tiene_player: r.tiene_player,
        reproductor: r.reproductor,
      }));
      const r2 = await sb.from("movies").upsert(minimal, { onConflict: "link" });
      if (r2.error) throw r2.error;
    }
    // Memoria local siempre (aunque Supabase falle parcialmente)
    paraInsertar.forEach((item) => {
      knownLinks.add(item.link);
      const idx = moviesDB.findIndex((m) => m.link === item.link);
      if (idx >= 0) moviesDB[idx] = { ...moviesDB[idx], ...item, tiene_player: !!(item.tiene_player || itemTieneContenidoValido(item)) };
      else moviesDB.unshift({ ...item, tiene_player: !!(item.tiene_player || itemTieneContenidoValido(item)) });
    });
    console.log(`Guardados/actualizados ${paraInsertar.length} items en Supabase (players=${paraInsertar.filter((i) => i.tiene_player).length})`);
    return true;
  } catch (err) {
    console.error("Error guardando en Supabase:", err.message || err);
    // Aun así espejo en memoria para esta instancia
    paraInsertar.forEach((item) => {
      if (!item.link) return;
      knownLinks.add(item.link);
      const idx = moviesDB.findIndex((m) => m.link === item.link);
      if (idx >= 0) moviesDB[idx] = { ...moviesDB[idx], ...item };
      else moviesDB.unshift(item);
    });
    return false;
  }
}

// ---------- Helpers de mapeo API → formato frontend ----------
function normalizarTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t.includes("serie") || t === "tv" || t === "tvshows") return "Serie";
  if (t.includes("anime")) return "Anime";
  if (t.includes("cap") || t.includes("episod")) return "Capitulo";
  return "Película";
}

function extraerAnio(titulo, year) {
  if (year) return String(year).substring(0, 4);
  const m = String(titulo || "").match(/\((\d{4})\)/);
  if (m) return m[1];
  const m2 = String(titulo || "").match(/\b(19|20)\d{2}\b/);
  return m2 ? m2[0] : null;
}

/** Corrige texto mal codificado (mojibake UTF-8 leído como Latin-1): "CÃ³digo" → "Código" */
function fixEncoding(text) {
  if (!text || typeof text !== "string") return text || "";
  let s = text;
  // Detección rápida de mojibake típico
  if (/Ã.|Â.|â.|ð./.test(s)) {
    try {
      // latin1 bytes → utf8
      const fixed = Buffer.from(s, "latin1").toString("utf8");
      // Solo aplicar si mejora (menos caracteres raros)
      const bad = (t) => (t.match(/Ã.|Â.|â.|ð.|�/g) || []).length;
      if (bad(fixed) < bad(s) && !fixed.includes("\uFFFD")) {
        s = fixed;
      }
    } catch (_) {}
  }
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function limpiarTitulo(titulo) {
  let s = fixEncoding(titulo);
  if (!s) return s;
  // Quitar spam SEO típico: "VER X Online Gratis HD", "Watch X Free Full HD", etc.
  s = s
    .replace(/^(ver|watch|ver\s+online|mira|descargar?)\s+/i, "")
    .replace(/\s*[-–—:|]\s*(ver|watch|online|gratis|free|hd|full\s*hd|4k|subtitulad[oa]?s?|latino|castellano|espa[nñ]ol|pelicula|serie|anime).*$/i, "")
    .replace(/\s+(online|gratis|free|hd|full\s*hd|4k|1080p|720p|subtitulad[oa]?s?|latino|castellano)(\s+(online|gratis|free|hd|full\s*hd|4k|1080p|720p|subtitulad[oa]?s?|latino|castellano))*$/i, "")
    .replace(/\s+(online|gratis|free)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Si quedó vacío, devolver el original limpio de encoding
  if (!s) return fixEncoding(titulo);
  return s;
}

function limpiarTexto(texto) {
  return fixEncoding(texto);
}

/** Limpia sinopsis truncadas o con prefijo "Pelicula Título:" */
function limpiarDescripcion(texto, titulo) {
  let s = limpiarTexto(texto || "");
  if (!s) return "";
  // Quitar prefijo "Pelicula X:" / "Serie X:" típico de pelisplushd
  s = s.replace(/^(Pel[ií]cula|Serie|Anime|Movie|TV)\s*[^:]{0,80}:\s*/i, "");
  // Si el título aparece al inicio, quitarlo
  if (titulo) {
    const t = limpiarTitulo(titulo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp("^" + t + "\\s*[:\\-–]?\\s*", "i"), "");
  }
  return s.trim();
}

function descripcionIncompleta(texto) {
  const s = String(texto || "").trim();
  if (s.length < 40) return true;
  if (/\.\.\.$|…$/.test(s)) return true;
  if (/^(Pel[ií]cula|Serie|Anime)\s/i.test(s) && s.length < 80) return true;
  return false;
}

/** Detecta si un texto parece español (preferir sobre inglés) */
function pareceEspanol(txt) {
  const s = String(txt || "");
  if (!s || s.length < 20) return false;
  if (/[áéíóúñü¿¡]/i.test(s)) return true;
  const es = (s.match(/\b(el|la|los|las|de|del|que|en|un|una|por|con|para|como|más|también|después|cuando|sobre|entre|hasta|desde|sin|este|esta|estos|sus|su|se|es|son|fue|ser|está|están|luego|demasiadas|contratar)\b/gi) || []).length;
  const en = (s.match(/\b(the|and|with|from|after|when|his|her|their|this|that|was|were|are|is|for|into|about|which|who|whom|all|of|made|by)\b/gi) || []).length;
  return es >= 3 && es > en;
}

function pareceIngles(txt) {
  const s = String(txt || "");
  if (!s || s.length < 20) return false;
  if (/[áéíóúñü¿¡]/i.test(s)) return false;
  const en = (s.match(/\b(the|and|with|from|after|when|his|her|their|this|that|was|were|are|is|for|into|about|which|all|of|made|by)\b/gi) || []).length;
  return en >= 3;
}

/**
 * Elige la mejor descripción: español completo > español > cualquier completa > más larga
 * Nunca reemplaza español válido por inglés solo porque sea más largo.
 */
function elegirMejorDescripcion(a, b) {
  const A = String(a || "").trim();
  const B = String(b || "").trim();
  if (!A) return B || null;
  if (!B) return A || null;
  const aEs = pareceEspanol(A);
  const bEs = pareceEspanol(B);
  const aEn = pareceIngles(A);
  const bEn = pareceIngles(B);
  const aInc = descripcionIncompleta(A);
  const bInc = descripcionIncompleta(B);

  // Si una es española y la otra inglesa → SIEMPRE la española (fuente > IMDb EN)
  if (aEs && bEn) return A;
  if (bEs && aEn) return B;
  if (aEs && !bEs) return A;
  if (bEs && !aEs) return B;
  // Ambos mismo idioma: preferir completa / más larga
  if (!aInc && bInc) return A;
  if (!bInc && aInc) return B;
  return A.length >= B.length ? A : B;
}

function extraerGenero(data) {
  if (!data) return null;
  const raw =
    data.genero ||
    data.genres ||
    data.categorias ||
    data.category ||
    data.categories ||
    data.genero_principal ||
    null;
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const parts = raw
      .map((g) => (typeof g === "string" ? g : g?.name || g?.nombre || ""))
      .map((g) => limpiarTexto(g))
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return limpiarTexto(String(raw)) || null;
}


function buildStreamUrl(embedUrl) {
  if (!embedUrl || typeof embedUrl !== "string") return null;
  const u = embedUrl.toLowerCase();
  const q = encodeURIComponent(embedUrl);
  if (u.includes("vimeos")) return `${API_BASE}/resolve/vimeos?url=${q}&proxy=1`;
  if (/streamwish|flaswish|strwish|ahvsh|streamhg/.test(u)) return `${API_BASE}/wish/streamurl?url=${q}`;
  if (u.includes("goodstream")) return `${API_BASE}/goodstream/streamurl?url=${q}`;
  if (/vidhide|earnvids|filelions|smoothpre|callistanise/.test(u)) return `${API_BASE}/vidhide/streamurl?url=${q}`;
  if (/voe\.|jilliandescribe/.test(u)) return `${API_BASE}/voe/streamurl?url=${q}`;
  return null;
}

/** URL del worker que devuelve JSON de capítulo/detalle (no es embed reproducible) */
function esUrlMetaApi(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  if (!/moviezone\.tvjz\.workers\.dev/i.test(u)) return false;
  if (/\/(resolve|wish|goodstream|vidhide|voe)\//i.test(u)) return false;
  return true;
}

function mapEmbeds(raw) {
  if (!raw) return [];
  // Si viene string JSON desde Supabase
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  const mapped = raw
    .map((e) => {
      if (typeof e === "string" && e.startsWith("http")) {
        if (esUrlMetaApi(e)) return null;
        return { url: e, idioma: null, servidor: null, calidad: null };
      }
      if (e && typeof e === "object") {
        const url = e.url || e.src || e.link || null;
        if (!url || esUrlMetaApi(url)) return null;
        let idioma = e.idioma || e.lang || e.language || e.lang_code || null;
        if (idioma) {
          const L = String(idioma).toUpperCase();
          if (L === "LAT" || L === "LATINO" || L === "DUB") idioma = "Latino";
          else if (L === "SUB" || L === "SOFTSUB" || /SUBTIT/.test(L)) idioma = "Subtitulado";
        }
        const servidor = e.servidor || e.server || e.name || null;
        const stream_url = e.stream_url || buildStreamUrl(url);
        return {
          url,
          stream_url,
          idioma,
          lang: idioma,
          servidor,
          calidad: e.calidad || e.quality || null,
        };
      }
      return null;
    })
    .filter(Boolean);

  // Latino primero, luego Vimeos / MovieZone
  mapped.sort((a, b) => {
    const aL = /latino|castellano|español/i.test(`${a.idioma || ""} ${a.lang || ""}`) ? 1 : 0;
    const bL = /latino|castellano|español/i.test(`${b.idioma || ""} ${b.lang || ""}`) ? 1 : 0;
    if (aL !== bL) return bL - aL;
    const aV = /vimeos/i.test(a.url || "") || /vimeos|moviezone/i.test(a.servidor || "");
    const bV = /vimeos/i.test(b.url || "") || /vimeos|moviezone/i.test(b.servidor || "");
    return (bV ? 1 : 0) - (aV ? 1 : 0);
  });
  return mapped;
}

/** Título normalizado para deduplicar entre fuentes */
function normalizeTitleKey(titulo) {
  // se redefine abajo — keep one implementation
  return _normalizeTitleKeyImpl(titulo);
}
function _normalizeTitleKeyImpl(titulo) {
  // Aplicar limpieza SEO primero para unificar "VER X Online Gratis HD" con "X"
  const limpio = limpiarTitulo(titulo);
  return String(limpio || titulo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(\d{4}\)/g, "")
    .replace(/\s*season\s*\d+/gi, "")
    .replace(/\s*temporada\s*\d+/gi, "")
    .replace(/\b(ver|watch|online|gratis|free|hd|full|4k|1080p|720p|subtitulado|subtitulada|latino|castellano|espanol|pelicula|serie|anime)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Portada usable (no placeholder, no data-uri, no SVG roto) */
function esPortadaValida(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (!u || u.includes("placeholder") || u.startsWith("data:")) return false;
  if (/svg\+xml|lazyload\.min|1x1|pixel\.gif|blank\./i.test(u)) return false;
  // Hackstore posters rotos salvo que sea TMDB reenviado
  if (/hackstore\./i.test(u) && !/image\.tmdb\.org/i.test(u)) return false;
  return /^https?:\/\//i.test(u);
}

/** Preferir la mejor portada disponible (TMDB > pelisplus > lamovie > resto) */
function elegirPortada(a, b, sourcePreferido) {
  const candidatos = [a, b].filter(esPortadaValida);
  if (!candidatos.length) return a || b || null;
  // Calidad: w500/original TMDB, posters HD pelisplus, thumbs HD lamovie
  const score = (u) => {
    let s = 0;
    if (/image\.tmdb\.org/i.test(u)) {
      s += 50;
      if (/\/original\//i.test(u)) s += 15;
      else if (/\/w780\//i.test(u)) s += 12;
      else if (/\/w500\//i.test(u)) s += 10;
      else if (/\/w342\//i.test(u)) s += 6;
    }
    if (/pelisplushd|\/poster\//i.test(u)) s += 35;
    if (/lamovie\.org/i.test(u)) {
      s += 25;
      if (/_hd\.|thumbs\//i.test(u)) s += 5;
    }
    if (/myanimelist|cdn\.myanimelist|anilist|kitsu/i.test(u)) s += 30;
    if (/animeav1|webp$/i.test(u)) s += 15;
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)) s += 3;
    return s;
  };
  candidatos.sort((x, y) => score(y) - score(x));
  return candidatos[0];
}

/** Fallback portada por slug (pelisplus suele tener /poster/{slug}.jpg) */
function portadaFallbackSlug(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase().replace(/-\d{4}$/, "").trim();
  if (!s) return null;
  return `https://www.pelisplushd.la/poster/${s}.jpg`;
}

/** Si no hay portada válida, intentar slug pelisplus y otras fuentes en detalle */
async function asegurarPortada(item) {
  if (!item) return item;
  if (esPortadaValida(item.portada)) return item;
  const fb = portadaFallbackSlug(item.slug);
  if (fb) item.portada = fb;
  if (esPortadaValida(item.portada)) return item;
  // Detalle en fuentes con poster (3, 1, 4)
  if (!item.slug) return item;
  const kind =
    /anime/i.test(String(item.tipo || "")) ? "anime" :
    /serie/i.test(String(item.tipo || "")) ? "serie" : "pelicula";
  const slugs = [...new Set([item.slug, String(item.slug).replace(/-\d{4}$/, "")].filter(Boolean))];
  for (const sid of ["3", "1", "4"]) {
    for (const s of slugs) {
      try {
        const k = sid === "4" && kind === "pelicula" ? "anime" : kind;
        const det = await fetchDetailFromSource(sid, k, s, { slug: s });
        if (det && esPortadaValida(det.portada)) {
          item.portada = det.portada;
          if (!item.descripcion && det.descripcion) item.descripcion = det.descripcion;
          return item;
        }
      } catch (_) {}
    }
  }
  return item;
}

/** Puntúa un item por cantidad de datos útiles (portada, rating, descripción, players…) */
function scoreItem(item) {
  if (!item) return 0;
  let s = 0;
  if (esPortadaValida(item.portada)) s += 3;
  else if (item.portada) s += 0; // portada rota no suma
  if (item.backdrop) s += 1;
  if (item.calificacion && Number(item.calificacion) > 0) s += 2;
  if (item.descripcion && String(item.descripcion).length > 40) s += 4;
  if (item.year) s += 1;
  if (item.genero) s += 1;
  if (Array.isArray(item.idiomas) && item.idiomas.length) s += 1;
  if (Array.isArray(item.calidad) && item.calidad.length) s += 1;
  if (item.reproductor) s += 5;
  if (Array.isArray(item.embeds) && item.embeds.length) s += 5 + Math.min(item.embeds.length, 10);
  if (Array.isArray(item.downloads) && item.downloads.length) s += 2;
  if (Array.isArray(item.episodios) && item.episodios.length) s += 4;
  if (item.tiene_player) s += 6;
  // Más episodios / temporadas = mejor (evita quedarse con Wistoria 10eps de hackstore)
  const nEps = Number(item.total_episodios) || (Array.isArray(item.episodios) ? item.episodios.length : 0) || 0;
  const nTemps =
    Number(item.total_temporadas) ||
    (Array.isArray(item.temporadas) ? item.temporadas.length : 0) ||
    0;
  if (nEps) s += Math.min(40, nEps / 5); // One Piece 1175 suma mucho
  if (nTemps > 1) s += nTemps * 8; // 2 temporadas gana a 1
  if (item.episodios && item.episodios.length) s += Math.min(8, item.episodios.length / 6);
  if (item.slug) s += 1;
  const sid = String(item.source_id || "");
  const esAnime = /anime/i.test(String(item.tipo || ""));
  // En animes: priorizar animeav1 (4) > pelisplus (3) > lamovie (1) > hackstore (2)
  if (esAnime) {
    if (sid === "4" || sid === "animeav1") s += 25;
    else if (sid === "3" || sid === "pelisplushd") s += 12;
    else if (sid === "1" || sid === "lamovie") s += 6;
    else if (sid === "2" || sid === "hackstore") s += 2;
  } else {
    if (sid === "3" || sid === "pelisplushd") s += 2;
    if (sid === "1" || sid === "lamovie") s += 1;
  }
  return s;
}

/** Deduplica por título: 1 resultado aunque venga de 3 fuentes (ej. Acaramelados) */

/** Si hay "Título" y "Título Season 2", deja solo el base (ya trae ambas temps en detalle) */
function colapsarTemporadasAnimeAv1(lista) {
  const bySlug = new Map();
  for (const it of lista || []) {
    if (it.slug) bySlug.set(String(it.slug).toLowerCase(), it);
  }
  const out = [];
  for (const it of lista || []) {
    const slug = String(it.slug || "").toLowerCase();
    const m = slug.match(/^(.*?)-season-(\d+)$/i);
    if (m && bySlug.has(m[1])) {
      // Heredar portada del base si el season no tiene
      const base = bySlug.get(m[1]);
      if (base && !esPortadaValida(it.portada) && esPortadaValida(base.portada)) {
        // no lo añadimos, solo el base
      }
      continue; // omitir season suelto
    }
    // Si este es base y su season-2 no tiene portada, ya está bien
    out.push(it);
  }
  // Rellenar portadas de seasons huérfanos (sin base en lista)
  for (const it of out) {
    if (esPortadaValida(it.portada)) continue;
    const slug = String(it.slug || "").toLowerCase();
    const m = slug.match(/^(.*?)-season-\d+$/i);
    if (m && bySlug.has(m[1]) && esPortadaValida(bySlug.get(m[1]).portada)) {
      it.portada = bySlug.get(m[1]).portada;
    }
  }
  return out;
}

function dedupeListItems(lista) {
  // Sin deduplicación: los datos vienen de la API (ya fusionados allí).
  // Devolver la lista tal cual para no mezclar obras (ej. La captura 2012 vs 2026).
  return Array.isArray(lista) ? lista.slice() : [];
}

/** Une listas de episodios por (season, episode); conserva embeds si ya existían */
function mergeEpisodiosLists(a, b) {
  const map = new Map();
  const put = (ep) => {
    if (!ep) return;
    const s = Number(ep.season || ep.temporada || 1);
    const e = Number(ep.episode || ep.episodio || ep.episode_number || 0);
    if (!e) return;
    const k = `${s}-${e}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, {
        ...ep,
        season: s,
        episode: e,
        embeds: mapEmbeds(ep.embeds || ep.reproductores || []),
        video: ep.video || ep.reproductor || null,
      });
      return;
    }
    const tieneNuevos = Array.isArray(ep.embeds) && ep.embeds.length > 0;
    const embeds = tieneNuevos
      ? mapEmbeds(ep.embeds)
      : mapEmbeds(prev.embeds || []);
    map.set(k, {
      ...prev,
      ...ep,
      season: s,
      episode: e,
      nombre: ep.nombre || prev.nombre,
      embeds,
      video: (tieneNuevos ? (ep.video || ep.reproductor) : null) || prev.video || prev.reproductor || ep.video || null,
      source_id: ep.source_id || prev.source_id,
    });
  };
  (a || []).forEach(put);
  (b || []).forEach(put);
  return Array.from(map.values()).sort(
    (x, y) => (x.season - y.season) || (x.episode - y.episode)
  );
}

/** Si total_episodios >> lista parcial (animeav1), generar stubs 1..N o del rango activo */
function expandirEpisodiosAnime(item) {
  if (!item) return item;
  const total = parseInt(item.total_episodios, 10) || 0;
  const eps = Array.isArray(item.episodios) ? item.episodios : [];
  if (total <= 1 || eps.length >= total) return item;

  // Si hay rangos, no expandir todo (One Piece 1175); solo asegurar el bloque actual
  const rangos = item.rangos_episodios;
  if (Array.isArray(rangos) && rangos.length > 1) {
    const desde = parseInt(item.episodio_desde, 10) || (rangos[0] && rangos[0].desde) || 1;
    const hasta = parseInt(item.episodio_hasta, 10) || (rangos[0] && rangos[0].hasta) || Math.min(100, total);
    const byEp = new Map(eps.map((e) => [Number(e.episode || e.episodio), e]));
    const out = [];
    for (let n = desde; n <= hasta && n <= total; n++) {
      out.push(
        byEp.get(n) || {
          season: 1,
          episode: n,
          nombre: `Episodio ${n}`,
          embeds: [],
          video: null,
          source_id: item.source_id,
        }
      );
    }
    item.episodios = out;
    return item;
  }

  // Anime corto/medio: expandir 1..total (máx 300 para no inflar de más)
  const maxExpand = Math.min(total, 300);
  if (eps.length >= maxExpand) return item;
  const byEp = new Map(eps.map((e) => [Number(e.episode || e.episodio), e]));
  const out = [];
  for (let n = 1; n <= maxExpand; n++) {
    out.push(
      byEp.get(n) || {
        season: 1,
        episode: n,
        nombre: `Episodio ${n}`,
        embeds: [],
        video: null,
        source_id: item.source_id,
      }
    );
  }
  item.episodios = out;
  if (!item.temporadas || !item.temporadas.length) item.temporadas = [1];
  return item;
}

/** Fusiona dos items privilegiando datos del más completo */
function mergeItems(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
    const cur = out[k];
    if (cur == null || cur === "" || (Array.isArray(cur) && !cur.length)) {
      out[k] = v;
    } else if (k === "embeds" || k === "downloads") {
      // unir únicos por url
      const urls = new Set((Array.isArray(cur) ? cur : []).map((e) => (e && e.url) || e));
      const merged = Array.isArray(cur) ? [...cur] : [];
      for (const e of Array.isArray(v) ? v : []) {
        const u = (e && e.url) || e;
        if (u && !urls.has(u)) {
          urls.add(u);
          merged.push(e);
        }
      }
      out[k] = mapEmbeds(merged);
    } else if (k === "episodios") {
      out[k] = mergeEpisodiosLists(cur, v);
    } else if (k === "temporadas") {
      const set = new Set([...(Array.isArray(cur) ? cur : []), ...(Array.isArray(v) ? v : [])].map(Number).filter(Boolean));
      out[k] = Array.from(set).sort((a, b) => a - b);
    } else if (k === "temporadas_raw") {
      // quedarse con el array más largo (más episodios dentro)
      const len = (arr) =>
        (arr || []).reduce((s, t) => s + ((t && t.episodios && t.episodios.length) || 0), 0);
      out[k] = len(v) > len(cur) ? v : cur;
    } else if (k === "total_episodios") {
      out[k] = Math.max(Number(cur) || 0, Number(v) || 0) || cur || v;
    } else if (k === "total_temporadas") {
      out[k] = Math.max(Number(cur) || 0, Number(v) || 0) || cur || v;
    } else if (k === "rangos_episodios") {
      // preferir el set de rangos que cubra más episodios (animeav1 actualizado)
      const sumR = (arr) =>
        (arr || []).reduce((s, r) => s + (Number(r.hasta || 0) - Number(r.desde || 0) + 1), 0);
      if (Array.isArray(v) && v.length && (!Array.isArray(cur) || sumR(v) >= sumR(cur))) out[k] = v;
    } else if (k === "descripcion") {
      out[k] = elegirMejorDescripcion(cur, v);
    } else if (k === "calificacion" && Number(v) > 0 && !Number(cur)) {
      out[k] = v;
    } else if (k === "portada") {
      out[k] = elegirPortada(cur, v, out.source_id || extra.source_id || base.source_id);
    }
  }
  // Asegurar portada coherente con source_id de quien tiene los embeds
  out.portada = elegirPortada(out.portada, extra?.portada || base?.portada, out.source_id);
  out.tiene_player = itemTieneContenidoValido(out) || !!(out.episodios && out.episodios.length);
  return out;
}

/** Normaliza fila de Supabase al formato del frontend */
function normalizeItemFromDB(row) {
  if (!row) return null;
  const embeds = mapEmbeds(row.embeds);
  const downloads = mapEmbeds(row.downloads); // same shape if objects
  let episodios = row.episodios || [];
  if (typeof episodios === "string") {
    try { episodios = JSON.parse(episodios); } catch { episodios = []; }
  }
  if (Array.isArray(episodios)) {
    episodios = episodios.map((ep) => ({
      ...ep,
      embeds: mapEmbeds(ep.embeds || ep.reproductores),
      video: ep.video || ep.reproductor || (mapEmbeds(ep.embeds)[0] && mapEmbeds(ep.embeds)[0].url) || null,
    }));
  }
  let temporadas = row.temporadas || [];
  if (typeof temporadas === "string") {
    try { temporadas = JSON.parse(temporadas); } catch { temporadas = []; }
  }
  const reproductor = row.reproductor || (embeds[0] && embeds[0].url) || null;
  return {
    ...row,
    nombre: limpiarTitulo(row.nombre || row.titulo || "Sin título"),
    descripcion: limpiarTexto(row.descripcion || ""),
    genero: limpiarTexto(row.genero || "") || null,
    embeds,
    downloads: Array.isArray(row.downloads) ? row.downloads : [],
    episodios,
    temporadas,
    reproductor,
    soloTrailer: !!(row.solo_trailer || row.soloTrailer),
    tiene_player: !!(row.tiene_player || reproductor || embeds.length || (Array.isArray(episodios) && episodios.length)),
  };
}

async function buscarEnSupabase({ link, slug, postId }) {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    if (link) {
      const { data } = await sb.from("movies").select("*").eq("link", link).maybeSingle();
      if (data) return normalizeItemFromDB(data);
    }
    if (slug) {
      const { data } = await sb.from("movies").select("*").eq("slug", slug).limit(1);
      if (data && data[0]) return normalizeItemFromDB(data[0]);
      // fallback: link contains slug
      const { data: data2 } = await sb.from("movies").select("*").ilike("link", `%${slug}%`).limit(1);
      if (data2 && data2[0]) return normalizeItemFromDB(data2[0]);
    }
    if (postId) {
      const { data } = await sb.from("movies").select("*").eq("postId", String(postId)).limit(1);
      if (data && data[0]) return normalizeItemFromDB(data[0]);
    }
  } catch (err) {
    console.warn("buscarEnSupabase:", err.message);
  }
  return null;
}


/** Extrae bloques imdb/tmdb/omdb de la API Worker (formato compacto o plano) */
function extraerMetaFuentes(r) {
  r = r || {};
  const imdb = r.imdb && typeof r.imdb === "object" ? { ...r.imdb } : {};
  const tmdb = r.tmdb && typeof r.tmdb === "object" ? { ...r.tmdb } : {};
  const omdb = r.omdb && typeof r.omdb === "object" ? { ...r.omdb } : {};

  if (!imdb.id && r.imdb_id) imdb.id = r.imdb_id;
  if (imdb.rating == null && r.rating_imdb != null) imdb.rating = r.rating_imdb;
  if (!imdb.votos && r.votos_imdb) imdb.votos = r.votos_imdb;
  if (!imdb.portada && r.portada_imdb) imdb.portada = r.portada_imdb;
  if (!imdb.generos && Array.isArray(r.generos_imdb)) imdb.generos = r.generos_imdb;
  if (imdb.duracion == null && r.duracion_imdb != null) imdb.duracion = r.duracion_imdb;
  if (!imdb.duracion_texto && r.duracion_texto_imdb) imdb.duracion_texto = r.duracion_texto_imdb;
  if (!imdb.certificacion && r.certificacion_imdb) imdb.certificacion = r.certificacion_imdb;

  if (!tmdb.id && r.tmdb_id) tmdb.id = r.tmdb_id;
  if (tmdb.rating == null && r.rating_tmdb != null) tmdb.rating = r.rating_tmdb;
  if (!tmdb.portada && r.portada_tmdb) tmdb.portada = r.portada_tmdb;
  if (!tmdb.generos && Array.isArray(r.generos_tmdb)) tmdb.generos = r.generos_tmdb;
  if (tmdb.duracion == null && r.duracion_tmdb != null) tmdb.duracion = r.duracion_tmdb;
  if (!tmdb.certificacion && r.certificacion_tmdb) tmdb.certificacion = r.certificacion_tmdb;
  if (!tmdb.titulo && r.titulo_tmdb) tmdb.titulo = r.titulo_tmdb;
  if (!tmdb.backdrop && r.backdrop) tmdb.backdrop = r.backdrop;

  if (omdb.rating == null && r.rating_omdb != null) omdb.rating = r.rating_omdb;
  if (!omdb.votos && r.votos_omdb) omdb.votos = r.votos_omdb;

  return { imdb, tmdb, omdb };
}

/** Resultado de listado / search → item ligero (API v2 con TMDB) */
function mapListItem(r) {
  if (!r || typeof r !== "object") return null;
  // Datos tal cual los manda la API Worker (no inventar ni mezclar)
  const titulo = String(r.titulo || r.title || r.nombre || "").trim() || "Sin título";
  const tipoRaw = String(r.tipo || r.type || "Pelicula");
  const tipo = /anime/i.test(tipoRaw)
    ? "Anime"
    : /serie|tv/i.test(tipoRaw)
      ? "Serie"
      : "Película";
  const slug = r.slug ? String(r.slug) : null;
  const sourceId = resolverSourceId(r.source_id || r.fuente);
  const year = r.year
    ? String(r.year).match(/(19|20)\d{2}/)?.[0] || String(r.year).slice(0, 4)
    : null;
  const kindPath =
    tipo === "Anime" ? "anime" : tipo === "Serie" ? "serie" : "pelicula";
  const link =
    r.url_extract ||
    r.link ||
    r.url ||
    (slug ? `${API_BASE}/${sourceId}/${kindPath}/${slug}` : null);

  const generos = Array.isArray(r.generos)
    ? r.generos
    : r.genero
      ? String(r.genero).split(",").map((g) => g.trim()).filter(Boolean)
      : [];
  const genero = generos.length ? generos.join(", ") : r.genero || null;

  let calificacion =
    r.rating != null
      ? r.rating
      : r.calificacion != null
        ? r.calificacion
        : r.imdb && r.imdb.rating != null
          ? r.imdb.rating
          : null;
  if (calificacion != null && calificacion !== "") {
    const n = Number(String(calificacion).replace(",", "."));
    calificacion = Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
  } else {
    calificacion = null;
  }

  const portada =
    r.portada ||
    (r.imdb && r.imdb.portada) ||
    (r.tmdb && r.tmdb.portada) ||
    r.portada_imdb ||
    r.portada_tmdb ||
    null;

  return {
    id: r.postId || r.id || r.tmdb_id || r.imdb_id || `${sourceId}-${slug || titulo}`,
    postId: r.postId || null,
    tmdb_id: r.tmdb_id || (r.tmdb && r.tmdb.id) || null,
    imdb_id: r.imdb_id || (r.imdb && r.imdb.id) || null,
    nombre: titulo,
    titulo: titulo,
    titulo_original: r.titulo_original || (r.tmdb && r.tmdb.titulo) || null,
    slug,
    tipo,
    descripcion: r.descripcion || null,
    portada,
    backdrop: r.backdrop || (r.tmdb && r.tmdb.backdrop) || null,
    year,
    genero,
    generos,
    calificacion,
    rating: r.rating != null ? r.rating : calificacion,
    votos: r.votos || (r.imdb && r.imdb.votos) || null,
    fecha_estreno: r.fecha_estreno || null,
    duracion: r.duracion || (r.imdb && r.imdb.duracion) || null,
    duracion_texto:
      r.duracion_texto || (r.imdb && r.imdb.duracion_texto) || null,
    certificacion:
      r.certificacion || (r.imdb && r.imdb.certificacion) || null,
    imdb: r.imdb || null,
    tmdb: r.tmdb || null,
    omdb: r.omdb || null,
    link,
    url_extract: r.url_extract || link,
    source_id: sourceId,
    fuente: r.fuente || null,
    tiene_player: false,
    embeds: [],
    downloads: [],
    episodios: [],
    temporadas: [],
  };
}

/** Detalle de película / serie / capítulo → item completo */
function mapDetail(data, fallback = {}) {
  const titulo = String(data.titulo || data.title || data.nombre || fallback.nombre || fallback.titulo || "Sin título").trim();
  const tipo = normalizarTipo(data.tipo || data.type || fallback.tipo);
  const sourceId = resolverSourceId(data.source_id || data.fuente || fallback.source_id || fallback.fuente);
  const slug = data.slug || fallback.slug || null;
  const embedsArr = mapEmbeds([
    ...(Array.isArray(data.reproductores) ? data.reproductores : []),
    ...(Array.isArray(data.embeds) ? data.embeds : []),
  ]);
  // Preferir stream_url HLS si el Worker lo trajo
  const reproductor = embedsArr[0]?.stream_url || embedsArr[0]?.url || data.reproductor || null;

  // Descargas con idioma / calidad
  let downloadsRaw = data.descargas || data.downloads || [];
  if (typeof downloadsRaw === "string") {
    try { downloadsRaw = JSON.parse(downloadsRaw); } catch { downloadsRaw = []; }
  }
  const downloadsMapped = Array.isArray(downloadsRaw)
    ? downloadsRaw.map((d) => {
        if (typeof d === "string" && d.startsWith("http")) return { url: d, idioma: null, calidad: null, servidor: null };
        if (d && typeof d === "object") {
          return {
            url: d.url || d.link || d.href || null,
            idioma: d.idioma || d.lang || null,
            calidad: d.calidad || d.quality || null,
            servidor: d.servidor || d.server || d.name || null,
          };
        }
        return null;
      }).filter((d) => d && d.url)
    : [];

  let episodios = [];
  let temporadas = [];
  let temporadas_raw = [];
  if (Array.isArray(data.temporadas) && data.temporadas.length) {
    temporadas_raw = data.temporadas;
    temporadas = data.temporadas.map((t) => Number(t.temporada || t.season || t)).filter(Boolean);
    for (const temp of data.temporadas) {
      const eps = temp.episodios || temp.episodes || [];
      for (const ep of eps) {
        // temporada real de la API (ej. One Punch Man 3 → T3, no forzar 1)
        const seasonNum = Number(ep.temporada || temp.temporada || data.temporada_principal || 1) || 1;
        const epNum = Number(ep.episodio || ep.episode || 1) || 1;
        const epEmbeds = mapEmbeds(ep.reproductores || ep.embeds || []);
        episodios.push({
          id: `${slug}-t${seasonNum}-e${epNum}`,
          nombre: ep.titulo || `T${seasonNum}E${String(epNum).padStart(2, "0")}`,
          season: seasonNum,
          episode: epNum,
          video: epEmbeds[0]?.stream_url || epEmbeds[0]?.url || ep.reproductor || null,
          embeds: epEmbeds,
          downloads: ep.descargas || [],
          soloTrailer: false,
          url_video: ep.url_video || ep.link || null,
          source_id: sourceId,
          slug_media: ep.slug_media || temp.slug_media || null,
          formato: ep.formato || temp.formato || data.formato || null,
        });
      }
    }
  }

  const metaF = extraerMetaFuentes({ ...fallback, ...data });
  let calificacion = data.rating != null ? data.rating : (data.calificacion != null ? data.calificacion : (fallback.rating != null ? fallback.rating : (fallback.calificacion != null ? fallback.calificacion : null)));
  if (metaF.imdb.rating != null && Number(metaF.imdb.rating) > 0) {
    calificacion = metaF.imdb.rating;
  } else if (metaF.omdb.rating != null && Number(metaF.omdb.rating) > 0) {
    calificacion = metaF.omdb.rating;
  }
  if (calificacion != null && calificacion !== "") {
    const n = Number(String(calificacion).replace(",", "."));
    calificacion = Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
  } else {
    calificacion = null;
  }

  return {
    id: data.postId || fallback.postId || fallback.id || `${sourceId}-${slug || titulo}`,
    postId: data.postId || fallback.postId || null,
    nombre: titulo,
    titulo: titulo,
    titulo_original: data.titulo_original || data.original_title || fallback.titulo_original || null,
    slug,
    tipo: tipo === "Capitulo" ? (data.formato === "OVA" || tipo === "Anime" ? "Anime" : "Serie") : tipo,
    formato: data.formato || fallback.formato || null,
    descripcion: limpiarDescripcion(data.descripcion || fallback.descripcion || "", titulo),
    // Portada: la de la API (fuente/IMDb) primero
    portada: elegirPortada(
      data.portada || fallback.portada || null,
      data.portada_imdb || data.portada_tmdb || data.tmdb_poster || null,
      sourceId
    ),
    portada_tmdb: data.portada_tmdb || null,
    portada_imdb: data.portada_imdb || null,
    poster_source: data.poster_source || null,
    backdrop: data.backdrop || fallback.backdrop || null,
    year: (function () {
      const yData = extraerAnio(titulo, data.year || data.fecha_estreno || null);
      const yFall = extraerAnio(titulo, fallback.year || null);
      // Si API y fallback tienen años distintos, quedarse con el de la API (no mezclar 2012/2026)
      if (yData) return yData;
      return yFall || null;
    })(),
    genero: extraerGenero(data) || extraerGenero(fallback) || (Array.isArray(data.generos) ? data.generos.join(", ") : null),
    generos: Array.isArray(data.generos) ? data.generos : [],
    idiomas: data.idiomas || [],
    calidad: data.calidad || [],
    calificacion,
    tmdb_id: data.tmdb_id || metaF.tmdb.id || fallback.tmdb_id || null,
    imdb_id: data.imdb_id || metaF.imdb.id || fallback.imdb_id || null,
    calificacion_comunidad: null,
    votos: data.votos || metaF.imdb.votos || metaF.tmdb.votos || null,
    fecha_estreno: data.fecha_estreno || null,
    duracion: data.duracion || metaF.imdb.duracion || metaF.tmdb.duracion || null,
    duracion_texto: data.duracion_texto || metaF.imdb.duracion_texto || metaF.tmdb.duracion_texto || null,
    certificacion: data.certificacion || metaF.imdb.certificacion || metaF.tmdb.certificacion || null,
    imdb: Object.keys(metaF.imdb).length ? metaF.imdb : null,
    tmdb: Object.keys(metaF.tmdb).length ? metaF.tmdb : null,
    omdb: Object.keys(metaF.omdb).length ? metaF.omdb : null,
    paises: [],
    ultimo_episodio: data.ultimo_episodio || null,
    link: data.link || fallback.link || (slug ? (`${API_BASE}/${sourceId}/${tipo === "Anime" ? "anime" : tipo === "Serie" ? "serie" : "pelicula"}/${slug}`) : null),
    url_extract: data.url_extract || data.link || fallback.link || null,
    source_id: sourceId,
    fuente: data.fuente || fallback.fuente || null,
    temporada_principal: data.temporada_principal || null,
    reproductor,
    embeds: embedsArr,
    downloads: downloadsMapped.length ? downloadsMapped : (data.descargas || data.downloads || []),
    soloTrailer: false,
    episodios,
    temporadas: temporadas.length ? [...new Set(temporadas)].sort((a, b) => a - b) : [],
    temporadas_raw: temporadas_raw.length ? temporadas_raw : null,
    total_temporadas: data.total_temporadas || null,
    total_episodios: data.total_episodios || (episodios.length ? episodios.length : null),
    rangos_episodios: data.rangos_episodios || null,
    temporadas_tmdb: data.temporadas_tmdb || null,
    episodio_desde: data.episodio_desde || null,
    episodio_hasta: data.episodio_hasta || null,
    tiene_player: !!(reproductor || embedsArr.length || episodios.length),
  };
}

async function apiGet(path) {
  const { data } = await api.get(path);
  return data;
}

// ---------- Lógica de negocio ----------
async function obtenerEstrenos(tipo = "peliculas", limit = 24) {
  // tipo: peliculas | series | animes
  await ensureMoviesDB(); // datos frescos de Supabase (Disponible, etc.)
  const path = `/${DEFAULT_SOURCE}/${tipo}/estrenos`;
  try {
    const data = await apiGet(path);
    let lista = (data.resultados || []).map(mapListItem).slice(0, limit);
    // Enriquecer con datos ya guardados (tiene_player, descripción, rating…)
    lista = lista.map((item) => {
      const local = moviesDB.find(
        (m) =>
          (item.link && m.link === item.link) ||
          (item.slug && m.slug === item.slug) ||
          (normalizeTitleKey(m.nombre) === normalizeTitleKey(item.nombre) &&
            ((tipo === "series" && m.tipo === "Serie") ||
              (tipo === "animes" && m.tipo === "Anime") ||
              (tipo === "peliculas" && (m.tipo === "Película" || !m.tipo))))
      );
      if (local) {
        return mergeItems(item, {
          tiene_player: local.tiene_player,
          embeds: local.embeds,
          reproductor: local.reproductor,
          descripcion: elegirMejorDescripcion(item.descripcion, local.descripcion),
          calificacion: local.calificacion || item.calificacion,
          portada: item.portada || local.portada,
          downloads: local.downloads,
          episodios: local.episodios,
        });
      }
      return item;
    });
    lista = filtrarDescartados(lista);
    // Guardar en Supabase en background (solo metadatos)
    guardarEnSupabase(lista).catch(() => {});
    return { resultados: lista, total: data.total || lista.length, page: 1, limit };
  } catch (err) {
    console.error("Error estrenos:", err.message);
    // Fallback: recientes de Supabase
    const locales = moviesDB
      .filter((m) => {
        if (tipo === "series") return m.tipo === "Serie";
        if (tipo === "animes") return m.tipo === "Anime";
        return m.tipo === "Película" || !m.tipo;
      })
      .slice(0, limit)
      .map((m) => normalizeItemFromDB(m));
    return { resultados: filtrarDescartados(locales), total: locales.length, page: 1, limit, source: "local" };
  }
}

async function obtenerPopulares(tipo = "peliculas", limit = 24) {
  try {
    const data = await apiGet(`/${DEFAULT_SOURCE}/${tipo}/populares`);
    const lista = (data.resultados || []).map(mapListItem).slice(0, limit);
    guardarEnSupabase(lista).catch(() => {});
    return { resultados: lista, total: data.total || lista.length, page: 1, limit };
  } catch (err) {
    return obtenerEstrenos(tipo, limit);
  }
}

/** Relevancia de un item respecto al query (mayor = mejor) */
function scoreSearchRelevance(item, termino) {
  const qNorm = normalizeTitleKey(termino);
  const title = normalizeTitleKey(item.nombre || item.titulo || "");
  const slug = String(item.slug || "").toLowerCase().replace(/-/g, " ");
  const qTokens = qNorm.split(/\s+/).filter((t) => t.length > 1);
  let s = 0;
  if (!title && !slug) return 0;
  if (title === qNorm) s += 100;
  else if (title.startsWith(qNorm) || qNorm.startsWith(title)) s += 60;
  else if (title.includes(qNorm) || qNorm.includes(title)) s += 40;
  // tokens del query presentes en título o slug
  let hit = 0;
  for (const t of qTokens) {
    if (title.includes(t) || slug.includes(t)) hit += 1;
  }
  if (qTokens.length) s += Math.round((hit / qTokens.length) * 30);
  if (esPortadaValida(item.portada)) s += 8;
  if (item.descripcion && String(item.descripcion).length > 40) s += 4;
  if (item.tiene_player) s += 6;
  s += Math.min(scoreItem(item), 20);
  return s;
}

/** ¿Es película/OVA/especial y no la serie principal? */
function esSpinoffOFilmSlug(slug, titulo) {
  const x = `${slug || ""} ${titulo || ""}`.toLowerCase();
  return /film|movie|pelicula|estampida|stampede|strong.?world|heroines|episode of|episode-of|fan.?letter|3d2y|\bgold\b|aventura en|heart of|chopper|gyojin|sorajima|recap|\bova\b|special|movie \d|film:/.test(x)
    || /-(film|movie|ova|special|estampida|stampede|heroines|fan-letter|episode-of|3d2y|gold|z)(-|$)/i.test(String(slug || ""));
}

/**
 * Clave de dedupe en búsqueda (misma obra entre fuentes / idiomas):
 * - Serie principal: one-piece-1999 + one-piece → una sola
 * - Live action: one-piece-2023 (Serie) distinta del anime
 * - Films: strong-world / movie-10-strong-world → una
 * - Películas: título normalizado + año (2001 odisea espacial)
 */
function normalizeWorkKey(slug, titulo, tipo) {
  let s = String(slug || "").toLowerCase().trim();
  let t = normalizeTitleKey(titulo || "");
  let tipoKey = String(tipo || "").toLowerCase().replace(/[íÍ]/g, "i");

  let year = null;
  const ym = s.match(/-(\d{4})$/);
  if (ym) { year = ym[1]; s = s.replace(/-\d{4}$/, ""); }
  const yt = t.match(/\b((?:19|20)\d{2})\b/);
  if (!year && yt) year = yt[1];
  t = t.replace(/\b(?:19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();

  s = s
    .replace(/-the-missing-pieces?(?:-ova)?$/, "-piece")
    .replace(/-missing-pieces?(?:-ova)?$/, "-piece")
    .replace(/-pieces$/, "-piece");
  t = t
    .replace(/\bthe missing pieces?\b/g, "piece")
    .replace(/\bmissing pieces?\b/g, "piece")
    .replace(/\bpieces\b/g, "piece")
    .replace(/\s+/g, " ")
    .trim();

  s = s
    .replace(/-movie-\d+-/g, "-")
    .replace(/-movie-\d+$/g, "")
    .replace(/-la-pelicula$/i, "")
    .replace(/-the-movie$/i, "")
    .replace(/^one-piece-film-/, "one-piece-")
    .replace(/estampida/g, "stampede")
    .replace(/-episode-of-/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");

  t = t
    .replace(/\ba space odyssey\b/g, "odisea espacial")
    .replace(/\bodisea del espacio\b/g, "odisea espacial")
    .replace(/\s+/g, " ")
    .trim();

  const esPeli = /pelicul/.test(tipoKey);
  const esSerieOAnime = /anime|serie/.test(tipoKey);

  if (esPeli) {
    let base = t;
    if (!base || base.length < 3) base = s.replace(/-/g, " ").trim();
    base = base.replace(/\bmovie\s*\d+\b/g, "").replace(/\bfilm\b/g, "").replace(/\s+/g, " ").trim();
    // one piece films as pelicula
    if (/one.?piece/.test(base + s) && esSpinoffOFilmSlug(s, t)) {
      let filmId = s.replace(/^one-piece-/, "").replace(/-/g, " ").trim() || base.replace(/one piece/g, "").trim();
      filmId = filmId.replace(/\bla pelicula\b/g, "").replace(/\s+/g, " ").trim();
      return `film:${filmId || base}`;
    }
    return `peli:${base}:${year || ""}`;
  }

  if (esSerieOAnime) {
    if (/one.?piece/.test(s + t) && year === "2023" && /serie/.test(tipoKey)) {
      return `show:one-piece-live:2023`;
    }
    if (esSpinoffOFilmSlug(s, t)) {
      let filmId = s.replace(/^one-piece-/, "").replace(/-/g, " ").trim();
      if (!filmId || filmId.length < 2) filmId = t.replace(/one piece/g, "").trim();
      filmId = filmId.replace(/\bla pelicula\b/g, "").replace(/\bmovie\s*\d+\b/g, "").replace(/\s+/g, " ").trim();
      return `film:${filmId || s}`;
    }
    const core = s.replace(/-/g, " ").trim() || t;
    return `show:${core}`;
  }

  if (s) return `slug:${s}:${year || ""}`;
  if (t) return `t:${tipoKey}:${t}:${year || ""}`;
  return null;
}

/** Clave dedupe búsqueda */
function searchDedupeKey(item) {
  const key = normalizeWorkKey(item.slug, item.nombre || item.titulo, item.tipo);
  if (key) return key;
  return item.link || String(Math.random());
}

/** Mejor resultado de la misma obra (portada, Anime, fuente 4, descripción) */
function pickBestSearchItem(a, b) {
  const score = (it) => {
    let s = scoreItem(it);
    if (esPortadaValida(it.portada)) s += 20;
    if (it.descripcion && String(it.descripcion).length > 40) s += 10;
    if (it.tiene_player) s += 8;
    const t = String(it.tipo || "").toLowerCase();
    if (t === "anime") s += 15;
    else if (t === "serie") s += 5;
    const sid = String(it.source_id || "");
    if (sid === "4") s += 12;
    else if (sid === "3") s += 6;
    else if (sid === "1") s += 2;
    return s;
  };
  const preferA = score(a) >= score(b);
  const winner = preferA ? { ...a } : { ...b };
  const loser = preferA ? b : a;

  winner.portada = elegirPortada(winner.portada, loser.portada, winner.source_id);
  winner.descripcion = elegirMejorDescripcion(winner.descripcion, loser.descripcion);

  if (!winner.calificacion && loser.calificacion) winner.calificacion = loser.calificacion;
  if (loser.tiene_player && !winner.tiene_player) winner.tiene_player = true;
  if ((!winner.total_episodios || winner.total_episodios < (loser.total_episodios || 0)) && loser.total_episodios) {
    winner.total_episodios = loser.total_episodios;
  }
  // Si alguno es Anime, el resultado final es Anime (no Película/Serie errónea)
  const tipos = [winner.tipo, loser.tipo].map((t) => String(t || ""));
  if (tipos.some((t) => /anime/i.test(t))) winner.tipo = "Anime";
  else if (tipos.some((t) => /serie/i.test(t))) winner.tipo = "Serie";

  const nW = limpiarTitulo(winner.nombre || "");
  const nL = limpiarTitulo(loser.nombre || "");
  if (nL && (!nW || nL.length <= nW.length || /ver |online|gratis/i.test(String(winner.nombre || "")))) {
    winner.nombre = nL;
  } else {
    winner.nombre = nW || winner.nombre;
  }
  if (!winner.link && loser.link) winner.link = loser.link;
  if (!winner.slug && loser.slug) winner.slug = loser.slug;
  const alts = new Set(
    [...(winner._alt_sources || []), ...(loser._alt_sources || []), String(loser.source_id || ""), String(winner.source_id || "")].filter(Boolean)
  );
  winner._alt_sources = Array.from(alts);
  return winner;
}

/**
 * Dedupe duplicados reales entre fuentes:
 * - mismo slug (horimiya en 3 y 4 → 1)
 * - piece === missing pieces → 1
 * - horimiya-2021 (peli mal tipada) se une a horimiya serie/anime
 * Mantiene aparte: obra base ≠ spin-off piece
 */
function dedupeSearchResults(lista) {
  // Sin dedupe: la API ya devuelve resultados correctos
  return Array.isArray(lista) ? lista.slice() : [];
}

async function buscarOnline(termino, page = 1, limit = 48) {
  const qRaw = String(termino || "").trim();
  if (!qRaw) return { resultados: [], total: 0, page, limit, source: "online" };

  let raw = [];
  try {
    const data = await apiGet(`/search?q=${encodeURIComponent(qRaw)}`);
    raw = Array.isArray(data?.resultados) ? data.resultados : [];
  } catch (err) {
    console.warn("search:", err.message);
  }
  // Si vacío, una sola fuente de respaldo
  if (!raw.length) {
    try {
      const dataS = await apiGet(`/search?q=${encodeURIComponent(qRaw)}&source=3`);
      raw = Array.isArray(dataS?.resultados) ? dataS.resultados : [];
    } catch (_) {}
  }

  let lista = raw
    .map((r) => {
      try {
        return mapListItem(r);
      } catch (_) {
        return null;
      }
    })
    .filter((item) => item && (item.slug || item.link || item.url_extract));

  // Marcar Disponible si ya está en Supabase/memoria con players (sin pisar meta API)
  try {
    await ensureMoviesDB().catch(() => {});
  } catch (_) {}
  lista = lista.map((item) => {
    const local =
      moviesDB.find(
        (m) =>
          (item.link && m.link === item.link) ||
          (item.slug && m.slug === item.slug && String(m.source_id || "") === String(item.source_id || "")) ||
          (item.slug && m.slug === item.slug)
      ) || null;
    if (!local || esDescartado(local)) return item;
    if (local.tiene_player || itemTieneContenidoValido(local)) {
      item.tiene_player = true;
      if ((!item.embeds || !item.embeds.length) && local.embeds?.length) {
        item.embeds = local.embeds;
      }
    }
    return item;
  });

  // Paginación simple
  const lim = Math.min(Math.max(parseInt(limit, 10) || 48, 1), 100);
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const startIdx = (p - 1) * lim;
  const pageLista = lista.slice(startIdx, startIdx + lim);

  return {
    resultados: pageLista,
    total: lista.length,
    page: p,
    limit: lim,
    source: "online",
  };
}


async function refreshAnimeMetaFromSource4(cached, id) {
  if (!cached) return null;
  const baseSlug = String(id?.slug || cached.slug || "")
    .replace(/-\d{4}$/, "")
    .trim();
  const slugsTry = [...new Set([cached.slug, id?.slug, baseSlug].filter(Boolean))];
  let bestMeta = null;
  for (const s of slugsTry) {
    const item = await fetchDetailFromSource("4", "anime", s, { slug: s, tipo: "Anime" });
    if (!item) continue;
    const better =
      !bestMeta ||
      (Number(item.total_episodios) || 0) > (Number(bestMeta.total_episodios) || 0) ||
      (item.temporadas || []).length > (bestMeta.temporadas || []).length;
    if (better) bestMeta = item;
  }
  if (!bestMeta) return null;

  const oldTotal = Number(cached.total_episodios) || 0;
  const newTotal = Number(bestMeta.total_episodios) || 0;
  const oldTemps = Math.max(
    Number(cached.total_temporadas) || 0,
    Array.isArray(cached.temporadas) ? cached.temporadas.length : 0
  );
  const newTemps = Math.max(
    Number(bestMeta.total_temporadas) || 0,
    Array.isArray(bestMeta.temporadas) ? bestMeta.temporadas.length : 0
  );
  const needsUpdate =
    newTotal > oldTotal ||
    newTemps > oldTemps ||
    (!cached.rangos_episodios && bestMeta.rangos_episodios);

  if (!needsUpdate) {
    // Aun así asegurar expandir con total actual
    return expandirEpisodiosAnime({ ...cached });
  }

  let merged = mergeItems(cached, bestMeta);
  // Preferir fuente 4 y slug sin año cuando aporta más episodios/temps
  merged.source_id = "4";
  merged.slug = bestMeta.slug || baseSlug || merged.slug;
  if (bestMeta.link) merged.link = bestMeta.link;
  merged.total_episodios = Math.max(oldTotal, newTotal);
  merged.total_temporadas = Math.max(oldTemps, newTemps);
  if (newTemps > oldTemps) {
    merged.temporadas = bestMeta.temporadas?.length ? bestMeta.temporadas : merged.temporadas;
    merged.temporadas_raw = bestMeta.temporadas_raw || merged.temporadas_raw;
  }
  if (bestMeta.rangos_episodios) merged.rangos_episodios = bestMeta.rangos_episodios;
  merged = expandirEpisodiosAnime(merged);
  // Guardar totales actualizados
  try {
    await guardarEnSupabase([merged]);
  } catch (_) {}
  return merged;
}

async function fetchDetailFromSource(sourceId, kind, slug, fallback = {}) {
  // animeav1 (4): puede paginar episodios con ep_from/ep_to
  let path = `/${sourceId}/${kind}/${slug}`;
  const qs = [];
  if (String(sourceId) === "4" && kind === "anime") {
    if (fallback.ep_from) qs.push(`ep_from=${encodeURIComponent(fallback.ep_from)}`);
    if (fallback.ep_to) qs.push(`ep_to=${encodeURIComponent(fallback.ep_to)}`);
  }
  if (qs.length) path += `?${qs.join("&")}`;
  try {
    const data = await apiGet(path);
    if (!data || data.success === false) return null;
    let item = mapDetail(data, { ...fallback, slug, source_id: String(sourceId) });
    if (!item.link) item.link = data.link || `${API_BASE}/${sourceId}/${kind}/${slug}`;
    if (!item.slug) item.slug = slug;
    // Garantizar players desde respuesta cruda si mapDetail falló en embeds
    if ((!item.embeds || !item.embeds.length) && (data.reproductores || data.embeds)) {
      item.embeds = mapEmbeds([
        ...(Array.isArray(data.reproductores) ? data.reproductores : []),
        ...(Array.isArray(data.embeds) ? data.embeds : []),
      ]);
      if (item.embeds.length) {
        item.tiene_player = true;
        item.reproductor = item.embeds[0].stream_url || item.embeds[0].url || item.reproductor;
      }
    }
    // Anime: rellenar stubs si total_episodios > lista parcial
    if (item.tipo === "Anime" || kind === "anime") {
      item = expandirEpisodiosAnime(item);
    }
    return item;
  } catch (err) {
    console.warn(`Detalle ${sourceId}/${kind}/${slug}:`, err.message);
    return null;
  }
}


/** La API manda en título/año/rating/géneros; nunca usar slug como nombre */
function preferApiMeta(apiItem, cached) {
  if (!apiItem) return cached || null;
  if (!cached) {
    if (apiItem.nombre && apiItem.slug &&
        String(apiItem.nombre).toLowerCase().replace(/\s+/g, "-") === String(apiItem.slug).toLowerCase()) {
      if (apiItem.titulo) apiItem.nombre = apiItem.titulo;
    }
    return apiItem;
  }
  const out = { ...cached, ...apiItem };
  // Título: NUNCA slug
  const tituloApi = apiItem.nombre || apiItem.titulo || null;
  if (tituloApi && String(tituloApi).toLowerCase().replace(/\s+/g, "-") !== String(apiItem.slug || cached.slug || "").toLowerCase()) {
    out.nombre = tituloApi;
  } else if (tituloApi) {
    out.nombre = tituloApi;
  } else if (cached.nombre && String(cached.nombre).toLowerCase().replace(/\s+/g, "-") !== String(cached.slug || "").toLowerCase()) {
    out.nombre = cached.nombre;
  }
  // Año / rating / géneros / imdb: API gana si trae valor
  if (apiItem.year) out.year = apiItem.year;
  if (apiItem.calificacion != null && apiItem.calificacion !== "") out.calificacion = apiItem.calificacion;
  if (apiItem.rating != null && (out.calificacion == null || out.calificacion === "")) out.calificacion = apiItem.rating;
  if (apiItem.genero) out.genero = apiItem.genero;
  if (apiItem.generos && apiItem.generos.length) out.generos = apiItem.generos;
  if (apiItem.imdb_id) out.imdb_id = apiItem.imdb_id;
  if (apiItem.tmdb_id) out.tmdb_id = apiItem.tmdb_id;
  if (apiItem.imdb) out.imdb = apiItem.imdb;
  if (apiItem.tmdb) out.tmdb = apiItem.tmdb;
  if (apiItem.votos) out.votos = apiItem.votos;
  if (apiItem.duracion) out.duracion = apiItem.duracion;
  if (apiItem.duracion_texto) out.duracion_texto = apiItem.duracion_texto;
  if (apiItem.certificacion) out.certificacion = apiItem.certificacion;
  if (apiItem.titulo_original) out.titulo_original = apiItem.titulo_original;
  if (apiItem.fecha_estreno) out.fecha_estreno = apiItem.fecha_estreno;
  // Descripción: preferir español (elegirMejorDescripcion ya prioriza ES)
  out.descripcion = elegirMejorDescripcion(apiItem.descripcion, cached.descripcion);
  // Portada API si es válida
  if (apiItem.portada && esPortadaValida(apiItem.portada)) out.portada = apiItem.portada;
  // Players: el que tenga más
  if (apiItem.embeds && apiItem.embeds.length) {
    out.embeds = apiItem.embeds;
    out.tiene_player = true;
    out.reproductor = apiItem.reproductor || apiItem.embeds[0]?.stream_url || apiItem.embeds[0]?.url || out.reproductor;
  }
  // Si años distintos → NO mezclar meta de cache (obra distinta con mismo slug)
  const yA = apiItem.year && String(apiItem.year).match(/(19|20)\d{2}/);
  const yC = cached.year && String(cached.year).match(/(19|20)\d{2}/);
  if (yA && yC && yA[0] !== yC[0]) {
    out.year = yA[0];
    out.calificacion = apiItem.calificacion ?? apiItem.rating ?? null;
    out.genero = apiItem.genero || null;
    out.generos = apiItem.generos || [];
    out.imdb = apiItem.imdb || null;
    out.tmdb = apiItem.tmdb || null;
    out.imdb_id = apiItem.imdb_id || null;
    out.votos = apiItem.votos || null;
    out.duracion = apiItem.duracion || null;
    out.duracion_texto = apiItem.duracion_texto || null;
    out.certificacion = apiItem.certificacion || null;
    out.descripcion = apiItem.descripcion || out.descripcion;
  }
  return out;
}

async function obtenerDetalle(params) {
  const { link, postId, source_id, slug, tipo } = params;
  const force = params.force === "1" || params.force === true;

  let cached = null;

  // 1) SIEMPRE Supabase primero (fuente de verdad entre instancias de Vercel)
  const fromDb = await buscarEnSupabase({ link, slug, postId });
  if (fromDb) {
    cached = fromDb;
    const idx = moviesDB.findIndex((m) => m.link === fromDb.link);
    if (idx >= 0) moviesDB[idx] = cached;
    else moviesDB.unshift(cached);
  }

  // 2) Memoria local solo como complemento si Supabase no tenía el registro
  if (!cached && link) {
    const local = moviesDB.find((m) => m.link === link);
    if (local) cached = normalizeItemFromDB(local);
  }
  if (!cached && slug) {
    const local = moviesDB.find((m) => m.slug === slug || (m.link && m.link.includes(slug)));
    if (local) cached = normalizeItemFromDB(local);
  }

  // 3) Identidad
  const id = parseIdentidad({ link, slug, source_id: source_id || cached?.source_id, tipo: tipo || cached?.tipo });
  if (!id) {
    if (cached) return cached;
    if (postId) {
      const local = moviesDB.find((m) => String(m.postId) === String(postId));
      if (local) return normalizeItemFromDB(local);
    }
    throw new Error("No se pudo identificar la película/serie");
  }

  const esAnimeKind = id.kind === "anime" || /anime/i.test(String(tipo || cached?.tipo || ""));

  // Si ya tenemos contenido válido y no force → devolver cache
  // EXCEPCIÓN anime: refrescar totales desde fuente 4 (One Piece sigue subiendo; Wistoria T2)
  const tieneDesc = cached && cached.descripcion && String(cached.descripcion).length > 20;
  const tieneContenido = cached && (itemTieneContenidoValido(cached) || (cached.episodios && cached.episodios.length));
  const yaFunciona =
    cached &&
    itemTieneContenidoValido(cached) &&
    cached.descripcion &&
    String(cached.descripcion).length > 40 &&
    cached.portada &&
    !String(cached.portada).includes("placeholder");

  // Cache solo si realmente hay players (película) o episodios (serie/anime)
  const esSerieCache = esAnimeKind || /serie/i.test(String(cached?.tipo || ""));
  const cacheTienePlayers =
    !!cached &&
    (itemTieneContenidoValido(cached) ||
      (esSerieCache &&
        ((cached.episodios && cached.episodios.length) ||
          (cached.temporadas && cached.temporadas.length) ||
          (cached.temporadas_raw && cached.temporadas_raw.length))));

  // Si el nombre parece slug (la-captura), forzar refresco desde API
  const nombreEsSlug =
    cached &&
    cached.nombre &&
    cached.slug &&
    String(cached.nombre).toLowerCase().replace(/\s+/g, "-") === String(cached.slug).toLowerCase();

  if (!force && cached && cacheTienePlayers && (tieneDesc || yaFunciona) && !nombreEsSlug) {
    if (esAnimeKind) {
      try {
        const refreshed = await refreshAnimeMetaFromSource4(cached, id);
        if (refreshed) return refreshed;
      } catch (err) {
        console.warn("refreshAnimeMeta:", err.message);
      }
    }
    return cached;
  }
  // Si cache no tiene players o nombre=slug → seguir a la API

  // force = botón "Actualizar servidores": refrescar PLAYERS sin romper título/meta/portada
  if (force && id && id.slug) {
    try {
      const sid = String(id.source_id || cached?.source_id || "3");
      const kind = id.kind || (esAnimeKind ? "anime" : /serie/i.test(String(tipo || cached?.tipo || "")) ? "serie" : "pelicula");
      const candidate = await fetchDetailFromSource(sid, kind, id.slug, {
        link: link || cached?.link,
        slug: id.slug,
        source_id: sid,
        tipo: tipo || cached?.tipo,
        nombre: cached?.nombre,
        portada: cached?.portada,
        descripcion: cached?.descripcion,
        year: cached?.year,
        genero: cached?.genero,
        postId: postId || cached?.postId,
      });

      const base = cached ? { ...cached } : (candidate ? { ...candidate } : null);
      if (base || candidate) {
        const out = preferApiMeta(candidate || base, base);
        // Conservar título legible (nunca slug)
        const goodName = (cached && cached.nombre && cached.slug &&
          String(cached.nombre).toLowerCase().replace(/\s+/g, "-") !== String(cached.slug).toLowerCase())
          ? cached.nombre
          : (out.nombre && out.slug && String(out.nombre).toLowerCase().replace(/\s+/g, "-") !== String(out.slug).toLowerCase()
            ? out.nombre
            : (out.titulo || cached?.nombre || out.nombre));
        out.nombre = goodName;
        // Portada: no cambiar si ya hay una válida
        if (cached && esPortadaValida(cached.portada)) out.portada = cached.portada;
        // Año/rating/géneros: conservar los buenos de caché si API no trae o trae peor
        if (cached?.year) out.year = cached.year;
        if (cached?.calificacion != null) out.calificacion = cached.calificacion;
        if (cached?.genero) out.genero = cached.genero;
        if (cached?.generos?.length) out.generos = cached.generos;
        if (cached?.imdb) out.imdb = cached.imdb;
        if (cached?.imdb_id) out.imdb_id = cached.imdb_id;
        if (cached?.votos) out.votos = cached.votos;
        if (cached?.duracion) out.duracion = cached.duracion;
        if (cached?.duracion_texto) out.duracion_texto = cached.duracion_texto;
        if (cached?.certificacion) out.certificacion = cached.certificacion;
        if (cached?.titulo_original) out.titulo_original = cached.titulo_original;
        // Descripción: fuente/caché en español primero; no pisar con inglés de IMDb
        out.descripcion = elegirMejorDescripcion(cached?.descripcion, candidate?.descripcion);
        // Players: del fetch fresco
        if (candidate?.embeds?.length) {
          out.embeds = candidate.embeds;
          out.tiene_player = true;
          out.reproductor = candidate.reproductor || candidate.embeds[0]?.stream_url || candidate.embeds[0]?.url || out.reproductor;
        }
        if (candidate?.downloads?.length) out.downloads = candidate.downloads;
        // Episodios: fusionar si serie
        if (candidate?.episodios?.length) {
          out.episodios = mergeEpisodiosLists(cached?.episodios || [], candidate.episodios);
        }
        if (candidate?.temporadas?.length) out.temporadas = candidate.temporadas;
        if (candidate?.temporadas_raw?.length) out.temporadas_raw = candidate.temporadas_raw;
        if (!out.link) out.link = candidate?.link || cached?.link || link;
        await guardarEnSupabase([out]);
        return out;
      }
    } catch (errForce) {
      console.warn("force refresh servers:", errForce.message);
      if (cached) return cached;
    }
  }

  // force con players OK: solo refrescar meta (descripcion/genero) de la fuente actual, no rehacer todo
  const soloMeta =
    force &&
    cached &&
    itemTieneContenidoValido(cached) &&
    (cached.tipo === "Película" || (cached.episodios && cached.episodios.length));

  // Anime: SIEMPRE empezar por fuente 4; también probar slug sin año
  // (wistoria-wand-and-sword-2024 en src2 = 10eps/1temp; sin año en src4 = 24eps/2temps)
  // Anime: animeav1 → animedbs; Serie/dorama: fuente pedida + doramasflix + pelisplus
  const sourcesToTry = esAnimeKind
    ? ["4", "5"]
    : [resolverSourceId(id.source_id), "6", "3", "1", "2"].filter((v, i, a) => a.indexOf(v) === i);
  const ordenFuentes = esAnimeKind ? ["4", "3", "1", "2"] : ["3", "1", "2", "4"];
  for (const s of ordenFuentes) {
    if (!sourcesToTry.includes(s)) sourcesToTry.push(s);
  }
  const fuentes = soloMeta && !esAnimeKind ? sourcesToTry.slice(0, 1) : sourcesToTry;

  const slugSinAnio = String(id.slug || "").replace(/-\d{4}$/, "");
  const slugsTryBase = [...new Set([id.slug, slugSinAnio].filter(Boolean))];

  let best = null;
  let triedSource4 = false;
  for (const sid of fuentes) {
    if (String(sid) === "4") triedSource4 = true;
    for (const slugTry of slugsTryBase) {
      const candidate = await fetchDetailFromSource(sid, id.kind === "anime" || esAnimeKind ? "anime" : id.kind, slugTry, {
        link,
        slug: slugTry,
        source_id: sid,
        tipo: tipo || cached?.tipo || (esAnimeKind ? "Anime" : null),
        nombre: cached?.nombre,
        portada: cached?.portada,
        descripcion: cached?.descripcion,
        year: cached?.year,
        genero: cached?.genero,
        postId: postId || cached?.postId,
      });
      if (!candidate) continue;
      best = best
        ? scoreItem(candidate) > scoreItem(best)
          ? mergeItems(candidate, best)
          : mergeItems(best, candidate)
        : candidate;
      if (best && candidate.descripcion) {
        best.descripcion = elegirMejorDescripcion(best.descripcion, candidate.descripcion);
      }
      if (candidate.genero && !best.genero) best.genero = candidate.genero;

      // Preferir la fuente con MÁS episodios/temporadas (no la primera que responda)
      const tBest = Number(best.total_episodios) || (best.episodios || []).length || 0;
      const tCand = Number(candidate.total_episodios) || (candidate.episodios || []).length || 0;
      const sBest = Math.max(Number(best.total_temporadas) || 0, (best.temporadas || []).length || 0);
      const sCand = Math.max(Number(candidate.total_temporadas) || 0, (candidate.temporadas || []).length || 0);
      if (tCand > tBest || sCand > sBest || (tCand === tBest && String(sid) === "4")) {
        best.source_id = String(sid);
        best.slug = candidate.slug || best.slug;
        best.link = candidate.link || best.link;
        best.url_extract = candidate.url_extract || best.url_extract;
        if (sCand >= sBest && candidate.temporadas?.length) {
          best.temporadas = candidate.temporadas;
          best.temporadas_raw = candidate.temporadas_raw || best.temporadas_raw;
          best.total_temporadas = Math.max(sBest, sCand);
        }
        if (tCand >= tBest) best.total_episodios = Math.max(tBest, tCand);
        if (candidate.rangos_episodios) best.rangos_episodios = candidate.rangos_episodios;
      }
      best.portada = elegirPortada(best.portada, candidate.portada, best.source_id);
    }
    // Anime: no cortar hasta haber intentado fuente 4
    if (esAnimeKind && !triedSource4) continue;
    if (soloMeta && best && !esAnimeKind) break;
    // Películas: cortar si ya hay bastantes embeds
    const nEmbeds = Array.isArray(best?.embeds) ? best.embeds.length : 0;
    if (
      !esAnimeKind &&
      !force &&
      best &&
      itemTieneContenidoValido(best) &&
      best.descripcion &&
      best.portada &&
      nEmbeds >= 4
    ) {
      break;
    }
    // Anime: cortar solo si ya tenemos fuente 4 + totales razonables
    if (
      esAnimeKind &&
      triedSource4 &&
      best &&
      (Number(best.total_episodios) > 0 || (best.temporadas || []).length > 0) &&
      best.descripcion
    ) {
      // seguir con 3/1/2 solo si aún faltan players a nivel ficha (raro en anime)
      if ((best.temporadas || []).length >= 1 && Number(best.total_episodios) >= 1) {
        // ya tenemos meta de anime; no hace falta más fuentes para temporadas
        break;
      }
    }
  }

  if (!best) {
    if (cached) return cached;
    throw new Error("Sin datos del detalle");
  }

  // Fusionar con cache para no perder datos previos
  best = mergeItems(cached, best);
  // Anime/serie: no perder listado de episodios ni players ya guardados por capítulo
  if (cached && Array.isArray(cached.episodios) && cached.episodios.length) {
    if (!best.episodios || !best.episodios.length) {
      best.episodios = cached.episodios;
    } else {
      // Preservar embeds/video de episodios ya cacheados (API suele devolver stubs sin players)
      const byKey = new Map();
      for (const ep of cached.episodios) {
        const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
        if (ep.embeds?.length || ep.video || ep.reproductor) byKey.set(k, ep);
      }
      best.episodios = best.episodios.map((ep) => {
        const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
        const prev = byKey.get(k);
        if (!prev) return ep;
        const tieneNuevos = Array.isArray(ep.embeds) && ep.embeds.length > 0;
        if (tieneNuevos) return ep;
        return {
          ...ep,
          embeds: prev.embeds || [],
          video: prev.video || prev.reproductor || ep.video || null,
          reproductor: prev.reproductor || prev.video || ep.reproductor || null,
          downloads: (ep.downloads && ep.downloads.length) ? ep.downloads : (prev.downloads || []),
        };
      });
      // Añadir episodios cacheados que no vengan en la respuesta nueva
      const seen = new Set(best.episodios.map((ep) => `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`));
      for (const ep of cached.episodios) {
        const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
        if (!seen.has(k) && (ep.embeds?.length || ep.video || ep.reproductor)) {
          best.episodios.push(ep);
        }
      }
    }
  }
  if (cached && (!best.temporadas || !best.temporadas.length) && cached.temporadas?.length) {
    best.temporadas = cached.temporadas;
  }
  if (cached && (!best.temporadas_raw || !best.temporadas_raw.length) && cached.temporadas_raw?.length) {
    best.temporadas_raw = cached.temporadas_raw;
  }
  // Preferir español de la API sobre inglés cacheado (aunque el inglés sea más largo)
  best.descripcion = elegirMejorDescripcion(best.descripcion, cached?.descripcion);
  best.descripcion = limpiarDescripcion(best.descripcion, best.nombre);
  // Portada final: siempre alineada a la fuente de los reproductores
  best.portada = elegirPortada(best.portada, cached?.portada, best.source_id);
  if (!best.slug) best.slug = id.slug;
  if (!best.slug && best.link) {
    const m = String(best.link).match(/\/(?:serie|anime|pelicula|series|animes|peliculas)\/([^/?#]+)/i);
    if (m) best.slug = m[1];
  }

  best.tiene_player = itemTieneContenidoValido(best)
    || !!(best.episodios && best.episodios.length)
    || !!(best.temporadas && best.temporadas.length)
    || !!(best.temporadas_raw && best.temporadas_raw.length);

  // Anime: totales / rangos; preferir fuente 4
  if (best.tipo === "Anime" || id.kind === "anime") {
    best = expandirEpisodiosAnime(best);
    best._prefer_source_anime = "4";
    const nEps = Number(best.total_episodios) || 0;
    const tieneRangos = Array.isArray(best.rangos_episodios) && best.rangos_episodios.length > 1;
    // One Piece: muchos eps → forzar 1 temporada (el front usa rangos 1–50…)
    if (nEps > 50 || tieneRangos) {
      best.temporadas = [1];
      best.total_temporadas = 1;
      best.source_id = "4";
      if (best.slug) best.slug = String(best.slug).replace(/-\d{4}$/, "");
    } else {
      const nTemps = Math.max(Number(best.total_temporadas) || 0, (best.temporadas || []).length || 0);
      if (nTemps > 1 || nEps > 24) {
        best.source_id = "4";
        if (best.slug) best.slug = String(best.slug).replace(/-\d{4}$/, "");
      }
    }
  }

  const sinPortada = !best.portada || String(best.portada).includes("placeholder");
  const sinContenido = !best.tiene_player;
  const esSerieOAnime = best.tipo === "Serie" || best.tipo === "Anime";

  // NO borrar de Supabase por falta temporal de players (evita perder fichas).
  // Solo marcar flag para el front; se reintentará en el próximo force/detalle.
  if (!esSerieOAnime && sinContenido) {
    best._sin_players = true;
    best = preferApiMeta(best, cached);
    if (best.link && (best.descripcion || best.portada || best.calificacion)) {
      try { await guardarEnSupabase([best]); } catch (_) {}
    }
    return best;
  }
  if (sinPortada && sinContenido && !esSerieOAnime) {
    best._sin_players = true;
    best = preferApiMeta(best, cached);
    return best;
  }

  // Rellenar portada si falta (pelisplus / otras fuentes)
  if (!esPortadaValida(best.portada)) {
    try {
      best = await asegurarPortada(best);
    } catch (_) {}
  }

  // API gana sobre caché vieja (2012 vs 2026, slug como título, etc.)
  best = preferApiMeta(best, cached);

  // Nunca dejar nombre = slug
  if (best.nombre && best.slug &&
      String(best.nombre).toLowerCase().replace(/\s+/g, "-") === String(best.slug).toLowerCase()) {
    if (best.titulo) best.nombre = best.titulo;
    else best.nombre = String(best.slug).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  await guardarEnSupabase([best]);
  return best;
}

async function borrarDeSupabase(link) {
  if (!link) return;
  try {
    const sb = getSupabase();
    if (sb) {
      // Marcar como descartado (sin borrar la fila) para filtrarlo en listados
      // y no vuelva a aparecer desde estrenos/API
      await sb.from("movies").upsert(
        [
          {
            link,
            tiene_player: false,
            embeds: [],
            reproductor: null,
            episodios: [],
            certificacion: "DESCARTADO",
            descripcion: "__DISCARDED__",
          },
        ],
        { onConflict: "link" }
      );
    }
    moviesDB = moviesDB.filter((m) => m.link !== link);
    knownLinks.delete(link);
    discardedLinks.add(link);
    console.log("Descartado (sin reproductor):", link);
  } catch (err) {
    console.warn("No se pudo descartar en Supabase:", err.message);
  }
}

async function borrarDeSupabasePorSlug(slug) {
  if (!slug) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from("movies").select("link").eq("slug", slug).limit(5);
    for (const row of data || []) {
      if (row.link) await borrarDeSupabase(row.link);
    }
  } catch (err) {
    console.warn("borrarDeSupabasePorSlug:", err.message);
  }
}


/** Extrae slugs alternos desde temporadas_tmdb / urls pelisplus */
function extraerSlugsAlternos(serie, slug) {
  const out = new Set();
  if (slug) out.add(String(slug));
  const tmdb = serie && (serie.temporadas_tmdb || serie.temporadasTmdb);
  if (Array.isArray(tmdb)) {
    for (const s of tmdb) {
      for (const ep of s.episodios || s.episodes || []) {
        const u = String(ep.url || ep.link || "");
        const m = u.match(/\/(?:anime|serie|pelicula)\/([a-z0-9-]+)\//i);
        if (m) out.add(m[1]);
      }
    }
  }
  // título inglés típico → slug
  const tit = String(serie?.titulo_tmdb || serie?.nombre || "").toLowerCase();
  if (tit) {
    const approx = tit
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (approx.length > 3) out.add(approx);
  }
  return [...out];
}

function mergeEmbedLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const e of list || []) {
      const url = (e && e.url) || (typeof e === "string" ? e : null);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(typeof e === "string" ? { url: e } : e);
    }
  }
  return mapEmbeds(out);
}

async function obtenerEpisodio(sourceId, slug, temporada, episodio, kind = "serie", serieCtx = null) {
  const kinds = kind === "anime" ? ["anime", "serie"] : ["serie", "anime"];
  const sources = [String(sourceId || DEFAULT_SOURCE)];
  // Juntar players de todas las fuentes del Worker (1–6)
  const ordenCap =
    kind === "anime" ? ["4", "5", "3", "1", "2"] : ["6", "3", "1", "2", "4", "5"];
  for (const s of ordenCap) {
    if (!sources.includes(s)) sources.push(s);
  }
  const slugsTry = extraerSlugsAlternos(serieCtx, slug);
  if (!slugsTry.includes(slug) && slug) slugsTry.unshift(slug);

  let lastErr = null;
  let best = null;
  let allEmbeds = [];
  let allDownloads = [];

  // Peticiones en paralelo por fuente (más rápido; antes se paraba en la 1ª y solo salía MovieZone)
  const jobs = [];
  for (const sid of sources) {
    for (const k of kinds) {
      for (const trySlug of slugsTry) {
        jobs.push({ sid, k, trySlug });
      }
    }
  }

  const results = await Promise.all(
    jobs.map(async ({ sid, k, trySlug }) => {
      try {
        const path = `/${sid}/${k}/${trySlug}/${temporada}/${episodio}`;
        const data = await apiGet(path);
        if (!data || data.success === false) return null;
        const mapped = mapDetail(data, {
          slug: trySlug,
          source_id: sid,
          tipo: k === "anime" ? "Anime" : "Serie",
        });
        const emb = mapEmbeds(
          (data.reproductores && data.reproductores.length)
            ? data.reproductores
            : (data.embeds || mapped.embeds || [])
        );
        const dl = mapped.downloads || data.descargas || data.downloads || [];
        return { mapped, emb, dl, sid };
      } catch (err) {
        lastErr = err;
        return null;
      }
    })
  );

  for (const r of results) {
    if (!r) continue;
    if (r.emb && r.emb.length) allEmbeds = mergeEmbedLists(allEmbeds, r.emb);
    if (Array.isArray(r.dl) && r.dl.length) {
      allDownloads = mergeEmbedLists(
        allDownloads,
        r.dl.map((d) => (typeof d === "string" ? { url: d } : d))
      );
    }
    if (!best || scoreItem(r.mapped) > scoreItem(best)) {
      best = best ? mergeItems(best, r.mapped) : r.mapped;
    } else {
      best = mergeItems(best, r.mapped);
    }
  }

  if (best) {
    if (allEmbeds.length) {
      best.embeds = allEmbeds;
      best.reproductor = allEmbeds[0]?.url || best.reproductor;
      best.tiene_player = true;
    }
    if (allDownloads.length) best.downloads = allDownloads;
    return best;
  }
  throw lastErr || new Error("No se pudo cargar el episodio");
}

function mismoEpisodio(ep, season, episode) {
  const s = Number(ep.season || ep.temporada || 1);
  const e = Number(ep.episode || ep.episodio || ep.episode_number || 0);
  return s === Number(season) && e === Number(episode);
}

/** Guarda players de un episodio dentro del registro de la serie en Supabase */
async function guardarPlayersEpisodio(serieItem, season, episode, embeds, reproductor) {
  if (!serieItem || !serieItem.link) return;
  const eps = Array.isArray(serieItem.episodios) ? [...serieItem.episodios] : [];
  let found = false;
  for (let i = 0; i < eps.length; i++) {
    if (mismoEpisodio(eps[i], season, episode)) {
      eps[i] = {
        ...eps[i],
        season: Number(season),
        episode: Number(episode),
        embeds: embeds || [],
        video: reproductor || (embeds && embeds[0] && embeds[0].url) || null,
        reproductor: reproductor || null,
      };
      found = true;
      break;
    }
  }
  if (!found) {
    eps.push({
      season: Number(season),
      episode: Number(episode),
      nombre: `T${season}E${String(episode).padStart(2, "0")}`,
      embeds: embeds || [],
      video: reproductor || null,
    });
  }
  const updated = {
    ...serieItem,
    episodios: eps,
    tiene_player: true,
  };
  await guardarEnSupabase([updated]);
  // memoria
  const idx = moviesDB.findIndex((m) => m.link === updated.link);
  if (idx >= 0) moviesDB[idx] = { ...moviesDB[idx], ...updated };
  else moviesDB.unshift(updated);
  return updated;
}

// ---------- Rutas API ----------
app.get("/api/estrenos", async (req, res) => {
  try {
    const tipo = (req.query.tipo || "peliculas").toLowerCase(); // peliculas|series|animes
    const limit = Math.min(48, Math.max(6, parseInt(req.query.limit) || 24));
    const data = await obtenerEstrenos(tipo, limit);
    res.json(data);
  } catch (err) {
    console.error("/api/estrenos", err.message);
    res.status(500).json({ error: "No se pudieron cargar los estrenos", resultados: [] });
  }
});

/** Catálogo paginado: estrenos API + items guardados en Supabase de ese tipo */
function catalogoPaginado(tipoApi, tipoItem, page, limit) {
  return (async () => {
    const data = await obtenerEstrenos(tipoApi, 48);
    let apiItems = data.resultados || [];

    // Items de Supabase del mismo tipo (ya cargados con players / datos)
    const locales = moviesDB.filter((m) => {
      if (tipoItem === "Serie") return m.tipo === "Serie";
      if (tipoItem === "Anime") return m.tipo === "Anime";
      return m.tipo === "Película" || !m.tipo;
    });

    // Fusionar y deduplicar; preferir los que tienen más datos / player
    let all = filtrarDescartados(dedupeListItems([...apiItems, ...locales]));
    all.sort((a, b) => {
      // Disponible primero, luego score
      const av = a.tiene_player ? 1 : 0;
      const bv = b.tiene_player ? 1 : 0;
      if (bv !== av) return bv - av;
      return scoreItem(b) - scoreItem(a);
    });

    const total = all.length;
    const start = (page - 1) * limit;
    return {
      resultados: all.slice(start, start + limit),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  })();
}

app.get("/api/catalogo", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));
    const data = await catalogoPaginado("peliculas", "Película", page, limit);
    res.json(data);
  } catch (err) {
    console.error("/api/catalogo", err.message);
    res.status(500).json({ error: "No se pudo cargar el catálogo", resultados: [] });
  }
});

app.get("/api/series", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));
    const data = await catalogoPaginado("series", "Serie", page, limit);
    res.json(data);
  } catch (err) {
    console.error("/api/series", err.message);
    res.status(500).json({ error: "No se pudieron cargar las series", resultados: [] });
  }
});

app.get("/api/animes", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));
    const data = await catalogoPaginado("animes", "Anime", page, limit);
    res.json(data);
  } catch (err) {
    console.error("/api/animes", err.message);
    res.status(500).json({ error: "No se pudieron cargar los animes", resultados: [] });
  }
});

app.get("/api/buscar", limiterBusqueda, async (req, res) => {
  try {
    const termino = String(req.query.q || "").trim();
    const soloLocal = req.query.source === "local" || req.query.local === "1";
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(60, Math.max(12, parseInt(req.query.limit) || 48));
    const type = req.query.type || null;

    if (!termino) {
      return res.status(400).json({ error: "Escribe algo para buscar" });
    }

    if (soloLocal) {
      await ensureMoviesDB();
      return res.json(buscarLocal(termino, type, page, limit));
    }

    try {
      const data = await buscarOnline(termino, page, limit);
      return res.json(data);
    } catch (err) {
      console.warn("Búsqueda online falló, usando local:", err.message);
      await ensureMoviesDB();
      const local = buscarLocal(termino, type, page, limit);
      return res.json({ ...local, source: "local", online_error: err.message });
    }
  } catch (err) {
    console.error("/api/buscar", err.message);
    res.status(500).json({ error: "No se pudo realizar la búsqueda" });
  }
});

app.get("/api/recien", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 40);
    // Directo a Supabase (no confiar en memoria de Vercel)
    const sb = getSupabase();
    if (!sb) {
      await ensureMoviesDB();
      return res.json({
        resultados: moviesDB.slice(0, limit).map((m) => normalizeItemFromDB(m)),
      });
    }
    const { data, error } = await sb
      .from("movies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const resultados = filtrarDescartados(
      (data || []).map((row) => normalizeItemFromDB(row)).filter(Boolean)
    );
    // Actualizar espejo en memoria
    for (const item of resultados) {
      if (!item.link) continue;
      const idx = moviesDB.findIndex((m) => m.link === item.link);
      if (idx >= 0) moviesDB[idx] = { ...moviesDB[idx], ...item };
      else moviesDB.unshift(item);
    }
    res.json({ resultados });
  } catch (err) {
    console.error("/api/recien", err.message);
    res.status(500).json({ error: "No se pudieron cargar los recién añadidos", resultados: [] });
  }
});

app.get("/api/detalle", async (req, res) => {
  try {
    const link = req.query.link || null;
    const postId = req.query.postId || null;
    const slug = req.query.slug || null;
    const source_id = req.query.source_id || req.query.source || null;
    const tipo = req.query.tipo || null;

    if (!link && !postId && !slug) {
      return res.status(400).json({ error: "Falta link, postId o slug" });
    }

    const force = req.query.force === "1";
    const item = await obtenerDetalle({ link, postId, slug, source_id, tipo, force });
    res.json(item);
  } catch (err) {
    console.error("/api/detalle", err.message);
    res.status(500).json({ error: "No se pudo cargar el detalle", detalle: err.message });
  }
});

app.get("/api/episodios", async (req, res) => {
  try {
    const postId = req.query.postId || null;
    const season = parseInt(req.query.season) || 1;
    const link = req.query.link || null;
    const slug = req.query.slug || null;
    const tipo = req.query.tipo || "Serie";
    const isAnime = tipo === "Anime" || /anime/i.test(String(tipo));
    // Anime → preferir fuente 4 (animeav1); doramas → 6
    const source_id = req.query.source_id || (isAnime ? "4" : DEFAULT_SOURCE);
    const loadPlayers = req.query.players === "1";
    const epFrom = parseInt(req.query.ep_from, 10) || null;
    const epTo = parseInt(req.query.ep_to, 10) || null;

    let item = null;
    try {
      // Si piden rango (animeav1), ir directo a esa fuente con ep_from/ep_to
      if (isAnime && slug && (epFrom || epTo || ["4", "5"].includes(String(resolverSourceId(source_id))))) {
        const from = epFrom || 1;
        const to = epTo || (epFrom ? epFrom + 99 : 100);
        item = await fetchDetailFromSource("4", "anime", slug, {
          ep_from: from,
          ep_to: to,
          tipo: "Anime",
          slug,
        });
        if (item) {
          // Complementar con otras fuentes (más episodios / meta) sin perder la lista
          try {
            const full = await obtenerDetalle({
              link,
              postId,
              slug,
              source_id: "4",
              tipo: "Anime",
              force: false,
            });
            if (full) {
              item = mergeItems(item, full);
              item = expandirEpisodiosAnime(item);
            }
          } catch (_) {}
        }
      }
      if (!item) {
        item = await obtenerDetalle({ link, postId, slug, source_id, tipo });
      }
    } catch (err) {
      console.warn("episodios detalle:", err.message);
    }

    if (!item) {
      return res.json({ temporadas: [1], seasonActual: season, episodios: [] });
    }

    item = expandirEpisodiosAnime(item);

    let eps = Array.isArray(item.episodios)
      ? item.episodios.filter((e) => Number(e.season || 1) === season)
      : [];
    if (!eps.length && Array.isArray(item.episodios)) {
      eps = item.episodios.filter((e) => !e.season || Number(e.season) === season);
    }

    // Filtrar por rango si viene en query
    if (epFrom || epTo) {
      const from = epFrom || 1;
      const to = epTo || from + 99;
      eps = eps.filter((e) => {
        const n = Number(e.episode || e.episodio || 0);
        return n >= from && n <= to;
      });
      // Si tras filtrar no hay, generar stubs del rango
      if (!eps.length) {
        for (let n = from; n <= to; n++) {
          eps.push({
            season,
            episode: n,
            nombre: `Episodio ${n}`,
            embeds: [],
            video: null,
            source_id: item.source_id || source_id,
          });
        }
      }
    }

    const id = parseIdentidad(item) || {
      sourceId: String(item.source_id || source_id),
      slug: item.slug || slug,
      kind: isAnime || item.tipo === "Anime" ? "anime" : "serie",
    };

    if (eps.length && (loadPlayers || !eps[0].embeds?.length)) {
      try {
        const epNum = eps[0].episode || 1;
        // Anime: preferir fuente 4 para players
        const sidPlayers = id.kind === "anime" ? "4" : resolverSourceId(id.source_id);
        const det = await obtenerEpisodio(sidPlayers, id.slug, season, epNum, id.kind, item);
        if (det.embeds?.length) {
          eps[0].embeds = det.embeds;
          eps[0].video = det.reproductor;
          await guardarPlayersEpisodio(item, season, epNum, det.embeds, det.reproductor);
        }
      } catch (err) {
        console.warn("No se pudieron cargar players ep1:", err.message);
      }
    }

    res.json({
      temporadas: item.temporadas?.length ? item.temporadas : [season],
      seasonActual: season,
      episodios: eps,
      slug: item.slug || slug,
      source_id: item.source_id || source_id,
      link: item.link,
      total_episodios: item.total_episodios || eps.length,
      rangos_episodios: item.rangos_episodios || null,
    });
  } catch (err) {
    console.error("/api/episodios", err.message);
    res.status(500).json({ error: "No se pudieron cargar los episodios", detalle: err.message });
  }
});

/** Players de un capítulo: Supabase primero → si no, API → guarda → responde */
app.get("/api/capitulo", async (req, res) => {
  try {
    const sourceId = req.query.source_id || DEFAULT_SOURCE;
    const slug = req.query.slug;
    const link = req.query.link || null;
    const tipo = req.query.tipo || "Serie";
    const temporada = parseInt(req.query.temporada || req.query.season) || 1;
    const episodio = parseInt(req.query.episodio || req.query.episode) || 1;
    if (!slug && !link) return res.status(400).json({ error: "Falta slug o link" });

    // 1) Supabase / memoria: ¿ya tenemos este capítulo con players?
    let serie = null;
    try {
      // Solo cache (no re-scrape): buscarEnSupabase + memoria
      serie = await buscarEnSupabase({ link, slug, postId: null });
      if (!serie && link) {
        const local = moviesDB.find((m) => m.link === link);
        if (local) serie = normalizeItemFromDB(local);
      }
      if (!serie && slug) {
        const local = moviesDB.find((m) => m.slug === slug || (m.link && String(m.link).includes(slug)));
        if (local) serie = normalizeItemFromDB(local);
      }
    } catch (_) {}

    // Cache: solo devolver si ya hay varios embeds (evitar quedarse con 1 y perder latino/dub)
    let cachedEmb = [];
    if (serie && Array.isArray(serie.episodios)) {
      const cached = serie.episodios.find(
        (e) => mismoEpisodio(e, temporada, episodio) && (e.embeds?.length || e.video || e.reproductor)
      );
      if (cached) {
        cachedEmb = mapEmbeds(cached.embeds || []);
        // ≥4 players → suficiente; si no, seguir a API para sumar latino/otras fuentes
        if (cachedEmb.length >= 4) {
          return res.json({
            season: temporada,
            episode: episodio,
            embeds: cachedEmb,
            downloads: cached.downloads || cached.descargas || [],
            reproductor: cached.video || cached.reproductor || (cachedEmb[0] && cachedEmb[0].url) || null,
            from: "supabase",
          });
        }
      }
    }

    // 2) API externa del episodio (fusiona 1/2/3/4 → latino + sub)
    const kind = (tipo === "Anime" || serie?.tipo === "Anime") ? "anime" : "serie";
    const resolvedSlug = slug || serie?.slug;
    if (!resolvedSlug) return res.status(400).json({ error: "Falta slug" });

    const det = await obtenerEpisodio(sourceId, resolvedSlug, temporada, episodio, kind, serie);
    let embeds = mapEmbeds(det.embeds || []);
    // Unir con cache parcial
    if (cachedEmb.length) embeds = mergeEmbedLists(cachedEmb, embeds);

    // 3) Guardar en Supabase (crear stub de serie si hace falta)
    if (embeds.length) {
      if (!serie) {
        serie = {
          link: link || `${API_BASE}/${sourceId}/${kind}/${resolvedSlug}`,
          slug: resolvedSlug,
          source_id: String(sourceId),
          tipo: kind === "anime" ? "Anime" : "Serie",
          nombre: det.nombre || resolvedSlug,
          episodios: [],
          tiene_player: true,
        };
      }
      try {
        await guardarPlayersEpisodio(serie, temporada, episodio, embeds, det.reproductor);
      } catch (saveErr) {
        console.warn("guardarPlayersEpisodio:", saveErr.message);
      }
    }

    res.json({
      season: temporada,
      episode: episodio,
      embeds,
      downloads: det.downloads || det.descargas || [],
      reproductor: det.reproductor || (embeds[0] && embeds[0].url) || null,
      nombre: det.nombre,
      from: "api",
    });
  } catch (err) {
    console.error("/api/capitulo", err.message);
    res.status(500).json({ error: "No se pudo cargar el capítulo", detalle: err.message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "MovieZone",
    api: API_BASE,
    supabase: !!getSupabase(),
    items: moviesDB.length,
    telegram: isTelegramEnabled(),
  });
});

// ---------- Telegram: aviso de visitas (apagable) ----------
function isTelegramEnabled() {
  // TELEGRAM_NOTIFY=0 | false | off → apagado
  const flag = String(process.env.TELEGRAM_NOTIFY || "1").toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") return false;
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function enviarTelegram(texto) {
  if (!isTelegramEnabled()) return false;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: texto,
        disable_web_page_preview: true,
      },
      { timeout: 8000 }
    );
    return true;
  } catch (err) {
    console.warn("Telegram:", err.message);
    return false;
  }
}

// Rate limit simple en memoria por IP (1 aviso cada 30 min)
const visitCooldown = new Map();
app.post("/api/visit", express.json({ limit: "8kb" }), async (req, res) => {
  try {
    if (!isTelegramEnabled()) {
      return res.json({ ok: true, sent: false, reason: "telegram_off" });
    }
    const ip =
      (req.headers["x-forwarded-for"] && String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
      req.ip ||
      "unknown";
    const now = Date.now();
    const last = visitCooldown.get(ip) || 0;
    if (now - last < 30 * 60 * 1000) {
      return res.json({ ok: true, sent: false, reason: "cooldown" });
    }
    visitCooldown.set(ip, now);

    const d = req.body || {};
    const lineas = [
      "👁 Nueva visita MovieZone",
      `• IP: ${ip}`,
      `• Dispositivo: ${d.device || "—"}`,
      `• SO: ${d.os || "—"}`,
      `• Navegador: ${d.browser || "—"}`,
      `• Pantalla: ${d.screen || "—"}`,
      `• Idioma: ${d.lang || "—"}`,
      `• Zona: ${d.timezone || "—"}`,
      `• URL: ${d.url || "—"}`,
      `• Referrer: ${d.referrer || "directo"}`,
      `• Hora: ${new Date().toISOString()}`,
    ];
    const sent = await enviarTelegram(lineas.join("\n"));
    res.json({ ok: true, sent });
  } catch (err) {
    console.error("/api/visit", err.message);
    res.status(500).json({ ok: false, error: "visit_failed" });
  }
});

app.get("/api/telegram-status", (_req, res) => {
  res.json({ enabled: isTelegramEnabled() });
});

// ---------- Frontend estático ----------
// En Vercel el working dir es /var/task; includeFiles copia public ahí
const publicDir = path.join(__dirname, "public");
const publicDirAlt = path.join(process.cwd(), "public");
const fs = require("fs");
const resolvedPublic = fs.existsSync(publicDir)
  ? publicDir
  : fs.existsSync(publicDirAlt)
    ? publicDirAlt
    : publicDir;

app.use(express.static(resolvedPublic));

function sendIndex(res) {
  const indexPath = path.join(resolvedPublic, "index.html");
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send(
      "index.html no encontrado. Revisa vercel.json includeFiles: public/**"
    );
  }
  res.sendFile(indexPath);
}

app.get(["/peliculas", "/series", "/animes"], (_req, res) => sendIndex(res));
app.get("/", (_req, res) => sendIndex(res));

// ---------- Arranque ----------
cargarDatosSupabase().catch(() => {});

// En Vercel no escuchamos puerto; el export sirve.
if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MovieZone v2 escuchando en :${PORT}`);
    console.log(`API fuente: ${API_BASE}`);
  });
}

module.exports = app;
