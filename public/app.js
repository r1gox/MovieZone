// ======================================================
// MOVIEZONE — app.js (adaptado al template "Cypher")
// ======================================================

import { initWakeupNotice } from './js/ui/wakeup.js';
import { getCatalog, searchCatalog } from './js/data/catalogo.js';

// ===== Koi PC detail (inline) =====
/**
 * MovieZone — Modo detalle/player estilo Koiflix SOLO en PC
 * para series y animes. Usa los mismos datos que ya pinta app.js.
 * No cambia el flujo: solo clases CSS + relleno del hero.
 */

const KOI_MQ = window.matchMedia("(min-width: 1025px)");

function isKoiDesktop() {
  return (typeof window !== "undefined" && window.innerWidth >= 1025) || KOI_MQ.matches;
}

function isSerieOrAnime(item) {
  if (!item) return false;
  // OVA/ONA/Especial de 1 ep (o film) se tratan como película, no como serie
  if (typeof isPeliculaItem === "function" && isPeliculaItem(item)) return false;
  const t = String(item.tipo || item.type || "").toLowerCase();
  // Película (anime film, OVA-movie, etc.) → NO es serie: detalle tipo película
  if (/pel[ií]cula|movie|film/.test(t)) return false;
  const f = String(item.formato || item.format || "").toLowerCase();
  if (/pel[ií]cula|movie|film/.test(f) && !/serie|tv|dorama/.test(t)) return false;
  return /serie|anime|dorama|tv|ova|ona|especial|special/.test(t);
}

/** true si el ítem debe abrirse como película (play + servers, sin temporadas) */
function isPeliculaItem(item) {
  if (!item) return false;
  const t = String(item.tipo || item.type || "").toLowerCase();
  if (/pel[ií]cula|movie|film/.test(t)) return true;
  const f = String(item.formato || item.format || "").toLowerCase();
  if (/pel[ií]cula|movie|film/.test(f)) return true;

  // Contar episodios (lista plana o dentro de temporadas)
  const eps = item.episodios || item.episodes;
  const hasEps = Array.isArray(eps) && eps.length > 0;
  const temps = Array.isArray(item.temporadas) ? item.temporadas : [];
  const tempsRaw = Array.isArray(item.temporadas_raw) ? item.temporadas_raw : [];
  const hasTemps = temps.length > 0 || tempsRaw.length > 0;
  let epCount = 0;
  if (hasEps) epCount = eps.length;
  function sumTempLists(arr) {
    for (let i = 0; i < arr.length; i++) {
      const tm = arr[i];
      if (!tm || typeof tm !== "object") continue;
      const lista = tm.lista || (Array.isArray(tm.episodios) ? tm.episodios : null);
      if (Array.isArray(lista)) epCount += lista.length;
      else if (typeof tm.episodios === "number") epCount += tm.episodios;
    }
  }
  sumTempLists(temps);
  sumTempLists(tempsRaw);
  const totalEp = parseInt(item.total_episodios || item.totalEpisodios || 0, 10) || 0;
  if (totalEp > 0) epCount = Math.max(epCount, totalEp);

  // Players en raíz (JK/AV1 usan reproductores[])
  const hasPlayers =
    (Array.isArray(item.embeds) && item.embeds.length > 0) ||
    (Array.isArray(item.reproductores) && item.reproductores.length > 0) ||
    !!item.reproductor ||
    !!item.tiene_player;

  // Sin lista de episodios/temps + players → película
  if (hasPlayers && !hasEps && !hasTemps) return true;

  // OVA / ONA / Especial: 0–1 episodio (worker: concluido + 1 ep → players en ficha)
  const esCorto = /ova|ona|especial|special/.test(t) || /ova|ona|especial|special/.test(f);
  const estado = String(item.estado || item.status || "").toLowerCase();
  const concluido = /conclu|finaliz|ended|finished|complete/.test(estado);
  if (esCorto && epCount <= 1) {
    if (hasPlayers || concluido || totalEp === 1 || epCount === 1) return true;
  }
  // Cualquier título con 1 ep total + players en raíz + concluido (sin multi-temp real)
  if (epCount <= 1 && hasPlayers && concluido && !hasEps) {
    // si hay temps con más de un ep ya contado arriba
    if (epCount <= 1) return true;
  }

  return false;
}


/** AnimeAV1 (source 4): rating de la fuente → mostrar como MAL (azul) */
function isRatingMalFuente(item) {
  if (!item) return false;
  const src = String(item.rating_source || "").toLowerCase();
  if (src && src !== "fuente" && src !== "mal" && src !== "source") return false;
  // Si no hay rating_source, no forzar MAL salvo que sea claramente fuente
  if (!src) return false;
  const sid = String(item.source_id || item.fuente || item.source || "").toLowerCase();
  if (sid === "4" || sid === "animeav1" || /animeav1/.test(sid)) return true;
  const t = String(item.tipo || item.type || "").toLowerCase();
  return /anime/.test(t) && (sid === "4" || sid === "animeav1");
}

/** pelisplushd_bz: rating "fuente" en la página es IMDb → logo IMDb */
function isRatingImdbFuenteBz(item) {
  if (!item) return false;
  const src = String(item.rating_source || "").toLowerCase();
  if (src && src !== "fuente" && src !== "source" && src !== "imdb") return false;
  const sid = String(item.source_id || item.fuente || item.source || "").toLowerCase();
  const link = String(item.link || item.url || "").toLowerCase();
  return (
    sid === "9" ||
    sid === "pelisplushd_bz" ||
    sid === "ppbz" ||
    sid === "bz" ||
    /pelisplushd_bz/.test(sid) ||
    /pelisplushd\.bz/.test(link)
  );
}

/** Activa/desactiva el layout Koiflix en body */
function setKoiMode(item) {
  const esPeliMode = !!(item && (typeof isPeliculaItem === "function" ? isPeliculaItem(item) : /pel[ií]cula|movie|film/i.test(String(item.tipo || item.type || ""))));
  const esSA = !esPeliMode && isSerieOrAnime(item);
  // PC y móvil: películas, series y animes usan el hero
  const on = !!(item && (esSA || esPeliMode));
  // mobile-fixes.css requiere body.koi-desktop también en móvil
  document.body.classList.toggle("koi-desktop", on);
  const forceMovieLayout = document.body.classList.contains("mz-mobile-ep-playing");
  document.body.classList.toggle("koi-movie", !!(on && esPeliMode) || forceMovieLayout);
  document.body.classList.toggle("koi-serie", on && esSA);
  
  const hero = document.getElementById("koi-hero");
  if (hero) hero.setAttribute("aria-hidden", on ? "false" : "true");
  const h4 = document.querySelector("#seasons-section > h4");
  if (h4) {
    if (esPeliMode) h4.textContent = "Reproductores";
    else h4.textContent = on ? "Episodios" : "Temporadas y Capítulos";
  }
  const serversTitle = document.getElementById("servers-section-title");
  if (serversTitle) serversTitle.textContent = "Reproductores";
  // Series/animes en detalle: NUNCA mostrar bloque Reproductores
  try {
    const ss = document.getElementById("servers-section");
    const ds = document.getElementById("downloads-section");
    const tg = document.getElementById("mz-servers-toggle");
    if (on && !esPeliMode && !document.body.classList.contains("player-open")) {
      if (ss) ss.classList.add("hidden");
      if (ds) ds.classList.add("hidden");
      if (tg) tg.remove();
    }
  } catch (_) {}
  try { bindKoiBackBtn(); } catch (_) {}
  return on;
}

function mzScrollPanelTo(el) {
  if (!el) return;
  try {
    const body =
      document.querySelector("#details-panel .details-content") ||
      document.querySelector("#details-panel .details-body") ||
      document.getElementById("details-panel");
    if (body && body.scrollHeight > body.clientHeight + 20) {
      const top =
        el.getBoundingClientRect().top -
        body.getBoundingClientRect().top +
        body.scrollTop -
        20;
      body.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (_) {
    try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (__) {}
  }
}

function clearKoiMode() {
  document.body.classList.remove("koi-desktop", "koi-movie", "player-open");
  const hero = document.getElementById("koi-hero");
  if (hero) hero.setAttribute("aria-hidden", "true");
  const h4 = document.querySelector("#seasons-section > h4");
  if (h4) h4.textContent = "Temporadas y Capítulos";
}


function bindKoiBackBtn() {
  const btn = document.getElementById("koi-btn-back");
  if (!btn || btn.dataset.koiBound) return;
  btn.dataset.koiBound = "1";
  btn.addEventListener("click", () => {
    const path = location.pathname || "";
    // Episodio /detalle/…/t/e → cerrar player + atrás a ficha
    if (/\/detalle\/(?:\d+\/)?[^\/]+\/\d+\/\d+\/?$/i.test(path)) {
      try {
        if (typeof window.mzKoiCloseEpisode === "function") window.mzKoiCloseEpisode();
        else history.back();
      } catch (_) {
        try { history.back(); } catch (__) {}
      }
      return;
    }
    // Player abierto sin URL de episodio
    if (document.body.classList.contains("player-open")) {
      document.body.classList.remove("player-open");
      try {
        const iframe = document.getElementById("player-iframe");
        if (iframe) iframe.src = "about:blank";
        document.getElementById("video-player-container")?.classList.add("hidden");
        document.getElementById("servers-section")?.classList.add("hidden");
        setKoiPlayerEpisodeTitle("");
      } catch (_) {}
      try {
        document.getElementById("koi-hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (_) {}
      return;
    }
    // Ficha /detalle/… → cerrar detalle (más fiable que history.back en SPA)
    if (/^\/detalle\//i.test(path)) {
      try { cerrarDetalle(false); } catch (_) {}
      return;
    }
    try { cerrarDetalle(false); } catch (_) {}
  });
}

function firstEpisodeLabel(item) {
  const eps = item?.episodios || item?.episodes || [];
  if (Array.isArray(eps) && eps.length) {
    const n = Number(eps[0].episode || eps[0].episodio || eps[0].episode_number || 1) || 1;
    return `COMENZAR A VER E${n}`;
  }
  return "COMENZAR A VER E1";
}

function genresText(item) {
  let lista = [];
  if (Array.isArray(item.generos) && item.generos.length) {
    lista = item.generos.map((g) => String(g).trim()).filter(Boolean);
  } else if (item.genero) {
    lista = String(item.genero).split(",").map((g) => g.trim()).filter(Boolean);
  }
  return lista.slice(0, 6).join(", ");
}

function langLabel(item) {
  const l = item.idioma || item.audio || item.language || "";
  if (/jap|jpn|ja/i.test(String(l))) return "Japonés";
  if (/lat|es-la|latino/i.test(String(l))) return "Latino";
  if (/cast|es-es|español/i.test(String(l))) return "Castellano";
  if (/en|ingl/i.test(String(l))) return "Inglés";
  if (/anime/i.test(String(item.tipo || ""))) return "Japonés";
  return l || "Español";
}

/**
 * Rellena el hero Koiflix con los datos del item actual.
 * Llamar después de pintar el detalle normal.
 */
function fillKoiHero(item) {
    if (!item) return;
    // formato Pelicula + tipo Anime (films AV1) cuenta como película
    const esPeli = typeof isPeliculaItem === "function"
      ? isPeliculaItem(item)
      : /pel[ií]cula|movie|film/i.test(String(item.tipo || item.type || item.formato || ""));
    const esSA = !esPeli && isSerieOrAnime(item);
    if (!esPeli && !esSA) return;
    // PC: series/anime/peli. Móvil: solo películas (hero + REPRODUCIR)
  //  if (!isKoiDesktop() && !esPeli) return;

  const bg =
    item.backdrop ||
    item.fondo ||
    item.banner ||
    item.portada_imdb ||
    item.portada ||
    item.poster ||
    "";

  const hero = document.getElementById("koi-hero");
  if (hero) {
    if (bg) {
      hero.style.backgroundImage = `url("${bg}")`;
      hero.classList.remove("no-bg");
    } else {
      hero.style.backgroundImage = "";
      hero.classList.add("no-bg");
    }
  }

  const logoEl = document.getElementById("koi-hero-logo");
  const titleEl = document.getElementById("koi-hero-title");
  const logoUrl = item.logo || item.logo_url || (document.getElementById("details-logo")?.src) || "";

  if (logoEl && logoUrl && !/placeholder|via\.placeholder/i.test(logoUrl)) {
    logoEl.src = logoUrl;
    logoEl.alt = item.nombre || item.titulo || "";
    logoEl.classList.remove("hidden");
    if (titleEl) titleEl.classList.add("hidden");
  } else {
    if (logoEl) {
      logoEl.src = "";
      logoEl.classList.add("hidden");
    }
    if (titleEl) {
      titleEl.textContent = item.nombre || item.titulo || "Sin título";
      titleEl.classList.remove("hidden");
    }
  }


  // Título original debajo del título/logo
  let origHero = document.getElementById("koi-hero-original");
  if (!origHero) {
    origHero = document.createElement("p");
    origHero.id = "koi-hero-original";
    origHero.className = "koi-hero-original";
    const titleEl2 = document.getElementById("koi-hero-title");
    const metaAnchor = document.getElementById("koi-hero-meta");
    if (metaAnchor && metaAnchor.parentNode) {
      metaAnchor.parentNode.insertBefore(origHero, metaAnchor);
    } else if (titleEl2 && titleEl2.parentNode) {
      titleEl2.parentNode.insertBefore(origHero, titleEl2.nextSibling);
    }
  }
  const mainT = String(item.nombre || item.titulo || "").trim();
  const origT = String(item.titulo_original || (item.tmdb && item.tmdb.titulo) || "").trim();
  if (origT && origT.toLowerCase() !== mainT.toLowerCase()) {
    origHero.textContent = origT;
    origHero.classList.remove("hidden");
    origHero.style.display = "";
  } else {
    origHero.textContent = "";
    origHero.classList.add("hidden");
    origHero.style.display = "none";
  }

  const metaEl = document.getElementById("koi-hero-meta");
  if (metaEl) {
    const bits = [];
    const push = (html) => {
      if (bits.length) bits.push('<span class="koi-meta-sep">•</span>');
      bits.push(html);
    };

    // Idioma
    if (typeof langLabel === "function") {
      const lang = langLabel(item);
      if (lang) push('<span class="koi-meta-lang">' + lang + "</span>");
    }

    // Año y/o fecha (no repetir 1999 y 20/10/1999)
    const year = item.year || item.anio || (item.fecha_estreno ? String(item.fecha_estreno).slice(0, 4) : "");
    let releaseLabel = null;
    if (item.fecha_estreno) {
      const f = String(item.fecha_estreno).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
        const [yy, mm, dd] = f.split("-");
        releaseLabel = dd + "/" + mm + "/" + yy;
      } else if (f && f !== String(year)) {
        releaseLabel = f;
      }
    }
    if (releaseLabel) {
      push("<span>" + releaseLabel + "</span>");
    } else if (year) {
      push("<span>" + year + "</span>");
    }

    // Rating: IMDb / MAL (fuente animeav1) / genérico
    let scoreLabel = "";
    let scoreIsImdb = false;
    let scoreIsMal = false;
    if (typeof ratingInfo === "function") {
      const r = ratingInfo(item);
      if (r && r.value != null && !isNaN(Number(r.value))) {
        scoreLabel = Number(r.value).toFixed(1);
        scoreIsImdb = r.source === "imdb" || r.source === "omdb";
        scoreIsMal = r.source === "mal";
      } else if (r && r.label && !isNaN(Number(String(r.label).replace(/[^0-9.]/g, "")))) {
        scoreLabel = Number(String(r.label).replace(/[^0-9.]/g, "")).toFixed(1);
        scoreIsImdb = r.source === "imdb" || r.source === "omdb";
        scoreIsMal = r.source === "mal";
      }
    } else if (item.imdb && item.imdb.rating != null) {
      scoreLabel = Number(item.imdb.rating).toFixed(1);
      scoreIsImdb = true;
    } else if (item.calificacion != null && item.calificacion !== "") {
      scoreLabel = Number(item.calificacion).toFixed(1);
      scoreIsImdb = /imdb|omdb/i.test(String(item.rating_source || ""));
      scoreIsMal = typeof isRatingMalFuente === "function" && isRatingMalFuente(item);
    } else if (item.rating != null && item.rating !== "") {
      scoreLabel = Number(item.rating).toFixed(1);
      scoreIsImdb = /imdb|omdb/i.test(String(item.rating_source || ""));
      scoreIsMal = typeof isRatingMalFuente === "function" && isRatingMalFuente(item);
    }
    if (/imdb|omdb/i.test(String(item.rating_source || ""))) scoreIsImdb = true;
    if (!scoreIsImdb && typeof isRatingMalFuente === "function" && isRatingMalFuente(item)) scoreIsMal = true;
    if (scoreLabel && !isNaN(Number(scoreLabel))) {
      if (scoreIsImdb) {
        push(
          '<span class="koi-imdb-inline" title="IMDb ' + scoreLabel + '">' +
            '<span class="koi-imdb-score">' + scoreLabel + "</span>" +
            '<span class="koi-imdb-tag"> IMDb</span></span>'
        );
      } else if (scoreIsMal) {
        push(
          '<span class="koi-imdb-inline koi-mal-inline" title="MAL ' + scoreLabel + '">' +
            '<span class="koi-imdb-score">' + scoreLabel + "</span>" +
            '<span class="koi-mal-tag"> MAL</span></span>'
        );
      } else {
        push(
          '<span class="koi-imdb-inline koi-score-only" title="Rating ' + scoreLabel + '">' +
            '<span class="koi-imdb-score">' + scoreLabel + "</span></span>"
        );
      }
    }

    // Duración
    let durTxt = item.duracion_texto || null;
    if (!durTxt && item.imdb && item.imdb.duracion_texto) durTxt = item.imdb.duracion_texto;
    if (!durTxt && item.tmdb && item.tmdb.duracion_texto) durTxt = item.tmdb.duracion_texto;
    if (!durTxt && item.duracion) {
      const m = Number(item.duracion);
      if (m >= 60) {
        const h = Math.floor(m / 60);
        const mins = m % 60;
        durTxt = mins ? h + "h " + mins + "min" : h + "h";
      } else if (m > 0) durTxt = m + " min";
    }
    if (durTxt) push("<span>" + durTxt + "</span>");

    // Certificación (B15, TV-14, R…)
    const cert = item.certificacion || (item.imdb && item.imdb.certificacion) || null;
    if (cert) push("<span>" + String(cert) + "</span>");

    // Estado: En emisión / Finalizado (Continuing, ended, Concluido…)
    const _stK = typeof mzNormEstado === "function" ? mzNormEstado(item) : null;
    let statusLabel = _stK ? _stK.label : null;
    if (!statusLabel && item.estado) statusLabel = String(item.estado);
    if (statusLabel) {
      const kind = (_stK && _stK.kind) || (/emis|continuing|airing/i.test(statusLabel) ? "air" : "end");
      push(
        '<span class="koi-meta-status' +
          (kind === "air" ? " koi-meta-air" : kind === "end" ? " koi-meta-end" : "") +
          '">' +
          statusLabel +
          "</span>"
      );
    }

    // Votos
    const votos = item.votos || (item.imdb && item.imdb.votos) || null;
    if (votos) push("<span>" + String(votos) + " votos</span>");

    // Géneros
    const gens = typeof genresText === "function" ? genresText(item) : (item.genero || "");
    if (gens) push("<span>" + gens + "</span>");

    metaEl.innerHTML = bits.join("");
  }


  const synEl = document.getElementById("koi-hero-synopsis");
  const toggleBtn = document.getElementById("koi-toggle-details");
  const fullSyn =
    (item.descripcion && String(item.descripcion).trim()) ||
    document.getElementById("details-synopsis")?.textContent ||
    "";
  if (synEl) {
    synEl.textContent = fullSyn;
    synEl.dataset.full = fullSyn;
    // Si es larga, clamp + botón MÁS DETALLES
    if (fullSyn.length > 220) {
      synEl.classList.add("koi-syn-clamp");
      synEl.classList.remove("koi-syn-open");
      if (toggleBtn) {
        toggleBtn.classList.remove("hidden");
        toggleBtn.textContent = "MÁS DETALLES";
      }
    } else {
      synEl.classList.remove("koi-syn-clamp", "koi-syn-open");
      if (toggleBtn) toggleBtn.classList.add("hidden");
    }
  }

  const playText = document.getElementById("koi-btn-play-text");
  if (playText) {
    const esPeli = typeof isPeliculaItem === "function" ? isPeliculaItem(item) : /pel[ií]cula|movie|film/i.test(String(item.tipo || item.type || ""));
    playText.textContent = esPeli ? "REPRODUCIR" : firstEpisodeLabel(item);
  }

}

/** Actualiza título de episodio en layout player PC */
function setKoiPlayerEpisodeTitle(label) {
  const el = document.getElementById("koi-player-ep-title");
  if (el) el.textContent = label || "";
}

/** Marca player abierto / cerrado para CSS */
function setKoiPlayerOpen(on) {
  document.body.classList.toggle("player-open", !!on);
}

/** Enlaza botones del hero (una sola vez) */
function bindKoiHeroControls(handlers = {}) {
  const playBtn = document.getElementById("koi-btn-play");
  const bookmarkBtn = document.getElementById("koi-btn-bookmark");

  // Siempre actualizar el handler al ítem actual
  window.__mzKoiHandlers = handlers || {};
  if (playBtn && !playBtn.dataset.koiBound) {
    playBtn.dataset.koiBound = "1";
    playBtn.addEventListener("click", () => {
      const h = window.__mzKoiHandlers || {};
      if (typeof h.onPlay === "function") h.onPlay();
      else {
        const first =
          document.querySelector("#episodes-container [data-ep]") ||
          document.querySelector("#episodes-container button") ||
          document.querySelector("#episodes-container > *");
        first?.click?.();
      }
    });
  }

  if (bookmarkBtn && !bookmarkBtn.dataset.koiBound) {
    bookmarkBtn.dataset.koiBound = "1";
    bookmarkBtn.addEventListener("click", () => {
      const fav = document.getElementById("btn-favorito");
      if (fav) {
        fav.click();
        try { actualizarBotonFavorito(); } catch (_) {}
      } else if (typeof handlers !== "undefined" && typeof handlers.onBookmark === "function") {
        handlers.onBookmark();
      } else {
        const h = window.__mzKoiHandlers || {};
        if (typeof h.onBookmark === "function") h.onBookmark();
      }
    });
  }

  const toggleBtn = document.getElementById("koi-toggle-details");
  if (toggleBtn && !toggleBtn.dataset.koiBound) {
    toggleBtn.dataset.koiBound = "1";
    toggleBtn.addEventListener("click", () => {
      const synEl = document.getElementById("koi-hero-synopsis");
      if (!synEl) return;
      const open = synEl.classList.toggle("koi-syn-open");
      if (open) synEl.classList.remove("koi-syn-clamp");
      else synEl.classList.add("koi-syn-clamp");
      toggleBtn.textContent = open ? "MENOS DETALLES" : "MÁS DETALLES";
    });
  }
}

// ===== fin Koi =====

const LIMIT = 48;

// ======================================================
// PERFILES · HOME PREMIUM · BADGES · NOTIFY · ORDEN EPS
// ======================================================
const MZ_PROFILES_KEY = "mz_profiles_v1";
const MZ_ACTIVE_PROFILE = "mz_active_profile";
const MZ_ONBOARDED = "mz_onboarded_v1";

function defaultProfiles() {
  return [];
}
function getProfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(MZ_PROFILES_KEY) || "null");
    if (Array.isArray(raw)) return raw;
  } catch (_) {}
  return [];
}
function saveProfiles(list) {
  localStorage.setItem(MZ_PROFILES_KEY, JSON.stringify(list));
}
function getActiveProfile() {
  const list = getProfiles();
  const id = localStorage.getItem(MZ_ACTIVE_PROFILE);
  return list.find((p) => p.id === id) || list[0] || null;
}
function setActiveProfile(id) {
  if (!id) return;
  localStorage.setItem(MZ_ACTIVE_PROFILE, id);
  localStorage.setItem(MZ_ONBOARDED, "1");
  try { hideProfileGate(); } catch (_) {}
  // Evitar que el formulario quede abierto y el gate reaparezca
  try {
    const form = document.getElementById("mz-create-form");
    if (form) {
      form.classList.add("hidden");
      form.classList.remove("mz-create-open");
      form.reset?.();
    }
    document.getElementById("mz-profile-list")?.classList.remove("mz-dimmed");
  } catch (_) {}
  // Recarga limpia para aplicar pk() de favoritos/lista del perfil
  location.replace(location.pathname + location.search + location.hash);
}
function pk(key) {
  const p = getActiveProfile();
  return `mz_${p ? p.id : "guest"}_${key}`;
}
function uid() {
  return "p_" + Math.random().toString(36).slice(2, 9);
}
const PROFILE_COLORS = ["#7c3aed", "#22c55e", "#e50914", "#0ea5e9", "#f59e0b", "#ec4899"];

function showProfileGate(mode) {
  // mode: "pick" | "first"
  const gate = document.getElementById("mz-profile-gate");
  if (!gate) return;
  gate.classList.remove("hidden");
  gate.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const title = document.getElementById("mz-gate-title");
  const sub = document.getElementById("mz-gate-sub");
  const listEl = document.getElementById("mz-profile-list");
  const form = document.getElementById("mz-create-form");
  if (form) form.classList.add("hidden");

  const profiles = getProfiles();
  if (title) title.textContent = "¿Quién está viendo?";
  if (sub) {
    sub.textContent = profiles.length
      ? "Selecciona un perfil para continuar"
      : "Crea un perfil para personalizar tu experiencia";
  }

  if (listEl) {
    listEl.innerHTML = "";
    profiles.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mz-profile-card";
      const letter = (p.nombre || "?")[0].toUpperCase();
      const kids = p.tipo === "kids" ? '<span class="mz-kids-tag">Niños</span>' : "";
      btn.innerHTML = `<div class="av" style="background:${p.color || "#7c3aed"}">${letter}</div><span class="mz-profile-label">${p.nombre || "Perfil"}</span>${kids}`;
      btn.onclick = () => setActiveProfile(p.id);
      listEl.appendChild(btn);
    });
    if (profiles.length < 5) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "mz-profile-card mz-profile-add";
      add.innerHTML = `<div class="av av-add"><ion-icon name="add-outline"></ion-icon></div><span class="mz-profile-label">Agregar perfil</span>`;
      add.onclick = () => document.getElementById("mz-btn-create")?.click();
      listEl.appendChild(add);
    }
  }
}

function hideProfileGate() {
  const gate = document.getElementById("mz-profile-gate");
  if (!gate) return;
  gate.classList.add("hidden");
  gate.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function ensureProfileAccess() {
  const profiles = getProfiles();
  const active = getActiveProfile();
  const onboarded = localStorage.getItem(MZ_ONBOARDED) === "1";

  // Primera visita o sin perfil activo → gate
  if (!profiles.length) {
    showProfileGate("first");
    return false;
  }
  if (!active) {
    // Hay perfiles pero ninguno activo → elegir, no forzar crear
    showProfileGate("pick");
    return false;
  }
  if (!onboarded) {
    localStorage.setItem(MZ_ONBOARDED, "1");
  }
  return true;
}

function initProfilesUi() {
  const chip = document.getElementById("mz-profile-chip");
  const nameEl = document.getElementById("mz-profile-name");
  const avEl = document.getElementById("mz-profile-avatar");

  const ok = ensureProfileAccess();
  const p = getActiveProfile();

  if (p) {
    if (nameEl) nameEl.textContent = p.nombre || "Perfil";
    if (avEl) {
      avEl.textContent = (p.nombre || "?")[0].toUpperCase();
      avEl.style.background = p.color || "#7c3aed";
    }
    if (chip) chip.style.borderColor = p.color || "#7c3aed";
  }

  if (chip) {
    chip.onclick = () => showProfileGate("pick");
  }

  const btnGuest = document.getElementById("mz-btn-guest");
  const btnCreate = document.getElementById("mz-btn-create");
  const form = document.getElementById("mz-create-form");
  const cancel = document.getElementById("mz-create-cancel");

  if (btnGuest) {
    btnGuest.onclick = () => {
      let list = getProfiles();
      let guest = list.find((x) => x.tipo === "guest");
      if (!guest) {
        guest = { id: "guest", nombre: "Invitado", tipo: "guest", color: "#64748b" };
        list = list.concat([guest]);
        saveProfiles(list);
      }
      setActiveProfile(guest.id);
    };
  }
  if (btnCreate) {
    btnCreate.onclick = () => {
      if (form) {
        form.classList.remove("hidden");
        form.classList.add("mz-create-open");
      }
      document.getElementById("mz-profile-list")?.classList.add("mz-dimmed");
      document.getElementById("mz-create-name")?.focus();
      const prev = document.getElementById("mz-create-preview");
      const inp = document.getElementById("mz-create-name");
      if (inp && prev && !inp._mzBound) {
        inp._mzBound = true;
        inp.addEventListener("input", () => {
          const v = (inp.value || "?").trim();
          prev.textContent = (v[0] || "?").toUpperCase();
        });
      }
    };
  }
  if (cancel) {
    cancel.onclick = () => {
      form?.classList.add("hidden");
      form?.classList.remove("mz-create-open");
      document.getElementById("mz-profile-list")?.classList.remove("mz-dimmed");
    };
  }
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const input = document.getElementById("mz-create-name");
      const nombre = (input?.value || "").trim().slice(0, 18);
      if (!nombre) return;
      const kids = !!document.getElementById("mz-create-kids")?.checked;
      const list = getProfiles();
      const color = kids ? "#22c55e" : PROFILE_COLORS[list.length % PROFILE_COLORS.length];
      const neu = { id: uid(), nombre, tipo: kids ? "kids" : "adult", color };
      list.push(neu);
      saveProfiles(list);
      // Confirmar que el perfil quedó guardado antes de activar
      const ok = getProfiles().some((p) => p.id === neu.id);
      if (!ok) {
        saveProfiles(list);
      }
      setActiveProfile(neu.id);
    };
  }

  return ok;
}

function badgesHtml(item) {
  const bits = [];
  const airing =
    item.en_emision === true ||
    (item.finalizado !== true && /emisi|airing|en curso|ongoing|returning/i.test(String(item.estado || "")));
  if (airing) {
    bits.push(`<span class="mz-badge mz-badge-air">En emisión</span>`);
  }
  if (item._trendingRank && item._trendingRank <= 10) {
    bits.push(`<span class="mz-badge mz-badge-top">Top ${item._trendingRank}</span>`);
  }
  if (/4k|2160|uhd/i.test(String(item.calidad || item.quality || ""))) {
    bits.push(`<span class="mz-badge mz-badge-4k">4K</span>`);
  }
  if (!bits.length) return "";
  return `<div class="mz-badges">${bits.join("")}</div>`;
}

function obtenerMiLista() {
  try { return JSON.parse(localStorage.getItem(pk("mi_lista")) || "[]"); }
  catch { return []; }
}
function guardarMiLista(lista) {
  localStorage.setItem(pk("mi_lista"), JSON.stringify(lista || []));
}
function toggleMiLista(item) {
  let lista = obtenerMiLista();
  const i = lista.findIndex((x) => x.link === item.link);
  if (i >= 0) lista.splice(i, 1);
  else lista.unshift(item);
  guardarMiLista(lista);
  return i < 0;
}
function cargarMiLista() {
  const row = document.getElementById("row-mi-lista");
  const cont = document.getElementById("carousel-mi-lista");
  if (!row || !cont) return;
  const lista = obtenerMiLista().slice(0, 12);
  if (!lista.length) { row.classList.add("hidden"); return; }
  row.classList.remove("hidden");
  cont.innerHTML = "";
  lista.forEach((item) => cont.appendChild(crearMediaCard(item)));
}

function porqueViste(ultimo, catalogo) {
  if (!ultimo || !Array.isArray(catalogo)) return [];
  const gens = (ultimo.generos || (ultimo.genero ? String(ultimo.genero).split(",") : []))
    .map((g) => String(g).toLowerCase().trim()).filter(Boolean);
  const tipo = ultimo.tipo;
  return catalogo
    .filter((x) => x && x.link && x.link !== ultimo.link && (!tipo || x.tipo === tipo))
    .map((x) => {
      const g2 = (x.generos || (x.genero ? String(x.genero).split(",") : []))
        .map((g) => String(g).toLowerCase().trim());
      const score = gens.filter((g) => g2.includes(g)).length;
      return { x, score };
    })
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((t) => t.x);
}

function cargarPorqueViste() {
  const row = document.getElementById("row-porque");
  const cont = document.getElementById("carousel-porque");
  const titulo = document.getElementById("titulo-porque");
  if (!row || !cont) return;
  const prog = typeof obtenerProgreso === "function" ? obtenerProgreso() : {};
  const ultimo = Object.values(prog || {})
    .filter((x) => x && x.link)
    .sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
  if (!ultimo) { row.classList.add("hidden"); return; }
  const pool = []
    .concat(window.__mzLastPelis || [])
    .concat(window.__mzLastSeries || [])
    .concat(window.__mzLastAnime || []);
  const lista = porqueViste(ultimo, typeof sinItemsJk === "function" ? sinItemsJk(pool) : pool);
  if (!lista.length) { row.classList.add("hidden"); return; }
  if (titulo) titulo.textContent = `Porque viste ${ultimo.nombre || ultimo.titulo || "esto"}`;
  row.classList.remove("hidden");
  cont.innerHTML = "";
  lista.forEach((item) => cont.appendChild(crearMediaCard(item)));
}

function filtrarMood(items, moodId) {
  const list = (items || []).filter(Boolean);
  if (moodId === "maraton") {
    return list.filter((i) => /comedia|acción|accion|aventura|anime/i.test(
      `${i.genero || ""} ${(i.generos || []).join(" ")} ${i.tipo || ""}`
    )).slice(0, 12);
  }
  if (moodId === "terror") {
    return list.filter((i) => /terror|horror|suspenso|thriller/i.test(
      `${i.genero || ""} ${(i.generos || []).join(" ")}`
    )).slice(0, 12);
  }
  return list.slice(0, 12);
}

function sinItemsJk(lista) {
  return (lista || []).filter(function (it) {
    if (!it) return false;
    if (typeof esItemJk === "function" && esItemJk(it)) return false;
    const sid = String(it.source_id || it.fuente || it.source || "").toLowerCase();
    if (sid === "5" || sid === "jkanime" || sid === "jk") return false;
    if (/jkanime\.net/i.test(String(it.link || it.url || ""))) return false;
    return true;
  });
}

function cargarMoodsHome(peliculas, series, anime) {
  window.__mzLastPelis = peliculas || [];
  window.__mzLastSeries = series || [];
  window.__mzLastAnime = anime || [];
  const pool = sinItemsJk([].concat(peliculas || [], series || [], anime || []));
  const map = [
    ["row-mood-maraton", "carousel-mood-maraton", "maraton"],
    ["row-mood-terror", "carousel-mood-terror", "terror"],
  ];
  map.forEach(([rowId, carId, mood]) => {
    const row = document.getElementById(rowId);
    const cont = document.getElementById(carId);
    if (!row || !cont) return;
    const lista = filtrarMood(pool, mood);
    if (!lista.length) { row.classList.add("hidden"); return; }
    row.classList.remove("hidden");
    cont.innerHTML = "";
    lista.forEach((item) => cont.appendChild(crearMediaCard(item)));
  });
}

// --- Orden Airing / Absolute ---
let _epOrderMode = "airing";
function getEpOrderMode() {
  try { return localStorage.getItem(pk("ep_order")) || "airing"; }
  catch { return "airing"; }
}
function setEpOrderMode(mode) {
  _epOrderMode = mode === "absolute" ? "absolute" : "airing";
  localStorage.setItem(pk("ep_order"), _epOrderMode);
  document.querySelectorAll(".mz-ep-order-btn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-order") === _epOrderMode);
  });
}
function ordenarEpisodiosParaUI(item, lista) {
  const eps = (lista || []).slice();
  const mode = getEpOrderMode();
  const forceAbs = (parseInt(item?.total_episodios || item?.totalEpisodios || 0, 10) || 0) > 50;
  if (mode === "absolute" || forceAbs) {
    return eps.sort((a, b) =>
      Number(a.episode || a.episodio || a.episode_number || 0) -
      Number(b.episode || b.episodio || b.episode_number || 0)
    );
  }
  return eps.sort((a, b) => {
    const sa = Number(a.season || a.temporada || 1);
    const sb = Number(b.season || b.temporada || 1);
    if (sa !== sb) return sa - sb;
    return Number(a.episode || a.episodio || a.episode_number || 0) -
           Number(b.episode || b.episodio || b.episode_number || 0);
  });
}
function initEpOrderUi(item) {
  const wrap = document.getElementById("mz-ep-order");
  if (!wrap) return;
  _epOrderMode = getEpOrderMode();
  wrap.querySelectorAll(".mz-ep-order-btn").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-order") === _epOrderMode);
    b.onclick = () => {
      setEpOrderMode(b.getAttribute("data-order"));
      const season = item?._seasonActiva || 1;
      if (item) renderEpisodios(item, season);
    };
  });
}

// --- Notificar nuevo capítulo ---
function obtenerNotifyMap() {
  try { return JSON.parse(localStorage.getItem(pk("notify_series")) || "{}"); }
  catch { return {}; }
}
function guardarNotifyMap(map) {
  localStorage.setItem(pk("notify_series"), JSON.stringify(map || {}));
}
function notifyKey(item) {
  return String(item.slug || item.link || item.nombre || "").slice(0, 180);
}
function esNotifyActivo(item) {
  const k = notifyKey(item);
  return !!(obtenerNotifyMap()[k]);
}
function toggleNotifySerie(item) {
  const map = obtenerNotifyMap();
  const k = notifyKey(item);
  if (map[k]) delete map[k];
  else {
    map[k] = {
      titulo: item.nombre || item.titulo || k,
      lastEp: 0,
      updated: Date.now(),
    };
  }
  guardarNotifyMap(map);
  actualizarBotonNotify(item);
  return !!map[k];
}
function actualizarBotonNotify(item) {
  const btn = document.getElementById("btn-notify-ep");
  const icon = document.getElementById("btn-notify-ep-icon");
  if (!btn) return;
  const on = item && esNotifyActivo(item);
  btn.classList.toggle("active", !!on);
  if (icon) icon.setAttribute("name", on ? "notifications" : "notifications-outline");
}
function maxEpDeItem(item) {
  const eps = item?.episodios || [];
  let m = 0;
  eps.forEach((e) => {
    const n = Number(e.episode || e.episodio || e.episode_number || 0);
    if (n > m) m = n;
  });
  return m;
}
function checkNuevoCapitulo(item) {
  if (!item || !esNotifyActivo(item)) return;
  const map = obtenerNotifyMap();
  const k = notifyKey(item);
  const entry = map[k];
  if (!entry) return;
  const maxEp = maxEpDeItem(item);
  if (maxEp > (entry.lastEp || 0)) {
    const prev = entry.lastEp || 0;
    entry.lastEp = maxEp;
    entry.updated = Date.now();
    map[k] = entry;
    guardarNotifyMap(map);
    if (prev > 0) {
      const msg = `Nuevo capítulo: ${entry.titulo} · E${maxEp}`;
      try {
        if (Notification.permission === "granted") new Notification("MovieZone", { body: msg });
        else alert(msg);
      } catch (_) {
        alert(msg);
      }
    } else {
      entry.lastEp = maxEp;
      guardarNotifyMap(map);
    }
  }
}
function initNotifyBtn() {
  const btn = document.getElementById("btn-notify-ep");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", async () => {
    if (!seleccionActual) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (_) {}
    }
    const on = toggleNotifySerie(seleccionActual);
    if (on) {
      const map = obtenerNotifyMap();
      const k = notifyKey(seleccionActual);
      if (map[k]) {
        map[k].lastEp = maxEpDeItem(seleccionActual);
        guardarNotifyMap(map);
      }
    }
  });
}


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


/** true si hay número de rating (incluye 0.0) */
function mzRatingOk(n) {
    return n != null && !isNaN(n) && n >= 0 && n <= 10;
}

/** Rating con fuente: "IMDb 6.7" / "TMDB 8.8" / fuente 0.0 */
function ratingInfo(item) {
    if (!item) return { label: "—", value: null, source: null, secondary: null };

    const imdbR = item.imdb && item.imdb.rating != null ? Number(item.imdb.rating) : null;
    const tmdbR = item.tmdb && item.tmdb.rating != null ? Number(item.tmdb.rating) : null;
    const omdbR = item.omdb && item.omdb.rating != null ? Number(item.omdb.rating) : null;
    const mainRaw = item.rating != null ? item.rating : (item.calificacion != null ? item.calificacion : null);
    const main = mainRaw != null ? Number(mainRaw) : null;
    const hasImdbId = !!(item.imdb_id || (item.imdb && (item.imdb.id || item.imdb.imdb_id)));
    const srcApi = String(item.rating_source || "").toLowerCase();

    let primary;

    // Prioridad: rating_source imdb (incluye 0)
    if (srcApi === "imdb" && mzRatingOk(main)) {
      primary = { label: main.toFixed(1), value: main, source: "imdb" };
    } else if (mzRatingOk(imdbR) && imdbR > 0) {
      primary = { label: imdbR.toFixed(1), value: imdbR, source: "imdb" };
    } else if (mzRatingOk(omdbR) && omdbR > 0) {
      primary = { label: omdbR.toFixed(1), value: omdbR, source: "omdb" };
    } else if (hasImdbId && mzRatingOk(main) && main <= 10) {
      primary = { label: main.toFixed(1), value: main, source: "imdb" };
    } else if (srcApi === "tmdb" && mzRatingOk(main)) {
      primary = { label: main.toFixed(1), value: main, source: "tmdb" };
    } else if (mzRatingOk(tmdbR) && tmdbR > 0) {
      primary = { label: tmdbR.toFixed(1), value: tmdbR, source: "tmdb" };
    } else if (srcApi === "fuente" || srcApi === "mal" || srcApi === "source") {
      if (mzRatingOk(main)) {
        var srcOut = "fuente";
        if (typeof isRatingMalFuente === "function" && isRatingMalFuente(item)) srcOut = "mal";
        else if (typeof isRatingImdbFuenteBz === "function" && isRatingImdbFuenteBz(item)) srcOut = "imdb";
        primary = {
          label: main.toFixed(1),
          value: main,
          source: srcOut
        };
      } else {
        primary = { label: "—", value: null, source: null };
      }
    } else if (mzRatingOk(main)) {
      var sid4 = String(item.source_id || item.fuente || "").toLowerCase();
      var asMal = (sid4 === "4" || sid4 === "animeav1" || /animeav1/.test(sid4)) &&
        !/imdb|omdb|tmdb/i.test(srcApi);
      var asImdbBz = typeof isRatingImdbFuenteBz === "function" && isRatingImdbFuenteBz(item);
      primary = { label: main.toFixed(1), value: main, source: asMal ? "mal" : (asImdbBz ? "imdb" : "fuente") };
    } else {
      primary = { label: "—", value: null, source: null };
    }

    return Object.assign({ secondary: null }, primary);
}

function ratingBadgeHtml(item) {
    const r = ratingInfo(item);
    // Mostrar 0.0; solo ocultar si no hay número
    if (r.value == null || isNaN(r.value)) {
        return '<div class="rating-badge rating-empty" title="Sin rating"><span class="rating-main">—</span></div>';
    }
    const srcClass = r.source ? (" rating-src-" + r.source) : "";
    const isImdb = r.source === "imdb" || r.source === "omdb";
    const isMal = r.source === "mal";
    const isFuente = r.source === "fuente";
    const title = isImdb
      ? ("IMDb " + r.label)
      : (isMal ? ("MAL " + r.label) : (isFuente ? ("Fuente " + r.label) : (r.source ? (String(r.source).toUpperCase() + " " + r.label) : ("Rating " + r.label))));
    // Fuente: estrella amarilla + número
    const mark = isImdb
      ? '<span class="imdb-mark">IMDb</span>'
      : (isMal ? '<span class="mal-mark">MAL</span>' : (isFuente ? '<span class="fuente-star" aria-hidden="true">★</span>' : ''));
    return (
        '<div class="rating-badge rating-imdb-logo' + srcClass + (isFuente ? " rating-fuente-star" : "") + '" title="' + escapeHtml(title) + '">' +
        mark +
        '<span class="rating-main">' + escapeHtml(r.label) + "</span>" +
        "</div>"
    );
}


/** Rellena meta del panel de detalle (rating IMDb preferido, géneros, duración, cert, votos, título original) */

/** Normaliza estado API (Continuing, ended, Concluido…) → etiqueta ES + clase */
function mzNormEstado(item) {
  if (!item) return { label: null, kind: null };
  const raw = String(item.estado || item.status || "").trim();
  const low = raw.toLowerCase();
  const fin =
    item.finalizado === true ||
    /^(ended|finalizado|concluido|completed?|finished|cancel+ed)$/i.test(raw) ||
    /final|ended|complet|conclu|finished|cancel/i.test(low);
  const air =
    item.en_emision === true ||
    /^(continuing|returning series|airing|ongoing|en emisi[oó]n|en curso|returning)$/i.test(raw) ||
    /emisi|airing|ongoing|continuing|returning|en curso/i.test(low);
  if (fin && !air) return { label: "Finalizado", kind: "end" };
  if (air) return { label: "En emisión", kind: "air" };
  // Si solo dice "Concluido" etc.
  if (/concluido|finalizado|ended/i.test(raw)) return { label: "Finalizado", kind: "end" };
  if (/continuing|emisi/i.test(raw)) return { label: "En emisión", kind: "air" };
  if (raw) return { label: raw, kind: "other" };
  return { label: null, kind: null };
}

function rellenarMetaDetalle(item) {
    if (!item) return;

    const originalEl = document.getElementById("details-original-title");
    if (originalEl) {
        const orig = item.titulo_original || (item.tmdb && item.tmdb.titulo) || null;
        const mainTitle = String(item.nombre || item.titulo || "").trim().toLowerCase();
        if (orig && String(orig).trim() && String(orig).trim().toLowerCase() !== mainTitle) {
            originalEl.textContent = String(orig).trim();
            originalEl.style.display = "block";
        } else {
            originalEl.textContent = "";
            originalEl.style.display = "none";
        }
    }

    const yearEl = document.getElementById("details-year");
    if (yearEl) {
        // Año; si hay fecha completa se muestra también en details-release
        yearEl.textContent = item.year || (item.fecha_estreno ? String(item.fecha_estreno).slice(0, 4) : "—");
    }

    // Un solo rating estilo Stremio: chip IMDb (ocultar estrellas duplicadas)
    const ri = ratingInfo(item);
    const ratingWrap = document.getElementById("details-rating-wrap");
    const typeRating = document.getElementById("details-type-rating");
    if (ratingWrap) ratingWrap.classList.add("hidden");
    if (typeRating) typeRating.classList.add("hidden");
    if (typeof setDetalleImdb === "function") setDetalleImdb(item);

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

    // Estado: En emisión / Finalizado (normaliza Continuing, ended, Concluido…)
    const statusEl = document.getElementById("details-status");
    const statusWrap = document.getElementById("details-status-wrap");
    const tipoLow = String(item.tipo || "").toLowerCase();
    const esSerieTipo = /serie|anime|dorama|tv/.test(tipoLow);
    const st = typeof mzNormEstado === "function" ? mzNormEstado(item) : { label: item.estado || null, kind: null };
    let statusLabel = st.label;
    // Películas: solo si es etiqueta clara
    if (!esSerieTipo && statusLabel && st.kind === "other") {
      statusLabel = null;
    }
    if (statusEl) {
        statusEl.textContent = statusLabel || "";
        statusEl.classList.remove("mz-status-air", "mz-status-end", "mz-status-other");
        if (st.kind === "air") statusEl.classList.add("mz-status-air");
        else if (st.kind === "end") statusEl.classList.add("mz-status-end");
        else if (statusLabel) statusEl.classList.add("mz-status-other");
    }
    if (statusWrap) {
        statusWrap.classList.remove("mz-status-air", "mz-status-end", "mz-status-other", "is-air", "is-end", "hidden");
        if (statusLabel) {
            if (st.kind === "air") statusWrap.classList.add("mz-status-air", "is-air");
            else if (st.kind === "end") statusWrap.classList.add("mz-status-end", "is-end");
            else statusWrap.classList.add("mz-status-other");
        } else {
            statusWrap.classList.add("hidden");
        }
    }

    // Fecha de estreno (películas, series y anime)
    const releaseEl = document.getElementById("details-release");
    const releaseWrap = document.getElementById("details-release-wrap");
    let releaseLabel = null;
    if (item.fecha_estreno) {
        const f = String(item.fecha_estreno).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
            const [yy, mm, dd] = f.split("-");
            releaseLabel = dd + "/" + mm + "/" + yy;
        } else if (/^\d{4}$/.test(f)) {
            releaseLabel = f;
        } else {
            releaseLabel = f;
        }
    }
    if (releaseEl) releaseEl.textContent = releaseLabel || "—";
    if (releaseWrap) {
        if (releaseLabel) releaseWrap.classList.remove("hidden");
        else releaseWrap.classList.add("hidden");
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
        // idiomas / calidad pueden venir string (JK) o array
        (function () {
          function asList(v) {
            if (v == null || v === "") return "";
            if (Array.isArray(v)) return v.filter(Boolean).join(", ");
            return String(v);
          }
          const idio = asList(item.idiomas);
          if (idio) {
            generosEl.innerHTML += '<span class="genre-tag genre-tag-extra">' + escapeHtml(idio) + "</span>";
          }
          const cal = asList(item.calidad);
          if (cal) {
            generosEl.innerHTML += '<span class="genre-tag genre-tag-extra">' + escapeHtml(cal) + "</span>";
          }
        })();
    }

    const extra = document.getElementById("details-meta-extra");
    if (extra) extra.remove();

    // —— Extra solo JKanime (API fuente 5) ——
    (function fillJkExtra() {
      let box = document.getElementById("details-jk-extra");
      const genEl = document.getElementById("details-genres");
      if (!box && genEl && genEl.parentNode) {
        box = document.createElement("div");
        box.id = "details-jk-extra";
        box.className = "details-jk-extra";
        genEl.parentNode.insertBefore(box, genEl.nextSibling);
      }
      if (!box) return;
      const isJk = (typeof esItemJk === "function" && esItemJk(item)) ||
        String(item.source_id || "") === "5" ||
        /jkanime/i.test(String(item.fuente || item.source || "")) ||
        /jkanime\.net/i.test(String(item.link || item.url || ""));
      if (!isJk) {
        box.innerHTML = "";
        box.classList.add("hidden");
        return;
      }
      box.classList.remove("hidden");
      const rows = [];
      function addRow(label, val) {
        if (val == null || val === "") return;
        if (Array.isArray(val)) {
          val = val.filter(Boolean).join(", ");
          if (!val) return;
        }
        rows.push(
          '<div class="details-jk-row"><span class="details-jk-label">' +
          escapeHtml(label) +
          '</span><span class="details-jk-val">' +
          escapeHtml(String(val)) +
          "</span></div>"
        );
      }
      // Solo JKanime (ya filtrado arriba con isJk)
      const studios = item.studios || item.studio;
      addRow("Studios", Array.isArray(studios) ? studios.join(", ") : studios);
      addRow("Temporada anime", item.temporada_anime || null);
      addRow("Demografía", item.demografia);
      addRow("Idiomas", item.idiomas);
      addRow("Calidad", item.calidad);
      addRow("Duración", item.duracion_texto);
      addRow("Estado", item.estado);
      const alts = item.titulos_alternativos;
      if (alts && typeof alts === "object") {
        if (alts.sinonimos) addRow("Sinónimos", alts.sinonimos);
        if (alts.ingles) addRow("Inglés", alts.ingles);
        if (alts.japones) addRow("Japonés", alts.japones);
      }
      if (item.ultimo_episodio) addRow("Último episodio", item.ultimo_episodio);
      if (item.proximo_episodio) addRow("Próximo episodio", item.proximo_episodio);
      if (item.fecha_estreno_texto) addRow("Emitido", item.fecha_estreno_texto);
      box.innerHTML = rows.length
        ? '<div class="details-jk-extra-inner">' + rows.join("") + "</div>"
        : "";
    })();
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
/** Fuente anime: "av1" | "jk" */
let animeFuente = "av1";

/** JKanime: source_id 5 / fuente jkanime — sección propia, no mezclar con AV1 */
function esItemJk(i) {
  if (!i) return false;
  const s = String(i.source_id || i.fuente || i.source || "").toLowerCase();
  const link = String(i.link || i.url || "").toLowerCase();
  return s === "5" || s === "jkanime" || s === "jk" || link.indexOf("jkanime") !== -1 || /\/5\/(anime|serie)\//.test(link);
}
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
    try { return JSON.parse(localStorage.getItem(pk("favoritos")) || "[]"); }
    catch { return []; }
}
function guardarFavoritos(lista) {
    localStorage.setItem(pk("favoritos"), JSON.stringify(lista || []));
}
function mzFavKey(item) {
    if (!item) return "";
    if (item.link) return "link:" + String(item.link);
    const sid = item.source_id != null ? String(item.source_id) : "";
    const slug = item.slug ? String(item.slug) : "";
    if (sid && slug) return "ss:" + sid + "/" + slug;
    if (slug) return "slug:" + slug;
    return "n:" + String(item.nombre || item.titulo || "");
}
function esFavorito(linkOrItem) {
    const favs = obtenerFavoritos();
    if (linkOrItem && typeof linkOrItem === "object") {
      const k = mzFavKey(linkOrItem);
      if (favs.some(function (f) { return mzFavKey(f) === k; })) return true;
      // Mismo título aunque cambie el link al abrir detalle
      const slug = linkOrItem.slug ? String(linkOrItem.slug) : "";
      const sid = linkOrItem.source_id != null ? String(linkOrItem.source_id) : "";
      if (slug) {
        return favs.some(function (f) {
          if (!f) return false;
          if (f.slug && String(f.slug) === slug) {
            if (!sid || !f.source_id) return true;
            return String(f.source_id) === sid;
          }
          return false;
        });
      }
      return false;
    }
    const link = linkOrItem;
    return favs.some(function (f) { return f && f.link && f.link === link; });
}
function toggleFavoritoItem(item) {
    if (!item) return false;
    let favoritos = obtenerFavoritos();
    const k = mzFavKey(item);
    const existe = favoritos.findIndex(function (f) { return mzFavKey(f) === k; });
    if (existe >= 0) {
        favoritos.splice(existe, 1);
    } else {
        // Guardar copia ligera
        favoritos.unshift({
          link: item.link || null,
          slug: item.slug || null,
          source_id: item.source_id != null ? String(item.source_id) : null,
          nombre: item.nombre || item.titulo || "",
          portada: item.portada || null,
          tipo: item.tipo || null,
          year: item.year || null,
        });
    }
    guardarFavoritos(favoritos);
    return existe < 0;
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
    if (/ova/i.test(String(tipo || ""))) return "OVA";
    if (/ona/i.test(String(tipo || ""))) return "ONA";
    if (/especial|special/i.test(String(tipo || ""))) return "Especial";
    return "Película";
}

/** Badge del listado: usa type/tipo de la API tal cual (Película, Anime, OVA, ONA…) */
function tipoBadgeLabel(item) {
    if (!item) return "Anime";
    const raw = String(item.tipo || item.type || item.formato || item.format || "").trim();
    if (!raw) {
      // fallback por source anime
      if (String(item.source_id || "") === "4" || String(item.source_id || "") === "5") return "Anime";
      return "Película";
    }
    if (/^ova$/i.test(raw) || /\bova\b/i.test(raw)) return "OVA";
    if (/^ona$/i.test(raw) || /\bona\b/i.test(raw)) return "ONA";
    if (/especial|special/i.test(raw)) return "Especial";
    if (/pel[ií]cula|movie|film/i.test(raw)) return "Película";
    if (/serie|dorama|tv/i.test(raw) && !/anime/i.test(raw)) return "Serie";
    if (/anime/i.test(raw)) return "Anime";
    // Cualquier otro valor de la API (ej. "TV", "Movie")
    if (/^tv$/i.test(raw)) return "Anime";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
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
    "filelions.com": "FileLions", "filelions.to": "FileLions",
    "earnvids.com": "VidHide",
    "1fichier.com": "1Fichier"
};

function detectarServidor(url, serverOriginal) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
    catch {
      const raw = String(serverOriginal || "").trim();
      if (raw && !/^(desconocido|unknown|otros?|other|n\/?a|servidor|server|online)$/i.test(raw)) return raw;
      return "Servidor";
    }

    for (const dominio in SERVIDORES_CONOCIDOS) {
        if (host === dominio || host.endsWith("." + dominio)) return SERVIDORES_CONOCIDOS[dominio];
    }
    const so = String(serverOriginal || "").trim();
    const generico = /^(online|server|servidor|desconocido|unknown|otros?|other|n\/?a|)$/i.test(so);
    if (so && !generico) return so;

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

// ============================================================
// Autoplay capítulos (Serie/Anime)
// ============================================================
let _epPlayCtx = null; // { item, season, episode, episodio }
let _autoplayEp = localStorage.getItem("mz_autoplay_ep") !== "0"; // default ON

function scoreIdiomaEmbed(e) {
  const t = `${e?.idioma || ""} ${e?.lang || ""} ${e?.language || ""} ${e?.server || ""} ${e?.name || ""}`.toLowerCase();
  if (/latino|castellano|español|espanol|\bdub\b|audio lat/.test(t)) return 0;
  if (/sub|subtit|subtitulado/.test(t)) return 1;
  if (/english|ingles|inglés|\beng\b/.test(t)) return 2;
  return 3; // desconocido
}

function ordenarEmbedsAuto(embeds) {
  return (embeds || [])
    .filter((e) => e && (e.url || e.stream_url) && !esEmbedInvalido(e.url))
    .slice()
    .sort((a, b) => {
      const ia = scoreIdiomaEmbed(a) - scoreIdiomaEmbed(b);
      if (ia !== 0) return ia;
      const ra = rankFuenteNoAds(a.url || "") ;
      const rb = rankFuenteNoAds(b.url || "");
      return ra - rb;
    });
}

function esSerieOAnimeItem(item) {
  if (!item) return false;
  if (typeof isPeliculaItem === "function" && isPeliculaItem(item)) return false;
  return typeof isSerieOrAnime === "function"
    ? isSerieOrAnime(item)
    : /serie|anime|dorama/i.test(String(item.tipo || item.type || ""));
}


function actualizarBotonesEpPlayer() {
  const wrap = document.getElementById("mz-ep-controls");
  const btnNext = document.getElementById("btn-next-ep");
  const btnAuto = document.getElementById("btn-autoplay-ep");

  // Solo series/anime Y con capítulo activo
  const activo =
    _epPlayCtx &&
    _epPlayCtx.item &&
    esSerieOAnimeItem(_epPlayCtx.item);

  if (wrap) {
    wrap.classList.toggle("hidden", !activo);
    wrap.style.display = activo ? "" : "none";
  }

  if (!activo) {
    if (btnNext) btnNext.classList.add("hidden");
    return;
  }

  if (btnAuto) {
    const t = document.getElementById("btn-autoplay-ep-text");
    if (t) t.textContent = _autoplayEp ? "Auto" : "Auto off";
    else btnAuto.textContent = _autoplayEp ? "Auto" : "Auto off";
    btnAuto.classList.toggle("off", !_autoplayEp);
  }

  if (!btnNext) return;
  const next = obtenerSiguienteEpisodioCtx(_epPlayCtx);
  btnNext.classList.toggle("hidden", !next);
}

function obtenerSiguienteEpisodioCtx(ctx) {
  if (!ctx || !ctx.item || !Array.isArray(ctx.item.episodios)) return null;
  const eps = ctx.item.episodios.slice().sort((a, b) => {
    const sa = Number(a.season || a.temporada || 1);
    const sb = Number(b.season || b.temporada || 1);
    if (sa !== sb) return sa - sb;
    const ea = Number(a.episode || a.episodio || a.episode_number || 0);
    const eb = Number(b.episode || b.episodio || b.episode_number || 0);
    return ea - eb;
  });
  const curS = Number(ctx.season || 1);
  const curE = Number(ctx.episode || 0);
  for (let i = 0; i < eps.length; i++) {
    const s = Number(eps[i].season || eps[i].temporada || 1);
    const e = Number(eps[i].episode || eps[i].episodio || eps[i].episode_number || 0);
    if (s === curS && e === curE && i + 1 < eps.length) {
      return eps[i + 1];
    }
  }
  // fallback: siguiente por número en misma temporada
  const same = eps.filter((x) => Number(x.season || x.temporada || 1) === curS);
  const nxt = same.find((x) => Number(x.episode || x.episodio || x.episode_number || 0) > curE);
  return nxt || null;
}

async function asegurarEmbedsEpisodio(item, episodio, seasonNum, epNum) {
  let validos = embedsValidosDe(episodio);
  if (validos.length || (episodio.video && !esEmbedInvalido(episodio.video))) {
    return {
      embeds: validos.length ? validos : (episodio.embeds || []),
      video: episodio.video,
      downloads: episodio.downloads || []
    };
  }
  const sNum = Number(seasonNum || episodio?.season || episodio?.temporada || item?._seasonActiva || 1) || 1;
  const eNum = Number(epNum || episodio?.episode || episodio?.episodio || 0) || 0;
  const params = new URLSearchParams();
  params.set("temporada", String(sNum));
  params.set("episodio", String(eNum));
  if (item.postId) params.set("postId", item.postId);
  if (episodio && episodio.link) params.set("link", episodio.link);
  else if (item.link) params.set("link", item.link);
  if (item.slug) params.set("slug", item.slug);
  if (item.source_id) params.set("source_id", String(item.source_id));
  if (item.tipo) params.set("tipo", item.tipo);
  if (item.url_extract && !item.link) params.set("link", item.url_extract);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`/api/capitulo?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("capitulo API:", res.status, data);
      return { embeds: [], video: null, downloads: [] };
    }
    let embedsNuevos = normalizarEmbeds(
      (Array.isArray(data.reproductores) && data.reproductores.length)
        ? data.reproductores
        : (data.embeds || [])
    );
    if (!embedsNuevos.length && data.reproductor && typeof data.reproductor === "string") {
      embedsNuevos = [{ url: data.reproductor }];
    }
    if (typeof esUrlApiWorker === "function") {
      embedsNuevos = embedsNuevos.filter((e) => e && e.url && !esUrlApiWorker(e.url));
    }
    episodio.embeds = embedsNuevos.map((e) => ({
      ...e,
      idioma: e.idioma || e.lang || null,
      lang: e.lang || e.idioma || null,
      server: e.server || e.servidor || e.name || null,
      servidor: e.servidor || e.server || e.name || null,
      stream_url: e.stream_url || (typeof streamUrlParaNoAds === "function" ? streamUrlParaNoAds(e.url) : null) || null
    }));
    if (data.video) episodio.video = data.video;
    if (data.downloads || data.descargas) {
      episodio.downloads = data.downloads || data.descargas || [];
    }
    validos = embedsValidosDe(episodio);
    return {
      embeds: validos.length ? validos : (episodio.embeds || []),
      video: episodio.video || null,
      downloads: episodio.downloads || []
    };
  } catch (err) {
    console.error("asegurarEmbedsEpisodio:", err);
    return { embeds: [], video: null, downloads: [] };
  } finally {
    clearTimeout(to);
  }
}

/** Prueba servidores en orden: Latino → Sub → EN → otro; resolve primero */

/** Vista móvil al elegir episodio: player + ant/sig + servers + rangos + grid números */
function isMobileSerieEpUI(item) {
  try {
    var w = typeof window !== "undefined" ? window.innerWidth : 9999;
    var mobile = w <= 900;
    try {
      if (typeof isMobileEpRangesUI === "function" && isMobileEpRangesUI()) mobile = true;
    } catch (_) {}
    if (!mobile) return false;
  } catch (_) {
    return false;
  }
  return typeof isSerieOrAnime === "function"
    ? isSerieOrAnime(item)
    : /serie|anime|dorama/i.test(String(item?.tipo || item?.type || ""));
}

function ensureMobileEpChrome() {
  let nav = document.getElementById("mz-mobile-ep-nav");
  if (!nav) {
    nav = document.createElement("div");
    nav.id = "mz-mobile-ep-nav";
    nav.className = "mz-mobile-ep-nav hidden";    
    nav.innerHTML =
      '<button type="button" class="mz-mep-nav-btn" id="mz-mep-prev" aria-label="Anterior">' +
        '<ion-icon name="chevron-back-outline"></ion-icon><span>Anterior</span></button>' +
      '<button type="button" class="mz-mep-nav-btn" id="mz-mep-next" aria-label="Siguiente">' +
        '<span>Siguiente</span><ion-icon name="chevron-forward-outline"></ion-icon></button>' +
      '<button type="button" class="mz-mep-nav-btn mz-mep-dl-btn" id="mz-mep-download" aria-label="Descargas" title="Descargas">' +
        '<ion-icon name="download-outline"></ion-icon></button>';
    const vc = document.getElementById("video-player-container");
    if (vc && vc.parentNode) vc.parentNode.insertBefore(nav, vc.nextSibling);
    else document.querySelector(".mz-meta-col")?.appendChild(nav);
  }  
  let back = document.getElementById("mz-mep-back");
  if (!back) {
    back = document.createElement("button");
    back.type = "button";
    back.id = "mz-mep-back";
    back.className = "mz-mep-back";
    back.setAttribute("aria-label", "Volver");
    back.innerHTML = '<ion-icon name="arrow-back-outline"></ion-icon>';
    document.body.appendChild(back);
    back.addEventListener("click", function (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
      if (typeof volverDesdeEpisodioMovil === "function") volverDesdeEpisodioMovil();
    });
  }
  let watch = document.getElementById("mz-mobile-ep-watching");
  if (!watch) {
    watch = document.createElement("div");
    watch.id = "mz-mobile-ep-watching";
    watch.className = "mz-mobile-ep-watching hidden";
    watch.innerHTML =
      '<div class="mz-mep-watching-ep" id="mz-mep-watching-ep">Estás viendo T1 · Episodio 1</div>';
    const srv = document.getElementById("servers-section");
    if (srv && srv.parentNode) srv.parentNode.insertBefore(watch, srv.nextSibling);
    else document.querySelector(".mz-meta-col")?.appendChild(watch);
  }
  // Panel de descargas en body (evita freeze del nav)
  let panel = document.getElementById("mz-mep-dl-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "mz-mep-dl-panel";
    panel.className = "mz-mep-dl-panel hidden";
    document.body.appendChild(panel);
  }
  // Bind descarga (una vez)
  const dlBtn = document.getElementById("mz-mep-download");
  if (dlBtn && !dlBtn.dataset.bound) {
    dlBtn.dataset.bound = "1";
    let lastToggle = 0;
    dlBtn.addEventListener("click", function (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_) {}
      const now = Date.now();
      if (now - lastToggle < 280) return; // anti double-tap freeze
      lastToggle = now;
      const p = document.getElementById("mz-mep-dl-panel");
      if (!p) return;
      const opening = p.classList.contains("hidden");
      if (opening) {
        renderMobileDownloadPanel(p);
        p.classList.remove("hidden");
        document.body.classList.add("mz-mep-dl-open");
      } else {
        p.classList.add("hidden");
        document.body.classList.remove("mz-mep-dl-open");
      }
    }, { passive: false });
    // Cerrar al tocar fuera
    if (!document.body.dataset.mzDlOutside) {
      document.body.dataset.mzDlOutside = "1";
      document.addEventListener("click", function (ev) {
        const p = document.getElementById("mz-mep-dl-panel");
        const btn = document.getElementById("mz-mep-download");
        if (!p || p.classList.contains("hidden")) return;
        if (p.contains(ev.target) || (btn && btn.contains(ev.target))) return;
        p.classList.add("hidden");
        document.body.classList.remove("mz-mep-dl-open");
      }, true);
    }
  }
  return { nav, watch };
}

function renderMobileDownloadPanel(panel) {
  if (!panel) return;
  const list = Array.isArray(window.__mzMobileDownloads) ? window.__mzMobileDownloads.slice(0, 40) : [];
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }
  function langOf(d) {
    const raw = String(d.lang || d.idioma || d.language || d.lang_code || "").toLowerCase();
    if (/lat|latino|dub|dobl/.test(raw)) return "DUB";
    if (/sub|subt/.test(raw)) return "SUB";
    if (/eng|ingl/.test(raw)) return "ENG";
    if (raw) return raw.slice(0, 6).toUpperCase();
    return "";
  }
  function hostOf(d) {
    const name = d.name || d.server || d.servidor || d.host || "";
    if (name) return String(name).slice(0, 28);
    try {
      const u = d.url || d.link || "";
      if (u) return new URL(u).hostname.replace(/^www\./, "").slice(0, 28);
    } catch (_) {}
    return "Descarga";
  }
  function qualityOf(d) {
    return String(d.calidad || d.quality || d.resolution || d.res || d.formato || "").slice(0, 16);
  }
  function sizeOf(d) {
    return String(d.peso || d.size || d.filesize || d.file_size || d.tamano || d.tamaño || "").slice(0, 16);
  }

  const titleRow =
    '<div class="mz-mep-dl-title-row">' +
      '<div class="mz-mep-dl-title">Descargas</div>' +
      '<button type="button" class="mz-mep-dl-close" id="mz-mep-dl-close" aria-label="Cerrar">×</button>' +
    "</div>";

  if (!list.length) {
    panel.innerHTML =
      titleRow +
      '<div class="mz-mep-dl-empty">No hay descargas para este episodio</div>';
    bindMobileDlClose(panel);
    return;
  }

  let html = titleRow + '<div class="mz-mep-dl-list">';
  for (let i = 0; i < list.length; i++) {
    const d = list[i] || {};
    const url = d.url || d.link || d.href || "";
    if (!url || !/^https?:\/\//i.test(String(url))) continue;
    const host = hostOf(d);
    const lang = langOf(d);
    const q = qualityOf(d);
    const sz = sizeOf(d);
    const metaBits = [lang, q, sz].filter(Boolean).join(" · ");
    html +=
      '<a class="mz-mep-dl-item" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer nofollow" data-mz-dl="1">' +
        '<div class="mz-mep-dl-info">' +
          '<span class="mz-mep-dl-host">' + esc(host) + "</span>" +
          (metaBits ? '<span class="mz-mep-dl-meta-line">' + esc(metaBits) + "</span>" : "") +
        "</div>" +
        '<span class="mz-mep-dl-arrow" aria-hidden="true">' +
          '<ion-icon name="download-outline"></ion-icon>' +
        "</span>" +
      "</a>";
  }
  html += "</div>";
  panel.innerHTML = html;
  bindMobileDlClose(panel);
}

function bindMobileDlClose(panel) {
  const btn = panel && panel.querySelector("#mz-mep-dl-close");
  if (!btn) return;
  btn.onclick = function (ev) {
    try {
      ev.preventDefault();
      ev.stopPropagation();
    } catch (_) {}
    const p = document.getElementById("mz-mep-dl-panel");
    if (p) p.classList.add("hidden");
    document.body.classList.remove("mz-mep-dl-open");
  };
}


function actualizarMobileEpNav(ctx) {
  const prev = document.getElementById("mz-mep-prev");
  const next = document.getElementById("mz-mep-next");
  if (!prev || !next) return;
  const cur = ctx || (typeof _epPlayCtx !== "undefined" ? _epPlayCtx : null);
  let hasPrev = false;
  let hasNext = false;
  if (cur && cur.item && Array.isArray(cur.item.episodios)) {
    const eps = cur.item.episodios.slice().sort(function (a, b) {
      const sa = Number(a.season || a.temporada || 1);
      const sb = Number(b.season || b.temporada || 1);
      if (sa !== sb) return sa - sb;
      return Number(a.episode || a.episodio || 0) - Number(b.episode || b.episodio || 0);
    });
    const s = Number(cur.season || 1);
    const e = Number(cur.episode || 0);
    const idx = eps.findIndex(function (x) {
      return Number(x.season || x.temporada || 1) === s &&
        Number(x.episode || x.episodio || x.episode_number || 0) === e;
    });
    hasPrev = idx > 0;
    hasNext = idx >= 0 && idx < eps.length - 1;
    prev.onclick = function () {
      if (!hasPrev) return;
      const p = eps[idx - 1];
      const sn = Number(p.season || p.temporada || 1);
      const en = Number(p.episode || p.episodio || 0);
      window.__mzAutoPlayEp = true; // autoplay al cambiar
      if (typeof window.mzKoiOpenEpisode === "function") window.mzKoiOpenEpisode(cur.item, p, sn, en); else abrirVistaMovilEpisodio(cur.item, p, sn, en);
    };
    next.onclick = function () {
      if (!hasNext) return;
      const n = eps[idx + 1];
      const sn = Number(n.season || n.temporada || 1);
      const en = Number(n.episode || n.episodio || 0);
      window.__mzAutoPlayEp = true;
      if (typeof window.mzKoiOpenEpisode === "function") window.mzKoiOpenEpisode(cur.item, n, sn, en); else abrirVistaMovilEpisodio(cur.item, n, sn, en);
    };
  }
  prev.disabled = !hasPrev;
  next.disabled = !hasNext;
  prev.classList.toggle("is-disabled", !hasPrev);
  next.classList.toggle("is-disabled", !hasNext);
}

function renderMobileEpNumberGrid(item, seasonNum, epNum) {
  const cont = document.getElementById("episodes-container");
  if (!cont) return;
  cont.classList.add("mz-ep-num-grid");
  cont.classList.remove("episodes-grid");
  // Mantener tabs de rango arriba (seasons-tabs) si existen
  let lista = Array.isArray(item.episodios) ? item.episodios.slice() : [];
  lista = typeof filtrarEpisodiosDeTemporada === "function"
    ? filtrarEpisodiosDeTemporada(item, seasonNum, lista)
    : lista;
  const rango = item._epRangoActivo;
  if (rango && lista.length) {
    lista = lista.filter(function (ep, idx) {
      const n = Number(ep.episode || ep.episodio || ep.episode_number || (idx + 1));
      return n >= rango.desde && n <= rango.hasta;
    });
  }
  if ((!lista || !lista.length) && rango) {
    lista = [];
    for (let n = rango.desde; n <= rango.hasta; n++) {
      lista.push({ season: seasonNum, episode: n, nombre: "Episodio " + n });
    }
  }
  cont.innerHTML = "";
  lista.forEach(function (ep, index) {
    const num = Number(ep.episode || ep.episodio || ep.episode_number || (index + 1)) || (index + 1);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mz-ep-num-btn" + (num === Number(epNum) ? " active" : "");
    b.textContent = String(num);
    b.setAttribute("data-ep", String(num));
    b.addEventListener("click", function () {
      const sn = Number(ep.season || ep.temporada || seasonNum || 1);
      abrirVistaMovilEpisodio(item, ep, sn, num);
    });
    cont.appendChild(b);
  });
}

function aplicarServidorPreferido(embeds, item) {
  const pref = window.__mzPreferredServer;
  if (!pref || !Array.isArray(embeds) || !embeds.length) return false;

  const slugNow = String(
    (typeof mzSlugFromItem === "function" ? mzSlugFromItem(item) : null) ||
      item?.slug ||
      ""
  ).toLowerCase();
  const slugPref = String(pref.slug || "").toLowerCase();
  if (
    slugPref &&
    slugNow &&
    slugPref.indexOf("http") === -1 &&
    slugNow.indexOf("http") === -1 &&
    slugPref !== slugNow
  ) {
    return false;
  }

  const name = String(pref.name || "").toLowerCase();
  const wantDirect = !!(pref.direct || pref.noAds);

  function esEmbedDirecto(e) {
    if (!e) return false;
    if (e.noAds || e.__directHls || e.__forceDirect) return true;
    if (e.server === "NO ADS" || e.name === "NO ADS") return true;
    return false;
  }

  let match = null;

  // Helper: ¿este embed “parece” el servidor buscado?
  function nombreDe(e) {
    return String(
      detectarServidor(
        e.url || e.stream_url || e.hls_resolve,
        e.server || e.servidor || e.name
      ) || ""
    ).toLowerCase();
  }
  function nombreOk(n) {
    if (!name) return true;
    if (name === "no ads" || name === "noads") {
      return !!(n && /no\s*ads/i.test(n));
    }
    return n.indexOf(name) !== -1 || name.indexOf(n) !== -1;
  }

  if (wantDirect) {
    // 1) NO ADS explícito
    if (pref.noAds || name === "no ads" || name === "noads") {
      for (let i = 0; i < embeds.length; i++) {
        const e = embeds[i];
        if (e && e.noAds) {
          match = e;
          break;
        }
      }
    }
    // 2) Directo por nombre (Streamwish, VidHide, …)
    //    En la lista cruda NO traen __directHls → no exigir isDir
    if (!match) {
      for (let i = 0; i < embeds.length; i++) {
        const e = embeds[i];
        if (!e || (!e.url && !e.stream_url && !e.hls_resolve)) continue;
        if (e.noAds && !(pref.noAds || name === "no ads" || name === "noads")) continue;
        const n = nombreDe(e);
        if (!nombreOk(n)) continue;
        match = e;
        break;
      }
    }
  } else {
    // NORMALES: solo embeds sin noAds (y sin tratarlos como directo)
    for (let i = 0; i < embeds.length; i++) {
      const e = embeds[i];
      if (!e || (!e.url && !e.stream_url && !e.hls_resolve)) continue;
      if (e.noAds || e.__directHls || e.__forceDirect) continue;
      const n = nombreDe(e);
      if (!nombreOk(n)) continue;
      match = e;
      break;
    }
  }

  if (!match) return false;

  // Un solo chip activo
  try {
    document.querySelectorAll(".koi-server-chip, .mz-mep-srv-chip").forEach(function (c) {
      c.classList.remove("is-active", "active");
    });
    const key =
      (pref.noAds ? "1" : "0") +
      "|" +
      String(pref.name || "").toLowerCase() +
      "|" +
      String(pref.lang || "");
    let marked = false;
    document.querySelectorAll(".koi-server-chip, .mz-mep-srv-chip").forEach(function (c) {
      if (marked) return;
      if (c.dataset.mzPref === key) {
        c.classList.add("is-active");
        marked = true;
      }
    });
    if (!marked) {
      const list = document.querySelectorAll(".koi-server-chip, .mz-mep-srv-chip");
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const txt = (c.textContent || "").toLowerCase();
        const block = c.closest(".koi-servers-block");
        const title =
          (block &&
            block.querySelector(".koi-servers-title") &&
            block.querySelector(".koi-servers-title").textContent) ||
          "";
        const inDirect = /directo/i.test(title);
        if (pref.noAds && !inDirect && !/no\s*ads/i.test(txt)) continue;
        if (!pref.noAds && inDirect) continue;
        if (name && txt.indexOf(name) !== -1) {
          c.classList.add("is-active");
          break;
        }
      }
    }
  } catch (_) {}

  try {
    if (match && wantDirect) {
      match = Object.assign({}, match, {
        __directHls: true,
        __forceDirect: true,
        noAds: !!(match.noAds || pref.noAds || name === "no ads" || name === "noads")
      });
    } else if (match && !wantDirect) {
      match = Object.assign({}, match, {
        noAds: false,
        __directHls: false,
        __forceDirect: false
      });
    }
    if (typeof reproducir === "function") reproducir(match, item);
  } catch (_) {}

  return true;
}
  /*
  if (!match) return false;
  try {
    document.querySelectorAll(".koi-server-chip.active, .mz-mep-srv-chip.active")
      .forEach((c) => c.classList.remove("active"));
  } catch (_) {}
  try {
    const chips = document.querySelectorAll(".koi-server-chip, .mz-mep-srv-chip");
    chips.forEach((c) => {
      const txt = (c.textContent || "").toLowerCase();
      if (name && txt.indexOf(name) !== -1) c.classList.add("active");
    });
  } catch (_) {}
  try {
    if (typeof reproducir === "function") reproducir(match, item);
  } catch (_) {}
  return true;
}*/


/** Forzar shell = misma interfaz que película al Reproducir (móvil) */
function mzForceEpLikeMovieShell(on, itemArg, epArg, snArg, enArg) {
  try {
    const hero = document.getElementById("koi-hero");
    const meta = document.querySelector(".mz-meta-col");
    const streams = document.querySelector(".mz-streams-col");
    const layout = document.querySelector(".mz-detail-layout");
    const vc = document.getElementById("video-player-container");
    const syn = document.querySelector(".mz-synopsis-section");
    const ss = document.getElementById("servers-section");
    const posterCol = document.querySelector(".mz-stremio-poster-col");
    const inner = document.getElementById("details-content") || document.querySelector(".details-content-inner");
    const seasons = document.getElementById("seasons-section");
    const logo = document.getElementById("details-logo");
    const desc = document.getElementById("details-description");
    const stremioHeader = document.querySelector(".mz-stremio-header");
    const playRow = document.getElementById("mz-stremio-play-row");

    // Siempre limpiar timer al entrar/salir
    if (window.__mzEpShellTimer) {
      clearInterval(window.__mzEpShellTimer);
      window.__mzEpShellTimer = null;
    }

    if (!on) {
      // Restaurar TODO lo que el shell tocó (si no, detalle queda vacío)
      [hero, meta, streams, layout, vc, syn, ss, posterCol, inner, seasons].forEach(function (el) {
        if (!el) return;
        try { el.style.cssText = ""; } catch (_) {}
      });
      try {
        if (logo) {
          logo.classList.remove("hidden");
          logo.style.cssText = "";
        }
        if (desc) desc.style.cssText = "";
        if (stremioHeader) stremioHeader.style.cssText = "";
        if (playRow) playRow.style.cssText = "";
        document.querySelectorAll(".details-actions").forEach(function (el) {
          el.style.cssText = "";
        });
        if (hero) {
          hero.style.cssText = "";
          hero.setAttribute("aria-hidden", "false");
        }
      } catch (_) {}
      const head = document.getElementById("mz-ep-movie-head");
      if (head) head.remove();
      document.body.classList.remove("mz-ep-movie-shell", "koi-movie");
      return;
    }

    document.body.classList.add(
      "details-open",
      "player-open",
      "mz-mobile-ep-playing",
      "mz-ep-movie-shell",
      "koi-serie"
    );
    document.body.classList.remove("mz-mobile-movie-playing");

    // Ocultar hero / logo / sinopsis del detalle (solo mientras se ve el ep)
    if (hero) {
      hero.style.setProperty("display", "none", "important");
      hero.setAttribute("aria-hidden", "true");
    }
    if (logo) logo.classList.add("hidden");
    if (stremioHeader) stremioHeader.style.setProperty("display", "none", "important");
    if (desc) desc.style.setProperty("display", "none", "important");
    if (syn) syn.style.setProperty("display", "none", "important");
    if (posterCol) posterCol.style.setProperty("display", "none", "important");
    if (playRow) playRow.style.setProperty("display", "none", "important");
    try {
      document.querySelectorAll(".details-actions").forEach(function (el) {
        el.style.setProperty("display", "none", "important");
      });
    } catch (_) {}

    if (inner) {
      inner.classList.remove("hidden");
      inner.style.setProperty("display", "block", "important");
    }
    if (layout) {
      layout.style.cssText =
        "display:flex!important;flex-direction:column!important;width:100%!important;gap:0!important;padding:0 12px 24px!important;";
    }
    if (meta) {
      meta.style.cssText =
        "display:flex!important;flex-direction:column!important;width:100%!important;padding:0!important;";
    }

    // Player arriba
    if (vc) {
      vc.classList.remove("hidden");
      if (meta) {
        try {
          if (vc.parentNode !== meta) meta.insertBefore(vc, meta.firstChild);
          else if (meta.firstChild !== vc) meta.insertBefore(vc, meta.firstChild);
        } catch (_) {}
      }
      vc.style.cssText =
        "display:block!important;width:100%!important;aspect-ratio:16/9!important;background:#000!important;margin:8px 0 12px!important;border-radius:12px!important;overflow:hidden!important;order:0!important;";
    }

    // Cabecera tipo película bajo el player
    try {
      let head = document.getElementById("mz-ep-movie-head");
      if (!head) {
        head = document.createElement("div");
        head.id = "mz-ep-movie-head";
        head.className = "mz-ep-movie-head";
      }
      const host = (vc && vc.parentNode) || meta || layout;
      if (host) {
        if (vc && vc.parentNode === host) host.insertBefore(head, vc.nextSibling);
        else if (head.parentNode !== host) host.insertBefore(head, host.firstChild);
      }
      const item =
        itemArg ||
        window.__mzCurrentItem ||
        (_epPlayCtx && _epPlayCtx.item) ||
        null;
      const epCtx = epArg || (_epPlayCtx && _epPlayCtx.episodio) || null;
      const sn = Number(snArg || (epCtx && (epCtx.season || epCtx.temporada)) || 1) || 1;
      const en = Number(enArg || (epCtx && (epCtx.episode || epCtx.episodio)) || 0) || 0;
      if (head && item) {
        const title = item.nombre || item.titulo || "";
        const epLine = en ? "T" + sn + " • E" + en : "";
        const rating =
          item.rating != null
            ? String(item.rating)
            : item.calificacion != null
              ? String(item.calificacion)
              : "";
        const dur =
          (epCtx && (epCtx.duracion_texto || epCtx.duracion)) ||
          item.duracion_texto ||
          (item.duracion ? item.duracion + " min" : "") ||
          "";
        const estado = item.estado || item.status || "";
        head.innerHTML =
          '<div class="mz-ep-movie-title">' +
          String(title).replace(/</g, "&lt;") +
          "</div>" +
          (epLine ? '<div class="mz-ep-movie-ep">' + epLine + "</div>" : "") +
          '<div class="mz-ep-movie-meta">' +
          (rating
            ? '<span class="mz-ep-movie-rating">' +
              rating +
              ' <span class="mz-ep-movie-imdb">IMDb</span></span>'
            : "") +
          (dur ? '<span class="mz-ep-movie-dur">' + String(dur).replace(/</g, "&lt;") + "</span>" : "") +
          (estado
            ? '<span class="mz-ep-movie-status">' + String(estado).replace(/</g, "&lt;") + "</span>"
            : "") +
          "</div>";
        head.style.cssText = "display:block!important;width:100%!important;margin:0 0 14px!important;order:1!important;";
      }
    } catch (_) {}

    if (ss) {
      ss.classList.remove("hidden");
      ss.style.cssText = "display:block!important;width:100%!important;order:3!important;";
    }
    if (streams) {
      streams.style.cssText =
        "display:block!important;width:100%!important;max-width:100%!important;padding:0!important;border:none!important;";
    }
    if (seasons) {
      seasons.classList.remove("hidden");
      seasons.style.cssText = "display:block!important;width:100%!important;order:5!important;";
    }

    const closeBtn = document.getElementById("close-player-btn");
    if (closeBtn) {
      closeBtn.classList.add("hidden");
      closeBtn.style.setProperty("display", "none", "important");
    }
  } catch (e) {
    console.warn("mzForceEpLikeMovieShell", e);
  }
}

async function abrirVistaMovilEpisodio(item, episodio, seasonNum, epNum) {
  try {
    if (item && typeof item === "object") {
      const en = epNum != null ? epNum : (episodio && (episodio.episodio || episodio.number || episodio.episode));
      const sn = seasonNum != null ? seasonNum : (episodio && (episodio.temporada || episodio.season));
      item = Object.assign({}, item, {
        temporada: sn != null ? sn : item.temporada,
        season: sn != null ? sn : item.season,
        episodio: en != null ? en : item.episodio,
        episode: en != null ? en : item.episode,
        back_img: (episodio && (episodio.back_img || episodio.still || episodio.image)) || item.back_img || item.backdrop || null
      });
      if (typeof iniciarSeguimientoProgreso === "function") iniciarSeguimientoProgreso(item);
      if (typeof guardarProgreso === "function") {
        const prev = typeof obtenerProgreso === "function" ? (obtenerProgreso()[claveProgreso(item)] || {}) : {};
        guardarProgreso(item, Math.max(Number(prev.segundos) || 0, 12), Number(prev.duracion) || 0);
      }
    }
  } catch (_) {}
  if (!item || !isMobileSerieEpUI(item)) return false;
  seasonNum = Number(seasonNum || episodio?.season || 1) || 1;
  epNum = Number(epNum || episodio?.episode || episodio?.episodio || 1) || 1;
  episodio = episodio || { season: seasonNum, episode: epNum, nombre: "Episodio " + epNum };
  episodio.season = seasonNum;
  episodio.episode = epNum;

  // Vista móvil propia (sin Koi)
  mzForceEpLikeMovieShell(true);

  


  // Forzar: ocultar hero (por si el CSS no llega)
  try {
    const hero = document.getElementById("koi-hero");
    if (hero) {
      hero.style.setProperty("display", "none", "important");
      hero.setAttribute("aria-hidden", "true");
    }
  } catch (_) {}
  try {
    const slugNow = String(item?.slug || item?.link || "");
    const pref = window.__mzPreferredServer;
    if (pref && pref.slug && slugNow && pref.slug !== slugNow) {
      window.__mzPreferredServer = null;
    }
  } catch (_) {}
  try { mzPushDetalleUrl(item, seasonNum, epNum); } catch (_) {}

  const chrome = ensureMobileEpChrome();
  chrome.nav.classList.remove("hidden");
  chrome.watch.classList.remove("hidden");
  const watchEp = document.getElementById("mz-mep-watching-ep");
  if (watchEp) watchEp.textContent = "Estás viendo T" + seasonNum + " · Episodio " + epNum;
  try {
    const pt2 = document.getElementById("player-title");
    if (pt2) pt2.textContent = "Estás viendo T" + seasonNum + " · Episodio " + epNum;
  } catch (_) {}
  // Orden DOM: player → ant/sig/descarga → estás viendo → servers
  try {
    const vc = document.getElementById("video-player-container");
    const nav = document.getElementById("mz-mobile-ep-nav");
    const watch = document.getElementById("mz-mobile-ep-watching");
    const ss = document.getElementById("servers-section");
    const parent = (vc && vc.parentNode) || document.querySelector(".mz-meta-col");
    if (parent && vc) {
      if (nav) {
        if (nav.parentNode !== parent) parent.insertBefore(nav, vc.nextSibling);
        else parent.insertBefore(nav, vc.nextSibling);
      }
      if (watch) {
        const after = nav || vc;
        parent.insertBefore(watch, after.nextSibling);
      }
      if (ss) {
        const after2 = watch || nav || vc;
        if (ss.parentNode !== parent) parent.appendChild(ss);
        parent.insertBefore(ss, after2.nextSibling);
      }
    }
  } catch (_) {}

  const vc = document.getElementById("video-player-container");
  if (vc) {
    vc.classList.remove("hidden");
    const ifr = document.getElementById("player-iframe");
    if (ifr) ifr.src = "about:blank";
    try { if (typeof destruirHls === "function") destruirHls(); } catch (_) {}
    const pt = document.getElementById("player-title");
    if (pt) pt.textContent = "Estás viendo T" + seasonNum + " · Episodio " + epNum;
    // Móvil: el cuadro no se cierra (solo cambia de episodio / cierra detalle)
    const closeBtn = document.getElementById("close-player-btn");
    if (closeBtn) {
      closeBtn.classList.add("hidden");
      closeBtn.style.setProperty("display", "none", "important");
    }
  }

  _epPlayCtx = { item, season: seasonNum, episode: epNum, episodio };
  try { mzForceEpLikeMovieShell(true, item, episodio, seasonNum, epNum); } catch (_) {}
  actualizarMobileEpNav(_epPlayCtx);
  try { if (typeof actualizarBotonesEpPlayer === "function") actualizarBotonesEpPlayer(); } catch (_) {}

  // Rangos visibles
  const seasonsSec = document.getElementById("seasons-section");
  if (seasonsSec) {
    seasonsSec.classList.remove("hidden");
    const h4 = seasonsSec.querySelector("h4");
    if (h4) h4.textContent = "Episodios";
  }
  // Re-render tabs si hace falta
  try {
    if (typeof normalizarRangosEpisodios === "function") {
      const rangos = normalizarRangosEpisodios(item);
      if (rangos.length > 1 && !item._epRangoActivo) {
        item._epRangoActivo = { desde: rangos[0].desde, hasta: rangos[0].hasta };
      }
      // Ajustar rango al episodio actual
      if (rangos.length > 1) {
        const hit = rangos.find(function (r) { return epNum >= r.desde && epNum <= r.hasta; });
        if (hit) item._epRangoActivo = { desde: hit.desde, hasta: hit.hasta };
      }
    }
  } catch (_) {}

  // Tabs de rango (móvil)
  const tabs = document.getElementById("seasons-tabs-container");
  if (tabs && typeof normalizarRangosEpisodios === "function") {
    const rangos = normalizarRangosEpisodios(item);
    if (rangos.length > 1) {
      tabs.className = "seasons-tabs mz-ep-range-tabs";
      tabs.innerHTML = rangos.map(function (r) {
        const act = item._epRangoActivo && item._epRangoActivo.desde === r.desde;
        const lab = r.desde + " - " + r.hasta;
        return '<button type="button" class="season-tab mz-ep-range-tab' + (act ? " active" : "") +
          '" data-range-from="' + r.desde + '" data-range-to="' + r.hasta + '">' + lab + "</button>";
      }).join("");
      tabs.querySelectorAll("[data-range-from]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          item._epRangoActivo = {
            desde: parseInt(btn.getAttribute("data-range-from"), 10),
            hasta: parseInt(btn.getAttribute("data-range-to"), 10)
          };
          tabs.querySelectorAll(".season-tab").forEach(function (t) { t.classList.remove("active"); });
          btn.classList.add("active");
          renderMobileEpNumberGrid(item, seasonNum, epNum);
        });
      });
    }
  }

  renderMobileEpNumberGrid(item, seasonNum, epNum);

  // Cargar servidores (sin autoplay)
  // Cargar servidores (sin autoplay) — siempre mostrar sección
  const serversEl = document.getElementById("servers-section");
  const serversContainer = document.getElementById("servers-container");
  if (serversEl) serversEl.classList.remove("hidden");
  // Sin spinner: se rellena cuando lleguen los embeds

  let pack = { embeds: [], downloads: [] };
  try {
    pack = await asegurarEmbedsEpisodio(item, episodio, seasonNum, epNum);
  } catch (err) {
    console.error("embeds ep móvil:", err);
  }

  window.__mzMobileDownloads = episodio.downloads || pack.downloads || [];
  const lista = pack.embeds || [];
  if (lista.length) {
    renderServidoresYDescargas(
      lista,
      episodio.downloads || pack.downloads || [],
      null,
      item,
      { expandido: true, noAutoplay: true }
    );
  } else if (serversContainer) {
    serversContainer.innerHTML =
      '<p style="color:var(--text-muted);padding:12px;">Este episodio aún no tiene servidores. Prueba otro o Actualizar.</p>';
  }
  if (serversEl) serversEl.classList.remove("hidden");
  document.getElementById("downloads-section")?.classList.add("hidden");
  document.getElementById("mz-mep-dl-panel")?.classList.add("hidden");
  

  // Mismo servidor + autoplay (Siguiente/Anterior)
  try {
    const lista2 = pack.embeds || [];
    const quiereAuto = !!window.__mzAutoPlayEp;
    window.__mzAutoPlayEp = false;
    if (quiereAuto && lista2.length && window.__mzPreferredServer) {
      setTimeout(function () {
        var ok = typeof aplicarServidorPreferido === "function" &&
          aplicarServidorPreferido(lista2, item);
        if (!ok) { /* dejar chips para elegir a mano */ }
      }, 300);
    }
  } catch (_) {}
  

  try {
    requestAnimationFrame(function () {
      document.getElementById("video-player-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } catch (_) {}  
    mzForceEpLikeMovieShell(true, item, episodio, seasonNum, epNum);
  document.getElementById("mz-mep-back")?.classList.remove("hidden");
  return true;
}

function salirVistaMovilEpisodio() {
  try {
    if (window.__mzEpShellTimer) {
      clearInterval(window.__mzEpShellTimer);
      window.__mzEpShellTimer = null;
    }
  } catch (_) {}
  try { mzForceEpLikeMovieShell(false); } catch (_) {}
  document.getElementById("mz-mep-back")?.classList.add("hidden");
  document.body.classList.remove(
    "mz-mobile-ep-playing",
    "player-open",
    "mz-mep-dl-open",
    "mz-ep-movie-shell",
    "koi-movie"
  );
  document.getElementById("video-player-container")?.classList.add("hidden");
  document.getElementById("servers-section")?.classList.add("hidden");
  document.getElementById("mz-mobile-ep-nav")?.classList.add("hidden");
  document.getElementById("mz-mobile-ep-watching")?.classList.add("hidden");
  document.getElementById("mz-mep-dl-panel")?.classList.add("hidden");
  try {
    const ifr = document.getElementById("player-iframe");
    if (ifr) ifr.src = "about:blank";
    if (typeof destruirHls === "function") destruirHls();
  } catch (_) {}
  const cont = document.getElementById("episodes-container");
  if (cont) {
    cont.classList.remove("mz-ep-num-grid");
    cont.classList.add("episodes-grid");
  }
  // Restaurar hero, logo y datos del detalle
  try {
    const hero = document.getElementById("koi-hero");
    if (hero) {
      hero.style.cssText = "";
      hero.style.removeProperty("display");
      hero.setAttribute("aria-hidden", "false");
    }
    const logo = document.getElementById("details-logo");
    if (logo) {
      logo.classList.remove("hidden");
      logo.style.cssText = "";
    }
    const desc = document.getElementById("details-description");
    if (desc) desc.style.cssText = "";
    const header = document.querySelector(".mz-stremio-header");
    if (header) header.style.cssText = "";
    document.querySelectorAll(".details-actions, #mz-stremio-play-row, .mz-synopsis-section, .mz-stremio-poster-col").forEach(function (el) {
      if (el) el.style.cssText = "";
    });
    const closeBtn = document.getElementById("close-player-btn");
    if (closeBtn) {
      closeBtn.classList.remove("hidden");
      closeBtn.style.removeProperty("display");
    }
    const head = document.getElementById("mz-ep-movie-head");
    if (head) head.remove();
  } catch (_) {}
  // Re-pintar detalle si hay item actual (logo / meta)
  try {
    const it =
      window.__mzCurrentItem ||
      (typeof seleccionActual !== "undefined" ? seleccionActual : null) ||
      (_epPlayCtx && _epPlayCtx.item);
    if (it && typeof setKoiMode === "function") setKoiMode(it);
    if (it && typeof fillKoiHero === "function") fillKoiHero(it);
    else if (it && typeof pintarKoiHero === "function") pintarKoiHero(it);
  } catch (_) {}
}


function volverDesdeEpisodioMovil() {
  try {
    if (typeof window.mzKoiCloseEpisodeSilent === "function") window.mzKoiCloseEpisodeSilent();
    else if (typeof window.mzKoiCloseEpisode === "function") window.mzKoiCloseEpisode({ skipHistory: true });
  } catch (_) {}
  const item = (_epPlayCtx && _epPlayCtx.item) || seleccionActual;
  try {
    const ifr = document.getElementById("player-iframe");
    if (ifr) ifr.src = "about:blank";
    if (typeof destruirHls === "function") destruirHls();
  } catch (_) {}

  document.getElementById("mz-mep-dl-panel")?.classList.add("hidden");
  document.getElementById("video-player-container")?.classList.add("hidden");
  document.getElementById("servers-section")?.classList.add("hidden");
  document.getElementById("close-player-btn")?.classList.remove("hidden");

  if (typeof salirVistaMovilEpisodio === "function") salirVistaMovilEpisodio();
    try {
    if (item && typeof setKoiMode === "function") setKoiMode(item);
  } catch (_) {}


  try {
    // replaceState a la ficha (sin apilar ni exigir muchos "atrás")
    if (item && typeof mzReplaceDetalleUrl === "function") {
      mzReplaceDetalleUrl(item);
    } else if (/\/detalle\/(?:\d+\/)?[^\/]+\/\d+\/\d+\/?$/i.test(location.pathname || "")) {
      var p = location.pathname.replace(/\/\d+\/\d+\/?$/, "");
      history.replaceState({ mz: "detalle", season: null, episode: null }, "", p);
    } else if (item && typeof mzPushDetalleUrl === "function") {
      mzPushDetalleUrl(item);
    }
  } catch (_) {}

  if (item && typeof renderTemporadas === "function") {
    document.getElementById("seasons-section")?.classList.remove("hidden");
    renderTemporadas(item);
  }

  // Scroll al listado de episodios (detalle)
  try {
    requestAnimationFrame(function () {
      document.getElementById("seasons-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } catch (_) {}
}

/** PEGAR en app.js: reemplaza TODA la función reproducirCapituloAuto existente */

/** Anime JK (source 5): ir directo a JKPlayer, sin lista de servidores */
function esAnimeJk(item) {
  if (!item) return false;
  const s = String(item.source_id || item.fuente || item.source || "");
  return s === "5" || /jkanime|^jk$/i.test(s);
}

function pickJkPlayer(embeds) {
  const list = Array.isArray(embeds) ? embeds : [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e) continue;
    const blob = String((e.server || "") + " " + (e.tipo || "") + " " + (e.name || "") + " " + (e.servidor || "") + " " + (e.url || "") + " " + (e.embed || "")).toLowerCase();
    if (blob.indexOf("jkplayer") !== -1 || /jkanime\.net\/jkplayer/i.test(blob)) return e;
  }
  for (let j = 0; j < list.length; j++) {
    const e2 = list[j];
    if (e2 && e2.url && /jkanime\.net/i.test(String(e2.url))) return e2;
  }
  return list[0] || null;
}

async function reproducirCapituloAuto(item, episodio, seasonNum, epNum) {
  try {
    if (item && typeof item === "object") {
      item = Object.assign({}, item, {
        temporada: seasonNum != null ? seasonNum : item.temporada,
        season: seasonNum != null ? seasonNum : item.season,
        episodio: epNum != null ? epNum : (episodio && (episodio.episodio || episodio.number || episodio.episode)),
        episode: epNum != null ? epNum : (episodio && (episodio.episodio || episodio.number || episodio.episode)),
        back_img: (episodio && (episodio.back_img || episodio.still || episodio.image)) || item.back_img || item.backdrop || null
      });
    }
  } catch (_) {}

  // Continuar viendo: registrar episodio al abrir (aunque no haya autoplay)
  try {
    if (item && (item.episodio != null || item.episode != null || epNum != null)) {
      if (typeof iniciarSeguimientoProgreso === "function") iniciarSeguimientoProgreso(item);
      // primer guardado pronto (no esperar 15s)
      if (typeof guardarProgreso === "function") {
        const prev = typeof obtenerProgreso === "function" ? (obtenerProgreso()[claveProgreso(item)] || {}) : {};
        const seg0 = Math.max(Number(prev.segundos) || 0, 12);
        guardarProgreso(item, seg0, Number(prev.duracion) || 0);
      }
      try { renderContinuarViendoEnGrid(); } catch (_) {}
    }
  } catch (_) {}

  // PC (≥1025) + serie/anime/dorama → vista tipo Koiflix SIN auto-reproducir
  const pc =
    (typeof isKoiDesktop === "function" && isKoiDesktop()) ||
    (typeof window !== "undefined" && window.innerWidth >= 1025);
  const serie =
    (typeof isSerieOrAnime === "function" && isSerieOrAnime(item)) ||
    /serie|anime|dorama|tv|ova|ona/i.test(String(item?.tipo || item?.type || ""));

  // Serie/anime: misma interfaz Koi que películas (PC + móvil)
  if (serie && !window.__mzForceAutoPlay) {
    if (typeof window.mzKoiOpenEpisode === "function") {
      try {
        await window.mzKoiOpenEpisode(item, episodio, seasonNum, epNum);
      } catch (e) {
        console.error("mzKoiOpenEpisode:", e);
      }
      // JK: al abrir episodio, ir directo a JKPlayer
      if (esAnimeJk(item)) {
        try {
          const packJk = await asegurarEmbedsEpisodio(item, episodio, seasonNum, epNum);
          const jk = pickJkPlayer(packJk.embeds || []);
          if (jk && typeof reproducir === "function") {
            await reproducir(jk, item);
            return true;
          }
        } catch (eJk) {
          console.warn("JK auto koi", eJk);
        }
      }
      return false;
    }
  }

  // —— Móvil / película / force: flujo original ——
  const pack = await asegurarEmbedsEpisodio(item, episodio, seasonNum, epNum);
  let embeds = ordenarEmbedsAuto(pack.embeds || []);
  const conNoAds = insertarNoAdsEnLista(embeds);
  embeds = ordenarEmbedsAuto(conNoAds);

  // JK: primer intento siempre JKPlayer
  if (esAnimeJk(item)) {
    const jk = pickJkPlayer(embeds);
    if (jk) {
      try {
        await reproducir(jk, item);
        engancharEndedAutoplay();
        return true;
      } catch (eJk2) {
        console.warn("JK auto", eJk2);
      }
    }
  }

  _epPlayCtx = {
    item,
    season: Number(seasonNum) || 1,
    episode: Number(epNum) || 0,
    episodio,
  };
  actualizarBotonesEpPlayer();

  document.getElementById("details-title").textContent =
    (item.nombre || item.titulo || "") + " - " + (episodio.nombre || ("Episodio " + epNum));
  try {
    setKoiPlayerEpisodeTitle("Estás viendo T" + (seasonNum || 1) + " · Episodio " + epNum);
    document.body.classList.add("player-open");
  } catch (_) {}

  for (const emb of embeds) {
    try {
      if (emb.noAds || (typeof rankFuenteNoAds === "function" && rankFuenteNoAds(emb))) {
        const embedTry = emb;
        if (embedTry && (embedTry.noAds || embedTry.stream_url || streamUrlParaNoAds(embedTry.url))) {
          const playUrl = await resolverPlayUrlNoAds(
            embedTry.noAds
              ? embedTry
              : {
                  ...embedTry,
                  stream_url: embedTry.stream_url || streamUrlParaNoAds(embedTry.url),
                  noAds: true,
                }
          );
          await reproducirHlsNoAds(playUrl, {
            ...item,
            nombre: (item.nombre || item.titulo || "") + " · E" + epNum,
          });
          engancharEndedAutoplay();
          return true;
        }
      }
      await reproducir(emb, {
        ...item,
        nombre: (item.nombre || item.titulo || "") + " · E" + epNum,
      });
      engancharEndedAutoplay();
      return true;
    } catch (err) {
      console.warn("Auto cap falló servidor", emb?.url, err);
    }
  }

  if (pack.video && !esEmbedInvalido(pack.video)) {
    await reproducir({ url: pack.video, server: "Directo" }, item);
    engancharEndedAutoplay();
    return true;
  }

  const t = document.getElementById("player-title");
  if (t) t.textContent = "Sin mirror estable — prueba otro cap o más tarde";
  return false;
}


function engancharEndedAutoplay() {
  const vid = document.getElementById("player-video");
  if (!vid || vid.dataset.mzEndedBound === "1") return;
  vid.dataset.mzEndedBound = "1";
  vid.addEventListener("ended", () => {
    if (!_autoplayEp) return;
    irSiguienteEpisodio(true);
  });
}

async function irSiguienteEpisodio(fromAuto) {
  if (!_epPlayCtx) return;
  const next = obtenerSiguienteEpisodioCtx(_epPlayCtx);
  if (!next) {
    if (!fromAuto) alert("No hay más episodios en la lista cargada.");
    return;
  }
  const item = _epPlayCtx.item;
  const seasonNum = Number(next.season || next.temporada || _epPlayCtx.season || 1);
  const epNum = Number(next.episode || next.episodio || next.episode_number || 0);
  const playerTitle = document.getElementById("player-title");
  if (playerTitle) playerTitle.textContent = `Cargando E${epNum}...`;

  // marcar botón activo si existe
  try {
    document.querySelectorAll(".episode-btn").forEach((b) => {
      b.classList.toggle("active", String(b.textContent).trim() === String(epNum));
    });
  } catch (_) {}

  await reproducirCapituloAuto(item, next, seasonNum, epNum);
}

function initAutoplayEpUi() {
  const wrap = document.getElementById("mz-ep-controls");
  if (wrap) {
    wrap.classList.add("hidden");
    wrap.style.display = "none";
  }
  const btnNext = document.getElementById("btn-next-ep");
  const btnAuto = document.getElementById("btn-autoplay-ep");
  if (btnNext) {
    btnNext.addEventListener("click", () => irSiguienteEpisodio(false));
  }
  if (btnAuto) {
    const t = document.getElementById("btn-autoplay-ep-text");
    if (t) t.textContent = _autoplayEp ? "Auto" : "Auto off";
    else btnAuto.textContent = _autoplayEp ? "Auto" : "Auto off";
    btnAuto.classList.toggle("off", !_autoplayEp);
    btnAuto.addEventListener("click", () => {
      _autoplayEp = !_autoplayEp;
      localStorage.setItem("mz_autoplay_ep", _autoplayEp ? "1" : "0");
      if (t) t.textContent = _autoplayEp ? "Auto" : "Auto off";
      else btnAuto.textContent = _autoplayEp ? "Auto" : "Auto off";
      btnAuto.classList.toggle("off", !_autoplayEp);
    });
  }
}

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



/** Contenedor real que hace scroll en el detalle (PC película) */
function mzDetailsScrollEl() {
  const candidates = [
    document.querySelector("#details-panel .details-content"),
    document.querySelector("#details-panel .details-body"),
    document.getElementById("details-panel"),
  ];
  for (const el of candidates) {
    if (!el) continue;
    try {
      if (el.scrollHeight > el.clientHeight + 4) return el;
    } catch (_) {}
  }
  return candidates[0] || candidates[1] || null;
}

/** Rueda sobre player (iframe o <video> Directos) → scrollea el panel */
function mzBindPlayerWheelScroll(vc) {
  if (!vc) vc = document.getElementById("video-player-container");
  if (!vc) return;
  const onWheel = function (e) {
    const sc = mzDetailsScrollEl();
    if (!sc) return;
    sc.scrollTop += e.deltaY;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (_) {}
  };
  if (!vc._mzWheelPageScroll) {
    vc._mzWheelPageScroll = true;
    vc.addEventListener("wheel", onWheel, { passive: false, capture: true });
  }
  const vid = document.getElementById("player-video");
  if (vid && !vid._mzWheelPageScroll) {
    vid._mzWheelPageScroll = true;
    vid.addEventListener("wheel", onWheel, { passive: false, capture: true });
  }
  const iframe = document.getElementById("player-iframe");
  // Overlay para iframe (cross-origin no recibe wheel en el parent)
  let ov = vc.querySelector(".mz-scroll-catch");
  const vidVisible = vid && !vid.classList.contains("hidden");
  if (vidVisible) {
    if (ov) {
      ov.style.pointerEvents = "none";
      ov.style.display = "none";
    }
    return;
  }
  const wrap = vc.querySelector(".player-iframe-wrapper") || vc;
  if (!ov) {
    ov = document.createElement("div");
    ov.className = "mz-scroll-catch";
    ov.setAttribute("aria-hidden", "true");
    wrap.style.position = wrap.style.position || "relative";
    wrap.appendChild(ov);
  }
  ov.style.cssText =
    "position:absolute;inset:0;z-index:8;background:transparent;cursor:default;display:block;pointer-events:auto;";
  ov.onwheel = onWheel;
  ov.onmousedown = function () {
    ov.style.pointerEvents = "none";
    const restore = function () {
      ov.style.pointerEvents = "auto";
      window.removeEventListener("mouseup", restore, true);
    };
    window.addEventListener("mouseup", restore, true);
  };
}


async function reproducirHlsNoAds(playUrl, item) {
    destruirHls();
    const vid = ensurePlayerVideoEl();
    if (!vid) throw new Error("Sin elemento video");
    playerIframe.classList.add("hidden");
    playerIframe.src = "about:blank";
    vid.classList.remove("hidden");
    videoContainer.classList.remove("hidden");
        // Overlay no debe tapar controles del <video>, pero sí scrollear con la rueda
    try {
      document.querySelectorAll(".mz-scroll-catch").forEach((ov) => {
        ov.style.pointerEvents = "none";
        ov.style.display = "none";
      });
      vid.style.pointerEvents = "auto";
      vid.style.zIndex = "10";
      if (typeof mzBindPlayerWheelScroll === "function") {
        mzBindPlayerWheelScroll(videoContainer || document.getElementById("video-player-container"));
      }
    } catch (_) {}
  
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
    try {
      if (typeof mzBindPlayerWheelScroll === "function") mzBindPlayerWheelScroll(videoContainer);
    } catch (_) {}
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
    try { animeFuente = "av1"; gridSeccion = "movie"; } catch (_) {}
    homeView.classList.remove("hidden");
    gridView.classList.add("hidden");

    // Cerrar vista TV al volver a Inicio
    const tv = document.getElementById("tv-view");
    if (tv) tv.classList.add("hidden");

    // Cerrar player TV si quedó abierto
    document.body.classList.remove("player-open");

    document.querySelectorAll(".filter-tab, .filter-chip").forEach(el => el.classList.remove("active"));
    const navHome = document.getElementById("nav-item-home");
    if (navHome) navHome.classList.add("active");
    actualizarBotonOnline(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================================
// TV en vivo (Cable + País) — no altera películas/series/anime
// ============================================================
const TV_FAMOSOS = [
  "las estrellas", "canal 5", "canal5", "azteca uno", "azteca 7", "azteca",
  "imagen", "foro tv", "espn", "fox sports", "tudn", "cnn", "discovery",
  "cartoon network", "disney", "nickelodeon", "hbo", "warner", "sony",
  "history", "national geographic", "mtv", "tlc", "paramount", "star channel",
  "televisa", "milenio", "adn40", "canal once", "once", "a&e", "amc"
];

function scoreCanalFamoso(nombre) {
  const n = String(nombre || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let score = 0;
  for (let i = 0; i < TV_FAMOSOS.length; i++) {
    if (n.includes(TV_FAMOSOS[i])) {
      score += (TV_FAMOSOS.length - i) * 10;
    }
  }
  // bonus si el nombre es corto y exacto
  if (score > 0 && n.length < 25) score += 5;
  return score;
}

function ordenarCanalesFamososPrimero(lista) {
  return (lista || []).slice().sort((a, b) => {
    const sb = scoreCanalFamoso(b.nombre);
    const sa = scoreCanalFamoso(a.nombre);
    if (sb !== sa) return sb - sa;
    return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
  });
}

function ocultarVistasPrincipales() {
  const home = document.getElementById("home-view");
  const grid = document.getElementById("grid-view");
  const tv = document.getElementById("tv-view");
  if (home) home.classList.add("hidden");
  if (grid) grid.classList.add("hidden");
  if (tv) tv.classList.add("hidden");
}

function abrirTvView(tab) {
  ocultarVistasPrincipales();
  const tv = document.getElementById("tv-view");
  if (tv) tv.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTvTab(tab || "cable");
}

function cerrarTvView() {
  const tv = document.getElementById("tv-view");
  if (tv) tv.classList.add("hidden");
  if (typeof mostrarHome === "function") mostrarHome();
}

function setTvTab(tab) {
  const cablePanel = document.getElementById("tv-panel-cable");
  const paisPanel = document.getElementById("tv-panel-paises");
  document.querySelectorAll(".tv-tab").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-tv-tab") === tab);
  });
  if (tab === "cable") {
    if (cablePanel) cablePanel.classList.remove("hidden");
    if (paisPanel) paisPanel.classList.add("hidden");
    cargarTvCable();
  } else {
    if (paisPanel) paisPanel.classList.remove("hidden");
    if (cablePanel) cablePanel.classList.add("hidden");
    cargarTvPaises();
  }
}

async function cargarTvCable() {
  const box = document.getElementById("tv-canales-cable");
  const gruposEl = document.getElementById("tv-grupos-cable");
  if (!box) return;
  box.innerHTML = '<div class="tv-loading">Cargando canales…</div>';
  try {
    const r = await fetch("/api/tv/cable");
    const data = await r.json();
    if (!data || !data.success) throw new Error((data && data.error) || "Error");
    window.__tvCable = data.canales || [];
    window.__tvCableGrupos = data.grupos || [];

    if (gruposEl) {
      gruposEl.innerHTML =
        '<button type="button" class="tv-chip active" data-grupo="">Todos</button>' +
        window.__tvCableGrupos
          .map(
            (g) =>
              `<button type="button" class="tv-chip" data-grupo="${escapeHtml(g)}">${escapeHtml(g)}</button>`
          )
          .join("");
      gruposEl.querySelectorAll(".tv-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          gruposEl.querySelectorAll(".tv-chip").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          renderTvCanales(
            box,
            filtrarGrupo(window.__tvCable, btn.getAttribute("data-grupo") || "")
          );
        });
      });
    }

    renderTvCanales(box, window.__tvCable);
  } catch (e) {
    box.innerHTML = `<div class="tv-loading">No se pudo cargar cable: ${escapeHtml(e.message || e)}</div>`;
  }
}

function filtrarGrupo(lista, grupo) {
  if (!grupo) return lista || [];
  const g = grupo.toLowerCase();
  return (lista || []).filter((c) => String(c.grupo || "").toLowerCase() === g);
}

async function cargarTvPaises() {
  const chips = document.getElementById("tv-paises-chips");
  const box = document.getElementById("tv-canales-pais");
  if (!chips || !box) return;

  if (!window.__tvCountries) {
    chips.innerHTML = '<div class="tv-loading">Cargando países…</div>';
    try {
      const r = await fetch("/api/tv/countries");
      const data = await r.json();
      window.__tvCountries = (data && data.countries) || [];
    } catch (e) {
      chips.innerHTML = `<div class="tv-loading">Error países</div>`;
      return;
    }
  }

  // Priorizar LATAM / ES / US al frente
  const priority = ["mx", "es", "ar", "co", "cl", "pe", "us", "ve", "ec"];
  const countries = window.__tvCountries.slice().sort((a, b) => {
    const ia = priority.indexOf(a.code);
    const ib = priority.indexOf(b.code);
    if (ia === -1 && ib === -1) return String(a.name).localeCompare(String(b.name));
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  chips.innerHTML = countries
    .map(
      (c) =>
        `<button type="button" class="tv-chip" data-code="${escapeHtml(c.code)}">${escapeHtml(
          (c.name || c.code).toString()
        )}</button>`
    )
    .join("");

  chips.querySelectorAll(".tv-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      chips.querySelectorAll(".tv-chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      cargarTvPais(btn.getAttribute("data-code"));
    });
  });

  // Auto México si existe
  const mx = chips.querySelector('.tv-chip[data-code="mx"]');
  if (mx) mx.click();
  else box.innerHTML = '<div class="tv-hint">Elige un país</div>';
}

async function cargarTvPais(code) {
  const box = document.getElementById("tv-canales-pais");
  if (!box) return;
  box.innerHTML = '<div class="tv-loading">Cargando canales…</div>';
  try {
    const r = await fetch("/api/tv/countries/" + encodeURIComponent(code));
    const data = await r.json();
    if (!data || !data.success) throw new Error((data && data.error) || "Error");
    renderTvCanales(box, data.canales || []);
  } catch (e) {
    box.innerHTML = `<div class="tv-loading">Error: ${escapeHtml(e.message || e)}</div>`;
  }
}

function renderTvCanales(container, lista) {
  // Solo canales que sí se pueden ver en el navegador (https / proxy_ok)
  const reproducibles = (lista || []).filter(function (c) {
    var u = c.play_url || c.url || "";
    return c.proxy_ok === true || /^https:\/\//i.test(u);
  });
  const ordered = ordenarCanalesFamososPrimero(reproducibles); 
  if (!ordered.length) {
    container.innerHTML = '<div class="tv-hint">Sin canales</div>';
    return;
  }
  container.innerHTML = ordered
    .map((c, i) => {
      const logo = c.logo
        ? `<img src="${escapeHtml(c.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : `<ion-icon name="tv-outline" style="font-size:40px;opacity:.5"></ion-icon>`;
      return `<button type="button" class="tv-canal-card" data-idx="${i}">
        ${logo}
        <div class="tv-canal-nombre">${escapeHtml(c.nombre || "Canal")}</div>
      </button>`;
    })
    .join("");

  container.querySelectorAll(".tv-canal-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const canal = ordered[idx];
      if (canal && canal.url) reproducirCanalTv(canal);
    });
  });
}



function abrirPanelPlayerTv() {
  const panel = document.getElementById("details-panel");
  if (panel) panel.classList.remove("hidden");
  if (typeof videoContainer !== "undefined" && videoContainer) {
    videoContainer.classList.remove("hidden");
  }
  document.body.classList.add("player-open");
}

function tvPlayUrl(canal) {
  // La API ya trae play_url lista (con proxy si proxy_ok)
  if (canal && typeof canal === "object") {
    if (canal.play_url) return canal.play_url;
    if (canal.url) return canal.url;
  }
  if (typeof canal === "string") return canal;
  return "";
}

function reproducirCanalTv(canal) {
  if (!canal || !canal.url) return;
  if (window.__tvPlayingLock) return;
  window.__tvPlayingLock = true;
  setTimeout(() => { window.__tvPlayingLock = false; }, 1000);

  try {
    abrirPanelPlayerTv();
    if (typeof destruirHls === "function") destruirHls();

    const vid = typeof ensurePlayerVideoEl === "function" ? ensurePlayerVideoEl() : null;
    const titleEl = document.getElementById("player-title");
    if (titleEl) titleEl.textContent = "Cargando: " + (canal.nombre || "TV");

    if (!vid) {
      window.open(canal.url, "_blank");
      return;
    }

    if (typeof playerIframe !== "undefined" && playerIframe) {
      playerIframe.classList.add("hidden");
      playerIframe.src = "about:blank";
    }
    vid.classList.remove("hidden");
    if (typeof mostrarBotonFullscreen === "function") mostrarBotonFullscreen(true);

    const playUrl = tvPlayUrl(canal);

    const start = () => {
      if (window.Hls && window.Hls.isSupported()) {
        try {
          if (typeof _hlsInstance !== "undefined" && _hlsInstance) {
            _hlsInstance.destroy();
          }
        } catch (_) {}

        const hls = new window.Hls({
          enableWorker: true,
          maxErrorRetry: 3,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
          fragLoadingMaxRetry: 3,
        });
        try { _hlsInstance = hls; } catch (_) { window.__tvHls = hls; }

        hls.on(window.Hls.Events.ERROR, function (_e, data) {
          if (!data || !data.fatal) return;
          console.warn("TV HLS fatal", data);
          if (titleEl) titleEl.textContent = (canal.nombre || "Canal") + " — no disponible";
          try { hls.destroy(); } catch (_) {}
        });

        hls.loadSource(playUrl);
        hls.attachMedia(vid);
        hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
          if (titleEl) titleEl.textContent = canal.nombre || "TV en vivo";
          const p = vid.play();
          if (p && p.catch) p.catch(() => {});
        });
      } else if (vid.canPlayType("application/vnd.apple.mpegurl")) {
        vid.src = playUrl;
        if (titleEl) titleEl.textContent = canal.nombre || "TV en vivo";
        vid.play().catch(() => {});
      } else {
        if (titleEl) titleEl.textContent = "Este navegador no soporta HLS";
      }

      requestAnimationFrame(() => {
        const box = document.getElementById("video-player-container");
        if (box) {
          try { box.scrollIntoView({ behavior: "smooth", block: "center" }); }
          catch (_) { box.scrollIntoView(true); }
        }
      });
    };

    if (window.Hls) {
      start();
    } else {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
      s.onload = start;
      s.onerror = () => {
        if (titleEl) titleEl.textContent = "No se pudo cargar hls.js";
      };
      document.head.appendChild(s);
    }
  } catch (err) {
    console.error("reproducirCanalTv", err);
    const titleEl = document.getElementById("player-title");
    if (titleEl) titleEl.textContent = "Error al reproducir";
  }
}

function scrollPlayerTv() {
  requestAnimationFrame(() => {
    const box = document.getElementById("video-player-container");
    if (!box) return;
    try {
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      box.scrollIntoView(true);
    }
  });
}

// =====================================================
// Fútbol — agenda diaria (Worker /7/agenda)
// =====================================================
// Agenda fútbol via MovieZone → worker /7 (futbollibrefullhd.org)
const FUTBOL_AGENDA_URL = "/api/tv/futbol/agenda";
const FUTBOL_CANALES_URL = "/api/tv/futbol/canales";
const FUTBOL_WORKER_AGENDA = (typeof WORKER_STREAM !== "undefined" ? WORKER_STREAM : "https://moviezone.tvjz.workers.dev") + "/7/agenda";


const FUTBOL_LIGA_META = {
  CHA: { label: "Champions League", short: "UCL", color: "#1e3a8a" },
  LIB: { label: "Copa Libertadores", short: "LIB", color: "#b45309" },
  SUD: { label: "Copa Sudamericana", short: "SUD", color: "#047857" },
  ENG: { label: "Premier League", short: "ENG", color: "#6d28d9" },
  FIFA: { label: "FIFA", short: "FIFA", color: "#0ea5e9" },
  AR:  { label: "Liga Argentina", short: "ARG", color: "#0369a1" },
  FUT: { label: "Fútbol", short: "FUT", color: "#7c3aed" }
};

function futbolHoyKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
                              
function futbolMatchKey(item) {
  return futbolHoyKey() + "_" + String(item.titulo || "").toLowerCase().replace(/\s+/g, "_").slice(0, 80);
}

/** Espectadores simulados estables por partido (sin backend) */
function futbolViewers(item) {
  const s = String(item.titulo || "") + "|" + (item.hora || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 180 + (h % 7800);
}

function futbolServerIcon(name) {
  const n = String(name || "").toLowerCase();
  if (/disney/.test(n)) return "🎬";
  if (/espn/.test(n)) return "📺";
  if (/fox/.test(n)) return "FOX";
  if (/paramount/.test(n)) return "★";
  if (/tudn|univision/.test(n)) return "T";
  if (/max|hbo/.test(n)) return "M";
  if (/tyc/.test(n)) return "TYC";
  if (/directv|dsports/.test(n)) return "DTV";
  if (/eventos/.test(n)) return "▶";
  return String(name || "SRV").slice(0, 3).toUpperCase();
}

function futbolParseHora(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function futbolEsEnVivo(item) {
  const mins = futbolParseHora(item.hora);
  if (mins == null) return false;
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  // ventana: 10 min antes → 2h después
  let d = nowM - mins;
  if (d < -12 * 60) d += 24 * 60;
  if (d > 12 * 60) d -= 24 * 60;
  return d >= -10 && d <= 120;
}



function showFutbolView() {
  document.getElementById("home-view")?.classList.add("hidden");
  document.getElementById("tv-view")?.classList.add("hidden");
  document.getElementById("futbol-partido-view")?.classList.add("hidden");
  document.getElementById("grid-view")?.classList.add("hidden");
  const fv = document.getElementById("futbol-view");
  if (fv) fv.classList.remove("hidden");
  cargarFutbolAgenda();
}

function detenerFutbolPlayer() {
  try {
    const iframe = document.getElementById("futbol-player-iframe");
    if (iframe) {
      try { iframe.src = "about:blank"; } catch (_) {}
      iframe.removeAttribute("src");
      iframe.src = "";
      iframe.classList.add("hidden");
    }
    const ph = document.getElementById("futbol-player-placeholder");
    if (ph) ph.classList.remove("hidden");
    document.getElementById("futbol-chat-block")?.classList.add("hidden");
  } catch (_) {}
}

function hideFutbolViews() {
  detenerFutbolPlayer();
  document.getElementById("futbol-view")?.classList.add("hidden");
  document.getElementById("futbol-partido-view")?.classList.add("hidden");
}

function futbolLigaMeta(code, ligaNombre) {
  const base = FUTBOL_LIGA_META[code] || null;
  if (base) return base;
  const label = ligaNombre || code || "Fútbol";
  const short = String(code || label).slice(0, 4).toUpperCase();
  return { label: label, short: short, color: "#4c1d95" };
}

function futbolCardLogos(it) {
  // logos equipos o portada de liga (img.wqxag.com)
  const home = it.home_logo || it.homeLogo || it.logo_home || null;
  const away = it.away_logo || it.awayLogo || it.logo_away || null;
  if (home || away) {
    return (
      '<div class="futbol-logos">' +
        (home ? '<img src="' + escapeHtml(home) + '" alt="" loading="lazy" />' : '<span class="futbol-logo-ph"></span>') +
        '<span class="futbol-vs">vs</span>' +
        (away ? '<img src="' + escapeHtml(away) + '" alt="" loading="lazy" />' : '<span class="futbol-logo-ph"></span>') +
      "</div>"
    );
  }
  const portada = it.portada || it.poster || it.image || null;
  if (portada && !/logo-futbol-libre|sin_imagen|placeholder/i.test(String(portada))) {
    return (
      '<div class="futbol-logos futbol-portada-liga">' +
        '<img src="' + escapeHtml(portada) + '" alt="" loading="lazy" />' +
      "</div>"
    );
  }
  const meta = futbolLigaMeta(it.liga, it.liga_nombre);
  return '<div class="futbol-liga-ico" style="background:' + meta.color + '">' + escapeHtml(meta.short) + "</div>";
}

async function cargarFutbolAgenda() {
  const lista = document.getElementById("futbol-lista");
  const fechaEl = document.getElementById("futbol-fecha-texto");
  if (!lista) return;
  lista.innerHTML = '<div class="tv-loading">Cargando partidos…</div>';

  try {
    let data = null;
    try {
      const r = await fetch(FUTBOL_AGENDA_URL, { cache: "no-store" });
      data = await r.json();
    } catch (_) {}
    if (!data || !Array.isArray(data.items) || !data.items.length) {
      try {
        const r2 = await fetch(FUTBOL_WORKER_AGENDA, { cache: "no-store" });
        data = await r2.json();
      } catch (_) {}
    }
    const items = Array.isArray(data && data.items) ? data.items.slice() : [];

      const limpios = items.filter(function (it) {
      const t = String(it.titulo || "").trim();
      if (!t || /^partido$/i.test(t) || t.length < 4) return false;
      // Mostrar aunque aún no tengan servidores (agenda del día)
      return true;
    });

    limpios.sort(function (a, b) {
      const ma = futbolParseHora(a.hora);
      const mb = futbolParseHora(b.hora);
      if (ma == null && mb == null) return 0;
      if (ma == null) return 1;
      if (mb == null) return -1;
      return ma - mb;
    });
    limpios.sort(function (a, b) {
      return (futbolEsEnVivo(b) ? 1 : 0) - (futbolEsEnVivo(a) ? 1 : 0);
    });

    if (fechaEl) {
      fechaEl.textContent = data.fecha_texto || ("Agenda · " + futbolHoyKey());
    }

    limpios.sort(function (a, b) {
      const ma = futbolParseHora(a.hora);
      const mb = futbolParseHora(b.hora);
      if (ma == null && mb == null) return 0;
      if (ma == null) return 1;
      if (mb == null) return -1;
      return ma - mb;
    });
    limpios.sort(function (a, b) {
      return (futbolEsEnVivo(b) ? 1 : 0) - (futbolEsEnVivo(a) ? 1 : 0);
    });

    window.__futbolAgenda = limpios;

    if (!limpios.length) {
      lista.innerHTML = '<div class="tv-hint">No hay partidos hoy</div>';
      return;
    }

    lista.innerHTML = limpios.map(function (it, idx) {
      const meta = futbolLigaMeta(it.liga, it.liga_nombre);
      const vivo = it.status === "en_vivo" || futbolEsEnVivo(it);
      const pronto = it.status === "pronto";
      const ligaTxt = it.liga_nombre || meta.label;
      const subEquipos =
        it.home_team && it.away_team
          ? escapeHtml(it.home_team + " vs " + it.away_team)
          : escapeHtml(it.titulo || "");

      return (
        '<button type="button" class="futbol-card' +
        (vivo ? " en-vivo" : "") +
        (pronto ? " pronto" : "") +
        '" data-fidx="' + idx + '">' +
          futbolCardLogos(it) +
          '<div class="futbol-card-body">' +
            '<div class="futbol-liga-row"><span class="futbol-liga-pill" style="background:' +
            meta.color +
            '">' +
            escapeHtml(ligaTxt) +
            "</span>" +
            (it.deporte_icono
             ? '<span class="futbol-deporte-ico">' + escapeHtml(it.deporte_icono) + "</span>"
             : "") +
            "</div>" +
            '<p class="futbol-card-titulo">' +
            escapeHtml(it.titulo || subEquipos) +
            "</p>" +
            '<div class="futbol-card-sub">' + 
        (vivo ? '<span class="futbol-badge-vivo">En vivo</span>' : "") +
        (pronto ? '<span class="futbol-badge-pronto">Pronto</span>' : "") + 
        '<span class="futbol-serv-count">' + (it.reproductores || []).length + " servidores</span>" +
            "</div>" +
          "</div>" +
          '<div class="futbol-hora">' +
          escapeHtml(it.hora || "--:--") +
          "</div>" +
        "</button>"
      );
    }).join("");

    // Delegación click/touch (móvil): más fiable que un listener por tarjeta
    if (lista.dataset.futbolBound !== "1") {
      lista.dataset.futbolBound = "1";
      const openFromEvent = function (ev) {
        const btn = ev.target && ev.target.closest ? ev.target.closest(".futbol-card") : null;
        if (!btn || !lista.contains(btn)) return;
        ev.preventDefault();
        ev.stopPropagation();
        const i = parseInt(btn.getAttribute("data-fidx"), 10);
        const item = window.__futbolAgenda && window.__futbolAgenda[i];
        if (item) {
          try { abrirFutbolPartido(item); }
          catch (eOpen) { console.error("abrirFutbolPartido", eOpen); }
        }
      };
      lista.addEventListener("click", openFromEvent);
      lista.addEventListener("touchend", function (ev) {
        // evitar doble con click sintético: solo si no hubo scroll largo
        if (ev.cancelable) openFromEvent(ev);
      }, { passive: false });
    }
  } catch (e) {
    lista.innerHTML = '<div class="tv-hint">No se pudo cargar la agenda</div>';
  }
}

function abrirFutbolPartido(item) {
  if (!item) return;
  try {
    document.getElementById("home-view")?.classList.add("hidden");
    document.getElementById("grid-view")?.classList.add("hidden");
  } catch (_) {}
  document.getElementById("futbol-view")?.classList.add("hidden");
  const pv = document.getElementById("futbol-partido-view");
  if (pv) {
    pv.classList.remove("hidden");
    pv.style.display = "";
  }
  window.__futbolPartidoActual = item;
  try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}

  const t = document.getElementById("futbol-partido-titulo");
  if (t) t.textContent = item.titulo || "Partido";

  const metaL = futbolLigaMeta(item.liga, item.liga_nombre);
  const meta = document.getElementById("futbol-partido-meta");
  if (meta) {
    const vivo = item.status === "en_vivo" || futbolEsEnVivo(item);
    const pronto = item.status === "pronto";
    meta.innerHTML =
      '<div class="futbol-detalle-top">' +
      futbolCardLogos(item) +
      "<div>" +
      '<span class="futbol-liga-pill" style="background:' +
      metaL.color +
      '">' +
      escapeHtml(item.liga_nombre || metaL.label) +
      "</span> " +
      (item.hora ? "<strong>" + escapeHtml(item.hora) + "</strong> " : "") +
      (vivo ? '<span class="futbol-badge-vivo">En vivo</span>' : "") +
      (pronto ? '<span class="futbol-badge-pronto">Pronto</span>' : "") +
      (item.timezone ? '<span class="futbol-tz"> · ' + escapeHtml(item.timezone) + "</span>" : "") +
      "</div></div>";
  }

  // Reset player
  const iframe = document.getElementById("futbol-player-iframe");
  const ph = document.getElementById("futbol-player-placeholder");
  if (iframe) {
    iframe.src = "";
    iframe.classList.add("hidden");
  }
  if (ph) ph.classList.remove("hidden");
  document.getElementById("futbol-chat-block")?.classList.add("hidden");

  const box = document.getElementById("futbol-reproductores");
  const reps = Array.isArray(item.reproductores) ? item.reproductores : [];
  if (!box) return;
  if (!reps.length) {
    box.innerHTML = '<div class="tv-hint">Sin reproductores</div>';
    return;
  }

  box.innerHTML = reps.map(function (r, i) {
    const name = r.servidor || "Server";
    const cal = r.calidad ? " · " + r.calidad : "";
    const ico = futbolServerIcon(name);
    return (
      '<button type="button" class="futbol-rep-btn" data-ri="' + i + '">' +
        '<span class="futbol-rep-ico">' + escapeHtml(ico) + "</span>" +
        "<span><strong>" + escapeHtml(name) + "</strong>" + escapeHtml(cal) + "</span>" +
      "</button>"
    );
  }).join("");

  box.querySelectorAll(".futbol-rep-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const ri = parseInt(btn.getAttribute("data-ri"), 10);
      const rep = reps[ri];
      if (!rep) return;
      const playUrl = rep.url || rep.embed || rep.link || null;
      if (!playUrl) return;
      box.querySelectorAll(".futbol-rep-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      futbolPlayEmbed(playUrl);
    });
  });
  // Auto: primer servidor al abrir (escritorio y móvil)
  const first = reps[0];
  const firstUrl = first && (first.url || first.embed || first.link);
  if (firstUrl) {
    const firstBtn = box.querySelector(".futbol-rep-btn");
    if (firstBtn) firstBtn.classList.add("active");
    futbolPlayEmbed(firstUrl);
  }
}

function futbolPlayEmbed(url) {
  const iframe = document.getElementById("futbol-player-iframe");
  const ph = document.getElementById("futbol-player-placeholder");
  if (!iframe) return;
  if (ph) ph.classList.add("hidden");
  iframe.classList.remove("hidden");
  iframe.src = url;
  // Chat solo al reproducir
  document.getElementById("futbol-chat-block")?.classList.remove("hidden");
  futbolChatRender();
}

function futbolChatStorageKey() {
  const it = window.__futbolPartidoActual;
  if (!it) return null;
  return "mz_fl_chat_" + futbolMatchKey(it);
}

function futbolChatLoad() {
  try {
    const k = futbolChatStorageKey();
    if (!k) return [];
    // Limpiar chats de otros días
    const prefix = "mz_fl_chat_" + futbolHoyKey();
    Object.keys(localStorage).forEach(function (key) {
      if (key.indexOf("mz_fl_chat_") === 0 && key.indexOf(prefix) !== 0) {
        try { localStorage.removeItem(key); } catch (_) {}
      }
    });
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function futbolChatSave(msgs) {
  try {
    const k = futbolChatStorageKey();
    if (!k) return;
    localStorage.setItem(k, JSON.stringify(msgs.slice(-80)));
  } catch (_) {}
}

function futbolChatRender() {
  const el = document.getElementById("futbol-chat-msgs");
  if (!el) return;
  const msgs = futbolChatLoad();
  if (!msgs.length) {
    el.innerHTML = '<div class="tv-hint">Sé el primero en comentar</div>';
    return;
  }
  el.innerHTML = msgs.map(function (m) {
    return (
      '<div class="futbol-chat-line"><strong>' +
      escapeHtml(m.user || "Anon") +
      ":</strong> " +
      escapeHtml(m.text || "") +
      "</div>"
    );
  }).join("");
  el.scrollTop = el.scrollHeight;
}

function initFutbolUI() {
  document.getElementById("btn-tv-futbol")?.addEventListener("click", function () {
    showFutbolView();
  });
  document.getElementById("futbol-btn-back")?.addEventListener("click", function () {
    hideFutbolViews();
    document.getElementById("home-view")?.classList.remove("hidden");
  });
  document.getElementById("futbol-partido-back")?.addEventListener("click", function () {
    detenerFutbolPlayer();
    document.getElementById("futbol-partido-view")?.classList.add("hidden");
    document.getElementById("futbol-view")?.classList.remove("hidden");
  });
  document.getElementById("futbol-chat-form")?.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const input = document.getElementById("futbol-chat-input");
    const text = (input && input.value || "").trim();
    if (!text) return;
    const p = typeof getActiveProfile === "function" ? getActiveProfile() : null;
    const user = (p && p.nombre) || "Usuario";
    const msgs = futbolChatLoad();
    msgs.push({ user: user, text: text, ts: Date.now() });
    futbolChatSave(msgs);
    if (input) input.value = "";
    futbolChatRender();
  });
}

// Llamar al iniciar la app (junto al resto de listeners de TV)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFutbolUI);
} else {
  initFutbolUI();
}

function initTvUi() {
  const btnCable = document.getElementById("btn-tv-cable");
  const btnPaises = document.getElementById("btn-tv-paises");
  const back = document.getElementById("tv-btn-back");
  const tabCable = document.getElementById("tv-tab-cable");
  const tabPaises = document.getElementById("tv-tab-paises");

  if (btnCable) btnCable.addEventListener("click", () => abrirTvView("cable"));
  if (btnPaises) btnPaises.addEventListener("click", () => abrirTvView("paises"));
  if (back) back.addEventListener("click", cerrarTvView);
  if (tabCable) tabCable.addEventListener("click", () => setTvTab("cable"));
  if (tabPaises) tabPaises.addEventListener("click", () => setTvTab("paises"));
}

function aplicarFiltrosYOrden(lista) {
    let res = [...(lista || [])];

    // Búsqueda: no filtrar por Anime/Serie/Peli salvo chip explícito del usuario
    if (gridModo === "search" && gridTypeFilter === "all") {
      // solo orden abajo — mostrar series, pelis, animes, doramas juntos
    } else if (gridTypeFilter !== "all") {
        const map = { movie: "Película", series: "Serie", anime: "Anime" };
        const wanted = map[gridTypeFilter] || gridTypeFilter;
        res = res.filter(i => {
            const isJk = typeof esItemJk === "function" ? esItemJk(i) : false;
            const sid = String(i.source_id || i.fuente || i.source || "").toLowerCase();
            const isAv1 = sid === "4" || sid === "animeav1" || /animeav1/i.test(sid);
            // Secciones propias: JK y AnimeAV1 no se mezclan
            if (gridSeccion === "jk") return isJk;
            // Películas / series / anime AV1: nunca items JK
            if (gridSeccion === "movie" || gridSeccion === "series" || gridSeccion === "anime") {
              if (isJk) return false;
            }
            if (gridSeccion === "anime" && isJk) return false;
            if (animeFuente === "jk" && gridSeccion === "jk") return isJk;
            if (animeFuente === "av1" && gridTypeFilter === "anime" && isJk) return false;

            // Sección Anime: SOLO AnimeAV1 (4) con cualquier tipo — NO películas de otras fuentes
            if ((gridSeccion === "anime" || gridTypeFilter === "anime") && isAv1 && !isJk) {
              return true;
            }

            const t = (i.tipo || "").toString();
            const tl = t.toLowerCase();
            if (gridTypeFilter === "anime" && isJk) return false;
            if (t === wanted) return true;
            if (tl.includes(String(gridTypeFilter).toLowerCase())) return true;
            // Otras fuentes en anime: solo tipo anime/ova/ona/especial (nunca películas sueltas)
            if (gridTypeFilter === "anime" && /^(anime|ova|ona|especial)$/i.test(tl.trim())) return true;
            if (gridTypeFilter === "series" && /serie|dorama|tv/i.test(tl)) return true;
            if (gridTypeFilter === "movie" && /pel[ií]cula|movie|film/i.test(tl)) return true;
            return false;
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

function mostrarGrid({ modo, seccion, termino = "" }) {
    vistaActual = "grid";
    try { setTimeout(function () { renderContinuarViendoEnGrid(); }, 50); } catch (_) {}

    gridModo = modo;
    // Búsqueda global: NO default a "movie" (eso filtraba todo y dejaba 0 de N)
    if (modo === "search") {
      seccion = seccion || "all";
    } else {
      seccion = seccion || "movie";
    }
    gridSeccion = seccion;
    gridTermino = termino;
    gridPage = 1;
    gridSinMasResultados = false;
    if (modo === "categoria") {
      if (seccion === "jk") {
        gridTypeFilter = "anime";
        animeFuente = "jk";
      } else if (seccion === "anime") {
        gridTypeFilter = "anime";
        animeFuente = "av1";
      } else if (seccion === "movie" || seccion === "series") {
        gridTypeFilter = seccion;
        animeFuente = "av1"; // salir de JK: no arrastrar fuente
      } else {
        gridTypeFilter = "all";
        if (seccion !== "jk") animeFuente = "av1";
      }
    } else if (modo === "search") {
      if (seccion === "anime") { gridTypeFilter = "anime"; animeFuente = "av1"; }
      else if (seccion === "jk") { gridTypeFilter = "anime"; animeFuente = "jk"; }
      else if (seccion === "series") gridTypeFilter = "series";
      else if (seccion === "movie") gridTypeFilter = "movie";
      else {
        gridTypeFilter = "all";
        gridSeccion = "all";
      }
    }

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
        resultsTitle.textContent = seccion === "movie" ? "Películas" : seccion === "series" ? "Series" : seccion === "jk" ? "JK Anime" : "Anime";
        document.getElementById("filter-toolbar").classList.remove("hidden");
        const navMap = { movie: "nav-item-movies", series: "nav-item-series", anime: "nav-item-anime", jk: "nav-item-jk" };
        document.getElementById(navMap[seccion])?.classList.add("active");
    }

    resultsGrid.innerHTML = "";
    resultsEmpty.classList.add("hidden");
    scrollSentinel.classList.add("hidden");
    try {
      resultsGrid.classList.add("catalog-grid");
      resultsGrid.classList.remove("mz-av1-home-wrap", "mz-jk-home-wrap");
    } catch (_) {}
    try { bindAnimeSourceChips(); syncAnimeSourceChips(); } catch (_) {}
    cargarPaginaGrid();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ======================================================
// CARGA DE DATOS (conectado a tu server.js real)
// ======================================================

/** publishedAt / ISO → Hoy | Ayer | Sábado 20 (zona local del navegador) */
function fechaRelativaDesdeIso(raw) {
  if (raw == null || raw === "") return null;
  var s = String(raw).trim();
  // Ya es etiqueta legible
  if (/^(hoy|ayer)$/i.test(s)) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (/^[a-záéíóúñ]+\s+\d{1,2}$/i.test(s) && !/\d{4}/.test(s)) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  var d = new Date(s);
  if (isNaN(d.getTime())) {
    // "2026-09-20 16:58:48.751+00" → intentar ISO
    var s2 = s.replace(" ", "T").replace(/\+00$/, "Z").replace(/(\.\d+)\+00$/, "$1Z");
    d = new Date(s2);
  }
  if (isNaN(d.getTime())) return null;

  var now = new Date();
  var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diffDays = Math.round((startToday - startThat) / 86400000);

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays > 1 && diffDays < 7) {
    try {
      var lab = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric" }).format(d);
      lab = lab.replace(",", "");
      return lab.charAt(0).toUpperCase() + lab.slice(1);
    } catch (_) {}
  }
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(d);
  } catch (_) {
    return s.slice(0, 10);
  }
}

/** AnimeAV1 /4/home — recientes + agregados (se actualiza a diario) */
function normalizarItemHomeAv1(it, bloque) {
  if (!it) return null;
  const slug = String(it.slug || "").replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  const ep = it.episodio != null ? it.episodio : (it.number != null ? it.number : null);
  const tituloBase =
    it.titulo_anime ||
    (it.titulo && String(it.titulo).replace(/\s*[—\-–]\s*Episodio\s*\d+\s*$/i, "").trim()) ||
    it.title ||
    slug;
  const nombre = String(tituloBase).trim() || slug;
  const tipoRaw = it.tipo || it.type || it.formato || "Anime";
  const link =
    it.url ||
    it.link ||
    ("https://moviezone.tvjz.workers.dev/4/anime/" + encodeURIComponent(slug));
  // Recientes: still/back_img del episodio (no portada del anime)
  // Agregados: portada del título
  const esRecientes = bloque === "recientes";
  const portada = esRecientes
    ? (it.back_img || it.still || it.portada || null)
    : (it.portada || it.back_img || it.still || null);

  // Estado en lista (misma lógica que el resto del catálogo)
  let enEmision = null;
  let finalizado = null;
  let estado = it.estado || it.status || null;
  if (typeof it.en_emision === "boolean") enEmision = it.en_emision;
  if (typeof it.finalizado === "boolean") finalizado = it.finalizado;
  if (estado) {
    const st = String(estado).toLowerCase();
    if (enEmision == null && /emisi|airing|ongoing|en curso/i.test(st)) enEmision = true;
    if (finalizado == null && /final|conclu|ended|finished|complete/i.test(st)) finalizado = true;
  }
  // Recientes = episodio recién publicado → suele estar en emisión si no dice lo contrario
  if (esRecientes && enEmision == null && finalizado == null) {
    enEmision = true;
  }

  return {
    nombre: nombre,
    titulo: nombre,
    slug: slug,
    portada: portada,
    back_img: it.back_img || it.still || null,
    tipo: tipoRaw,
    type: tipoRaw,
    formato: it.formato || null,
    source_id: "4",
    fuente: "animeav1",
    source: "animeav1",
    link: link,
    url_extract: link,
    episodio: ep != null ? Number(ep) : null,
    descripcion: it.descripcion || null,
    estado: estado,
    en_emision: enEmision,
    finalizado: finalizado === true ? true : (enEmision === true ? false : finalizado),
    _homeAv1: bloque || "recientes",
    _homeEpLabel: ep != null ? ("Episodio " + ep) : null,
    fecha: (function () {
      var raw = it.fecha_relativa || it.fecha || it.published_label || it.publishedAt || null;
      return fechaRelativaDesdeIso(raw) || (typeof limpiarFechaJkLabel === "function" ? limpiarFechaJkLabel(raw) : raw);
    })(),
    fecha_relativa: (function () {
      var raw = it.fecha_relativa || it.fecha || it.published_label || it.publishedAt || null;
      return fechaRelativaDesdeIso(raw) || (typeof limpiarFechaJkLabel === "function" ? limpiarFechaJkLabel(raw) : raw);
    })(),
    publishedAt: it.publishedAt || null
  };
}

async function fetchAnimeAv1Home() {
  const base =
    typeof WORKER_STREAM !== "undefined" && WORKER_STREAM
      ? String(WORKER_STREAM).replace(/\/$/, "")
      : "https://moviezone.tvjz.workers.dev";
  const res = await fetch(base + "/4/home", {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error("AnimeAV1 home HTTP " + res.status);
  return await res.json();
}

async function renderAnimeAv1HomeGrid() {
  const skeleton = document.getElementById("results-skeleton");
  if (skeleton) skeleton.classList.remove("hidden");
  resultsLoading.classList.add("hidden");
  resultsEmpty.classList.add("hidden");
  resultsGrid.innerHTML = "";
  resultsGrid.classList.add("mz-av1-home-wrap");
  resultsGrid.classList.remove("catalog-grid");

  try {
    const data = await fetchAnimeAv1Home();
    const recientes = (data.recientes || [])
      .map(function (x) { return normalizarItemHomeAv1(x, "recientes"); })
      .filter(Boolean);
    const agregados = (data.agregados || [])
      .map(function (x) { return normalizarItemHomeAv1(x, "agregados"); })
      .filter(Boolean);

    function makeSection(title, items, hint, opts) {
      opts = opts || {};
      const horizontal = !!opts.horizontal;
      const sec = document.createElement("section");
      sec.className = "mz-av1-home-section" + (horizontal ? " is-eps" : "");
      const head = document.createElement("div");
      head.className = "mz-av1-home-head";
      head.innerHTML =
        "<h3 class=\"mz-av1-home-title\">" +
        escapeHtml(title) +
        "</h3>" +
        (hint
          ? '<span class="mz-av1-home-hint">' + escapeHtml(hint) + "</span>"
          : "") +
        '<span class="mz-av1-home-count">' +
        items.length +
        "</span>";
      sec.appendChild(head);

      if (horizontal) {
        // Fila horizontal tipo episodios (back_img landscape)
        const row = document.createElement("div");
        row.className = "mz-av1-eps-row";
        if (!items.length) {
          row.innerHTML = '<p class="mz-av1-home-empty">Sin episodios nuevos</p>';
        } else {
          items.forEach(function (item) {
            const card = document.createElement("div");
            card.className = "mz-av1-ep-card";
            const img =
              item.back_img ||
              item.portada ||
              (typeof PLACEHOLDER !== "undefined" ? PLACEHOLDER : "");
            const epLab =
              item._homeEpLabel ||
              (item.episodio != null ? "Episodio " + item.episodio : "Nuevo");
            const fechaLab = item.fecha_relativa || item.fecha || item.published_label || null;
            const subLab = fechaLab ? epLab + " · " + fechaLab : epLab;
            const enEm =
              item.en_emision === true ||
              /emisi|airing|ongoing/i.test(String(item.estado || ""));
            const fin =
              item.finalizado === true ||
              /final|conclu|ended|finished/i.test(String(item.estado || ""));
            let badge = "";
            if (enEm) badge = '<span class="mz-av1-ep-badge is-air">En emisión</span>';
            else if (fin) badge = '<span class="mz-av1-ep-badge is-end">Finalizado</span>';
            const fechaBadge = fechaLab
              ? '<span class="mz-av1-ep-fecha">' + escapeHtml(fechaLab) + "</span>"
              : "";
            card.innerHTML =
              '<div class="mz-av1-ep-thumb">' +
              '<img src="' +
              escapeHtml(img) +
              '" alt="" loading="lazy" />' +
              '<span class="mz-av1-ep-nuevo">Nuevo</span>' +
              fechaBadge +
              badge +
              '</div>' +
              '<div class="mz-av1-ep-info">' +
              "<h4>" +
              escapeHtml(item.nombre || item.titulo || "") +
              "</h4>" +
              "<p>" +
              escapeHtml(subLab) +
              "</p>" +
              "</div>";
            const im = card.querySelector("img");
            if (im) {
              im.addEventListener("error", function (e) {
                if (e.target.dataset.failed === "1") return;
                e.target.dataset.failed = "1";
                if (item.portada && e.target.src !== item.portada) {
                  e.target.src = item.portada;
                } else if (typeof PLACEHOLDER !== "undefined") {
                  e.target.src = PLACEHOLDER;
                }
              });
            }
            card.addEventListener("click", function () {
              abrirDetalle(item);
            });
            row.appendChild(card);
          });
        }
        sec.appendChild(row);
        return sec;
      }

      const grid = document.createElement("div");
      grid.className = "catalog-grid mz-av1-home-grid";
      if (!items.length) {
        grid.innerHTML =
          '<p class="mz-av1-home-empty">Sin títulos por ahora</p>';
      } else {
        items.forEach(function (item) {
          const card = crearMediaCard(item);
          if (item._homeEpLabel) {
            const p = card.querySelector(".media-info p");
            if (p) p.textContent = item._homeEpLabel;
          }
          grid.appendChild(card);
        });
      }
      sec.appendChild(grid);
      return sec;
    }

    // Continuar viendo ARRIBA de Nuevos
    try {
      const cw = buildContinuarViendoNode("anime");
      if (cw) resultsGrid.appendChild(cw);
    } catch (_) {}

    resultsGrid.appendChild(
      makeSection("Nuevos", recientes, "Episodios recién publicados", {
        horizontal: true
      })
    );
    resultsGrid.appendChild(
      makeSection("Recién agregados", agregados, "Nuevos en el catálogo")
    );

    const total = recientes.length + agregados.length;
    gridTotalItems = total;
    gridTotalPages = 1;
    gridPage = 1;
    gridSinMasResultados = true;
    if (resultsTitle) resultsTitle.textContent = "Anime";
    try { renderContinuarViendoEnGrid(); } catch (_) {}
    if (resultsCount) resultsCount.textContent = total + " títulos";
    if (typeof actualizarPaginacion === "function") actualizarPaginacion();
    scrollSentinel.classList.add("hidden");
    if (!total) resultsEmpty.classList.remove("hidden");
    // Prefetch catálogo keys en segundo plano (páginas siguientes instantáneas)
    try { fetchCatalogKeys("4").catch(function () {}); } catch (_) {}
  } catch (err) {
    console.error("AnimeAV1 /4/home:", err);
    resultsEmpty.classList.remove("hidden");
    if (resultsCount) resultsCount.textContent = "0 items";
  } finally {
    if (skeleton) skeleton.classList.add("hidden");
    resultsLoading.classList.add("hidden");
  }
}


/** Quita iconos HTML (ti-clock-hour-5) de etiquetas Hoy/Ayer */
function limpiarFechaJkLabel(raw) {
  if (raw == null || raw === "") return null;
  var s = String(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\bti\b/gi, " ")
    .replace(/clock-hour-\d+/gi, " ")
    .replace(/[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

/** JKanime /5/home — recientes (Programación Animes) + agregados (Animes recientes) */
function normalizarItemHomeJk(it, bloque) {
  if (!it) return null;
  const slug = String(it.slug || "").replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  const ep = it.episodio != null ? it.episodio : (it.number != null ? it.number : null);
  const tituloBase =
    it.titulo_anime ||
    (it.titulo && String(it.titulo).replace(/\s*[—\-–]\s*Episodio\s*\d+\s*$/i, "").trim()) ||
    it.title ||
    slug;
  const nombre = String(tituloBase).trim() || slug;
  const tipoRaw = it.tipo || it.type || it.formato || "Anime";
  const link =
    it.url ||
    it.link ||
    ("https://moviezone.tvjz.workers.dev/5/anime/" + encodeURIComponent(slug));
  const esRecientes = bloque === "recientes";
  const portada = esRecientes
    ? (it.back_img || it.still || it.portada || null)
    : (it.portada || it.back_img || it.still || null);

  let enEmision = null;
  let finalizado = null;
  let estado = it.estado || it.status || null;
  if (typeof it.en_emision === "boolean") enEmision = it.en_emision;
  if (typeof it.finalizado === "boolean") finalizado = it.finalizado;
  if (estado) {
    const st = String(estado).toLowerCase();
    if (enEmision == null && /emisi|airing|ongoing|en curso/i.test(st)) enEmision = true;
    if (finalizado == null && /final|conclu|ended|finished|complete/i.test(st)) finalizado = true;
  }
  if (esRecientes && enEmision == null && finalizado == null) enEmision = true;

  return {
    nombre: nombre,
    titulo: nombre,
    slug: slug,
    portada: portada,
    back_img: it.back_img || it.still || null,
    tipo: tipoRaw,
    type: tipoRaw,
    formato: it.formato || null,
    source_id: "5",
    fuente: "jkanime",
    source: "jkanime",
    link: link,
    url_extract: link,
    episodio: ep != null ? Number(ep) : null,
    descripcion: it.descripcion || null,
    estado: estado,
    en_emision: enEmision,
    finalizado: finalizado === true ? true : (enEmision === true ? false : finalizado),
    _homeJk: bloque || "recientes",
    _homeEpLabel: ep != null ? ("Episodio " + ep) : null,
    fecha: limpiarFechaJkLabel(it.fecha || it.fecha_relativa || it.published_label || null),
    fecha_relativa: limpiarFechaJkLabel(it.fecha_relativa || it.fecha || it.published_label || null)
  };
}

async function fetchJkHome() {
  const base =
    typeof WORKER_STREAM !== "undefined" && WORKER_STREAM
      ? String(WORKER_STREAM).replace(/\/$/, "")
      : "https://moviezone.tvjz.workers.dev";
  const res = await fetch(base + "/5/home", {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error("JKanime home HTTP " + res.status);
  return await res.json();
}

async function renderJkHomeGrid() {
  const skeleton = document.getElementById("results-skeleton");
  if (skeleton) skeleton.classList.remove("hidden");
  resultsLoading.classList.add("hidden");
  resultsEmpty.classList.add("hidden");
  resultsGrid.innerHTML = "";
  resultsGrid.classList.add("mz-av1-home-wrap");
  resultsGrid.classList.remove("catalog-grid");

  try {
    const data = await fetchJkHome();
    const recientes = (data.recientes || [])
      .map(function (x) { return normalizarItemHomeJk(x, "recientes"); })
      .filter(Boolean);
    const agregados = (data.agregados || [])
      .map(function (x) { return normalizarItemHomeJk(x, "agregados"); })
      .filter(Boolean);

    function makeSection(title, items, hint, opts) {
      opts = opts || {};
      const horizontal = !!opts.horizontal;
      const sec = document.createElement("section");
      sec.className = "mz-av1-home-section" + (horizontal ? " is-eps" : "");
      const head = document.createElement("div");
      head.className = "mz-av1-home-head";
      head.innerHTML =
        "<h3 class=\"mz-av1-home-title\">" +
        escapeHtml(title) +
        "</h3>" +
        (hint
          ? '<span class="mz-av1-home-hint">' + escapeHtml(hint) + "</span>"
          : "") +
        '<span class="mz-av1-home-count">' +
        items.length +
        "</span>";
      sec.appendChild(head);

      if (horizontal) {
        const row = document.createElement("div");
        row.className = "mz-av1-eps-row";
        if (!items.length) {
          row.innerHTML = '<p class="mz-av1-home-empty">Sin episodios nuevos</p>';
        } else {
          items.forEach(function (item) {
            const card = document.createElement("div");
            card.className = "mz-av1-ep-card";
            const img =
              item.back_img ||
              item.portada ||
              (typeof PLACEHOLDER !== "undefined" ? PLACEHOLDER : "");
            const epLab =
              item._homeEpLabel ||
              (item.episodio != null ? "Episodio " + item.episodio : "Nuevo");
            const fechaLab = item.fecha_relativa || item.fecha || item.published_label || null;
            const subLab = fechaLab ? epLab + " · " + fechaLab : epLab;
            const enEm =
              item.en_emision === true ||
              /emisi|airing|ongoing/i.test(String(item.estado || ""));
            const fin =
              item.finalizado === true ||
              /final|conclu|ended|finished/i.test(String(item.estado || ""));
            let badge = "";
            if (enEm) badge = '<span class="mz-av1-ep-badge is-air">En emisión</span>';
            else if (fin) badge = '<span class="mz-av1-ep-badge is-end">Finalizado</span>';
            const fechaBadge = fechaLab
              ? '<span class="mz-av1-ep-fecha">' + escapeHtml(fechaLab) + "</span>"
              : "";
            card.innerHTML =
              '<div class="mz-av1-ep-thumb">' +
              '<img src="' +
              escapeHtml(img) +
              '" alt="" loading="lazy" />' +
              '<span class="mz-av1-ep-nuevo">Nuevo</span>' +
              fechaBadge +
              badge +
              '</div>' +
              '<div class="mz-av1-ep-info">' +
              "<h4>" +
              escapeHtml(item.nombre || item.titulo || "") +
              "</h4>" +
              "<p>" +
              escapeHtml(subLab) +
              "</p>" +
              "</div>";
            const im = card.querySelector("img");
            if (im) {
              im.addEventListener("error", function (e) {
                if (e.target.dataset.failed === "1") return;
                e.target.dataset.failed = "1";
                if (item.portada && e.target.src !== item.portada) {
                  e.target.src = item.portada;
                } else if (typeof PLACEHOLDER !== "undefined") {
                  e.target.src = PLACEHOLDER;
                }
              });
            }
            card.addEventListener("click", function () {
              abrirDetalle(item);
            });
            row.appendChild(card);
          });
        }
        sec.appendChild(row);
        return sec;
      }

      const grid = document.createElement("div");
      grid.className = "catalog-grid mz-av1-home-grid";
      if (!items.length) {
        grid.innerHTML =
          '<p class="mz-av1-home-empty">Sin títulos por ahora</p>';
      } else {
        items.forEach(function (item) {
          const card = crearMediaCard(item);
          grid.appendChild(card);
        });
      }
      sec.appendChild(grid);
      return sec;
    }

    try {
      const cw = buildContinuarViendoNode("jk");
      if (cw) resultsGrid.appendChild(cw);
    } catch (_) {}

    resultsGrid.appendChild(
      makeSection("Nuevos", recientes, "Programación · Animes (JK)", {
        horizontal: true
      })
    );
    resultsGrid.appendChild(
      makeSection("Recién agregados", agregados, "Animes recientes en JK")
    );

    const total = recientes.length + agregados.length;
    gridTotalItems = total;
    gridTotalPages = 1;
    gridPage = 1;
    gridSinMasResultados = true;
    if (resultsTitle) resultsTitle.textContent = "JK";
    try { renderContinuarViendoEnGrid(); } catch (_) {}
    if (resultsCount) resultsCount.textContent = total + " títulos";
    if (typeof actualizarPaginacion === "function") actualizarPaginacion();
    scrollSentinel.classList.add("hidden");
    if (!total) resultsEmpty.classList.remove("hidden");
  } catch (err) {
    console.error("JKanime /5/home:", err);
    resultsEmpty.classList.remove("hidden");
    if (resultsCount) resultsCount.textContent = "0 items";
  } finally {
    if (skeleton) skeleton.classList.add("hidden");
    resultsLoading.classList.add("hidden");
  }
}

async function fetchSeccion(seccion, page, limit = LIMIT) {
    // Anime = solo AnimeAV1. JK = sección propia (source 5).
    let opts = {};
    if (seccion === "anime") opts = { animeSource: "av1" };
    else if (seccion === "jk") opts = { animeSource: "jk" };
    const data = await getCatalog(seccion === "jk" ? "anime" : seccion, page, limit, opts);
    const lista = data.resultados || [];

    // Películas: TODAS las páginas del worker (761), nunca un subconjunto (~18)
    if (seccion === "movie" || seccion === "peliculas" || seccion === "pelicula") {
        gridTotalPages = Math.max(761, data.totalPages || data.pages || 761);
        gridTotalItems = gridTotalPages * limit;
    } else {
        gridTotalItems = data.total || 0;
        gridTotalPages = Math.max(1, Math.ceil(gridTotalItems / limit));
    }

    return lista;
}

// Estado extra: por defecto ONLINE (la API tiene muchos más resultados que Supabase local)
let busquedaEsLocal = false;

async function fetchBusqueda(termino, source = "online", page = 1, limit = LIMIT) {
    // Nunca forzar local: el buscador usa la API Worker
    const src = source === "local" ? "local" : "online";
    // Solo JK es búsqueda restringida. El resto (inicio, pelis, series, anime AV1) = global/universal.
    let animeOpts = {};
    const soloJk =
      animeFuente === "jk" ||
      gridSeccion === "jk" ||
      (gridTypeFilter === "anime" && animeFuente === "jk");
    if (soloJk) {
      animeOpts = { animeSource: "jk" };
    }
    // AV1 u otras secciones: sin animeOpts → /api/buscar universal
    let data = { resultados: [] };
    try {
        data = await searchCatalog(termino, src, page, limit, animeOpts);
    } catch (e) {
        try {
          const q = new URLSearchParams({ q: termino, source: src, page: String(page), limit: String(limit) });
          if (animeOpts.animeSource === "jk") {
            q.set("anime_source", "jk");
            q.set("source_id", "5");
          } else if (animeOpts.animeSource === "av1") {
            q.set("anime_source", "av1");
            q.set("source_id", "4");
          }
          const res = await fetch("/api/buscar?" + q.toString(), { cache: "no-store" });
          data = await res.json();
        } catch (e2) {
          console.error("fetchBusqueda:", e2);
          data = { resultados: [], total: 0 };
        }
    }
    if (data && data.error && !data.resultados && !data.results) {
      console.warn("buscar API:", data.error);
    }
    const lista = (data && (data.resultados || data.results)) || [];
    return {
        resultados: Array.isArray(lista) ? lista : [],
        total: (data && (data.total ?? data.count)) ?? (Array.isArray(lista) ? lista.length : 0),
        page: (data && data.page) ?? page,
        limit: (data && data.limit) ?? limit,
        source: (data && data.source) || src
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


// ============================================================
// Catálogo rápido (estilo Koiflix): keys + batch
// ============================================================
window.__mzCatalogKeys = window.__mzCatalogKeys || {};
window.__mzCatalogItems = window.__mzCatalogItems || {};

async function fetchCatalogKeys(sourceId, typeSec) {
  const sid = String(sourceId || "4");
  const tipo = typeSec ? String(typeSec) : "";
  const cacheKey = sid + (tipo ? ":" + tipo : "");
  const cached = window.__mzCatalogKeys[cacheKey];
  if (cached && cached.keys && cached.keys.length && Date.now() - (cached.ts || 0) < 15 * 60 * 1000) {
    return cached;
  }
  let url = "/api/catalog/keys?source=" + encodeURIComponent(sid);
  if (tipo) url += "&type=" + encodeURIComponent(tipo);
  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json();
  const out = {
    keys: Array.isArray(data.keys) ? data.keys : [],
    sample: Array.isArray(data.sample) ? data.sample : [],
    total: data.total || 0,
    ts: Date.now(),
    type: tipo || null,
  };
  window.__mzCatalogKeys[cacheKey] = out;
  (out.sample || []).forEach(function (it) {
    if (it && it.slug) window.__mzCatalogItems[sid + ":" + it.slug] = it;
  });
  return out;
}

async function fetchCatalogBatch(sourceId, slugs, typeSec) {
  const sid = String(sourceId || "4");
  const tipo = typeSec ? String(typeSec) : "";
  const need = [];
  const have = [];
  (slugs || []).forEach(function (s) {
    const k = sid + ":" + s;
    if (window.__mzCatalogItems[k]) have.push(window.__mzCatalogItems[k]);
    else need.push(s);
  });
  if (need.length) {
    let url =
      "/api/catalog/batch?source=" +
      encodeURIComponent(sid) +
      "&ids=" +
      encodeURIComponent(need.join(","));
    if (tipo) url += "&type=" + encodeURIComponent(tipo);
    const r = await fetch(url, { cache: "no-store" });
    const data = await r.json();
    const arr = data.resultados || data.results || data.items || [];
    arr.forEach(function (it) {
      if (!it) return;
      const slug = it.slug || "";
      if (slug) window.__mzCatalogItems[sid + ":" + slug] = it;
      have.push(it);
    });
  }
  // orden según slugs pedidos
  const map = Object.create(null);
  have.forEach(function (it) {
    if (it && it.slug) map[it.slug] = it;
  });
  return (slugs || []).map(function (s) { return map[s]; }).filter(Boolean);
}

/** Carga página de catálogo vía keys+batch (rápido): anime/jk/pelis bz/series bz */
async function fetchSeccionCatalogRapido(seccion, page, limit) {
  let sid = "4";
  let tipo = null;
  const sec = String(seccion || "").toLowerCase();
  if (sec === "jk" || animeFuente === "jk") {
    sid = "5";
  } else if (sec === "movie" || sec === "peliculas" || sec === "pelicula") {
    sid = "9"; // PelisPlus .bz
    tipo = "peliculas";
  } else if (sec === "series" || sec === "serie") {
    sid = "9";
    tipo = "series";
  } else {
    sid = "4"; // anime AV1
  }
  const lim = limit || LIMIT || 48;
  const idx = await fetchCatalogKeys(sid, tipo);
  const keys = idx.keys || [];
  if (!keys.length) {
    throw new Error("catalog keys vacío source=" + sid);
  }
  const start = (Math.max(1, page) - 1) * lim;
  const slice = keys.slice(start, start + lim);
  const items = await fetchCatalogBatch(sid, slice, tipo);
  // mapear a shape grid si hace falta
  const lista = items.map(function (it) {
    if (it.nombre || it.titulo) {
      return {
        id: it.id || sid + "-" + it.slug,
        nombre: it.nombre || it.titulo || it.title,
        titulo: it.titulo || it.nombre || it.title,
        slug: it.slug,
        tipo: it.tipo || "Anime",
        portada: it.portada,
        logo: it.logo,
        backdrop: it.backdrop,
        year: it.year,
        source_id: String(it.source_id || sid),
        fuente: it.fuente || it.source || (sid === "5" ? "jkanime" : "animeav1"),
        link: it.link || it.url_extract || it.url,
        url_extract: it.url_extract || it.link,
        estado: it.estado,
        en_emision: it.en_emision,
        tiene_player: true,
      };
    }
    return it;
  });
  gridTotalItems = keys.length;
  gridTotalPages = Math.max(1, Math.ceil(keys.length / lim) || 1);
  return lista;
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
            lista = (data && data.resultados) ? data.resultados : [];
            gridTotalItems = (data && data.total) || lista.length;
            gridTotalPages = Math.max(1, Math.ceil(gridTotalItems / LIMIT));
            // Botón online ya no hace falta (búsqueda es online por defecto)
            actualizarBotonOnline(false);
        } else if (
          gridSeccion === "anime" &&
          (animeFuente === "av1" || !animeFuente) &&
          gridPage === 1
        ) {
            actualizarBotonOnline(false);
            // Anime AV1: /4/home → Recientes + Recién agregados (diario)
            await renderAnimeAv1HomeGrid();
            return;
        } else if (
          gridSeccion === "jk" &&
          gridPage === 1 &&
          gridModo === "categoria"
        ) {
            actualizarBotonOnline(false);
            // JK: /5/home → solo cuando la sección activa ES jk
            await renderJkHomeGrid();
            return;
        } else {
            actualizarBotonOnline(false);
            // Anime / JK: catálogo rápido keys+batch (estilo Koiflix)
            // Películas / series: flujo original (estrenos + muchas páginas). NO catalog-rapido.
            // Anime / JK: keys+batch; si sale vacío → fallback.
            if (
              gridSeccion === "anime" ||
              gridSeccion === "jk"
            ) {
              try {
                lista = await fetchSeccionCatalogRapido(gridSeccion, gridPage, LIMIT);
                if (!lista || !lista.length) {
                  lista = await fetchSeccion(gridSeccion, gridPage, LIMIT);
                }
              } catch (eCat) {
                console.warn("catalog rapido falló, fallback:", eCat);
                lista = await fetchSeccion(gridSeccion, gridPage, LIMIT);
              }
            } else {
              lista = await fetchSeccion(gridSeccion, gridPage, LIMIT);
            }
        }

        // Restaurar grid plano si venimos del home AV1
        try {
          resultsGrid.classList.add("catalog-grid");
          resultsGrid.classList.remove("mz-av1-home-wrap");
        } catch (_) {}

        // Aplica filtros de tipo + orden (Más reciente / Calificación / A-Z)
        const listaFinal = aplicarFiltrosYOrden(lista);

        renderGridItems(listaFinal, true);
        try { renderContinuarViendoEnGrid(); } catch (_) {}
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

/** Si la portada de una tarjeta falla, pedir el detalle (que sí la resuelve bien) y usarla */
let __reparacionesPortadaActivas = 0;
const MAX_REPARACIONES_PORTADA_PARALELAS = 10;
async function repararPortadaDesdeDetalle(item, imgEl) {
    if (__reparacionesPortadaActivas >= MAX_REPARACIONES_PORTADA_PARALELAS) return;
    __reparacionesPortadaActivas++;
    try {
        const params = new URLSearchParams();
        if (item.slug) params.set("slug", item.slug);
        if (item.source_id) params.set("source_id", item.source_id);
        if (item.tipo) params.set("tipo", item.tipo);
        if (item.link) params.set("link", item.link);
        if (![...params.keys()].length) return;

        const res = await fetch(`/api/detalle?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const completo = await res.json();
        if (completo && completo.portada && !String(completo.portada).includes("placeholder")) {
            imgEl.src = completo.portada;
            imgEl.dataset.failed = "0";
        }
    } catch (err) {
        // Silencioso: se queda con el placeholder genérico si tampoco hay portada en detalle
    } finally {
        __reparacionesPortadaActivas--;
    }
}

function crearMediaCard(item) {
    const card = document.createElement("div");
    card.className = "media-card";

    const portada = item.portada || PLACEHOLDER;
    const nombre = item.nombre || item.titulo || "Sin título";
    const tipo = typeof tipoBadgeLabel === "function" ? tipoBadgeLabel(item) : tipoLabel(item.tipo);
    // Siempre mostrar calificación (0 si no tiene)
    const rating = ratingInfo(item).label;
    const tieneVideo = item.tiene_player === true || itemTieneVideo(item);

    const generoCorto = item.genero
        ? String(item.genero).split(",")[0].trim()
        : "";
    const sublinea = item.episodios && item.episodios.length
        ? `${item.episodios.length} episodios`
        : [item.year, generoCorto || tipo].filter(Boolean).join(" · ");

    const esSerie = /serie|anime/i.test(String(item.tipo || ""));
    const enEmision = esSerie && (
      item.en_emision === true ||
      /emisi|airing|ongoing|en curso/i.test(String(item.estado || ""))
    );

    card.innerHTML = `
        <div class="poster-wrapper">
            <img class="poster-img" src="${escapeHtml(portada)}" alt="${escapeHtml(nombre)}" loading="lazy">
            <div class="poster-overlay"><ion-icon name="play-circle" class="overlay-icon"></ion-icon></div>
            ${ratingBadgeHtml(item)}
            <span class="type-badge">${escapeHtml(tipo)}</span>
            <div class="poster-bottom-row">
              ${enEmision
                ? `<span class="airing-badge">En emisión</span>`
                : (item.finalizado === true || /final|ended|complet|conclu/i.test(String(item.estado || ""))
                    ? `<span class="availability-badge unavailable"><span class="dot"></span> Finalizado</span>`
                    : "")}
            </div>
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
        // La portada de listado a veces falla aunque la de detalle sí funciona:
        // intentar reparar trayendo la portada real desde /api/detalle.
        repararPortadaDesdeDetalle(item, e.target);
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
    const seen = new Set();
    (lista || []).forEach(function (item) {
        if (!item) return;
        const k = (item.link || "") + "|" + (item.slug || "") + "|" + (item.year || "") + "|" + (item.nombre || item.titulo || "");
        if (seen.has(k)) return;
        seen.add(k);
        resultsGrid.appendChild(crearMediaCard(item));
    });
}

function ensurePelisPaginationUI() {
  const row = document.getElementById("carousel-movies")?.closest(".carousel-row");
  if (!row) return;
  let bar = document.getElementById("pelis-pagination");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "pelis-pagination";
    bar.className = "pelis-pagination";
    bar.innerHTML =
      '<button type="button" id="pelis-prev" class="pelis-page-btn">Anterior</button>' +
      '<span id="pelis-page-info" class="pelis-page-info"></span>' +
      '<button type="button" id="pelis-next" class="pelis-page-btn">Siguiente</button>';
    row.appendChild(bar);
    document.getElementById("pelis-prev")?.addEventListener("click", () => cargarPaginaPeliculas(-1));
    document.getElementById("pelis-next")?.addEventListener("click", () => cargarPaginaPeliculas(1));
  }
  actualizarPelisPaginationUI();
}

function actualizarPelisPaginationUI() {
  const info = document.getElementById("pelis-page-info");
  const prev = document.getElementById("pelis-prev");
  const next = document.getElementById("pelis-next");
  const page = window.__mzPelisPage || 1;
  const pages = window.__mzPelisPages || 761;
  // UI: 1 = estrenos; 2..761 = catálogo worker page 2..761
  if (info) info.textContent = page === 1 ? "Estrenos" : `Página ${page} / ${pages}`;
  if (prev) prev.disabled = page <= 1 || !!window.__mzPelisLoading;
  if (next) next.disabled = page >= pages || !!window.__mzPelisLoading;
}

async function cargarPaginaPeliculas(delta) {
  if (window.__mzPelisLoading) return;
  const page = (window.__mzPelisPage || 1) + delta;
  const pages = window.__mzPelisPages || 761;
  if (page < 1 || page > pages) return;

  window.__mzPelisLoading = true;
  actualizarPelisPaginationUI();

  try {
    if (page === 1) {
      // Estrenos
      const res = await fetch("/api/estrenos?tipo=peliculas&limit=24", { cache: "no-store" });
      const data = await res.json();
      window.__mzPelisItems = data.resultados || [];
    } else {
      // Catálogo worker: page 2..761
      const res = await fetch("/api/peliculas?page=" + page + "&limit=24", { cache: "no-store" });
      const data = await res.json();
      window.__mzPelisItems = data.resultados || [];
      if (data.pages) window.__mzPelisPages = data.pages;
    }
    window.__mzPelisPage = page;
    renderCarousel("carousel-movies", window.__mzPelisItems);
  } catch (e) {
    console.warn("paginacion peliculas", e);
  } finally {
    window.__mzPelisLoading = false;
    actualizarPelisPaginationUI();
  }
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
        // Textos más cortos en el carrusel de inicio (tarjetas estrechas)
        const badge = card.querySelector(".availability-badge");
        if (badge) {
            const ok = badge.classList.contains("available");
            badge.innerHTML = ok
                ? '<span class="dot"></span> Disponible'
                : '<span class="dot"></span> Sin servers';
        }
        el.appendChild(card);
    });
}

// ======================================================
// HERO BANNER
// ======================================================
function pintarHero(item) {
    if (!item) return;

    // Solo tipo, sin "RECOMENDADA"
    heroType.textContent = (typeof tipoBadgeLabel === "function" ? tipoBadgeLabel(item) : tipoLabel(item.tipo)).toUpperCase();

    heroTitle.textContent = item.nombre || item.titulo || "Sin título";

    const heroR = ratingInfo(item);
    heroRating.textContent = heroR.label;
    heroRating.title = heroR.secondary ? heroR.label + " · " + heroR.secondary : heroR.label;
    if (heroRating.parentElement) {
        heroRating.parentElement.classList.remove("rating-src-imdb", "rating-src-tmdb", "rating-src-omdb", "rating-src-fuente");
        if (heroR.source) heroRating.parentElement.classList.add("rating-src-" + heroR.source);
    }

    heroYear.textContent = item.year || "-";

    // Estado en series / anime
    const statusEl = document.getElementById("hero-status");
    if (statusEl) {
        const t = String(item.tipo || "").toLowerCase();
        const esSerie = /serie|anime/.test(t);
        let label = "";
        if (esSerie) {
            if (item.en_emision === true || /emisi|airing|ongoing|en curso/i.test(String(item.estado || ""))) {
                label = "En emisión";
            } else if (item.finalizado === true || /final|conclu|ended|finished/i.test(String(item.estado || ""))) {
                label = "Finalizado";
            } else if (item.estado) {
                label = String(item.estado);
            }
        }
        if (label) {
            statusEl.textContent = label;
            statusEl.classList.remove("hidden", "is-air", "is-end");
            if (/emisi/i.test(label)) statusEl.classList.add("is-air");
            else if (/final/i.test(label)) statusEl.classList.add("is-end");
            statusEl.classList.remove("hidden");
        } else {
            statusEl.textContent = "";
            statusEl.classList.add("hidden");
        }
    }

    heroSynopsis.textContent = item.descripcion || "";
    if (item.backdrop || item.portada) {
        document.getElementById("hero-banner").style.backgroundImage =
            `url('${item.backdrop || item.portada}')`;
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
    // Deep link /detalle: no interrumpir con la vista inicio
    if (window.__mzSkipHomeBoot) {
      console.log("cargarHome omitido (deep link activo)");
      return;
    }
    if (typeof setBootLoading === "function") setBootLoading(true);
    console.log('🟢 Iniciando cargarHome()');
    const withTimeout = (p, ms) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout " + ms + "ms")), ms))
    ]);
    try {
        console.log('🟡 Cargando estrenos (películas, series y anime)...');

        const results = await Promise.allSettled([
            withTimeout(
              fetch('/api/estrenos?tipo=peliculas&limit=24', { cache: 'no-store' }).then(r => r.json()),
              20000
            ),
            withTimeout(fetchSeccion("series", 1, 12), 20000),
            withTimeout(fetchSeccion("anime", 1, 12), 20000)
        ]);

        const estrenosData = results[0].status === "fulfilled" ? results[0].value : { resultados: [] };
        const peliculas = estrenosData.resultados || [];
        const series    = results[1].status === "fulfilled" ? results[1].value : [];
        // Inicio: anime solo AV1 (4) — sin JKanime (5) en carousels / moods
        let anime = results[2].status === "fulfilled" ? results[2].value : [];
        anime = typeof sinItemsJk === "function" ? sinItemsJk(anime) : anime;

        console.log('✅ Datos:', {
            peliculas: peliculas.length,
            series: series.length,
            anime: anime.length
        });

        try { renderCarousel("carousel-movies", peliculas.slice(0, 12)); } catch (e) { console.warn(e); }
        try { renderCarousel("carousel-series", series); } catch (e) { console.warn(e); }
        try { renderCarousel("carousel-anime", anime); } catch (e) { console.warn(e); }
        try { cargarContinuarViendo(); } catch (_) {}
        try { cargarRecienAnadidos(); } catch (_) {}
        try { cargarMiLista(); } catch (_) {}
        try { cargarPorqueViste(); } catch (_) {}
        try {
          cargarMoodsHome(
            typeof peliculas !== "undefined" ? peliculas : [],
            typeof series !== "undefined" ? series : [],
            typeof anime !== "undefined" ? anime : []
          );
        } catch (_) {}

        try { iniciarHero(peliculas.length ? peliculas : series); } catch (_) {}

        try {
          if (statusBadge) {
            statusBadge.classList.remove("offline");
            statusBadge.classList.add("online");
            const st = statusBadge.querySelector(".status-text");
            if (st) st.textContent = "Online";
          }
        } catch (_) {}
        console.log('✅ Home cargado (estrenos)');
    } catch (err) {
        console.error('❌ Error en cargarHome:', err);
        try {
          if (statusBadge) {
            statusBadge.classList.remove("online");
            statusBadge.classList.add("offline");
            const st = statusBadge.querySelector(".status-text");
            if (st) st.textContent = "Offline";
          }
        } catch (_) {}
    } finally {
        // Nunca dejar el overlay de "Cargando..." colgado
        if (typeof setBootLoading === "function") setBootLoading(false);
        try {
          document.body.classList.remove("mz-booting");
          const boot = document.getElementById("mz-boot-loading");
          if (boot) boot.classList.add("hidden");
        } catch (_) {}
    }
}



async function abrirDesdeProgreso(mini) {
    if (!mini) return;
    const sea = mini.temporada != null ? mini.temporada : mini.season;
    const ep = mini.episodio != null ? mini.episodio : mini.episode;
    const base = {
        ...mini,
        tiene_player: true,
        embeds: mini.embeds || [],
        episodios: mini.episodios || []
    };

    // 1) Abrir detalle
    await abrirDetalle(base, false, false);

    // 2) Completar desde API
    let completo = null;
    try {
        const params = new URLSearchParams();
        if (mini.postId) params.set("postId", mini.postId);
        if (mini.link) params.set("link", mini.link);
        if (mini.slug) params.set("slug", mini.slug);
        if (mini.source_id) params.set("source_id", mini.source_id);
        if (mini.tipo) params.set("tipo", mini.tipo);
        if (mini.id && !mini.postId) params.set("postId", mini.id);
        const portadaMini = window.__mzPortadaLista || mini.portada || mini.portada_fuente_raw || null;
        if (portadaMini) params.set("portada", portadaMini);

        if ([...params.keys()].length) {
          const res = await fetch(`/api/detalle?${params.toString()}`, { cache: "no-store" });
          if (res.ok) {
            completo = await res.json();
            if (completo && (completo.nombre || completo.link)) {
              if (portadaMini) {
                completo.portada = portadaMini;
                completo.portada_fuente_raw = portadaMini;
              }
              await abrirDetalle({ ...completo, tiene_player: true }, false, false);
            }
          }
        }
    } catch (err) {
        console.warn("No se pudo completar desde progreso:", err);
    }

    // 3) Ir al episodio pendiente
    if (ep != null && !isNaN(Number(ep))) {
      const item = completo || seleccionActual || base;
      const sn = sea != null && !isNaN(Number(sea)) ? Number(sea) : 1;
      const en = Number(ep);
      try {
        const epObj = {
          episodio: en,
          episode: en,
          number: en,
          temporada: sn,
          season: sn,
          back_img: mini.back_img || mini.still || null
        };
        if (typeof window.mzKoiOpenEpisode === "function") {
          await window.mzKoiOpenEpisode(item, epObj, sn, en);
        } else if (typeof abrirVistaMovilEpisodio === "function") {
          await abrirVistaMovilEpisodio(item, epObj, sn, en);
        } else if (typeof reproducirCapituloAuto === "function") {
          await reproducirCapituloAuto(item, epObj, sn, en);
        }
      } catch (eEp) {
        console.warn("Continuar viendo: no se abrió el episodio", eEp);
      }
    }
}

// ======================================================
// DETALLE (modal inmersivo)
// ======================================================
const videoContainer = document.getElementById("video-player-container");
const playerIframe = document.getElementById("player-iframe");
const playerTitle = document.getElementById("player-title");


/** Fija título principal (ES/local) y original aparte; no invierte al actualizar */
function fijarTitulosItem(item, preferido) {
    if (!item) return item;
    const slug = item.slug || "";
    const esSlug = (t) => t && slug && String(t).toLowerCase().replace(/\s+/g, "-") === String(slug).toLowerCase();
    const pareceEn = (t) => {
        const s = String(t || "");
        if (/[áéíóúñü¿¡]/i.test(s)) return false;
        const en = (s.match(/\b(the|and|of|love|our|my|with|from|for)\b/gi) || []).length;
        return en >= 1;
    };
    let principal = preferido || item.nombre || item.titulo || null;
    if (esSlug(principal) || !principal) principal = item.titulo || item.nombre;
    // Si el principal es inglés y hay otro nombre local, preferir el local
    if (pareceEn(principal)) {
        const alt = [preferido, item.nombre, item.titulo].find((t) => t && !esSlug(t) && !pareceEn(t));
        if (alt) {
            if (!item.titulo_original || item.titulo_original === alt) item.titulo_original = principal;
            principal = alt;
        }
    }
    // No usar titulo_original como principal
    if (item.titulo_original && principal &&
        String(principal).toLowerCase() === String(item.titulo_original).toLowerCase() &&
        preferido && !pareceEn(preferido)) {
        principal = preferido;
    }
    item.nombre = principal || item.nombre || "Sin título";
    item.titulo = item.nombre;
    if (item.titulo_original && String(item.titulo_original).toLowerCase() === String(item.nombre).toLowerCase()) {
        item.titulo_original = null;
    }
    return item;
}


function mostrarDetalleLoading(on) {
  const el = document.getElementById("details-loading");
  const content = document.getElementById("details-content");
  const empty = document.getElementById("details-empty");
  const body = document.querySelector("#details-panel .details-body");
  const hero = document.getElementById("koi-hero");
  const bg = document.getElementById("mz-stremio-bg");
  const bgImg = document.getElementById("mz-stremio-bg-img");
  if (el) {
    el.classList.toggle("hidden", !on);
    if (on) el.style.display = "";
  }
  if (content) {
    // content-inner: no ocultar todo el shell, solo el interior con datos
  }
  // Mientras carga: ocultar hero, layout y fondo
  if (on) {
    if (body) body.classList.add("mz-loading-detail");
    if (hero) {
      hero.classList.add("hidden");
      hero.style.visibility = "hidden";
    }
    if (bg) {
      bg.style.opacity = "0";
      bg.style.visibility = "hidden";
    }
    if (bgImg) {
      bgImg.classList.remove("is-ready");
    }
    try {
      const inner = document.getElementById("details-content");
      if (inner) {
        inner.classList.add("mz-detail-dimmed");
        // no usar .hidden en details-content (rompe el panel); ocultamos hijos vía CSS
      }
    } catch (_) {}
  } else {
    if (body) body.classList.remove("mz-loading-detail");
    if (hero) {
      hero.classList.remove("hidden");
      hero.style.visibility = "";
    }
    if (bg) {
      bg.style.opacity = "";
      bg.style.visibility = "";
    }
    try {
      const inner = document.getElementById("details-content");
      if (inner) inner.classList.remove("mz-detail-dimmed");
    } catch (_) {}
  }
  if (empty) empty.classList.add("hidden");
}



async function abrirDetalle(item, autoPlay = false, force = false) {
    if (item) fijarTitulosItem(item, item.nombre || item.titulo);
    // Bloquear fuente del listado (JK=5 / AV1=4) para no cruzar al cargar detalle
    try {
      if (item && item.source_id != null) {
        item.source_id = String(item.source_id);
        window.__mzLockSourceId = String(item.source_id);
      }
    } catch (_) {}
    seleccionActual = item;
    try {
      if (typeof mzPushDetalleUrl === "function") {
        // No pisar /detalle/slug/t/e si ya estamos en un episodio de este título
        var keepEp = false;
        try {
          var pm = location.pathname.match(/^\/detalle\/(?:\d+\/)?([^\/]+)\/(\d+)\/(\d+)/i);
          var sl = typeof mzSlugFromItem === "function" ? mzSlugFromItem(item) : (item && item.slug);
          if (pm && sl && decodeURIComponent(pm[1]) === sl) keepEp = true;
        } catch (_) {}
        if (!keepEp) mzPushDetalleUrl(item);
      }
    } catch (_) {}

    detailsEmpty.classList.add("hidden");
    detailsContent.classList.remove("hidden");
    detailsPanel.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    document.body.classList.add("details-open");
    // Al abrir detalle: nunca entrar en modo player (evita que película abra reproductor solo)
    try {
      document.body.classList.remove("player-open");
      const iframe = document.getElementById("player-iframe");
      if (iframe) iframe.src = "about:blank";
      const vc = document.getElementById("video-player-container");
      if (vc) {
        vc.classList.add("hidden");
      }
      // Scroll del detalle en el body interno
      const db = document.querySelector("#details-panel .details-body");
      if (db) {
        db.style.overflowY = "auto";
        db.style.webkitOverflowScrolling = "touch";
        db.scrollTop = 0;
      }
    } catch (_) {}
    // Modo visual Koiflix solo PC + serie/anime
    try {
      setKoiMode(item);
      bindKoiHeroControls({
        onPlay: async () => {
          const esPeli = typeof isPeliculaItem === "function" ? isPeliculaItem(item) : /pel[ií]cula|movie|film/i.test(String(item.tipo || item.type || item.formato || ""));
                    if (esPeli) {
            // PC y móvil: misma vista Koi
            try {
              if (typeof window.mzKoiOpenMovie === "function") {
                const ok = await window.mzKoiOpenMovie(item);
                if (ok) return;
              }
            } catch (e) {
              console.warn("mzKoiOpenMovie", e);
            }
            // Fallback si Koi no abre
            try {
              document.body.classList.add("player-open", "koi-movie");
              const ss = document.getElementById("servers-section");
              if (ss) {
                ss.classList.remove("hidden");
                ss.style.setProperty("display", "block", "important");
              }
              let embeds = item.embeds || item.reproductores || [];
              let downloads = item.downloads || item.descargas || [];
              if ((!embeds || !embeds.length) && item.reproductor) {
                embeds = [{ url: item.reproductor, server: "Servidor" }];
              }
              if (!embeds || !embeds.length) {
                try {
                  const qs = new URLSearchParams();
                  if (item.slug) qs.set("slug", item.slug);
                  if (item.link) qs.set("link", item.link);
                  if (item.source_id) qs.set("source_id", String(item.source_id));
                  qs.set("tipo", "Pelicula");
                  const r = await fetch("/api/detalle?" + qs.toString(), { cache: "no-store" });
                  const full = await r.json();
                  if (full) {
                    embeds = full.embeds || full.reproductores || embeds || [];
                    downloads = full.downloads || full.descargas || downloads || [];
                    Object.assign(item, full);
                  }
                } catch (_) {}
              }
              if (typeof renderServidoresYDescargas === "function") {
                renderServidoresYDescargas(embeds, downloads, item.reproductor, item, {
                  expandido: true,
                  noAutoplay: true
                });
              }
              document.getElementById("video-player-container")?.classList.remove("hidden");
            } catch (_) {}
            return;
          }
    
          const first =
            document.querySelector("#episodes-container [data-ep]") ||
            document.querySelector("#episodes-container button") ||
            document.querySelector("#episodes-container .ep-card") ||
            document.querySelector("#episodes-container > *");
          if (first) first.click();
        },
      });
    } catch (_) {}
    // Siempre mostrar loading al entrar; fondo/hero ocultos hasta tener datos
    if (typeof mostrarDetalleLoading === "function") mostrarDetalleLoading(true);

    // Preparar datos en DOM pero sin mostrar fondo aún (loading cubre)
    const __posterEl = document.getElementById("details-poster");
    const __posterCol = document.querySelector(".mz-stremio-poster-col");
    if (__posterEl) __posterEl.classList.add("mz-poster-hidden");
    if (__posterCol) __posterCol.classList.add("mz-hide-poster");
    // Portada EXACTA del listado/búsqueda — no cambiar al cargar detalle
    window.__mzPortadaLista =
      item.portada ||
      item.portada_fuente_raw ||
      item.poster ||
      null;
    item._portadaLocked = true;
    if (window.__mzPortadaLista) {
      item.portada = window.__mzPortadaLista;
      item.portada_fuente_raw = window.__mzPortadaLista;
    }
    if (__posterEl) {
      __posterEl.src = window.__mzPortadaLista || PLACEHOLDER;
      __posterEl.classList.remove("mz-poster-hidden");
    }
    setDetalleLogo(item);
    document.getElementById("details-type").textContent = (typeof tipoBadgeLabel === "function" ? tipoBadgeLabel(item) : tipoLabel(item.tipo));
    document.getElementById("details-title").textContent = item.nombre || item.titulo || "Sin título";
    // backdrop + hero se pintan al terminar carga (abajo)

    const originalEl = document.getElementById("details-original-title");
    if (item.titulo_original && item.titulo_original !== item.nombre) {
        originalEl.textContent = item.titulo_original;
        originalEl.style.display = "block";
    } else {
        originalEl.textContent = "";
        originalEl.style.display = "none";
    }

    document.getElementById("details-year").textContent = item.year || "—";
    rellenarMetaDetalle(item);
    setDetalleImdb(item);

    const _desc = (item.descripcion && String(item.descripcion).trim()) || "";
    const synEl = document.getElementById("details-synopsis");
    if (synEl) {
      synEl.textContent = _desc.length >= 20 ? _desc : "Cargando información…";
      synEl.classList.toggle("mz-syn-loading", _desc.length < 20);
    }

    actualizarBotonFavorito();

    videoContainer.classList.add("hidden");
    playerIframe.src = "about:blank";

  const serversSection = document.getElementById("servers-section");
    if (serversSection) {
      serversSection.classList.add("hidden"); // Stremio: streams solo tras elegir
      const loading = serversSection.querySelector("#servers-loading");
      if (loading) loading.classList.add("hidden");
    }
    document.getElementById("servers-container").innerHTML = "";
    document.getElementById("seasons-section").classList.add("hidden");
    document.getElementById("servers-section")?.classList.add("hidden");
    try {
      const _epc = document.getElementById("episodes-container");
      if (_epc) _epc.innerHTML = "";
      const _sec = document.getElementById("seasons-container");
      if (_sec) _sec.innerHTML = "";
    } catch (_) {}
    document.getElementById("downloads-section").classList.add("hidden");

    const _thinDetail = !item.descripcion || String(item.descripcion).trim().length < 20
      || (!(item.tipo === "Serie" || item.tipo === "Anime") && (!item.embeds || !item.embeds.length))
      || ((item.tipo === "Serie" || item.tipo === "Anime") && (!item.episodios || !item.episodios.length) && (!item.temporadas_raw || !item.temporadas_raw.length));
    if (typeof mostrarDetalleLoading === "function") mostrarDetalleLoading(true);

    // Enriquecer siempre que falte descripción, players o episodios (al entrar, no solo al pulsar Actualizar)
    // También si el listado marcó "Sin servidores" (tiene_player !== true) para películas
    const faltaDescripcion = !item.descripcion || String(item.descripcion).trim().length < 20;
    const esSA =
      !(typeof isPeliculaItem === "function" && isPeliculaItem(item)) &&
      !( /pel[ií]cula|movie|film/i.test(String(item.tipo || item.formato || "")) ) &&
      (item.tipo === "Serie" || item.tipo === "Anime");

    const _needsEnrich = faltaDescripcion || true; // se ajusta abajo
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
  

    // Ya completo (Supabase/list con players): NO llamar API de nuevo
    const yaCompleto =
        !force &&
        item.tiene_player === true &&
        item.descripcion && String(item.descripcion).trim().length >= 20 &&
        (
            (item.embeds && item.embeds.length > 0) ||
            (esSA && (item.episodios?.length || item.temporadas?.length || item.temporadas_raw?.length))
        );

    const necesitaEnriquecer =
        force ||
        (!yaCompleto && (faltaDescripcion || faltaPlayers || faltaEpisodios));

    if (necesitaEnriquecer && (item.postId || item.link || item.slug || item.url_extract)) {
        try {
            const params = new URLSearchParams();
            if (item.postId) params.set("postId", item.postId);
            if (item.link) params.set("link", item.link);
            if (item.slug) params.set("slug", item.slug);
            // Fuente del listado (JK=5 / AV1=4) — no dejar que el backend cambie a 4
            let sidDet = item.source_id != null ? String(item.source_id) : "";
            try {
              if (!sidDet && window.__mzLockSourceId) sidDet = String(window.__mzLockSourceId);
              // /detalle/5/one-piece → 5
              if (!sidDet) {
                const pm = location.pathname.match(/^\/detalle\/(\d+)\//i);
                if (pm) sidDet = pm[1];
              }
            } catch (_) {}
            if (!sidDet && item.link) {
              const m = String(item.link).match(/\/([45])\/(?:anime|serie)\//i);
              if (m) sidDet = m[1];
            }
            if (!sidDet && item.url) {
              const m = String(item.url).match(/\/([45])\/(?:anime|serie)\//i);
              if (m) sidDet = m[1];
            }
            if (sidDet) {
              params.set("source_id", sidDet);
              item.source_id = sidDet;
            }
            if (item.tipo) params.set("tipo", item.tipo);
            if (item.url_extract && !item.link) params.set("link", item.url_extract);
            if (force) params.set("force", "1");
            // Portada ya buena del listado: que el backend la respete siempre
            // y no la pise con la del detalle de la fuente (a veces rota).
            if (window.__mzPortadaLista) params.set("portada", window.__mzPortadaLista);
            else if (item.portada) params.set("portada", item.portada);

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
                // force (Actualizar servidores): solo players; conservar título/sinopsis/portada/meta
                if (force) {
                    const keepMeta = {
                        nombre: item.nombre,
                        titulo: item.titulo,
                        titulo_original: item.titulo_original,
                        year: item.year,
                        calificacion: item.calificacion,
                        rating: item.rating,
                        genero: item.genero,
                        generos: item.generos,
                        descripcion: item.descripcion,
                        portada: item.portada,
                        imdb: item.imdb,
                        tmdb: item.tmdb,
                        imdb_id: item.imdb_id,
                        votos: item.votos,
                        duracion: item.duracion,
                        duracion_texto: item.duracion_texto,
                        certificacion: item.certificacion,
                        source_id: item.source_id,
                        link: item.link,
                        slug: item.slug,
                    };
                    if (Array.isArray(completo.embeds) && completo.embeds.length) {
                        item.embeds = completo.embeds;
                        item.tiene_player = true;
                    }
                    if (completo.reproductor) item.reproductor = completo.reproductor;
                    if (Array.isArray(completo.downloads) && completo.downloads.length) {
                        item.downloads = completo.downloads;
                    }
                    if (completo.total_episodios || completo.totalEpisodios) {
                        const tNew = parseInt(completo.total_episodios || completo.totalEpisodios, 10) || 0;
                        const tOld = parseInt(item.total_episodios || item.totalEpisodios, 10) || 0;
                        item.total_episodios = Math.max(tNew, tOld) || tNew || tOld || null;
                    }
                    if (Array.isArray(completo.rangos_episodios) && completo.rangos_episodios.length) {
                        const maxH = (arr) => (arr || []).reduce((m, r) => Math.max(m, Number(r.hasta) || 0), 0);
                        if (!item.rangos_episodios || maxH(completo.rangos_episodios) >= maxH(item.rangos_episodios)) {
                            item.rangos_episodios = completo.rangos_episodios;
                        }
                    }
                    if (Array.isArray(completo.episodios) && completo.episodios.length) {
                        item.episodios = completo.episodios;
                        try { mzHydrateAnimeBackImg(item); } catch (_) {}
                    }
                    // Restaurar meta (no dejar que API ponga slug / inglés)
                    Object.keys(keepMeta).forEach(function (k) {
                        if (keepMeta[k] != null && keepMeta[k] !== "") item[k] = keepMeta[k];
                    });
                    // Portada del listado siempre gana
                    if (window.__mzPortadaLista) {
                        item.portada = window.__mzPortadaLista;
                        item.portada_fuente_raw = window.__mzPortadaLista;
                    } else if (keepMeta.portada) {
                        item.portada = keepMeta.portada;
                    }
                    // Mantener fuente del listado (JK no debe pasar a AV1)
                    if (keepMeta.source_id || window.__mzLockSourceId) {
                      item.source_id = String(keepMeta.source_id || window.__mzLockSourceId);
                      if (item.slug && (item.source_id === "5" || item.source_id === "4")) {
                        var kindL = (typeof isPeliculaItem === "function" && isPeliculaItem(item)) || /pel[ií]cula|movie|film/i.test(String(item.tipo || item.formato || ""))
                          ? "pelicula"
                          : "anime";
                        item.link = "https://moviezone.tvjz.workers.dev/" + item.source_id + "/" + kindL + "/" + item.slug;
                        item.fuente = item.source_id === "5" ? "jkanime" : (item.source_id === "4" ? "animeav1" : item.fuente);
                      }
                    }
                    // Descripción: si completo trae español mejor, usarla
                    if (completo.descripcion && String(completo.descripcion).length > 40) {
                        const esComp = /[áéíóúñ¿¡]/i.test(completo.descripcion) ||
                            /\b(el|la|los|las|de|que|una|unos|con|por)\b/i.test(completo.descripcion);
                        const esKeep = item.descripcion && (/[áéíóúñ¿¡]/i.test(item.descripcion) ||
                            /\b(el|la|los|las|de|que|una)\b/i.test(item.descripcion));
                        if (esComp && !esKeep) item.descripcion = completo.descripcion;
                    }
                    if (item.nombre && item.slug &&
                        String(item.nombre).toLowerCase().replace(/\s+/g, "-") === String(item.slug).toLowerCase()) {
                        item.nombre = keepMeta.nombre || item.titulo || item.nombre;
                    }
                } else {
                // Fusionar: el detalle rellena huecos; NUNCA borrar meta buena con null
                const yOld = item.year && String(item.year).match(/(19|20)\d{2}/);
                const yNew = completo.year && String(completo.year).match(/(19|20)\d{2}/);
                if (yOld && yNew && yOld[0] !== yNew[0]) {
                    // Años distintos: confiar en detalle si trae título/nombre
                    if (completo.nombre || completo.titulo) {
                        var _portLock = window.__mzPortadaLista || item.portada || null;
                        Object.keys(item).forEach(function (k) { delete item[k]; });
                        Object.assign(item, completo);
                        if (_portLock) {
                          item.portada = _portLock;
                          item.portada_fuente_raw = _portLock;
                          window.__mzPortadaLista = _portLock;
                        }
                    }
                } else {
                    const keep = Object.assign({}, item);
                    Object.assign(item, completo);
                    // Película API: tipo + players
                    try {
                      if (/pel[ií]cula|movie|film/i.test(String(completo.tipo || completo.formato || ""))) {
                        item.tipo = "Película";
                        item.formato = completo.formato || "Pelicula";
                        if (Array.isArray(completo.embeds) && completo.embeds.length) {
                          item.embeds = completo.embeds;
                          item.tiene_player = true;
                        }
                        if (completo.reproductor) item.reproductor = completo.reproductor;
                        item.episodios = [];
                        item.temporadas = [];
                        item.temporadas_raw = null;
                      }
                    } catch (_) {}
                    // Restaurar campos que el detalle mandó vacíos
                    const fields = [
                        "nombre", "titulo", "titulo_original", "year", "calificacion", "rating",
                        "genero", "generos", "descripcion", "votos", "duracion", "duracion_texto",
                        "certificacion", "imdb_id", "tmdb_id", "imdb", "tmdb", "omdb", "portada", "backdrop",
                        "fecha_estreno", "estado", "en_emision", "finalizado",
                        "embeds", "downloads", "reproductor", "episodios", "temporadas", "temporadas_raw",
                        "tiene_player", "link", "url_extract", "slug", "source_id",
                        "studios", "temporada_anime", "temporada", "demografia", "idiomas",
                        "titulos_alternativos", "ultimo_episodio", "ultimo_episodio_url",
                        "proximo_episodio", "fecha_estreno_texto", "calidad", "fuente"
                    ];
                    fields.forEach(function (f) {
                        const v = item[f];
                        const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
                        if (empty && keep[f] != null && keep[f] !== "" && !(Array.isArray(keep[f]) && !keep[f].length)) {
                            item[f] = keep[f];
                        }
                    });

                    // Fuente del listado (JK=5) nunca se pisa por AV1
                    if (keep.source_id) {
                      item.source_id = String(keep.source_id);
                      if (keep.link) item.link = keep.link;
                    }
                    // Portada del listado nunca se pisa
                    if (window.__mzPortadaLista) {
                      item.portada = window.__mzPortadaLista;
                      item.portada_fuente_raw = window.__mzPortadaLista;
                    } else if (keep.portada) {
                      item.portada = keep.portada;
                    }
                    // Rellenar huecos desde imdb/tmdb anidados (Chrome a veces pierde campos planos)
                    if (item.imdb) {
                        if (item.votos == null && item.imdb.votos) item.votos = item.imdb.votos;
                        if (item.duracion == null && item.imdb.duracion) item.duracion = item.imdb.duracion;
                        if (!item.duracion_texto && item.imdb.duracion_texto) item.duracion_texto = item.imdb.duracion_texto;
                        if (!item.certificacion && item.imdb.certificacion) item.certificacion = item.imdb.certificacion;
                        if ((item.calificacion == null || item.calificacion === "") && item.imdb.rating != null) {
                            item.calificacion = item.imdb.rating;
                        }
                    }
                    if (item.tmdb) {
                        if (!item.fecha_estreno && item.tmdb.fecha_estreno) item.fecha_estreno = item.tmdb.fecha_estreno;
                        if (item.duracion == null && item.tmdb.duracion) item.duracion = item.tmdb.duracion;
                        if (!item.duracion_texto && item.tmdb.duracion_texto) item.duracion_texto = item.tmdb.duracion_texto;
                    }
                    // Players del detalle siempre ganan si traen algo
                    if (Array.isArray(completo.embeds) && completo.embeds.length) {
                        item.embeds = completo.embeds;
                        item.tiene_player = true;
                    }
                    if (completo.reproductor) item.reproductor = completo.reproductor;
                    if (Array.isArray(completo.downloads) && completo.downloads.length) {
                        item.downloads = completo.downloads;
                    }
                    if (completo.calificacion != null) item.calificacion = completo.calificacion;
                    if (completo.rating != null && (item.calificacion == null || item.calificacion === "")) {
                        item.calificacion = completo.rating;
                    }
                    if (completo.year) item.year = completo.year;
                    if (completo.genero) item.genero = completo.genero;
                    if (completo.generos && completo.generos.length) item.generos = completo.generos;
                    if (completo.studios) item.studios = completo.studios;
                    if (completo.temporada_anime || completo.temporada) {
                      item.temporada_anime = completo.temporada_anime || completo.temporada;
                      item.temporada = completo.temporada || completo.temporada_anime;
                    }
                    if (completo.demografia) item.demografia = completo.demografia;
                    if (completo.idiomas) item.idiomas = completo.idiomas;
                    if (completo.titulos_alternativos) item.titulos_alternativos = completo.titulos_alternativos;
                    if (completo.ultimo_episodio) item.ultimo_episodio = completo.ultimo_episodio;
                    if (completo.ultimo_episodio_url) item.ultimo_episodio_url = completo.ultimo_episodio_url;
                    if (completo.proximo_episodio) item.proximo_episodio = completo.proximo_episodio;
                    if (completo.fecha_estreno_texto) item.fecha_estreno_texto = completo.fecha_estreno_texto;
                    if (completo.calidad) item.calidad = completo.calidad;
                    if (completo.imdb) item.imdb = completo.imdb;
                    if (completo.votos) item.votos = completo.votos;
                    if (completo.duracion) item.duracion = completo.duracion;
                    if (completo.duracion_texto) item.duracion_texto = completo.duracion_texto;
                    if (completo.certificacion) item.certificacion = completo.certificacion;
                    // Título: conservar el local/ES del listado; original solo en titulo_original
                    const nombreAntes = keep.nombre || keep.titulo || null;
                    fijarTitulosItem(item, nombreAntes);
                    if (completo.titulo_original && completo.titulo_original !== item.nombre) {
                        item.titulo_original = completo.titulo_original;
                    }
                    // Si años conflictúan, confiar 100% en detalle API
                    if (completo.year && item.year && String(completo.year).slice(0,4) !== String(item.year).slice(0,4)) {
                        item.year = completo.year;
                        if (completo.calificacion != null) item.calificacion = completo.calificacion;
                        if (completo.genero) item.genero = completo.genero;
                        if (completo.generos) item.generos = completo.generos;
                        if (completo.imdb) item.imdb = completo.imdb;
                    }
                }
                } // end !force
                const esSA2 = item.tipo === "Serie" || item.tipo === "Anime";
                if (item.tiene_player || itemTieneVideo(item) ||
                    (esSA2 && (item.episodios?.length || item.temporadas?.length || item.temporadas_raw?.length))) {
                    item.tiene_player = true;
                }
                if (item.embeds && item.embeds.length) item.tiene_player = true;
                seleccionActual = item;
                try { actualizarBotonFavorito(); } catch (_) {}

                // Portada del listado SIEMPRE (aunque la API traiga otra)
                if (window.__mzPortadaLista) {
                  item.portada = window.__mzPortadaLista;
                  item.portada_fuente_raw = window.__mzPortadaLista;
                }

                // Repintar metadatos (título principal fijo; original abajo)
                fijarTitulosItem(item, item.nombre);
                (function () {
                  const lista = window.__mzPortadaLista || null;
                  if (lista && String(lista).indexOf("placeholder") === -1) {
                    item.portada = lista;
                    item.portada_fuente_raw = lista;
                  }
                  const posterEl = document.getElementById("details-poster");
                  if (posterEl) {
                    posterEl.src = lista || item.portada || PLACEHOLDER;
                    posterEl.classList.remove("mz-poster-hidden");
                  }
                })();
                setDetailBackdrop(item);
                setDetalleImdb(item);
                setDetalleLogo(item);
                // Tras logo: volver a fijar portada del listado (logo no debe cambiarla)
                (function () {
                  const lista = window.__mzPortadaLista || null;
                  if (!lista) return;
                  item.portada = lista;
                  const posterEl = document.getElementById("details-poster");
                  if (posterEl) posterEl.src = lista;
                })();
                document.getElementById("details-title").textContent = item.nombre || item.titulo || "Sin título";
                const origEl2 = document.getElementById("details-original-title");
                if (origEl2) {
                    if (item.titulo_original && item.titulo_original !== item.nombre) {
                        origEl2.textContent = item.titulo_original;
                        origEl2.style.display = "block";
                    } else {
                        origEl2.textContent = "";
                        origEl2.style.display = "none";
                    }
                }
                document.getElementById("details-year").textContent = item.year || "—";
                rellenarMetaDetalle(item);
                document.getElementById("details-synopsis").textContent = item.descripcion || "Sin descripción disponible.";

         /*       // Actualizar badge Disponible en la tarjeta del grid si existe
                try {
                    if (item.tiene_player || (item.embeds && item.embeds.length)) {
                        document.querySelectorAll(".media-card").forEach(function (card) {
                            const h = card.querySelector("h3");
                            if (!h) return;
                            if (h.textContent.trim() !== String(item.nombre || item.titulo || "").trim()) return;
                            const badge = card.querySelector(".availability-badge");
                            if (badge) {
                                badge.classList.remove("unavailable");
                                badge.classList.add("available");
                                badge.innerHTML = '<span class="dot"></span> ▶ Disponible';
                            }
                        });
                    }
                } catch (_) {}*/
            }
        } catch (err) {
            console.error("Error o timeout enriqueciendo detalle:", err);
        }
    }

    document.getElementById("servers-loading").classList.add("hidden");

    setDetalleImdb(item);
    setDetalleLogo(item);
    if (typeof rellenarMetaDetalle === "function") rellenarMetaDetalle(item);
    const _syn2 = document.getElementById("details-synopsis");
    if (_syn2 && item.descripcion && String(item.descripcion).trim().length >= 20) {
      _syn2.textContent = item.descripcion;
      _syn2.classList.remove("mz-syn-loading");
    }
    try { setDetailBackdrop(item); } catch (_) {}
    try {
      setKoiMode(item);
      fillKoiHero(item);
    } catch (_) {}
    if (typeof mostrarDetalleLoading === "function") mostrarDetalleLoading(false);

    const esPeli =
      (typeof isPeliculaItem === "function" && isPeliculaItem(item)) ||
      /pel[ií]cula|movie|film/i.test(String(item.tipo || item.type || item.formato || ""));
    const esSerieOAnime =
      !esPeli &&
      (item.tipo === "Serie" ||
        item.tipo === "Anime" ||
        (typeof isSerieOrAnime === "function" && isSerieOrAnime(item)));

    const seasonsEl = document.getElementById("seasons-section");
    const serversEl = document.getElementById("servers-section");
    const epsCont = document.getElementById("episodes-container");
    const seasonsCont = document.getElementById("seasons-container");

    if (esSerieOAnime && !esPeli && (
      (Array.isArray(item.episodios) && item.episodios.length > 0) ||
      (Array.isArray(item.temporadas) && item.temporadas.length > 0) ||
      (Array.isArray(item.temporadas_raw) && item.temporadas_raw.length > 0)
    )) {
        // Serie / anime: episodios sí, servidores no (van por capítulo)
        if (serversEl) serversEl.classList.add("hidden");
        if (seasonsEl) seasonsEl.classList.remove("hidden");
        renderTemporadas(item);
        cargarProveedoresAlternos(item).then(() => renderProveedorSwitcher(item)).catch(() => {});
        if (item.tipo === "Anime" && item.slug) {
            refrescarTotalAnimeSiHaceFalta(item).catch(() => {});
        }
    } else {
        // Película / OVA-ONA-Especial 1 ep: limpiar episodios y UI antigua de series
        if (seasonsEl) {
          seasonsEl.classList.add("hidden");
          seasonsEl.style.setProperty("display", "none", "important");
        }
        if (epsCont) epsCont.innerHTML = "";
        if (seasonsCont) seasonsCont.innerHTML = "";
        try {
          const tabs = document.getElementById("seasons-tabs-container");
          if (tabs) tabs.innerHTML = "";
        } catch (_) {}
        // quitar switcher de proveedores de serie anterior
        try {
          const sw = document.getElementById("mz-proveedor-switcher");
          if (sw) sw.innerHTML = "";
        } catch (_) {}

        // Película: en detalle NO listar reproductores (igual que series).
        // Van al pulsar REPRODUCIR → vista Koi (player + título + sinopsis + servers + ← Volver)
        if (serversEl) {
          serversEl.classList.add("hidden");
          serversEl.style.removeProperty("display");
        }
        document.getElementById("downloads-section")?.classList.add("hidden");
        try {
          const dl = document.getElementById("downloads-list-container");
          if (dl) dl.innerHTML = "";
          const dlt = document.getElementById("mz-downloads-toggle");
          if (dlt) dlt.remove();
        } catch (_) {}
        document.body.classList.add("koi-movie");
        document.body.classList.remove("player-open");
        try {
          const vc = document.getElementById("video-player-container");
          if (vc) {
            vc.classList.add("hidden");
            const ifr = document.getElementById("player-iframe");
            if (ifr) ifr.src = "about:blank";
          }
          const sc = document.getElementById("servers-container");
          if (sc) sc.innerHTML = "";
        } catch (_) {}
    }
}

function cerrarDetalle(fromPop) {
    try {
      window.__mzPortadaLista = null;
    } catch (_) {}
    if (typeof mostrarDetalleLoading === "function") mostrarDetalleLoading(false);
    // fromPop === true → ya venimos de popstate con path "/"
    // fromPop === false/undefined → cerrar con X → URL a inicio
    if (!fromPop) {
      try {
        if (typeof mzReplaceHomeUrl === "function") mzReplaceHomeUrl();
        else history.replaceState({ mz: "home" }, "", "/");
      } catch (_) {
        try { history.replaceState({ mz: "home" }, "", "/"); } catch (__) {}
      }
    }


  
    const bgImg = document.getElementById("mz-stremio-bg-img");
    if (bgImg) { bgImg.classList.remove("is-ready"); bgImg.removeAttribute("src"); }

    detenerSeguimientoProgreso(true);
    detailsPanel.classList.add("hidden");
    document.body.style.overflow = "";
    document.body.classList.remove("player-open");
    try { salirVistaMovilEpisodio(); } catch (_) {}
    document.body.classList.remove("koi-movie", "mz-mobile-movie-playing");
    document.body.classList.remove("details-open");
    try { clearKoiMode(); setKoiPlayerEpisodeTitle(""); } catch (_) {}
    destruirHls();
    playerIframe.src = "about:blank";
    videoContainer.classList.add("hidden");

    document.getElementById("servers-section")?.classList.add("hidden");
    document.getElementById("seasons-section")?.classList.add("hidden");
    document.getElementById("downloads-section")?.classList.add("hidden");
    const sc = document.getElementById("servers-container");
    if (sc) sc.innerHTML = "";
    const body = document.querySelector("#details-panel .details-body");
    if (body) body.scrollTop = 0;

    cargarContinuarViendo();
    // Si entró por deep link sin cargar home, cargarlo al volver
    if (window.__mzSkipHomeBoot) {
      window.__mzSkipHomeBoot = false;
      try { cargarHome(); } catch (_) {}
    }
}
//document.getElementById("btn-close-modal").addEventListener("click", cerrarDetalle);
//document.getElementById("modal-backdrop-close").addEventListener("click", cerrarDetalle);
document.getElementById("btn-close-modal")?.addEventListener("click", function () {
  cerrarDetalle(false);
});
document.getElementById("modal-backdrop-close")?.addEventListener("click", function () {
  cerrarDetalle(false);
});

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
    try { salirVistaMovilEpisodio(); } catch (_) {}

    _epPlayCtx = null;
    actualizarBotonesEpPlayer();
    // Al cerrar el player vuelve a mostrarse el botón de cerrar detalle (CSS body.player-open)
    cargarContinuarViendo();
});

function setDetalleImdb(item) {
  const wrap = document.getElementById("details-imdb-wrap");
  const btn = document.getElementById("details-imdb-btn");
  const scoreEl = document.getElementById("details-imdb-score");
  if (!btn) return;

  const imdbIdRaw = item.imdb_id || (item.imdb && (item.imdb.id || item.imdb.imdb_id)) || "";
  let imdbId = String(imdbIdRaw || "").trim();
  if (imdbId && !imdbId.startsWith("tt")) imdbId = "tt" + imdbId.replace(/\D/g, "");

  const ri = typeof ratingInfo === "function" ? ratingInfo(item) : null;
  let score = null;
  // Mostrar rating de cualquier fuente (fuente/JK/TMDB/IMDb), sin exigir IMDb
  if (ri && ri.value != null && !isNaN(Number(ri.value))) score = Number(ri.value);
  else if (item.imdb && item.imdb.rating != null) score = Number(item.imdb.rating);
  else if (item.calificacion != null && item.calificacion !== "") score = Number(item.calificacion);
  else if (item.rating != null && item.rating !== "") score = Number(item.rating);

  const okScore = score != null && !isNaN(score) && score > 0;
  const okId = !!imdbId;

  if (okId || okScore) {
    if (wrap) wrap.classList.remove("hidden");
    btn.classList.remove("hidden");
    if (scoreEl) scoreEl.textContent = okScore ? Number(score).toFixed(1) : "—";
    if (okId) {
      btn.href = "https://www.imdb.com/title/" + imdbId + "/";
      btn.setAttribute("target", "_blank");
      btn.setAttribute("rel", "noopener noreferrer");
    } else {
      btn.href = "#";
      btn.removeAttribute("target");
    }
  } else {
    if (wrap) wrap.classList.add("hidden");
    btn.classList.add("hidden");
    btn.href = "#";
  }
}

// ---------- Favoritos ----------
function actualizarBotonFavorito() {
    const btn = document.getElementById("btn-favorito");
    const icon = document.getElementById("btn-favorito-icon");
    const koiBm = document.getElementById("koi-btn-bookmark");
    const koiIcon = document.getElementById("koi-btn-bookmark-icon");
    if (!btn && !koiBm) return;
    const activo = seleccionActual ? esFavorito(seleccionActual) : false;
    // Bookmark (no corazón): se rellena al activar y se despinta al quitar
    if (btn) {
      if (icon) icon.setAttribute("name", activo ? "bookmark" : "bookmark-outline");
      btn.style.color = activo ? "#e50914" : "";
      btn.classList.toggle("is-fav", !!activo);
      btn.setAttribute("aria-pressed", activo ? "true" : "false");
      btn.title = activo ? "Quitar de favoritos" : "Agregar a favoritos";
    }
    if (koiBm) {
      koiBm.classList.toggle("is-fav", !!activo);
      koiBm.style.color = activo ? "#e50914" : "";
      const ki = koiIcon || koiBm.querySelector("ion-icon");
      if (ki) ki.setAttribute("name", activo ? "bookmark" : "bookmark-outline");
    }
}
(function bindFavoritoBtn() {
  const btn = document.getElementById("btn-favorito");
  if (!btn || btn.dataset.mzFavBound === "1") return;
  btn.dataset.mzFavBound = "1";
  btn.addEventListener("click", function (e) {
    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
    if (!seleccionActual) return;
    toggleFavoritoItem(seleccionActual);
    actualizarBotonFavorito();
  });
})();

// ---------- Links cortos compartibles: /serie/slug ----------
function tipoPathFromItem(item) {
    if (!item) return "pelicula";
    const t = String(item.tipo || "").toLowerCase();
    if (t.includes("anime")) return "anime";
    if (t.includes("serie") || t.includes("dorama") || t === "tv") return "serie";
    return "pelicula";
}

function slugFromItem(item) {
    if (!item) return null;
    if (item.slug) return String(item.slug).replace(/^\/+|\/+$/g, "");
    const link = item.link || item.url_extract || item.url || "";
    const m = String(link).match(/\/(?:serie|pelicula|anime|doramas?|media)\/([^\/\?#]+)/i)
        || String(link).match(/\/[1-6]\/(?:serie|pelicula|anime)\/([^\/\?#]+)/i);
    if (m) {
        try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    return null;
}

function buildSharePath(item) {
    const slug = slugFromItem(item);
    if (!slug) return null;
    return "/" + tipoPathFromItem(item) + "/" + encodeURIComponent(slug).replace(/%2F/gi, "");
}

document.getElementById("btn-share")?.addEventListener("click", async () => {
    if (!seleccionActual) return;
    const pathShare = buildSharePath(seleccionActual);
    let url;
    if (pathShare) {
        url = location.origin + pathShare;
    } else {
        const link = seleccionActual.link || seleccionActual.id || seleccionActual.postId;
        if (!link) return;
        url = `${location.origin}/?link=${encodeURIComponent(String(link))}`;
    }
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


// ---------- Proveedores (Doramasflix / PelisPlus) ----------
// ---------- Proveedores (botones 1, 2, 3…) ----------
function nombreProveedor(sid, fuente, index) {
    // Si hay índice en la lista de proveedores → "1", "2", "3"
    if (index != null && index >= 0) return String(index + 1);
    const s = String(sid || fuente || "").toLowerCase();
    if (s === "5" || s.includes("jkanime") || s === "jk") return "JK";
    if (s === "4" || s.includes("animeav1")) return "Anime";
    if (s === "6" || s.includes("dorama")) return "1";
    if (s === "3" || s.includes("pelis")) return "2";
    if (s === "2" || s.includes("hack")) return "3";
    if (s === "1" || s.includes("lamovie")) return "4";
    return String(sid || "?");
}

function ordenPrioridadProveedor(sid, tipo) {
    const s = String(sid || "");
    const t = String(tipo || "");
    if (/anime/i.test(t)) {
        if (s === "4") return 0; // solo animeav1
        return 99;
    }
    if (/serie/i.test(t)) {
        if (s === "6") return 0;
        if (s === "3") return 1;
        if (s === "2") return 2;
        return 5;
    }
    if (s === "3") return 0;
    return 5;
}

/** Busca la misma serie/anime en otras fuentes y las guarda en item._proveedores */
async function cargarProveedoresAlternos(item) {
    if (!item || (item.tipo !== "Serie" && item.tipo !== "Anime")) return [];
    // Anime: solo AnimeAV1, sin fuentes alternas
    if (/anime/i.test(String(item.tipo || ""))) {
        item._proveedores = [];
        return [];
    }
    if (Array.isArray(item._proveedores) && item._proveedores.length) return item._proveedores;

    const q = (item.nombre || item.titulo || "").replace(/\s*\(\d{4}\)\s*$/, "").trim();
    if (!q || q.length < 2) return [];

    const actualSid = String(item.source_id || resolverSidLocal(item) || "");
    const tituloBase = normalizarTituloProveedor(q);

    // Un solo slot por source_id (evita 15× AnimeAV1)
    const bySid = new Map();
    bySid.set(actualSid || "?", {
        source_id: actualSid || "6",
        slug: item.slug,
        link: item.link || item.url_extract,
        nombre: nombreProveedor(actualSid, item.fuente),
        activo: true,
        score: 100,
    });

    try {
        const res = await fetch("/api/buscar?q=" + encodeURIComponent(q), { cache: "no-store" });
        const data = await res.json();
        const results = data.resultados || data.results || [];
        for (const r of results) {
            if (!r) continue;
            const tipo = String(r.tipo || r.type || "");
            if (item.tipo === "Serie" && !/serie/i.test(tipo)) continue;
            if (item.tipo === "Anime" && !/anime/i.test(tipo)) continue;

            const sid = String(r.source_id || resolverSidFromResult(r) || "");
            const slug = r.slug || "";
            if (!sid || !slug) continue;

            const tituloR = normalizarTituloProveedor(r.nombre || r.titulo || r.title || slug);
            const score = scoreTituloProveedor(tituloBase, tituloR);
            // Debe parecer el mismo título (no "One Piece Film", "One Piece OVA", etc. sueltos)
            if (score < 55) continue;

            const prev = bySid.get(sid);
            const cand = {
                source_id: sid,
                slug,
                link: r.link || r.url_extract || r.url,
                nombre: nombreProveedor(sid, r.fuente || r.source),
                activo: false,
                score,
            };
            // Mismo source: quedarse con el mejor match de título
            if (!prev || score > (prev.score || 0)) {
                bySid.set(sid, cand);
            }
        }
    } catch (e) {
        console.warn("proveedores alternos:", e);
    }

    let lista = Array.from(bySid.values());

    // Series: solo tiene sentido 6 vs 3 (y similares). Anime: 4 vs otras.
    // Si tras dedupe solo hay 1 source, no mostrar switcher.
    lista.sort((a, b) => {
        const pa = ordenPrioridadProveedor(a.source_id, item.tipo);
        const pb = ordenPrioridadProveedor(b.source_id, item.tipo);
        if (pa !== pb) return pa - pb;
        return (b.score || 0) - (a.score || 0);
    });

    lista.forEach((p) => {
        p.activo = String(p.source_id) === actualSid && (!item.slug || p.slug === item.slug);
    });
    if (!lista.some((p) => p.activo) && lista.length) {
        const byS = lista.find((p) => String(p.source_id) === actualSid);
        if (byS) byS.activo = true;
        else lista[0].activo = true;
    }

    item._proveedores = lista;
    return lista;
}

function normalizarTituloProveedor(t) {
    return String(t || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(the|el|la|los|las|serie|season|temporada|anime|ova|movie|pelicula)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function scoreTituloProveedor(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 85;
    const ta = a.split(" ").filter(Boolean);
    const tb = new Set(b.split(" ").filter(Boolean));
    if (!ta.length) return 0;
    let hit = 0;
    for (const w of ta) if (tb.has(w)) hit++;
    return Math.round((hit / ta.length) * 100);
}

function resolverSidFromResult(r) {
    const u = String(r.url || r.link || r.url_extract || "");
    const m = u.match(/\/([1-6])\/(?:serie|anime|pelicula)\//i);
    if (m) return m[1];
    return r.source_id || "";
}

function resolverSidLocal(item) {
    const l = String(item.link || item.url_extract || "");
    const m = l.match(/\/([1-6])\/(?:serie|anime|pelicula)\//i);
    if (m) return m[1];
    return item.source_id || "";
}

function renderProveedorSwitcher(item) {
    const box = document.getElementById("mz-provider-switch");
    if (!box) return;
    // Anime: solo AnimeAV1 → no mostrar switcher de fuentes
    if (item && /anime/i.test(String(item.tipo || ""))) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
    }
    const list = item._proveedores || [];
    if (list.length < 2) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
    }
    box.classList.remove("hidden");
    box.innerHTML =
        `<span class="mz-prov-label">Fuente</span>` +
        list
            .map((p, i) => {
                const act = p.activo ? " active" : "";
                const sid = p.source_id || "";
                const slug = p.slug || "";
                const label = nombreProveedor(sid, p.fuente) || p.nombre || String(i + 1);
                return `<button type="button" class="mz-prov-btn${act}" data-sid="${sid}" data-slug="${slug}" title="Fuente ${label}">${label}</button>`;
            })
            .join("");

    box.querySelectorAll(".mz-prov-btn").forEach((btn) => {
        btn.onclick = async () => {
            const sid = btn.getAttribute("data-sid");
            const slug = btn.getAttribute("data-slug");
            await cambiarProveedor(item, { source_id: sid, slug });
        };
    });
}

async function cambiarProveedor(item, alt) {
    const box = document.getElementById("mz-provider-switch");
    const episodesContainer = document.getElementById("episodes-container");
    if (box) {
        box.querySelectorAll(".mz-prov-btn").forEach((b) => {
            b.disabled = true;
            b.style.opacity = "0.6";
        });
    }
    if (episodesContainer) {
      //  episodesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cambiando a ${nombreProveedor(alt.source_id)}…</p></div>`;
      // antes: Cambiando a ${nombreProveedor(alt.source_id)}…
      episodesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cambiando fuente…</p></div>`;
    }
    try {
        const params = new URLSearchParams();
        params.set("slug", alt.slug);
        params.set("source_id", String(alt.source_id));
        params.set("tipo", item.tipo || "Serie");
        if (alt.link) params.set("link", alt.link);
        const res = await fetch("/api/detalle?" + params.toString(), { cache: "no-store" });
        const data = await res.json();
        if (!data || data.error) throw new Error(data?.error || "No se pudo cargar");

        // Conservar nombre principal en español si el otro trae peor título
        const keepNombre = item.nombre;
        const keepOrig = item.titulo_original;
        Object.assign(item, data);
        if (keepNombre && (!item.nombre || item.nombre.length < 2)) item.nombre = keepNombre;
        if (keepOrig && !item.titulo_original) item.titulo_original = keepOrig;
        item.source_id = String(alt.source_id);
        item.slug = alt.slug;
        if (data.link) item.link = data.link;

        // Re-marcar proveedores
        if (Array.isArray(item._proveedores)) {
            item._proveedores.forEach((p) => {
                p.activo = String(p.source_id) === String(alt.source_id) && p.slug === alt.slug;
            });
            // Reordenar: doramasflix primero
            item._proveedores.sort(
                (a, b) => ordenPrioridadProveedor(a.source_id, item.tipo) - ordenPrioridadProveedor(b.source_id, item.tipo)
            );
        }

        seleccionActual = item;
        document.getElementById("details-title").textContent = item.nombre || item.titulo || "";
        // Portada del listado/búsqueda siempre
        {
          const p = window.__mzPortadaLista || item.portada;
          if (p) {
            item.portada = p;
            const el = document.getElementById("details-poster");
            if (el) el.src = p;
          }
        }

        document.getElementById("seasons-section")?.classList.remove("hidden");
        renderProveedorSwitcher(item);
        renderTemporadas(item);
    } catch (e) {
        console.error(e);
        if (episodesContainer) {
            episodesContainer.innerHTML = `<p style="color:var(--text-muted)">No se pudo cambiar de proveedor.</p>`;
        }
        alert("No se pudo cargar ese proveedor. Prueba Actualizar o el otro título en búsqueda.");
    } finally {
        if (box) {
            box.querySelectorAll(".mz-prov-btn").forEach((b) => {
                b.disabled = false;
                b.style.opacity = "";
            });
        }
    }
}


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


/** Cuenta de episodios declarada por la fuente para una temporada */
function countEpisodiosTemporadaRaw(raw) {
  if (raw == null) return 0;
  if (typeof raw === "number" && raw > 0) return raw;
  if (typeof raw !== "object") return 0;
  if (typeof raw.episodios === "number" && raw.episodios > 0) return raw.episodios;
  if (typeof raw.episodes === "number" && raw.episodes > 0) return raw.episodes;
  if (typeof raw.episodios_count === "number" && raw.episodios_count > 0) return raw.episodios_count;
  if (typeof raw.total === "number" && raw.total > 0) return raw.total;
  if (Array.isArray(raw.lista) && raw.lista.length) return raw.lista.length;
  if (Array.isArray(raw.episodios) && raw.episodios.length) return raw.episodios.length;
  if (Array.isArray(raw.episodes) && raw.episodes.length) return raw.episodes.length;
  return 0;
}

/**
 * Rango absoluto de números de episodio para una temporada
 * (T1: 1–12, T2: 13–24…) cuando la API mezcla todo en una lista.
 */
function rangoAbsolutoTemporada(item, seasonNum) {
  const season = Number(seasonNum) || 1;
  const listaTemp = typeof normalizarListaTemporadas === "function"
    ? normalizarListaTemporadas(item)
    : [];
  if (!listaTemp.length) return null;
  const rawAll = Array.isArray(item.temporadas_raw) && item.temporadas_raw.length
    ? item.temporadas_raw
    : (Array.isArray(item.temporadas) ? item.temporadas : []);

  let start = 1;
  for (let i = 0; i < listaTemp.length; i++) {
    const t = listaTemp[i];
    const raw =
      rawAll.find((x) => {
        if (x == null) return false;
        if (typeof x === "number" || typeof x === "string") return Number(x) === t.num;
        return Number(x.temporada || x.season || x.season_number || 0) === t.num;
      }) || null;

    let c = countEpisodiosTemporadaRaw(raw);
    if (!c && Array.isArray(t.episodios) && t.episodios.length) {
      // Si esta temp trae de más (p.ej. 24 en T1), no usar length como count
      // solo si es la única con lista o length razonable vs total
      c = t.episodios.length;
    }
    if (!c) c = 0;

    if (t.num === season) {
      if (c > 0) return { desde: start, hasta: start + c - 1, count: c };
      return null;
    }
    start += c;
  }
  return null;
}

/** Deja solo episodios de la temporada activa (por season o por rango absoluto) */
function filtrarEpisodiosDeTemporada(item, seasonNum, lista) {
  const season = Number(seasonNum) || 1;
  let eps = Array.isArray(lista) ? lista.slice() : [];
  if (!eps.length) return [];

  // AnimeAV1 y similares: cada temp trae lista[] con temporada + episodio relativos (1..12)
  const strict = eps.filter(function (ep) {
    if (!ep) return false;
    var s = ep.season != null ? Number(ep.season) : (ep.temporada != null ? Number(ep.temporada) : null);
    if (s == null || isNaN(s)) return false;
    return s === season;
  });
  if (strict.length) {
    return strict.map(function (ep, idx) {
      var num = Number(ep.episode || ep.episodio || ep.episode_number || (idx + 1)) || (idx + 1);
      return Object.assign({}, ep, {
        season: season,
        temporada: season,
        episode: num,
        episodio: num
      });
    });
  }

  // Sin tags de temporada: si multi-temp y hay count, recortar lista plana
  var listaTemp = typeof normalizarListaTemporadas === "function" ? normalizarListaTemporadas(item) : [];
  var multi = listaTemp.length > 1;
  if (multi) {
    var rango = rangoAbsolutoTemporada(item, season);
    if (rango && rango.count > 0) {
      var nums = eps.map(function (ep, idx) {
        return Number(ep.episode || ep.episodio || ep.episode_number || (idx + 1)) || 0;
      });
      var maxN = nums.length ? Math.max.apply(null, nums) : 0;
      if (maxN > rango.count || eps.length > rango.count) {
        // Numeración absoluta 1..24
        var byRange = eps.filter(function (ep, idx) {
          var n = Number(ep.episode || ep.episodio || ep.episode_number || (idx + 1)) || 0;
          return n >= rango.desde && n <= rango.hasta;
        });
        if (byRange.length) eps = byRange;
        else {
          var offset = rango.desde - 1;
          eps = eps.slice().sort(function (a, b) {
            return Number(a.episode || a.episodio || 0) - Number(b.episode || b.episodio || 0);
          }).slice(offset, offset + rango.count);
        }
      }
      // Cap al count declarado (12), sin inventar
      if (eps.length > rango.count) eps = eps.slice(0, rango.count);
    }
  }

  return eps.map(function (ep, idx) {
    var num = Number(ep.episode || ep.episodio || ep.episode_number || (idx + 1)) || (idx + 1);
    return Object.assign({}, ep, {
      season: season,
      temporada: season,
      episode: num,
      episodio: num
    });
  });
}




/** Si falla still de episodio (metahub "missing"), usar backdrop de la serie */
function mzEpBackdropFallback(item) {
  if (!item) return PLACEHOLDER;
  if (item.backdrop && /^https?:\/\//i.test(String(item.backdrop))) return String(item.backdrop);
  const imdb =
    item.imdb_id ||
    (item.imdb && (item.imdb.id || item.imdb.imdb_id)) ||
    null;
  if (imdb) {
    const tt = String(imdb).startsWith("tt") ? String(imdb) : "tt" + String(imdb);
    return "https://images.metahub.space/background/medium/" + tt + "/img";
  }
  return item.portada || PLACEHOLDER;
}
window.mzEpImgErr = function (img) {
  try {
    if (!img || img.dataset.mzFb === "1") {
      if (img) { img.onerror = null; img.style.opacity = "0.35"; }
      return;
    }
    img.dataset.mzFb = "1";
    const fb = img.getAttribute("data-fallback") || PLACEHOLDER;
    img.onerror = function () {
      this.onerror = null;
      this.src = PLACEHOLDER;
      this.style.opacity = "0.35";
    };
    img.src = fb;
  } catch (_) {}
};

/** Normaliza still/back_img de episodio (TMDB path → URL completa) */
function mzNormEpBackImg(u) {
  if (!u) return null;
  u = String(u).trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) {
    // Preferir w500 en TMDB si viene otra talla
    return u.replace(/\/t\/p\/w\d+\//i, "/t/p/w500/");
  }
  if (u.charAt(0) === "/") {
    return "https://image.tmdb.org/t/p/w500" + u;
  }
  return u;
}

/** Rellena back_img en episodios desde temporadas/lista (anime, series, doramas) */
function mzHydrateAnimeBackImg(item) {
  if (!item) return item;
  const byKey = new Map();
  const raws = []
    .concat(Array.isArray(item.temporadas_raw) ? item.temporadas_raw : [])
    .concat(Array.isArray(item.temporadas) ? item.temporadas.filter((t) => t && typeof t === "object") : []);
  for (const t of raws) {
    const lista = (t && (t.lista || (Array.isArray(t.episodios) ? t.episodios : null))) || [];
    if (!Array.isArray(lista)) continue;
    for (const ep of lista) {
      if (!ep || typeof ep !== "object") continue;
      const back = mzNormEpBackImg(
        ep.back_img || ep.screenshot || ep.still || ep.still_path || ep.imagen || ep.thumbnail || null
      );
      if (!back) continue;
      const s = Number(ep.temporada || ep.season || t.temporada || t.season || 1) || 1;
      const n = Number(ep.episodio || ep.episode || ep.episode_number || 0) || 0;
      if (n > 0) {
        byKey.set(s + ":" + n, back);
        byKey.set("1:" + n, back);
        byKey.set("n:" + n, back);
      }
    }
  }
  // También indexar episodios[] si ya traen back_img
  if (Array.isArray(item.episodios)) {
    for (const ep of item.episodios) {
      if (!ep) continue;
      const back = mzNormEpBackImg(
        ep.back_img || ep.screenshot || ep.still || ep.still_path || null
      );
      if (!back) continue;
      const s = Number(ep.season || ep.temporada || 1) || 1;
      const n = Number(ep.episode || ep.episodio || 0) || 0;
      if (n > 0) {
        byKey.set(s + ":" + n, back);
        byKey.set("n:" + n, back);
      }
    }
  }
  if (!byKey.size) return item;

  function paintEp(ep) {
    if (!ep || typeof ep !== "object") return ep;
    const s = Number(ep.season || ep.temporada || 1) || 1;
    const n = Number(ep.episode || ep.episodio || ep.episode_number || 0) || 0;
    const fromSelf = mzNormEpBackImg(
      ep.back_img || ep.screenshot || ep.still || ep.still_path || ep.imagen || null
    );
    const back =
      fromSelf ||
      (n > 0
        ? byKey.get(s + ":" + n) || byKey.get("1:" + n) || byKey.get("n:" + n) || byKey.get("2:" + n)
        : null);
    if (!back) return ep;
    if (ep.back_img === back) return ep;
    return Object.assign({}, ep, {
      back_img: back,
      still: ep.still || back,
      imagen: ep.imagen || back,
    });
  }

  if (Array.isArray(item.episodios)) {
    item.episodios = item.episodios.map(paintEp);
  }
  // Pintar también listas dentro de temporadas (detalle series/doramas)
  if (Array.isArray(item.temporadas)) {
    item.temporadas = item.temporadas.map(function (t) {
      if (!t || typeof t !== "object") return t;
      const out = Object.assign({}, t);
      if (Array.isArray(t.lista)) out.lista = t.lista.map(paintEp);
      if (Array.isArray(t.episodios)) out.episodios = t.episodios.map(paintEp);
      return out;
    });
  }
  if (Array.isArray(item.temporadas_raw)) {
    item.temporadas_raw = item.temporadas_raw.map(function (t) {
      if (!t || typeof t !== "object") return t;
      const out = Object.assign({}, t);
      if (Array.isArray(t.lista)) out.lista = t.lista.map(paintEp);
      if (Array.isArray(t.episodios)) out.episodios = t.episodios.map(paintEp);
      return out;
    });
  }

  // Series/doramas: si falta back_img y hay imdb → Metahub (mismo rol que anime screenshots)
  try {
    var imdbH = item.imdb_id || (item.imdb && item.imdb.id) || null;
    if (imdbH && /^tt\d+$/i.test(String(imdbH)) && Array.isArray(item.episodios)) {
      item.episodios = item.episodios.map(function (ep) {
        if (!ep || ep.back_img) return ep;
        var s = Number(ep.season || ep.temporada || 1) || 1;
        var n = Number(ep.episode || ep.episodio || ep.episode_number || 0) || 0;
        if (n < 1) return ep;
        var url = (item && item.backdrop) ? String(item.backdrop) : null;
        if (!url) return ep;
        return Object.assign({}, ep, { back_img: url, still: ep.still || url, imagen: ep.imagen || url });
      });
    }
  } catch (_) {}

  return item;
}


/** AnimeAV1: back_img real enumerado screenshots/{mediaId}/{ep}.jpg (vale para ep 1…1178 sin venir en API) */
function mzAv1BackImg(item, epNum) {
  if (!item) return null;
  const sid = String(item.source_id || "");
  const esAv1 = sid === "4" || /animeav1/i.test(String(item.fuente || item.source || ""));
  if (!esAv1) return null;
  const n = parseInt(epNum, 10) || 0;
  if (n < 1) return null;
  let mid = item._av1ShotId || item.animeav1_id || item.media_id || item.av1_id || null;
  if (!mid) {
    const port = String(item.portada_fuente_raw || item.portada || item.poster || "");
    let m = port.match(/cdn\.animeav1\.com\/covers\/(\d+)/i);
    if (!m) m = port.match(/animeav1\.com\/(?:covers|screenshots)\/(\d+)/i);
    if (m) mid = m[1];
  }
  if (!mid && Array.isArray(item.episodios)) {
    for (let i = 0; i < item.episodios.length; i++) {
      const b = item.episodios[i] && item.episodios[i].back_img;
      if (!b) continue;
      const mm = String(b).match(/cdn\.animeav1\.com\/screenshots\/(\d+)\//i);
      if (mm) { mid = mm[1]; break; }
    }
  }
  if (!mid) return null;
  item._av1ShotId = String(mid);
  return "https://cdn.animeav1.com/screenshots/" + mid + "/" + n + ".jpg";
}

function mzEpisodeThumb(episodio, item, num) {
  if (!episodio) episodio = {};
  const n = Number(num || episodio.episode || episodio.episodio || 0) || 0;
  let direct =
    episodio.back_img ||
    episodio.screenshot ||
    episodio.still ||
    episodio.still_path ||
    episodio.imagen ||
    episodio.image ||
    episodio.thumbnail ||
    null;
  if (direct && /episodes\.metahub\.space/i.test(String(direct))) direct = null;
  if (direct && typeof mzNormEpBackImg === "function") {
    direct = mzNormEpBackImg(direct);
  } else if (direct && String(direct).charAt(0) === "/") {
    direct = "https://image.tmdb.org/t/p/w500" + String(direct);
  }
  if (direct && /^https?:\/\//i.test(String(direct))) {
    try {
      const mm = String(direct).match(/cdn\.animeav1\.com\/screenshots\/(\d+)\//i);
      if (mm && item) item._av1ShotId = mm[1];
    } catch (_) {}
    return String(direct);
  }
  // Solo AnimeAV1 (source 4): screenshots deterministas
  const sid = String((item && item.source_id) || "");
  const esAv1 = sid === "4" || /animeav1/i.test(String((item && (item.fuente || item.source)) || ""));
  if (esAv1 && n > 0) {
    let mid = (item && (item._av1ShotId || item.animeav1_id || item.media_id || item.av1_id)) || null;
    if (!mid) {
      const port = String((item && (item.portada_fuente_raw || item.portada || item.poster || "")) || "");
      let m = port.match(/cdn\.animeav1\.com\/covers\/(\d+)/i);
      if (!m) m = port.match(/animeav1\.com\/(?:covers|screenshots)\/(\d+)/i);
      if (m) mid = m[1];
    }
    if (!mid && item && Array.isArray(item.episodios)) {
      for (let k = 0; k < item.episodios.length; k++) {
        const b = item.episodios[k] && item.episodios[k].back_img;
        if (!b) continue;
        const mm = String(b).match(/cdn\.animeav1\.com\/screenshots\/(\d+)\//i);
        if (mm) { mid = mm[1]; item._av1ShotId = mid; break; }
      }
    }
    if (mid) return "https://cdn.animeav1.com/screenshots/" + mid + "/" + n + ".jpg";
  }
  // Sin imagen de episodio → backdrop (JK y resto). NUNCA Metahub still.
  if (item && item.backdrop && /^https?:\/\//i.test(String(item.backdrop))) return String(item.backdrop);
  if (item && item.portada && /^https?:\/\//i.test(String(item.portada))) return String(item.portada);
  return null;
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
        if (raw0 && typeof raw0 === "object") {
            if (Array.isArray(raw0.lista) && raw0.lista.length) epsT1 = raw0.lista;
            else if (Array.isArray(raw0.episodios) && raw0.episodios.length) epsT1 = raw0.episodios;
        }
        // detalle a veces trae episodios[] plano y temporadas solo [1]
        if ((!epsT1 || !epsT1.length) && Array.isArray(item.episodios) && item.episodios.length) {
            epsT1 = item.episodios;
        }
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
        let countDecl = 0;
        if (typeof s === "number" || typeof s === "string") {
            num = parseInt(s, 10) || (i + 1);
        } else if (s && typeof s === "object") {
            num = parseInt(s.temporada || s.season_number || s.season || (i + 1), 10) || (i + 1);
            // AnimeAV1: lista[] = caps de ESTA temporada; episodios puede ser solo el número (12)
            if (Array.isArray(s.lista) && s.lista.length) episodios = s.lista;
            else if (Array.isArray(s.episodios) && s.episodios.length) episodios = s.episodios;
            else if (Array.isArray(s.episodes) && s.episodes.length) episodios = s.episodes;
            else episodios = null;
            if (typeof s.episodios === "number" && s.episodios > 0) countDecl = s.episodios;
            else if (typeof s.episodes === "number" && s.episodes > 0) countDecl = s.episodes;
            // Si lista trae de más respecto al count declarado, recortar
            if (episodios && countDecl > 0 && episodios.length > countDecl) {
                episodios = episodios.slice(0, countDecl);
            }
        } else {
            num = i + 1;
        }
        if (seen.has(num) || num < 1) return;
        seen.add(num);
        out.push({ num, episodios, count: countDecl || (episodios ? episodios.length : 0), fromTmdb: false });
    });
    if (Array.isArray(item.episodios) && item.episodios.length) {
        item.episodios.forEach((ep) => {
            const n = parseInt(ep.season || ep.temporada || 1, 10) || 1;
            if (n < 1 || seen.has(n)) return;
            seen.add(n);
            out.push({ num: n, episodios: null, fromTmdb: false });
        });
        out.sort((a, b) => a.num - b.num);
    }

    // Anime: no inventar temporadas con TMDB
    const esAnime = /anime/i.test(String(item.tipo || ""));
    if (esAnime) {
        out.sort((a, b) => a.num - b.num);
        return out.length ? out : [{ num: 1, episodios: null, fromTmdb: false }];
    }

    // 2) TMDB solo para series (no anime)
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
            still: ep.still || null,
            back_img: ep.back_img || ep.screenshot || null
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
function isMobileEpRangesUI() {
  try {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  } catch (_) {
    return typeof window !== "undefined" && window.innerWidth <= 768;
  }
}

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

/** Normaliza rangos del API a bloques de 50. Siempre cubre hasta total_episodios. */

async function refrescarTotalAnimeSiHaceFalta(item) {
    if (!item || item.tipo !== "Anime" || item._totalRefrescado) return;
    const total = totalEpisodiosReal(item);
    // Si no hay total o es típico "atascado" bajo, pedir force una vez
    if (total > 0 && total !== 403 && total !== 326 && total !== 1000) {
        // Igual refrescar si lleva tiempo sin sync (opcional: siempre en anime > 50)
        if (total < 50) return;
    }
    item._totalRefrescado = true;
    try {
        const params = new URLSearchParams();
        if (item.slug) params.set("slug", item.slug);
        params.set("source_id", String(item.source_id || ((typeof esItemJk === "function" && esItemJk(item)) || /jkanime/i.test(String(item.fuente||item.link||"")) ? "5" : "4")));
        params.set("tipo", "Anime");
        params.set("force", "1");
        if (item.link) params.set("link", item.link);
        const res = await fetch("/api/detalle?" + params.toString(), { cache: "no-store" });
        const data = await res.json();
        if (!data || data.error) return;
        const tNew = totalEpisodiosReal(data);
        const tOld = totalEpisodiosReal(item);
        if (tNew > tOld) {
            item.total_episodios = tNew;
            item.totalEpisodios = tNew;
            if (data.rangos_episodios) item.rangos_episodios = data.rangos_episodios;
            if (data.episodio_hasta) item.episodio_hasta = data.episodio_hasta;
            if (data.episodios && data.episodios.length > (item.episodios || []).length) {
                item.episodios = data.episodios;
            }
            // Re-pintar pestañas de rangos
            if (document.getElementById("seasons-section") && !document.getElementById("seasons-section").classList.contains("hidden")) {
                renderTemporadas(item);
            }
        }
    } catch (_) {}
}

function totalEpisodiosReal(item) {
  let total = parseInt(item.total_episodios || item.totalEpisodios || 0, 10) || 0;
  const hasta = parseInt(item.episodio_hasta || item.episode_hasta || 0, 10) || 0;
  if (hasta > total) total = hasta;

  const api = Array.isArray(item.rangos_episodios) ? item.rangos_episodios : [];
  for (let i = 0; i < api.length; i++) {
    const h = Number(api[i].hasta) || 0;
    if (h > total) total = h;
  }

  if (Array.isArray(item.episodios)) {
    for (const ep of item.episodios) {
      const n = Number(ep.episode || ep.episodio || ep.episode_number || 0) || 0;
      if (n > total) total = n;
    }
    if (item.episodios.length > total) total = item.episodios.length;
  }

  // animeav1: temporadas[{ episodios: 128, lista: [...] }]
  const raw = Array.isArray(item.temporadas_raw) && item.temporadas_raw.length
    ? item.temporadas_raw
    : (Array.isArray(item.temporadas) ? item.temporadas : []);
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (!t || typeof t !== "object") continue;
    if (typeof t.episodios === "number" && t.episodios > total) total = t.episodios;
    if (Array.isArray(t.lista) && t.lista.length > total) total = t.lista.length;
    if (Array.isArray(t.episodios) && t.episodios.length > total) total = t.episodios.length;
  }

  return total;
}

function normalizarRangosEpisodios(item) {
    const total = totalEpisodiosReal(item);
    if (total <= 50) return [];
    const api = Array.isArray(item.rangos_episodios) ? item.rangos_episodios : [];
    let maxHasta = 0;
    for (let i = 0; i < api.length; i++) {
        maxHasta = Math.max(maxHasta, Number(api[i].hasta) || 0);
    }
    // Solo confiar en rangos API si cubren el total REAL (no un total viejo de 403)
    if (api.length > 1 && maxHasta >= total - 2 && maxHasta >= total * 0.95) {
        const step0 = Number(api[0].hasta) - Number(api[0].desde) + 1;
        if (step0 > 0 && step0 <= 50) {
            return api.map(function (r) {
                const d = Number(r.desde) || 1;
                const h = Number(r.hasta) || d;
                return { desde: d, hasta: h, label: r.label || (d + " - " + h) };
            });
        }
    }
    // Reconstruir bloques de 50 hasta el total real
    return construirRangosEpisodios(total, 50);
}

function renderTemporadas(item) {
    const tabsContainer = document.getElementById("seasons-tabs-container");
    const listaTemp = normalizarListaTemporadas(item);
    const totalEps = parseInt(item.total_episodios || item.totalEpisodios || 0, 10)
        || (Array.isArray(item.episodios) ? item.episodios.length : 0);
    const rangos = normalizarRangosEpisodios(item);
    const totalReal = typeof totalEpisodiosReal === "function" ? totalEpisodiosReal(item) : (parseInt(item.total_episodios || 0, 10) || 0);
    // 1 temporada (o lista colapsada) + muchos episodios → pestañas 1 - 50, 51 - 100…
    // También si hay >50 eps y solo una temp real en fuente
    const usarRangosComoTabs =
        rangos.length > 1 &&
        (listaTemp.length <= 1 || totalReal > 50 && listaTemp.length <= 1);

    if (usarRangosComoTabs) {
        if (!item._epRangoActivo) {
            item._epRangoActivo = { desde: rangos[0].desde, hasta: rangos[0].hasta };
        }
        // UI de rangos "1 - 50" solo móvil; en PC se mantiene el markup anterior
        const mobile = typeof isMobileEpRangesUI === "function" && isMobileEpRangesUI();
        if (mobile) {
            const h4 = document.querySelector("#seasons-section > h4");
            if (h4) h4.textContent = "Episodios";
            tabsContainer.className = "seasons-tabs mz-ep-range-tabs";
            tabsContainer.innerHTML = rangos.map((r, i) => {
                const act = item._epRangoActivo
                    && item._epRangoActivo.desde === r.desde
                    && item._epRangoActivo.hasta === r.hasta;
                const lab = r.label || (r.desde + " - " + r.hasta);
                return `<button type="button" class="season-tab mz-ep-range-tab${act || (!item._epRangoActivo && i === 0) ? " active" : ""}" data-range-from="${r.desde}" data-range-to="${r.hasta}" aria-label="Episodios ${lab}">${lab}</button>`;
            }).join("");
        } else {
            tabsContainer.className = "seasons-tabs";
            tabsContainer.innerHTML = rangos.map((r, i) => {
                const act = item._epRangoActivo
                    && item._epRangoActivo.desde === r.desde
                    && item._epRangoActivo.hasta === r.hasta;
                return `<button class="season-tab${act || (!item._epRangoActivo && i === 0) ? " active" : ""}" data-range-from="${r.desde}" data-range-to="${r.hasta}">${r.label || (r.desde + "–" + r.hasta)}</button>`;
            }).join("");
        }
    } else {
        tabsContainer.className = "seasons-tabs";
        tabsContainer.innerHTML = listaTemp.map((t, i) =>
            `<button class="season-tab${i === 0 ? " active" : ""}" data-season="${t.num}">Temporada ${t.num}</button>`
        ).join("");
    }

    try { mzHydrateAnimeBackImg(item); } catch (_) {}
    const loadSeason = async (season, rangoForzado) => {
        const _gen = (item._loadSeasonGen = (item._loadSeasonGen || 0) + 1);

        const seasonNum = parseInt(season, 10) || 1;
        const episodesContainer = document.getElementById("episodes-container");
        episodesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando episodios...</p></div>`;

        if (rangoForzado) {
            item._epRangoActivo = { desde: rangoForzado.desde, hasta: rangoForzado.hasta };
        }

        // Si la fuente ya trajo episodios en temporadas[], usarlos (animeav1)
        const localT = listaTemp.find(t => t.num === seasonNum);
        const totalRealPre = typeof totalEpisodiosReal === "function" ? totalEpisodiosReal(item) : 0;
        const localHasBack = !!(
          localT &&
          Array.isArray(localT.episodios) &&
          localT.episodios.some(function (e) {
            return e && (e.back_img || e.screenshot || e.still || e.still_path || e.imagen || e.thumbnail);
          })
        );
        const localCorta =
          localT &&
          Array.isArray(localT.episodios) &&
          localT.episodios.length &&
          totalRealPre > 0 &&
          localT.episodios.length + 2 < totalRealPre &&
          !localHasBack; // si trae back_img, no descartar

        // Usar lista local si tiene caps (prioridad si traen back_img)
        if (localT && Array.isArray(localT.episodios) && localT.episodios.length && (!localCorta || localHasBack || localT.episodios.some(function(e){ return e && (e.back_img || e.still); }))) {
            const tmdbEps = (() => {
                const ts = (item.temporadas_tmdb || []).find(t =>
                    Number(t.season_number || t.temporada) === Number(seasonNum)
                );
                return Array.isArray(ts?.episodios) ? ts.episodios : [];
            })();
            let mapped = localT.episodios.map((ep, idx) => {
                const num = Number(ep.episodio || ep.episode || ep.episode_number || (idx + 1)) || (idx + 1);
                const meta = tmdbEps.find(t => Number(t.episode_number || t.episodio) === Number(num));
                let back =
                    ep.back_img ||
                    ep.screenshot ||
                    ep.still ||
                    ep.still_path ||
                    meta?.still_path ||
                    meta?.still ||
                    (typeof mzEpisodeThumb === "function"
                      ? mzEpisodeThumb(ep, item, num)
                      : null);
                if (back && typeof mzNormEpBackImg === "function") back = mzNormEpBackImg(back);
                else if (back && String(back).charAt(0) === "/") {
                  back = "https://image.tmdb.org/t/p/w500" + String(back);
                }
                return {
                    season: seasonNum,
                    temporada: seasonNum,
                    episode: num,
                    episodio: num,
                    nombre: meta?.name || ep.titulo || ep.nombre || ep.name || ("Episodio " + num),
                    embeds: ep.embeds || ep.reproductores || [],
                    video: (() => {
                        const v = ep.video || ep.reproductor || null;
                        if (v && !esUrlApiWorker(v) && !esEmbedInvalido(v)) return v;
                        return null;
                    })(),
                    link: ep.link || null,
                    source_id: ep.source_id || item.source_id,
                    back_img: back,
                    still: ep.still || back,
                    imagen: ep.imagen || ep.image || back,
                    image: ep.image || back,
                    thumbnail: ep.thumbnail || back,
                    portada: ep.portada || back
                };
            });
            // Filtrar por rango activo (1-50, 51-100… 1001+) sin perder back_img
            const rango = rangoForzado || item._epRangoActivo;
            if (rango && rango.desde && rango.hasta) {
                mapped = mapped.filter((ep) => {
                    const n = Number(ep.episode || ep.episodio || 0);
                    return n >= rango.desde && n <= rango.hasta;
                });
                item._epRangoActivo = { desde: rango.desde, hasta: rango.hasta };
                // Si el API solo traía 1–50 y pedimos 1001+, rellenar stubs del rango
                // Siempre completar el rango completo (evita 1151–1178 con huecos por race)
                {
                  const byN = new Map(mapped.map(function (e) {
                    return [Number(e.episode || e.episodio || 0), e];
                  }));
                  const filled = [];
                  for (let n = rango.desde; n <= rango.hasta; n++) {
                    if (byN.has(n)) filled.push(byN.get(n));
                    else {
                      const stub = {
                        season: seasonNum,
                        temporada: seasonNum,
                        episode: n,
                        episodio: n,
                        nombre: "Episodio " + n,
                        embeds: [],
                        video: null
                      };
                      const av1 = typeof mzAv1BackImg === "function" ? mzAv1BackImg(item, n) : null;
                      if (av1) { stub.back_img = av1; stub.still = av1; stub.imagen = av1; }
                      else if (item && item.backdrop) stub.back_img = item.backdrop;
                      filled.push(stub);
                    }
                  }
                  mapped = filled;
                }
            }
            item.episodios = filtrarEpisodiosDeTemporada(item, seasonNum, mapped);
            // Cache animeav1 screenshot id
            try {
              for (const e of item.episodios || []) {
                if (e && e.back_img) {
                  const mm = String(e.back_img).match(/cdn\.animeav1\.com\/screenshots\/(\d+)\//i);
                  if (mm) { item._av1ShotId = mm[1]; break; }
                }
              }
            } catch (_) {}
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
            let epsApi = Array.isArray(data.episodios) ? data.episodios : [];
            // Si la API trae varias temporadas mezcladas, quedarnos solo con la pedida
            const tagged = epsApi.some((e) => e && (e.season != null || e.temporada != null));
            if (tagged) {
                epsApi = epsApi.filter((e) => Number(e.season || e.temporada || 1) === seasonNum);
            }
            item.episodios = epsApi.map((ep, idx) => {
                const num = Number(ep.episode || ep.episodio || ep.episode_number || (idx + 1)) || (idx + 1);
                return Object.assign({}, ep, {
                    season: seasonNum,
                    temporada: seasonNum,
                    episode: num,
                    episodio: num,
                    nombre: ep.nombre || ep.titulo || ep.name || ("Episodio " + num),
                    embeds: ep.embeds || ep.reproductores || [],
                    link: ep.link || null,
                    source_id: ep.source_id || item.source_id,
                    back_img: (typeof mzNormEpBackImg === "function"
                      ? mzNormEpBackImg(ep.back_img || ep.screenshot || ep.still || ep.still_path || null)
                      : (ep.back_img || ep.screenshot || ep.still || null)),
                    still: ep.still || ep.back_img || null,
                    imagen: ep.imagen || ep.image || ep.back_img || null
                });
            });
            item.episodios = filtrarEpisodiosDeTemporada(item, seasonNum, item.episodios);
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
            // NO expandir a total_episodios (24) en multi-temp: solo lo de esta temporada
            const multiTemp = (listaTemp && listaTemp.length > 1);
            if (item._epRangoActivo) {
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
            } else if (!multiTemp && totalEp > (item.episodios || []).length) {
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
            item.episodios = filtrarEpisodiosDeTemporada(item, seasonNum, item.episodios || []);
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
    try { mzHydrateAnimeBackImg(item); } catch (_) {}
    // Mapear back_img desde temporadas[].lista por T/E (series/doramas)
    try {
      var mapBack = Object.create(null);
      function addMap(ep, tFallback) {
        if (!ep) return;
        var s = Number(ep.temporada || ep.season || tFallback || 1) || 1;
        var n = Number(ep.episodio || ep.episode || ep.episode_number || 0) || 0;
        var b = ep.back_img || ep.screenshot || ep.still || ep.still_path || ep.imagen || ep.thumbnail || null;
        if (b && typeof mzNormEpBackImg === "function") b = mzNormEpBackImg(b);
        if (!b || !n) return;
        mapBack[s + ":" + n] = b;
        mapBack["n:" + n] = b;
      }
      var temps = [].concat(item.temporadas_raw || [], item.temporadas || []);
      for (var ti = 0; ti < temps.length; ti++) {
        var t = temps[ti];
        if (!t || typeof t !== "object") continue;
        var tn = Number(t.temporada || t.season || t.num || 1) || 1;
        var listaMap = t.lista || (Array.isArray(t.episodios) ? t.episodios : null) || [];
        if (!Array.isArray(listaMap)) continue;
        for (var li = 0; li < listaMap.length; li++) addMap(listaMap[li], tn);
      }
      if (Array.isArray(item.episodios)) {
        item.episodios = item.episodios.map(function (ep) {
          if (!ep) return ep;
          var s = Number(ep.season || ep.temporada || season || 1) || 1;
          var n = Number(ep.episode || ep.episodio || 0) || 0;
          var b = ep.back_img || mapBack[s + ":" + n] || mapBack["n:" + n] || null;
          if (b && typeof mzNormEpBackImg === "function") b = mzNormEpBackImg(b);
          if (!b) return ep;
          return Object.assign({}, ep, { back_img: b, still: ep.still || b, imagen: ep.imagen || b });
        });
      }
    } catch (_) {}
    // 1) Descubrir shot id de CUALQUIER fuente (lista completa, no solo el rango visible)
    try {
      if (item && !item._av1ShotId) {
        const pool = []
          .concat(Array.isArray(item.episodios) ? item.episodios : [])
          .concat(
            (Array.isArray(item.temporadas_raw) ? item.temporadas_raw : []).flatMap(function (t) {
              return (t && Array.isArray(t.lista) && t.lista) ||
                (t && Array.isArray(t.episodios) && t.episodios) ||
                [];
            })
          );
        for (let i = 0; i < pool.length; i++) {
          const b = pool[i] && (pool[i].back_img || pool[i].screenshot);
          if (!b) continue;
          const mm = String(b).match(/cdn\.animeav1\.com\/screenshots\/(\d+)\//i);
          if (mm) {
            item._av1ShotId = mm[1];
            break;
          }
        }
      }
    } catch (_) {}
    // 2) Forzar back_img en cada ep del rango (usar id si falta)
    try {
      if (Array.isArray(item.episodios)) {
        item.episodios = item.episodios.map(function (ep) {
          if (!ep) return ep;
          const n = Number(ep.episode || ep.episodio || 0) || 0;
          let b = ep.back_img || ep.screenshot || ep.still || null;
          if (!b && item._av1ShotId && n > 0 && String(item.source_id || "") === "4") {
            b = "https://cdn.animeav1.com/screenshots/" + item._av1ShotId + "/" + n + ".jpg";
          }
          // Sin Metahub still: backdrop si falta
          if (!b && item && item.backdrop && /^https?:\/\//i.test(String(item.backdrop))) {
            b = String(item.backdrop);
          } else if (!b && item && item.portada) {
            b = String(item.portada);
          }
          if (!b && typeof mzEpisodeThumb === "function") {
            b = mzEpisodeThumb(ep, item, n);
          }
          if (!b) return ep;
          return Object.assign({}, ep, { back_img: b, still: ep.still || b });
        });
      }
    } catch (_) {}
    const episodesContainer = document.getElementById("episodes-container");
    episodesContainer.innerHTML = "";
    item._seasonActiva = season;
    initEpOrderUi(item);
    actualizarBotonNotify(item);

    const totalEps = parseInt(item.total_episodios || item.totalEpisodios || 0, 10)
        || (Array.isArray(item.episodios) ? item.episodios.length : 0);

    // Rangos en bloques de 50 (One Piece, etc.)
    let rangos = normalizarRangosEpisodios(item);
    // Si los tabs de temporada YA muestran rangos, no duplicar barra aquí
    const tabsContainer = document.getElementById("seasons-tabs-container");
    const tabsSonRangos = !!(tabsContainer && tabsContainer.querySelector("[data-range-from]"));

    // Multi-temporada real corta (T1/T2): no rangos One Piece
    // Si hay rangos 1-50 (anime largo 1 temp), SÍ usar _epRangoActivo
    const multiTemporadasUI = (typeof normalizarListaTemporadas === "function"
      && normalizarListaTemporadas(item).length > 1
      && rangos.length <= 1);
    if (multiTemporadasUI) {
        item._epRangoActivo = null;
    } else if (!item._epRangoActivo && rangos.length > 1) {
        item._epRangoActivo = { desde: rangos[0].desde, hasta: rangos[0].hasta };
    }
    const rango = multiTemporadasUI ? null : (item._epRangoActivo || null);

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
            b.textContent = r.label || `${r.desde} - ${r.hasta}`;
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
                    qs.set("source_id", String(item.source_id || ((typeof esItemJk === "function" && esItemJk(item)) || /jkanime/i.test(String(item.fuente||item.link||"")) ? "5" : "4")));
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

    let lista = ordenarEpisodiosParaUI(item, Array.isArray(item.episodios) ? item.episodios : []);
    const seasonNum = Number(season) || 1;
    // Solo la temporada activa (campo season o rango absoluto T1 1–12 / T2 13–24)
    lista = filtrarEpisodiosDeTemporada(item, seasonNum, lista);

    // Rango activo (One Piece 1–50, 51–100… 1151–1178)
    let rangoAct = rango || item._epRangoActivo || null;
    const totalReal = (typeof totalEpisodiosReal === "function" ? totalEpisodiosReal(item) : 0)
      || parseInt(item.total_episodios || item.totalEpisodios || totalEps || 0, 10) || 0;
    if (!rangoAct && totalReal > 50) {
      try {
        const rs = typeof normalizarRangosEpisodios === "function" ? normalizarRangosEpisodios(item) : [];
        if (rs && rs.length) {
          rangoAct = rs[0];
          item._epRangoActivo = { desde: rs[0].desde, hasta: rs[0].hasta };
        }
      } catch (_) {}
    }

    // Filtrar por rango activo si aplica
    if (rangoAct && lista.length) {
        lista = lista.filter((ep, idx) => {
            const n = episodioNumero(ep, idx);
            return n >= rangoAct.desde && n <= rangoAct.hasta;
        });
    }

    // Si el rango no está en item.episodios (ej. 1001–1050 con lista solo 1–50) → stubs
    if ((!lista || !lista.length) && totalReal > 0) {
        const desde = rangoAct && rangoAct.desde ? rangoAct.desde : 1;
        const hasta = rangoAct && rangoAct.hasta
          ? rangoAct.hasta
          : Math.min(50, totalReal);
        lista = [];
        for (let n = desde; n <= hasta && n <= totalReal; n++) {
            const stub = {
              season: seasonNum,
              temporada: seasonNum,
              episode: n,
              episodio: n,
              nombre: "Episodio " + n,
              embeds: [],
              video: null
            };
            // AV1: imagen real enumerada aunque no venga en los 50 de la API
            const av1 = typeof mzAv1BackImg === "function" ? mzAv1BackImg(item, n) : null;
            if (av1) {
              stub.back_img = av1;
              stub.still = av1;
              stub.imagen = av1;
            } else if (item && item.backdrop) {
              stub.back_img = item.backdrop;
            }
            lista.push(stub);
        }
        // Guardar en item para clicks posteriores
        try {
          const byN = new Map((item.episodios || []).map(function (e) {
            return [Number(e.episode || e.episodio || 0), e];
          }));
          lista.forEach(function (ep) {
            if (!byN.has(ep.episode)) byN.set(ep.episode, ep);
          });
          item.episodios = Array.from(byN.values());
        } catch (_) {}
    }

    if (!lista || lista.length === 0) {
        const msg = document.createElement("p");
        msg.style.color = "var(--text-muted)";
        msg.textContent = totalReal
            ? ("Hay " + totalReal + " episodios. Elige un rango arriba (1–50, 51–100…).")
            : "No hay episodios en esta temporada.";
        episodesContainer.appendChild(msg);
        return;
    }
    checkNuevoCapitulo(item);
    // Móvil: rejilla de números [1][2]… sin imágenes
    const mobileNums =
      document.body.classList.contains("mz-mobile-ep-playing") &&
      typeof isMobileEpRangesUI === "function" && isMobileEpRangesUI() &&
      typeof isSerieOrAnime === "function" && isSerieOrAnime(item);
    if (mobileNums) {
      episodesContainer.classList.add("mz-ep-num-grid");
      episodesContainer.classList.remove("episodes-grid");
    } else {
      episodesContainer.classList.remove("mz-ep-num-grid");
      if (!episodesContainer.classList.contains("episodes-grid")) {
        episodesContainer.classList.add("episodes-grid");
      }
    }
    lista.forEach((episodio, index) => {
        const tieneVideo = Boolean(episodio.video) || (Array.isArray(episodio.embeds) && episodio.embeds.length > 0);
        const btn = document.createElement("button");
        const num = episodioNumero(episodio, index);
        const epNombre = episodio.nombre || `Episodio ${num}`;
        const epPlaying = document.body.classList.contains("mz-mobile-ep-playing");
        const serieCards = typeof isSerieOrAnime === "function" && isSerieOrAnime(item);
        const isPc = typeof isKoiDesktop === "function" && isKoiDesktop();
        const koiCards = isPc && serieCards;
        const mobileCards = !isPc && serieCards && !epPlaying;
        btn.className =
          "episode-btn" +
          (index === 0 ? " active" : "") +
          (koiCards ? " koi-ep-card" : "") +
          (mobileCards ? " mz-mobile-ep-card" : "") +
          (epPlaying ? " mz-ep-num-btn" : "");
        btn.title = epNombre;
        btn.setAttribute("data-ep", String(num));
        if (epPlaying) {
            btn.textContent = String(num);
        } else if (mobileCards) {
            let thumb =
              episodio.back_img ||
              episodio.screenshot ||
              episodio.still ||
              episodio.still_path ||
              (typeof mzEpisodeThumb === "function" ? mzEpisodeThumb(episodio, item, num) : null);
            if (thumb && typeof mzNormEpBackImg === "function") thumb = mzNormEpBackImg(thumb);
            if (!thumb && typeof mzAv1BackImg === "function") {
              thumb = mzAv1BackImg(item, num);
            }
            if (!thumb) thumb = PLACEHOLDER;
            const sLab = Number(episodio.season || episodio.temporada || season || 1) || 1;
            const fbThumb = mzEpBackdropFallback(item);
            btn.innerHTML =
              '<span class="mz-mep-thumb"><img src="' + String(thumb).replace(/"/g, "") +
              '" alt="" loading="lazy" decoding="async" data-fallback="' + String(fbThumb).replace(/"/g, "") +
              '" onerror="window.mzEpImgErr&&window.mzEpImgErr(this)"/></span>' +
              '<span class="mz-mep-label">T' + sLab + " • E" + num + "</span>";
        } else if (koiCards) {
            let thumb =
              episodio.back_img ||
              episodio.still ||
              episodio.still_path ||
              (typeof mzEpisodeThumb === "function" ? mzEpisodeThumb(episodio, item, num) : null) ||
              PLACEHOLDER;
            if (thumb && thumb !== PLACEHOLDER && typeof mzNormEpBackImg === "function") {
              thumb = mzNormEpBackImg(thumb);
            }
            const dur = episodio.duracion || episodio.runtime || "";
            let labelName = String(epNombre || "").replace(/</g, "");
            if (!labelName || /^T\d+E\d+$/i.test(labelName) || labelName === String(num)) {
              labelName = "Episodio " + num;
            }
            const safeSeries = String(item.nombre || item.titulo || "").replace(/</g, "");
            const sLab = Number(episodio.season || episodio.temporada || season || 1) || 1;
            const fbThumb2 = mzEpBackdropFallback(item);
            btn.innerHTML =
              '<span class="koi-ep-thumb"><img src="' + String(thumb).replace(/"/g, "") +
              '" alt="" loading="lazy" data-fallback="' + String(fbThumb2).replace(/"/g, "") +
              '" onerror="window.mzEpImgErr&&window.mzEpImgErr(this)"/>' +
              '<span class="koi-ep-dur">' + (dur || ("E" + num)) + "</span></span>" +
              '<span class="koi-ep-meta"><span class="koi-ep-series">' + safeSeries +
              '</span><span class="koi-ep-name">T' + sLab + " · " + labelName + "</span></span>";
        } else {
            btn.textContent = num;
        }

        if (!tieneVideo) btn.style.opacity = "0.55";

        btn.addEventListener("click", async () => {
            episodesContainer.querySelectorAll(".episode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            // Número real del episodio (no el index del rango filtrado)
            const epNum = Number(episodio.episode || episodio.episodio || episodio.episode_number || episodioNumero(episodio, index)) || 1;
            // Temporada de la pestaña activa (evita pedir T1 cuando el ep no trae season)
            const seasonNum = Number(
                item._seasonActiva ||
                episodio.season ||
                episodio.temporada ||
                season ||
                1
            ) || 1;
            episodio.season = seasonNum;
            episodio.temporada = seasonNum;
            episodio.episode = epNum;
            episodio.episodio = epNum;
          {
            const pc =
              (typeof isKoiDesktop === "function" && isKoiDesktop()) ||
              window.innerWidth >= 1025;
            const serie =
              (typeof isSerieOrAnime === "function" && isSerieOrAnime(item)) ||
              /serie|anime|dorama|tv|ova|ona/i.test(String(item?.tipo || item?.type || ""));

            // URL + misma vista que al recargar /detalle/slug/t/e (tipo película Koi)
            try {
              if (typeof mzPushDetalleUrl === "function") {
                mzPushDetalleUrl(item, seasonNum, epNum);
              }
            } catch (_) {}

            if (serie && typeof window.mzKoiOpenEpisode === "function") {
              window.__mzForceAutoPlay = false;
              try {
                await window.mzKoiOpenEpisode(item, episodio, seasonNum, epNum);
              } catch (eK) {
                console.error("mzKoiOpenEpisode", eK);
              }
              return;
            }
            // Fallback móvil si Koi no está
            if (!pc && serie && typeof abrirVistaMovilEpisodio === "function") {
              window.__mzForceAutoPlay = false;
              await abrirVistaMovilEpisodio(item, episodio, seasonNum, epNum);
              return;
            }
          }

            document.getElementById("details-title").textContent =
                `${item.nombre} - ${episodio.nombre || "Episodio " + epNum}`;
            try {
              setKoiPlayerEpisodeTitle(`T${seasonNum || 1} · ${episodio.nombre || "Episodio " + epNum}`);
              document.body.classList.add("player-open");
            } catch (_) {}

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
                // Auto: Latino → Sub → resolve primero (sin elegir servidor a mano)
                // Siempre pasar por reproducirCapituloAuto (ahí se bloquea autoplay en koi)
                await reproducirCapituloAuto(item, episodio, seasonNum, epNum);
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
                // Respetar fuente del item (JK=5 / AV1=4); no forzar AV1
                let sidCap = item.source_id != null && item.source_id !== "" ? String(item.source_id) : "";
                if (!sidCap && typeof esItemJk === "function" && esItemJk(item)) sidCap = "5";
                if (!sidCap && /jkanime/i.test(String(item.fuente || item.link || ""))) sidCap = "5";
                if (sidCap) params.set("source_id", sidCap);
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
                    // JK (fuente 5): SOLO JKPlayer, sin lista de reproductores
                    if (esAnimeJk(item)) {
                      const pack = validos.length ? validos : (episodio.embeds || []);
                      const jk = pickJkPlayer(pack);
                      try {
                        const ss = document.getElementById("servers-section");
                        if (ss) {
                          ss.classList.add("hidden");
                          ss.style.setProperty("display", "none", "important");
                        }
                        if (serversContainer) {
                          serversContainer.innerHTML = "";
                        }
                      } catch (_) {}
                      if (jk && typeof reproducir === "function") {
                        try {
                          await reproducir(jk, item);
                        } catch (eJk) {
                          console.warn("JKPlayer auto", eJk);
                        }
                      }
                    } else {
                      try {
                        const ss = document.getElementById("servers-section");
                        if (ss) ss.style.removeProperty("display");
                      } catch (_) {}
                      renderServidoresYDescargas(
                          validos.length ? validos : episodio.embeds,
                          episodio.downloads,
                          episodio.video,
                          item,
                          { expandido: true }
                      );
                    }
                    expandirServidores();
                    await reproducirCapituloAuto(item, episodio, seasonNum, epNum);
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


function asegurarOverlayPlayer() {
  const vc = document.getElementById("video-player-container");
  if (!vc) return null;
  let ov = document.getElementById("mz-player-overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "mz-player-overlay";
    ov.className = "mz-player-overlay hidden";
    ov.innerHTML = '<div class="mz-player-overlay-box"><div class="mz-player-overlay-spin"></div><p class="mz-player-overlay-text"></p></div>';
    vc.style.position = vc.style.position || "relative";
    vc.appendChild(ov);
  }
  return ov;
}

function mostrarOverlayPlayer(texto) {
  const ov = asegurarOverlayPlayer();
  if (!ov) return;
  const t = ov.querySelector(".mz-player-overlay-text");
  if (t) t.textContent = texto || "Resolviendo servidor…";
  ov.classList.remove("hidden", "is-error");
}

function ocultarOverlayPlayer() {
  document.getElementById("mz-player-overlay")?.classList.add("hidden");
}

function mostrarErrorPlayer(texto) {
  const ov = asegurarOverlayPlayer();
  if (!ov) return;
  const t = ov.querySelector(".mz-player-overlay-text");
  if (t) t.textContent = texto || "No se pudo cargar";
  ov.classList.add("is-error");
  ov.classList.remove("hidden");
  try {
    const pt = document.getElementById("player-title");
    if (pt) pt.textContent = texto || "Error";
  } catch (_) {}
}

// ---------- Servidores y descargas ----------
async function reproducir(embed, item) {
    if (!embed?.url && !embed?.stream_url) return;

    // Directos: NO ADS, __directHls, o stream_url del worker (móvil series/anime)
    const _isWorkerStream = (url) => {
      if (!url) return false;
      const u = String(url).toLowerCase();
      if (!/workers\.dev/i.test(u)) return false;
      return /\/(wish|voe|vidhide|goodstream|resolve|streamurl)\b/i.test(u) || /[?&]url=/.test(u);
    };
    // Solo Directos / NO ADS explícitos (no por stream_url de un VOE normal)
    const esDirectoExplicito = !!(
      embed.noAds ||
      embed.__directHls ||
      embed.__forceDirect ||
      embed.server === "NO ADS" ||
      embed.name === "NO ADS" ||
      embed.server === "Directo" ||
      /directo/i.test(String(embed.tipo || ""))
    );
    if (esDirectoExplicito) {
        try {
            const esNoAds = !!(embed.noAds || embed.server === "NO ADS" || embed.name === "NO ADS");
            playerTitle.textContent = esNoAds
              ? "Cargando NO ADS..."
              : "Resolviendo servidor…";
            videoContainer.classList.remove("hidden");
            mostrarOverlayPlayer(esNoAds ? "Cargando NO ADS..." : "Resolviendo servidor…");
          
            if (!embed.stream_url && embed.hls_resolve) {
              embed = { ...embed, stream_url: embed.hls_resolve };
            }
            if (!embed.stream_url && typeof streamUrlParaNoAds === "function") {
              embed = {
                ...embed,
                stream_url: streamUrlParaNoAds(embed.url || embed.sourceEmbed)
              };
            }
            const playUrl = await resolverPlayUrlNoAds(embed);
            await reproducirHlsNoAds(playUrl, item);
            ocultarOverlayPlayer();
        } catch (err) {
            console.error("Directo HLS:", err);
            ocultarOverlayPlayer();
            mostrarErrorPlayer("No se pudo cargar este directo. Prueba otro servidor.");
            return;
        }
        // Si el video HLS quedó visible, no abrir iframe
        try {
          const vid = document.getElementById("player-video");
          if (vid && !vid.classList.contains("hidden")) return;
        } catch (_) {}
        if (embed.noAds || embed.server === "NO ADS" || embed.name === "NO ADS") return;
        // Serie/anime: no seguir a iframe aunque haya url
        if (item && /serie|anime|dorama|tv|ova|ona/i.test(String(item.tipo || item.type || ""))) return;
        if (embed.__directHls && !embed.url) return;
        if (embed.__directHls && embed.url) {
          // película: respaldo iframe
        } else {
          return;
        }
    }

    destruirHls();
    mostrarBotonFullscreen(false);
    videoContainer.classList.remove("hidden");
    playerIframe.src = embed.url;
    playerTitle.textContent = (item?.nombre || "Reproduciendo...")
        .split(" ").map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(" ");
    iniciarSeguimientoProgreso(item || seleccionActual);
    document.body.classList.add("player-open", "details-open");
    if (isKoiDesktop()) document.body.classList.add("koi-desktop");
    try {
      const it = item || (typeof seleccionActual !== "undefined" ? seleccionActual : null);
      if (it && /pel[ií]cula|movie|film/i.test(String(it.tipo || it.type || ""))) {
        document.body.classList.add("koi-movie");
        // Player se queda ABAJO (donde está en el HTML); solo asegurar scroll del panel
        const db = document.querySelector("#details-panel .details-body");
        if (db) {
          db.style.overflowY = "auto";
          db.style.minHeight = "0";
        }
      } else if (it && isKoiDesktop()) {
        // Series/anime: al elegir servidor, ir al cuadro del player
        requestAnimationFrame(() => {
          const vc = document.getElementById("video-player-container");
          if (vc) {
            vc.classList.remove("hidden");
            mzScrollPanelTo(vc);
          }
        });
        setTimeout(() => {
          const vc = document.getElementById("video-player-container");
          if (vc) mzScrollPanelTo(vc);
        }, 200);
      }
    } catch (_) {}
    try {
      const ctx = typeof _epPlayCtx !== "undefined" ? _epPlayCtx : null;
      const epNum = ctx?.ep || ctx?.episodio || "";
      const label = epNum ? `E${epNum} - Episodio ${epNum}` : (playerTitle?.textContent || "");
      setKoiPlayerEpisodeTitle(label);
    } catch (_) {}
    const scrollPlayer = () => {
      try {
        const vc = document.getElementById("video-player-container") || videoContainer;
        if (!vc) return;
        vc.classList.remove("hidden");
        // Overlay sobre el iframe: captura rueda (el iframe no burbujea wheel)
        try { if (typeof mzBindPlayerWheelScroll === "function") mzBindPlayerWheelScroll(vc); } catch (_) {}
        if (!vc._mzWheelBound) {
          vc._mzWheelBound = true;
          const bindOverlay = () => {              
            // No cubrir el player HLS (<video>)
              const vidEl = document.getElementById("player-video");
              if (vidEl && !vidEl.classList.contains("hidden")) {
                const old = vc.querySelector(".mz-scroll-catch");
                if (old) { old.style.pointerEvents = "none"; old.style.display = "none"; }
                return;
              }
            const wrap = vc.querySelector(".player-iframe-wrapper") || vc;
            let ov = vc.querySelector(".mz-scroll-catch");
            if (!ov) {
              ov = document.createElement("div");
              ov.className = "mz-scroll-catch";
              ov.setAttribute("aria-hidden", "true");
              ov.style.cssText = "position:absolute;inset:0;z-index:6;background:transparent;cursor:default;";
              wrap.style.position = wrap.style.position || "relative";
              wrap.appendChild(ov);
            }
            const scrollDb = (dy) => {
              const db = (typeof mzDetailsScrollEl === "function" && mzDetailsScrollEl())
                || document.querySelector("#details-panel .details-content")
                || document.querySelector("#details-panel .details-body");
              if (db) db.scrollTop += dy;
            };
            ov.onwheel = (e) => {
              scrollDb(e.deltaY);
              e.preventDefault();
              e.stopPropagation();
            };
            // Clic: dejar pasar al iframe un momento (play/controles)
            ov.onmousedown = () => {
              ov.style.pointerEvents = "none";
              const restore = () => {
                ov.style.pointerEvents = "auto";
                window.removeEventListener("mouseup", restore, true);
              };
              window.addEventListener("mouseup", restore, true);
              setTimeout(restore, 800);
            };
          };
          bindOverlay();
          // Por si el wrapper se recrea
          setTimeout(bindOverlay, 200);
          setTimeout(bindOverlay, 600);
        }
        // No centrar servidores con el player: solo asegurar overlay de scroll
      } catch (_) {}
    };
    requestAnimationFrame(() => {
      scrollPlayer();
      setTimeout(scrollPlayer, 200);
    });
}

function renderServidoresYDescargas(embedsRaw, downloadsRaw, fallbackUrl, item, opts) {
    embedsRaw = normalizarEmbeds(embedsRaw);
    const expandido = !!(opts && opts.expandido);
    const esPeli = !!(item && /pel[ií]cula|movie|film/i.test(String(item.tipo || item.type || "")));
    const esSerie = !!(item && (typeof isSerieOrAnime === "function" ? isSerieOrAnime(item) : /serie|anime/i.test(String(item.tipo || ""))));
    // Series/animes: solo mostrar servidores si ya estamos en player (episodio elegido)
    if (esSerie && !esPeli && !document.body.classList.contains("player-open")) {
      document.getElementById("servers-section")?.classList.add("hidden");
      document.getElementById("servers-loading")?.classList.add("hidden");
      return;
    }
    document.getElementById("servers-section")?.classList.remove("hidden");
    document.getElementById("servers-loading")?.classList.add("hidden");
    // Ocultar "Reproductores / Actualizar" del header (los chips ya traen títulos)
    try {
      const sh = document.querySelector("#servers-section .servers-header");
      if (sh) sh.style.display = "none";
      const tg = document.getElementById("mz-servers-toggle");
      if (tg) tg.remove();
    } catch (_) {}

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

    // Sin barra Latino/Sub: los chips Reproductores/Directos bastan


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
                <span><!--srv--></span>
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
    serversContainer.classList.remove("mz-collapsed-content");
    serversContainer.classList.add("mz-expanded-content");
    try { const _tg = document.getElementById("mz-servers-toggle"); if (_tg) _tg.remove(); } catch (_) {}

    /*
     * Abrir / cerrar servidores
     */

    if (serversToggle) {
      try { serversToggle.remove(); } catch (_) {}
    }


    /*
     * Chips: Reproductores / Directos (mismo estilo series y películas)
     */
    const seccionesRender = serversContainer._seccionesPlayers || [
        { id: "all", label: "Reproductores", list: embeds.filter(e => !e.noAds) }
    ];
    const noAds = embeds.find(e => e && e.noAds);

    if (embeds.length > 0) {
        const flatForPlay = [];
        if (noAds) flatForPlay.push(noAds);
              
        // Como en series:
        // Reproductores = todos los embeds (iframe): StreamWish, VidHide, Voe…
        // Directos = NO ADS + StreamWish/VidHide con stream (NO Voe)
       
        const isVoe = (e) => {
          if (!e) return false;
          const u = String(e.url || e.link || "").toLowerCase();
          const s = String(e.server || e.servidor || e.name || e.nombre || "").toLowerCase();
          let det = "";
          try {
            if (typeof detectarServidor === "function") {
              det = String(detectarServidor(e.url, e.server || e.servidor || e.name) || "").toLowerCase();
            }
          } catch (_) {}
          return /voe|jilliandescribe/.test(u + " " + s + " " + det);
        };
        const isHlsNamed = (e) => {
          if (!e) return false;
          // Solo nombre "HLS" — no UPNShare ni URLs .m3u8 genéricas
          const s = String(e.server || e.servidor || e.name || e.type || e.nombre || "").toLowerCase().trim();
          let det = "";
          try {
            if (typeof detectarServidor === "function") {
              det = String(detectarServidor(e.url, e.server || e.servidor || e.name) || "").toLowerCase().trim();
            }
          } catch (_) {}
          if (s === "hls" || s === "m3u8" || det === "hls") return true;
          if (/^hls(\s|$|\-|:)/.test(s)) return true;
          return false;
        };

        const allList = [];
        seccionesRender.forEach((sec) => {
          const listToShow = (!esPeli && sec.id === seccionesRender[0].id && noAds)
            ? [noAds, ...(sec.list || [])]
            : (sec.list || []);
          listToShow.forEach((embed) => {
            if (!embed || !embed.url) return;
            if (!allList.includes(embed)) allList.push(embed);
          });
        });
        if (noAds && !allList.includes(noAds)) allList.unshift(noAds);

        let reps, dirs, groups;
        const esAnime = !!(item && /anime/i.test(String(item.tipo || item.type || "")));
        const esSerie = !!(item && /serie|tv|dorama/i.test(String(item.tipo || item.type || "")));

        if (esPeli) {
          // SOLO PELÍCULAS
          reps = allList.filter((e) => e && !e.noAds);
          dirs = [];
          if (noAds) dirs.push(noAds);
          allList.forEach((e) => {
            if (!e || e.noAds) return;
            if (isVoe(e)) return;
            const su = e.stream_url || (typeof streamUrlParaNoAds === "function" ? streamUrlParaNoAds(e.url) : null);
            if (!su && !/\.m3u8(\?|$)|\.mp4(\?|$)/i.test(String(e.url || ""))) return;
            dirs.push({
              ...e,
              stream_url: su || e.stream_url || null,
              __directHls: true,
              server: e.server || e.servidor || e.name,
              name: e.name || e.server || e.servidor
            });
          });
          groups = [];
          if (reps.length) groups.push({ label: "Reproductores", list: reps });
          if (dirs.length) groups.push({ label: "Directos", list: dirs });
          if (!groups.length) groups.push({ label: "Reproductores", list: allList });
        } else {
          // SERIES / ANIME
          const isMobileSrv =
            document.body.classList.contains("mz-mobile-ep-playing") ||
            (typeof isMobileEpRangesUI === "function" && isMobileEpRangesUI()) ||
            (typeof window !== "undefined" && window.innerWidth <= 768);

          if (isMobileSrv) {
            // ===== MÓVIL series/anime = misma idea que PC koi-episode-player =====
            // Reproductores: solo embeds iframe (url host real), INCLUYE Voe, EXCLUYE noAds
            // Directos: NO ADS + stream ya del worker + clones resolubles (wish/vidhide/…), NUNCA Voe
            const isWorkerApi = (url) => {
              if (!url) return false;
              const u = String(url).toLowerCase();
              if (!/workers\.dev/i.test(u)) return false;
              return /\/(wish|voe|vidhide|goodstream|resolve|streamurl)\b/i.test(u) || /[?&]url=/.test(u);
            };
            const isIframeEmbed = (e) => {
              if (!e || e.noAds) return false;
              const url = e.url;
              if (!url || !/^https?:\/\//i.test(String(url))) return false;
              if (isWorkerApi(url)) return false;
              if (/moviezone\.tvjz\.workers\.dev\/\d+\//i.test(String(url))) return false;
              return true;
            };
            const canResolve = (e) => {
              if (!e || !e.url || isVoe(e)) return null;
              if (esAnime && isHlsNamed(e)) return null;
              // Preferir stream_url solo si ya es del worker
              if (e.stream_url && isWorkerApi(e.stream_url) && !/\/voe\/streamurl/i.test(String(e.stream_url))) {
                return e.stream_url;
              }
              if (e.hls_resolve && isWorkerApi(e.hls_resolve)) return e.hls_resolve;
              if (typeof streamUrlParaNoAds === "function") {
                const s = streamUrlParaNoAds(e.url);
                if (s && !/\/voe\/streamurl/i.test(String(s))) return s;
              }
              return null;
            };

            // Pool desde lista plana completa (embeds ya normalizados arriba)
            const pool = [];
            const seenKey = new Set();
            const add = (e) => {
              if (!e) return;
              const k = (e.noAds ? "noads|" : "") + String(e.url || e.stream_url || e.hls_resolve || "");
              if (!k || k === "noads|" || seenKey.has(k)) return;
              seenKey.add(k);
              pool.push(e);
            };
            (Array.isArray(embeds) ? embeds : []).forEach(add);
            allList.forEach(add);
            if (noAds) add(noAds);

            reps = [];
            dirs = [];
            const seenN = new Set();
            const seenD = new Set();

            // 1) Reproductores = todos los iframes (Voe incluido)
            pool.forEach((e) => {
              if (!isIframeEmbed(e)) return;
              const k = String(e.url).split("?")[0].toLowerCase();
              if (seenN.has(k)) return;
              seenN.add(k);
              // Quitar stream_url “falso” para que reproducir use iframe, no HLS
              const clean = { ...e, noAds: false, __directHls: false };
              delete clean.__directHls;
              // No borrar stream_url del objeto original si hace falta para dirs clone;
              // en el chip de Reproductores forzamos reproducción por url:
              reps.push({
                url: e.url,
                server: e.server || e.servidor || e.name,
                name: e.name || e.server || e.servidor,
                lang: e.lang || e.idioma,
                idioma: e.idioma || e.lang,
                language: e.language,
                // sin stream_url ni noAds → reproducir() usa iframe
              });
            });

            // 2) Directos = NO ADS (una sola vez)
            const noAdsEmb = pool.find((e) => e && e.noAds) || noAds;
            if (noAdsEmb && !seenD.has("noads")) {
              let su = noAdsEmb.stream_url || null;
              if (!su && typeof streamUrlParaNoAds === "function" && noAdsEmb.url) {
                su = streamUrlParaNoAds(noAdsEmb.url);
              }
              dirs.push({
                url: noAdsEmb.url || noAdsEmb.sourceEmbed || "",
                stream_url: su,
                noAds: true,
                __directHls: false,
                server: "NO ADS",
                name: "NO ADS",
                lang: noAdsEmb.lang || noAdsEmb.idioma,
                idioma: noAdsEmb.idioma || noAdsEmb.lang,
              });
              seenD.add("noads");
            }

            // 3) Directos = resolubles (no Voe), con stream_url worker + __directHls
            pool.forEach((e) => {
              if (!e || e.noAds) return;
              if (isVoe(e)) return;
              if (esAnime && isHlsNamed(e)) return;
              if (!isIframeEmbed(e) && !(e.stream_url && isWorkerApi(e.stream_url))) return;
              const api = canResolve(e);
              if (!api) return;
              const k = String(api).split("?")[0].toLowerCase();
              if (seenD.has(k)) return;
              seenD.add(k);
              dirs.push({
                url: e.url || "",
                stream_url: api,
                __directHls: true,
                noAds: false,
                server: e.server || e.servidor || e.name,
                name: e.name || e.server || e.servidor,
                lang: e.lang || e.idioma,
                idioma: e.idioma || e.lang,
                language: e.language,
              });
            });

            groups = [];
            if (reps.length) groups.push({ label: "Reproductores", list: reps });
            if (dirs.length) groups.push({ label: "Directos", list: dirs });
            if (!groups.length && pool.length) {
              groups.push({
                label: "Reproductores",
                list: pool.filter((e) => isIframeEmbed(e)),
              });
            }
          } else {
            // PC / otros: lógica previa sin cambios
            const isDirect = (e) => {
              if (!e) return false;
              if (isVoe(e)) return false;
              if (esAnime && isHlsNamed(e)) return false;
              if (e.noAds || e.direct || e.stream_url) return true;
              const u = String(e.url || "");
              const s = String(e.server || e.servidor || e.name || e.type || "").toLowerCase();
              if (/\.m3u8(\?|$)|\.mp4(\?|$)/i.test(u)) return true;
              if (/direct|hls|m3u8|mp4|no\s*ads/.test(s)) return true;
              if (e.download || e.is_direct) return true;
              return false;
            };
            reps = allList.filter((e) => e && !isDirect(e));
            dirs = allList.filter((e) => e && isDirect(e));
            dirs = dirs.filter((e) => e && !isVoe(e));
            if (esAnime) {
              dirs = dirs.filter((e) => e && !isHlsNamed(e) && !isVoe(e));
            }
            if (!dirs.length) {
              dirs = allList.filter((e) => {
                if (!e) return false;
                if (isVoe(e)) return false;
                if (esAnime && isHlsNamed(e)) return false;
                return !!(e.stream_url || e.noAds || e.direct);
              });
              reps = allList.filter((e) => e && !dirs.includes(e));
            }
            groups = [];
            if (reps.length) groups.push({ label: "Reproductores", list: reps });
            else {
              const safe = allList.filter((e) => e && !isDirect(e));
              groups.push({ label: "Reproductores", list: safe.length ? safe : allList });
            }
            if (dirs.length) groups.push({ label: "Directos", list: dirs });
          }
        }


/*
        const isDirect = (e) => {
          if (!e) return false;
          if (e.noAds || e.direct || e.stream_url) return true;
          const u = String(e.url || "");
          const s = String(e.server || e.servidor || e.name || e.type || "").toLowerCase();
          if (/\.m3u8(\?|$)|\.mp4(\?|$)/i.test(u)) return true;
          if (/direct|hls|m3u8|mp4|no\s*ads/.test(s)) return true;
          // Algunos providers marcan download/stream aparte del embed
          if (e.download || e.is_direct) return true;
          return false;
        };

        const allList = [];
        seccionesRender.forEach((sec) => {
            const listToShow = sec.id === seccionesRender[0].id && noAds
                ? [noAds, ...sec.list]
                : sec.list;
            listToShow.forEach((embed) => {
                if (!embed || !embed.url) return;
                if (embed.noAds && sec.id !== seccionesRender[0].id) return;
                if (!allList.includes(embed)) allList.push(embed);
            });
        });

        let reps = allList.filter(e => !isDirect(e));
        let dirs = allList.filter(e => isDirect(e));
        // Si no hay "directos" detectados, usar embeds con stream_url/noAds como Directos
        if (!dirs.length) {
          dirs = allList.filter(e => e && (e.stream_url || e.noAds || e.direct));
          reps = allList.filter(e => !dirs.includes(e));
        }
        // Si aún no hay división, primera mitad visual: todos en Reproductores y Directos con los que tengan quality/HD
        if (!dirs.length && reps.length > 1) {
          const maybe = reps.filter(e => /direct|hls|mp4|m3u8|hd|1080|720/i.test(String(e.server||e.name||e.quality||e.url||"")));
          if (maybe.length) {
            dirs = maybe;
            reps = reps.filter(e => !maybe.includes(e));
          }
        }
        const groups = [];
        groups.push({ label: "Reproductores", list: reps.length ? reps : allList });
        if (dirs.length) groups.push({ label: "Directos", list: dirs });
        else if (reps.length && reps !== allList) {
        }*/

        const mobileSrv =
          (typeof isMobileEpRangesUI === "function" && isMobileEpRangesUI()) ||
          document.body.classList.contains("mz-mobile-ep-playing");

        const makeChip = (embed) => {
            if (!embed || (!embed.url && !embed.stream_url)) return null;
            let idxp = flatForPlay.indexOf(embed);
            if (idxp < 0) { flatForPlay.push(embed); idxp = flatForPlay.length - 1; }
            const nombre = embed.noAds
                ? "NO ADS"
                : detectarServidor(embed.url, embed.server || embed.servidor || embed.name);
            const idTag = idiomaDeEmbed(embed);
            let langBadge = "";
            if (!embed.noAds) {
                if (idTag === "lat") {
                    langBadge = `<span class="koi-lang-badge koi-lang-dub" title="Latino / Doblado">DUB</span>`;
                } else if (idTag === "sub") {
                    langBadge = `<span class="koi-lang-badge koi-lang-sub" title="Subtitulado">SUB</span>`;
                } else if (/eng|ingl/i.test(String(embed.lang || embed.idioma || ""))) {
                    langBadge = `<span class="koi-lang-badge koi-lang-eng" title="English">ENG</span>`;
                } else {
                    const raw = String(embed.lang || embed.idioma || "").trim();
                    if (raw) {
                        langBadge = `<span class="koi-lang-badge koi-lang-other" title="${escapeHtml(raw)}">${escapeHtml(raw.slice(0, 6).toUpperCase())}</span>`;
                    }
                }
            }
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "koi-server-chip" + (idTag === "lat" ? " is-dub" : idTag === "sub" ? " is-sub" : "");
            chip.dataset.index = String(idxp);
        
            chip.dataset.mzPref =
              (embed.noAds || embed.__directHls || embed.__forceDirect ? "1" : "0") + "|" +
              String(nombre || "").toLowerCase() + "|" +
              String(typeof idiomaDeEmbed === "function" ? (idiomaDeEmbed(embed) || "") : "");
                        
            if (mobileSrv) {
                // Solo DUB / SUB. Nunca "Desconocido" ni texto basura de idioma
                let langTxt = "";
                if (!embed.noAds) {
                  if (idTag === "lat") langTxt = "DUB";
                  else if (idTag === "sub") langTxt = "SUB";
                }
                chip.classList.add("mz-mep-srv-chip");
                chip.innerHTML =
                  (langTxt ? `<span class="mz-mep-srv-lang">${langTxt}</span>` : "") +
                  `<span class="koi-chip-name">${escapeHtml(nombre)}</span>`;
            } else {
                chip.innerHTML = langBadge + `<span class="koi-chip-name">${escapeHtml(nombre)}</span>`;
            }

          
          chip.addEventListener("click", () => {
              try {
                const nombre = embed.noAds
                  ? "NO ADS"
                  : detectarServidor(
                      embed.url,
                      embed.server || embed.servidor || embed.name
                    );
                // Solo preferir servidor dentro del mismo título (slug)
                const slugKey = String(
                  (typeof mzSlugFromItem === "function" ? mzSlugFromItem(item) : null) ||
                  item?.slug ||
                  ""
                );
                const prefName = String(nombre || "").toLowerCase();
                const prefLang = typeof idiomaDeEmbed === "function" ? idiomaDeEmbed(embed) : null;
                const prefNoAds = !!embed.noAds;
                const prefDirect = !!(
                  embed.noAds ||
                  embed.__directHls ||
                  embed.__forceDirect ||
                  embed.server === "NO ADS" ||
                  embed.name === "NO ADS"
                );
                window.__mzPreferredServer = {
                  name: prefName,
                  lang: prefLang,
                  noAds: prefNoAds,
                  direct: prefDirect, // true = sección Directos / NO ADS
                  slug: slugKey
                };
                // Una sola clase activa; limpia normales y directos
                document.querySelectorAll(".koi-server-chip, .mz-mep-srv-chip").forEach(function (c) {
                  c.classList.remove("is-active", "active");
                });
                chip.classList.add("is-active");
              } catch (_) {}
              reproducir(embed, item);
            });
            return chip;
        };

        groups.forEach((g) => {
            // Último filtro al pintar (por si quedó Voe/HLS)
            const esAnimePaint = !!(item && /anime/i.test(String(item.tipo || item.type || "")));
            const isDirGroup = /directo/i.test(String(g.label || ""));
            g.list = (g.list || []).filter((e) => {
              if (!e) return false;
              // Voe solo se quita de Directos (no de Reproductores)
              if (typeof isVoe === "function" && isVoe(e) && isDirGroup) return false;
              // Anime: chip "HLS" solo fuera de Directos
              if (esAnimePaint && isDirGroup && typeof isHlsNamed === "function" && isHlsNamed(e)) return false;
              return true;
            });
            if (!g.list.length) return;
            const wrap = document.createElement("div");
            wrap.className = "koi-servers-block" + (mobileSrv ? " mz-mep-srv-block" : "");
            const h = document.createElement("div");
            h.className = "koi-servers-title";
            h.textContent = g.label;
            wrap.appendChild(h);             
          if (mobileSrv) {
                // Directos: todos los chips en una sola fila (NO ADS alineado)
                if (String(g.label || "").toLowerCase() === "directos") {
                  const chipWrap = document.createElement("div");
                  chipWrap.className = "koi-servers-chips mz-mep-srv-chips";
                  g.list.forEach((embed) => {
                    const c = makeChip(embed);
                    if (c) chipWrap.appendChild(c);
                  });
                  wrap.appendChild(chipWrap);
                } else {
                  // Reproductores: filas SUB / DUB / resto
                  const subL = g.list.filter((e) => e && !e.noAds && idiomaDeEmbed(e) === "sub");
                  const dubL = g.list.filter((e) => e && !e.noAds && idiomaDeEmbed(e) === "lat");
                  const otherL = g.list.filter((e) => e && !e.noAds && idiomaDeEmbed(e) !== "sub" && idiomaDeEmbed(e) !== "lat");
                  const rows = [
                    { key: "sub", label: "SUB", list: subL },
                    { key: "dub", label: "DUB", list: dubL },
                    { key: "oth", label: "", list: otherL }
                  ];
                  rows.forEach((row) => {
                    if (!row.list.length) return;
                    const rowEl = document.createElement("div");
                    rowEl.className = "mz-mep-srv-row";
                    if (row.label) {
                      const tag = document.createElement("span");
                      tag.className = "mz-mep-srv-row-tag" + (row.key === "dub" ? " is-dub" : row.key === "sub" ? " is-sub" : "");
                      tag.textContent = row.label;
                      rowEl.appendChild(tag);
                    }
                    const chips = document.createElement("div");
                    chips.className = "koi-servers-chips mz-mep-srv-chips";
                    row.list.forEach((embed) => {
                      const c = makeChip(embed);
                      if (!c) return;
                      if (row.label) c.querySelector(".mz-mep-srv-lang")?.remove();
                      chips.appendChild(c);
                    });
                    rowEl.appendChild(chips);
                    wrap.appendChild(rowEl);
                  });
                }
            } else {
                const chipWrap = document.createElement("div");
                chipWrap.className = "koi-servers-chips";
                g.list.forEach((embed) => {
                    const c = makeChip(embed);
                    if (c) chipWrap.appendChild(c);
                });
                wrap.appendChild(chipWrap);
            }
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
    window.__mzMobileDownloads = downloads;
    // Nunca "Opciones de descarga" sueltas en la ficha de detalle (película o serie)
    try {
      const ds = document.getElementById("downloads-section");
      if (!ds) {
        /* */
      } else if (document.body.classList.contains("mz-mobile-ep-playing")) {
        ds.classList.add("hidden");
      } else if (document.body.classList.contains("mz-koi-ep-open")) {
        ds.classList.add("hidden");
      } else if (document.body.classList.contains("koi-movie")) {
        ds.classList.add("hidden");
      } else if (item && (typeof isSerieOrAnime === "function" ? isSerieOrAnime(item) : /serie|anime/i.test(String(item.tipo||"")))) {
        ds.classList.add("hidden");
      }
    } catch (_) {}




    if (downloads.length > 0) {

        // Solo mostrar bloque aparte si no estamos en ficha película/serie (Koi lleva descargas)
        const hideDlBlock =
          document.body.classList.contains("koi-movie") ||
          document.body.classList.contains("mz-koi-ep-open") ||
          document.body.classList.contains("mz-mobile-ep-playing") ||
          (item && /serie|anime|dorama/i.test(String(item.tipo || item.type || "")));
        if (hideDlBlock) {
          downloadsSection.classList.add("hidden");
        } else {
          downloadsSection.classList.remove("hidden");
        }



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
if (searchForm) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = (searchInput && searchInput.value || "").trim();
    if (!texto) return;
    busquedaEsLocal = false; // online por defecto
    // Si estás en JK → búsqueda solo JK; si no → global
    try {
      const enJk = animeFuente === "jk" || gridSeccion === "jk";
      if (enJk) {
        gridSeccion = "jk";
        gridTypeFilter = "anime";
        animeFuente = "jk";
        mostrarGrid({ modo: "search", seccion: "jk", termino: texto });
      } else {
        gridSeccion = "all";
        gridTypeFilter = "all";
        animeFuente = "av1";
        mostrarGrid({ modo: "search", seccion: "all", termino: texto });
      }
    } catch (_) {
      mostrarGrid({ modo: "search", seccion: "all", termino: texto });
    }
  });
}

// ======================================================

function syncAnimeSourceChips() {
  try {
    const g = document.getElementById("mz-anime-src-group");
    if (!g) return;
    g.classList.add("hidden");
    g.style.cssText = "display:none!important;visibility:hidden;height:0;overflow:hidden";
    g.setAttribute("hidden", "hidden");
  } catch (_) {}
}

function onAnimeSrcClick(ev) {
  try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
  const btn = ev.currentTarget;
  const v = (btn && btn.getAttribute("data-anime-src")) || "av1";
  animeFuente = v === "jk" ? "jk" : "av1";
  syncAnimeSourceChips();
  try {
    gridPage = 1;
    if (gridModo === "search" && gridTermino) {
      // JK solo trae anime → no filtrar por Películas/Series
      if (animeFuente === "jk") gridTypeFilter = "anime";
      else gridTypeFilter = "all";
      // sincronizar chips de tipo
      try {
        document.querySelectorAll(".filter-chip:not(.mz-anime-src)").forEach(function (c) {
          const t = c.dataset.type || "all";
          c.classList.toggle("active", t === gridTypeFilter || (gridTypeFilter === "all" && t === "all"));
        });
      } catch (_) {}
      cargarPaginaGrid();
    } else {
      gridSeccion = "anime";
      gridTypeFilter = "anime";
      mostrarGrid({ modo: "categoria", seccion: "anime" });
    }
  } catch (e) {
    console.warn("anime src chip", e);
    try { cargarPaginaGrid(); } catch (_) {}
  }
}

function bindAnimeSourceChips() {
  const g = document.getElementById("mz-anime-src-group");
  if (!g || g.dataset.bound === "1") return;
  g.dataset.bound = "1";
  g.querySelectorAll(".mz-anime-src").forEach(function (btn) {
    btn.addEventListener("click", onAnimeSrcClick);
  });
}

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
        if (chip.classList.contains("mz-anime-src") || chip.closest("#mz-anime-src-group")) return;

        document.querySelectorAll(".filter-chip:not(.mz-anime-src)").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        gridTypeFilter = chip.dataset.type || "all";

        if (gridModo === "search" || gridModo === "favoritos") {
            if (vistaActual === "grid") cargarPaginaGrid();
            try { syncAnimeSourceChips(); } catch (_) {}
            return;
        }

        if (gridTypeFilter === "all") {
            mostrarGrid({ modo: "categoria", seccion: "movie" });
        } else {
            mostrarGrid({ modo: "categoria", seccion: gridTypeFilter });
        }
        try { syncAnimeSourceChips(); } catch (_) {}
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



function setDetalleFondo(item) {
  const bg = document.getElementById("mz-stremio-bg");
  if (!bg || !item) return;
  const url = item.backdrop || item.portada_imdb || item.portada || "";
  if (url) {
    bg.style.backgroundImage = `url("${String(url).replace(/"/g, "%22")}")`;
  } else {
    bg.style.backgroundImage = "";
  }
}

function setDetailBackdrop(item) {
  const layer = document.getElementById("mz-stremio-bg");
  const img = document.getElementById("mz-stremio-bg-img");
  if (!layer) return;

  const url =
    (item && (
      item.backdrop ||
      item.fondo ||
      item.background ||
      item.backdrop_url ||
      (item.imdb && item.imdb.backdrop) ||
      (item.tmdb && (item.tmdb.backdrop || item.tmdb.fondo)) ||
      item.portada_imdb ||
      item.portada ||
      item.poster ||
      item.image
    )) || "";

  // Limpiar background-image viejo del div (ahora usamos <img> como Stremio)
  layer.style.removeProperty("background-image");
  layer.style.removeProperty("opacity");

  if (img) {
    if (url) {
      const safe = String(url).trim();
      const fallbackPortada =
        (item && (item.portada_fuente_raw || item.portada || item.poster || item.image)) || "";
      const esMetaBg = /metahub\.space|media-amazon\.com/i.test(safe);

      img.onload = function () {
        // Metahub a veces responde 200 con imagen "Missing image" (muy chica)
        if (img.naturalWidth > 0 && img.naturalWidth < 50 && fallbackPortada && esMetaBg) {
          img.onerror = null;
          img.src = String(fallbackPortada).trim();
          return;
        }
        img.classList.add("is-ready");
      };
      img.onerror = function () {
        img.classList.remove("is-ready");
        if (fallbackPortada && img.getAttribute("src") !== String(fallbackPortada).trim()) {
          img.onerror = function () {
            img.removeAttribute("src");
          };
          img.src = String(fallbackPortada).trim();
          return;
        }
        img.removeAttribute("src");
      };
      if (img.src !== safe && img.getAttribute("src") !== safe) {
        img.classList.remove("is-ready");
        img.src = safe;
      } else if (img.complete && img.naturalWidth > 0) {
        if (img.naturalWidth < 50 && fallbackPortada && esMetaBg) {
          img.src = String(fallbackPortada).trim();
        } else {
          img.classList.add("is-ready");
        }
      }
    } else {
      img.classList.remove("is-ready");
      img.removeAttribute("src");
    }
  } else if (url) {
    // fallback si no hay img
    const safe = String(url).replace(/"/g, "%22");
    layer.style.setProperty("background-image", `url("${safe}")`, "important");
  }
}

function setDetalleLogo(item) {
  const logoEl = document.getElementById("details-logo");
  const posterEl = document.getElementById("details-poster");
  const posterCol = document.querySelector(".mz-stremio-poster-col");
  const header = document.querySelector(".mz-stremio-header");
  if (!logoEl) return;

  logoEl.onload = null;
  logoEl.onerror = null;

  const imdbIdRaw = item.imdb_id || (item.imdb && (item.imdb.id || item.imdb.imdb_id)) || "";
  const imdbId = String(imdbIdRaw || "").trim();
  const tt = imdbId
    ? (imdbId.startsWith("tt") ? imdbId : "tt" + imdbId.replace(/\D/g, ""))
    : null;

  const logoUrl =
    item.logo ||
    item.logo_url ||
    item.logo_imdb ||
    (tt ? "https://images.metahub.space/logo/medium/" + tt + "/img" : null);

  const showPoster = () => {
    logoEl.classList.add("hidden");
    logoEl.removeAttribute("src");
    if (posterEl) posterEl.classList.remove("mz-poster-hidden");
    if (posterCol) {
      posterCol.classList.remove("mz-hide-poster");
      posterCol.classList.add("mz-poster-top");
    }
    if (header) header.classList.add("mz-has-poster-only");
  };

  const showLogo = () => {
    logoEl.classList.remove("hidden");
    if (posterEl) posterEl.classList.add("mz-poster-hidden");
    if (posterCol) {
      posterCol.classList.add("mz-hide-poster");
      posterCol.classList.remove("mz-poster-top");
    }
    if (header) header.classList.remove("mz-has-poster-only");
  };

  if (!logoUrl) {
    showPoster();
    return;
  }

  logoEl.onload = showLogo;
  logoEl.onerror = showPoster;
  logoEl.src = logoUrl;
  if (logoEl.complete && logoEl.naturalWidth > 0) showLogo();
}

// Donde ya abres/rellenas el detalle:
// setDetailBackdrop(item);

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



function setBootLoading(on) {
  const el = document.getElementById("mz-boot-loading");
  if (!el) return;
  el.classList.toggle("hidden", !on);
  document.body.classList.toggle("mz-booting", !!on);
}

function initBrowserWarn() {
  try {
    const el = document.getElementById("mz-browser-warn");
    if (!el) return;
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    if (!isMobile) return;
    if (sessionStorage.getItem("mz_browser_warn") === "1") return;
    el.classList.remove("hidden");
    sessionStorage.setItem("mz_browser_warn", "1");
    setTimeout(() => el.classList.add("hidden"), 5000);
  } catch (_) {}
}
initBrowserWarn();

// initWakeupNotice(); // desactivado: sin mensaje de servidores

initProfilesUi();
initNotifyBtn();
try { bindAnimeSourceChips(); syncAnimeSourceChips(); } catch (_) {}
// Deep link tipo Koiflix: si la URL es /detalle/... NO cargar inicio primero
(function mzBootByRoute() {
  try {
    var p = location.pathname || "/";
    var isDeep =
      /^\/detalle\//i.test(p) ||
      /^\/(serie|pelicula|anime)\//i.test(p);
    if (isDeep) {
      try { setBootLoading(true); } catch (_) {}
      try { document.body.classList.add("mz-deep-loading"); } catch (_) {}
      try {
        if (typeof homeView !== "undefined" && homeView) homeView.classList.add("hidden");
        if (typeof gridView !== "undefined" && gridView) gridView.classList.add("hidden");
      } catch (_) {}
      window.__mzSkipHomeBoot = true;
      window.__mzPrefetchHomeAfterDeep = true;
    } else {
      window.__mzSkipHomeBoot = false;
      cargarHome();
    }
  } catch (e) {
    window.__mzSkipHomeBoot = false;
    try { cargarHome(); } catch (_) {}
  }
})();
initTvUi();
initAutoplayEpUi();
try { bindKoiBackBtn(); } catch (_) {}


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




/** Rutas amigables: /detalle/slug  |  /detalle/slug/1/2 */
function mzSlugFromItem(item) {
  if (!item) return "";
  let s = item.slug || "";
  if (!s && item.link) {
    const m = String(item.link).match(/\/(?:pelicula|serie|anime|dorama)\/([^\/?#]+)/i);
    if (m) s = m[1];
  }
  if (!s && item.nombre) s = String(item.nombre).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return String(s || "").replace(/^\/+|\/+$/g, "");
}

function mzBuildDetallePath(item, season, episode) {
  const slug = mzSlugFromItem(item);
  if (!slug) return "/";
  // /detalle/{source_id}/slug  |  /detalle/{source_id}/slug/t/e  |  /detalle/slug (sin id)
  let sid = "";
  try {
    sid = item && item.source_id != null ? String(item.source_id).trim() : "";
    if (!sid && item && typeof esItemJk === "function" && esItemJk(item)) sid = "5";
    if (!sid && item && /jkanime/i.test(String(item.fuente || item.source || item.link || ""))) sid = "5";
  } catch (_) {}
  let base = sid
    ? "/detalle/" + encodeURIComponent(sid) + "/" + encodeURIComponent(slug)
    : "/detalle/" + encodeURIComponent(slug);
  const s = season != null && season !== "" ? Number(season) : null;
  const e = episode != null && episode !== "" ? Number(episode) : null;
  if (s != null && e != null && !isNaN(s) && !isNaN(e) && s >= 1 && e >= 1) {
    base = base + "/" + s + "/" + e;
  }
  return base;
}

function mzPushDetalleUrl(item, season, episode) {
  try {
    const path = mzBuildDetallePath(item, season, episode);
    if (!path || path === "/") return;
    if (location.pathname === path) return;
    const slug = mzSlugFromItem(item);
    let sidSt = "";
    try {
      sidSt = item && item.source_id != null ? String(item.source_id) : "";
      if (!sidSt && item && typeof esItemJk === "function" && esItemJk(item)) sidSt = "5";
    } catch (_) {}
    const state = {
      mz: "detalle",
      slug: slug,
      source_id: sidSt || null,
      season: season != null && season !== "" ? Number(season) : null,
      episode: episode != null && episode !== "" ? Number(episode) : null
    };
    const cur = location.pathname || "";
    const curIsEp = /\/detalle\/(?:\d+\/)?[^\/]+\/\d+\/\d+\/?$/i.test(cur);
    const curIsDet = /^\/detalle\//i.test(cur);
    const willBeEp = season != null && episode != null && !isNaN(Number(season)) && !isNaN(Number(episode));

    function sameTitleInPath() {
      try {
        var m = cur.match(/^\/detalle\/(?:\d+\/)?([^\/]+)/i);
        if (!m || !slug) return false;
        var pathSlug = decodeURIComponent(m[1] || "");
        return pathSlug === slug || pathSlug === encodeURIComponent(slug);
      } catch (_) {
        return false;
      }
    }

    // Ya en este título (ficha o episodio) → replace (no apilar)
    // Excepción: primera vez ficha → episodio = un solo push para que un "atrás" vuelva a la ficha
    if (willBeEp && curIsEp && sameTitleInPath()) {
      history.replaceState(state, "", path);
      return;
    }
    if (willBeEp && curIsDet && !curIsEp && sameTitleInPath()) {
      history.pushState(state, "", path);
      return;
    }
    if (willBeEp && curIsEp) {
      history.replaceState(state, "", path);
      return;
    }
    // Solo ficha
    if (sameTitleInPath() || (curIsDet && !willBeEp && sameTitleInPath())) {
      history.replaceState(state, "", path);
      return;
    }
    if (curIsDet && !willBeEp) {
      history.replaceState(state, "", path);
      return;
    }
    history.pushState(state, "", path);
  } catch (_) {}
}

/** Solo detalle (sin /s/e), sin apilar si ya estamos en detalle */
function mzReplaceDetalleUrl(item) {
  try {
    const path = mzBuildDetallePath(item, null, null);
    if (location.pathname === path) return;
    history.replaceState(
      { mz: "detalle", slug: mzSlugFromItem(item), season: null, episode: null },
      "",
      path
    );
  } catch (_) {}
}



function mzReplaceHomeUrl() {
  try {
    if (location.pathname === "/" || location.pathname === "") return;
    // replaceState: no deja basura de /detalle en el historial al cerrar
    history.replaceState({ mz: "home" }, "", "/");
  } catch (_) {}
}

// Exportar para koi-episode-player.js (script clásico) y otros
try {
  window.mzSlugFromItem = mzSlugFromItem;
  window.mzBuildDetallePath = mzBuildDetallePath;
  window.mzPushDetalleUrl = mzPushDetalleUrl;
  window.mzReplaceDetalleUrl = mzReplaceDetalleUrl;
  window.mzReplaceHomeUrl = mzReplaceHomeUrl;
} catch (_) {}



// ---------- Deep link: /serie/slug  |  /?id=  |  /?link= ----------
async function handleDeepLink() {
    try {
        // /detalle/5/slug  |  /detalle/5/slug/1/1  |  /detalle/slug  |  /detalle/slug/1/1
        let pathM = location.pathname.match(
            /^\/detalle\/(\d+)\/([^\/]+)(?:\/(\d+)\/(\d+))?\/?$/i
        );
        let sidFromPath = null;
        if (pathM) {
            // [full, source_id, slug, season, episode]
            sidFromPath = pathM[1];
            pathM = [pathM[0], pathM[2], pathM[3], pathM[4]];
        } else {
            pathM = location.pathname.match(
                /^\/detalle\/([^\/]+)(?:\/(\d+)\/(\d+))?\/?$/i
            );
            if (pathM) {
                pathM = [pathM[0], pathM[1], pathM[2], pathM[3]];
            }
        }
        // Compat: /serie|anime|pelicula/slug[/s/e]
        if (!pathM) {
            pathM = location.pathname.match(
                /^\/(serie|pelicula|anime)\/([^\/]+)(?:\/(\d+)\/(\d+))?\/?$/i
            );
            if (pathM) {
                pathM = [pathM[0], pathM[2], pathM[3], pathM[4]];
            }
        }

        if (pathM && pathM[1]) {
            let slug = pathM[1];
            try { slug = decodeURIComponent(slug); } catch (_) {}
            const season = pathM[2] ? parseInt(pathM[2], 10) : null;
            const episode = pathM[3] ? parseInt(pathM[3], 10) : null;
            const q = new URLSearchParams();
            q.set("slug", slug);
            let sidDeep = sidFromPath || "";
            try {
              if (!sidDeep) sidDeep = new URLSearchParams(location.search || "").get("source_id") || "";
              if (!sidDeep && history.state && history.state.source_id) sidDeep = String(history.state.source_id);
            } catch (_) {}
            if (sidDeep) {
              q.set("source_id", String(sidDeep));
              // 4/5 = anime: no dejar que el server asuma serie/AV1
              if (String(sidDeep) === "5" || String(sidDeep) === "4") {
                q.set("tipo", "anime");
              }
              if (String(sidDeep) === "5") q.set("fuente", "jkanime");
              if (String(sidDeep) === "4") q.set("fuente", "animeav1");
            }
            const res = await fetch("/api/detalle?" + q.toString() + "&_=" + Date.now(), { cache: "no-store" });
            const item = await res.json();
            if (item && sidDeep) {
              item.source_id = String(sidDeep);
              if (String(sidDeep) === "5") {
                item.fuente = "jkanime";
                item.tipo = item.tipo || "Anime";
              }
              if (String(sidDeep) === "4") {
                item.fuente = item.fuente || "animeav1";
                item.tipo = item.tipo || "Anime";
              }
              try { window.__mzLockSourceId = String(sidDeep); } catch (_) {}
            }
            if (item && (item.nombre || item.titulo || item.link || item.slug)) {
                await abrirDetalle(item);
                if (season && episode && typeof isSerieOrAnime === "function" && isSerieOrAnime(item)) {
                    // Esperar episodios y abrir vista (móvil o click)
                    setTimeout(async () => {
                        try {
                            const ep = (item.episodios || []).find(function (x) {
                                return Number(x.season || x.temporada || 1) === season &&
                                  Number(x.episode || x.episodio || 0) === episode;
                            }) || { season: season, episode: episode, nombre: "Episodio " + episode };
                            const mobile =
                              (typeof isMobileEpRangesUI === "function" && isMobileEpRangesUI()) ||
                              window.innerWidth <= 768;
                            const pc =
                              (typeof isKoiDesktop === "function" && isKoiDesktop()) ||
                              window.innerWidth >= 1025;
                            if (typeof window.mzKoiOpenEpisode === "function") {
                              await window.mzKoiOpenEpisode(item, ep, season, episode);
                            } else {
                              const btn = document.querySelector('#episodes-container [data-ep="' + episode + '"]');
                              if (btn) btn.click();
                            }
                        } catch (e) { console.warn("deep ep", e); }
                    }, 900);
                }
            }
            return;
        }

        const p = new URLSearchParams(location.search);
        const id = p.get("id");
        const link = p.get("link");
        if (!id && !link) return;
        const q = id ? `id=${encodeURIComponent(id)}` : `link=${encodeURIComponent(link)}`;
        const res = await fetch(`/api/detalle?${q}`);
        const item = await res.json();
        if (item && (item.nombre || item.link || item.slug)) await abrirDetalle(item);
    } catch (e) { console.warn("Deep link:", e); }
    finally {
      try {
        setBootLoading(false);
        document.body.classList.remove("mz-deep-loading", "mz-booting");
        var boot = document.getElementById("mz-boot-loading");
        if (boot) boot.classList.add("hidden");
      } catch (_) {}
      // Precargar home en segundo plano (no se muestra) para al volver sea instantáneo
      if (window.__mzPrefetchHomeAfterDeep) {
        window.__mzPrefetchHomeAfterDeep = false;
        setTimeout(function () {
          try {
            if (typeof cargarHome === "function") {
              // no forzar vista; cargarHome pinta inicio — solo si usuario ya cerró detalle
              // mejor no llamar cargarHome aquí; se carga al volver a /
            }
          } catch (_) {}
        }, 2500);
      }
    }
}
// Ejecutar siempre: en deep link abre detalle; en / no hace nada útil si no hay query
handleDeepLink().catch(function (e) { console.warn("Deep link boot:", e); });


window.addEventListener("popstate", function () {
  try {
    const path = location.pathname || "/";

    // Inicio
    if (path === "/" || path === "") {
      if (document.body.classList.contains("mz-mobile-ep-playing") &&
          typeof salirVistaMovilEpisodio === "function") {
        salirVistaMovilEpisodio();
      }
      if (typeof cerrarDetalle === "function") cerrarDetalle(true);
      return;
    }

    // /detalle/slug/1/2 → salir de episodio, quedarse en detalle
    const epM = path.match(/^\/detalle\/(?:\d+\/)?([^\/]+)\/(\d+)\/(\d+)\/?$/i);
    if (epM) {
      // Aún en URL de episodio (caso raro); no forzar reload
      return;
    }

    // /detalle/slug o /detalle/5/slug (sin episodio) ← atrás desde episodio
    const detM = path.match(/^\/detalle\/(?:\d+\/)?([^\/]+)\/?$/i);
    if (detM) {
      try {
        if (typeof window.mzKoiCloseEpisodeSilent === "function") window.mzKoiCloseEpisodeSilent();
        else if (typeof window.mzKoiCloseEpisode === "function") window.mzKoiCloseEpisode({ skipHistory: true });
      } catch (_) {}
      try {
        if (typeof salirVistaMovilEpisodio === "function") salirVistaMovilEpisodio();
      } catch (_) {}
      document.body.classList.remove("player-open", "mz-mep-dl-open", "mz-mobile-ep-playing");
      document.getElementById("mz-mep-dl-panel")?.classList.add("hidden");
      document.getElementById("video-player-container")?.classList.add("hidden");
      document.getElementById("servers-section")?.classList.add("hidden");
      try {
        const ifr = document.getElementById("player-iframe");
        if (ifr) ifr.src = "about:blank";
      } catch (_) {}
      const item = (_epPlayCtx && _epPlayCtx.item) || seleccionActual;
      if (item) {
        try {
          if (typeof setKoiMode === "function") setKoiMode(item);
        } catch (_) {}
        if (typeof renderTemporadas === "function") {
          document.getElementById("seasons-section")?.classList.remove("hidden");
          renderTemporadas(item);
        }
        try {
          document.getElementById("details-panel")?.classList.remove("hidden");
          document.body.classList.add("details-open");
        } catch (_) {}
      } else {
        // Sin item en memoria: recargar deep link
        try { location.reload(); } catch (_) {}
      }
      return;
    }
  } catch (_) {}
});
/*
window.addEventListener("popstate", function () {
  try {
    const path = location.pathname || "/";
    if (path === "/" || path === "") {
      if (typeof cerrarDetalle === "function") cerrarDetalle(true);
      return;
    }
    // Re-dispatch deep link without full reload
    if (/^\/detalle\//i.test(path) || /^\/(serie|anime|pelicula)\//i.test(path)) {
      location.reload();
    }
  } catch (_) {}
});*/

// ---------- Continuar viendo (localStorage) ----------
// Episodios a media: se guarda si 2%–50% visto; >50% se elimina.
let progresoTimer = null;
let progresoActual = null; // { key, item, segundos, duracion }
let progresoVideoBound = null;

function claveProgreso(item) {
  if (!item) return null;
  const sid = item.source_id != null ? String(item.source_id) : "";
  const slug = item.slug || "";
  const s = item.temporada != null ? item.temporada : (item.season != null ? item.season : "");
  const e = item.episodio != null ? item.episodio : (item.episode != null ? item.episode : (item.number != null ? item.number : ""));
  if (slug && (s !== "" || e !== "")) {
    return [sid || "x", slug, "t" + s, "e" + e].join("|");
  }
  if (item.link) return String(item.link);
  if (item.url) return String(item.url);
  if (item.id != null) return String(item.id);
  if (item.postId != null) return String(item.postId);
  return null;
}

function obtenerProgreso() {
  try {
    // Preferir clave por perfil; migrar legacy
    const k = pk("progreso");
    let raw = localStorage.getItem(k);
    if (!raw) {
      const legacy = localStorage.getItem("moviezone_progress");
      if (legacy) {
        try { localStorage.setItem(k, legacy); } catch (_) {}
        raw = legacy;
      }
    }
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function pctProgreso(segundos, duracion) {
  const seg = Math.max(0, Number(segundos) || 0);
  const dur = Math.max(0, Number(duracion) || 0);
  if (dur > 30) return Math.min(100, (seg / dur) * 100);
  // sin duración real: ~24 min episodio anime ≈ 1440s
  return Math.min(99, (seg / 1440) * 100);
}

function guardarProgreso(item, segundos, duracion) {
  segundos = Math.max(0, Math.floor(Number(segundos) || 0));
  duracion = Math.max(0, Math.floor(Number(duracion) || 0));
  const key = claveProgreso(item);
  if (!key || !item) return;

  const pct = pctProgreso(segundos, duracion);
  const all = obtenerProgreso();

  // Muy poco visto: no guardar (mín. ~10s)
  if (segundos < 10 && pct < 1.5) {
    if (all[key]) {
      delete all[key];
      try { localStorage.setItem(pk("progreso"), JSON.stringify(all)); } catch (_) {}
    }
    return;
  }
  // Más de la mitad / casi terminado: eliminar
  if (pct >= 50) {
    if (all[key]) {
      delete all[key];
      try { localStorage.setItem(pk("progreso"), JSON.stringify(all)); } catch (_) {}
    }
    return;
  }

  const epNum = item.episodio != null ? item.episodio : (item.episode != null ? item.episode : (item.number != null ? item.number : null));
  const seaNum = item.temporada != null ? item.temporada : (item.season != null ? item.season : null);
  const back =
    item.back_img ||
    item.still ||
    item.backdrop ||
    item.portada ||
    null;

  all[key] = {
    key: key,
    link: item.link || item.url || null,
    id: item.id || null,
    postId: item.postId || item.id || null,
    nombre: item.nombre || item.titulo || item.titulo_anime || null,
    titulo: item.titulo || item.nombre || null,
    titulo_anime: item.titulo_anime || item.nombre || item.titulo || null,
    portada: item.portada || null,
    back_img: back,
    still: item.still || null,
    backdrop: item.backdrop || null,
    tipo: item.tipo || item.type || null,
    year: item.year || null,
    slug: item.slug || null,
    source_id: item.source_id != null ? String(item.source_id) : null,
    fuente: item.fuente || item.source || null,
    temporada: seaNum != null ? Number(seaNum) : null,
    episodio: epNum != null ? Number(epNum) : null,
    season: seaNum != null ? Number(seaNum) : null,
    episode: epNum != null ? Number(epNum) : null,
    segundos: segundos,
    duracion: duracion,
    pct: Math.round(pct * 10) / 10,
    updated: Date.now(),
    tiene_player: true
  };

  const ordenados = Object.entries(all)
    .sort(function (a, b) { return (b[1].updated || 0) - (a[1].updated || 0); })
    .slice(0, 40);
  const obj = Object.fromEntries(ordenados);
  try {
    localStorage.setItem(pk("progreso"), JSON.stringify(obj));
    localStorage.setItem("moviezone_progress", JSON.stringify(obj)); // legacy mirror
  } catch (_) {}
}

function iniciarSeguimientoProgreso(item) {
  detenerSeguimientoProgreso(false);
  const key = claveProgreso(item);
  if (!key) return;
  const prev = obtenerProgreso()[key];
  progresoActual = {
    key: key,
    item: item,
    segundos: (prev && prev.segundos) || 0,
    duracion: (prev && prev.duracion) || 0
  };

  // Preferir <video> real (HLS / directo) si existe
  try {
    const vid = document.getElementById("player-video");
    if (vid && !progresoVideoBound) {
      const onTime = function () {
        if (!progresoActual) return;
        if (vid.currentTime != null) progresoActual.segundos = Math.floor(vid.currentTime);
        if (vid.duration && isFinite(vid.duration)) progresoActual.duracion = Math.floor(vid.duration);
      };
      const onSave = function () {
        if (!progresoActual) return;
        onTime();
        guardarProgreso(progresoActual.item, progresoActual.segundos, progresoActual.duracion);
        try { renderContinuarViendoEnGrid(); } catch (_) {}
        try { cargarContinuarViendo(); } catch (_) {}
      };
      vid.addEventListener("timeupdate", onTime);
      vid.addEventListener("pause", onSave);
      vid.addEventListener("ended", function () {
        // terminado → borrar
        if (progresoActual) {
          progresoActual.segundos = progresoActual.duracion || progresoActual.segundos;
          guardarProgreso(progresoActual.item, progresoActual.segundos, progresoActual.duracion || 1);
        }
      });
      progresoVideoBound = { vid: vid, onTime: onTime, onSave: onSave };
    }
  } catch (_) {}

  // Fallback iframes: +15s cada 15s
  progresoTimer = setInterval(function () {
    if (!progresoActual) return;
    const vid = document.getElementById("player-video");
    if (vid && vid.currentTime != null && !vid.paused) {
      progresoActual.segundos = Math.floor(vid.currentTime);
      if (vid.duration && isFinite(vid.duration)) progresoActual.duracion = Math.floor(vid.duration);
    } else {
      progresoActual.segundos += 15;
    }
    guardarProgreso(
      progresoActual.item,
      progresoActual.segundos,
      progresoActual.duracion || progresoActual.segundos + 60
    );
    try { renderContinuarViendoEnGrid(); } catch (_) {}
  }, 15000);
}

function detenerSeguimientoProgreso(guardar) {
  if (guardar === undefined) guardar = true;
  if (progresoTimer) {
    clearInterval(progresoTimer);
    progresoTimer = null;
  }
  try {
    if (progresoVideoBound && progresoVideoBound.vid) {
      progresoVideoBound.vid.removeEventListener("timeupdate", progresoVideoBound.onTime);
      progresoVideoBound.vid.removeEventListener("pause", progresoVideoBound.onSave);
      progresoVideoBound = null;
    }
  } catch (_) {}
  if (guardar && progresoActual) {
    guardarProgreso(
      progresoActual.item,
      progresoActual.segundos,
      progresoActual.duracion || progresoActual.segundos + 60
    );
  }
  progresoActual = null;
}

function listaProgresoPendiente(filtroSeccion) {
  const all = obtenerProgreso();
  let lista = Object.keys(all).map(function (k) {
    const x = all[k];
    if (!x) return null;
    x.key = x.key || k;
    return x;
  }).filter(Boolean);

  lista = lista.filter(function (x) {
    const pct = x.pct != null ? Number(x.pct) : pctProgreso(x.segundos, x.duracion);
    if ((x.segundos || 0) < 10) return false;
    if (pct >= 50) return false;
    const t = String(x.tipo || "").toLowerCase();
    const sid = String(x.source_id || "").toLowerCase();
    const fuente = String(x.fuente || x.source || "").toLowerCase();
    const esJk = sid === "5" || fuente === "jkanime" || fuente === "jk";
    const esAv1 = sid === "4" || fuente === "animeav1";
    const tieneEp = x.episodio != null || x.episode != null || x.number != null;
    // debe ser episodio (no solo ficha de película)
    if (!tieneEp && !/serie|anime|dorama|tv|ova|ona/i.test(t)) return false;

    if (filtroSeccion === "series") {
      if (esJk || esAv1) return false;
      if (/anime|ova|ona/i.test(t) && !/serie|dorama/i.test(t)) return false;
      return true;
    }
    if (filtroSeccion === "jk") {
      return esJk || /jkanime/i.test(String(x.link || ""));
    }
    if (filtroSeccion === "anime") {
      if (esJk) return false;
      // AV1 u otros animes
      return esAv1 || /anime|ova|ona|especial/i.test(t) || tieneEp;
    }
    return true;
  });

  lista.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
  return lista.slice(0, 20);
}

function fmtTiempoRestante(segundos, duracion) {
  const seg = Math.max(0, Number(segundos) || 0);
  const dur = Math.max(0, Number(duracion) || 0);
  const pct = pctProgreso(seg, dur);
  if (dur > 30) {
    const left = Math.max(0, dur - seg);
    const m = Math.floor(left / 60);
    const s = Math.floor(left % 60);
    return m + ":" + String(s).padStart(2, "0") + " rest. · " + Math.round(pct) + "%";
  }
  return Math.round(pct) + "% visto";
}

function buildContinuarViendoNode(filtroSeccion) {
  const lista = listaProgresoPendiente(filtroSeccion);
  if (!lista.length) return null;

  const row = document.createElement("div");
  row.id = "mz-continuar-grid";
  row.className = "mz-continuar-grid";
  row.innerHTML =
    '<div class="mz-continuar-grid-head">' +
    "<h3>Continuar viendo</h3>" +
    '<span class="mz-continuar-grid-hint">Desliza →</span>' +
    "</div>" +
    '<div class="mz-continuar-grid-row" role="list"></div>';

  const strip = row.querySelector(".mz-continuar-grid-row");
  lista.forEach(function (item) {
    const card = document.createElement("div");
    card.className = "mz-cw-card";
    card.setAttribute("role", "listitem");
    const img =
      item.back_img ||
      item.still ||
      item.backdrop ||
      item.portada ||
      (typeof PLACEHOLDER !== "undefined" ? PLACEHOLDER : "");
    const ep =
      item.episodio != null
        ? item.episodio
        : item.episode != null
          ? item.episode
          : null;
    const sea =
      item.temporada != null
        ? item.temporada
        : item.season != null
          ? item.season
          : null;
    let epLab = "";
    if (sea != null && ep != null) epLab = "T" + sea + " · E" + ep;
    else if (ep != null) epLab = "Episodio " + ep;
    else epLab = "Continuar";
    const title = item.titulo_anime || item.nombre || item.titulo || "Sin título";
    const pct = item.pct != null ? Number(item.pct) : pctProgreso(item.segundos, item.duracion);
    const rest = fmtTiempoRestante(item.segundos, item.duracion);
    card.innerHTML =
      '<div class="mz-cw-thumb">' +
      '<img src="' +
      escapeHtml(img) +
      '" alt="" loading="lazy" />' +
      '<div class="mz-cw-bar"><span style="width:' +
      Math.min(100, Math.max(2, pct)) +
      '%"></span></div>' +
      "</div>" +
      '<div class="mz-cw-meta">' +
      "<h4>" +
      escapeHtml(title) +
      "</h4>" +
      '<p class="mz-cw-ep">' +
      escapeHtml(epLab) +
      "</p>" +
      '<p class="mz-cw-rest">' +
      escapeHtml(rest) +
      "</p>" +
      "</div>";
    card.addEventListener("click", function () {
      abrirDesdeProgreso(item);
    });
    strip.appendChild(card);
  });
  return row;
}

/** Inserta Continuar viendo: en home AV1/JK dentro del grid (arriba de Nuevos); en series como fila propia */
function renderContinuarViendoEnGrid() {
  const gridView = document.getElementById("grid-view");
  const resultsGrid = document.getElementById("results-grid");
  if (!gridView || vistaActual !== "grid") return;

  const sec = gridSeccion;
  const enSeriesAnime =
    (gridModo === "categoria" || gridModo === "search") &&
    (sec === "series" || sec === "anime" || sec === "jk");
  if (!enSeriesAnime) {
    document.getElementById("mz-continuar-grid")?.remove();
    return;
  }

  const filtro = sec === "jk" ? "jk" : sec;
  const node = buildContinuarViendoNode(filtro);

  // Home AV1 / JK: results-grid es mz-av1-home-wrap → primer hijo, antes de Nuevos
  if (resultsGrid && resultsGrid.classList.contains("mz-av1-home-wrap")) {
    const old = resultsGrid.querySelector("#mz-continuar-grid");
    if (old) old.remove();
    if (!node) return;
    const firstSec = resultsGrid.querySelector(".mz-av1-home-section");
    if (firstSec) resultsGrid.insertBefore(node, firstSec);
    else resultsGrid.insertBefore(node, resultsGrid.firstChild);
    return;
  }

  // Series / grid plano: encima del catálogo
  let row = document.getElementById("mz-continuar-grid");
  if (!node) {
    if (row) row.remove();
    return;
  }
  if (row && row.parentNode && !resultsGrid?.contains(row)) {
    // reemplazar contenido del row existente fuera
    row.replaceWith(node);
    return;
  }
  if (row && resultsGrid && resultsGrid.contains(row)) {
    row.replaceWith(node);
    return;
  }
  const anchor =
    document.getElementById("results-skeleton") ||
    document.getElementById("results-grid") ||
    document.getElementById("results-title");
  if (anchor && anchor.parentNode) {
    if (anchor.id === "results-grid" && resultsGrid) {
      resultsGrid.parentNode.insertBefore(node, resultsGrid);
    } else {
      anchor.parentNode.insertBefore(node, anchor);
    }
  } else if (gridView) {
    gridView.appendChild(node);
  }
}


function cargarContinuarViendo() {
  const all = obtenerProgreso();
  const lista = Object.values(all)
    .filter(function (x) {
      if (!x) return false;
      const pct = x.pct != null ? Number(x.pct) : pctProgreso(x.segundos, x.duracion);
      return (x.segundos || 0) > 25 && pct < 50;
    })
    .sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); })
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

  lista.forEach(function (item) {
    item.tiene_player = true;
    const card = crearMediaCard(item);
    const pct =
      item.pct != null
        ? Number(item.pct)
        : item.duracion > 0
          ? Math.min(100, Math.round((item.segundos / item.duracion) * 100))
          : Math.min(95, Math.round((item.segundos / 600) * 100));
    const bar = document.createElement("div");
    bar.className = "progress-bar-wrap";
    bar.innerHTML = '<div class="progress-bar-fill" style="width:' + pct + '%"></div>';
    card.querySelector(".poster-wrapper")?.appendChild(bar);
    const clone = card.cloneNode(true);
    clone.addEventListener("click", function () {
      abrirDesdeProgreso(item);
    });
    cont.appendChild(clone);
  });
}

// ---------- Recién añadidos ----------
async function cargarRecienAnadidos() {
    try {
        const res = await fetch("/api/recien?limit=12");
        const data = await res.json();
        // Solo AV1/cine/etc. — no JKanime en inicio
        const lista = typeof sinItemsJk === "function"
          ? sinItemsJk(data.resultados || [])
          : (data.resultados || []);
        renderCarousel("carousel-recien", lista);
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


window.asegurarEmbedsEpisodio = asegurarEmbedsEpisodio;
window.streamUrlParaNoAds = streamUrlParaNoAds;
window.resolverPlayUrlNoAds = resolverPlayUrlNoAds;


/** Al volver de una pestaña de descarga: descongelar UI */
(function mzRestoreAfterExternal() {
  function restore() {
    try {
      const p = document.getElementById("mz-mep-dl-panel");
      if (p) p.classList.add("hidden");
      document.body.classList.remove("mz-mep-dl-open");
      // Forzar repaint (iOS a veces deja capa negra)
      const panel = document.getElementById("details-panel");
      if (panel && !panel.classList.contains("hidden")) {
        panel.style.transform = "translateZ(0)";
        requestAnimationFrame(function () {
          panel.style.transform = "";
        });
      }
      document.body.style.pointerEvents = "";
      document.documentElement.style.pointerEvents = "";
    } catch (_) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") restore();
  });
  window.addEventListener("pageshow", function (ev) {
    restore();
  });
  window.addEventListener("focus", function () {
    setTimeout(restore, 50);
  });
})();
