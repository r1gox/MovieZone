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
            <button type="button" class="mz-mobile-nav-item" data-target="jk" aria-label="JK">
                <ion-icon name="play-circle-outline"></ion-icon>
                <span>JK</span>
            </button>

