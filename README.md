# MovieZone v2 (Vercel + API)

Proyecto convertido desde el original (scraping) a **API**  
Fuente: `https://moviezone.tvjz.workers.dev/`

## Qué cambió

- ❌ Eliminado todo el scraping (cheerio / Lamovie HTML / Hackstore scrape).
- ✅ Todos los datos salen de tu Worker API.
- ✅ **Películas destacadas** y **Película recomendada (hero)** muestran **estrenos** (`/3/peliculas/estrenos`).
- ✅ Series y anime del home también usan estrenos.
- ✅ Búsqueda online vía `/search?q=...`.
- ✅ Detalle / players vía `/{id}/pelicula/{slug}` o `/{id}/serie/{slug}`.
- ✅ Sigue guardando en **Supabase** (tabla `movies`, upsert por `link`).
- ✅ Listo para **Vercel**.

## Estructura

```
moviezone-vercel/
├── api/index.js          # Entry serverless Vercel
├── server.js             # Express (API + estáticos)
├── public/               # Frontend (igual que antes)
├── package.json
├── vercel.json
└── .env.example
```

## Variables de entorno (Vercel)

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_KEY` | Key (service role recomendada para upsert) |
| `MOVIEZONE_API` | `https://moviezone.tvjz.workers.dev` |
| `MOVIEZONE_SOURCE` | `3` (pelisplushd) por defecto |

## Deploy en Vercel

1. Sube esta carpeta a un repo GitHub.
2. Importa en Vercel.
3. Añade las env vars.
4. Deploy.

O CLI:

```bash
npm i -g vercel
vercel
```

## Local

```bash
cp .env.example .env
# edita SUPABASE_*
npm install
npm start
# http://localhost:3000
```

## Endpoints API (backend)

| Ruta | Descripción |
|------|-------------|
| `GET /api/estrenos?tipo=peliculas\|series\|animes` | Estrenos |
| `GET /api/catalogo` | Películas (estrenos) |
| `GET /api/series` | Series (estrenos) |
| `GET /api/animes` | Animes (estrenos) |
| `GET /api/buscar?q=...&source=local\|online` | Búsqueda |
| `GET /api/detalle?link=...&slug=...&source_id=3` | Detalle + players |
| `GET /api/episodios?slug=...&season=1` | Episodios |
| `GET /api/capitulo?slug=...&temporada=1&episodio=1` | Players de un capítulo |
| `GET /api/recien` | Últimos guardados en Supabase |
| `GET /api/health` | Estado |

## Notas

- El formato de items es compatible con el frontend original (`nombre`, `portada`, `embeds`, `link`, etc.).
- Si Supabase no está configurado, la app igual funciona (solo no persiste).
- En Vercel cada request es serverless; la memoria `moviesDB` se recarga desde Supabase al cold start.
