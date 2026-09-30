(function () {
  "use strict";

  function iniciar() {
    if (document.getElementById("mz-mobile-bottom-nav")) return;

    const nav = document.createElement("div");
    nav.id = "mz-mobile-bottom-nav";
    nav.innerHTML = `
      <button type="button" class="mz-mobile-nav-item active" data-target="home">
        <ion-icon name="home-outline"></ion-icon>
        <span>Inicio</span>
      </button>
      <button type="button" class="mz-mobile-nav-item" data-target="movie">
        <ion-icon name="film-outline"></ion-icon>
        <span>Películas</span>
      </button>
      <button type="button" class="mz-mobile-nav-item" data-target="series">
        <ion-icon name="tv-outline"></ion-icon>
        <span>Series</span>
      </button>
      <button type="button" class="mz-mobile-nav-item" data-target="anime">
        <ion-icon name="sparkles-outline"></ion-icon>
        <span>Anime</span>
      </button>
      <button type="button" class="mz-mobile-nav-item" data-target="jk">
        <ion-icon name="play-circle-outline"></ion-icon>
        <span>JK</span>
      </button>
      <button type="button" class="mz-mobile-nav-item" data-target="favorites">
        <ion-icon name="bookmark-outline"></ion-icon>
        <span>Favoritos</span>
      </button>
    `;

    document.body.appendChild(nav);

    // Estilos
    if (!document.getElementById("mz-mobile-bottom-nav-style")) {
      const style = document.createElement("style");
      style.id = "mz-mobile-bottom-nav-style";
      style.textContent = `
        #mz-mobile-bottom-nav {
          display: none;
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9990;
          height: 58px;
          padding: 0 4px env(safe-area-inset-bottom, 0);
          background: rgba(10, 6, 17, 0.96);
          border-top: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          align-items: center;
          justify-content: space-around;
          box-sizing: border-box;
        }
        @media (max-width: 900px) {
          #mz-mobile-bottom-nav { display: flex; }
          body { padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
        }
        body.details-open #mz-mobile-bottom-nav,
        body.player-open #mz-mobile-bottom-nav,
        body.mz-koi-ep-open #mz-mobile-bottom-nav,
        body.mz-mobile-ep-playing #mz-mobile-bottom-nav {
          display: none !important;
        }
        .mz-mobile-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          min-width: 0;
          padding: 6px 2px;
          border: 0;
          background: transparent;
          color: rgba(255,255,255,0.55);
          font-size: 10px;
          font-family: inherit;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .mz-mobile-nav-item ion-icon {
          font-size: 22px;
          pointer-events: none;
        }
        .mz-mobile-nav-item span {
          pointer-events: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .mz-mobile-nav-item.active {
          color: #a78bfa;
        }
      `;
      document.head.appendChild(style);
    }

    function setActive(target) {
      nav.querySelectorAll(".mz-mobile-nav-item").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-target") === target);
      });
    }

    function go(target) {
      setActive(target);
      try {
        if (target === "home") {
          document.getElementById("nav-link-home")?.click();
          return;
        }
        if (target === "favorites") {
          document.getElementById("nav-link-favoritos")?.click();
          return;
        }
        // movie | series | anime | jk
        const tab =
          document.querySelector('.filter-tab[data-type="' + target + '"]') ||
          document.querySelector('.filter-chip[data-type="' + target + '"]');
        if (tab) {
          tab.click();
          return;
        }
        // Fallback si aún no hay tab JK en el DOM
        if (target === "jk" && typeof mostrarGrid === "function") {
          mostrarGrid({ modo: "categoria", seccion: "jk" });
        }
      } catch (e) {
        console.warn("mobile-nav", e);
      }
    }

    nav.addEventListener("click", function (e) {
      const btn = e.target.closest(".mz-mobile-nav-item");
      if (!btn) return;
      e.preventDefault();
      const t = btn.getAttribute("data-target");
      if (t) go(t);
    });

    console.log("MovieZone: menú móvil cargado.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
