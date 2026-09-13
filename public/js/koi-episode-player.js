/**
 * MovieZone — Vista de episodio estilo Koiflix (solo PC ≥ 1025px)
 *
 * Uso desde app.js (click episodio):
 *   if (window.innerWidth >= 1025 && isSerieOrAnime(item)) {
 *     await window.mzKoiOpenEpisode(item, episodio, seasonNum, epNum);
 *     return;
 *   }
 *
 * No sustituye el flujo móvil. No depende de "elige un servidor" a pantalla completa.
 * Carga el primer mirror disponible en el iframe (como Koiflix); el resto son chips.
 */
(function () {
  "use strict";

  var PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="#111" width="100%" height="100%"/></svg>'
    );

  var _ctx = null; // { item, episodio, season, episode, embeds }

  function $(id) {
    return document.getElementById(id);
  }

  function ensureDom() {
    if ($("mz-koi-ep-view")) return;

    var root = document.createElement("div");
    root.id = "mz-koi-ep-view";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="mz-kp-topbar">' +
      '  <button type="button" class="mz-kp-back" id="mz-kp-back">' +
      "    ← Volver" +
      "  </button>" +
      '  <span class="mz-kp-topbar-title" id="mz-kp-topbar-title"></span>' +
      "</div>" +
      '<section class="mz-kp-hero">' +
      '  <div class="mz-kp-video-wrap" id="mz-kp-video-wrap">' +
      '    <div class="mz-kp-video-placeholder" id="mz-kp-placeholder">' +
      '      <div class="spin"></div>' +
      "      <span>Cargando episodio…</span>" +
      "    </div>" +
      '    <iframe id="mz-kp-iframe" src="about:blank" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="no-referrer"></iframe>' +
      "  </div>" +
      "</section>" +
      '<section class="mz-kp-layout">' +
      '  <div class="mz-kp-info">' +
      '    <button type="button" class="mz-kp-anime-link" id="mz-kp-anime-title"></button>' +
      '    <div class="mz-kp-ep-title-row">' +
      '      <h1 class="mz-kp-ep-title" id="mz-kp-ep-title">Episodio</h1>' +
      "    </div>" +
      '    <div class="mz-kp-meta" id="mz-kp-meta"></div>' +
      '    <div class="mz-kp-synopsis"><p id="mz-kp-synopsis"></p></div>' +
      '    <div class="mz-kp-servers">' +
      '      <div class="mz-kp-servers-label">Reproductores</div>' +
      '      <div class="mz-kp-servers-list" id="mz-kp-servers"></div>' +
      "    </div>" +
      "  </div>" +
      '  <div class="mz-kp-sidebar">' +
      '    <h3 class="mz-kp-sidebar-title">Episodios</h3>' +
      '    <div class="mz-kp-ep-list" id="mz-kp-ep-list"></div>' +
      "  </div>" +
      "</section>";

    document.body.appendChild(root);

    $("mz-kp-back").addEventListener("click", closeView);
    $("mz-kp-anime-title").addEventListener("click", function () {
      // Volver al detalle de la serie (cerrar esta vista)
      closeView();
    });
  }

  function isPc() {
    return window.matchMedia("(min-width: 1025px)").matches;
  }

  function epNumOf(ep, fallback) {
    return Number(ep.episode || ep.episodio || ep.episode_number || fallback || 0) || 0;
  }

  function seasonOf(ep, fallback) {
    return Number(ep.season || ep.temporada || fallback || 1) || 1;
  }

  function epLabel(ep, n) {
    var name = String(ep.nombre || ep.titulo || "").trim();
    if (!name || /^T\d+E\d+$/i.test(name) || name === String(n)) {
      name = "Episodio " + n;
    }
    return "E" + n + " - " + name;
  }

  function durationOf(ep, item) {
    return (
      ep.duracion ||
      ep.runtime ||
      ep.duration ||
      ep.duracion_texto ||
      item.duracion_texto ||
      "24m"
    );
  }

  function langOf(ep) {
    var e = ep.embeds || ep.reproductores || [];
    for (var i = 0; i < e.length; i++) {
      var idm = e[i] && (e[i].idioma || e[i].lang);
      if (idm) return String(idm);
    }
    return "Subtitulado";
  }

  function setPlaceholder(on, text) {
    var ph = $("mz-kp-placeholder");
    if (!ph) return;
    if (on) {
      ph.classList.remove("hidden");
      var span = ph.querySelector("span");
      if (span && text) span.textContent = text;
    } else {
      ph.classList.add("hidden");
    }
  }

  function setIframe(url) {
    var iframe = $("mz-kp-iframe");
    if (!iframe) return;
    if (!url) {
      iframe.src = "about:blank";
      setPlaceholder(true, "Cargando episodio…");
      return;
    }
    setPlaceholder(false);
    iframe.src = url;
  }

  function playUrlFromEmbed(emb) {
    if (!emb) return null;
    if (emb.stream_url) return emb.stream_url;
    if (emb.hls_resolve) return emb.hls_resolve;
    if (emb.url) return emb.url;
    if (typeof emb === "string") return emb;
    return null;
  }

  function renderServers(embeds) {
    var box = $("mz-kp-servers");
    if (!box) return;
    box.innerHTML = "";
    if (!embeds || !embeds.length) {
      box.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Sin mirrors aún</span>';
      return;
    }
    embeds.forEach(function (emb, idx) {
      var url = playUrlFromEmbed(emb);
      if (!url) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mz-kp-srv-btn" + (idx === 0 ? " active" : "");
      var name =
        emb.servidor ||
        emb.server ||
        emb.name ||
        emb.provider ||
        "Servidor " + (idx + 1);
      var idioma = emb.idioma || emb.lang || "";
      btn.textContent = idioma ? name + " · " + idioma : name;
      btn.addEventListener("click", function () {
        box.querySelectorAll(".mz-kp-srv-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        // Si hay helper global de MovieZone para resolve/HLS, usarlo
        if (typeof window.reproducir === "function") {
          try {
            // Reutilizar player principal si existe, y copiar al iframe koi
            window.reproducir(emb, _ctx && _ctx.item);
          } catch (_) {}
        }
        setIframe(url);
      });
      box.appendChild(btn);
    });
  }

  function renderSidebar(item, currentEp, currentSeason) {
    var list = $("mz-kp-ep-list");
    if (!list) return;
    list.innerHTML = "";

    var eps = Array.isArray(item.episodios) ? item.episodios.slice() : [];
    eps.sort(function (a, b) {
      var sa = seasonOf(a, 1);
      var sb = seasonOf(b, 1);
      if (sa !== sb) return sa - sb;
      return epNumOf(a, 0) - epNumOf(b, 0);
    });

    if (!eps.length) {
      list.innerHTML =
        '<p style="color:#64748b;padding:8px">No hay episodios en la lista.</p>';
      return;
    }

    eps.forEach(function (ep, idx) {
      var n = epNumOf(ep, idx + 1);
      var s = seasonOf(ep, 1);
      var playing = n === Number(currentEp) && s === Number(currentSeason);
      var thumb =
        ep.still ||
        ep.portada ||
        ep.imagen ||
        ep.image ||
        ep.thumbnail ||
        item.portada ||
        item.backdrop ||
        PLACEHOLDER;
      var dur = durationOf(ep, item);
      var lang = langOf(ep);

      var card = document.createElement("button");
      card.type = "button";
      card.className = "mz-kp-ep-card" + (playing ? " playing" : "");
      card.innerHTML =
        '<div class="mz-kp-ep-thumb">' +
        (playing ? '<div class="mz-kp-badge-playing">Reproduciendo</div>' : "") +
        '<img src="' +
        String(thumb).replace(/"/g, "") +
        '" alt="" loading="lazy" onerror="this.style.opacity=.3"/>' +
        '<span class="mz-kp-badge-dur">' +
        String(dur).replace(/</g, "") +
        "</span>" +
        "</div>" +
        '<div class="mz-kp-ep-info">' +
        '<div class="mz-kp-ep-name">' +
        epLabel(ep, n).replace(/</g, "") +
        "</div>" +
        '<div class="mz-kp-ep-lang">' +
        String(lang).replace(/</g, "") +
        "</div>" +
        "</div>";

      card.addEventListener("click", function () {
        if (playing) return;
        openEpisode(item, ep, s, n);
      });
      list.appendChild(card);
      if (playing) {
        setTimeout(function () {
          try {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (_) {}
        }, 200);
      }
    });
  }

  function fillMeta(item, episodio, epNum) {
    var animeTitle = item.nombre || item.titulo || "Serie";
    $("mz-kp-anime-title").textContent = animeTitle;
    $("mz-kp-topbar-title").textContent = animeTitle;
    $("mz-kp-ep-title").textContent = epLabel(episodio, epNum);

    var parts = [];
    if (item.idiomas) {
      var idm = Array.isArray(item.idiomas) ? item.idiomas[0] : item.idiomas;
      if (idm) parts.push(idm);
    } else {
      parts.push(langOf(episodio));
    }
    parts.push(durationOf(episodio, item));
    if (item.year) parts.push(String(item.year));
    $("mz-kp-meta").textContent = parts.filter(Boolean).join(" · ");

    var syn =
      episodio.descripcion ||
      item.descripcion ||
      item.synopsis ||
      "Sin sinopsis disponible.";
    $("mz-kp-synopsis").textContent = syn;
  }

  async function loadEmbeds(item, episodio, seasonNum, epNum) {
    // Reusa helpers de app.js si existen
    if (typeof window.asegurarEmbedsEpisodio === "function") {
      try {
        var pack = await window.asegurarEmbedsEpisodio(
          item,
          episodio,
          seasonNum,
          epNum
        );
        var embeds = pack && pack.embeds ? pack.embeds : [];
        if ((!embeds || !embeds.length) && pack && pack.video) {
          embeds = [{ url: pack.video, servidor: "Directo" }];
        }
        return embeds || [];
      } catch (e) {
        console.warn("mzKoi embeds", e);
      }
    }
    // Fallback: embeds ya en el episodio
    var local = episodio.embeds || episodio.reproductores || [];
    if (local.length) return local;
    if (episodio.video) return [{ url: episodio.video, servidor: "Directo" }];
    return [];
  }

  async function openEpisode(item, episodio, seasonNum, epNum) {
    if (!isPc()) return false;

    ensureDom();
    var view = $("mz-koi-ep-view");
    view.classList.add("open");
    view.setAttribute("aria-hidden", "false");
    document.body.classList.add("mz-koi-ep-open");

    seasonNum = Number(seasonNum) || seasonOf(episodio, 1);
    epNum = Number(epNum) || epNumOf(episodio, 1);

    _ctx = { item: item, episodio: episodio, season: seasonNum, episode: epNum, embeds: [] };

    fillMeta(item, episodio, epNum);
    renderSidebar(item, epNum, seasonNum);
    setIframe(null);
    setPlaceholder(true, "Cargando episodio…");
    renderServers([]);

    var embeds = await loadEmbeds(item, episodio, seasonNum, epNum);
    _ctx.embeds = embeds;
    renderServers(embeds);

    // Como Koiflix: arrancar el primero si hay
    if (embeds.length) {
      var first = playUrlFromEmbed(embeds[0]);
      if (first) setIframe(first);
      else setPlaceholder(true, "No se pudo cargar el mirror");
    } else {
      setPlaceholder(true, "Sin mirrors para este episodio");
    }

    try {
      view.scrollTop = 0;
    } catch (_) {}
    return true;
  }

  function closeView() {
    var view = $("mz-koi-ep-view");
    if (!view) return;
    view.classList.remove("open");
    view.setAttribute("aria-hidden", "true");
    document.body.classList.remove("mz-koi-ep-open");
    setIframe(null);
    _ctx = null;
  }

  // API pública
  window.mzKoiOpenEpisode = openEpisode;
  window.mzKoiCloseEpisode = closeView;
})();
