(function () {

    "use strict";

    function iniciar() {

        if (
            document.getElementById(
                "mz-mobile-bottom-nav"
            )
        ) {
            return;
        }


        const nav =
            document.createElement(
                "div"
            );


        nav.id =
            "mz-mobile-bottom-nav";


        nav.innerHTML = `

            <button
                type="button"
                class="mz-mobile-nav-item active"
                data-target="home"
            >
                <ion-icon
                    name="home-outline">
                </ion-icon>

                <span>Inicio</span>

            </button>


            <button
                type="button"
                class="mz-mobile-nav-item"
                data-target="movie"
            >
                <ion-icon
                    name="film-outline">
                </ion-icon>

                <span>Películas</span>

            </button>


            <button
                type="button"
                class="mz-mobile-nav-item"
                data-target="series"
            >
                <ion-icon
                    name="tv-outline">
                </ion-icon>

                <span>Series</span>

            </button>


            <button
                type="button"
                class="mz-mobile-nav-item"
                data-target="anime"
            >
                <ion-icon
                    name="sparkles-outline">
                </ion-icon>

                <span>Anime</span>

            </button>


            <button
                type="button"
                class="mz-mobile-nav-item"
                data-target="favorites"
            >
                <ion-icon
                    name="heart-outline">
                </ion-icon>

                <span>Favoritos</span>

            </button>

        `;


        document.body.appendChild(
            nav
        );


        const style =
            document.createElement(
                "style"
            );


        style.textContent = `

            #mz-mobile-bottom-nav {
                display: none;
            }


            @media (max-width: 768px) {

                #mz-mobile-bottom-nav {

                    display: grid;

                    grid-template-columns:
                        repeat(5, 1fr);

                    position: fixed;

                    left: 0;
                    right: 0;
                    bottom: 0;

                    height: 64px;

                    padding-bottom:
                        env(safe-area-inset-bottom);

                    background:
                        rgba(8,8,12,.97);

                    backdrop-filter:
                        blur(18px);

                    -webkit-backdrop-filter:
                        blur(18px);

                    border-top:
                        1px solid
                        rgba(255,255,255,.08);

                    box-shadow:
                        0 -8px 30px
                        rgba(0,0,0,.4);

                    z-index: 99999;

                }


                .mz-mobile-nav-item {

                    border: none;

                    background:
                        transparent;

                    color:
                        rgba(255,255,255,.55);

                    display: flex;

                    flex-direction:
                        column;

                    align-items: center;

                    justify-content: center;

                    gap: 3px;

                    font-family: inherit;

                    font-size: 10px;

                    font-weight: 600;

                    cursor: pointer;

                }


                .mz-mobile-nav-item ion-icon {

                    font-size: 21px;

                }


                .mz-mobile-nav-item.active {

                    color: #fff;

                }


                .mz-mobile-nav-item.active ion-icon {

                    color: #e50914;

                }


                body {

                    padding-bottom:
                        74px !important;

                }


                /*
                 * IMPORTANTE:
                 * NO escondemos el buscador.
                 * Se mantiene arriba.
                 */

                .nav-links {

                    display: none !important;

                }

            }


            @media (min-width: 769px) {

                #mz-mobile-bottom-nav {

                    display: none !important;

                }

            }

        `;


        document.head.appendChild(
            style
        );


        const elementos = {

            home:
                document.getElementById(
                    "nav-link-home"
                ),

            movie:
                document.querySelector(
                    "#nav-item-movies .filter-tab"
                ),

            series:
                document.querySelector(
                    "#nav-item-series .filter-tab"
                ),

            anime:
                document.querySelector(
                    "#nav-item-anime .filter-tab"
                ),

            favorites:
                document.getElementById(
                    "nav-link-favoritos"
                )

        };


        function activar(tipo) {

            nav
                .querySelectorAll(
                    ".mz-mobile-nav-item"
                )
                .forEach(
                    boton => {

                        boton.classList.toggle(
                            "active",
                            boton.dataset.target ===
                                tipo
                        );

                    }
                );

        }


        nav
            .querySelectorAll(
                ".mz-mobile-nav-item"
            )
            .forEach(
                boton => {

                    boton.addEventListener(
                        "click",
                        function () {

                            const tipo =
                                this.dataset.target;

                            const elemento =
                                elementos[tipo];


                            if (!elemento) {

                                console.warn(
                                    "MovieZone: elemento no encontrado:",
                                    tipo
                                );

                                return;

                            }


                            activar(tipo);


                            /*
                             * Ejecutamos el elemento
                             * original de app.js.
                             */

                            elemento.click();


                            window.scrollTo({
                                top: 0,
                                behavior:
                                    "smooth"
                            });

                        }
                    );

                }
            );


        console.log(
            "MovieZone: menú móvil cargado."
        );

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            iniciar
        );

    } else {

        iniciar();

    }

})();
