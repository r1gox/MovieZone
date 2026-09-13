/**
 * MovieZone — Vista episodio estilo Koiflix (PC)
 * Reproductores + descargas. NO ADS (streamwish/voe/…) → HLS, no JSON en iframe.
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
      '    <iframe id="mz-kp-iframe" class="hidden" src="about:blank" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="no-referrer"></iframe>' +
      '    <video id="mz-kp-video" class="hidden" controls playsinline></video>' +
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
    return ep.duracion || ep.runtime || ep.duration || ep.duracion_texto || (item && item.duracion_texto) || "24m";
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

  /** ¿Es endpoint JSON del worker (NO ADS / streamurl / resolve)? */
  function isWorkerStreamApi(url) {
    if (!url) return false;
    var u = String(url).toLowerCase();
    if (!/moviezone\.tvjz\.workers\.dev|workers\.dev/i.test(u)) return false;
    return /\/(wish|voe|vidhide|goodstream|resolve|streamurl)\b/i.test(u) ||
      /[?&]url=/.test(u);
  }

  function isEmbedIframeHost(url) {
    if (!url) return false;
    var u = String(url).toLowerCase();
    if (isWorkerStreamApi(u)) return false;
    if (/moviezone\.tvjz\.workers\.dev\/\d+\//i.test(u)) return false;
    return /^https?:\/\//i.test(u);
  }

  /** API resolve del worker para un embed */
  function streamApiForEmbed(emb) {
    if (!emb) return null;
    if (emb.stream_url && isWorkerStreamApi(emb.stream_url)) return emb.stream_url;
    if (emb.hls_resolve && isWorkerStreamApi(emb.hls_resolve)) return emb.hls_resolve;
    if (emb.noAds && emb.stream_url) return emb.stream_url;
    if (typeof window.streamUrlParaNoAds === "function" && emb.url) {
      var s = window.streamUrlParaNoAds(emb.url);
      if (s) return s;
    }
    // Heurística si no hay helper global
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

  /** Resuelve JSON NO ADS → play_url (proxy HLS) */
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
      _hls = new window.Hls({
        enableWorker: true,
        xhrSetup: function (xhr) {
          try {
            xhr.withCredentials = false;
          } catch (_) {}
        },
      });
      _hls.loadSource(playUrl);
      _hls.attachMedia(vid);
      _hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
        vid.play().catch(function () {});
      });
      _hls.on(window.Hls.Events.ERROR, function (_e, data) {
        if (data && data.fatal) {
          console.warn("HLS fatal", data);
          setPlaceholder(true, "Error HLS — prueba otro servidor");
        }
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

  /** Reproduce un embed: NO ADS → HLS; resto → iframe */
  async function playEmbed(emb) {
    setPlaceholder(true, "Resolviendo servidor…");
    var api = streamApiForEmbed(emb);
    // Si tiene stream_url de worker o host conocido NO ADS → HLS
    if (api || emb.noAds) {
      try {
        var play = await resolveNoAdsPlayUrl(
          emb.stream_url || api
            ? Object.assign({}, emb, { stream_url: emb.stream_url || api })
            : emb
        );
        if (play) {
          playHlsInKoi(play);
          return true;
        }
      } catch (e) {
        console.warn("NO ADS fail", e);
      }
    }
    // iframe clásico
    var url = emb.url || emb.stream_url;
    if (url && isEmbedIframeHost(url) && !isWorkerStreamApi(url)) {
      playIframeInKoi(url);
      return true;
    }
    // último intento: si stream_url es worker, ya falló resolve
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
      box.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Cargando mirrors…</span>';
      return;
    }
    embeds.forEach(function (emb, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mz-kp-srv-btn" + (idx === 0 ? " active" : "");
      var name = emb.servidor || emb.server || emb.name || "Servidor " + (idx + 1);
      // Etiqueta NO ADS si aplica
      if (emb.noAds || streamApiForEmbed(emb)) {
        if (!/no\s*ads/i.test(name)) name = name + " · NO ADS";
      }
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
      return d.url || d.stream_url;
    });
    if (!items.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    items.forEach(function (d, idx) {
      var href = d.url || d.stream_url;
      if (isWorkerStreamApi(href)) return; // no abrir JSON de resolve como descarga
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
    if (!box.children.length) wrap.hidden = true;
  }

  function renderSidebar(item, currentEp, currentSeason) {
    var list = $("mz-kp-ep-list");
    if (!list) return;
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
        String(durationOf(ep, item)).replace(/</g, "") +
        "</span></div>" +
        '<div class="mz-kp-ep-info">' +
        '<div class="mz-kp-ep-name">' +
        epLabel(ep, n).replace(/</g, "") +
        "</div>" +
        '<div class="mz-kp-ep-lang">' +
        String(langOf(ep)).replace(/</g, "") +
        "</div></div>";
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
      if (idm && idm !== "[]") parts.push(idm);
      else parts.push(langOf(episodio));
    } else parts.push(langOf(episodio));
    parts.push(durationOf(episodio, item));
    if (item.year) parts.push(String(item.year));
    $("mz-kp-meta").textContent = parts.filter(Boolean).join(" · ");
    $("mz-kp-synopsis").textContent =
      episodio.descripcion ||
      item.descripcion ||
      item.synopsis ||
      "Sin sinopsis disponible.";
  }

  async function loadPlayersAndDownloads(item, episodio, seasonNum, epNum) {
    var embeds = normalizeList(episodio.embeds || episodio.reproductores || []);
    var downloads = normalizeList(episodio.downloads || episodio.descargas || []);

    if (typeof window.asegurarEmbedsEpisodio === "function") {
      try {
        var pack = await window.asegurarEmbedsEpisodio(
          item,
          episodio,
          seasonNum,
          epNum
        );
        if (pack) {
          var fromPack = normalizeList(pack.embeds || []);
          if (fromPack.length) embeds = fromPack;
          if (pack.video && !embeds.length)
            embeds = [{ url: pack.video, servidor: "Directo" }];
          if (episodio.downloads || episodio.descargas) {
            downloads = normalizeList(
              episodio.downloads || episodio.descargas
            );
          }
        }
      } catch (e1) {
        console.warn("mzKoi asegurarEmbeds", e1);
      }
    }

    try {
      var params = new URLSearchParams();
      params.set("temporada", String(seasonNum));
      params.set("episodio", String(epNum));
      if (item.postId || item.postid || item.post_id)
        params.set("postId", item.postId || item.postid || item.post_id);
      if (item.link) params.set("link", item.link);
      if (item.slug) params.set("slug", item.slug);
      if (item.source_id) params.set("source_id", String(item.source_id));
      if (item.fuente) params.set("fuente", item.fuente);
      if (item.tipo) params.set("tipo", item.tipo);

      var res = await fetch("/api/capitulo?" + params.toString(), {
        cache: "no-store",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.ok && data) {
        var apiEmbeds = normalizeList(data.reproductores || data.embeds || []);
        if (apiEmbeds.length) embeds = apiEmbeds;
        if (data.reproductor && typeof data.reproductor === "string") {
          embeds = embeds.concat([
            { url: data.reproductor, servidor: "Directo" },
          ]);
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
      var u = String(e.url || e.stream_url || "")
        .split("?")[0]
        .toLowerCase();
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
    _ctx = {
      item: item,
      episodio: episodio,
      season: seasonNum,
      episode: epNum,
      embeds: [],
    };

    fillMeta(item, episodio, epNum);
    renderSidebar(item, epNum, seasonNum);
    destroyHls();
    setPlaceholder(true, "Cargando episodio…");
    renderServers([]);
    renderDownloads([]);

    var pack = await loadPlayersAndDownloads(
      item,
      episodio,
      seasonNum,
      epNum
    );
    _ctx.embeds = pack.embeds;
    renderServers(pack.embeds);
    renderDownloads(pack.downloads);

    if (pack.embeds.length) {
      await playEmbed(pack.embeds[0]);
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
    destroyHls();
    _ctx = null;
  }

  window.mzKoiOpenEpisode = openEpisode;
  window.mzKoiCloseEpisode = closeView;
})();
