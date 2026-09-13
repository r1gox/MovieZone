/**
 * MovieZone — Modo detalle/player estilo Koiflix SOLO en PC
 * para series y animes. Usa los mismos datos que ya pinta app.js.
 * No cambia el flujo: solo clases CSS + relleno del hero.
 */

const KOI_MQ = window.matchMedia("(min-width: 1025px)");

export function isKoiDesktop() {
  return KOI_MQ.matches;
}

export function isSerieOrAnime(item) {
  if (!item) return false;
  const t = String(item.tipo || item.type || "").toLowerCase();
  return /serie|anime|dorama|tv|ova|ona/.test(t);
}

/** Activa/desactiva el layout Koiflix en body */
export function setKoiMode(item) {
  const on = isKoiDesktop() && isSerieOrAnime(item);
  document.body.classList.toggle("koi-desktop", on);
  const hero = document.getElementById("koi-hero");
  if (hero) hero.setAttribute("aria-hidden", on ? "false" : "true");
  return on;
}

export function clearKoiMode() {
  document.body.classList.remove("koi-desktop", "player-open");
  const hero = document.getElementById("koi-hero");
  if (hero) hero.setAttribute("aria-hidden", "true");
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
export function fillKoiHero(item) {
  if (!item || !isKoiDesktop() || !isSerieOrAnime(item)) return;

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

  const metaEl = document.getElementById("koi-hero-meta");
  if (metaEl) {
    const gens = genresText(item);
    metaEl.innerHTML = `<span>${langLabel(item)}</span>${gens ? " • " + gens : ""}`;
  }

  const synEl = document.getElementById("koi-hero-synopsis");
  if (synEl) {
    synEl.textContent =
      (item.descripcion && String(item.descripcion).trim()) ||
      document.getElementById("details-synopsis")?.textContent ||
      "";
  }

  const playText = document.getElementById("koi-btn-play-text");
  if (playText) playText.textContent = firstEpisodeLabel(item);

  // Extra detalles (año, rating, estado)
  const extra = document.getElementById("koi-extra-details");
  if (extra) {
    const parts = [];
    if (item.year) parts.push(`<strong>Año:</strong> ${item.year}`);
    const rating = item.calificacion || item.rating || item.imdb?.rating;
    if (rating) parts.push(`<strong>Rating:</strong> ${rating}`);
    if (item.estado) parts.push(`<strong>Estado:</strong> ${item.estado}`);
    if (item.formato) parts.push(`<strong>Formato:</strong> ${item.formato}`);
    extra.innerHTML = parts.join("<br>");
    extra.classList.remove("open");
  }

  const toggleBtn = document.getElementById("koi-toggle-details");
  if (toggleBtn) toggleBtn.textContent = "MÁS DETALLES";
}

/** Actualiza título de episodio en layout player PC */
export function setKoiPlayerEpisodeTitle(label) {
  const el = document.getElementById("koi-player-ep-title");
  if (el) el.textContent = label || "";
}

/** Marca player abierto / cerrado para CSS */
export function setKoiPlayerOpen(on) {
  document.body.classList.toggle("player-open", !!on);
}

/** Enlaza botones del hero (una sola vez) */
export function bindKoiHeroControls(handlers = {}) {
  const playBtn = document.getElementById("koi-btn-play");
  const bookmarkBtn = document.getElementById("koi-btn-bookmark");
  const toggleBtn = document.getElementById("koi-toggle-details");

  if (playBtn && !playBtn.dataset.koiBound) {
    playBtn.dataset.koiBound = "1";
    playBtn.addEventListener("click", () => {
      if (typeof handlers.onPlay === "function") handlers.onPlay();
      else {
        // Fallback: primer episodio del grid
        const first =
          document.querySelector("#episodes-container [data-ep]") ||
          document.querySelector("#episodes-container button") ||
          document.querySelector("#episodes-container .ep-card") ||
          document.querySelector("#episodes-container > *");
        first?.click?.();
      }
    });
  }

  if (bookmarkBtn && !bookmarkBtn.dataset.koiBound) {
    bookmarkBtn.dataset.koiBound = "1";
    bookmarkBtn.addEventListener("click", () => {
      const fav = document.getElementById("btn-favorito");
      if (fav) fav.click();
      else if (typeof handlers.onBookmark === "function") handlers.onBookmark();
    });
  }

  if (toggleBtn && !toggleBtn.dataset.koiBound) {
    toggleBtn.dataset.koiBound = "1";
    toggleBtn.addEventListener("click", () => {
      const extra = document.getElementById("koi-extra-details");
      if (!extra) return;
      const open = extra.classList.toggle("open");
      toggleBtn.textContent = open ? "MENOS DETALLES" : "MÁS DETALLES";
    });
  }
}
