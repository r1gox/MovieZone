/**
 * MovieZone — Vista episodio estilo Koiflix (PC ≥ 1025px)
 * Muestra reproductores + descargas; carga mirrors desde /api/capitulo.
 */
(function () {
  "use strict";

  var PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="#111" width="100%" height="100%"/></svg>'
    );

  var _ctx = null;

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
      '  <button type="button" class="mz-kp-back" id="mz-kp-back">← Volver</button>' +
      '  <span class="mz-kp-topbar-title" id="mz-kp-topbar-title"></span>' +
      "</div>" +
      '<section class="mz-kp-hero">' +
      '  <div class="mz-kp-video-wrap" id="mz-kp-video-wrap">' +
      '    <div class="mz-kp-video-placeholder" id="mz-kp-placeholder">' +
      '      <div class="spin"></div><span>Cargando episodio…</span>' +
      "    </div>" +
      '    <iframe id="mz-kp-iframe" src="about:blank" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="no-referrer"></iframe>' +
      "  </div>" +
      "</section>" +
      '<section class="mz-kp-layout">' +
      '  <div class="mz-kp-info">' +
      '    <button type="button" class="mz-kp-anime-link" id="mz-kp-anime-title"></button>' +
      '    <div class="mz-kp-ep-title-row"><h1 class="mz-kp-ep-title" id="mz-kp-ep-title">Episodio</h1></div>' +
      '    <div class="mz-kp-meta" id="mz-kp-meta"></div>' +
      '    <div class="mz-kp-synopsis"><p id="mz-kp-synopsis"></p></div>' +
      '    <div class="mz-kp-servers">' +
      '      <div class="mz-kp-servers-label">Reproductores</div>' +
      '      <div class="mz-kp-servers-list" id="mz-kp-servers"></div>' +
      "    </div>" +
      '    <div class="mz-kp-servers mz-kp-downloads-wrap" id="mz-kp-downloads-wrap" hidden>' +
      '      <div class="mz-kp-servers-label">Descargas</div>' +
      '      <div class="mz-kp-servers-list" id="mz-kp-downloads"></div>' +
      "    </div>" +
      "  </div>" +
      '  <div class="mz-kp-sidebar">' +
      '    <h3 class="mz-kp-sidebar-title">Episodios</h3>' +
      '    <div class="mz-kp-ep-list" id="mz-kp-ep-list"></div>' +
      "  </div>" +
      "</section>";

    document.body.appendChild(root);
    $("mz-kp-back").addEventListener("click", closeView);
    $("mz-kp-anime-title").addEventListener("click", closeView);
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
    if (!name || /^T\d+E\d+$/i.test(name) || name === String(n)) name = "Episodio " + n;
    return "E" + n + " - " + name;
  }

  function durationOf(ep, item) {
    return (
      ep.duracion ||
      ep.runtime ||
      ep.duration ||
      ep.duracion_texto ||
      (item && item.duracion_texto) ||
      "24m"
    );
  }

  function langOf(ep) {
    var e = (ep && (ep.embeds || ep.reproductores)) || [];
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
    if (typeof emb === "string") {
      if (/^https?:\/\//i.test(emb)) return emb;
      return null;
    }
    if (emb.url && /^https?:\/\//i.test(String(emb.url))) {
      if (/moviezone\.tvjz\.workers\.dev\/\d+\//i.test(emb.url)) return emb.stream_url || null;
      return emb.url;
    }
    if (emb.stream_url && /^https?:\/\//i.test(String(emb.stream_url))) return emb.stream_url;
    if (emb.hls_resolve && /^https?:\/\//i.test(String(emb.hls_resolve))) return emb.hls_resolve;
    return null;
  }

  function normalizeList(raw) {
    if (!raw) return [];
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (_) { return []; }
    }
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var e = raw[i];
      if (!e) continue;
      if (typeof e === "string" && /^https?:\/\//i.test(e)) {
        out.push({ url: e, servidor: "Mirror" });
        continue;
      }
      if (e.url || e.stream_url || e.link || e.href) {
        out.push({
          url: e.url || e.link || e.href || null,
          stream_url: e.stream_url || e.hls_resolve || null,
          servidor: e.servidor || e.server || e.name || e.provider || "Servidor",
          idioma: e.idioma || e.lang || null,
          lang: e.lang || e.idioma || null,
          tipo: e.tipo || null,
        });
      }
    }
    return out;
  }

  function renderServers(embeds) {
    var box = $("mz-kp-servers");
    if (!box) return;
    box.innerHTML = "";
    if (!embeds || !embeds.length) {
      box.innerHTML = '<span style="color:#64748b;font-size:0.85rem">Cargando mirrors…</span>';
      return;
    }
    embeds.forEach(function (emb, idx) {
      var url = playUrlFromEmbed(emb);
      if (!url) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mz-kp-srv-btn" + (idx === 0 ? " active" : "");
      var name = emb.servidor || emb.server || emb.name || "Servidor " + (idx + 1);
      var idioma = emb.idioma || emb.lang || "";
      btn.textContent = idioma ? name + " · " + idioma : name;
      btn.addEventListener("click", function () {
        box.querySelectorAll(".mz-kp-srv-btn").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        setIframe(url);
      });
      box.appendChild(btn);
    });
    if (!box.children.length) {
      box.innerHTML = '<span style="color:#64748b;font-size:0.85rem">Sin mirrors válidos</span>';
    }
  }

  function renderDownloads(list) {
    var wrap = $("mz-kp-downloads-wrap");
    var box = $("mz-kp-downloads");
    if (!wrap || !box) return;
    box.innerHTML = "";
    var items = normalizeList(list).filter(function (d) { return d.url || d.stream_url; });
    if (!items.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    items.forEach(function (d, idx) {
      var href = d.url || d.stream_url;
      var a = document.createElement("a");
      a.className = "mz-kp-srv-btn";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      var name = d.servidor || "Descarga " + (idx + 1);
      var idioma = d.idioma || d.lang || "";
      a.textContent = idioma ? name + " · " + idioma : name;
      box.appendChild(a);
    });
  }

  function renderSidebar(item, currentEp, currentSeason) {
    var list = $("mz-kp-ep-list");
    if (!list) return;
    list.innerHTML = "";
    var eps = Array.isArray(item.episodios) ? item.episodios.slice() : [];
    eps.sort(function (a, b) {
      var sa = seasonOf(a, 1), sb = seasonOf(b, 1);
      if (sa !== sb) return sa - sb;
      return epNumOf(a, 0) - epNumOf(b, 0);
    });
    if (!eps.length) {
      list.innerHTML = '<p style="color:#64748b;padding:8px">No hay episodios en la lista.</p>';
      return;
    }
    eps.forEach(function (ep, idx) {
      var n = epNumOf(ep, idx + 1);
      var s = seasonOf(ep, 1);
      var playing = n === Number(currentEp) && s === Number(currentSeason);
      var thumb = ep.still || ep.portada || ep.imagen || ep.image || ep.thumbnail || item.portada || item.backdrop || PLACEHOLDER;
      var dur = durationOf(ep, item);
      var lang = langOf(ep);
      var card = document.createElement("button");
      card.type = "button";
      card.className = "mz-kp-ep-card" + (playing ? " playing" : "");
      card.innerHTML =
        '<div class="mz-kp-ep-thumb">' +
        (playing ? '<div class="mz-kp-badge-playing">Reproduciendo</div>' : "") +
        '<img src="' + String(thumb).replace(/"/g, "") + '" alt="" loading="lazy" onerror="this.style.opacity=.3"/>' +
        '<span class="mz-kp-badge-dur">' + String(dur).replace(/</g, "") + "</span></div>" +
        '<div class="mz-kp-ep-info">' +
        '<div class="mz-kp-ep-name">' + epLabel(ep, n).replace(/</g, "") + "</div>" +
        '<div class="mz-kp-ep-lang">' + String(lang).replace(/</g, "") + "</div></div>";
      card.addEventListener("click", function () {
        if (playing) return;
        openEpisode(item, ep, s, n);
      });
      list.appendChild(card);
      if (playing) {
        setTimeout(function () {
          try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
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
      if (idm && idm !== "[]") parts.push(idm);
      else parts.push(langOf(episodio));
    } else parts.push(langOf(episodio));
    parts.push(durationOf(episodio, item));
    if (item.year) parts.push(String(item.year));
    $("mz-kp-meta").textContent = parts.filter(Boolean).join(" · ");
    var syn = episodio.descripcion || item.descripcion || item.synopsis || "Sin sinopsis disponible.";
    $("mz-kp-synopsis").textContent = syn;
  }

  async function loadPlayersAndDownloads(item, episodio, seasonNum, epNum) {
    var embeds = normalizeList(episodio.embeds || episodio.reproductores || []);
    var downloads = normalizeList(episodio.downloads || episodio.descargas || []);

    if (typeof window.asegurarEmbedsEpisodio === "function") {
      try {
        var pack = await window.asegurarEmbedsEpisodio(item, episodio, seasonNum, epNum);
        if (pack) {
          var fromPack = normalizeList(pack.embeds || []);
          if (fromPack.length) embeds = fromPack;
          if (pack.video && !embeds.length) embeds = [{ url: pack.video, servidor: "Directo" }];
          if (episodio.downloads || episodio.descargas) {
            downloads = normalizeList(episodio.downloads || episodio.descargas);
          }
        }
      } catch (e1) {
        console.warn("mzKoi asegurarEmbeds", e1);
      }
    }

    // Siempre intentar /api/capitulo para completar (mirrors + descargas)
    try {
      var params = new URLSearchParams();
      params.set("temporada", String(seasonNum));
      params.set("episodio", String(epNum));
      if (item.postId || item.postid || item.post_id) {
        params.set("postId", item.postId || item.postid || item.post_id);
      }
      if (item.link) params.set("link", item.link);
      if (item.slug) params.set("slug", item.slug);
      if (item.source_id) params.set("source_id", String(item.source_id));
      if (item.fuente) params.set("fuente", item.fuente);
      if (item.tipo) params.set("tipo", item.tipo);

      var res = await fetch("/api/capitulo?" + params.toString(), { cache: "no-store" });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data) {
        var apiEmbeds = normalizeList(data.reproductores || data.embeds || []);
        if (apiEmbeds.length) embeds = apiEmbeds;
        if (data.reproductor && typeof data.reproductor === "string") {
          embeds = embeds.concat([{ url: data.reproductor, servidor: "Directo" }]);
        }
        var apiDl = normalizeList(data.downloads || data.descargas || []);
        if (apiDl.length) downloads = apiDl;
        episodio.embeds = embeds;
        episodio.downloads = downloads;
        if (data.video) episodio.video = data.video;
      }
    } catch (e2) {
      console.warn("mzKoi /api/capitulo", e2);
    }

    var seen = Object.create(null);
    embeds = embeds.filter(function (e) {
      var u = String(e.url || e.stream_url || "").split("?")[0].toLowerCase();
      if (!u || seen[u]) return false;
      seen[u] = 1;
      return true;
    });

    return { embeds: embeds, downloads: downloads };
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
    renderDownloads([]);

    var pack = await loadPlayersAndDownloads(item, episodio, seasonNum, epNum);
    _ctx.embeds = pack.embeds;
    renderServers(pack.embeds);
    renderDownloads(pack.downloads);

    if (pack.embeds.length) {
      var first = playUrlFromEmbed(pack.embeds[0]);
      if (first) setIframe(first);
      else setPlaceholder(true, "No se pudo cargar el mirror");
    } else {
      setPlaceholder(true, "Sin mirrors para este episodio");
    }

    try { view.scrollTop = 0; } catch (_) {}
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

  window.mzKoiOpenEpisode = openEpisode;
  window.mzKoiCloseEpisode = closeView;
})();
