/**
 * MOVIEZONE v2 — Backend sin scraping
 * Fuente de datos: https://moviezone.tvjz.workers.dev/ (1=lamovie 2=hackstore 3=pelisplushd 4=animeav1)
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
const DEFAULT_SOURCE = process.env.MOVIEZONE_SOURCE || "3";

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
      if (item.source_id === "4" || item.fuente === "animeav1") {
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
      const descripcionFinal =
        item.descripcion && String(item.descripcion).length > 20
          ? item.descripcion
          : (existente?.descripcion || item.descripcion || null);
      return {
        link: item.link,
        nombre: limpiarTitulo(nombre || existente?.nombre || null),
        titulo_original: item.titulo_original || existente?.titulo_original || null,
        portada: item.portada || existente?.portada || null,
        backdrop: item.backdrop || existente?.backdrop || null,
        descripcion: descripcionFinal,
        year: item.year || existente?.year || null,
        genero: item.genero || existente?.genero || null,
        tipo: item.tipo || existente?.tipo || "Película",
        idiomas: (item.idiomas && item.idiomas.length) ? item.idiomas : (existente?.idiomas || []),
        calidad: (item.calidad && item.calidad.length) ? item.calidad : (existente?.calidad || []),
        paises: item.paises || existente?.paises || [],
        calificacion: item.calificacion || existente?.calificacion || null,
        calificacion_comunidad: item.calificacion_comunidad || existente?.calificacion_comunidad || null,
        votos: item.votos ? Math.trunc(Number(item.votos)) || null : (existente?.votos || null),
        fecha_estreno: item.fecha_estreno || existente?.fecha_estreno || null,
        duracion: item.duracion ? Math.trunc(Number(item.duracion)) || null : (existente?.duracion || null),
        certificacion: item.certificacion || existente?.certificacion || null,
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

  try {
    const { error } = await sb.from("movies").upsert(paraInsertar, { onConflict: "link" });
    if (error) throw error;
    paraInsertar.forEach((item) => {
      knownLinks.add(item.link);
      const idx = moviesDB.findIndex((m) => m.link === item.link);
      if (idx >= 0) moviesDB[idx] = { ...moviesDB[idx], ...item };
      else moviesDB.unshift(item);
    });
    console.log(`Guardados/actualizados ${paraInsertar.length} items en Supabase`);
  } catch (err) {
    console.error("Error guardando en Supabase:", err.message);
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
        return { url: e, idioma: null, servidor: null, calidad: null };
      }
      if (e && typeof e === "object") {
        const url = e.url || e.src || e.link || null;
        if (!url) return null;
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

/** Portada usable (no placeholder, no data-uri, no SVG) */
function esPortadaValida(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.trim();
  if (!u || u.includes("placeholder") || u.startsWith("data:")) return false;
  if (/svg\+xml|lazyload\.min/i.test(u)) return false;
  // Hackstore a veces no sirve posters reales
  if (/hackstore\./i.test(u) && !/image\.tmdb\.org/i.test(u)) return false;
  return /^https?:\/\//i.test(u);
}

/** Preferir portada de la misma fuente que los reproductores */
function elegirPortada(a, b, sourcePreferido) {
  const candidatos = [a, b].filter(esPortadaValida);
  if (!candidatos.length) return a || b || null;
  const sid = String(sourcePreferido || "");
  // Orden de preferencia según fuente del player
  if (sid === "3" || sid === "pelisplushd") {
    const pp = candidatos.find((u) => /pelisplushd|\/poster\//i.test(u));
    if (pp) return pp;
    const tmdb = candidatos.find((u) => /image\.tmdb\.org/i.test(u));
    if (tmdb) return tmdb;
  }
  if (sid === "1" || sid === "lamovie") {
    const lm = candidatos.find((u) => /lamovie\.org/i.test(u));
    if (lm) return lm;
  }
  if (sid === "2" || sid === "hackstore") {
    const tmdb = candidatos.find((u) => /image\.tmdb\.org/i.test(u));
    if (tmdb) return tmdb;
  }
  if (sid === "4" || sid === "animeav1") {
    const tmdb = candidatos.find((u) => /image\.tmdb\.org/i.test(u));
    if (tmdb) return tmdb;
  }
  // General: tmdb > pelisplus poster > lamovie > resto
  return (
    candidatos.find((u) => /image\.tmdb\.org/i.test(u)) ||
    candidatos.find((u) => /pelisplushd|\/poster\//i.test(u)) ||
    candidatos.find((u) => /lamovie\.org/i.test(u)) ||
    candidatos[0]
  );
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
  if (item.total_episodios) s += Math.min(10, Number(item.total_episodios) / 12);
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
  const map = new Map();
  for (const item of lista || []) {
    const titleKey = normalizeTitleKey(item.nombre || item.titulo);
    const slugKey = String(item.slug || "")
      .toLowerCase()
      .replace(/-season-\d+$/i, "")
      .replace(/-\d{4}$/, "")
      .trim();
    // Misma obra: título normalizado (prioriza unificar Wistoria 10eps vs 24eps)
    // o slug sin -season-N
    const key = titleKey
      ? "t:" + titleKey
      : slugKey
        ? "slug:" + slugKey
        : null;
    if (!key) {
      map.set(item.link || item.slug || String(Math.random()), item);
      continue;
    }
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      continue;
    }
    // Más reproductores / mejor fuente (anime → 4 primero)
    const winner = scoreItem(item) >= scoreItem(prev) ? { ...item } : { ...prev };
    const loser = scoreItem(item) >= scoreItem(prev) ? prev : item;
    if (loser.tiene_player && !winner.tiene_player) {
      winner.tiene_player = true;
      if (!winner.embeds?.length && loser.embeds?.length) winner.embeds = loser.embeds;
      if (!winner.reproductor && loser.reproductor) winner.reproductor = loser.reproductor;
    }
    // Portada: misma lógica que la fuente de los players
    winner.portada = elegirPortada(winner.portada, loser.portada, winner.source_id);
    if (!winner.calificacion && loser.calificacion) winner.calificacion = loser.calificacion;
    if ((!winner.descripcion || winner.descripcion.length < 40) && loser.descripcion) {
      winner.descripcion = loser.descripcion;
    }
    if (!winner.genero && loser.genero) winner.genero = loser.genero;
    if (!winner.backdrop && loser.backdrop) winner.backdrop = loser.backdrop;
    if (!winner.tmdb_id && loser.tmdb_id) winner.tmdb_id = loser.tmdb_id;
    if (!winner.postId && loser.postId) {
      winner.postId = loser.postId;
    }
    map.set(key, winner);
  }
  return Array.from(map.values());
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
    } else if (k === "descripcion" && String(v).length > String(cur || "").length) {
      out[k] = v;
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

/** Resultado de listado / search → item ligero (API v2 con TMDB) */
function mapListItem(r) {
  const titulo = limpiarTitulo(r.titulo || r.title || r.nombre || r.titulo_tmdb || "Sin título");
  const tipo = normalizarTipo(r.tipo || r.type);
  const slug = r.slug || null;
  const sourceId = String(r.source_id || r.fuente || DEFAULT_SOURCE);
  const year = extraerAnio(titulo, r.year || (r.fecha_estreno || "").slice(0, 4));
  const portada = r.portada || r.portada_tmdb || r.poster || r.tmdb_poster || null;
  const link =
    r.link ||
    r.url ||
    (r.url_extract
      ? r.url_extract
      : slug
        ? `${API_BASE}/${sourceId}/${tipo === "Serie" || tipo === "Anime" ? "serie" : "pelicula"}/${slug}`
        : null);

  const genero = extraerGenero(r) || (Array.isArray(r.generos) ? r.generos.join(", ") : null);
  const descripcion = limpiarDescripcion(r.descripcion || r.overview_tmdb || r.tmdb_overview || "", titulo);

  return {
    id: r.postId || r.id || r.tmdb_id || `${sourceId}-${slug || titulo}`,
    postId: r.postId || null,
    tmdb_id: r.tmdb_id || null,
    nombre: titulo,
    titulo_original: r.titulo_original || r.original_title || null,
    slug,
    tipo,
    descripcion,
    portada,
    portada_tmdb: r.portada_tmdb || null,
    backdrop: r.backdrop || null,
    year,
    genero,
    generos: Array.isArray(r.generos) ? r.generos : (genero ? genero.split(",").map((g) => g.trim()) : []),
    idiomas: r.idiomas || [],
    calidad: r.calidad || [],
    calificacion: r.calificacion || r.rating || r.tmdb_rating || null,
    calificacion_comunidad: null,
    votos: r.votos || null,
    fecha_estreno: r.fecha_estreno || r.release_date || r.tmdb_release_date || null,
    duracion: r.duracion || r.runtime || null,
    certificacion: null,
    paises: [],
    ultimo_episodio: null,
    link,
    url_extract: r.url_extract || link,
    source_id: sourceId,
    reproductor: null,
    downloads: [],
    embeds: [],
    soloTrailer: false,
    episodios: [],
    temporadas: [],
    tiene_player: false,
  };
}

/** Detalle de película / serie / capítulo → item completo */
function mapDetail(data, fallback = {}) {
  const titulo = limpiarTitulo(data.titulo || data.title || fallback.nombre || "Sin título");
  const tipo = normalizarTipo(data.tipo || fallback.tipo);
  const sourceId = String(data.source_id || fallback.source_id || DEFAULT_SOURCE);
  const slug = data.slug || fallback.slug || null;
  const embedsArr = mapEmbeds(data.reproductores && data.reproductores.length ? data.reproductores : data.embeds);
  // Primer reproductor = el de vimeos si existe (mapEmbeds ya los ordena primero)
  const reproductor = embedsArr[0]?.url || data.reproductor || null;

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
        episodios.push({
          id: `${slug}-t${ep.temporada || temp.temporada}-e${ep.episodio || ep.episode}`,
          nombre: ep.titulo || `T${ep.temporada || temp.temporada}E${String(ep.episodio || ep.episode).padStart(2, "0")}`,
          season: Number(ep.temporada || temp.temporada || 1),
          episode: Number(ep.episodio || ep.episode || 1),
          video: ep.reproductor || null,
          embeds: mapEmbeds(ep.reproductores || ep.embeds || []),
          downloads: ep.descargas || [],
          soloTrailer: false,
          url_video: ep.url_video || ep.link || null,
          source_id: sourceId,
          slug_media: ep.slug_media || temp.slug_media || null,
        });
      }
    }
  }

  return {
    id: data.postId || fallback.postId || fallback.id || `${sourceId}-${slug || titulo}`,
    postId: data.postId || fallback.postId || null,
    nombre: titulo,
    titulo_original: data.titulo_original || null,
    slug,
    tipo: tipo === "Capitulo" ? "Serie" : tipo,
    descripcion: limpiarDescripcion(data.descripcion || fallback.descripcion || "", titulo),
    portada: data.portada || data.portada_tmdb || fallback.portada || null,
    portada_tmdb: data.portada_tmdb || null,
    backdrop: data.backdrop || fallback.backdrop || null,
    year: extraerAnio(titulo, data.year || data.fecha_estreno || fallback.year),
    genero: extraerGenero(data) || extraerGenero(fallback) || (Array.isArray(data.generos) ? data.generos.join(", ") : null),
    generos: Array.isArray(data.generos) ? data.generos : [],
    idiomas: data.idiomas || [],
    calidad: data.calidad || [],
    calificacion: data.calificacion || data.rating || null,
    tmdb_id: data.tmdb_id || fallback.tmdb_id || null,
    titulo_original: data.titulo_original || data.original_title || fallback.titulo_original || null,
    calificacion_comunidad: null,
    votos: null,
    fecha_estreno: data.fecha_estreno || null,
    duracion: data.duracion || null,
    certificacion: null,
    paises: [],
    ultimo_episodio: data.ultimo_episodio || null,
    link: data.link || fallback.link || null,
    source_id: sourceId,
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
          descripcion: local.descripcion,
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

async function buscarOnline(termino, page = 1, limit = 28) {
  await ensureMoviesDB();
  const q = encodeURIComponent(termino.trim());
  const data = await apiGet(`/search?q=${q}`);
  let lista = (data.resultados || []).map(mapListItem);

  // Deduplicar: la API busca en varias fuentes (lamovie/hackstore/pelisplus/animeav1) y puede devolver el mismo título 2-3 veces.
  // Nos quedamos con el que tenga más datos (portada, calificación, etc.).
  lista = dedupeListItems(lista);

  // Enriquecer con lo que ya tengamos en Supabase/memoria (tiene_player, descripción…)
  lista = lista.map((item) => {
    const local =
      moviesDB.find(
        (m) =>
          (item.link && m.link === item.link) ||
          (item.slug && m.slug === item.slug) ||
          (normalizeTitleKey(m.nombre) === normalizeTitleKey(item.nombre) && m.tipo === item.tipo)
      ) || null;
    if (local) {
      const merged = mergeItems(item, {
        tiene_player: local.tiene_player,
        embeds: local.embeds,
        reproductor: local.reproductor,
        descripcion: local.descripcion,
        calificacion: local.calificacion,
        portada: elegirPortada(item.portada, local.portada, item.source_id || local.source_id),
        downloads: local.downloads,
        episodios: local.episodios,
        source_id: item.source_id || local.source_id,
      });
      return merged;
    }
    return item;
  });

  // Segunda pasada de dedupe por si merge con locales creó duplicados
  lista = dedupeListItems(lista);
  lista = colapsarTemporadasAnimeAv1(lista);
  lista = filtrarDescartados(lista);
  lista = filtrarSinReproductor(lista);
  // Preferir el que tenga más episodios / temporadas (ej. Wistoria 24 vs 10)
  lista.sort((a, b) => {
    const ea = (a.total_episodios || a.episodios?.length || 0);
    const eb = (b.total_episodios || b.episodios?.length || 0);
    if (ea !== eb) return eb - ea;
    return scoreItem(b) - scoreItem(a);
  });

  // Paginación simple en memoria
  const total = lista.length;
  const start = (page - 1) * limit;
  const pageLista = lista.slice(start, start + limit);

  // Guardar metadatos para que la próxima carga ya los tenga
  guardarEnSupabase(pageLista).catch(() => {});
  return { resultados: pageLista, total, page, limit, source: "online" };
}

function buscarLocal(termino, type = null, page = 1, limit = 28) {
  const q = termino.toLowerCase().trim();
  let lista = moviesDB.filter((m) => {
    const nombre = (m.nombre || "").toLowerCase();
    const okTipo =
      !type ||
      (type === "movie" && (m.tipo === "Película" || !m.tipo)) ||
      (type === "series" && m.tipo === "Serie") ||
      (type === "anime" && m.tipo === "Anime") ||
      (type === "peliculas" && (m.tipo === "Película" || !m.tipo));
    return okTipo && nombre.includes(q);
  });
  const total = lista.length;
  const start = (page - 1) * limit;
  lista = lista.slice(start, start + limit);
  return { resultados: lista, total, page, limit, source: "local" };
}

/**
 * Resolver slug + source desde link o url_extract
 * Ej: https://moviezone.tvjz.workers.dev/3/pelicula/yellow-mirror
 *     https://www.pelisplushd.la/pelicula/yellow-mirror/
 */
function parseIdentidad(itemOrLink) {
  const link = typeof itemOrLink === "string" ? itemOrLink : itemOrLink?.link || itemOrLink?.url_extract || "";
  const sourceFromItem = typeof itemOrLink === "object" ? itemOrLink.source_id : null;
  const slugFromItem = typeof itemOrLink === "object" ? itemOrLink.slug : null;
  const tipoFromItem = typeof itemOrLink === "object" ? itemOrLink.tipo : null;

  // API extract URL (1-4)
  let m = link.match(/\/(\d)\/(pelicula|serie|anime)\/([^/?#]+)/i);
  if (m) {
    return { sourceId: m[1], kind: m[2].toLowerCase(), slug: m[3] };
  }
  // AnimeAV1
  m = link.match(/animeav1\.com\/media\/([^/?#]+)/i);
  if (m) {
    return { sourceId: "4", kind: "anime", slug: m[1] };
  }
  // Sitio origen
  m = link.match(/\/(pelicula|serie|anime|peliculas|series|animes)\/([^/?#]+)/i);
  if (m) {
    let kind = m[1].toLowerCase();
    if (kind === "peliculas") kind = "pelicula";
    if (kind === "series") kind = "serie";
    if (kind === "animes") kind = "anime";
    return {
      sourceId: String(sourceFromItem || DEFAULT_SOURCE),
      kind,
      slug: m[2],
    };
  }
  if (slugFromItem) {
    const kind =
      tipoFromItem === "Serie" || tipoFromItem === "Anime"
        ? tipoFromItem === "Anime"
          ? "anime"
          : "serie"
        : "pelicula";
    return { sourceId: String(sourceFromItem || DEFAULT_SOURCE), kind, slug: slugFromItem };
  }
  return null;
}

async function fetchDetailFromSource(sourceId, kind, slug, fallback = {}) {
  const path = `/${sourceId}/${kind}/${slug}`;
  try {
    const data = await apiGet(path);
    if (!data || data.success === false) return null;
    const item = mapDetail(data, { ...fallback, slug, source_id: String(sourceId) });
    if (!item.link) item.link = data.link || `${API_BASE}${path}`;
    if (!item.slug) item.slug = slug;
    return item;
  } catch (err) {
    console.warn(`Detalle ${sourceId}/${kind}/${slug}:`, err.message);
    return null;
  }
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

  // Si ya tenemos contenido válido (players o episodios) y descripción, y no force → devolver de Supabase
  const tieneDesc = cached && cached.descripcion && String(cached.descripcion).length > 20;
  const tieneContenido = cached && (itemTieneContenidoValido(cached) || (cached.episodios && cached.episodios.length));
  if (!force && cached && tieneContenido && tieneDesc) {
    return cached;
  }

  // 3) API externa
  const id = parseIdentidad({ link, slug, source_id: source_id || cached?.source_id, tipo: tipo || cached?.tipo });
  if (!id) {
    if (cached) return cached;
    if (postId) {
      const local = moviesDB.find((m) => String(m.postId) === String(postId));
      if (local) return normalizeItemFromDB(local);
    }
    throw new Error("No se pudo identificar la película/serie");
  }

  // Si ya funciona bien (players + descripción + portada) y no es force → no re-scrapear
  // (force = usuario pulsó Actualizar: solo re-busca fuentes si faltan players/episodios/portada)
  const yaFunciona =
    cached &&
    itemTieneContenidoValido(cached) &&
    cached.descripcion &&
    String(cached.descripcion).length > 40 &&
    cached.portada &&
    !String(cached.portada).includes("placeholder");

  if (!force && yaFunciona) {
    return cached;
  }

  // force con players OK: solo refrescar meta (descripcion/genero) de la fuente actual, no rehacer todo
  const soloMeta =
    force &&
    cached &&
    itemTieneContenidoValido(cached) &&
    (cached.tipo === "Película" || (cached.episodios && cached.episodios.length));

  const sourcesToTry = [String(id.sourceId)];
  // 4 = animeav1 (prioridad alta en anime)
  const ordenFuentes =
    id.kind === "anime" ? ["4", "3", "1", "2"] : ["3", "1", "2", "4"];
  for (const s of ordenFuentes) {
    if (!sourcesToTry.includes(s)) sourcesToTry.push(s);
  }
  // Si solo necesitamos meta y ya hay players, probar 1 fuente y listo
  const fuentes = soloMeta ? sourcesToTry.slice(0, 1) : sourcesToTry;

  let best = null;
  for (const sid of fuentes) {
    // Probar slug actual y variantes sin año
    const slugsTry = [id.slug];
    const slugSinAnio = String(id.slug || "").replace(/-\d{4}$/, "");
    if (slugSinAnio && slugSinAnio !== id.slug) slugsTry.push(slugSinAnio);

    for (const slugTry of slugsTry) {
      const candidate = await fetchDetailFromSource(sid, id.kind, slugTry, {
        link,
        slug: slugTry,
        source_id: sid,
        tipo: tipo || cached?.tipo,
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
      if (
        best &&
        candidate.descripcion &&
        String(candidate.descripcion).length > String(best.descripcion || "").length
      ) {
        best.descripcion = candidate.descripcion;
      }
      if (candidate.genero && !best.genero) best.genero = candidate.genero;
      // Portada de la fuente que aportó los reproductores (no mezclar hackstore roto)
      if (itemTieneContenidoValido(candidate) || (candidate.embeds && candidate.embeds.length)) {
        best.source_id = candidate.source_id || best.source_id;
        best.slug = candidate.slug || best.slug;
        best.link = candidate.link || best.link;
        best.url_extract = candidate.url_extract || best.url_extract;
        best.portada = elegirPortada(candidate.portada, best.portada, best.source_id);
      } else {
        best.portada = elegirPortada(best.portada, candidate.portada, best.source_id);
      }
    }
    // Si ya tenemos players buenos, no hace falta seguir en force solo-meta
    if (soloMeta && best) break;
    if (!force && best && itemTieneContenidoValido(best) && best.descripcion && best.portada) break;
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
  if (cached?.descripcion && descripcionIncompleta(best.descripcion) && !descripcionIncompleta(cached.descripcion)) {
    best.descripcion = cached.descripcion;
  }
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

  const sinPortada = !best.portada || String(best.portada).includes("placeholder");
  const sinContenido = !best.tiene_player;
  const esSerieOAnime = best.tipo === "Serie" || best.tipo === "Anime";

  // NO descartar series/animes: los players suelen cargarse por episodio
  // Solo descartar PELÍCULAS sin reproductor, o cualquier cosa sin portada Y sin contenido
  if (!esSerieOAnime && sinContenido) {
    if (best.link) await borrarDeSupabase(best.link);
    if (best.slug) await borrarDeSupabasePorSlug(best.slug);
    best._eliminado = true;
    return best;
  }
  if (sinPortada && sinContenido && !esSerieOAnime) {
    if (best.link) await borrarDeSupabase(best.link);
    return best;
  }

  // Series/animes: guardar aunque aún no tengan embeds (sí temporadas/episodios)
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
  // En anime: probar varias fuentes para juntar SUB (animeav1) + LAT (pelisplus)
  const ordenCap =
    kind === "anime" ? ["4", "3", "1", "2"] : ["3", "1", "2", "4"];
  for (const s of ordenCap) {
    if (!sources.includes(s)) sources.push(s);
  }
  const slugsTry = extraerSlugsAlternos(serieCtx, slug);
  if (!slugsTry.includes(slug) && slug) slugsTry.unshift(slug);

  let lastErr = null;
  let best = null;
  let allEmbeds = [];
  let allDownloads = [];

  for (const sid of sources) {
    for (const k of kinds) {
      for (const trySlug of slugsTry) {
        try {
          const path = `/${sid}/${k}/${trySlug}/${temporada}/${episodio}`;
          const data = await apiGet(path);
          if (!data || data.success === false) continue;
          const mapped = mapDetail(data, {
            slug: trySlug,
            source_id: sid,
            tipo: k === "anime" ? "Anime" : "Serie",
          });
          const emb = mapped.embeds || mapEmbeds(data.reproductores || data.embeds || []);
          if (emb.length) allEmbeds = mergeEmbedLists(allEmbeds, emb);
          const dl = mapped.downloads || data.descargas || data.downloads || [];
          if (Array.isArray(dl) && dl.length) {
            allDownloads = mergeEmbedLists(allDownloads, dl.map((d) =>
              typeof d === "string" ? { url: d } : d
            ));
          }
          if (!best || scoreItem(mapped) > scoreItem(best)) {
            best = best ? mergeItems(best, mapped) : mapped;
          }
          // No return early: seguir buscando LAT en otras fuentes
        } catch (err) {
          lastErr = err;
        }
      }
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

/** Guarda players de un episodio dentro del registro de la serie en Supabase */
async function guardarPlayersEpisodio(serieItem, season, episode, embeds, reproductor) {
  if (!serieItem || !serieItem.link) return;
  const eps = Array.isArray(serieItem.episodios) ? [...serieItem.episodios] : [];
  let found = false;
  for (let i = 0; i < eps.length; i++) {
    if (Number(eps[i].season) === Number(season) && Number(eps[i].episode) === Number(episode)) {
      eps[i] = {
        ...eps[i],
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
  if (idx >= 0) moviesDB[idx] = updated;
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
    const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 28));
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
      return res.json(buscarLocal(termino, type, page, limit));
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
    const source_id = req.query.source_id || DEFAULT_SOURCE;
    const tipo = req.query.tipo || "Serie";
    const loadPlayers = req.query.players === "1"; // opcional: cargar players del 1er ep

    let item = null;
    try {
      item = await obtenerDetalle({ link, postId, slug, source_id, tipo });
    } catch (err) {
      console.warn("episodios detalle:", err.message);
    }

    if (!item || !Array.isArray(item.episodios) || !item.episodios.length) {
      return res.json({ temporadas: [1], seasonActual: season, episodios: [] });
    }

    let eps = item.episodios.filter((e) => Number(e.season) === season);
    if (!eps.length) {
      // si no hay season match, devolver todos de esa temporada si season=1 y hay eps sin season
      eps = item.episodios.filter((e) => !e.season || Number(e.season) === season);
    }

    const id = parseIdentidad(item) || {
      sourceId: String(item.source_id || source_id),
      slug: item.slug || slug,
      kind: (item.tipo === "Anime" || tipo === "Anime") ? "anime" : "serie",
    };

    // Si piden players o el primer ep no tiene embeds, cargar el primero
    if (eps.length && (loadPlayers || !eps[0].embeds?.length)) {
      try {
        const epNum = eps[0].episode || 1;
        const det = await obtenerEpisodio(id.sourceId, id.slug, season, epNum, id.kind);
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
    });
  } catch (err) {
    console.error("/api/episodios", err.message);
    res.status(500).json({ error: "No se pudieron cargar los episodios", detalle: err.message });
  }
});

/** Players de un capítulo: carga API → guarda en Supabase → responde */
app.get("/api/capitulo", async (req, res) => {
  try {
    const sourceId = req.query.source_id || DEFAULT_SOURCE;
    const slug = req.query.slug;
    const link = req.query.link || null;
    const tipo = req.query.tipo || "Serie";
    const temporada = parseInt(req.query.temporada || req.query.season) || 1;
    const episodio = parseInt(req.query.episodio || req.query.episode) || 1;
    if (!slug && !link) return res.status(400).json({ error: "Falta slug o link" });

    // 1) ¿Ya está en Supabase (dentro de la serie)?
    let serie = null;
    try {
      serie = await obtenerDetalle({ link, slug, source_id: sourceId, tipo, force: false });
    } catch (_) {}

    if (serie && Array.isArray(serie.episodios)) {
      const cached = serie.episodios.find(
        (e) => Number(e.season) === temporada && Number(e.episode) === episodio && e.embeds?.length
      );
      if (cached) {
        return res.json({
          season: temporada,
          episode: episodio,
          embeds: mapEmbeds(cached.embeds),
          downloads: cached.downloads || cached.descargas || [],
          reproductor: cached.video || cached.reproductor || null,
          from: "supabase",
        });
      }
    }

    // 2) API
    const kind = (tipo === "Anime" || serie?.tipo === "Anime") ? "anime" : "serie";
    const resolvedSlug = slug || serie?.slug;
    if (!resolvedSlug) return res.status(400).json({ error: "Falta slug" });

    const det = await obtenerEpisodio(sourceId, resolvedSlug, temporada, episodio, kind, serie);
    const embeds = mapEmbeds(det.embeds);

    // 3) Guardar en Supabase
    if (serie && embeds.length) {
      await guardarPlayersEpisodio(serie, temporada, episodio, embeds, det.reproductor);
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
