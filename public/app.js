/* ============================================================
   PARCHE: bloquear popups/redirecciones de anuncios en el
   iframe del reproductor (funciona en cualquier navegador,
   no depende de que el usuario tenga Brave o una extensión).

   Bloquea: popunders (window.open), redirecciones de la
   pestaña completa a otro sitio (el ataque más común de estos
   reproductores). NO bloquea: banners/overlays dibujados con
   CSS dentro del propio iframe (esos sí necesitan un
   adblocker de navegador, no hay forma de tocarlos desde
   fuera del iframe).

   DÓNDE PEGAR: dentro de la función reproducir(), justo antes
   de la línea "playerIframe.src = embed.url;" — reemplaza esa
   sección por esto.
   ============================================================ */

    destruirHls();
    mostrarBotonFullscreen(false);
    videoContainer.classList.remove("hidden");
    // allow-scripts + allow-same-origin: el player puede correr su JS y
    // sus propios recursos, pero NO puede abrir popups (allow-popups)
    // ni redirigir la pestaña completa (allow-top-navigation) — ahí es
    // donde vive la mayoría de los anuncios de estos sitios.
    playerIframe.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms"
    );
    playerIframe.src = embed.url;
