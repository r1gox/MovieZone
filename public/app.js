// ======================================================
// MOVIEZONE — app.js (adaptado al template "Cypher")
// ======================================================

import { initWakeupNotice } from './js/ui/wakeup.js';
import { getCatalog, searchCatalog } from './js/data/catalogo.js';

const LIMIT = 28;

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
    "voe.sx", "voe.", "doodstream", "dood.", "ds2play", "streamtape",
    "mixdrop", "upstream", "vidmoly", "mp4upload", "uqload",
    "vidhide", "vidguard", "lulustream", "filelions", "yourupload",
    "supervideo", "krakenfiles", "ok.ru"
];

const REPRODUCTORES_BLOQUEADOS = [
    "sblongvu", "sblanh", "sbfull", "sbfast", "sbthe", "sbanh",
    "lvturbo", "diasfem", "fembed", "4shared", "lamovie",
    "youtube.com", "youtu.be", "play.php", "example.com", "hackstore.fo"
];

function esEmbedInvalido(url) {
    if (!url) return true;
    const u = String(url).toLowerCase();
    if (REPRODUCTORES_BLOQUEADOS.some(d => u.includes(d))) return true;
    if (!REPRODUCTORES_PERMITIDOS.some(d => u.includes(d))) return true;
    return false;
}


function normalizarEmbeds(raw) {
    if (!raw) return [];
    if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map(e => {
        if (typeof e === "string" && e.startsWith("http")) return { url: e };
        if (e && e.url) return e;
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
    "streamwish.com": "StreamWish",
    "filemoon.sx": "Filemoon", "filemoon.to": "Filemoon",
    "mixdrop.co": "Mixdrop", "mixdrop.to": "Mixdrop",
    "vidhide.com": "VidHide",
    "vidguard.to": "VidGuard",
    "uqload.com": "Uqload",
    "streamsb.com": "StreamSB",
    "fembed.com": "Fembed",
    "upstream.to": "Upstream",
    "vidmoly.me": "Vidmoly", "vidmoly.to": "Vidmoly",
    "mp4upload.com": "Mp4Upload",
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
        busquedaEsLocal = true;
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

// Estado extra
let busquedaEsLocal = true; // true = resultados locales, false = ya buscamos online

async function fetchBusqueda(termino, source = "local", page = 1, limit = LIMIT) {
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
            const data = await fetchBusqueda(gridTermino, busquedaEsLocal ? "local" : "online", gridPage, LIMIT);
            lista = data.resultados;
            gridTotalItems = data.total || lista.length;
            gridTotalPages = Math.max(1, Math.ceil(gridTotalItems / LIMIT));
            actualizarBotonOnline(false);
            // Mostrar / ocultar botón "Buscar online"
            actualizarBotonOnline(busquedaEsLocal);
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
    const rating = item.calificacion ? Number(item.calificacion).toFixed(1) : "0";
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
            <div class="rating-badge"><ion-icon name="star"></ion-icon> ${escapeHtml(rating)}</div>
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
    heroRating.textContent = item.calificacion ? Number(item.calificacion).toFixed(1) : "0";
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

    document.getElementById("details-year").textContent = item.year || "-";
    document.getElementById("details-rating").textContent = item.calificacion ? Number(item.calificacion).toFixed(1) : "0";
    document.getElementById("details-synopsis").textContent = item.descripcion || "Sin descripción disponible.";

    const generosEl = document.getElementById("details-genres");
    generosEl.innerHTML = "";
    if (item.genero) {
        String(item.genero).split(",").map(g => g.trim()).filter(Boolean).forEach(g => {
            generosEl.innerHTML += `<span class="genre-tag">${escapeHtml(g)}</span>`;
        });
    }
    if (item.idiomas && item.idiomas.length) {
        generosEl.innerHTML += `<span class="genre-tag">${escapeHtml(item.idiomas.join(", "))}</span>`;
    }
    if (item.calidad && item.calidad.length) {
        generosEl.innerHTML += `<span class="genre-tag">${escapeHtml(item.calidad.join(", "))}</span>`;
    }

    actualizarBotonFavorito();

    videoContainer.classList.add("hidden");
    playerIframe.src = "about:blank";

    document.getElementById("servers-section").querySelector("#servers-loading").classList.remove("hidden");
    document.getElementById("servers-container").innerHTML = "";
    document.getElementById("seasons-section").classList.add("hidden");
    document.getElementById("downloads-section").classList.add("hidden");

    // Enriquecer siempre que falte descripción, players o episodios (al entrar, no solo al pulsar Actualizar)
    const faltaDescripcion = !item.descripcion || String(item.descripcion).trim().length < 20;
    const faltaPlayers =
        !item.embeds || item.embeds.length === 0 ||
        (Array.isArray(item.embeds) && item.embeds.every(e => esEmbedInvalido(e.url)));
    const faltaEpisodios =
        (item.tipo === "Serie" || item.tipo === "Anime") &&
        (!item.episodios || item.episodios.length === 0);

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
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const res = await fetch(`/api/detalle?${params.toString()}`, { cache: "no-store", signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const completo = await res.json();
                if (completo.embeds) completo.embeds = normalizarEmbeds(completo.embeds);
                Object.assign(item, completo);
                if (item.tiene_player || itemTieneVideo(item)) item.tiene_player = true;
                seleccionActual = item;

                // Repintar metadatos que ahora sí vienen (descripción, rating, portada…)
                document.getElementById("details-poster").src = item.portada || PLACEHOLDER;
                document.getElementById("details-title").textContent = item.nombre || "Sin título";
                document.getElementById("details-year").textContent = item.year || "-";
                document.getElementById("details-rating").textContent = item.calificacion ? Number(item.calificacion).toFixed(1) : "0";
                document.getElementById("details-synopsis").textContent = item.descripcion || "Sin descripción disponible.";

                const generosEl2 = document.getElementById("details-genres");
                generosEl2.innerHTML = "";
                if (item.genero) {
                    String(item.genero).split(",").map(g => g.trim()).filter(Boolean).forEach(g => {
                        generosEl2.innerHTML += `<span class="genre-tag">${escapeHtml(g)}</span>`;
                    });
                }
                if (item.idiomas && item.idiomas.length) {
                    generosEl2.innerHTML += `<span class="genre-tag">${escapeHtml(item.idiomas.join(", "))}</span>`;
                }
                if (item.calidad && item.calidad.length) {
                    generosEl2.innerHTML += `<span class="genre-tag">${escapeHtml(item.calidad.join(", "))}</span>`;
                }
            }
        } catch (err) {
            console.error("Error o timeout enriqueciendo detalle:", err);
        }
    }

    document.getElementById("servers-loading").classList.add("hidden");

    const esSerieOAnime = item.tipo === "Serie" || item.tipo === "Anime";
    if (esSerieOAnime && Array.isArray(item.episodios) && item.episodios.length > 0) {
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
    playerIframe.src = "about:blank";
    videoContainer.classList.add("hidden");
    cargarContinuarViendo();
}
document.getElementById("btn-close-modal").addEventListener("click", cerrarDetalle);
document.getElementById("modal-backdrop-close").addEventListener("click", cerrarDetalle);
document.getElementById("close-player-btn").addEventListener("click", () => {
    detenerSeguimientoProgreso(true);
    videoContainer.classList.add("hidden");
    playerIframe.src = "about:blank";
    document.body.classList.remove("player-open");
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

function renderTemporadas(item) {
    const tabsContainer = document.getElementById("seasons-tabs-container");
    const temporadas = item.temporadas && item.temporadas.length ? item.temporadas : [1];

    tabsContainer.innerHTML = temporadas.map((s, i) =>
        `<button class="season-tab${i === 0 ? " active" : ""}" data-season="${s}">Temporada ${s}</button>`
    ).join("");

    const loadSeason = async (season) => {
        const episodesContainer = document.getElementById("episodes-container");
        episodesContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando episodios...</p></div>`;
        try {
            const res = await fetch(`/api/episodios?${buildEpisodiosQuery(item, season)}`, { cache: "no-store" });
            const data = await res.json();
            item.episodios = data.episodios || [];
            if (data.slug) item.slug = data.slug;
            if (data.source_id) item.source_id = data.source_id;
            if (data.link) item.link = data.link;
            renderEpisodios(item, season);
            // Si el 1er ep ya trae players, mostrarlos
            const first = (item.episodios || [])[0];
            if (first && (first.embeds?.length || first.video)) {
                renderServidoresYDescargas(first.embeds || [], first.downloads || [], first.video, item);
            }
        } catch (err) {
            console.error(err);
            episodesContainer.innerHTML = `<p style="color:var(--text-muted);">Error cargando episodios.</p>`;
        }
    };

    tabsContainer.querySelectorAll(".season-tab").forEach(tab => {
        tab.addEventListener("click", async () => {
            tabsContainer.querySelectorAll(".season-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            await loadSeason(parseInt(tab.dataset.season));
        });
    });

    // Cargar primera temporada al abrir
    loadSeason(temporadas[0] || 1);
}

function renderEpisodios(item, season = 1) {
    const episodesContainer = document.getElementById("episodes-container");
    episodesContainer.innerHTML = "";

    if (!item.episodios || item.episodios.length === 0) {
        episodesContainer.innerHTML = `<p style="color:var(--text-muted);">No hay episodios en esta temporada.</p>`;
        return;
    }

    item.episodios.forEach((episodio, index) => {
        const tieneVideo = Boolean(episodio.video) || (Array.isArray(episodio.embeds) && episodio.embeds.length > 0);
        const btn = document.createElement("button");
        btn.className = "episode-btn" + (index === 0 ? " active" : "");
        btn.textContent = episodio.episode || (index + 1);
        btn.title = episodio.nombre || `Episodio ${episodio.episode || index + 1}`;
        if (!tieneVideo) btn.style.opacity = "0.55";

        btn.addEventListener("click", async () => {
            episodesContainer.querySelectorAll(".episode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const epNum = episodio.episode || (index + 1);
            const seasonNum = episodio.season || season || 1;
            document.getElementById("details-title").textContent =
                `${item.nombre} - ${episodio.nombre || "Episodio " + epNum}`;

            // Si ya tiene players → mostrar
            if ((episodio.embeds && episodio.embeds.length) || episodio.video) {
                renderServidoresYDescargas(episodio.embeds || [], episodio.downloads || [], episodio.video, item);
                btn.style.opacity = "1";
                return;
            }

            // Cargar de API → se guarda en Supabase en el backend
            const serversContainer = document.getElementById("servers-container");
            if (serversContainer) {
                serversContainer.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Cargando servidores...</p></div>`;
            }
            try {
                const params = new URLSearchParams();
                params.set("temporada", String(seasonNum));
                params.set("episodio", String(epNum));
                if (item.slug) params.set("slug", item.slug);
                if (item.source_id) params.set("source_id", item.source_id);
                if (item.link) params.set("link", item.link);
                if (item.tipo) params.set("tipo", item.tipo);

                const res = await fetch(`/api/capitulo?${params.toString()}`, { cache: "no-store" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Error");

                episodio.embeds = normalizarEmbeds(data.embeds || []);
                episodio.video = data.reproductor || null;
                btn.style.opacity = episodio.embeds.length ? "1" : "0.55";
                renderServidoresYDescargas(episodio.embeds, [], episodio.video, item);
            } catch (err) {
                console.error(err);
                if (serversContainer) {
                    serversContainer.innerHTML = `<p style="color:var(--text-muted);">No se pudieron cargar los servidores de este episodio.</p>`;
                }
            }
        });

        episodesContainer.appendChild(btn);
    });
}

// ---------- Servidores y descargas ----------
function reproducir(embed, item) {
    if (!embed?.url) return;
    videoContainer.classList.remove("hidden");
    playerIframe.src = embed.url;
    playerTitle.textContent = item?.nombre || "Reproduciendo...";
    iniciarSeguimientoProgreso(item || seleccionActual);
    // evita pull-to-refresh sobre el player
    document.body.classList.add("player-open");
    // Scroll automático al reproductor
    requestAnimationFrame(() => {
        try {
            videoContainer.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_) {
            videoContainer.scrollIntoView(true);
        }
    });
}

function renderServidoresYDescargas(embedsRaw, downloadsRaw, fallbackUrl, item) {
    embedsRaw = normalizarEmbeds(embedsRaw);

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

    if (
        Array.isArray(embedsRaw) &&
        embedsRaw.length > 0
    ) {

        embeds = embedsRaw.filter(
            e =>
                e &&
                e.url &&
                !esEmbedInvalido(e.url)
        );

    } else if (
        fallbackUrl &&
        !esEmbedInvalido(fallbackUrl)
    ) {

        embeds = [
            {
                url: fallbackUrl,
                server: "Servidor"
            }
        ];

    }


    /* MovieZone / Vimeo primero */

    embeds.sort((a, b) => {

        const aV =
            /vimeos/i.test(a.url || "") ||
            a.server === "MovieZone";

        const bV =
            /vimeos/i.test(b.url || "") ||
            b.server === "MovieZone";

        return (
            (bV ? 1 : 0) -
            (aV ? 1 : 0)
        );

    });


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
     * Estado inicial cerrado
     */

    serversContainer.classList.add(
        "mz-collapsed-content"
    );

    serversToggle.classList.remove(
        "open"
    );


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
     * Crear servidores
     */

    if (embeds.length > 0) {

        embeds.forEach(
            (embed, index) => {

                const nombre =
                    detectarServidor(
                        embed.url,
                        embed.server ||
                        embed.name
                    );

                const lang =
                    embed.lang ||
                    embed.idioma ||
                    "";

                const quality =
                    embed.quality ||
                    embed.calidad ||
                    "";


                const row =
                    document.createElement(
                        "div"
                    );


                row.className =
                    "server-row" +
                    (
                        lang
                            .toLowerCase()
                            .includes("latino")
                            ? " latino-highlight"
                            : ""
                    );


                row.innerHTML = `

                    <div class="server-name-group">

                        <ion-icon
                            name="play-circle-outline"
                            class="server-logo">
                        </ion-icon>

                        <div class="server-info">

                            <span class="server-title">

                                ${escapeHtml(nombre)}

                                ${
                                    lang
                                        .toLowerCase()
                                        .includes("latino")
                                        ? '<span class="latino-badge">Latino</span>'
                                        : ""
                                }

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

                            </span>

                        </div>

                    </div>


                    <div class="server-actions">

                        <button
                            class="btn-action play"
                            data-index="${index}"
                        >

                            <ion-icon
                                name="play">
                            </ion-icon>

                            Reproducir

                        </button>

                    </div>

                `;


                row
                    .querySelector(
                        ".btn-action.play"
                    )
                    .addEventListener(
                        "click",
                        () => reproducir(
                            embed,
                            item
                        )
                    );


                serversContainer.appendChild(
                    row
                );

            }
        );

    } else {

        serversContainer.innerHTML = `

            <div
                style="
                    color:var(--text-muted);
                    padding:20px 0;
                    text-align:center;
                "
            >

                Este contenido todavía no está disponible

            </div>

        `;

    }


    /* =========================================================
       DESCARGAS
       ========================================================= */

    const downloads =
        Array.isArray(downloadsRaw)
            ? downloadsRaw
            : [];


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
        busquedaEsLocal = true;          // ← importante
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
