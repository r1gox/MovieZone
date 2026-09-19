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
  var _openLock = false;
  var _openToken = 0;

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
      '    <!-- descargas solo por panel ↓, sin bloque vacío -->' +
      "  </div>" +
      '  <div class="mz-kp-sidebar" id="mz-kp-sidebar">' +
      '    <h3 class="mz-kp-sidebar-title">Episodios</h3>' +
      '    <div class="mz-kp-ep-list" id="mz-kp-ep-list"></div>' +
      "  </div>" +
      "</section>";

    document.body.appendChild(root);
    try {
      var deadDl = root.querySelector("#mz-kp-downloads-wrap, .mz-kp-downloads-wrap");
      if (deadDl) deadDl.remove();
    } catch (_) {}
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
      if (typeof window.mzBuildDetallePath === "function") {
        var p = window.mzBuildDetallePath(item, null, epNum || null);
        // mzBuildDetallePath necesita season+episode; si solo epNum usar path manual
      }
      if (typeof window.mzSlugFromItem === "function" || item.slug) {
        var slug = (typeof window.mzSlugFromItem === "function" ? window.mzSlugFromItem(item) : item.slug) || "";
        if (slug) {
          var base = location.origin + "/detalle/" + encodeURIComponent(slug);
          if (epNum) return base + "/1/" + epNum;
          return base;
        }
      }
    } catch (_) {}
    try {
      if (typeof window.buildSharePath === "function") {
        var path = window.buildSharePath(item);
        if (path) return location.origin + path + (epNum ? "?ep=" + epNum : "");
      }
    } catch (_) {}
    var slug = item.slug || "";
    if (slug)
      return location.origin + "/detalle/" + encodeURIComponent(slug) + (epNum ? "/1/" + epNum : "");
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
    // Guardar preferido para autoselección al cambiar de episodio
    try {
      var slug = (_ctx && _ctx.item && (_ctx.item.slug || _ctx.item.link)) || "";
      window.__mzPreferredServer = {
        slug: String(slug),
        name: String(cleanServerName(emb) || "").toLowerCase(),
        mode: mode === "direct" ? "direct" : "iframe",
        idioma: String(emb.idioma || emb.lang || "").toLowerCase(),
        langKey: typeof langKeyOf === "function" ? langKeyOf(emb) : "",
        noAds: !!emb.noAds,
        direct: mode === "direct"
      };
    } catch (_) {}

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

  function langKeyOf(emb) {
    var idioma = String((emb && (emb.idioma || emb.lang || emb.language)) || "").toLowerCase();
    if (/lat|dub|castellano|espanol|españ|espa/.test(idioma)) return "dub";
    if (/sub/.test(idioma)) return "sub";
    if (/eng|ingl/.test(idioma)) return "eng";
    return "oth";
  }

  function makeServerBtn(emb, mode, opts) {
    mode = mode || "iframe";
    opts = opts || {};
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mz-kp-srv-btn";
    var name = cleanServerName(emb);
    var lk = langKeyOf(emb);
    if (lk === "dub") btn.classList.add("is-dub");
    if (lk === "sub") btn.classList.add("is-sub");
    var badge = "";
    // Badge por chip solo si no es fila con tag SUB/DUB (móvil)
    if (!opts.noBadge) {
      if (lk === "dub") badge = '<span class="koi-lang-badge koi-lang-dub">DUB</span>';
      else if (lk === "sub") badge = '<span class="koi-lang-badge koi-lang-sub">SUB</span>';
      else if (lk === "eng") badge = '<span class="koi-lang-badge koi-lang-eng">ENG</span>';
      else {
        var idioma = emb.idioma || emb.lang || "";
        if (idioma) badge = '<span class="koi-lang-badge koi-lang-other">' + String(idioma).slice(0, 6).toUpperCase() + '</span>';
      }
    }
    btn.innerHTML = badge + '<span class="koi-chip-name">' + name + '</span>';
    btn.dataset.mzName = String(name || "").toLowerCase();
    btn.dataset.mzLang = lk;
    btn.dataset.mzMode = mode;
    btn.addEventListener("click", function () {
      document
        .querySelectorAll("#mz-kp-servers .mz-kp-srv-btn, #mz-kp-servers-direct .mz-kp-srv-btn, #mz-kp-servers .mz-kp-srv-row .mz-kp-srv-btn")
        .forEach(function (b) {
          b.classList.remove("active");
        });
      btn.classList.add("active");
      playEmbed(emb, mode);
    });
    return btn;
  }


  function isJkItem(item) {
    if (!item) item = _ctx && _ctx.item;
    if (!item) return false;
    var s = String(item.source_id || item.fuente || item.source || "");
    return s === "5" || /jkanime|^jk$/i.test(s);
  }

  function pickJkEmbed(embeds) {
    var list = embeds || [];
    var i, e, blob;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (!e) continue;
      blob = String(
        (e.server || "") + " " + (e.tipo || "") + " " + (e.name || "") + " " +
        (e.servidor || "") + " " + (e.url || "") + " " + (e.embed || "")
      ).toLowerCase();
      if (blob.indexOf("jkplayer") !== -1 || /jkanime\.net\/jkplayer/i.test(blob)) return e;
    }
    // A veces solo trae un iframe de jkanime
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e && e.url && /jkanime\.net/i.test(String(e.url))) return e;
    }
    return list.length ? list[0] : null;
  }

  function hideKoiServerUi() {
    try {
      var boxN = $("mz-kp-servers");
      var boxD = $("mz-kp-servers-direct");
      var labD = $("mz-kp-direct-label");
      var wrap = document.querySelector("#mz-koi-ep-view .mz-kp-servers");
      if (boxN) {
        boxN.innerHTML = '<span style="color:#94a3b8;font-size:0.85rem">JKPlayer</span>';
      }
      if (boxD) {
        boxD.innerHTML = "";
        boxD.setAttribute("hidden", "");
        boxD.style.cssText = "display:none!important;height:0!important;";
      }
      if (labD) {
        labD.classList.add("hidden");
        labD.style.display = "none";
      }
      // Ocultar bloque "Reproductores" completo en JK
      if (wrap) {
        wrap.style.setProperty("display", "none", "important");
        wrap.setAttribute("data-jk-hidden", "1");
      }
    } catch (_) {}
  }

  function showKoiServerUi() {
    try {
      var wrap = document.querySelector("#mz-koi-ep-view .mz-kp-servers");
      if (wrap && wrap.getAttribute("data-jk-hidden") === "1") {
        wrap.style.removeProperty("display");
        wrap.removeAttribute("data-jk-hidden");
      }
    } catch (_) {}
  }

  function renderServers(embeds) {
    var boxN = $("mz-kp-servers");
    var boxD = $("mz-kp-servers-direct");
    var labD = $("mz-kp-direct-label");
    if (!boxN) return;
    boxN.innerHTML = "";
    if (boxD) {
      boxD.innerHTML = "";
      boxD.classList.add("mz-kp-empty");
      boxD.setAttribute("hidden", "");
      boxD.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;border:none!important;";
    }
    if (labD) {
      labD.classList.add("hidden");
      labD.textContent = "Directos";
      labD.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;";
    }

    if (isJkItem()) {
      // Fuente 5: no listar mirrors — solo JKPlayer
      hideKoiServerUi();
      if (!embeds || !embeds.length) {
        boxN.innerHTML = '<span style="color:#94a3b8;font-size:0.85rem">JKPlayer…</span>';
        return;
      }
      var jk = pickJkEmbed(embeds);
      if (jk) {
        try { playEmbed(jk, "iframe"); } catch (eJk) { console.warn("JK play", eJk); }
      }
      return;
    }
    showKoiServerUi();

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

        // Filas SUB/DUB en móvil (series, anime y películas)
    var mobileEp = !isPc();

    function appendLangRows(container, list, mode) {
      if (!container) return;
      container.innerHTML = "";
      if (!list.length) return;
      if (!mobileEp) {
        list.forEach(function (emb) {
          container.appendChild(makeServerBtn(emb, mode));
        });
        return;
      }
      // Móvil: filas SUB / DUB / resto — tag al inicio, chips sin badge
      var groups = [
        { key: "sub", label: "SUB", list: list.filter(function (e) { return langKeyOf(e) === "sub"; }) },
        { key: "dub", label: "DUB", list: list.filter(function (e) { return langKeyOf(e) === "dub"; }) },
        { key: "oth", label: "", list: list.filter(function (e) { return langKeyOf(e) !== "sub" && langKeyOf(e) !== "dub"; }) }
      ];
      groups.forEach(function (g) {
        if (!g.list.length) return;
        var row = document.createElement("div");
        row.className = "mz-kp-srv-row" + (g.key === "dub" ? " is-dub" : g.key === "sub" ? " is-sub" : "");
        if (g.label) {
          var tag = document.createElement("span");
          tag.className = "mz-kp-srv-row-tag" + (g.key === "dub" ? " is-dub" : " is-sub");
          tag.textContent = g.label;
          row.appendChild(tag);
        }
        var chips = document.createElement("div");
        chips.className = "mz-kp-srv-row-chips";
        // Scroll horizontal fiable (inline-block, no flex width:0)
        chips.setAttribute(
          "style",
          "display:block;overflow-x:auto;-webkit-overflow-scrolling:touch;" +
            "white-space:nowrap;width:100%;max-width:100%;min-width:0;" +
            "touch-action:pan-x;flex:1 1 auto;"
        );
        g.list.forEach(function (emb) {
          var b = makeServerBtn(emb, mode, { noBadge: true });
          if (b) {
            b.style.display = "inline-flex";
            b.style.verticalAlign = "middle";
            b.style.marginRight = "8px";
            b.style.flex = "none";
            chips.appendChild(b);
          }
        });
        row.appendChild(chips);
        row.setAttribute(
          "style",
          "display:flex;flex-flow:row nowrap;align-items:center;gap:8px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;"
        );
        container.appendChild(row);
      });
    }

    appendLangRows(boxN, normal, "iframe");

    if (direct.length && boxD) {
      if (labD) {
        labD.classList.remove("hidden");
        labD.style.cssText = "";
      }
      boxD.removeAttribute("hidden");
      boxD.classList.remove("mz-kp-empty");
      boxD.style.cssText = "";
      appendLangRows(boxD, direct, "direct");
    } else {
      if (labD) {
        labD.classList.add("hidden");
        labD.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;border:none!important;";
      }
      if (boxD) {
        boxD.innerHTML = "";
        boxD.classList.add("mz-kp-empty");
        boxD.setAttribute("hidden", "");
        boxD.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;border:none!important;min-height:0!important;";
      }
    }

    if (!normal.length && !direct.length) {
      boxN.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Sin mirrors válidos</span>';
    } else if (!normal.length && direct.length) {
      boxN.innerHTML =
        '<span style="color:#64748b;font-size:0.85rem">Sin embeds clásicos</span>';
    }

    // Nunca mostrar bloque de descargas embebido (solo panel ↓)
    try {
      var dlW = document.getElementById("mz-kp-downloads-wrap");
      if (dlW) dlW.remove();
    } catch (_) {}
  }

  function tryAutoSelectPreferred(embeds) {
    try {
      var pref = window.__mzPreferredServer;
      if (!pref || !embeds || !embeds.length) return false;
      var slug = (_ctx && _ctx.item && (_ctx.item.slug || _ctx.item.link)) || "";
      if (pref.slug && slug && String(pref.slug) !== String(slug)) return false;
      var wantName = String(pref.name || "").toLowerCase();
      var wantMode = pref.direct || pref.mode === "direct" ? "direct" : "iframe";
      var wantLang = String(pref.langKey || pref.idioma || "").toLowerCase();
      if (wantLang.indexOf("lat") !== -1 || wantLang.indexOf("dub") !== -1) wantLang = "dub";
      else if (wantLang.indexOf("sub") !== -1) wantLang = "sub";
      var best = null;
      function score(e) {
        var n = String(cleanServerName(e) || "").toLowerCase();
        var lk = langKeyOf(e);
        var s = 0;
        if (wantName && n === wantName) s += 10;
        else if (wantName && (n.indexOf(wantName) !== -1 || wantName.indexOf(n) !== -1)) s += 5;
        if (wantLang && lk === wantLang) s += 8;
        if (wantMode === "direct" && isDirectEmbed(e)) s += 2;
        return s;
      }
      var bestScore = 0;
      for (var i = 0; i < embeds.length; i++) {
        var e = embeds[i];
        if (!e) continue;
        var sc = score(e);
        if (sc > bestScore) {
          bestScore = sc;
          best = e;
        }
      }
      // Exigir al menos nombre o (nombre parcial + idioma)
      if (!best || bestScore < 10) return false;
      // Activar SOLO el chip que coincide nombre + idioma
      var bestName = String(cleanServerName(best) || "").toLowerCase();
      var bestLk = langKeyOf(best);
      var btns = document.querySelectorAll("#mz-kp-servers .mz-kp-srv-btn, #mz-kp-servers-direct .mz-kp-srv-btn");
      btns.forEach(function (b) {
        var match =
          (b.dataset.mzName || "") === bestName &&
          (!b.dataset.mzLang || b.dataset.mzLang === bestLk || bestLk === "oth");
        b.classList.toggle("active", match);
      });
      var mode = wantMode;
      // Si el preferido era directo pero este embed es normal, iframe
      if (mode === "direct" && !isDirectEmbed(best) && isNormalEmbed(best)) mode = "iframe";
      playEmbed(best, mode);
      return true;
    } catch (err) {
      console.warn("tryAutoSelectPreferred", err);
      return false;
    }
  }

  function renderDownloads(list) {
    var items = normalizeList(list).filter(function (d) {
      return (d.url || d.stream_url) && !isWorkerStreamApi(d.url || d.stream_url);
    });
    window.__mzKoiDownloads = items;
    // Eliminar bloque vacío (era el cuadrito bajo Directos)
    try {
      var wrap = document.getElementById("mz-kp-downloads-wrap");
      if (wrap) wrap.remove();
      var box = document.getElementById("mz-kp-downloads");
      if (box && box.parentNode) box.parentNode.remove();
    } catch (_) {}
  }


  function mzEnsureDlStyles() {
    if (document.getElementById("mz-kp-dl-styles")) return;
    var st = document.createElement("style");
    st.id = "mz-kp-dl-styles";
    st.textContent = `
#mz-kp-dl-panel{position:fixed!important;inset:0!important;z-index:2147483646!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;background:rgba(2,6,23,.72)!important;margin:0!important;padding:0!important}
#mz-kp-dl-panel.hidden{display:none!important}
.mz-kp-dl-sheet{width:100%!important;max-width:520px!important;max-height:72vh!important;overflow-y:auto!important;background:linear-gradient(180deg,#1a2438 0%,#0b1220 100%)!important;border-radius:20px 20px 0 0!important;border:1px solid rgba(255,255,255,.14)!important;box-shadow:0 -16px 48px rgba(0,0,0,.55)!important;padding:8px 16px calc(18px + env(safe-area-inset-bottom,0px))!important;box-sizing:border-box!important;color:#e2e8f0!important;font-family:system-ui,-apple-system,sans-serif!important}
.mz-kp-dl-sheet::before{content:"";display:block;width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,.22);margin:4px auto 12px}
.mz-kp-dl-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;margin:0 0 14px!important}
.mz-kp-dl-title{font-size:1.15rem!important;font-weight:800!important;color:#f8fafc!important;margin:0!important}
.mz-kp-dl-close{width:40px!important;height:40px!important;border-radius:12px!important;border:1px solid rgba(255,255,255,.14)!important;background:rgba(255,255,255,.08)!important;color:#f1f5f9!important;font-size:1.35rem!important;line-height:1!important;cursor:pointer!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:0!important}
.mz-kp-dl-list{display:flex!important;flex-direction:column!important;gap:10px!important}
.mz-kp-dl-row{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;width:100%!important;box-sizing:border-box!important;padding:14px!important;border-radius:14px!important;border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.05)!important;color:#e2e8f0!important;text-decoration:none!important;font-weight:600!important;font-size:.95rem!important}
.mz-kp-dl-name{flex:1 1 auto!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#f1f5f9!important;font-weight:700!important}
.mz-kp-dl-lang{flex:0 0 auto!important;font-size:11px!important;font-weight:800!important;padding:3px 8px!important;border-radius:6px!important;background:#2563eb!important;color:#fff!important}
.mz-kp-dl-action{flex:0 0 auto!important;font-size:11px!important;font-weight:800!important;letter-spacing:.06em!important;color:#67e8f9!important;text-transform:uppercase!important}
.mz-kp-dl-empty{color:#94a3b8!important;text-align:center!important;padding:20px 8px!important;font-size:.95rem!important}
`;
    document.head.appendChild(st);
  }

  function openDownloadsPanel() {
    mzEnsureDlStyles();
    try {
      var items = window.__mzKoiDownloads || [];
      // Siempre en body (si va dentro de #mz-koi-ep-view el fixed se desaline a)
      var host = document.body;
      var panel = document.getElementById("mz-kp-dl-panel");
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "mz-kp-dl-panel";
        host.appendChild(panel);
      } else if (panel.parentNode !== host) {
        host.appendChild(panel);
      }
      var rows = "";
      if (!items.length) {
        rows = '<div class="mz-kp-dl-empty">No hay descargas para este episodio</div>';
      } else {
        rows = '<div class="mz-kp-dl-list">';
        for (var i = 0; i < items.length; i++) {
          var d = items[i];
          if (!d) continue;
          var name = (typeof cleanServerName === "function" ? cleanServerName(d) : null) || d.servidor || d.server || d.name || ("Descarga " + (i + 1));
          var idioma = d.idioma || d.lang || "";
          var idLow = String(idioma).toLowerCase();
          var tag = "";
          if (/lat|dub|castellano|espa/.test(idLow)) tag = "DUB";
          else if (/sub/.test(idLow)) tag = "SUB";
          else if (idioma) tag = String(idioma).slice(0, 6).toUpperCase();
          var url = d.url || d.stream_url || d.link || "#";
          rows +=
            '<a class="mz-kp-dl-row" href="' + String(url).replace(/"/g, "&quot;") + '" target="_blank" rel="noopener noreferrer">' +
              '<span class="mz-kp-dl-name">' + String(name).replace(/</g, "") + "</span>" +
              (tag ? '<span class="mz-kp-dl-lang">' + tag + "</span>" : "") +
              '<span class="mz-kp-dl-action">DESCARGAR</span>' +
            "</a>";
        }
        rows += "</div>";
      }
      panel.className = "mz-kp-dl-panel";
      panel.innerHTML =
        '<div class="mz-kp-dl-sheet" role="dialog" aria-label="Descargas">' +
          '<div class="mz-kp-dl-head">' +
            '<span class="mz-kp-dl-title">Descargas</span>' +
            '<button type="button" class="mz-kp-dl-close" id="mz-kp-dl-close" aria-label="Cerrar">×</button>' +
          "</div>" +
          rows +
        "</div>";
      panel.style.cssText =
        "display:flex;position:fixed;left:0;right:0;top:0;bottom:0;z-index:2147483646;" +
        "align-items:flex-end;justify-content:center;margin:0;padding:0;" +
        "background:rgba(2,6,23,0.72);pointer-events:auto;visibility:visible;opacity:1;" +
        "transform:none;inset:auto;";
      document.body.classList.add("mz-kp-dl-open");
      function closeDl() {
        panel.className = "mz-kp-dl-panel hidden";
        panel.style.display = "none";
        document.body.classList.remove("mz-kp-dl-open");
      }
      var closeBtn = document.getElementById("mz-kp-dl-close");
      if (closeBtn) closeBtn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        closeDl();
      };
      panel.onclick = function (ev) {
        if (ev.target === panel) closeDl();
      };
    } catch (err) {
      console.error("openDownloadsPanel", err);
      try { alert("Descargas: " + (err && err.message ? err.message : err)); } catch (_) {}
    }
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

    if (mode === "episode" || mode === "episode-mobile") {
      if (origEl) {
        origEl.textContent = "";
        origEl.classList.add("hidden");
      }
      if (genres) genres.innerHTML = "";

      var epEl = $("mz-kp-ep-title");
      var synEl = $("mz-kp-synopsis");

      if (mode === "episode-mobile") {
        // Sin título de serie ni "Serie/Anime" (pedido)
        if (epEl) {
          epEl.textContent = "";
          epEl.style.display = "none";
        }
        var subBtn = $("mz-kp-anime-title");
        if (subBtn) {
          subBtn.textContent = "";
          subBtn.style.display = "none";
        }
        try {
          var typeLab = $("mz-kp-type-label");
          if (typeLab) {
            typeLab.textContent = "";
            typeLab.classList.add("hidden");
            typeLab.style.display = "none";
          }
        } catch (_) {}
        if (chips) chips.innerHTML = "";
        if (metaLine) metaLine.textContent = "";
        var sn = Number((episodio && (episodio.season || episodio.temporada)) || 1) || 1;
        var en = Number((episodio && (episodio.episode || episodio.episodio)) || 0) || 0;
        // Barra bajo el player: ant / sig / descarga + estás viendo
        try {
          var hero = document.querySelector("#mz-koi-ep-view .mz-kp-hero");
          var bar = document.getElementById("mz-kp-ep-mobile-bar");
          if (!bar) {
            bar = document.createElement("div");
            bar.id = "mz-kp-ep-mobile-bar";
            bar.className = "mz-kp-ep-mobile-bar";
          }
          bar.innerHTML =
            '<div class="mz-kp-ep-nav" id="mz-kp-ep-nav">' +
              '<button type="button" class="mz-kp-ep-nav-btn" id="mz-kp-ep-prev">‹ Anterior</button>' +
              '<button type="button" class="mz-kp-ep-nav-btn" id="mz-kp-ep-next">Siguiente ›</button>' +
              '<button type="button" class="mz-kp-ep-nav-btn mz-kp-ep-dl" id="mz-kp-ep-dl" title="Descargas" onclick="try{window.mzKoiOpenDownloads&&window.mzKoiOpenDownloads()}catch(e){}">↓</button>' +
            "</div>" +
            '<div class="mz-kp-ep-watching" id="mz-kp-ep-watching">' +
              '<div class="mz-kp-watching-label">Estás viendo</div>' +
              '<div class="mz-kp-watching-ep">T' + sn + " · Episodio " + en + "</div>" +
            "</div>";
          if (hero && hero.parentNode) {
            if (bar.parentNode !== hero.parentNode) hero.parentNode.insertBefore(bar, hero.nextSibling);
            else hero.parentNode.insertBefore(bar, hero.nextSibling);
          }
          // Bind descargas de forma directa (móvil touch)
          var dlBtn = document.getElementById("mz-kp-ep-dl");
          if (dlBtn) {
            dlBtn.onclick = function (e) {
              try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
              openDownloadsPanel();
              return false;
            };
            dlBtn.ontouchend = function (e) {
              try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
              openDownloadsPanel();
              return false;
            };
          }
        } catch (_) {}
        if (synEl) {
          synEl.innerHTML = "";
          if (synEl.parentElement) synEl.parentElement.classList.add("hidden");
          // Bind prev/next
          setTimeout(function () {
            try {
              var prev = document.getElementById("mz-kp-ep-prev");
              var next = document.getElementById("mz-kp-ep-next");
              if (prev) prev.onclick = function () {
                if (typeof window.mzKoiGoPrevEpisode === "function") window.mzKoiGoPrevEpisode();
              };
              if (next) next.onclick = function () {
                if (typeof window.mzKoiGoNextEpisode === "function") window.mzKoiGoNextEpisode();
              };
              var dl = document.getElementById("mz-kp-ep-dl");
              if (dl) dl.onclick = function () {
                try { openDownloadsPanel(); } catch (_) {}
              };
            } catch (_) {}
          }, 0);
        }
        return;
      }

      if (chips) chips.innerHTML = "";
      epEl.textContent = epTitleText || "Episodio";
      epEl.style.display = "";
      var parts = [];
      parts.push(idiomaSimple(item, episodio));
      var dur = durationOf(episodio, item) || "24m";
      parts.push(dur);
      if (metaLine) metaLine.textContent = parts.filter(Boolean).join(" · ");
      if (synEl) {
        var txt =
          (episodio && episodio.descripcion) ||
          item.descripcion ||
          item.synopsis ||
          "";
        synEl.textContent = txt;
        synEl.style.removeProperty("display");
        synEl.style.removeProperty("visibility");
        var parent = synEl.parentElement;
        if (parent) {
          parent.style.removeProperty("display");
          parent.style.removeProperty("visibility");
          if (txt && String(txt).trim()) parent.classList.remove("hidden");
          else parent.classList.add("hidden");
        }
      }
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
    if (!eps.length && Array.isArray(item.episodes)) eps = item.episodes.slice();
    try {
      if (!isPc()) list.classList.add("mz-kp-ep-num-grid");
      else list.classList.remove("mz-kp-ep-num-grid");
    } catch (_) {}
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
    var mobile = !isPc();
    eps.forEach(function (ep, idx) {
      var n = epNumOf(ep, idx + 1);
      var s = seasonOf(ep, 1);
      var playing = n === Number(currentEp) && s === Number(currentSeason);
      var card = document.createElement("button");
      card.type = "button";
      if (mobile) {
        // Cuadritos solo número
        card.className = "mz-kp-ep-num" + (playing ? " is-playing active" : "");
        card.textContent = String(n);
        card.setAttribute("aria-label", "Episodio " + n);
      } else {
        var isAnimeEp = /anime/i.test(String(item.tipo || item.type || ""));
        var thumb = isAnimeEp
          ? (ep.back_img || ep.screenshot || ep.still || ep.image || ep.imagen || ep.thumbnail || item.portada || PLACEHOLDER)
          : (ep.back_img || ep.still || ep.image || ep.imagen || ep.thumbnail || item.backdrop || item.portada || PLACEHOLDER);
        card.className = "mz-kp-ep-card" + (playing ? " playing is-playing active" : "");
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
      }
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


  /** Limpia residuos al pasar película ↔ serie/anime */
  function resetKoiChrome(mode) {
    try {
      var view = $("mz-koi-ep-view");
      if (!view) return;
      try {
        var dead = document.getElementById("mz-kp-downloads-wrap");
        if (dead) dead.remove();
      } catch (_) {}

      // Botón descarga de película solo en movie
      var movieDl = document.getElementById("mz-kp-movie-dl");
      var movieBar = document.getElementById("mz-kp-movie-dl-bar");
      if (mode !== "movie") {
        if (movieDl) movieDl.remove();
        if (movieBar) movieBar.remove();
      }
      var titleRow = document.querySelector("#mz-koi-ep-view .mz-kp-ep-title-row");
      if (titleRow) {
        if (mode !== "movie") titleRow.classList.remove("mz-kp-movie-title-row");
      }

      // Barra episodio solo en episode
      var epBar = document.getElementById("mz-kp-ep-mobile-bar");
      if (mode === "movie" && epBar) epBar.remove();

      // Quitar estilos inline que quedan colgados
      [
        "mz-kp-ep-title",
        "mz-kp-anime-title",
        "mz-kp-sidebar",
        "mz-kp-ep-list",
        "mz-kp-synopsis",
        "mz-kp-original",
        "mz-kp-meta-chips",
        "mz-kp-genres",
        "mz-kp-meta",
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.removeProperty("display");
        el.style.removeProperty("visibility");
        el.style.removeProperty("font-size");
        el.style.removeProperty("text-align");
        el.style.removeProperty("width");
        el.style.removeProperty("order");
      });

      // BUGFIX: mzMovieSynopsisToBottom() pone display/visibility !important
      // en el DIV .mz-kp-synopsis (padre), no en el <p id="mz-kp-synopsis">.
      // Al pasar película → episodio queda un cuadrito vacío transparente.
      try {
        var synWrap = document.querySelector("#mz-koi-ep-view .mz-kp-synopsis");
        if (synWrap) {
          synWrap.style.removeProperty("display");
          synWrap.style.removeProperty("visibility");
          synWrap.style.removeProperty("order");
          synWrap.style.removeProperty("height");
          synWrap.style.removeProperty("min-height");
          synWrap.style.removeProperty("margin");
          synWrap.style.removeProperty("padding");
          if (mode !== "movie") {
            synWrap.classList.add("hidden");
            var synP = synWrap.querySelector("p") || document.getElementById("mz-kp-synopsis");
            if (synP) {
              synP.textContent = "";
              synP.style.removeProperty("display");
              synP.style.removeProperty("visibility");
            }
          } else {
            synWrap.classList.remove("hidden");
          }
        }
      } catch (_) {}

      var an = $("mz-kp-anime-title");
      if (an) {
        an.style.setProperty("text-align", "left");
        an.style.setProperty("display", "inline-block");
        an.style.setProperty("width", "auto");
        an.style.setProperty("align-self", "flex-start");
      }

      var side = $("mz-kp-sidebar");
      if (side) {
        side.classList.remove("mz-kp-sidebar-mobile-ep");
        if (mode === "movie") {
          side.classList.add("hidden");
        } else {
          side.classList.remove("hidden");
        }
      }

      var list = $("mz-kp-ep-list");
      if (list && mode === "movie") {
        list.innerHTML = "";
        list.classList.remove("mz-kp-ep-num-grid");
      }

      // Botones play del detalle (evitar doble "Reproducir")
      try {
        document.querySelectorAll(".koi-btn-play, #koi-btn-play, .mz-play-btn").forEach(function (b) {
          b.style.removeProperty("visibility");
          b.style.removeProperty("pointer-events");
          b.style.removeProperty("display");
          b.style.removeProperty("font-size");
        });
      } catch (_) {}

      // Panel descargas cerrado
      var panel = document.getElementById("mz-kp-dl-panel");
      if (panel) {
        panel.classList.add("hidden");
        panel.style.display = "none";
      }
      document.body.classList.remove("mz-kp-dl-open", "mz-mep-dl-open");

      // Limpiar servers residuales (película → episodio)
      try {
        var boxN = document.getElementById("mz-kp-servers");
        var boxD = document.getElementById("mz-kp-servers-direct");
        var labD = document.getElementById("mz-kp-direct-label");
        var dlW = document.getElementById("mz-kp-downloads-wrap");
        if (boxN) {
          boxN.innerHTML = "";
          boxN.style.removeProperty("display");
          boxN.style.removeProperty("overflow");
          boxN.style.removeProperty("pointer-events");
        }
        if (boxD) {
          boxD.innerHTML = "";
          boxD.classList.add("mz-kp-empty");
          boxD.setAttribute("hidden", "");
          boxD.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;border:none!important;min-height:0!important;";
        }
        if (labD) {
          labD.classList.add("hidden");
          labD.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;border:none!important;";
        }
        if (dlW) {
          dlW.hidden = true;
          dlW.style.setProperty("display", "none", "important");
        }
        var view = document.getElementById("mz-koi-ep-view");
        if (view) {
          view.style.removeProperty("pointer-events");
          view.style.removeProperty("touch-action");
        }
      } catch (_) {}
    } catch (e) {
      console.warn("resetKoiChrome", e);
    }
  }

  async function openEpisode(item, episodio, seasonNum, epNum) {
    if (!item) return false;
    var myToken = ++_openToken;
    _openLock = true;
    try {
      ensureDom();
      try { resetKoiChrome("episode"); } catch (_) {}
      seasonNum = Number(seasonNum) || seasonOf(episodio, 1) || 1;
      epNum = Number(epNum) || epNumOf(episodio, 1) || 1;
      episodio = episodio || { season: seasonNum, episode: epNum };

      var view = $("mz-koi-ep-view");
      var mobile = !isPc();

      // Mismo episodio ya abierto → no reiniciar
      if (
        view &&
        view.classList.contains("open") &&
        _ctx &&
        _ctx.item &&
        String(_ctx.item.slug || _ctx.item.link || "") === String(item.slug || item.link || "") &&
        Number(_ctx.season) === seasonNum &&
        Number(_ctx.episode) === epNum
      ) {
        return true;
      }

      _mode = "episode";
      try {
        if (typeof window.mzPushDetalleUrl === "function") {
          window.mzPushDetalleUrl(item, seasonNum, epNum);
        }
      } catch (_) {}
      view.classList.add("open");
      view.setAttribute("aria-hidden", "false");
      document.body.classList.add("mz-koi-ep-open");
      // Quitar residuos de película
      try {
        var md = document.getElementById("mz-kp-movie-dl");
        if (md) md.remove();
        var tr = view.querySelector(".mz-kp-ep-title-row");
        if (tr) tr.classList.remove("mz-kp-movie-title-row");
        view.style.removeProperty("pointer-events");
        document.body.style.removeProperty("touch-action");
        document.body.style.removeProperty("pointer-events");
      } catch (_) {}

      // Quitar shell móvil / detalle debajo (evita doble vista)
      try {
        document.body.classList.remove(
          "mz-mobile-ep-playing",
          "mz-ep-movie-shell",
          "mz-mep-dl-open",
          "mz-mobile-movie-playing",
          "player-open",
          "koi-movie"
        );
        var dp = document.getElementById("details-panel");
        if (dp) {
          dp.classList.add("mz-koi-hidden-under");
          dp.style.setProperty("visibility", "hidden", "important");
          dp.style.setProperty("pointer-events", "none", "important");
          dp.style.setProperty("opacity", "0", "important");
          dp.style.setProperty("z-index", "0", "important");
        }
        try {
          document.querySelectorAll(".koi-btn-play, #koi-btn-play").forEach(function (b) {
            b.style.setProperty("visibility", "hidden", "important");
            b.style.setProperty("pointer-events", "none", "important");
          });
        } catch (_) {}
        ["mz-mobile-ep-nav", "mz-mobile-ep-watching", "mz-mep-dl-panel"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.classList.add("hidden");
        });
        var vcOld = document.getElementById("video-player-container");
        if (vcOld) {
          vcOld.classList.add("hidden");
          var ifr = document.getElementById("player-iframe");
          if (ifr) ifr.src = "about:blank";
        }
        if (typeof window.destruirHls === "function") window.destruirHls();
      } catch (_) {}

      try {
        var layout = view.querySelector(".mz-kp-layout");
        var side = $("mz-kp-sidebar");
        if (mobile) {
          view.classList.add("mz-kp-movie-mode", "mz-kp-ep-mobile");
          if (layout) layout.classList.add("mz-kp-layout-movie");
          if (side) {
            side.classList.remove("hidden");
            side.classList.add("mz-kp-sidebar-mobile-ep");
          }
        } else {
          view.classList.remove("mz-kp-movie-mode", "mz-kp-ep-mobile");
          if (layout) layout.classList.remove("mz-kp-layout-movie");
          if (side) {
            side.classList.remove("hidden", "mz-kp-sidebar-mobile-ep");
          }
        }
      } catch (_) {}

      _ctx = { item: item, episodio: episodio, season: seasonNum, episode: epNum };

      try {
        fillTitles(item, epLabel(episodio, epNum), mobile ? "episode-mobile" : "episode", episodio);
      } catch (e1) {
        console.warn("fillTitles", e1);
      }
      try {
        renderSidebar(item, epNum, seasonNum);
      } catch (e2) {
        console.warn("renderSidebar", e2);
      }
      // Forzar sidebar visible en móvil (CSS movie-mode la ocultaba)
      try {
        if (mobile) {
          var side2 = $("mz-kp-sidebar");
          if (side2) {
            side2.classList.remove("hidden");
            side2.classList.add("mz-kp-sidebar-mobile-ep");
            side2.style.setProperty("display", "block", "important");
            side2.style.setProperty("visibility", "visible", "important");
          }
          var list2 = $("mz-kp-ep-list");
          if (list2) {
            list2.style.setProperty("display", "grid", "important");
          }
        }
      } catch (_) {}

      destroyHls();
      showPoster(item, "Elige un reproductor para comenzar");
      renderServers([]);
      renderDownloads([]);

      // Cargar servers sin tumbar la vista si falla
      try {
        var pack = await fetchCapitulo(item, seasonNum, epNum);
        if (myToken !== _openToken) return true; // otra apertura más nueva
        if (episodio) {
          episodio.embeds = pack.embeds;
          episodio.downloads = pack.downloads;
        }
        if (isJkItem(item)) {
          hideKoiServerUi();
          renderDownloads(pack.downloads || []);
          var jkEmb = pickJkEmbed(pack.embeds || []);
          if (jkEmb) {
            try {
              await playEmbed(jkEmb, "iframe");
            } catch (eJk2) {
              console.warn("JK openEpisode", eJk2);
              showPoster(item, "No se pudo cargar JKPlayer");
            }
          } else {
            showPoster(item, "Sin JKPlayer para este episodio");
          }
        } else {
          showKoiServerUi();
          renderServers(pack.embeds || []);
          renderDownloads(pack.downloads || []);
          var autoOk = tryAutoSelectPreferred(pack.embeds || []);
          if (!autoOk) {
            showPoster(
              item,
              pack.embeds && pack.embeds.length
                ? "Elige un reproductor para comenzar"
                : "Sin mirrors para este episodio"
            );
          }
        }
      } catch (eFetch) {
        console.warn("fetchCapitulo", eFetch);
        showPoster(item, "No se pudieron cargar servidores");
      }

      try {
        view.scrollTop = 0;
      } catch (_) {}
      return true;
    } catch (e) {
      console.error("openEpisode", e);
      return false;
    } finally {
      _openLock = false;
    }
  }


  function ensureMovieDlBar() {
    try {
      var oldBar = document.getElementById("mz-kp-movie-dl-bar");
      if (oldBar) oldBar.remove();
      if (isPc()) {
        var b0 = document.getElementById("mz-kp-movie-dl");
        if (b0) b0.remove();
        return;
      }
      var row = document.querySelector("#mz-koi-ep-view.mz-kp-movie-mode .mz-kp-ep-title-row");
      if (!row) return;
      row.classList.add("mz-kp-movie-title-row");
      var btn = document.getElementById("mz-kp-movie-dl");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.id = "mz-kp-movie-dl";
        btn.className = "mz-kp-movie-dl-btn";
        btn.title = "Descargas";
        btn.setAttribute("aria-label", "Descargas");
        btn.textContent = "↓";
      }
      btn.textContent = "↓";
      // Solo al final de la fila del título
      if (btn.parentNode !== row) row.appendChild(btn);
      else if (row.lastElementChild !== btn) row.appendChild(btn);

      btn.onclick = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        openDownloadsPanel();
        return false;
      };
      btn.ontouchend = function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        openDownloadsPanel();
        return false;
      };
    } catch (err) {
      console.warn("ensureMovieDlBar", err);
    }
  }


  function mzMovieSynopsisToBottom() {
    try {
      if (_mode !== "movie") return;
      var info = document.querySelector("#mz-koi-ep-view .mz-kp-info");
      if (!info) return;
      var syn = info.querySelector(".mz-kp-synopsis");
      if (!syn) return;
      info.appendChild(syn);
      syn.style.removeProperty("display");
      syn.style.setProperty("display", "block", "important");
      syn.style.setProperty("visibility", "visible", "important");
      var p = syn.querySelector("p") || document.getElementById("mz-kp-synopsis");
      if (p) {
        p.style.removeProperty("display");
        p.style.setProperty("display", "block", "important");
      }
    } catch (_) {}
  }

  async function openMovie(item) {
//    if (!isPc()) return false;
    if (!item) return false;
    ensureDom();
    try { resetKoiChrome("movie"); } catch (_) {}
    _mode = "movie";
    var view = $("mz-koi-ep-view");
    view.classList.add("open");
    view.classList.add("mz-kp-movie-mode");
    view.classList.remove("mz-kp-ep-mobile");
    view.setAttribute("aria-hidden", "false");
    document.body.classList.add("mz-koi-ep-open");
    // Limpiar UI de episodio móvil (no tocar series: solo al abrir película)
    try {
      var epBar = document.getElementById("mz-kp-ep-mobile-bar");
      if (epBar) epBar.remove();
      var side0 = $("mz-kp-sidebar");
      if (side0) {
        side0.classList.add("hidden");
        side0.classList.remove("mz-kp-sidebar-mobile-ep");
        side0.style.removeProperty("display");
        side0.style.removeProperty("visibility");
      }
      var list0 = $("mz-kp-ep-list");
      if (list0) {
        list0.innerHTML = "";
        list0.classList.remove("mz-kp-ep-num-grid");
        list0.style.removeProperty("display");
      }
      // Restaurar títulos ocultos por episodio móvil
      var epTitle = $("mz-kp-ep-title");
      if (epTitle) epTitle.style.removeProperty("display");
      var anTitle = $("mz-kp-anime-title");
      if (anTitle) anTitle.style.removeProperty("display");
    } catch (_) {}
    try {
      document.body.classList.remove("mz-mobile-ep-playing", "mz-ep-movie-shell", "mz-mep-dl-open");
      var dp2 = document.getElementById("details-panel");
      if (dp2) {
        dp2.classList.add("mz-koi-hidden-under");
        dp2.style.setProperty("visibility", "hidden", "important");
        dp2.style.setProperty("pointer-events", "none", "important");
      }
    } catch (_) {}

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
    try { ensureMovieDlBar(); } catch (_) {}
    try { mzMovieSynopsisToBottom(); } catch (_) {}

    var pack = await fetchMoviePlayers(item);
    item = pack.item || item;
    _ctx.item = item;
    fillTitles(item, null, "movie");
    $("mz-kp-anime-title").textContent = item.tipo || "Película";
    $("mz-kp-ep-title").textContent = item.nombre || item.titulo || "Película";

    renderServers(pack.embeds);
    renderDownloads(pack.downloads);
    try { ensureMovieDlBar(); } catch (_) {}
    try { mzMovieSynopsisToBottom(); } catch (_) {}
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
    try { resetKoiChrome("episode"); } catch (_) {}
    try {
      var movieDl = document.getElementById("mz-kp-movie-dl");
      if (movieDl) movieDl.remove();
      var epBar = document.getElementById("mz-kp-ep-mobile-bar");
      if (epBar) epBar.remove();
      var titleRow = document.querySelector("#mz-koi-ep-view .mz-kp-ep-title-row");
      if (titleRow) titleRow.classList.remove("mz-kp-movie-title-row");
    } catch (_) {}
    view.classList.remove("open");
    view.classList.remove("mz-kp-movie-mode", "mz-kp-ep-mobile");
    view.setAttribute("aria-hidden", "true");
    document.body.classList.remove("mz-koi-ep-open", "koi-movie", "player-open", "mz-mobile-movie-playing");
    try {
      var bn = document.getElementById("mz-kp-servers");
      var bd = document.getElementById("mz-kp-servers-direct");
      var ld = document.getElementById("mz-kp-direct-label");
      if (bn) bn.innerHTML = "";
      if (bd) {
        bd.innerHTML = "";
        bd.classList.add("mz-kp-empty");
        bd.setAttribute("hidden", "");
        bd.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;border:none!important;";
      }
      if (ld) {
        ld.classList.add("hidden");
        ld.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important;";
      }
    } catch (_) {}
    try {
      var layout = view.querySelector(".mz-kp-layout");
      if (layout) layout.classList.remove("mz-kp-layout-movie");
      var side = $("mz-kp-sidebar");
      if (side) side.classList.remove("hidden", "mz-kp-sidebar-mobile-ep");
    } catch (_) {}
    try {
      var dp = document.getElementById("details-panel");
      if (dp) {
        dp.classList.remove("mz-koi-hidden-under");
        dp.style.removeProperty("visibility");
        dp.style.removeProperty("pointer-events");
        dp.style.removeProperty("opacity");
        dp.style.removeProperty("z-index");
      }
      try {
        document.querySelectorAll(".koi-btn-play, #koi-btn-play").forEach(function (b) {
          b.style.removeProperty("visibility");
          b.style.removeProperty("pointer-events");
        });
      } catch (_) {}
    } catch (_) {}
    destroyHls();
    _ctx = null;
  }

  function listEpisodes(item) {
    var eps = (item && (item.episodios || item.episodes)) || [];
    if (!Array.isArray(eps)) return [];
    return eps.slice().sort(function (a, b) {
      var sa = seasonOf(a, 1), sb = seasonOf(b, 1);
      if (sa !== sb) return sa - sb;
      return epNumOf(a, 0) - epNumOf(b, 0);
    });
  }
  function goAdjacentEpisode(dir) {
    if (!_ctx || !_ctx.item) return;
    var item = _ctx.item;
    var list = listEpisodes(item);
    if (!list.length) return;
    var curS = Number(_ctx.season) || 1;
    var curE = Number(_ctx.episode) || 1;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (seasonOf(list[i], 1) === curS && epNumOf(list[i], 0) === curE) {
        idx = i;
        break;
      }
    }
    var next = list[idx + dir];
    if (!next) return;
    var sn = seasonOf(next, 1);
    var en = epNumOf(next, 1);
    openEpisode(item, next, sn, en);
  }
  // Delegación: botón descargas (sobrevive a re-renders)
  if (!window.__mzKpDlDelegate) {
    window.__mzKpDlDelegate = true;
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t) return;
        var btn = t.closest
          ? t.closest("#mz-kp-ep-dl, #mz-kp-movie-dl")
          : null;
        if (!btn && (t.id === "mz-kp-ep-dl" || t.id === "mz-kp-movie-dl")) btn = t;
        if (!btn) return;
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (_) {}
        try {
          openDownloadsPanel();
        } catch (e) {
          console.warn("openDownloadsPanel", e);
        }
      },
      true
    );
  }

  window.mzKoiOpenDownloads = openDownloadsPanel;
  window.mzKoiGoPrevEpisode = function () { goAdjacentEpisode(-1); };
  window.mzKoiGoNextEpisode = function () { goAdjacentEpisode(1); };
  window.mzKoiOpenEpisode = openEpisode;
  window.mzKoiOpenMovie = openMovie;
  window.mzKoiCloseEpisode = closeView;
})();
