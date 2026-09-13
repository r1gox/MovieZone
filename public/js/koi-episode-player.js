/**
 * MovieZone — Vista Koiflix PC
 * - Serie/Anime: mzKoiOpenEpisode(item, ep, season, epNum)
 * - Película:    mzKoiOpenMovie(item)
 * Meta completa: año, fecha, IMDb, duración, géneros, título original, compartir.
 * NO ADS → HLS; embeds clásicos → iframe.
 */
(function () {
  "use strict";

  var PLACEHOLDER =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="#111" width="100%" height="100%"/></svg>'
    );

  var _ctx = null;
  var _hls = null;
  var _mode = "episode"; // episode | movie

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
      '  <div class="mz-kp-top-actions">' +
      '    <button type="button" class="mz-kp-icon-btn" id="mz-kp-share" title="Compartir">' +
      "      ↗ Compartir" +
      "    </button>" +
      "  </div>" +
      "</div>" +
      '<section class="mz-kp-hero">' +
      '  <div class="mz-kp-video-wrap">' +
      '    <div class="mz-kp-video-placeholder" id="mz-kp-placeholder">' +
      '      <div class="spin"></div><span>Cargando…</span>' +
      "    </div>" +
      '    <iframe id="mz-kp-iframe" class="hidden" src="about:blank" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="no-referrer"></iframe>' +
      '    <video id="mz-kp-video" class="hidden" controls playsinline></video>' +
      "  </div>" +
      "</section>" +
      '<section class="mz-kp-layout">' +
      '  <div class="mz-kp-info">' +
      '    <button type="button" class="mz-kp-anime-link" id="mz-kp-anime-title"></button>' +
      '    <p class="mz-kp-original hidden" id="mz-kp-original"></p>' +
      '    <div class="mz-kp-ep-title-row">' +
      '      <h1 class="mz-kp-ep-title" id="mz-kp-ep-title"></h1>' +
      "    </div>" +
      '    <div class="mz-kp-meta-chips" id="mz-kp-meta-chips"></div>' +
      '    <div class="mz-kp-meta" id="mz-kp-meta"></div>' +
      '    <div class="mz-kp-genres" id="mz-kp-genres"></div>' +
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
      '  <div class="mz-kp-sidebar" id="mz-kp-sidebar">' +
      '    <h3 class="mz-kp-sidebar-title">Episodios</h3>' +
      '    <div class="mz-kp-ep-list" id="mz-kp-ep-list"></div>' +
      "  </div>" +
      "</section>";

    document.body.appendChild(root);
    $("mz-kp-back").addEventListener("click", closeView);
    $("mz-kp-anime-title").addEventListener("click", function () {
      if (_mode === "movie") return;
      closeView();
    });
    $("mz-kp-share").addEventListener("click", onShare);
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
    if (ep) {
      var d =
        ep.duracion_texto ||
        ep.duracion ||
        ep.runtime ||
        ep.duration;
      if (d) return String(d);
    }
    if (item) {
      if (item.duracion_texto) return String(item.duracion_texto);
      if (item.duracion != null) {
        var m = parseInt(item.duracion, 10);
        if (m > 0) {
          if (m >= 60) {
            var h = Math.floor(m / 60);
            var mm = m % 60;
            return h + "h" + (mm ? " " + mm + "min" : "");
          }
          return m + " min";
        }
      }
    }
    return "";
  }

  function ratingOf(item) {
    var r =
      item.rating != null
        ? item.rating
        : item.calificacion != null
          ? item.calificacion
          : item.imdb && item.imdb.rating != null
            ? item.imdb.rating
            : null;
    if (r == null || r === "") return null;
    var n = Number(r);
    return isNaN(n) ? String(r) : n.toFixed(1).replace(/\.0$/, "");
  }

  function formatDate(item) {
    var f = item.fecha_estreno || item.release_date || item.fecha || null;
    if (!f) return null;
    var s = String(f).slice(0, 10);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return m[3] + "/" + m[2] + "/" + m[1];
    return s;
  }

  function genresOf(item) {
    if (Array.isArray(item.generos) && item.generos.length) return item.generos;
    if (typeof item.genero === "string" && item.genero.trim()) {
      return item.genero.split(/[,|/]/).map(function (x) {
        return x.trim();
      }).filter(Boolean);
    }
    return [];
  }

  function shareUrl(item, epNum) {
    try {
      if (typeof window.buildSharePath === "function") {
        var path = window.buildSharePath(item);
        if (path) return location.origin + path + (epNum ? "?ep=" + epNum : "");
      }
    } catch (_) {}
    var slug = item.slug || "";
    var tipo = String(item.tipo || "").toLowerCase();
    var pathTipo = /anime/.test(tipo)
      ? "anime"
      : /serie|dorama/.test(tipo)
        ? "serie"
        : "pelicula";
    if (slug) {
      return (
        location.origin +
        "/" +
        pathTipo +
        "/" +
        slug +
        (epNum ? "?ep=" + epNum : "")
      );
    }
    return location.href;
  }

  function onShare() {
    var item = _ctx && _ctx.item;
    if (!item) return;
    var url = shareUrl(item, _ctx.episode || null);
    var title = item.nombre || item.titulo || "MovieZone";
    if (navigator.share) {
      navigator
        .share({ title: title, url: url })
        .catch(function () {
          copyShare(url);
        });
    } else {
      copyShare(url);
    }
  }

  function copyShare(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () {
          var b = $("mz-kp-share");
          if (b) {
            var t = b.textContent;
            b.textContent = "✓ Copiado";
            setTimeout(function () {
              b.textContent = t;
            }, 1500);
          }
        },
        function () {
          prompt("Copia el enlace:", url);
        }
      );
    } else {
      prompt("Copia el enlace:", url);
    }
  }

  function setPlaceholder(on, text) {
    var ph = $("mz-kp-placeholder");
    if (!ph) return;
    if (on) {
      ph.classList.remove("hidden");
      var span = ph.querySelector("span");
      if (span && text) span.textContent = text;
    } else ph.classList.add("hidden");
  }

  function destroyHls() {
    try {
      if (_hls) {
        _hls.destroy();
        _hls = null;
      }
    } catch (_) {}
    var vid = $("mz-kp-video");
    if (vid) {
      try {
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
      } catch (_) {}
      vid.classList.add("hidden");
    }
    var iframe = $("mz-kp-iframe");
    if (iframe) {
      iframe.src = "about:blank";
      iframe.classList.add("hidden");
    }
  }

  function isWorkerStreamApi(url) {
    if (!url) return false;
    var u = String(url).toLowerCase();
    if (!/workers\.dev/i.test(u)) return false;
    return (
      /\/(wish|voe|vidhide|goodstream|resolve|streamurl)\b/i.test(u) ||
      /[?&]url=/.test(u)
    );
  }

  function isEmbedIframeHost(url) {
    if (!url) return false;
    var u = String(url).toLowerCase();
    if (isWorkerStreamApi(u)) return false;
    if (/moviezone\.tvjz\.workers\.dev\/\d+\//i.test(u)) return false;
    return /^https?:\/\//i.test(u);
  }

  function streamApiForEmbed(emb) {
    if (!emb) return null;
    if (emb.stream_url && isWorkerStreamApi(emb.stream_url)) return emb.stream_url;
    if (emb.hls_resolve && isWorkerStreamApi(emb.hls_resolve)) return emb.hls_resolve;
    if (typeof window.streamUrlParaNoAds === "function" && emb.url) {
      var s = window.streamUrlParaNoAds(emb.url);
      if (s) return s;
    }
    if (emb.url) {
      var q = encodeURIComponent(emb.url);
      var base = "https://moviezone.tvjz.workers.dev";
      var u = String(emb.url).toLowerCase();
      if (/streamwish|flaswish|strwish|ahvsh|streamhg/.test(u))
        return base + "/wish/streamurl?url=" + q;
      if (/voe\.|jilliandescribe/.test(u)) return base + "/voe/streamurl?url=" + q;
      if (/vidhide|filelions|smoothpre|callistanise|earnvids/.test(u))
        return base + "/vidhide/streamurl?url=" + q;
      if (/goodstream/.test(u)) return base + "/goodstream/streamurl?url=" + q;
      if (/vimeos/.test(u)) return base + "/resolve/vimeos?url=" + q + "&proxy=1";
    }
    return null;
  }

  async function resolveNoAdsPlayUrl(emb) {
    if (typeof window.resolverPlayUrlNoAds === "function") {
      try {
        return await window.resolverPlayUrlNoAds(emb);
      } catch (e) {
        console.warn("resolverPlayUrlNoAds", e);
      }
    }
    var api = streamApiForEmbed(emb);
    if (!api) return null;
    var res = await fetch(api, { cache: "no-store" });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!data || data.success === false) return null;
    var play = data.play_url || data.proxy_url || null;
    if (!play && Array.isArray(data.qualities) && data.qualities.length) {
      var q720 = data.qualities.find(function (q) {
        return String(q.quality || "").indexOf("720") !== -1;
      });
      play =
        (q720 && q720.proxy_url) ||
        data.qualities[data.qualities.length - 1].proxy_url ||
        null;
    }
    if (!play && data.url) {
      play =
        "https://moviezone.tvjz.workers.dev/proxy?url=" +
        encodeURIComponent(data.url);
    }
    if (!play && data.master) {
      play =
        "https://moviezone.tvjz.workers.dev/proxy?url=" +
        encodeURIComponent(data.master);
    }
    return play;
  }

  function playHlsInKoi(playUrl) {
    destroyHls();
    var vid = $("mz-kp-video");
    var iframe = $("mz-kp-iframe");
    if (iframe) iframe.classList.add("hidden");
    if (!vid) return;
    vid.classList.remove("hidden");
    setPlaceholder(false);
    if (window.Hls && window.Hls.isSupported()) {
      _hls = new window.Hls({ enableWorker: true });
      _hls.loadSource(playUrl);
      _hls.attachMedia(vid);
      _hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        vid.play().catch(function () {});
      });
    } else if (vid.canPlayType("application/vnd.apple.mpegurl")) {
      vid.src = playUrl;
      vid.play().catch(function () {});
    } else {
      setPlaceholder(true, "Tu navegador no soporta HLS");
    }
  }

  function playIframeInKoi(url) {
    destroyHls();
    var iframe = $("mz-kp-iframe");
    var vid = $("mz-kp-video");
    if (vid) vid.classList.add("hidden");
    if (!iframe) return;
    iframe.classList.remove("hidden");
    setPlaceholder(false);
    iframe.src = url;
  }

  async function playEmbed(emb) {
    setPlaceholder(true, "Resolviendo servidor…");
    var api = streamApiForEmbed(emb);
    if (api || emb.noAds) {
      try {
        var play = await resolveNoAdsPlayUrl(
          Object.assign({}, emb, { stream_url: emb.stream_url || api })
        );
        if (play) {
          playHlsInKoi(play);
          return true;
        }
      } catch (e) {
        console.warn("NO ADS fail", e);
      }
    }
    var url = emb.url || emb.stream_url;
    if (url && isEmbedIframeHost(url) && !isWorkerStreamApi(url)) {
      playIframeInKoi(url);
      return true;
    }
    if (url && isWorkerStreamApi(url)) {
      setPlaceholder(true, "No se pudo resolver NO ADS");
      return false;
    }
    if (url) {
      playIframeInKoi(url);
      return true;
    }
    setPlaceholder(true, "Sin URL de reproducción");
    return false;
  }

  function normalizeList(raw) {
    if (!raw) return [];
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch (_) {
        return [];
      }
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
          hls_resolve: e.hls_resolve || null,
          noAds: !!e.noAds,
          servidor: e.servidor || e.server || e.name || e.provider || "Servidor",
          idioma: e.idioma || e.lang || null,
          lang: e.lang || e.idioma || null,
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
      box.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Cargando mirrors…</span>';
      return;
    }
    embeds.forEach(function (emb, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mz-kp-srv-btn" + (idx === 0 ? " active" : "");
      var name = emb.servidor || "Servidor " + (idx + 1);
      if ((emb.noAds || streamApiForEmbed(emb)) && !/no\s*ads/i.test(name))
        name = name + " · NO ADS";
      var idioma = emb.idioma || emb.lang || "";
      btn.textContent = idioma ? name + " · " + idioma : name;
      btn.addEventListener("click", function () {
        box.querySelectorAll(".mz-kp-srv-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        playEmbed(emb);
      });
      box.appendChild(btn);
    });
    if (!box.children.length) {
      box.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Sin mirrors válidos</span>';
    }
  }

  function renderDownloads(list) {
    var wrap = $("mz-kp-downloads-wrap");
    var box = $("mz-kp-downloads");
    if (!wrap || !box) return;
    box.innerHTML = "";
    var items = normalizeList(list).filter(function (d) {
      return (d.url || d.stream_url) && !isWorkerStreamApi(d.url || d.stream_url);
    });
    if (!items.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    items.forEach(function (d, idx) {
      var a = document.createElement("a");
      a.className = "mz-kp-srv-btn";
      a.href = d.url || d.stream_url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      var name = d.servidor || "Descarga " + (idx + 1);
      var idioma = d.idioma || d.lang || "";
      a.textContent = idioma ? name + " · " + idioma : name;
      box.appendChild(a);
    });
    if (!box.children.length) wrap.hidden = true;
  }

  /** Chips: año · fecha · IMDb · duración */
  function fillMetaChips(item) {
    var box = $("mz-kp-meta-chips");
    if (!box) return;
    box.innerHTML = "";
    function chip(label, extraClass) {
      var s = document.createElement("span");
      s.className = "mz-kp-chip" + (extraClass ? " " + extraClass : "");
      s.textContent = label;
      box.appendChild(s);
    }
    if (item.year) chip(String(item.year));
    var fecha = formatDate(item);
    if (fecha) chip(fecha);
    var rating = ratingOf(item);
    if (rating != null) chip(rating + " IMDb", "mz-kp-chip-imdb");
    var dur = durationOf(null, item);
    if (dur) chip(dur);
    if (item.certificacion) chip(String(item.certificacion));
  }

  function fillGenres(item) {
    var box = $("mz-kp-genres");
    if (!box) return;
    box.innerHTML = "";
    genresOf(item).forEach(function (g) {
      var s = document.createElement("span");
      s.className = "mz-kp-genre";
      s.textContent = g;
      box.appendChild(s);
    });
  }

  function fillTitles(item, epTitleText) {
    var main = item.nombre || item.titulo || "Título";
    $("mz-kp-anime-title").textContent = main;
    $("mz-kp-topbar-title").textContent = main;

    var orig = item.titulo_original || null;
    var origEl = $("mz-kp-original");
    if (orig && String(orig).trim() && String(orig).toLowerCase() !== String(main).toLowerCase()) {
      origEl.textContent = orig;
      origEl.classList.remove("hidden");
    } else {
      origEl.textContent = "";
      origEl.classList.add("hidden");
    }

    var epEl = $("mz-kp-ep-title");
    if (epTitleText) {
      epEl.textContent = epTitleText;
      epEl.style.display = "";
    } else {
      epEl.textContent = main;
      epEl.style.display = "";
    }

    $("mz-kp-meta").textContent = "";
    fillMetaChips(item);
    fillGenres(item);
    $("mz-kp-synopsis").textContent =
      item.descripcion || item.synopsis || "Sin sinopsis disponible.";
  }

  function renderSidebar(item, currentEp, currentSeason) {
    var list = $("mz-kp-ep-list");
    var side = $("mz-kp-sidebar");
    if (!list || !side) return;
    if (_mode === "movie") {
      side.classList.add("hidden");
      side.style.display = "none";
      return;
    }
    side.classList.remove("hidden");
    side.style.display = "";
    list.innerHTML = "";
    var eps = Array.isArray(item.episodios) ? item.episodios.slice() : [];
    eps.sort(function (a, b) {
      var sa = seasonOf(a, 1),
        sb = seasonOf(b, 1);
      if (sa !== sb) return sa - sb;
      return epNumOf(a, 0) - epNumOf(b, 0);
    });
    if (!eps.length) {
      list.innerHTML =
        '<p style="color:#64748b;padding:8px">No hay episodios.</p>';
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
        item.portada ||
        item.backdrop ||
        PLACEHOLDER;
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
        String(durationOf(ep, item) || "24m").replace(/</g, "") +
        "</span></div>" +
        '<div class="mz-kp-ep-info">' +
        '<div class="mz-kp-ep-name">' +
        epLabel(ep, n).replace(/</g, "") +
        "</div>" +
        '<div class="mz-kp-ep-lang">Subtitulado</div></div>';
      card.addEventListener("click", function () {
        if (playing) return;
        openEpisode(item, ep, s, n);
      });
      list.appendChild(card);
    });
  }

  async function fetchCapitulo(item, seasonNum, epNum) {
    var embeds = [];
    var downloads = [];
    if (typeof window.asegurarEmbedsEpisodio === "function") {
      try {
        var pack = await window.asegurarEmbedsEpisodio(
          item,
          { embeds: [], episode: epNum, season: seasonNum },
          seasonNum,
          epNum
        );
        if (pack && pack.embeds) embeds = normalizeList(pack.embeds);
        if (pack && pack.video && !embeds.length)
          embeds = [{ url: pack.video, servidor: "Directo" }];
      } catch (_) {}
    }
    try {
      var params = new URLSearchParams();
      params.set("temporada", String(seasonNum));
      params.set("episodio", String(epNum));
      if (item.link) params.set("link", item.link);
      if (item.slug) params.set("slug", item.slug);
      if (item.source_id) params.set("source_id", String(item.source_id));
      if (item.tipo) params.set("tipo", item.tipo);
      var res = await fetch("/api/capitulo?" + params.toString(), {
        cache: "no-store",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.ok && data) {
        var apiE = normalizeList(data.reproductores || data.embeds || []);
        if (apiE.length) embeds = apiE;
        var apiD = normalizeList(data.downloads || data.descargas || []);
        if (apiD.length) downloads = apiD;
      }
    } catch (_) {}
    return { embeds: embeds, downloads: downloads };
  }

  async function fetchMoviePlayers(item) {
    var embeds = normalizeList(item.embeds || item.reproductores || []);
    var downloads = normalizeList(item.downloads || item.descargas || []);
    if (embeds.length) return { embeds: embeds, downloads: downloads, item: item };

    // Detalle completo si hace falta
    try {
      if (item.slug || item.link) {
        var params = new URLSearchParams();
        if (item.slug) params.set("slug", item.slug);
        if (item.link) params.set("link", item.link);
        if (item.source_id) params.set("source_id", String(item.source_id));
        if (item.tipo) params.set("tipo", item.tipo);
        var res = await fetch("/api/detalle?" + params.toString(), {
          cache: "no-store",
        });
        var data = await res.json().catch(function () {
          return null;
        });
        if (data && (data.success !== false)) {
          // merge meta
          [
            "descripcion",
            "year",
            "fecha_estreno",
            "rating",
            "calificacion",
            "duracion",
            "duracion_texto",
            "generos",
            "genero",
            "titulo_original",
            "imdb_id",
            "certificacion",
            "portada",
            "backdrop",
          ].forEach(function (k) {
            if (data[k] != null && data[k] !== "" && (item[k] == null || item[k] === ""))
              item[k] = data[k];
          });
          embeds = normalizeList(data.reproductores || data.embeds || []);
          downloads = normalizeList(data.downloads || data.descargas || []);
          if (data.reproductor && typeof data.reproductor === "string") {
            embeds.push({ url: data.reproductor, servidor: "Directo" });
          }
        }
      }
    } catch (e) {
      console.warn("mzKoi movie detalle", e);
    }
    return { embeds: embeds, downloads: downloads, item: item };
  }

  async function openEpisode(item, episodio, seasonNum, epNum) {
    if (!isPc()) return false;
    ensureDom();
    _mode = "episode";
    var view = $("mz-koi-ep-view");
    view.classList.add("open");
    view.setAttribute("aria-hidden", "false");
    document.body.classList.add("mz-koi-ep-open");

    seasonNum = Number(seasonNum) || seasonOf(episodio, 1);
    epNum = Number(epNum) || epNumOf(episodio, 1);
    _ctx = { item: item, episodio: episodio, season: seasonNum, episode: epNum };

    fillTitles(item, epLabel(episodio, epNum));
    renderSidebar(item, epNum, seasonNum);
    destroyHls();
    setPlaceholder(true, "Cargando episodio…");
    renderServers([]);
    renderDownloads([]);

    var pack = await fetchCapitulo(item, seasonNum, epNum);
    // merge embeds on episodio
    if (episodio) {
      episodio.embeds = pack.embeds;
      episodio.downloads = pack.downloads;
    }
    renderServers(pack.embeds);
    renderDownloads(pack.downloads);
    if (pack.embeds.length) await playEmbed(pack.embeds[0]);
    else setPlaceholder(true, "Sin mirrors para este episodio");
    try {
      view.scrollTop = 0;
    } catch (_) {}
    return true;
  }

  /** Película: mismo layout, sin sidebar, reproductores al entrar */
  async function openMovie(item) {
    if (!isPc()) return false;
    if (!item) return false;
    ensureDom();
    _mode = "movie";
    var view = $("mz-koi-ep-view");
    view.classList.add("open");
    view.setAttribute("aria-hidden", "false");
    document.body.classList.add("mz-koi-ep-open");

    _ctx = { item: item, episode: null, season: null };

    fillTitles(item, null);
    // En película el h1 es el título; el link cyan puede ser tipo
    $("mz-kp-anime-title").textContent = item.tipo || "Película";
    $("mz-kp-ep-title").textContent = item.nombre || item.titulo || "Película";

    renderSidebar(item, 0, 0);
    destroyHls();
    setPlaceholder(true, "Cargando reproductores…");
    renderServers([]);
    renderDownloads([]);

    var pack = await fetchMoviePlayers(item);
    item = pack.item || item;
    _ctx.item = item;
    // refrescar meta por si /api/detalle completó datos
    fillTitles(item, null);
    $("mz-kp-anime-title").textContent = item.tipo || "Película";
    $("mz-kp-ep-title").textContent = item.nombre || item.titulo || "Película";

    renderServers(pack.embeds);
    renderDownloads(pack.downloads);

    if (pack.embeds.length) {
      // No autoplay agresivo: muestra primer servidor resuelto (como Koiflix)
      await playEmbed(pack.embeds[0]);
    } else {
      setPlaceholder(true, "Elige un reproductor cuando esté disponible");
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
    destroyHls();
    _ctx = null;
  }

  window.mzKoiOpenEpisode = openEpisode;
  window.mzKoiOpenMovie = openMovie;
  window.mzKoiCloseEpisode = closeView;
})();
