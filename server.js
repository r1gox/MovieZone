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

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

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
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      console.warn("Supabase no configurado (faltan SUPABASE_URL / SUPABASE_KEY)");
      return;
    }
    const { data, error } = await supabase
      .from("movies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    moviesDB = data || [];
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
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return;

  const paraInsertarRaw = items
    .filter((item) => item.link)
    .map((item) => {
      let nombre = item.nombre || null;
      if (nombre && (item.tipo === "Serie" || item.tipo === "Anime")) {
        nombre = nombre
          .replace(/\s*[-–—]\s*(Temporada|Season|Episodio|Episode|Capítulo|Capitulo).*$/i, "")
          .trim();
      }
      return {
        link: item.link,
        nombre,
        titulo_original: item.titulo_original || null,
        portada: item.portada || null,
        backdrop: item.backdrop || null,
        descripcion: item.descripcion || null,
        year: item.year || null,
        genero: item.genero || null,
        tipo: item.tipo || "Película",
        idiomas: item.idiomas || [],
        calidad: item.calidad || [],
        paises: item.paises || [],
        calificacion: item.calificacion || null,
        calificacion_comunidad: item.calificacion_comunidad || null,
        votos: item.votos ? Math.trunc(Number(item.votos)) || null : null,
        fecha_estreno: item.fecha_estreno || null,
        duracion: item.duracion ? Math.trunc(Number(item.duracion)) || null : null,
        certificacion: item.certificacion || null,
        ultimo_episodio: item.ultimo_episodio || null,
        reproductor: item.reproductor || null,
        embeds: item.embeds || [],
        downloads: item.downloads || [],
        solo_trailer: !!item.soloTrailer,
        episodios: item.episodios || [],
        temporadas: item.temporadas || [],
        postId: item.postId || null,
        slug: item.slug || null,
        source_id: item.source_id || null,
        tiene_player: itemTieneContenidoValido(item),
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
    const { error } = await supabase.from("movies").upsert(paraInsertar, { onConflict: "link" });
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
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (typeof e === "string") return { url: e, idioma: null, servidor: null };
      if (e && e.url) {
        return {
          url: e.url,
          idioma: e.idioma || null,
          servidor: e.servidor || null,
        };
      }
      return null;
    })
    .filter(Boolean);
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
  const reproductor = embedsArr[0]?.url || data.reproductor || null;

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
    downloads: data.descargas || data.downloads || [],
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
    const lista = (data.resultados || []).map(mapListItem).slice(0, limit);
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
      .slice(0, limit);
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

  // Paginación simple en memoria
  const total = lista.length;
  const start = (page - 1) * limit;
  lista = lista.slice(start, start + limit);

  guardarEnSupabase(lista).catch(() => {});
  return { resultados: lista, total, page, limit, source: "online" };
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

async function obtenerDetalle(params) {
  const { link, postId, source_id, slug, tipo } = params;

  // 1) Cache Supabase
  if (link) {
    const local = moviesDB.find((m) => m.link === link);
    if (local && itemTieneContenidoValido(local)) {
      return local;
    }
  }

  // 2) Resolver identidad y llamar API
  const id = parseIdentidad({ link, slug, source_id, tipo });
  if (!id) {
    // Intentar por postId en memoria
    if (postId) {
      const local = moviesDB.find((m) => String(m.postId) === String(postId));
      if (local) return local;
    }
    throw new Error("No se pudo identificar la película/serie");
  }

  const path = `/${id.sourceId}/${id.kind}/${id.slug}`;
  const data = await apiGet(path);
  if (!data || data.success === false) {
    throw new Error(data?.error || "Sin datos del detalle");
  }

  const item = mapDetail(data, { link, slug: id.slug, source_id: id.sourceId, tipo });
  // Asegurar link estable
  if (!item.link) item.link = data.link || `${API_BASE}${path}`;

  await guardarEnSupabase([item]);
  return item;
}

async function obtenerEpisodio(sourceId, slug, temporada, episodio) {
  const path = `/${sourceId}/serie/${slug}/${temporada}/${episodio}`;
  const data = await apiGet(path);
  return mapDetail(data, { slug, source_id: sourceId, tipo: "Serie" });
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

app.get("/api/catalogo", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));
    // Películas: preferimos estrenos (y si hace falta populares)
    const data = await obtenerEstrenos("peliculas", limit * page);
    const all = data.resultados || [];
    const start = (page - 1) * limit;
    res.json({
      resultados: all.slice(start, start + limit),
      page,
      limit,
      total: data.total || all.length,
    });
  } catch (err) {
    console.error("/api/catalogo", err.message);
    res.status(500).json({ error: "No se pudo cargar el catálogo", resultados: [] });
  }
});

app.get("/api/series", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));
    const data = await obtenerEstrenos("series", limit * page);
    const all = data.resultados || [];
    const start = (page - 1) * limit;
    res.json({
      resultados: all.slice(start, start + limit),
      page,
      limit,
      total: data.total || all.length,
    });
  } catch (err) {
    console.error("/api/series", err.message);
    res.status(500).json({ error: "No se pudieron cargar las series", resultados: [] });
  }
});

app.get("/api/animes", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(12, parseInt(req.query.limit) || 24));
    const data = await obtenerEstrenos("animes", limit * page);
    const all = data.resultados || [];
    const start = (page - 1) * limit;
    res.json({
      resultados: all.slice(start, start + limit),
      page,
      limit,
      total: data.total || all.length,
    });
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
    if (!process.env.SUPABASE_URL) {
      return res.json({ resultados: moviesDB.slice(0, limit) });
    }
    const { data, error } = await supabase
      .from("movies")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ resultados: data || [] });
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

    const item = await obtenerDetalle({ link, postId, slug, source_id, tipo });
    res.json(item);
  } catch (err) {
    console.error("/api/detalle", err.message);
    res.status(500).json({ error: "No se pudo cargar el detalle", detalle: err.message });
  }
});

app.get("/api/episodios", async (req, res) => {
  try {
    const postId = req.query.postId;
    const season = parseInt(req.query.season) || 1;
    const link = req.query.link || null;
    const slug = req.query.slug || null;
    const source_id = req.query.source_id || DEFAULT_SOURCE;

    // Preferir detalle completo (ya trae temporadas/episodios)
    let item = null;
    try {
      item = await obtenerDetalle({ link, postId, slug, source_id, tipo: "Serie" });
    } catch (_) {}

    if (item && Array.isArray(item.episodios) && item.episodios.length) {
      const eps = item.episodios.filter((e) => Number(e.season) === season);
      // Cargar players del primer episodio si faltan (lazy)
      if (eps.length && !eps[0].embeds?.length && eps[0].url_video) {
        try {
          const id = parseIdentidad(item);
          if (id) {
            const det = await obtenerEpisodio(id.sourceId, id.slug, season, eps[0].episode || 1);
            if (det.embeds?.length) {
              eps[0].embeds = det.embeds;
              eps[0].video = det.reproductor;
            }
          }
        } catch (_) {}
      }
      return res.json({
        temporadas: item.temporadas?.length ? item.temporadas : [season],
        seasonActual: season,
        episodios: eps,
      });
    }

    // Fallback vacío
    res.json({ temporadas: [1], seasonActual: season, episodios: [] });
  } catch (err) {
    console.error("/api/episodios", err.message);
    res.status(500).json({ error: "No se pudieron cargar los episodios", detalle: err.message });
  }
});

/** Endpoint auxiliar: players de un capítulo concreto */
app.get("/api/capitulo", async (req, res) => {
  try {
    const sourceId = req.query.source_id || DEFAULT_SOURCE;
    const slug = req.query.slug;
    const temporada = parseInt(req.query.temporada || req.query.season) || 1;
    const episodio = parseInt(req.query.episodio || req.query.episode) || 1;
    if (!slug) return res.status(400).json({ error: "Falta slug" });
    const item = await obtenerEpisodio(sourceId, slug, temporada, episodio);
    res.json(item);
  } catch (err) {
    console.error("/api/capitulo", err.message);
    res.status(500).json({ error: "No se pudo cargar el capítulo" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "MovieZone",
    api: API_BASE,
    supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY),
    items: moviesDB.length,
  });
});

// ---------- Frontend estático ----------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get(["/peliculas", "/series", "/animes", "/"], (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

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
