/**
 * MovieZone — Vista Koiflix PC
 * - Serie/Anime: mzKoiOpenEpisode — sin autoplay hasta elegir servidor
 * - Película:    mzKoiOpenMovie  — poster arriba, sin autoplay
 * Reproductores normales arriba; Directos abajo (sin texto "NO ADS").
 * Espacio no reinicia el player (solo play/pause nativo del video).
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
  var _mode = "episode";

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
      '    <button type="button" class="mz-kp-icon-btn" id="mz-kp-share" title="Compartir">↗ Compartir</button>' +
      "  </div>" +
      "</div>" +
      '<section class="mz-kp-hero">' +
      '  <div class="mz-kp-video-wrap" id="mz-kp-video-wrap">' +
      '    <div class="mz-kp-poster-layer" id="mz-kp-poster-layer">' +
      '      <img id="mz-kp-poster-img" alt="" />' +
      '      <div class="mz-kp-poster-overlay">' +
      '        <p class="mz-kp-poster-hint" id="mz-kp-poster-hint">Elige un reproductor para comenzar</p>' +
      "      </div>" +
      "    </div>" +
      '    <div class="mz-kp-video-placeholder hidden" id="mz-kp-placeholder">' +
      '      <div class="spin"></div><span>Cargando…</span>' +
      "    </div>" +
      '    <iframe id="mz-kp-iframe" class="hidden" src="about:blank" allowfullscreen allow="autoplay; encrypted-media" referrerpolicy="no-referrer" tabindex="-1"></iframe>' +
      '    <video id="mz-kp-video" class="hidden" controls playsinline tabindex="-1"></video>' +
      "  </div>" +
      "</section>" +
      '<section class="mz-kp-layout">' +
      '  <div class="mz-kp-info">' +
      '    <button type="button" class="mz-kp-anime-link" id="mz-kp-anime-title"></button>' +
      '    <p class="mz-kp-original hidden" id="mz-kp-original"></p>' +
      '    <div class="mz-kp-ep-title-row"><h1 class="mz-kp-ep-title" id="mz-kp-ep-title"></h1></div>' +
      '    <div class="mz-kp-meta-chips" id="mz-kp-meta-chips"></div>' +
      '    <div class="mz-kp-meta" id="mz-kp-meta"></div>' +
      '    <div class="mz-kp-genres" id="mz-kp-genres"></div>' +
      '    <div class="mz-kp-synopsis"><p id="mz-kp-synopsis"></p></div>' +
      '    <div class="mz-kp-servers">' +
      '      <div class="mz-kp-servers-label">Reproductores</div>' +
      '      <div class="mz-kp-servers-list" id="mz-kp-servers"></div>' +
      '      <div class="mz-kp-servers-label mz-kp-direct-label hidden" id="mz-kp-direct-label">Directos</div>' +
      '      <div class="mz-kp-servers-list" id="mz-kp-servers-direct"></div>' +
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

    // Evitar que Espacio reinicie/dispare botones fuera del video
    root.addEventListener(
      "keydown",
      function (e) {
        if (e.code !== "Space" && e.key !== " ") return;
        var t = e.target;
        var vid = $("mz-kp-video");
        // Si el foco no está en el video, bloquear espacio (no reinicia iframe ni click en botones)
        if (vid && !vid.classList.contains("hidden") && (t === vid || vid.contains(t))) {
          return; // play/pause nativo del video
        }
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
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
      var d = ep.duracion_texto || ep.duracion || ep.runtime || ep.duration;
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

  function estadoOf(item) {
    if (item.estado) return String(item.estado);
    if (item.finalizado === true) return "Finalizado";
    if (item.en_emision === true) return "En emisión";
    if (item.status) {
      var st = String(item.status).toLowerCase();
      if (/final|ended|complet/.test(st)) return "Finalizado";
      if (/emis|air|ongoing|returning/.test(st)) return "En emisión";
      return item.status;
    }
    return null;
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
    if (slug)
      return location.origin + "/" + pathTipo + "/" + slug + (epNum ? "?ep=" + epNum : "");
    return location.href;
  }

  function onShare() {
    var item = _ctx && _ctx.item;
    if (!item) return;
    var url = shareUrl(item, _ctx.episode || null);
    var title = item.nombre || item.titulo || "MovieZone";
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {
        copyShare(url);
      });
    } else copyShare(url);
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
    } else prompt("Copia el enlace:", url);
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

  function showPoster(item, hint) {
    destroyHls();
    var layer = $("mz-kp-poster-layer");
    var img = $("mz-kp-poster-img");
    var hintEl = $("mz-kp-poster-hint");
    if (layer) layer.classList.remove("hidden");
    if (img) {
      img.src =
        item.backdrop ||
        item.portada ||
        item.portada_imdb ||
        item.poster ||
        PLACEHOLDER;
      img.onerror = function () {
        img.src = item.portada || PLACEHOLDER;
      };
    }
    if (hintEl)
      hintEl.textContent = hint || "Elige un reproductor para comenzar";
    setPlaceholder(false);
  }

  function hidePoster() {
    var layer = $("mz-kp-poster-layer");
    if (layer) layer.classList.add("hidden");
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

  /**
   * Directo = ya trae stream resuelto del worker (stream_url/hls_resolve) o noAds.
   * Normal  = embed clásico para iframe (url de voe, mega, streamtape…).
   * NO marcar como directo solo porque el host “podría” resolverse.
   */
  function isVoeEmb(emb) {
    if (!emb) return false;
    var u = String(emb.url || emb.stream_url || emb.hls_resolve || "").toLowerCase();
    var s = String(emb.servidor || emb.server || emb.name || emb.nombre || "").toLowerCase();
    return /voe|jilliandescribe/.test(u + " " + s);
  }

  function isHlsEmb(emb) {
    if (!emb) return false;
    // Solo el servidor/chip llamado "HLS" — NO filtrar UPNShare ni otros m3u8
    var s = String(emb.servidor || emb.server || emb.name || emb.type || emb.nombre || "")
      .toLowerCase()
      .trim();
    if (s === "hls" || s === "m3u8") return true;
    if (/^hls(\s|$|\-|:)/.test(s)) return true;
    // detectarServidor exacto
    try {
      if (typeof window.detectarServidor === "function") {
        var det = String(
          window.detectarServidor(emb.url, emb.server || emb.servidor || emb.name) || ""
        )
          .toLowerCase()
          .trim();
        if (det === "hls") return true;
      }
    } catch (_) {}
    return false;
  }

  function isAnimeCtx() {
    try {
      var t = String((_ctx && _ctx.item && (_ctx.item.tipo || _ctx.item.type)) || "").toLowerCase();
      return /anime/.test(t);
    } catch (_) {
      return false;
    }
  }

  function isDirectEmbed(emb) {
    if (!emb) return false;
    // Series/Anime: Voe nunca en Directos
    if (isVoeEmb(emb)) return false;
    // Anime: sin chip "HLS" / m3u8 en Directos
    if (isAnimeCtx() && isHlsEmb(emb)) return false;
    if (emb.noAds && !isVoeEmb(emb)) return true;
    if (emb.stream_url && isWorkerStreamApi(emb.stream_url) && !isVoeEmb(emb)) return true;
    if (emb.hls_resolve && isWorkerStreamApi(emb.hls_resolve) && !isVoeEmb(emb)) return true;
    var name = String(emb.servidor || emb.server || emb.name || "").toLowerCase();
    if (/^directo$|no\s*ads/.test(name) && !isVoeEmb(emb)) return true;
    // "HLS" como nombre — solo series (no anime)
    if (/^hls$/.test(name) && (emb.stream_url || emb.hls_resolve) && !isAnimeCtx()) return true;
    return false;
  }

  function isNormalEmbed(emb) {
    if (!emb) return false;
    var url = emb.url;
    if (!url || !/^https?:\/\//i.test(String(url))) return false;
    if (isWorkerStreamApi(url)) return false;
    if (/moviezone\.tvjz\.workers\.dev\/\d+\//i.test(String(url))) return false;
    return true;
  }

  function cleanServerName(emb) {
    var name = emb.servidor || emb.server || emb.name || emb.provider || "Servidor";
    name = String(name)
      .replace(/\s*[·•\-–]?\s*NO\s*ADS\s*/gi, "")
      .replace(/\s*NO\s*ADS\s*/gi, "")
      .trim();
    if (!name) name = "Servidor";
    return name;
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
    hidePoster();
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
    hidePoster();
    var iframe = $("mz-kp-iframe");
    var vid = $("mz-kp-video");
    if (vid) vid.classList.add("hidden");
    if (!iframe) return;
    iframe.classList.remove("hidden");
    setPlaceholder(false);
    iframe.src = url;
  }

  /**
   * mode: "iframe" = solo link normal (streamwish.to, voe.sx…)
   * mode: "direct" = resolver HLS / stream_url del worker
   * mode: auto     = según datos del embed
   */
  async function playEmbed(emb, mode) {
    mode = mode || "auto";
    hidePoster();

    // --- FORZAR IFRAME (reproductores normales) ---
    if (mode === "iframe") {
      var uIframe = emb && emb.url;
      if (uIframe && /^https?:\/\//i.test(String(uIframe)) && !isWorkerStreamApi(uIframe)) {
        setPlaceholder(true, "Cargando…");
        playIframeInKoi(uIframe);
        return true;
      }
      setPlaceholder(true, "Sin link de embed");
      return false;
    }

    // --- FORZAR DIRECTO (resuelto) ---
    if (mode === "direct") {
      setPlaceholder(true, "Resolviendo servidor…");
      var api = (emb && emb.stream_url) || streamApiForEmbed(emb);
      try {
        var play = await resolveNoAdsPlayUrl(
          Object.assign({}, emb || {}, { stream_url: (emb && emb.stream_url) || api })
        );
        if (play) {
          playHlsInKoi(play);
          return true;
        }
      } catch (e) {
        console.warn("resolve fail", e);
      }
      setPlaceholder(true, "No se pudo resolver el stream");
      return false;
    }

    // --- auto (por si se llama sin mode) ---
    setPlaceholder(true, "Resolviendo servidor…");
    var api2 = streamApiForEmbed(emb);
    if (api2 || (emb && emb.noAds)) {
      try {
        var play2 = await resolveNoAdsPlayUrl(
          Object.assign({}, emb, { stream_url: emb.stream_url || api2 })
        );
        if (play2) {
          playHlsInKoi(play2);
          return true;
        }
      } catch (e2) {
        console.warn("resolve fail", e2);
      }
    }
    var url = emb.url || emb.stream_url;
    if (url && isEmbedIframeHost(url) && !isWorkerStreamApi(url)) {
      playIframeInKoi(url);
      return true;
    }
    if (url && isWorkerStreamApi(url)) {
      setPlaceholder(true, "No se pudo resolver el stream");
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

  function makeServerBtn(emb, mode) {
    mode = mode || "iframe";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mz-kp-srv-btn";
    var name = cleanServerName(emb);
    var idioma = emb.idioma || emb.lang || emb.language || "";
    var idLow = String(idioma).toLowerCase();
    var badge = "";
    if (/lat|dub|castellano|espanol|espa/.test(idLow)) {
      badge = '<span class="koi-lang-badge koi-lang-dub">DUB</span>';
      btn.classList.add("is-dub");
    } else if (/sub/.test(idLow)) {
      badge = '<span class="koi-lang-badge koi-lang-sub">SUB</span>';
      btn.classList.add("is-sub");
    } else if (/eng|ingl/.test(idLow)) {
      badge = '<span class="koi-lang-badge koi-lang-eng">ENG</span>';
    } else if (idioma) {
      badge = '<span class="koi-lang-badge koi-lang-other">' + String(idioma).slice(0, 6).toUpperCase() + '</span>';
    }
    btn.innerHTML = badge + '<span class="koi-chip-name">' + name + '</span>';
    btn.addEventListener("click", function () {
      document
        .querySelectorAll("#mz-kp-servers .mz-kp-srv-btn, #mz-kp-servers-direct .mz-kp-srv-btn")
        .forEach(function (b) {
          b.classList.remove("active");
        });
      btn.classList.add("active");
      playEmbed(emb, mode);
    });
    return btn;
  }

  function renderServers(embeds) {
    var boxN = $("mz-kp-servers");
    var boxD = $("mz-kp-servers-direct");
    var labD = $("mz-kp-direct-label");
    if (!boxN) return;
    boxN.innerHTML = "";
    if (boxD) boxD.innerHTML = "";
    if (labD) {
      labD.classList.add("hidden");
      labD.textContent = "Directos";
    }

    if (!embeds || !embeds.length) {
      boxN.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Cargando mirrors…</span>';
      return;
    }

    var normal = [];
    var direct = [];
    var seenN = Object.create(null);
    var seenD = Object.create(null);

    embeds.forEach(function (emb) {
      if (!emb) return;

      // Reproductores (normal): Voe y el resto sí (HLS solo se quita de Directos)
      if (isNormalEmbed(emb)) {
        var keyN = String(emb.url).split("?")[0].toLowerCase();
        if (!seenN[keyN]) {
          seenN[keyN] = 1;
          normal.push(emb);
        }
      }

      // Directos: NUNCA Voe (series ni anime)
      if (isVoeEmb(emb)) return;
      // Anime: sin HLS en Directos
      if (isAnimeCtx() && isHlsEmb(emb)) return;

      if (isDirectEmbed(emb)) {
        var keyD = String(emb.stream_url || emb.hls_resolve || emb.url || "")
          .split("?")[0]
          .toLowerCase();
        if (keyD && !seenD[keyD]) {
          seenD[keyD] = 1;
          direct.push(emb);
        }
      } else if (isNormalEmbed(emb) && streamApiForEmbed(emb)) {
        if (isVoeEmb(emb)) return;
        if (isAnimeCtx() && isHlsEmb(emb)) return;
        var api = streamApiForEmbed(emb);
        if (!api || /\/voe\/streamurl/i.test(String(api))) return;
        var clone = Object.assign({}, emb, {
          stream_url: emb.stream_url || api,
          servidor: cleanServerName(emb),
        });
        var keyC = String(clone.stream_url).split("?")[0].toLowerCase();
        if (!seenD[keyC]) {
          seenD[keyC] = 1;
          direct.push(clone);
        }
      }
    });

    normal.forEach(function (emb) {
      boxN.appendChild(makeServerBtn(emb, "iframe"));
    });

    if (direct.length && boxD) {
      if (labD) labD.classList.remove("hidden");
      direct.forEach(function (emb) {
        boxD.appendChild(makeServerBtn(emb, "direct"));
      });
    }

    if (!normal.length && !direct.length) {
      boxN.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Sin mirrors válidos</span>';
    } else if (!normal.length && direct.length) {
      // Solo directos: mostrarlos arriba también etiquetados como Directos abajo
      boxN.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Sin embeds clásicos</span>';
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
      var name = cleanServerName(d) || "Descarga " + (idx + 1);
      var idioma = d.idioma || d.lang || "";
      a.textContent = idioma ? name + " · " + idioma : name;
      box.appendChild(a);
    });
    if (!box.children.length) wrap.hidden = true;
  }

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
    var est = estadoOf(item);
    if (est) {
      var isAir = /emis/i.test(est);
      chip(est, isAir ? "mz-kp-chip-air" : "mz-kp-chip-end");
    }
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

  function idiomaSimple(item, episodio) {
    if (episodio) {
      var e = episodio.embeds || episodio.reproductores || [];
      for (var i = 0; i < e.length; i++) {
        var idm = e[i] && (e[i].idioma || e[i].lang);
        if (idm) return String(idm);
      }
    }
    if (item.idiomas) {
      var id = Array.isArray(item.idiomas) ? item.idiomas[0] : item.idiomas;
      if (id && id !== "[]") return String(id);
    }
    if (item.idioma) return String(item.idioma);
    return "Subtitulado";
  }

  /**
   * mode: "episode" → solo serie + E1 + idioma · duración (como Koiflix)
   * mode: "movie"   → chips completos (año, IMDb, géneros, estado…)
   */
  function fillTitles(item, epTitleText, mode, episodio) {
    mode = mode || "movie";
    var main = item.nombre || item.titulo || "Título";
    $("mz-kp-anime-title").textContent = main;
    $("mz-kp-topbar-title").textContent = main;

    var origEl = $("mz-kp-original");
    var chips = $("mz-kp-meta-chips");
    var genres = $("mz-kp-genres");
    var metaLine = $("mz-kp-meta");
    var synBox = $("mz-kp-synopsis") && $("mz-kp-synopsis").parentElement;

    if (mode === "episode") {
      // Sin título original, chips ni géneros (ya están en detalle)
      if (origEl) {
        origEl.textContent = "";
        origEl.classList.add("hidden");
      }
      if (chips) chips.innerHTML = "";
      if (genres) genres.innerHTML = "";

      var epEl = $("mz-kp-ep-title");
      epEl.textContent = epTitleText || "Episodio";
      epEl.style.display = "";

      var parts = [];
      parts.push(idiomaSimple(item, episodio));
      var dur = durationOf(episodio, item) || "24m";
      parts.push(dur);
      if (metaLine) metaLine.textContent = parts.filter(Boolean).join(" · ");

      // Sinopsis corta opcional del episodio/serie (se puede dejar)
      $("mz-kp-synopsis").textContent =
        (episodio && episodio.descripcion) ||
        item.descripcion ||
        item.synopsis ||
        "";
      return;
    }

    // --- Película: meta completa ---
    var orig = item.titulo_original || null;
    if (
      orig &&
      String(orig).trim() &&
      String(orig).toLowerCase() !== String(main).toLowerCase()
    ) {
      origEl.textContent = orig;
      origEl.classList.remove("hidden");
    } else {
      origEl.textContent = "";
      origEl.classList.add("hidden");
    }

    var epEl2 = $("mz-kp-ep-title");
    epEl2.textContent = epTitleText || main;
    epEl2.style.display = "";

    if (metaLine) metaLine.textContent = "";
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
        (playing ? '<div class="mz-kp-badge-playing">Seleccionado</div>' : "") +
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
        if (data && data.success !== false) {
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
            "estado",
            "en_emision",
            "finalizado",
          ].forEach(function (k) {
            if (
              data[k] != null &&
              data[k] !== "" &&
              (item[k] == null || item[k] === "")
            )
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
    view.classList.remove("mz-kp-movie-mode");
    view.setAttribute("aria-hidden", "false");
    document.body.classList.add("mz-koi-ep-open");
    // Restaurar layout serie (si antes se abrió una película)
    try {
      var layout = view.querySelector(".mz-kp-layout");
      if (layout) layout.classList.remove("mz-kp-layout-movie");
      var side = $("mz-kp-sidebar");
      if (side) side.classList.remove("hidden");
    } catch (_) {}

    seasonNum = Number(seasonNum) || seasonOf(episodio, 1);
    epNum = Number(epNum) || epNumOf(episodio, 1);
    _ctx = { item: item, episodio: episodio, season: seasonNum, episode: epNum };

    fillTitles(item, epLabel(episodio, epNum), "episode", episodio);
    renderSidebar(item, epNum, seasonNum);
    destroyHls();
    showPoster(item, "Elige un reproductor para comenzar");
    renderServers([]);
    renderDownloads([]);

    var pack = await fetchCapitulo(item, seasonNum, epNum);
    if (episodio) {
      episodio.embeds = pack.embeds;
      episodio.downloads = pack.downloads;
    }
    renderServers(pack.embeds);
    renderDownloads(pack.downloads);
    // SIN autoplay: se queda el poster hasta que elijan servidor
    showPoster(item, pack.embeds.length
      ? "Elige un reproductor para comenzar"
      : "Sin mirrors para este episodio");

    try {
      view.scrollTop = 0;
    } catch (_) {}
    return true;
  }

  async function openMovie(item) {
//    if (!isPc()) return false;
    if (!item) return false;
    ensureDom();
    _mode = "movie";
    var view = $("mz-koi-ep-view");
    view.classList.add("open");
    view.classList.add("mz-kp-movie-mode");
    view.setAttribute("aria-hidden", "false");
    document.body.classList.add("mz-koi-ep-open");

    _ctx = { item: item, episode: null, season: null };

    fillTitles(item, null, "movie");
    $("mz-kp-anime-title").textContent = item.tipo || "Película";
    $("mz-kp-ep-title").textContent = item.nombre || item.titulo || "Película";

    renderSidebar(item, 0, 0);
    try {
      var side = $("mz-kp-sidebar");
      if (side) side.classList.add("hidden");
      var layout = view.querySelector(".mz-kp-layout");
      if (layout) layout.classList.add("mz-kp-layout-movie");
    } catch (_) {}
    destroyHls();
    showPoster(item, "Elige un reproductor para comenzar");
    renderServers([]);
    renderDownloads([]);

    var pack = await fetchMoviePlayers(item);
    item = pack.item || item;
    _ctx.item = item;
    fillTitles(item, null, "movie");
    $("mz-kp-anime-title").textContent = item.tipo || "Película";
    $("mz-kp-ep-title").textContent = item.nombre || item.titulo || "Película";

    renderServers(pack.embeds);
    renderDownloads(pack.downloads);
    // SIN autoplay
    showPoster(
      item,
      pack.embeds.length
        ? "Elige un reproductor para comenzar"
        : "Sin mirrors disponibles"
    );

    try {
      view.scrollTop = 0;
    } catch (_) {}
    return true;
  }

  function closeView() {
    var view = $("mz-koi-ep-view");
    if (!view) return;
    view.classList.remove("open");
    view.classList.remove("mz-kp-movie-mode");
    view.setAttribute("aria-hidden", "true");
    document.body.classList.remove("mz-koi-ep-open");
    try {
      var layout = view.querySelector(".mz-kp-layout");
      if (layout) layout.classList.remove("mz-kp-layout-movie");
      var side = $("mz-kp-sidebar");
      if (side) side.classList.remove("hidden");
    } catch (_) {}
    destroyHls();
    _ctx = null;
  }

  window.mzKoiOpenEpisode = openEpisode;
  window.mzKoiOpenMovie = openMovie;
  window.mzKoiCloseEpisode = closeView;
})();
