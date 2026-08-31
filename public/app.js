// ======================================================
// MOVIEZONE — app.js (adaptado al template "Cypher")
// ======================================================

import { initWakeupNotice } from './js/ui/wakeup.js';
import { getCatalog, searchCatalog } from './js/data/catalogo.js';

const LIMIT = 48;

// Estado de paginación
let gridTotalItems = 0;
let gridTotalPages = 1;

const PLACEHOLDER = "https://via.placeholder.com/300x450/0a0611/ffffff?text=Sin+portada";

// ---------- Elementos ----------
const homeView = document.getElementById("home-view");
const gridView = document.getElementById("grid-view");
const detailsPanel = document.getElementById("details-panel");
const detailsEmpty = document.getElementById("details-empty");
const detailsContent = document.getElementById("details-content");

const searchInput = document.getElementById("search-input");
const searchForm = document.getElementById("search-form");
const statusBadge = document.getElementById("status-badge");


/** Rating con fuente: "IMDb 6.7" / "TMDB 8.8" */
function ratingInfo(item) {
    if (!item) return { label: "—", value: null, source: null, secondary: null };
    const imdbR = item.imdb && item.imdb.rating != null ? Number(item.imdb.rating) : null;
    const tmdbR = item.tmdb && item.tmdb.rating != null ? Number(item.tmdb.rating) : null;
    const omdbR = item.omdb && item.omdb.rating != null ? Number(item.omdb.rating) : null;
    const mainRaw = item.rating != null ? item.rating : (item.calificacion != null ? item.calificacion : null);
    const main = mainRaw != null ? Number(mainRaw) : null;

    let primary;
    if (imdbR != null && imdbR > 0) primary = { label: "IMDb " + imdbR.toFixed(1), value: imdbR, source: "imdb" };
    else if (omdbR != null && omdbR > 0) primary = { label: "IMDb " + omdbR.toFixed(1), value: omdbR, source: "omdb" };
    else if (tmdbR != null && tmdbR > 0) primary = { label: "TMDB " + tmdbR.toFixed(1), value: tmdbR, source: "tmdb" };
    else if (main != null && !isNaN(main) && main > 0) primary = { label: main.toFixed(1), value: main, source: "fuente" };
    else primary = { label: "—", value: null, source: null };

    let secondary = null;
    if (primary.source === "imdb" && tmdbR != null && tmdbR > 0) secondary = "TMDB " + tmdbR.toFixed(1);
    else if (primary.source === "tmdb" && imdbR != null && imdbR > 0) secondary = "IMDb " + imdbR.toFixed(1);
    return Object.assign({ secondary: secondary }, primary);
}

function ratingBadgeHtml(item) {
    const r = ratingInfo(item);
    if (!r.value) {
        return '<div class="rating-badge rating-empty"><ion-icon name="star-outline"></ion-icon> —</div>';
    }
    const srcClass = r.source ? (" rating-src-" + r.source) : "";
    // Solo una fuente: IMDb preferido (ratingInfo ya lo elige)
    return (
        '<div class="rating-badge' + srcClass + '" title="' + escapeHtml(r.label) + '">' +
        '<ion-icon name="star"></ion-icon> ' +
        '<span class="rating-main">' + escapeHtml(r.label) + "</span>" +
        "</div>"
    );
}


/** Rellena meta del panel de detalle (rating IMDb preferido, géneros, duración, cert, votos, título original) */
function rellenarMetaDetalle(item) {
    if (!item) return;

    const originalEl = document.getElementById("details-original-title");
    if (originalEl) {
        const orig = item.titulo_original || (item.tmdb && item.tmdb.titulo) || null;
        const mainTitle = String(item.nombre || item.titulo || "").trim().toLowerCase();
        if (orig && String(orig).trim() && String(orig).trim().toLowerCase() !== mainTitle) {
            originalEl.textContent = orig;
            originalEl.style.display = "block";
        } else {
            originalEl.textContent = "";
            originalEl.style.display = "none";
        }
    }

    const yearEl = document.getElementById("details-year");
    if (yearEl) yearEl.textContent = item.year || "—";

    // Rating: SOLO IMDb si hay; si no, el otro. No mostrar ambos.
    const ri = ratingInfo(item);
    const ratingEl = document.getElementById("details-rating");
    const ratingWrap = document.getElementById("details-rating-wrap") || (ratingEl && ratingEl.closest(".meta-item"));
    if (ratingEl) {
        ratingEl.textContent = ri.value != null ? ri.label : "—";
        ratingEl.title = (ri.source === "imdb" || ri.source === "omdb")
            ? "Calificación IMDb"
            : (ri.source === "tmdb" ? "Calificación TMDB" : "");
    }
    if (ratingWrap) {
        ratingWrap.classList.remove("rating-src-imdb", "rating-src-tmdb", "rating-src-omdb", "rating-src-fuente", "hidden");
        if (ri.source) ratingWrap.classList.add("rating-src-" + ri.source);
        if (ri.value == null) ratingWrap.classList.add("hidden");
    }

    // Duración
    const durEl = document.getElementById("details-duration");
    const durWrap = document.getElementById("details-duration-wrap");
    let durTxt = item.duracion_texto || null;
    if (!durTxt && item.imdb && item.imdb.duracion_texto) durTxt = item.imdb.duracion_texto;
    if (!durTxt && item.tmdb && item.tmdb.duracion_texto) durTxt = item.tmdb.duracion_texto;
    if (!durTxt && item.duracion) {
        const m = Number(item.duracion);
        if (m >= 60) {
            const h = Math.floor(m / 60);
            const mins = m % 60;
            durTxt = mins ? (h + "h " + mins + "min") : (h + "h");
        } else if (m > 0) durTxt = m + " min";
    }
    if (durEl) durEl.textContent = durTxt || "—";
    if (durWrap) {
        if (durTxt) durWrap.classList.remove("hidden");
        else durWrap.classList.add("hidden");
    }

    // Certificación
    const certEl = document.getElementById("details-cert");
    const certWrap = document.getElementById("details-cert-wrap");
    const cert = item.certificacion || (item.imdb && item.imdb.certificacion) || (item.tmdb && item.tmdb.certificacion) || null;
    if (certEl) certEl.textContent = cert || "—";
    if (certWrap) {
        if (cert) certWrap.classList.remove("hidden");
        else certWrap.classList.add("hidden");
    }

    // Votos (preferir IMDb)
    const votosEl = document.getElementById("details-votes");
    const votosWrap = document.getElementById("details-votes-wrap");
    let votosRaw = (item.imdb && item.imdb.votos) || item.votos || (item.tmdb && item.tmdb.votos) || null;
    let votosLabel = null;
    if (votosRaw) {
        const n = Number(String(votosRaw).replace(/[^\d]/g, ""));
        if (Number.isFinite(n) && n > 0) {
            if (n >= 1000000) votosLabel = (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M votos";
            else if (n >= 1000) votosLabel = (n / 1000).toFixed(1).replace(/\.0$/, "") + "k votos";
            else votosLabel = n + " votos";
        } else {
            votosLabel = String(votosRaw) + " votos";
        }
    }
    if (votosEl) votosEl.textContent = votosLabel || "—";
    if (votosWrap) {
        if (votosLabel) votosWrap.classList.remove("hidden");
        else votosWrap.classList.add("hidden");
    }

    // Géneros: todos
    const generosEl = document.getElementById("details-genres");
    if (generosEl) {
        generosEl.innerHTML = "";
        let lista = [];
        if (Array.isArray(item.generos) && item.generos.length) {
            lista = item.generos.map(function (g) { return String(g).trim(); }).filter(Boolean);
        } else if (item.genero) {
            lista = String(item.genero).split(",").map(function (g) { return g.trim(); }).filter(Boolean);
        } else if (item.imdb && Array.isArray(item.imdb.generos) && item.imdb.generos.length) {
            lista = item.imdb.generos;
        } else if (item.tmdb && Array.isArray(item.tmdb.generos) && item.tmdb.generos.length) {
            lista = item.tmdb.generos;
        }
        const seen = {};
        lista.forEach(function (g) {
            const k = g.toLowerCase();
            if (seen[k]) return;
            seen[k] = true;
            generosEl.innerHTML += '<span class="genre-tag">' + escapeHtml(g) + "</span>";
        });
        if (item.idiomas && item.idiomas.length) {
            generosEl.innerHTML += '<span class="genre-tag genre-tag-extra">' + escapeHtml(item.idiomas.join(", ")) + "</span>";
        }
        if (item.calidad && item.calidad.length) {
            generosEl.innerHTML += '<span class="genre-tag genre-tag-extra">' + escapeHtml(item.calidad.join(", ")) + "</span>";
        }
    }

    const extra = document.getElementById("details-meta-extra");
    if (extra) extra.remove();
}





const resultsGrid = document.getElementById("results-grid");
const resultsTitle = document.getElementById("results-title");
const resultsCount = document.getElementById("results-count");
const resultsLoading = document.getElementById("results-loading");
const resultsEmpty = document.getElementById("results-empty");
const scrollSentinel = document.getElementById("scroll-sentinel");

const heroTitle = document.getElementById("hero-title");
const heroType = document.getElementById("hero-type");
const heroRating = document.getElementById("hero-rating");
const heroYear = document.getElementById("hero-year");
const heroSynopsis = document.getElementById("hero-synopsis");
const heroDots = document.getElementById("hero-dots");
const heroPlayBtn = document.getElementById("hero-play-btn");
const heroInfoBtn = document.getElementById("hero-info-btn");

// ---------- Estado ----------
let seleccionActual = null;
let vistaActual = "home"; // home | grid
let gridModo = "categoria"; // categoria | search | favoritos
let gridSeccion = "movie";
let gridTermino = "";
let gridPage = 1;
let gridCargando = false;
let gridSinMasResultados = false;
let gridSort = "recent";       // recent | rating | az
let gridTypeFilter = "all";    // all | movie | series | anime
let heroItems = [];
let heroIndex = 0;
let heroTimer = null;

// ======================================================
// FAVORITOS (localStorage)
// ======================================================
function obtenerFavoritos() {
    try { return JSON.parse(localStorage.getItem("moviezone_favoritos") || "[]"); }
    catch { return []; }
}
function guardarFavoritos(lista) {
    localStorage.setItem("moviezone_favoritos", JSON.stringify(lista));
}
function esFavorito(link) {
    return obtenerFavoritos().some(f => f.link === link);
}
function toggleFavoritoItem(item) {
    let favoritos = obtenerFavoritos();
    const existe = favoritos.findIndex(f => f.link === item.link);
    if (existe >= 0) {
        favoritos.splice(existe, 1);
    } else {
        favoritos.unshift(item);
    }
    guardarFavoritos(favoritos);
    return existe < 0; // true si quedó agregado
}

// ======================================================
// UTILIDADES
// ======================================================
function escapeHtml(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function tipoLabel(tipo) {
    if (tipo === "Serie") return "Serie";
    if (tipo === "Anime") return "Anime";
    return "Película";
}

const REPRODUCTORES_PERMITIDOS = [
    "vimeos.net", "player.vimeos", "goodstream", "streamwish", "filemoon",
    "voe.sx", "voe.", "doodstream", "dood.", "ds2play", "dsvplay", "doods.pro",
    "streamtape", "mixdrop", "upstream", "vidmoly", "mp4upload", "uqload",
    "vidhide", "vidguard", "lulustream", "filelions", "yourupload",
    "supervideo", "krakenfiles", "ok.ru",
    "zilla-networks", "mega.nz", "mega.co", "mega.io",
    // animeav1 / latino frecuentes
    "hls.", "upnshare", "upns", "waaw.", "hqq.", "netu.", "vizcloud",
    "mycloud", "vidplay", "megaf", "pixeldrain", "burstcloud", "streamhub",
    "doodcdn", "voe.sx", "jilliandescribe",
    // aliases / mirrors frecuentes de la API
    "streamhg", "flaswish", "strwish", "ahvsh", "earnvids", "smoothpre",
    "callistanise", "wish", "vidhidepro", "luluvid",
    "filemoon.", "moon.", "streamvid", "rutube", "vk.com", "vk.ru",
    "iframe.", "embed.", "player.", "stream.", "cdn."
];

const REPRODUCTORES_BLOQUEADOS = [
    "sblongvu", "sblanh", "sbfull", "sbfast", "sbthe", "sbanh",
    "lvturbo", "diasfem", "fembed", "4shared",
    "youtube.com", "youtu.be", "play.php", "example.com", "hackstore.fo"
    // NO bloquear lamovie.org embeds si aparecen; solo meta JSON del worker
];

/** URL de la API del worker (detalle/capítulo) — NO es un iframe de video */
function esUrlApiWorker(url) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    // Endpoints de datos JSON del worker (al ponerlos en iframe sale el JSON crudo)
    if (/moviezone\.tvjz\.workers\.dev/i.test(u)) {
        // Resolver de stream sí es válido como API de play, pero no como iframe directo
        if (/\/(resolve|wish|goodstream|vidhide|voe)\//i.test(u)) return false;
        // /3/serie/slug/1/1 o /3/pelicula/slug → JSON, inválido como player
        if (/\/\d+\/(serie|anime|pelicula)\//i.test(u)) return true;
        if (/\/(serie|anime|pelicula)\//i.test(u)) return true;
        return true; // cualquier otra ruta del worker no es embed de video
    }
    return false;
}

function esEmbedInvalido(url) {
    if (!url) return true;
    const u = String(url).toLowerCase().trim();
    if (!/^https?:\/\//i.test(u) && !u.startsWith("//")) return true;
    if (esUrlApiWorker(u)) return true;
    if (REPRODUCTORES_BLOQUEADOS.some(d => u.includes(d))) return true;
    // Permitir cualquier https de host conocido O cualquier http(s) que no esté bloqueado
    if (REPRODUCTORES_PERMITIDOS.some(d => u.includes(d))) return false;
    try {
        const host = new URL(u.startsWith("//") ? "https:" + u : u).hostname;
        if (host && host.includes(".")) return false;
    } catch (_) {}
    return true;
}

function embedsValidosDe(episodio) {
    const raw = normalizarEmbeds(episodio?.embeds);
    const ok = raw.filter(e => e && e.url && !esEmbedInvalido(e.url));
    if (ok.length) return ok;
    // Si hay URLs pero el filtro las tumbó, devolverlas igual (mejor mostrar que decir "no disponible")
    const conUrl = raw.filter(e => e && e.url && /^https?:\/\//i.test(String(e.url)));
    return conUrl;
}


function normalizarEmbeds(raw) {
    if (!raw) return [];
    if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map(e => {
        if (typeof e === "string" && e.startsWith("http")) {
            if (esUrlApiWorker(e)) return null;
            return { url: e };
        }
        if (e && e.url) {
            if (esUrlApiWorker(e.url)) return null;
            return {
                ...e,
                url: e.url,
                server: e.server || e.servidor || e.name || null,
                servidor: e.servidor || e.server || e.name || null,
                idioma: e.idioma || e.lang || null,
                lang: e.lang || e.idioma || null,
                stream_url: e.stream_url || null,
            };
        }
        return null;
    }).filter(Boolean);
}

function itemTieneVideo(item) {
    const embedsValidos = normalizarEmbeds(item.embeds)
        .filter(e => e && e.url && !esEmbedInvalido(e.url));
    return (
        (item.reproductor && !esEmbedInvalido(item.reproductor)) ||
        embedsValidos.length > 0 ||
        (Array.isArray(item.episodios) && item.episodios.some(e =>
            (e.video && !esEmbedInvalido(e.video)) ||
            (Array.isArray(e.embeds) && e.embeds.some(em => em && em.url && !esEmbedInvalido(em.url)))
        ))
    );
}

// Mapa de dominios conocidos -> nombre bonito
const SERVIDORES_CONOCIDOS = {
    "goodstream.one": "GoodstreamOne", "goodstream.uno": "GoodstreamOne",
    "vimeos.net": "MovieZone",
    "voe.sx": "Voe",
    "doodstream.com": "Doodstream", "dood.to": "Doodstream", "dood.wf": "Doodstream", "dood.la": "Doodstream",
    "streamtape.com": "Streamtape",
    "streamwish.com": "StreamWish", "streamwish.to": "StreamWish", "streamhg.com": "StreamWish",
    "filemoon.sx": "Filemoon", "filemoon.to": "Filemoon",
    "mixdrop.co": "Mixdrop", "mixdrop.to": "Mixdrop",
    "vidhide.com": "VidHide", "vidhidepro.com": "VidHide",
    "vidguard.to": "VidGuard",
    "uqload.com": "Uqload",
    "streamsb.com": "StreamSB",
    "fembed.com": "Fembed",
    "upstream.to": "Upstream",
    "vidmoly.me": "Vidmoly", "vidmoly.to": "Vidmoly",
    "mp4upload.com": "Mp4Upload",
    "waaw.to": "Waaw", "netu.tv": "Waaw",
    "mega.nz": "Mega",
    "drive.google.com": "Google Drive",
    "mediafire.com": "Mediafire",
    "pixeldrain.com": "Pixeldrain",
    "1fichier.com": "1Fichier"
};

function detectarServidor(url, serverOriginal) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
    catch { return serverOriginal || "Servidor"; }

    for (const dominio in SERVIDORES_CONOCIDOS) {
        if (host === dominio || host.endsWith("." + dominio)) return SERVIDORES_CONOCIDOS[dominio];
    }
    const generico = ["online", "server", "servidor", ""].includes((serverOriginal || "").toLowerCase().trim());
    if (serverOriginal && !generico) return serverOriginal;

    const base = host.split(".")[0];
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Servidor";
}



// ======================================================
// NO ADS — stream directo vía worker (NO se guarda en Supabase)
// Prioridad: Vimeos → Streamwish → Goodstream → Vidhide → Voe
// ======================================================
const WORKER_STREAM = "https://moviezone.tvjz.workers.dev";

function rankFuenteNoAds(url) {
    const u = String(url || "").toLowerCase();
    if (u.includes("vimeos")) return 1;
    if (
        u.includes("streamwish") || u.includes("flaswish") ||
        u.includes("strwish") || u.includes("ahvsh") || u.includes("streamhg")
    ) return 2;
    if (u.includes("goodstream")) return 3;
    if (
        u.includes("vidhide") || u.includes("earnvids") ||
        u.includes("callistanise") || u.includes("smoothpre") ||
        u.includes("filelions")
    ) return 4;
    if (u.includes("voe") || u.includes("jilliandescribe")) return 5;
    return 99;
}

function streamUrlParaNoAds(embedUrl) {
    const r = rankFuenteNoAds(embedUrl);
    const q = encodeURIComponent(embedUrl);
    if (r === 1) return `${WORKER_STREAM}/resolve/vimeos?url=${q}&proxy=1`;
    if (r === 2) return `${WORKER_STREAM}/wish/streamurl?url=${q}`;
    if (r === 3) return `${WORKER_STREAM}/goodstream/streamurl?url=${q}`;
    if (r === 4) return `${WORKER_STREAM}/vidhide/streamurl?url=${q}`;
    if (r === 5) return `${WORKER_STREAM}/voe/streamurl?url=${q}`;
    return null;
}


/** Idioma de un embed/descarga */
function idiomaDeEmbed(e) {
    const t = `${e?.idioma || ""} ${e?.lang || ""} ${e?.language || ""}`.toLowerCase();
    if (/latino|castellano|español|\bdub\b|audio lat/.test(t)) return "lat";
    if (/sub|subtit/.test(t)) return "sub";
    return "otro";
}

let _idiomaPlayerActivo = "lat"; // preferir latino

function esIdiomaLatinoEmbed(e) {
    const t = `${e?.lang || ""} ${e?.idioma || ""} ${e?.language || ""}`.toLowerCase();
    return /latino|castellano|español|\bdub\b|audio lat/.test(t);
}

/** Elige UN solo embed: 1) Latino si hay 2) mejor host funcional (vimeos→wish→gs→vidhide→voe) */
function elegirEmbedNoAds(embeds) {
    if (!Array.isArray(embeds) || !embeds.length) return null;
    const candidatos = embeds.filter(e =>
        e && e.url && !e.noAds && !esEmbedInvalido(e.url) && rankFuenteNoAds(e.url) < 99
    );
    if (!candidatos.length) return null;

    const latinos = candidatos.filter(esIdiomaLatinoEmbed);
    const pool = latinos.length ? latinos : candidatos;

    let best = null;
    let bestRank = 99;
    for (const e of pool) {
        const rank = rankFuenteNoAds(e.url);
        if (rank < bestRank) {
            bestRank = rank;
            best = e;
        }
    }
    if (!best) return null;
    const streamApi = streamUrlParaNoAds(best.url);
    if (!streamApi) return null;
    return {
        url: best.url,
        stream_url: streamApi,
        server: "NO ADS",
        name: "NO ADS",
        noAds: true,
        lang: best.lang || best.idioma || (esIdiomaLatinoEmbed(best) ? "Latino" : ""),
        idioma: best.idioma || best.lang || "",
        sourceEmbed: best.url
    };
}


function attachStreamUrls(embeds) {
    if (!Array.isArray(embeds)) return [];
    return embeds.map((e) => {
        if (!e || !e.url) return e;
        if (e.noAds) return e;
        const su = e.stream_url || streamUrlParaNoAds(e.url);
        return su ? { ...e, stream_url: su } : { ...e };
    });
}

function insertarNoAdsEnLista(embeds) {
    const lista = Array.isArray(embeds) ? embeds.slice() : [];
    // quitar entradas NO ADS previas
    const limpia = lista.filter(e => !e || !e.noAds);
    const noAds = elegirEmbedNoAds(limpia);
    if (!noAds) return limpia;

    // MovieZone (vimeos) primero; NO ADS justo después
    const mzIdx = limpia.findIndex(e =>
        e && e.url && (/vimeos/i.test(e.url) || e.server === "MovieZone" || e.name === "MovieZone")
    );
    if (mzIdx >= 0) {
        limpia.splice(mzIdx + 1, 0, noAds);
    } else {
        limpia.unshift(noAds);
    }
    return limpia;
}

async function resolverPlayUrlNoAds(embed) {
    const api = embed.stream_url || streamUrlParaNoAds(embed.url || embed.sourceEmbed);
    if (!api) throw new Error("Sin stream_url NO ADS");
    const res = await fetch(api, { cache: "no-store" });
    const data = await res.json();
    if (!data || data.success === false) {
        throw new Error((data && data.error) || "No se pudo resolver NO ADS");
    }
    // Preferir play_url / proxy_url (ya filtrados activos en el worker)
    let play = data.play_url || data.proxy_url || null;
    if (!play && Array.isArray(data.qualities) && data.qualities.length) {
        const q720 = data.qualities.find(q => String(q.quality || "").includes("720"));
        play = (q720 && q720.proxy_url) || data.qualities[data.qualities.length - 1].proxy_url;
    }
    if (!play && data.url) {
        play = `${WORKER_STREAM}/proxy?url=${encodeURIComponent(data.url)}`;
    }
    if (!play) throw new Error("Sin URL reproducible");
    return play;
}

function ensurePlayerVideoEl() {
    let vid = document.getElementById("player-video");
    if (vid) return vid;
    const wrap = document.querySelector(".player-iframe-wrapper");
    if (!wrap) return null;
    vid = document.createElement("video");
    vid.id = "player-video";
    vid.className = "player-video hidden";
    vid.controls = true;
    vid.playsInline = true;
    vid.setAttribute("playsinline", "");
    vid.setAttribute("webkit-playsinline", "true");
    vid.setAttribute("x5-playsinline", "true");
    vid.setAttribute("x5-video-player-type", "h5");
    vid.setAttribute("x5-video-player-fullscreen", "false");
    vid.disablePictureInPicture = true;
    // No forzar fullscreen
    vid.addEventListener("webkitbeginfullscreen", (e) => {
        try { e.preventDefault(); } catch (_) {}
        try { if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (_) {}
    });
    wrap.appendChild(vid);
    return vid;
}

let _hlsInstance = null;
function destruirHls() {
    if (_hlsInstance) {
        try { _hlsInstance.destroy(); } catch (_) {}
        _hlsInstance = null;
    }
    const vid = document.getElementById("player-video");
    if (vid) {
        try { vid.pause(); vid.removeAttribute("src"); vid.load(); } catch (_) {}
        vid.classList.add("hidden");
    }
    if (playerIframe) playerIframe.classList.remove("hidden");
    mostrarBotonFullscreen(false);
}


function mostrarBotonFullscreen(mostrar) {
    const btn = document.getElementById("btn-fs-player");
    if (!btn) return;
    btn.classList.toggle("hidden", !mostrar);
    if (!mostrar) {
        // salir de FS si se oculta el botón
        salirPantallaCompletaPlayer();
    }
}

function actualizarIconoFs(enFs) {
    const icon = document.getElementById("btn-fs-player-icon");
    if (icon) icon.setAttribute("name", enFs ? "contract-outline" : "expand-outline");
}

function salirPantallaCompletaPlayer() {
    const box = document.getElementById("video-player-container");
    if (box) box.classList.remove("is-fullscreen");
    actualizarIconoFs(false);
    try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
    } catch (_) {}
}

async function togglePantallaCompletaPlayer() {
    const box = document.getElementById("video-player-container");
    const vid = document.getElementById("player-video");
    if (!box) return;

    // Preferir Fullscreen API del contenedor (funciona en desktop + muchos móviles)
    const enFs = !!(document.fullscreenElement || document.webkitFullscreenElement || box.classList.contains("is-fullscreen"));

    if (enFs) {
        salirPantallaCompletaPlayer();
        return;
    }

    try {
        if (box.requestFullscreen) await box.requestFullscreen();
        else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
        else if (vid && vid.webkitEnterFullscreen) {
            // iOS Safari: fullscreen nativo del video
            vid.webkitEnterFullscreen();
        } else {
            // Fallback CSS
            box.classList.add("is-fullscreen");
        }
        actualizarIconoFs(true);
    } catch (e) {
        // Fallback CSS si el navegador bloquea FS
        box.classList.add("is-fullscreen");
        actualizarIconoFs(true);
    }
}


async function reproducirHlsNoAds(playUrl, item) {
    destruirHls();
    const vid = ensurePlayerVideoEl();
    if (!vid) throw new Error("Sin elemento video");
    playerIframe.classList.add("hidden");
    playerIframe.src = "about:blank";
    vid.classList.remove("hidden");
    videoContainer.classList.remove("hidden");
    mostrarBotonFullscreen(true);
    playerTitle.textContent = (item?.nombre || "NO ADS")
        .split(" ").map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");

    // Siempre dentro del wrapper 16:9 (igual que los embeds)
    vid.playsInline = true;
    if (window.Hls && window.Hls.isSupported()) {
        _hlsInstance = new window.Hls({
            enableWorker: true,
            // no auto quality jump que re-layout
            startLevel: -1
        });
        _hlsInstance.loadSource(playUrl);
        _hlsInstance.attachMedia(vid);
        _hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
            const p = vid.play();
            if (p && p.catch) p.catch(() => {});
        });
    } else if (vid.canPlayType("application/vnd.apple.mpegurl")) {
        vid.src = playUrl;
        const p = vid.play();
        if (p && p.catch) p.catch(() => {});
    } else {
        vid.classList.add("hidden");
        playerIframe.classList.remove("hidden");
        playerIframe.src = playUrl;
    }
    iniciarSeguimientoProgreso(item || seleccionActual);
    document.body.classList.add("player-open");
    requestAnimationFrame(() => {
        try { videoContainer.scrollIntoView({ behavior: "smooth", block: "center" }); }
        catch (_) { videoContainer.scrollIntoView(true); }
    });
}


// ======================================================
// NAVEGACIÓN DE VISTAS
// ======================================================
function mostrarHome() {
    vistaActual = "home";
    homeView.classList.remove("hidden");
    gridView.classList.add("hidden");
    document.querySelectorAll(".filter-tab, .filter-chip").forEach(el => el.classList.remove("active"));
    document.getElementById("nav-item-home").classList.add("active");
    actualizarBotonOnline(false);   // ← ocultar “Buscar online”
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function aplicarFiltrosYOrden(lista) {
    let res = [...(lista || [])];

    if (gridTypeFilter !== "all") {
        const map = { movie: "Película", series: "Serie", anime: "Anime" };
        const wanted = map[gridTypeFilter] || gridTypeFilter;
        res = res.filter(i => {
            const t = (i.tipo || "").toString();
            return t === wanted || t.toLowerCase().includes(gridTypeFilter);
        });
    }

    if (gridSort === "rating") {
        res.sort((a, b) => (Number(b.calificacion) || 0) - (Number(a.calificacion) || 0));
    } else if (gridSort === "az") {
        res.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" }));
    } else {
        // más reciente
        res.sort((a, b) => {
            const da = a.created_at ? new Date(a.created_at).getTime() : (Number(a.year) || 0);
            const db = b.created_at ? new Date(b.created_at).getTime() : (Number(b.year) || 0);
            return db - da;
        });
    }
    return res;
}

function mostrarGrid({ modo, seccion = "movie", termino = "" }) {
    vistaActual = "grid";
    gridModo = modo;
    gridSeccion = seccion;
    gridTermino = termino;
    gridPage = 1;
    gridSinMasResultados = false;

    // Si NO es búsqueda → ocultar “Buscar online”
    if (modo !== "search") {
        actualizarBotonOnline(false);
        busquedaEsLocal = true;
    }

    homeView.classList.add("hidden");
    gridView.classList.remove("hidden");

    document.querySelectorAll(".filter-tab").forEach(el => el.classList.remove("active"));
    document.getElementById("nav-item-home").classList.remove("active");
    document.getElementById("nav-item-favoritos")?.classList.toggle("active", modo === "favoritos");

    document.querySelectorAll(".filter-chip").forEach(chip => {
        chip.classList.toggle("active", chip.dataset.type === seccion || (chip.dataset.type === "all" && modo !== "categoria"));
    });

    if (modo === "search") {
        resultsTitle.textContent = `Resultados para "${termino}"`;
        document.getElementById("filter-toolbar").classList.remove("hidden");
        busquedaEsLocal = false; // online
    } else if (modo === "favoritos") {
        resultsTitle.innerHTML = `<ion-icon name="heart" style="vertical-align:-3px;"></ion-icon> Mis Favoritos`;
        document.getElementById("filter-toolbar").classList.add("hidden");
    } else {
        resultsTitle.textContent = seccion === "movie" ? "Películas" : seccion === "series" ? "Series" : "Anime";
        document.getElementById("filter-toolbar").classList.remove("hidden");
        const navMap = { movie: "nav-item-movies", series: "nav-item-series", anime: "nav-item-anime" };
        document.getElementById(navMap[seccion])?.classList.add("active");
    }

    resultsGrid.innerHTML = "";
    resultsEmpty.classList.add("hidden");
    scrollSentinel.classList.add("hidden");
    cargarPaginaGrid();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ======================================================
// CARGA DE DATOS (conectado a tu server.js real)
// ======================================================
async function fetchSeccion(seccion, page, limit = LIMIT) {
    const data = await getCatalog(seccion, page, limit);
    
    // Guardamos total para la paginación
    gridTotalItems = data.total || 0;
    gridTotalPages = Math.max(1, Math.ceil(gridTotalItems / limit));
    
    return data.resultados || [];
}

// Estado extra: por defecto ONLINE (la API tiene muchos más resultados que Supabase local)
let busquedaEsLocal = false;

async function fetchBusqueda(termino, source = "online", page = 1, limit = LIMIT) {
    const data = await searchCatalog(termino, source, page, limit);
    return {
        resultados: data.resultados || [],
        total: data.total ?? 0,
        page: data.page ?? page,
        limit: data.limit ?? limit,
        source: data.source || source
    };
}

function actualizarBotonOnline(mostrar) {
    let btn = document.getElementById("btn-buscar-online");
    if (!btn) {
        const header = document.querySelector(".grid-header");
        if (!header) return;

        btn = document.createElement("button");
        btn.id = "btn-buscar-online";
        btn.className = "btn-buscar-online hidden";
        btn.style.display = "none";
        btn.innerHTML = `
            <ion-icon name="search-outline"></ion-icon>
            <span>Buscar online</span>
        `;
        btn.addEventListener("click", async () => {
            if (!gridTermino || gridCargando) return;
            busquedaEsLocal = false;
            btn.disabled = true;
            btn.innerHTML = `<div class="spinner-inline"></div> Buscando online...`;
            await cargarPaginaGrid();
        });
        header.appendChild(btn);
    }

    if (mostrar && gridModo === "search") {
        btn.classList.remove("hidden");
        btn.style.display = "inline-flex";
        btn.disabled = false;
        btn.innerHTML = `
            <ion-icon name="search-outline"></ion-icon>
            <span>Buscar online</span>
        `;
    } else {
        btn.classList.add("hidden");
        btn.style.display = "none";
    }
}

async function cargarPaginaGrid() {
    if (gridCargando) return;
    gridCargando = true;

    // Skeleton en vez de solo spinner
    const skeleton = document.getElementById("results-skeleton");
    if (skeleton) skeleton.classList.remove("hidden");
    resultsLoading.classList.add("hidden");          // ocultamos el spinner viejo
    resultsEmpty.classList.add("hidden");
    resultsGrid.innerHTML = "";
    scrollSentinel.classList.add("hidden");

    try {
        let lista = [];

        if (gridModo === "favoritos") {
            lista = obtenerFavoritos();
            gridTotalItems = lista.length;
            gridTotalPages = 1;
            gridPage = 1;
            actualizarBotonOnline(false);
        } else if (gridModo === "search") {
            // Siempre online primero; local solo si el usuario lo pidiera explícitamente
            const data = await fetchBusqueda(gridTermino, busquedaEsLocal ? "local" : "online", gridPage, LIMIT);
            lista = data.resultados;
            gridTotalItems = data.total || lista.length;
            gridTotalPages = Math.max(1, Math.ceil(gridTotalItems / LIMIT));
            // Botón online ya no hace falta (búsqueda es online por defecto)
            actualizarBotonOnline(false);
        } else {
            actualizarBotonOnline(false);
            // Sección normal → aquí se actualiza gridTotalItems y gridTotalPages
            lista = await fetchSeccion(gridSeccion, gridPage, LIMIT);
        }

        // Aplica filtros de tipo + orden (Más reciente / Calificación / A-Z)
        const listaFinal = aplicarFiltrosYOrden(lista);

        renderGridItems(listaFinal, true);
        resultsCount.textContent = `${listaFinal.length} items` +
            (gridTotalItems > listaFinal.length ? ` (de ${gridTotalItems})` : "");

        if (listaFinal.length === 0) {
            resultsEmpty.classList.remove("hidden");
        }

        actualizarPaginacion();

    } catch (err) {
        console.error(err);
        resultsEmpty.classList.remove("hidden");
        resultsEmpty.querySelector("p").textContent = "No se pudo cargar la sección.";
    } finally {
        // Ocultar skeleton cuando termina de cargar
        if (skeleton) skeleton.classList.add("hidden");
        resultsLoading.classList.add("hidden");
        gridCargando = false;
    }
}

// ---------- Infinite scroll (DESACTIVADO - ahora usamos botones) ----------
// ---------- Infinite scroll ----------
/*
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && vistaActual === "grid" && !gridSinMasResultados) {
            cargarPaginaGrid();
        }
    });
}, { rootMargin: "300px" });
observer.observe(scrollSentinel);
*/

// ======================================================
// RENDER: TARJETAS (media-card)
// ======================================================
function crearMediaCard(item) {
    const card = document.createElement("div");
    card.className = "media-card";

    const portada = item.portada || PLACEHOLDER;
    const nombre = item.nombre || "Sin título";
    const tipo = tipoLabel(item.tipo);
    // Siempre mostrar calificación (0 si no tiene)
    const rating = ratingInfo(item).label;
    const tieneVideo = item.tiene_player === true || itemTieneVideo(item);

    const generoCorto = item.genero
        ? String(item.genero).split(",")[0].trim()
        : "";
    const sublinea = item.episodios && item.episodios.length
        ? `${item.episodios.length} episodios`
        : [item.year, generoCorto || tipo].filter(Boolean).join(" · ");

    card.innerHTML = `
        <div class="poster-wrapper">
            <img class="poster-img" src="${escapeHtml(portada)}" alt="${escapeHtml(nombre)}" loading="lazy">
            <div class="poster-overlay"><ion-icon name="play-circle" class="overlay-icon"></ion-icon></div>
            ${ratingBadgeHtml(item)}
            <span class="type-badge">${escapeHtml(tipo)}</span>
            <span class="availability-badge ${tieneVideo ? "available" : "unavailable"}">
                <span class="dot"></span> ${tieneVideo ? "▶ Disponible" : "Sin servidores"}
            </span>
        </div>
        <div class="media-info">
            <h3>${escapeHtml(nombre)}</h3>
            <p>${escapeHtml(sublinea)}</p>
        </div>
    `;

    const img = card.querySelector("img");
    img.addEventListener("error", (e) => {
        // Evitar bucle de reintentos / parpadeo si la portada no existe
        if (e.target.dataset.failed === "1") return;
        e.target.dataset.failed = "1";
        e.target.src = PLACEHOLDER;
        e.target.style.opacity = "1";
    });
    // Si no hay portada real, no forzar carga de URL vacía
    if (!item.portada) {
        img.src = PLACEHOLDER;
        img.dataset.failed = "1";
    }
    card.addEventListener("click", () => abrirDetalle(item));
    return card;
}

function renderGridItems(lista, limpiar) {
    if (limpiar) resultsGrid.innerHTML = "";
    lista.forEach(item => resultsGrid.appendChild(crearMediaCard(item)));
}

function renderCarousel(contenedorId, lista) {
    const el = document.getElementById(contenedorId);
    el.innerHTML = "";
    if (!lista.length) {
        el.innerHTML = `<p style="color:var(--text-muted);">No hay contenido disponible por ahora.</p>`;
        return;
    }
    lista.forEach(item => {
        const card = crearMediaCard(item);
        card.classList.add("carousel-card");
        el.appendChild(card);
    });
}

// ======================================================
// HERO BANNER
// ======================================================
function pintarHero(item) {
    if (!item) return;
    heroType.textContent = tipoLabel(item.tipo).toUpperCase() + (item.tipo !== "Serie" && item.tipo !== "Anime" ? " RECOMENDADA" : "");
    heroTitle.textContent = item.nombre || "Sin título";
    const heroR = ratingInfo(item);
    heroRating.textContent = heroR.label;
    heroRating.title = heroR.secondary ? heroR.label + " · " + heroR.secondary : heroR.label;
    if (heroRating.parentElement) {
        heroRating.parentElement.classList.remove("rating-src-imdb", "rating-src-tmdb", "rating-src-omdb", "rating-src-fuente");
        if (heroR.source) heroRating.parentElement.classList.add("rating-src-" + heroR.source);
    }
    heroYear.textContent = item.year || "-";
    heroSynopsis.textContent = item.descripcion || "";
    if (item.backdrop || item.portada) {
        document.getElementById("hero-banner").style.backgroundImage = `url('${item.backdrop || item.portada}')`;
    }
}

function iniciarHero(lista) {
    heroItems = lista.filter(i => i.portada || i.backdrop).slice(0, 6);
    if (!heroItems.length) return;

    heroDots.innerHTML = heroItems.map((_, i) =>
        `<div class="hero-dot${i === 0 ? " active" : ""}" data-i="${i}"></div>`
    ).join("");

    heroDots.querySelectorAll(".hero-dot").forEach(dot => {
        dot.addEventListener("click", () => {
            heroIndex = parseInt(dot.dataset.i);
            pintarHero(heroItems[heroIndex]);
            heroDots.querySelectorAll(".hero-dot").forEach(d => d.classList.remove("active"));
            dot.classList.add("active");
            reiniciarHeroTimer();
        });
    });

    heroIndex = 0;
    pintarHero(heroItems[0]);
    reiniciarHeroTimer();
}

function reiniciarHeroTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => {
        heroIndex = (heroIndex + 1) % heroItems.length;
        pintarHero(heroItems[heroIndex]);
        heroDots.querySelectorAll(".hero-dot").forEach((d, i) => d.classList.toggle("active", i === heroIndex));
    }, 7000);
}

heroPlayBtn.addEventListener("click", () => {
    if (heroItems[heroIndex]) abrirDetalle(heroItems[heroIndex], true);
});
heroInfoBtn.addEventListener("click", () => {
    if (heroItems[heroIndex]) abrirDetalle(heroItems[heroIndex], false);
});

// ======================================================
// CARGA INICIAL (home)
// ======================================================
async function cargarHome() {
    console.log('🟢 Iniciando cargarHome()');
    try {
        console.log('🟡 Cargando estrenos (películas, series y anime)...');

        // Películas destacadas + hero = estrenos de la API
        const results = await Promise.allSettled([
            fetch('/api/estrenos?tipo=peliculas&limit=24', { cache: 'no-store' }).then(r => r.json()),
            fetchSeccion("series", 1, 12),
            fetchSeccion("anime", 1, 12)
        ]);

        const estrenosData = results[0].status === "fulfilled" ? results[0].value : { resultados: [] };
        const peliculas = estrenosData.resultados || [];
        const series    = results[1].status === "fulfilled" ? results[1].value : [];
        const anime     = results[2].status === "fulfilled" ? results[2].value : [];

        console.log('✅ Datos:', {
            peliculas: peliculas.length,
            series: series.length,
            anime: anime.length
        });

        // Destacadas = estrenos
        const destacadas = peliculas.slice(0, 12);
        renderCarousel("carousel-movies", destacadas);
        renderCarousel("carousel-series", series);
        renderCarousel("carousel-anime", anime);
        cargarContinuarViendo();
        cargarRecienAnadidos();

        // Hero ("Película recomendada") también con estrenos
        iniciarHero(peliculas.length ? peliculas : series);

        statusBadge.classList.remove("offline");
        statusBadge.classList.add("online");
        statusBadge.querySelector(".status-text").textContent = "Online";
        console.log('✅ Home cargado (estrenos)');
    } catch (err) {
        console.error('❌ Error en cargarHome:', err);
        statusBadge.classList.remove("online");
        statusBadge.classList.add("offline");
        statusBadge.querySelector(".status-text").textContent = "Offline";
    }
}



async function abrirDesdeProgreso(mini) {
    // 1) Abrir ya con lo que hay (poster, título…)
    await abrirDetalle({
        ...mini,
        tiene_player: true,
        embeds: mini.embeds || [],
        episodios: mini.episodios || []
    }, false, false);

    // 2) Completar desde Supabase / API (misma info que al abrir normal)
    try {
        const params = new URLSearchParams();
        if (mini.postId) params.set("postId", mini.postId);
        if (mini.link) params.set("link", mini.link);
        if (mini.slug) params.set("slug", mini.slug);
        if (mini.source_id) params.set("source_id", mini.source_id);
        if (mini.tipo) params.set("tipo", mini.tipo);
        if (mini.id && !mini.postId) params.set("postId", mini.id);

        if (![...params.keys()].length) return;

        const res = await fetch(`/api/detalle?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const completo = await res.json();
        if (completo && (completo.nombre || completo.link)) {
            // Reabrir con datos completos (servidores, sinopsis, etc.)
            await abrirDetalle({ ...completo, tiene_player: true }, false, false);
        }
    } catch (err) {
        console.warn("No se pudo completar desde progreso:", err);
    }
}

// ======================================================
// DETALLE (modal inmersivo)
// ======================================================
const videoContainer = document.getElementById("video-player-container");
const playerIframe = document.getElementById("player-iframe");
const playerTitle = document.getElementById("player-title");


async function abrirDetalle(item, autoPlay = false, force = false) {
    seleccionActual = item;

    detailsEmpty.classList.add("hidden");
    detailsContent.classList.remove("hidden");
    detailsPanel.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    // Pintar lo que ya tenemos
    document.getElementById("details-poster").src = item.portada || PLACEHOLDER;
    document.getElementById("details-type").textContent = tipoLabel(item.tipo);
    document.getElementById("details-title").textContent = item.nombre || "Sin título";

    const originalEl = document.getElementById("details-original-title");
    if (item.titulo_original && item.titulo_original !== item.nombre) {
        originalEl.textContent = item.titulo_original;
        originalEl.style.display = "block";
    } else {
        originalEl.style.display = "none";
    }

    document.getElementById("details-year").textContent = item.year || "—";
    rellenarMetaDetalle(item);
    document.getElementById("details-synopsis").textContent = item.descripcion || "Sin descripción disponible.";

    actualizarBotonFavorito();

    videoContainer.classList.add("hidden");
    playerIframe.src = "about:blank";

    document.getElementById("servers-section").querySelector("#servers-loading").classList.remove("hidden");
    document.getElementById("servers-container").innerHTML = "";
    document.getElementById("seasons-section").classList.add("hidden");
    document.getElementById("downloads-section").classList.add("hidden");

    // Enriquecer siempre que falte descripción, players o episodios (al entrar, no solo al pulsar Actualizar)
    // También si el listado marcó "Sin servidores" (tiene_player !== true) para películas
    const faltaDescripcion = !item.descripcion || String(item.descripcion).trim().length < 20;
    const esSA = item.tipo === "Serie" || item.tipo === "Anime";
    // Series/anime no requieren embeds a nivel ficha (van por capítulo)
    const faltaPlayers =
        !esSA && (
            item.tiene_player !== true ||
            !item.embeds || item.embeds.length === 0 ||
            (Array.isArray(item.embeds) && item.embeds.every(e => esEmbedInvalido(e.url)))
        );
    const faltaEpisodios =
        esSA &&
        (!item.episodios || item.episodios.length === 0) &&
        (!item.temporadas_raw || !item.temporadas_raw.length) &&
        (!item.temporadas || !item.temporadas.length);

    const necesitaEnriquecer = force || faltaDescripcion || faltaPlayers || faltaEpisodios;

    if (necesitaEnriquecer && (item.postId || item.link || item.slug || item.url_extract)) {
        try {
            const params = new URLSearchParams();
            if (item.postId) params.set("postId", item.postId);
            if (item.link) params.set("link", item.link);
            if (item.slug) params.set("slug", item.slug);
            if (item.source_id) params.set("source_id", item.source_id);
            if (item.tipo) params.set("tipo", item.tipo);
            if (item.url_extract && !item.link) params.set("link", item.url_extract);
            if (force) params.set("force", "1");

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);

            const res = await fetch(`/api/detalle?${params.toString()}`, { cache: "no-store", signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const completo = await res.json();
                if (completo.embeds) completo.embeds = normalizarEmbeds(completo.embeds);
                // No borrar temporadas/episodios si el force devolvió vacío
                if ((!completo.episodios || !completo.episodios.length) && item.episodios?.length) {
                    completo.episodios = item.episodios;
                }
                if ((!completo.temporadas || !completo.temporadas.length) && item.temporadas?.length) {
                    completo.temporadas = item.temporadas;
                }
                if ((!completo.temporadas_raw || !completo.temporadas_raw.length) && item.temporadas_raw?.length) {
                    completo.temporadas_raw = item.temporadas_raw;
                }
                // Preservar embeds de episodios ya cargados en el cliente
                if (item.episodios?.length && completo.episodios?.length) {
                    const byKey = new Map();
                    for (const ep of item.episodios) {
                        const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
                        if (ep.embeds?.length || ep.video) byKey.set(k, ep);
                    }
                    completo.episodios = completo.episodios.map((ep) => {
                        const k = `${Number(ep.season) || 1}-${Number(ep.episode || ep.episodio) || 0}`;
                        const prev = byKey.get(k);
                        if (!prev || (ep.embeds && ep.embeds.length)) return ep;
                        return { ...ep, embeds: prev.embeds || [], video: prev.video || prev.reproductor || null, downloads: prev.downloads || ep.downloads };
                    });
                }
                // Fusionar con cuidado: no mezclar meta de distinto año
                const yOld = item.year && String(item.year).match(/(19|20)\d{2}/);
                const yNew = completo.year && String(completo.year).match(/(19|20)\d{2}/);
                if (yOld && yNew && yOld[0] !== yNew[0]) {
                    // Obra distinta: usar datos del detalle (API) como fuente de verdad
                    Object.keys(item).forEach(function (k) { delete item[k]; });
                    Object.assign(item, completo);
                } else {
                    Object.assign(item, completo);
                    // Si el detalle trae rating/imdb, asegurar que pisen valores viejos
                    if (completo.calificacion != null) item.calificacion = completo.calificacion;
                    if (completo.rating != null && item.calificacion == null) item.calificacion = completo.rating;
                    if (completo.imdb) item.imdb = completo.imdb;
                    if (completo.tmdb) item.tmdb = completo.tmdb;
                    if (completo.year) item.year = completo.year;
                    if (completo.titulo_original) item.titulo_original = completo.titulo_original;
                    if (completo.generos && completo.generos.length) item.generos = completo.generos;
                    if (completo.genero) item.genero = completo.genero;
                    if (completo.votos) item.votos = completo.votos;
                    if (completo.duracion) item.duracion = completo.duracion;
                    if (completo.duracion_texto) item.duracion_texto = completo.duracion_texto;
                    if (completo.certificacion) item.certificacion = completo.certificacion;
                    if (completo.imdb_id) item.imdb_id = completo.imdb_id;
                    if (completo.tmdb_id) item.tmdb_id = completo.tmdb_id;
                }
                const esSA2 = item.tipo === "Serie" || item.tipo === "Anime";
                if (item.tiene_player || itemTieneVideo(item) ||
                    (esSA2 && (item.episodios?.length || item.temporadas?.length || item.temporadas_raw?.length))) {
                    item.tiene_player = true;
                }
                seleccionActual = item;

                // Repintar metadatos que ahora sí vienen (descripción, rating, portada…)
                document.getElementById("details-poster").src = item.portada || PLACEHOLDER;
                document.getElementById("details-title").textContent = item.nombre || "Sin título";
                document.getElementById("details-year").textContent = item.year || "-";
                rellenarMetaDetalle(item);
                document.getElementById("details-synopsis").textContent = item.descripcion || "Sin descripción disponible.";
            }
        } catch (err) {
            console.error("Error o timeout enriqueciendo detalle:", err);
        }
    }

    document.getElementById("servers-loading").classList.add("hidden");

    const esSerieOAnime = item.tipo === "Serie" || item.tipo === "Anime";
    if (esSerieOAnime && (Array.isArray(item.episodios) && item.episodios.length > 0 || Array.isArray(item.temporadas) && item.temporadas.length > 0 || Array.isArray(item.temporadas_raw) && item.temporadas_raw.length > 0)) {
        document.getElementById("seasons-section").classList.remove("hidden");
        renderTemporadas(item);
    } else {
        renderServidoresYDescargas(item.embeds, item.downloads, item.reproductor, item);
        if (autoPlay) {
            const first = (item.embeds && item.embeds[0]) || (item.reproductor ? { url: item.reproductor } : null);
            if (first) reproducir(first, item);
        }
    }
}

function cerrarDetalle() {
    detenerSeguimientoProgreso(true);
    detailsPanel.classList.add("hidden");
    document.body.style.overflow = "";
    document.body.classList.remove("player-open");
    destruirHls();
    playerIframe.src = "about:blank";
    videoContainer.classList.add("hidden");
    cargarContinuarViendo();
}
document.getElementById("btn-close-modal").addEventListener("click", cerrarDetalle);
document.getElementById("modal-backdrop-close").addEventListener("click", cerrarDetalle);

document.getElementById("btn-fs-player")?.addEventListener("click", () => {
    togglePantallaCompletaPlayer();
});
document.addEventListener("fullscreenchange", () => {
    const on = !!document.fullscreenElement;
    if (!on) {
        document.getElementById("video-player-container")?.classList.remove("is-fullscreen");
    }
    actualizarIconoFs(on || document.getElementById("video-player-container")?.classList.contains("is-fullscreen"));
});
document.addEventListener("webkitfullscreenchange", () => {
    const on = !!document.webkitFullscreenElement;
    if (!on) {
        document.getElementById("video-player-container")?.classList.remove("is-fullscreen");
    }
    actualizarIconoFs(on);
});

document.getElementById("close-player-btn").addEventListener("click", () => {
    detenerSeguimientoProgreso(true);
    destruirHls();
    videoContainer.classList.add("hidden");
    playerIframe.src = "about:blank";
    document.body.classList.remove("player-open");
    // Al cerrar el player vuelve a mostrarse el botón de cerrar detalle (CSS body.player-open)
    cargarContinuarViendo();
});

// ---------- Favoritos ----------
function actualizarBotonFavorito() {
    const btn = document.getElementById("btn-favorito");
    const icon = document.getElementById("btn-favorito-icon");
    if (!seleccionActual) return;
    const activo = esFavorito(seleccionActual.link);
    icon.setAttribute("name", activo ? "heart" : "heart-outline");
    btn.style.color = activo ? "#e50914" : "";
}
document.getElementById("btn-favorito").addEventListener("click", () => {
    if (!seleccionActual) return;
    toggleFavoritoItem(seleccionActual);
    actualizarBotonFavorito();
});

document.getElementById("btn-share")?.addEventListener("click", async () => {
    if (!seleccionActual) return;
    const link = seleccionActual.link || seleccionActual.id || seleccionActual.postId;
    if (!link) return;
    const url = `${location.origin}/?link=${encodeURIComponent(String(link))}`;
    try {
        await navigator.clipboard.writeText(url);
        const btn = document.getElementById("btn-share");
        const prev = btn.innerHTML;
        btn.innerHTML = `<ion-icon name="checkmark-outline"></ion-icon>`;
        setTimeout(() => { btn.innerHTML = prev; }, 1500);
    } catch {
        prompt("Copia este enlace:", url);
    }
});

document.getElementById("btn-refresh-servers")?.addEventListener("click", async () => {
    if (!seleccionActual || gridCargando) return;
    const btn = document.getElementById("btn-refresh-servers");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner-inline"></div> Actualizando...`;
    }
    try {
        await abrirDetalle(seleccionActual, false, true); // tercer param = force
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<ion-icon name="refresh-outline"></ion-icon><span>Actualizar servidores</span>`;
        }
    }
});

// ---------- Temporadas y episodios ----------
function buildEpisodiosQuery(item, season) {
    const params = new URLSearchParams();
    params.set("season", String(season));
    if (item.postId) params.set("postId", item.postId);
    if (item.link) params.set("link", item.link);
    if (item.slug) params.set("slug", item.slug);
    if (item.source_id) params.set("source_id", item.source_id);
    if (item.tipo) params.set("tipo", item.tipo);
    if (item.url_extract && !item.link) params.set("link", item.url_extract);
    params.set("players", "1"); // cargar players del 1er episodio
    return params.toString();
}

function normalizarListaTemporadas(item) {
    const totalEps = parseInt(item.total_episodios || item.totalEpisodios || 0, 10) || 0;
    const tieneRangos = Array.isArray(item.rangos_episodios) && item.rangos_episodios.length > 1;
    // One Piece / animes por número continuo: SOLO 1 “temporada” + pestañas 1–50, 51–100…
    // Ignorar lista inflada de arcs TMDB (T1…T22)
    if (totalEps > 50 || tieneRangos) {
        let epsT1 = null;
        const raw0 = (item.temporadas_raw && item.temporadas_raw[0])
            || (Array.isArray(item.temporadas) && item.temporadas.find(t => t && typeof t === "object" && Number(t.temporada || t.season) === 1));
        if (raw0 && Array.isArray(raw0.episodios)) epsT1 = raw0.episodios;
        return [{ num: 1, episodios: epsT1, fromTmdb: false }];
    }

    // 1) Temporadas de la fuente
    const raw = (item.temporadas_raw && item.temporadas_raw.length)
      ? item.temporadas_raw
      : (item.temporadas && item.temporadas.length ? item.temporadas : []);
    const seen = new Set();
    const out = [];
    raw.forEach((s, i) => {
        let num;
        let episodios = null;
        if (typeof s === "number" || typeof s === "string") {
            num = parseInt(s, 10) || (i + 1);
        } else if (s && typeof s === "object") {
            num = parseInt(s.temporada || s.season_number || s.season || (i + 1), 10) || (i + 1);
            episodios = Array.isArray(s.episodios) ? s.episodios : null;
        } else {
            num = i + 1;
        }
        if (seen.has(num) || num < 1) return;
        seen.add(num);
        out.push({ num, episodios, fromTmdb: false });
    });

    // 2) TMDB solo para completar 1–2 temporadas reales (Wistoria T2), nunca 20 arcs
    const tmdbSeasons = Array.isArray(item.temporadas_tmdb) ? item.temporadas_tmdb : [];
    let addedFromTmdb = 0;
    const maxTmdbExtra = 2;
    tmdbSeasons.forEach((ts) => {
        if (addedFromTmdb >= maxTmdbExtra) return;
        const num = parseInt(ts.season_number || ts.temporada || 0, 10);
        if (!num || num < 1 || seen.has(num)) return;
        // Si la fuente ya tiene ≥2 temps, no añadir más de TMDB
        if (out.length >= 2) return;
        seen.add(num);
        addedFromTmdb += 1;
        const epsRaw = Array.isArray(ts.episodios) ? ts.episodios : [];
        const episodios = epsRaw.map((ep, idx) => ({
            temporada: num,
            episodio: ep.episode_number || ep.episodio || (idx + 1),
            episode: ep.episode_number || ep.episodio || (idx + 1),
            titulo: ep.name || ep.titulo || ("Episodio " + (ep.episode_number || idx + 1)),
            nombre: ep.name || ep.titulo || ("Episodio " + (ep.episode_number || idx + 1)),
            embeds: [],
            video: null,
            still: ep.still || null
        }));
        if (!episodios.length && ts.episode_count) {
            for (let e = 1; e <= Math.min(Number(ts.episode_count) || 0, 50); e++) {
                episodios.push({
                    temporada: num,
                    episodio: e,
                    episode: e,
                    titulo: "Episodio " + e,
                    nombre: "Episodio " + e,
                    embeds: [],
                    video: null
                });
            }
        }
        out.push({ num, episodios, fromTmdb: true });
    });

    out.sort((a, b) => a.num - b.num);
    return out.length ? out : [{ num: 1, episodios: null, fromTmdb: false }];
}

/** Rangos de episodios (animes largos tipo One Piece) — bloques de 50 */
function construirRangosEpisodios(total, step = 50) {
    const t = parseInt(total, 10) || 0;
    if (t < 1) return [];
    const out = [];
    for (let i = 1; i <= t; i += step) {
        const hasta = Math.min(i + step - 1, t);
        out.push({ desde: i, hasta, label: `${i}–${hasta}` });
    }
    return out;
}

/** Normaliza rangos del API a bloques de 50 (si vienen de 100, se parten) */
function normalizarRangosEpisodios(item) {
    const total = parseInt(item.total_episodios || item.totalEpisodios || 0, 10)
        || (Array.isArray(item.episodios) ? item.episodios.length : 0);
    if (total <= 50) return [];
    const api = Array.isArray(item.rangos_episodios) ? item.rangos_episodios : [];
    // Si la API ya trae pasos ≤ 50, usarlos
    if (api.length > 1) {
        const step0 = Number(api[0].hasta) - Number(api[0].desde) + 1;
        if (step0 > 0 && step0 <= 50) return api;
    }
    return construirRangosEpisodios(total, 50);
}

function renderTemporadas(item) {
    const tabsContainer = document.getElementById("seasons-tabs-container");
    const listaTemp = normalizarListaTemporadas(item);
    const totalEps = parseInt(item.total_episodios || item.totalEpisodios || 0, 10)
        || (Array.isArray(item.episodios) ? item.episodios.length : 0);
    const rangos = normalizarRangosEpisodios(item);
    // Anime largo (1 temporada / muchos eps): pestañas = rangos 1–50, 51–100…
    const usarRangosComoTabs = rangos.length > 1 && listaTemp.length <= 1;

    if (usarRangosComoTabs) {
        if (!item._epRangoActivo) {
            item._epRangoActivo = { desde: rangos[0].desde, hasta: rangos[0].hasta };
        }
        tabsContainer.innerHTML = rangos.map((r, i) => {
            const act = item._epRangoActivo
                && item._epRangoActivo.desde === r.desde
                && item._epRangoActivo.hasta === r.hasta;
            return `<button class="season-tab${act || (!item._epRangoActivo && i === 0) ? " active" : ""}" data-range-from="${r.desde}" data-range-to="${r.hasta}">${r.label || (r.desde + "–" + r.hasta)}</button>`;
        }).join("");
    } else {
        tabsContainer.innerHTML = listaTemp.map((t, i) =>
            `<button class="season-tab${i === 0 ? " active" : ""}" data-season="${t.num}">Temporada ${t.num}</button>`
        ).join("");
    }

    const loadSeason = async (season, rangoForzado) => {
        const seasonNum = parseInt(season, 10) || 1;
        const episodesContainer = document.getElementById("episodes-container");
        episodesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando episodios...</p></div>`;

        if (rangoForzado) {
            item._epRangoActivo = { desde: rangoForzado.desde, hasta: rangoForzado.hasta };
        }

        // Si la fuente ya trajo episodios en temporadas[], usarlos (animeav1)
        const localT = listaTemp.find(t => t.num === seasonNum);
        if (localT && Array.isArray(localT.episodios) && localT.episodios.length && !rangoForzado) {
            const tmdbEps = (() => {
                const ts = (item.temporadas_tmdb || []).find(t =>
                    Number(t.season_number || t.temporada) === Number(seasonNum)
                );
                return Array.isArray(ts?.episodios) ? ts.episodios : [];
            })();
            item.episodios = localT.episodios.map((ep, idx) => {
                const num = ep.episodio || ep.episode || ep.episode_number || (idx + 1);
                const meta = tmdbEps.find(t => Number(t.episode_number || t.episodio) === Number(num));
                return {
                    season: seasonNum,
                    episode: num,
                    nombre: meta?.name || ep.titulo || ep.nombre || ep.name || ("Episodio " + num),
                    embeds: ep.embeds || ep.reproductores || [],
                    video: (() => {
                        const v = ep.video || ep.reproductor || null;
                        if (v && !esUrlApiWorker(v) && !esEmbedInvalido(v)) return v;
                        return null;
                    })(),
                    link: ep.link || null,
                    source_id: ep.source_id || item.source_id
                };
            });
            if (item.totalEpisodios && !item.total_episodios) item.total_episodios = item.totalEpisodios;
            renderEpisodios(item, seasonNum);
            return;
        }

        try {
            const qs = new URLSearchParams(buildEpisodiosQuery(item, seasonNum));
            const rango = item._epRangoActivo;
            if (rango) {
                qs.set("ep_from", String(rango.desde));
                qs.set("ep_to", String(rango.hasta));
            }
            const res = await fetch(`/api/episodios?${qs.toString()}`, { cache: "no-store" });
            const data = await res.json();
            item.episodios = data.episodios || [];
            if (data.slug) item.slug = data.slug;
            if (data.source_id) item.source_id = data.source_id;
            if (data.link) item.link = data.link;
            if (data.total_episodios) item.total_episodios = data.total_episodios;
            if (data.rangos_episodios) item.rangos_episodios = data.rangos_episodios;

            // Completar stubs del rango activo (o primer bloque de 50)
            const totalEp = parseInt(item.total_episodios, 10) || 0;
            const byNum = new Map((item.episodios || []).map(e => [Number(e.episode || e.episodio), e]));
            let desde = 1, hasta = Math.min(50, totalEp || 50);
            if (item._epRangoActivo) {
                desde = item._epRangoActivo.desde;
                hasta = item._epRangoActivo.hasta;
            } else if (totalEp > 50) {
                const r0 = normalizarRangosEpisodios(item)[0];
                if (r0) {
                    desde = r0.desde;
                    hasta = r0.hasta;
                    item._epRangoActivo = { desde, hasta };
                }
            } else if (totalEp > (item.episodios || []).length) {
                hasta = totalEp;
            }
            if (totalEp > (item.episodios || []).length || item._epRangoActivo) {
                const filled = [];
                for (let n = desde; n <= hasta; n++) {
                    filled.push(byNum.get(n) || {
                        season: seasonNum,
                        episode: n,
                        nombre: "Episodio " + n,
                        embeds: [],
                        video: null,
                        source_id: item.source_id
                    });
                }
                item.episodios = filled;
            }
            renderEpisodios(item, seasonNum);
        } catch (err) {
            console.error(err);
            episodesContainer.innerHTML = `<p style="color:var(--text-muted);">Error cargando episodios.</p>`;
        }
    };

    tabsContainer.querySelectorAll(".season-tab").forEach(tab => {
        tab.addEventListener("click", async () => {
            tabsContainer.querySelectorAll(".season-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            if (tab.dataset.rangeFrom) {
                await loadSeason(1, {
                    desde: parseInt(tab.dataset.rangeFrom, 10),
                    hasta: parseInt(tab.dataset.rangeTo, 10)
                });
            } else {
                item._epRangoActivo = null;
                await loadSeason(parseInt(tab.dataset.season, 10));
            }
        });
    });

    if (usarRangosComoTabs && item._epRangoActivo) {
        loadSeason(1, item._epRangoActivo);
    } else {
        loadSeason(listaTemp[0]?.num || 1);
    }
}

function episodioNumero(ep, index) {
    return parseInt(ep.episode || ep.episodio || ep.episode_number || (index + 1), 10) || (index + 1);
}

function renderEpisodios(item, season = 1) {
    const episodesContainer = document.getElementById("episodes-container");
    episodesContainer.innerHTML = "";

    const totalEps = parseInt(item.total_episodios || item.totalEpisodios || 0, 10)
        || (Array.isArray(item.episodios) ? item.episodios.length : 0);

    // Rangos en bloques de 50 (One Piece, etc.)
    let rangos = normalizarRangosEpisodios(item);
    // Si los tabs de temporada YA muestran rangos, no duplicar barra aquí
    const tabsContainer = document.getElementById("seasons-tabs-container");
    const tabsSonRangos = !!(tabsContainer && tabsContainer.querySelector("[data-range-from]"));

    if (!item._epRangoActivo && rangos.length > 1) {
        item._epRangoActivo = { desde: rangos[0].desde, hasta: rangos[0].hasta };
    }
    const rango = item._epRangoActivo || null;

    // Barra de rangos solo si NO están ya en las pestañas (p.ej. multi-temp + muchos eps)
    if (rangos.length > 1 && !tabsSonRangos) {
        const bar = document.createElement("div");
        bar.className = "episode-range-bar";
        bar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;width:100%;";
        rangos.forEach((r) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "episode-range-btn" + (
                rango && rango.desde === r.desde && rango.hasta === r.hasta ? " active" : ""
            );
            b.textContent = r.label || `${r.desde}–${r.hasta}`;
            b.style.cssText = "padding:6px 10px;border-radius:8px;border:1px solid var(--border-color);background:rgba(255,255,255,0.04);color:var(--text-muted);font-size:12px;cursor:pointer;";
            if (rango && rango.desde === r.desde) {
                b.style.background = "rgba(168,85,247,0.25)";
                b.style.color = "#fff";
                b.style.borderColor = "rgba(168,85,247,0.5)";
            }
            b.addEventListener("click", async () => {
                item._epRangoActivo = { desde: r.desde, hasta: r.hasta };
                episodesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando episodios ${r.desde}–${r.hasta}...</p></div>`;
                try {
                    const qs = new URLSearchParams();
                    if (item.slug) qs.set("slug", item.slug);
                    qs.set("source_id", String(item.source_id || "4"));
                    if (item.link) qs.set("link", item.link);
                    if (item.tipo) qs.set("tipo", item.tipo || "Anime");
                    qs.set("season", String(season));
                    qs.set("ep_from", String(r.desde));
                    qs.set("ep_to", String(r.hasta));
                    qs.set("players", "0");
                    const res = await fetch(`/api/episodios?${qs.toString()}`, { cache: "no-store" });
                    const data = await res.json();
                    let lista = data.episodios || [];
                    if (data.total_episodios) item.total_episodios = data.total_episodios;
                    if (data.rangos_episodios) item.rangos_episodios = data.rangos_episodios;
                    const byNum = new Map(lista.map(e => [Number(e.episode || e.episodio), e]));
                    const filled = [];
                    for (let n = r.desde; n <= r.hasta; n++) {
                        filled.push(byNum.get(n) || {
                            season: season,
                            episode: n,
                            nombre: "Episodio " + n,
                            embeds: [],
                            video: null,
                            source_id: item.source_id || "4"
                        });
                    }
                    item.episodios = filled;
                } catch (e) {
                    console.error(e);
                    item.episodios = [];
                    for (let n = r.desde; n <= r.hasta; n++) {
                        item.episodios.push({
                            season: season,
                            episode: n,
                            nombre: "Episodio " + n,
                            embeds: [],
                            video: null
                        });
                    }
                }
                renderEpisodios(item, season);
            });
            bar.appendChild(b);
        });
        episodesContainer.appendChild(bar);
    }

    let lista = Array.isArray(item.episodios) ? item.episodios.slice() : [];
    // Filtrar por rango activo si aplica
    if (rango && lista.length) {
        lista = lista.filter((ep, idx) => {
            const n = episodioNumero(ep, idx);
            return n >= rango.desde && n <= rango.hasta;
        });
    }
    // Si no hay lista pero hay total + rango → generar stubs
    if ((!lista || !lista.length) && rango) {
        lista = [];
        for (let n = rango.desde; n <= rango.hasta; n++) {
            lista.push({ season: season, episode: n, nombre: "Episodio " + n, embeds: [], video: null });
        }
    }

    if (!lista || lista.length === 0) {
        const msg = document.createElement("p");
        msg.style.color = "var(--text-muted)";
        msg.textContent = totalEps
            ? `Hay ${totalEps} episodios. Elige un rango arriba.`
            : "No hay episodios en esta temporada.";
        episodesContainer.appendChild(msg);
        return;
    }

    // #episodes-container ya tiene class episodes-grid (no anidar otro)
    lista.forEach((episodio, index) => {
        const tieneVideo = Boolean(episodio.video) || (Array.isArray(episodio.embeds) && episodio.embeds.length > 0);
        const btn = document.createElement("button");
        btn.className = "episode-btn" + (index === 0 ? " active" : "");
        const num = episodioNumero(episodio, index);
        btn.textContent = num;
        btn.title = episodio.nombre || `Episodio ${num}`;
        if (!tieneVideo) btn.style.opacity = "0.55";

        btn.addEventListener("click", async () => {
            episodesContainer.querySelectorAll(".episode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            // Número real del episodio (no el index del rango filtrado)
            const epNum = episodio.episode || episodio.episodio || episodio.episode_number || episodioNumero(episodio, index);
            const seasonNum = episodio.season || episodio.temporada || season || 1;
            document.getElementById("details-title").textContent =
                `${item.nombre} - ${episodio.nombre || "Episodio " + epNum}`;

            const expandirServidores = () => {
                const sc = document.getElementById("servers-container");
                const tg = document.getElementById("mz-servers-toggle");
                if (sc) {
                    sc.classList.remove("mz-collapsed-content");
                    sc.classList.add("mz-expanded-content");
                }
                if (tg) tg.classList.add("open");
            };

            // Si ya tiene players válidos (Supabase / sesión) → mostrar al instante
            // OJO: embeds:[] o embeds sin URL no cuentan → hay que pedir a la API
            const yaValidos = embedsValidosDe(episodio);
            if (yaValidos.length || (episodio.video && !esEmbedInvalido(episodio.video))) {
                renderServidoresYDescargas(yaValidos.length ? yaValidos : (episodio.embeds || []), episodio.downloads || [], episodio.video, item, { expandido: true });
                expandirServidores();
                btn.style.opacity = "1";
                return;
            }

            // Preferir Latino en cada capítulo (si no hay, el render cae a SUB)
            _idiomaPlayerActivo = "lat";

            // Cargar de API → se guarda en Supabase en el backend
            const serversContainer = document.getElementById("servers-container");
            if (serversContainer) {
                expandirServidores();
                serversContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando servidores del episodio ${epNum}...</p></div>`;
            }
            try {
                const params = new URLSearchParams();
                params.set("temporada", String(seasonNum));
                params.set("episodio", String(epNum));
                if (item.slug) params.set("slug", item.slug);
                // Anime → fuente 4 (animeav1) prioritaria para players
                const sidCap = (item.tipo === "Anime")
                    ? (item._prefer_source_anime || "4")
                    : (item.source_id || "");
                if (sidCap) params.set("source_id", String(sidCap));
                else if (item.source_id) params.set("source_id", item.source_id);
                if (item.link) params.set("link", item.link);
                if (item.url_extract && !item.link) params.set("link", item.url_extract);
                if (item.tipo) params.set("tipo", item.tipo);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 35000);
                const res = await fetch(`/api/capitulo?${params.toString()}`, { cache: "no-store", signal: controller.signal });
                clearTimeout(timeoutId);
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || data.detalle || ("HTTP " + res.status));

                // Preferir objetos reproductores (tienen servidor/idioma); embeds puede ser solo strings
                let embedsNuevos = normalizarEmbeds(
                    (Array.isArray(data.reproductores) && data.reproductores.length)
                        ? data.reproductores
                        : (data.embeds || [])
                );
                if (!embedsNuevos.length && data.reproductor && typeof data.reproductor === "string" && !esUrlApiWorker(data.reproductor)) {
                    embedsNuevos = [{ url: data.reproductor }];
                }
                // Filtrar URLs de la API worker (JSON) que no son iframes de video
                embedsNuevos = embedsNuevos.filter(e => e && e.url && !esUrlApiWorker(e.url));
                episodio.embeds = embedsNuevos.map(e => ({
                    ...e,
                    idioma: e.idioma || e.lang || null,
                    lang: e.lang || e.idioma || null,
                    server: e.server || e.servidor || e.name || null,
                    servidor: e.servidor || e.server || e.name || null,
                    stream_url: e.stream_url || streamUrlParaNoAds(e.url) || null
                }));
                const prim = episodio.embeds[0]?.url || null;
                const rep = (data.reproductor && !esUrlApiWorker(data.reproductor)) ? data.reproductor : prim;
                episodio.video = rep || null;
                episodio.downloads = data.downloads || data.descargas || [];
                episodio.episode = Number(epNum);
                episodio.season = Number(seasonNum);

                // Actualizar también en item.episodios (misma referencia de sesión)
                if (Array.isArray(item.episodios)) {
                    const idx = item.episodios.findIndex(e =>
                        Number(e.season || e.temporada || 1) === Number(seasonNum) &&
                        Number(e.episode || e.episodio || e.episode_number || 0) === Number(epNum)
                    );
                    if (idx >= 0) {
                        item.episodios[idx] = { ...item.episodios[idx], ...episodio };
                    } else {
                        item.episodios.push({ ...episodio });
                    }
                }
                item.tiene_player = true;

                const validos = embedsValidosDe(episodio);
                btn.style.opacity = (validos.length || episodio.video) ? "1" : "0.55";

                if (!validos.length && !episodio.video) {
                    if (serversContainer) {
                        expandirServidores();
                        serversContainer.innerHTML = `<p style="color:var(--text-muted);padding:12px;">Este episodio aún no tiene servidores. Prueba otro o pulsa Actualizar.</p>`;
                    }
                } else {
                    // Pasar embeds crudos + fallback: el render ya no debe vaciar por allowlist estricta
                    renderServidoresYDescargas(
                        validos.length ? validos : episodio.embeds,
                        episodio.downloads,
                        episodio.video,
                        item,
                        { expandido: true }
                    );
                    expandirServidores();
                }
            } catch (err) {
                console.error("capitulo:", err);
                if (serversContainer) {
                    expandirServidores();
                    const msg = err.name === "AbortError"
                        ? "Tiempo de espera agotado. Vuelve a pulsar el episodio."
                        : ("No se pudieron cargar los servidores: " + (err.message || "error"));
                    serversContainer.innerHTML = `<p style="color:var(--text-muted);padding:12px;">${escapeHtml(msg)}</p>`;
                }
            }
        });

        episodesContainer.appendChild(btn);
    });
    }

// ---------- Servidores y descargas ----------
async function reproducir(embed, item) {
    if (!embed?.url && !embed?.stream_url) return;

    // NO ADS: resuelve stream en vivo (caduca; no va a Supabase)
    if (embed.noAds || embed.server === "NO ADS" || embed.name === "NO ADS") {
        try {
            playerTitle.textContent = "Cargando NO ADS...";
            videoContainer.classList.remove("hidden");
            const playUrl = await resolverPlayUrlNoAds(embed);
            await reproducirHlsNoAds(playUrl, item);
        } catch (err) {
            console.error("NO ADS:", err);
            alert("NO ADS no disponible: " + (err.message || err));
        }
        return;
    }

    destruirHls();
    mostrarBotonFullscreen(false);
    videoContainer.classList.remove("hidden");
    playerIframe.src = embed.url;
    playerTitle.textContent = (item?.nombre || "Reproduciendo...")
        .split(" ").map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
    iniciarSeguimientoProgreso(item || seleccionActual);
    document.body.classList.add("player-open");
    requestAnimationFrame(() => {
        try {
            videoContainer.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_) {
            videoContainer.scrollIntoView(true);
        }
    });
}

function renderServidoresYDescargas(embedsRaw, downloadsRaw, fallbackUrl, item, opts) {
    embedsRaw = normalizarEmbeds(embedsRaw);
    const expandido = !!(opts && opts.expandido);

    const serversContainer =
        document.getElementById("servers-container");

    const downloadsSection =
        document.getElementById("downloads-section");

    const downloadsContainer =
        document.getElementById("downloads-list-container");

    if (!serversContainer || !downloadsSection || !downloadsContainer) {
        console.warn("MovieZone: contenedores de servidores no encontrados.");
        return;
    }

    serversContainer.innerHTML = "";
    downloadsContainer.innerHTML = "";

    /* =========================================================
       SERVIDORES
       ========================================================= */

    let embeds = [];

    if (Array.isArray(embedsRaw) && embedsRaw.length > 0) {
        embeds = embedsRaw.filter(e => e && e.url && !esEmbedInvalido(e.url));
        // Si el filtro dejó 0 pero había URLs http, mostrarlas igual (evitar "todavía no está disponible")
        if (!embeds.length) {
            embeds = embedsRaw.filter(e => e && e.url && /^https?:\/\//i.test(String(e.url)));
        }
    } else if (fallbackUrl && /^https?:\/\//i.test(String(fallbackUrl)) && !esEmbedInvalido(fallbackUrl)) {
        embeds = [{ url: fallbackUrl, server: "Servidor" }];
    } else if (fallbackUrl && /^https?:\/\//i.test(String(fallbackUrl))) {
        embeds = [{ url: fallbackUrl, server: "Servidor" }];
    }


    // Deduplicar por URL (todas las fuentes sumadas)
    {
        const seenU = new Set();
        embeds = embeds.filter((e) => {
            const u = String(e.url || "").trim();
            if (!u || seenU.has(u)) return false;
            seenU.add(u);
            return true;
        });
    }

    // Clasificar: Latino / Sub / Otros (desconocido — a veces es español sin etiqueta)
    const grupoLat = embeds.filter(e => !e.noAds && idiomaDeEmbed(e) === "lat");
    const grupoSub = embeds.filter(e => !e.noAds && idiomaDeEmbed(e) === "sub");
    const grupoOtro = embeds.filter(e => !e.noAds && idiomaDeEmbed(e) !== "lat" && idiomaDeEmbed(e) !== "sub");
    const tieneLat = grupoLat.length > 0
        || (Array.isArray(downloadsRaw) && downloadsRaw.some(d => idiomaDeEmbed(d) === "lat"));
    const tieneSub = grupoSub.length > 0
        || (Array.isArray(downloadsRaw) && downloadsRaw.some(d => idiomaDeEmbed(d) === "sub"));
    const tieneOtro = grupoOtro.length > 0;

    // Secciones: mostrar TODOS los reproductores agrupados (no ocultar “desconocido”)
    const secciones = [];
    if (tieneLat) secciones.push({ id: "lat", label: "Latino (DUB)", list: grupoLat });
    if (tieneSub) secciones.push({ id: "sub", label: "Subtitulado (SUB)", list: grupoSub });
    if (tieneOtro) secciones.push({ id: "otro", label: "Otros / Sin etiqueta", list: grupoOtro });
    // Si no hay clasificación, un solo bloque con todos
    if (!secciones.length) secciones.push({ id: "all", label: "Reproductores", list: embeds.filter(e => !e.noAds) });

    // Chips para saltar a sección (opcional; por defecto se muestran todas)
    if (secciones.length > 1) {
        const chipBar = document.createElement("div");
        chipBar.className = "idioma-filter-bar";
        chipBar.style.cssText = "display:flex;gap:8px;margin:0 0 12px;flex-wrap:wrap;justify-content:center;align-items:center;width:100%;";
        secciones.forEach((sec) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "idioma-chip";
            b.textContent = `${sec.label} (${sec.list.length})`;
            b.style.cssText = "padding:8px 14px;border-radius:20px;border:1px solid var(--border-color);background:rgba(255,255,255,0.04);color:var(--text-muted);font-size:12px;font-weight:600;cursor:pointer;";
            b.addEventListener("click", () => {
                const el = document.getElementById("player-section-" + sec.id);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
            chipBar.appendChild(b);
        });
        serversContainer.appendChild(chipBar);
    }

    // Lista plana ordenada: LAT → SUB → Otros (para autoplay / NO ADS)
    embeds = [...grupoLat, ...grupoSub, ...grupoOtro];
    embeds = insertarNoAdsEnLista(embeds);
    embeds = attachStreamUrls(embeds);

    // Guardar secciones para el render de botones más abajo
    serversContainer._seccionesPlayers = secciones.map((s) => ({
        ...s,
        list: attachStreamUrls(s.list.slice())
    }));



    /*
     * Crear botón desplegable de servidores
     */

    let serversToggle =
        document.getElementById(
            "mz-servers-toggle"
        );

    if (!serversToggle) {

        serversToggle =
            document.createElement("button");

        serversToggle.id =
            "mz-servers-toggle";

        serversToggle.className =
            "mz-collapse-toggle";

        serversToggle.type =
            "button";

        serversToggle.innerHTML = `
            <span class="mz-collapse-left">
                <ion-icon name="play-circle-outline"></ion-icon>
                <span>Servidores de reproducción</span>
            </span>

            <ion-icon
                class="mz-collapse-arrow"
                name="chevron-down-outline">
            </ion-icon>
        `;

        serversContainer.parentNode.insertBefore(
            serversToggle,
            serversContainer
        );

    }


    /*
     * Estado: expandido si venimos de clic en episodio, si no cerrado
     */
    if (expandido) {
        serversContainer.classList.remove("mz-collapsed-content");
        serversContainer.classList.add("mz-expanded-content");
        serversToggle.classList.add("open");
    } else {
        serversContainer.classList.add("mz-collapsed-content");
        serversContainer.classList.remove("mz-expanded-content");
        serversToggle.classList.remove("open");
    }

    /*
     * Abrir / cerrar servidores
     */

    serversToggle.onclick = function () {

        const abierto =
            serversContainer.classList.contains(
                "mz-expanded-content"
            );

        if (abierto) {

            serversContainer.classList.remove(
                "mz-expanded-content"
            );

            serversContainer.classList.add(
                "mz-collapsed-content"
            );

            serversToggle.classList.remove(
                "open"
            );

        } else {

            serversContainer.classList.remove(
                "mz-collapsed-content"
            );

            serversContainer.classList.add(
                "mz-expanded-content"
            );

            serversToggle.classList.add(
                "open"
            );

        }

    };


    /*
     * Crear servidores por sección: Latino / Sub / Otros
     */
    const seccionesRender = serversContainer._seccionesPlayers || [
        { id: "all", label: "Reproductores", list: embeds.filter(e => !e.noAds) }
    ];
    // NO ADS al inicio de la primera sección si existe
    const noAds = embeds.find(e => e && e.noAds);

    if (embeds.length > 0) {
        let globalIndex = 0;
        // Lista plana para data-index (play handlers)
        const flatForPlay = [];
        if (noAds) flatForPlay.push(noAds);

        seccionesRender.forEach((sec) => {
            const wrap = document.createElement("div");
            wrap.id = "player-section-" + sec.id;
            wrap.style.cssText = "width:100%;margin:0 0 14px;";
            const h = document.createElement("div");
            h.style.cssText = "font-size:12px;font-weight:700;color:var(--text-muted);margin:8px 0 6px;text-transform:uppercase;letter-spacing:0.04em;";
            h.textContent = `${sec.label} · ${sec.list.length}`;
            wrap.appendChild(h);

            const listToShow = sec.id === seccionesRender[0].id && noAds
                ? [noAds, ...sec.list]
                : sec.list;

            listToShow.forEach((embed) => {
                if (!embed || !embed.url) return;
                if (embed.noAds && sec.id !== seccionesRender[0].id) return;
                const index = flatForPlay.indexOf(embed);
                const idx = index >= 0 ? index : (flatForPlay.push(embed) - 1);

                const nombre = embed.noAds
                    ? "NO ADS"
                    : detectarServidor(embed.url, embed.server || embed.servidor || embed.name);

                const lang = embed.lang || embed.idioma || "";
                const quality = embed.quality || embed.calidad || "";
                const idTag = idiomaDeEmbed(embed);
                const badge =
                    embed.noAds ? "" :
                    idTag === "lat" ? '<span class="latino-badge">Latino</span>' :
                    idTag === "sub" ? '<span class="latino-badge" style="background:#3b82f6">SUB</span>' :
                    '<span class="latino-badge" style="background:#6b7280">?</span>';

                const row = document.createElement("div");
                row.className = "server-row" + (idTag === "lat" ? " latino-highlight" : "");
                row.innerHTML = `
                    <div class="server-name-group">
                        <ion-icon name="play-circle-outline" class="server-logo"></ion-icon>
                        <div class="server-info">
                            <span class="server-title">
                                ${escapeHtml(nombre)}
                                ${badge}
                            </span>
                            <span class="server-lang">
                                ${escapeHtml([lang || (idTag === "otro" ? "Sin etiqueta" : ""), quality].filter(Boolean).join(" · "))}
                            </span>
                        </div>
                    </div>
                    <div class="server-actions">
                        <button class="btn-action play" data-index="${idx}">

                            <ion-icon
                                name="play">
                            </ion-icon>

                            Reproducir

                        </button>

                    </div>

                `;


                row.querySelector(".btn-action.play").addEventListener("click", () => reproducir(embed, item));
                wrap.appendChild(row);
            });
            serversContainer.appendChild(wrap);
        });
    } else {
        serversContainer.innerHTML = `
            <div style="color:var(--text-muted);padding:20px 0;text-align:center;">
                Este contenido todavía no está disponible
            </div>
        `;
    }

    /* =========================================================
       DESCARGAS (todas, sin filtrar por idioma)
       ========================================================= */

    const downloads = Array.isArray(downloadsRaw) ? downloadsRaw : [];


    if (downloads.length > 0) {

        downloadsSection.classList.remove(
            "hidden"
        );


        /*
         * Botón de descargas
         */

        let downloadsToggle =
            document.getElementById(
                "mz-downloads-toggle"
            );


        if (!downloadsToggle) {

            downloadsToggle =
                document.createElement(
                    "button"
                );

            downloadsToggle.id =
                "mz-downloads-toggle";

            downloadsToggle.className =
                "mz-collapse-toggle";

            downloadsToggle.type =
                "button";

            downloadsToggle.innerHTML = `

                <span class="mz-collapse-left">

                    <ion-icon
                        name="cloud-download-outline">
                    </ion-icon>

                    <span>
                        Opciones de descarga
                    </span>

                </span>

                <ion-icon
                    class="mz-collapse-arrow"
                    name="chevron-down-outline">
                </ion-icon>

            `;


            /*
             * Lo ponemos antes de la lista
             */

            downloadsContainer.parentNode.insertBefore(
                downloadsToggle,
                downloadsContainer
            );

        }


        /*
         * Inicialmente cerrado
         */

        downloadsContainer.classList.add(
            "mz-collapsed-content"
        );

        downloadsToggle.classList.remove(
            "open"
        );


        /*
         * Abrir / cerrar descargas
         */

        downloadsToggle.onclick =
            function () {

                const abierto =
                    downloadsContainer
                        .classList
                        .contains(
                            "mz-expanded-content"
                        );


                if (abierto) {

                    downloadsContainer
                        .classList
                        .remove(
                            "mz-expanded-content"
                        );

                    downloadsContainer
                        .classList
                        .add(
                            "mz-collapsed-content"
                        );

                    downloadsToggle
                        .classList
                        .remove(
                            "open"
                        );

                } else {

                    downloadsContainer
                        .classList
                        .remove(
                            "mz-collapsed-content"
                        );

                    downloadsContainer
                        .classList
                        .add(
                            "mz-expanded-content"
                        );

                    downloadsToggle
                        .classList
                        .add(
                            "open"
                        );

                }

            };


        /*
         * Crear descargas
         */

        downloads.forEach(
            dl => {

                const url =
                    dl.url ||
                    dl.link ||
                    (
                        typeof dl === "string"
                            ? dl
                            : null
                    );


                if (
                    !url ||
                    typeof url !== "string"
                ) {

                    return;

                }


                const nombre =
                    detectarServidor(
                        url,
                        dl.server ||
                        dl.name ||
                        dl.host
                    );


                const lang =
                    dl.lang ||
                    dl.idioma ||
                    "";


                const quality =
                    dl.quality ||
                    dl.calidad ||
                    "";


                const size =
                    dl.size
                        ? ` (${dl.size})`
                        : "";


                const row =
                    document.createElement(
                        "div"
                    );


                row.className =
                    "server-row";


                row.innerHTML = `

                    <div class="server-name-group">

                        <ion-icon
                            name="cloud-download-outline"
                            class="server-logo">
                        </ion-icon>

                        <div class="server-info">

                            <span class="server-title">

                                ${escapeHtml(nombre)}

                            </span>

                            <span class="server-lang">

                                ${escapeHtml(
                                    [
                                        lang,
                                        quality
                                    ]
                                    .filter(Boolean)
                                    .join(" · ")
                                )}

                                ${escapeHtml(size)}

                            </span>

                        </div>

                    </div>


                    <div class="server-actions">

                        <a
                            class="btn-action download"
                            href="${escapeHtml(url)}"
                            target="_blank"
                            rel="noopener noreferrer"
                        >

                            <ion-icon
                                name="download">
                            </ion-icon>

                            Descargar

                        </a>

                    </div>

                `;


                downloadsContainer.appendChild(
                    row
                );

            }
        );


    } else {

        downloadsSection.classList.add(
            "hidden"
        );


        /*
         * Si no hay descargas, eliminar
         * botón anterior si existiera.
         */

        const oldToggle =
            document.getElementById(
                "mz-downloads-toggle"
            );

        if (oldToggle) {
            oldToggle.remove();
        }

    }

}

// ======================================================
// BÚSQUEDA (solo con Enter)
// ======================================================
searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = searchInput.value.trim();
    if (texto) {
        busquedaEsLocal = false; // online por defecto
        mostrarGrid({ modo: "search", termino: texto });
    }
});

// ======================================================
// NAVEGACIÓN (nav-links, filter-tabs, filter-chips)
// ======================================================
document.getElementById("nav-link-home").addEventListener("click", (e) => {
    e.preventDefault();
    mostrarHome();
});

document.getElementById("nav-link-favoritos").addEventListener("click", (e) => {
    e.preventDefault();
    mostrarGrid({ modo: "favoritos" });
});

document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
        e.preventDefault();
        mostrarGrid({ modo: "categoria", seccion: tab.dataset.type });
    });
});

document.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        gridTypeFilter = chip.dataset.type || "all";

        // Si estamos en búsqueda o favoritos → solo filtramos lo que ya hay
        if (gridModo === "search" || gridModo === "favoritos") {
            if (vistaActual === "grid") cargarPaginaGrid();
            return;
        }

        // Si es categoría normal → cambiamos de sección
        if (gridTypeFilter === "all") {
            mostrarGrid({ modo: "categoria", seccion: "movie" });
        } else {
            mostrarGrid({ modo: "categoria", seccion: gridTypeFilter });
        }
    });
});

document.getElementById("sort-select")?.addEventListener("change", (e) => {
    gridSort = e.target.value || "recent";
    if (vistaActual === "grid") cargarPaginaGrid();
});

// Efecto de navbar al hacer scroll
window.addEventListener("scroll", () => {
    document.getElementById("netflix-navbar").classList.toggle("scrolled", window.scrollY > 20);
});


// ======================================================
// PAGINACIÓN CON BOTONES
// ======================================================
function actualizarPaginacion() {
    let paginacion = document.getElementById("pagination-controls");
    
    // Si no existe el contenedor, lo creamos
    if (!paginacion) {
        paginacion = document.createElement("div");
        paginacion.id = "pagination-controls";
        paginacion.className = "pagination-controls";
        // Lo insertamos después del grid
        resultsGrid.parentNode.insertBefore(paginacion, resultsGrid.nextSibling);
    }

    // Mostrar en categoría y búsqueda (no en favoritos)
    if (gridModo === "favoritos" || gridTotalPages <= 1) {
        paginacion.classList.add("hidden");
        paginacion.innerHTML = "";
        return;
    }

    paginacion.classList.remove("hidden");

    paginacion.innerHTML = `
        <div class="pagination-buttons">
            <button class="btn-page" id="btn-prev-page" ${gridPage <= 1 ? "disabled" : ""}>
                ← Anterior
            </button>
            <button class="btn-page" id="btn-next-page" ${gridPage >= gridTotalPages ? "disabled" : ""}>
                Siguiente →
            </button>
        </div>
        <div class="page-info">
            Página <strong>${gridPage}</strong> de <strong>${gridTotalPages}</strong>
        </div>
    `;

    document.getElementById("btn-prev-page")?.addEventListener("click", () => {
        if (gridPage > 1) {
            gridPage--;
            cargarPaginaGrid();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    document.getElementById("btn-next-page")?.addEventListener("click", () => {
        if (gridPage < gridTotalPages) {
            gridPage++;
            cargarPaginaGrid();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });
}

// ======================================================
// INICIO
// ======================================================

initWakeupNotice();
cargarHome();

// ---------- Aviso de visita a Telegram (1 vez por sesión, se puede apagar en el server) ----------
(function reportarVisita() {
    try {
        if (sessionStorage.getItem("mz_visit_sent") === "1") return;
        const ua = navigator.userAgent || "";
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
        const isTablet = /iPad|Tablet/i.test(ua);
        let device = "Desktop";
        if (isTablet) device = "Tablet";
        else if (isMobile) device = "Móvil";

        let os = "Desconocido";
        if (/Windows/i.test(ua)) os = "Windows";
        else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
        else if (/Android/i.test(ua)) os = "Android";
        else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
        else if (/Linux/i.test(ua)) os = "Linux";

        let browser = "Desconocido";
        if (/Edg\//i.test(ua)) browser = "Edge";
        else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
        else if (/Firefox\//i.test(ua)) browser = "Firefox";
        else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
        else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";

        const payload = {
            device,
            os,
            browser,
            screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
            lang: navigator.language || "",
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
            url: location.href,
            referrer: document.referrer || "",
        };

        fetch("/api/visit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            keepalive: true,
        }).then(() => {
            sessionStorage.setItem("mz_visit_sent", "1");
        }).catch(() => {});
    } catch (_) {}
})();



// ---------- Deep link /?id=... o /?link=... ----------
(async function handleDeepLink() {
    const p = new URLSearchParams(location.search);
    const id = p.get("id");
    const link = p.get("link");
    if (!id && !link) return;
    try {
        const q = id ? `id=${encodeURIComponent(id)}` : `link=${encodeURIComponent(link)}`;
        const res = await fetch(`/api/detalle?${q}`);
        const item = await res.json();
        if (item && (item.nombre || item.link)) abrirDetalle(item);
    } catch (e) { console.warn("Deep link:", e); }
})();

// ---------- Continuar viendo (localStorage) ----------
let progresoTimer = null;
let progresoActual = null; // { key, item, segundos, duracion }

function claveProgreso(item) {
    return item?.link || (item?.id != null ? String(item.id) : null) || item?.postId || null;
}

function obtenerProgreso() {
    try { return JSON.parse(localStorage.getItem("moviezone_progress") || "{}"); }
    catch { return {}; }
}

function guardarProgreso(item, segundos = 0, duracion = 0) {
    const key = claveProgreso(item);
    if (!key) return;
    const all = obtenerProgreso();
    all[key] = {
        link: item.link || null,
        id: item.id || null,
        postId: item.postId || item.id || null,
        nombre: item.nombre,
        portada: item.portada,
        backdrop: item.backdrop || null,
        tipo: item.tipo,
        year: item.year,
        calificacion: item.calificacion,
        descripcion: item.descripcion || null,
        genero: item.genero || null,
        // importante para el badge
        tiene_player: true,
        // no hace falta guardar todos los embeds (pesan); al abrir se piden a la API
        segundos: Math.max(0, Math.floor(segundos)),
        duracion: Math.max(0, Math.floor(duracion)),
        updated: Date.now()
    };
    const ordenados = Object.entries(all)
        .sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0))
        .slice(0, 30);
    localStorage.setItem("moviezone_progress", JSON.stringify(Object.fromEntries(ordenados)));
}

function iniciarSeguimientoProgreso(item) {
    detenerSeguimientoProgreso();
    const key = claveProgreso(item);
    if (!key) return;
    const prev = obtenerProgreso()[key];
    progresoActual = {
        key,
        item,
        segundos: prev?.segundos || 0,
        duracion: prev?.duracion || 0
    };
    // Cada 15s guarda (los iframes de terceros no dan currentTime fiable)
    progresoTimer = setInterval(() => {
        if (!progresoActual) return;
        progresoActual.segundos += 15;
        guardarProgreso(progresoActual.item, progresoActual.segundos, progresoActual.duracion || progresoActual.segundos + 60);
    }, 15000);
}

function detenerSeguimientoProgreso(guardar = true) {
    if (progresoTimer) {
        clearInterval(progresoTimer);
        progresoTimer = null;
    }
    if (guardar && progresoActual) {
        guardarProgreso(progresoActual.item, progresoActual.segundos, progresoActual.duracion || progresoActual.segundos + 60);
    }
    progresoActual = null;
}

function cargarContinuarViendo() {
    const all = obtenerProgreso();
    const lista = Object.values(all)
        .filter(x => x && (x.segundos || 0) > 10)
        .sort((a, b) => (b.updated || 0) - (a.updated || 0))
        .slice(0, 12);

    const row = document.getElementById("row-continuar");
    const cont = document.getElementById("carousel-continuar");
    if (!row || !cont) return;

    if (!lista.length) {
        row.classList.add("hidden");
        return;
    }
    row.classList.remove("hidden");
    cont.innerHTML = "";

    lista.forEach(item => {
        item.tiene_player = true;
        const card = crearMediaCard(item);

        // barra progreso
        const pct = item.duracion > 0
            ? Math.min(100, Math.round((item.segundos / item.duracion) * 100))
            : Math.min(95, Math.round((item.segundos / 600) * 100));
        const bar = document.createElement("div");
        bar.className = "progress-bar-wrap";
        bar.innerHTML = `<div class="progress-bar-fill" style="width:${pct}%"></div>`;
        card.querySelector(".poster-wrapper")?.appendChild(bar);

        // Reemplazar handler: solo abrirDesdeProgreso
        const clone = card.cloneNode(true);
        clone.addEventListener("click", () => abrirDesdeProgreso(item));
        cont.appendChild(clone);
    });
}

// ---------- Recién añadidos ----------
async function cargarRecienAnadidos() {
    try {
        const res = await fetch("/api/recien?limit=12");
        const data = await res.json();
        renderCarousel("carousel-recien", data.resultados || []);
    } catch {
        const el = document.getElementById("carousel-recien");
        if (el) el.innerHTML = `<p style="color:var(--text-muted)">No disponible</p>`;
    }
}

// Llamar desde cargarHome() después de los carousels normales:
// cargarContinuarViendo();
// cargarRecienAnadidos();

// ---------- PWA ----------
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
}
