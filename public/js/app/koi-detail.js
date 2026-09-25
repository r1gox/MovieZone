// js/app/koi-detail.js — detalle estilo Koiflix (PC)
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
    // cerrarDetalle vive en app.js → window
    if (/^\/detalle\//i.test(path)) {
      try {
        if (typeof window.cerrarDetalle === "function") window.cerrarDetalle(false);
        else history.back();
      } catch (_) {
        try { history.back(); } catch (__) {}
      }
      return;
    }
    try {
      if (typeof window.cerrarDetalle === "function") window.cerrarDetalle(false);
      else history.back();
    } catch (_) {
      try { history.back(); } catch (__) {}
    }
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

// Exponer en window por si otros scripts (koi-episode-player) lo necesitan
try {
  if (typeof window !== "undefined") {
    window.isKoiDesktop = isKoiDesktop;
    window.isSerieOrAnime = isSerieOrAnime;
    window.isPeliculaItem = isPeliculaItem;
    window.setKoiMode = setKoiMode;
    window.clearKoiMode = clearKoiMode;
    window.fillKoiHero = fillKoiHero;
    window.bindKoiHeroControls = bindKoiHeroControls;
    window.setKoiPlayerEpisodeTitle = setKoiPlayerEpisodeTitle;
    window.setKoiPlayerOpen = setKoiPlayerOpen;
  }
} catch (_) {}

export {
  isKoiDesktop,
  isSerieOrAnime,
  isPeliculaItem,
  isRatingMalFuente,
  isRatingImdbFuenteBz,
  setKoiMode,
  mzScrollPanelTo,
  clearKoiMode,
  bindKoiBackBtn,
  firstEpisodeLabel,
  genresText,
  langLabel,
  fillKoiHero,
  setKoiPlayerEpisodeTitle,
  setKoiPlayerOpen,
  bindKoiHeroControls,
};
