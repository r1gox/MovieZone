/**
 * MOVIEZONE v2 — Backend sin scraping
 * Fuente de datos: https://moviezone.tvjz.workers.dev/
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
let moviesDB = [];
let knownLinks = new Set();

async function cargarDatosSupabase() {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from("movies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    moviesDB = (data || []).map(normalizeItemFromDB).filter(Boolean);
    knownLinks = new Set(moviesDB.map((i) => i.link).filter(Boolean));
    console.log(`Supabase DB cargada: ${moviesDB.length} items`);
  } catch (err) {
    console.error("No se pudo cargar desde Supabase:", err.message);
    moviesDB = [];
    knownLinks = new Set();
  }
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
    .filter((item) => item.link)
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
      const episodiosFinal =
        item.episodios?.length ? item.episodios : (existente?.episodios || []);
      const descripcionFinal =
        item.descripcion && String(item.descripcion).length > 20
          ? item.descripcion
          : (existente?.descripcion || item.descripcion || null);
      return {
        link: item.link,
        nombre: nombre || existente?.nombre || null,
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

function limpiarTitulo(titulo) {
  return String(titulo || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
        return {
          url,
          idioma: e.idioma || e.lang || null,
          servidor: e.servidor || e.server || e.name || null,
          calidad: e.calidad || e.quality || null,
        };
      }
      return null;
    })
    .filter(Boolean);

  // Vimeos / MovieZone siempre primero
  mapped.sort((a, b) => {
    const aV = /vimeos/i.test(a.url || "") || /vimeos|moviezone/i.test(a.servidor || "");
    const bV = /vimeos/i.test(b.url || "") || /vimeos|moviezone/i.test(b.servidor || "");
    return (bV ? 1 : 0) - (aV ? 1 : 0);
  });
  return mapped;
}

/** Título normalizado para deduplicar entre fuentes */
function normalizeTitleKey(titulo) {
  return String(titulo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(\d{4}\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Puntúa un item por cantidad de datos útiles (portada, rating, descripción, players…) */
function scoreItem(item) {
  if (!item) return 0;
  let s = 0;
  if (item.portada) s += 3;
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
  if (item.slug) s += 1;
  return s;
}

/** Deduplica lista de resultados de búsqueda/listado eligiendo el más completo por título */
function dedupeListItems(lista) {
  const map = new Map();
  for (const item of lista || []) {
    const key = normalizeTitleKey(item.nombre || item.titulo) || item.link || item.slug || String(Math.random());
    const prev = map.get(key);
    if (!prev || scoreItem(item) > scoreItem(prev)) {
      // Si el previo tenía players y el nuevo no, fusionar flags útiles
      if (prev && prev.tiene_player && !item.tiene_player) {
        item.tiene_player = true;
        if (!item.embeds?.length && prev.embeds?.length) item.embeds = prev.embeds;
        if (!item.reproductor && prev.reproductor) item.reproductor = prev.reproductor;
      }
      // Preferir portada/rating del mejor
      if (prev) {
        if (!item.portada && prev.portada) item.portada = prev.portada;
        if (!item.calificacion && prev.calificacion) item.calificacion = prev.calificacion;
        if (!item.descripcion && prev.descripcion) item.descripcion = prev.descripcion;
      }
      map.set(key, item);
    } else if (prev) {
      // Enriquecer el ganador con datos del perdedor
      if (!prev.portada && item.portada) prev.portada = item.portada;
      if (!prev.calificacion && item.calificacion) prev.calificacion = item.calificacion;
      if (!prev.descripcion && item.descripcion) prev.descripcion = item.descripcion;
      if (!prev.tiene_player && item.tiene_player) prev.tiene_player = true;
    }
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
    } else if (k === "portada" && !cur) {
      out[k] = v;
    }
  }
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
    nombre: row.nombre || row.titulo || "Sin título",
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

/** Resultado de listado / search → item ligero */
function mapListItem(r) {
  const titulo = limpiarTitulo(r.titulo || r.title || r.nombre || "Sin título");
  const tipo = normalizarTipo(r.tipo || r.type);
  const slug = r.slug || null;
  const sourceId = String(r.source_id || r.fuente || DEFAULT_SOURCE);
  const year = extraerAnio(titulo, r.year);
  const portada = r.portada || r.poster || null;
  const link =
    r.link ||
    r.url ||
    (r.url_extract
      ? r.url_extract
      : slug
        ? `${API_BASE}/${sourceId}/${tipo === "Serie" || tipo === "Anime" ? "serie" : "pelicula"}/${slug}`
        : null);

  return {
    id: r.postId || r.id || `${sourceId}-${slug || titulo}`,
    postId: r.postId || null,
    nombre: titulo,
    titulo_original: r.titulo_original || null,
    slug,
    tipo,
    descripcion: r.descripcion || "",
    portada,
    backdrop: r.backdrop || null,
    year,
    genero: r.genero || null,
    idiomas: r.idiomas || [],
    calidad: r.calidad || [],
    calificacion: r.calificacion || r.rating || null,
    calificacion_comunidad: null,
    votos: null,
    fecha_estreno: r.fecha_estreno || null,
    duracion: null,
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
  if (Array.isArray(data.temporadas) && data.temporadas.length) {
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
    descripcion: data.descripcion || fallback.descripcion || "",
    portada: data.portada || fallback.portada || null,
    backdrop: data.backdrop || null,
    year: extraerAnio(titulo, data.year || fallback.year),
    genero: data.genero || null,
    idiomas: data.idiomas || [],
    calidad: data.calidad || [],
    calificacion: data.calificacion || null,
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
    total_temporadas: data.total_temporadas || null,
    total_episodios: data.total_episodios || null,
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
    return { resultados: locales, total: locales.length, page: 1, limit, source: "local" };
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
  const q = encodeURIComponent(termino.trim());
  const data = await apiGet(`/search?q=${q}`);
  let lista = (data.resultados || []).map(mapListItem);

  // Deduplicar: la API busca en 3 fuentes y puede devolver el mismo título 2-3 veces.
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
      return mergeItems(item, {
        tiene_player: local.tiene_player,
        embeds: local.embeds,
        reproductor: local.reproductor,
        descripcion: local.descripcion,
        calificacion: local.calificacion,
        portada: local.portada || item.portada,
        downloads: local.downloads,
        episodios: local.episodios,
      });
    }
    return item;
  });

  // Ordenar: primero los que ya tienen player / más datos
  lista.sort((a, b) => scoreItem(b) - scoreItem(a));

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

  // API extract URL
  let m = link.match(/\/(\d)\/(pelicula|serie|anime)\/([^/?#]+)/i);
  if (m) {
    return { sourceId: m[1], kind: m[2].toLowerCase(), slug: m[3] };
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

  // 1) Memoria local
  if (link) {
    const local = moviesDB.find((m) => m.link === link);
    if (local) cached = normalizeItemFromDB(local);
  }
  if (!cached && slug) {
    const local = moviesDB.find((m) => m.slug === slug || (m.link && m.link.includes(slug)));
    if (local) cached = normalizeItemFromDB(local);
  }

  // 2) Supabase (persistente entre cold starts de Vercel)
  if (!cached || force) {
    const fromDb = await buscarEnSupabase({ link, slug, postId });
    if (fromDb) {
      cached = mergeItems(cached, fromDb);
      const idx = moviesDB.findIndex((m) => m.link === fromDb.link);
      if (idx >= 0) moviesDB[idx] = cached;
      else moviesDB.unshift(cached);
    }
  }

  // Si ya tenemos contenido válido (players o episodios) y descripción, y no force → devolver
  const tieneDesc = cached && cached.descripcion && String(cached.descripcion).length > 20;
  const tieneContenido = cached && (itemTieneContenidoValido(cached) || (cached.episodios && cached.episodios.length));
  if (!force && cached && tieneContenido && tieneDesc) {
    return cached;
  }

  // 3) API externa — probar fuente principal y, si hace falta, las otras 2
  const id = parseIdentidad({ link, slug, source_id: source_id || cached?.source_id, tipo: tipo || cached?.tipo });
  if (!id) {
    if (cached) return cached;
    if (postId) {
      const local = moviesDB.find((m) => String(m.postId) === String(postId));
      if (local) return normalizeItemFromDB(local);
    }
    throw new Error("No se pudo identificar la película/serie");
  }

  const sourcesToTry = [String(id.sourceId)];
  for (const s of ["3", "1", "2"]) {
    if (!sourcesToTry.includes(s)) sourcesToTry.push(s);
  }

  let best = null;
  for (const sid of sourcesToTry) {
    const candidate = await fetchDetailFromSource(sid, id.kind, id.slug, {
      link,
      slug: id.slug,
      source_id: sid,
      tipo: tipo || cached?.tipo,
      nombre: cached?.nombre,
      portada: cached?.portada,
      descripcion: cached?.descripcion,
      year: cached?.year,
      postId: postId || cached?.postId,
    });
    if (!candidate) continue;
    best = best ? (scoreItem(candidate) > scoreItem(best) ? mergeItems(candidate, best) : mergeItems(best, candidate)) : candidate;
    // Si ya tiene players + descripción, no hace falta seguir buscando en más fuentes
    if (itemTieneContenidoValido(best) && best.descripcion && String(best.descripcion).length > 20) {
      break;
    }
  }

  if (!best) {
    if (cached) return cached;
    throw new Error("Sin datos del detalle");
  }

  // Fusionar con cache para no perder datos previos
  best = mergeItems(cached, best);
  if (!best.slug) best.slug = id.slug;
  if (!best.slug && best.link) {
    const m = String(best.link).match(/\/(?:serie|anime|pelicula|series|animes|peliculas)\/([^/?#]+)/i);
    if (m) best.slug = m[1];
  }

  best.tiene_player = itemTieneContenidoValido(best) || !!(best.episodios && best.episodios.length);

  // Guardar SIEMPRE metadatos + players para la próxima carga
  await guardarEnSupabase([best]);
  return best;
}

async function obtenerEpisodio(sourceId, slug, temporada, episodio, kind = "serie") {
  const kinds = kind === "anime" ? ["anime", "serie"] : ["serie", "anime"];
  const sources = [String(sourceId || DEFAULT_SOURCE)];
  for (const s of ["3", "1", "2"]) {
    if (!sources.includes(s)) sources.push(s);
  }
  let lastErr = null;
  let best = null;
  for (const sid of sources) {
    for (const k of kinds) {
      try {
        const path = `/${sid}/${k}/${slug}/${temporada}/${episodio}`;
        const data = await apiGet(path);
        if (!data || data.success === false) continue;
        const mapped = mapDetail(data, {
          slug,
          source_id: sid,
          tipo: k === "anime" ? "Anime" : "Serie",
        });
        if (!best || scoreItem(mapped) > scoreItem(best)) {
          best = best ? mergeItems(best, mapped) : mapped;
        }
        if (itemTieneContenidoValido(best)) return best;
      } catch (err) {
        lastErr = err;
      }
    }
  }
  if (best) return best;
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
    let all = dedupeListItems([...apiItems, ...locales]);
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
      return res.json(buscarLocal(termino, type, page, limit));
    }

    try {
      const data = await buscarOnline(termino, page, limit);
      return res.json(data);
    } catch (err) {
      console.warn("Búsqueda online falló, usando local:", err.message);
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
    const sb = getSupabase();
    if (!sb) {
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
    const resultados = (data || []).map((row) => normalizeItemFromDB(row)).filter(Boolean);
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
          reproductor: cached.video || cached.reproductor || null,
          from: "supabase",
        });
      }
    }

    // 2) API
    const kind = (tipo === "Anime" || serie?.tipo === "Anime") ? "anime" : "serie";
    const resolvedSlug = slug || serie?.slug;
    if (!resolvedSlug) return res.status(400).json({ error: "Falta slug" });

    const det = await obtenerEpisodio(sourceId, resolvedSlug, temporada, episodio, kind);
    const embeds = mapEmbeds(det.embeds);

    // 3) Guardar en Supabase
    if (serie && embeds.length) {
      await guardarPlayersEpisodio(serie, temporada, episodio, embeds, det.reproductor);
    }

    res.json({
      season: temporada,
      episode: episodio,
      embeds,
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
  });
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
