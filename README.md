# MovieZone v2 (Vercel + Worker API)

Frontend + backend Express en **Vercel**.  
**API de datos (Cloudflare Worker):** [`https://moviezone.tvjz.workers.dev`](https://moviezone.tvjz.workers.dev)  
Código del Worker: [`r1gox/vimeos-resolver`](https://github.com/r1gox/vimeos-resolver)

## Fuentes del Worker

| ID | Fuente |
|----|--------|
| 1 | lamovie |
| 2 | hackstore |
| 3 | pelisplushd |
| 4 | animeav1 |
| 5 | animedbs |
| 6 | doramasflix |

Búsqueda en cascada (prioridad): animeav1 → animedbs → doramasflix → pelisplushd → lamovie → hackstore.

## Qué consume este repo de la API

- Metadatos de la **fuente primero**; IMDb/TMDB solo rellenan huecos.
- `calificacion`, `year`, `descripcion` (español), `formato` (TV/OVA/ONA/Especial).
- Portadas ya resueltas por el Worker (`portada`, `portada_imdb`, `poster_source`).
- Temporada real en animes (`One Punch Man 3` → temporada 3).
- `stream_url` HLS en reproductores cuando el Worker lo trae.
- Fuentes 5 (animedbs) y 6 (doramasflix) en detalle y capítulos.

## Estructura

```
MovieZone/
├── api/index.js     # Entry serverless Vercel
├── server.js        # Express (proxy + mapeo + Supabase)
├── public/          # Frontend
├── package.json
└── vercel.json
```

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_URL` | URL Supabase |
| `SUPABASE_KEY` | Key (service role para upsert) |
| `MOVIEZONE_API` | `https://moviezone.tvjz.workers.dev` |
| `MOVIEZONE_SOURCE` | Fuente por defecto listados (`3`) |

## Local

```bash
npm install
# export MOVIEZONE_API=https://moviezone.tvjz.workers.dev
npm start
```

## Endpoints Express

| Ruta | Descripción |
|------|-------------|
| `GET /api/estrenos?tipo=peliculas\|series\|animes` | Estrenos |
| `GET /api/catalogo` | Películas |
| `GET /api/series` | Series |
| `GET /api/animes` | Animes |
| `GET /api/buscar?q=...` | Búsqueda (vía Worker) |
| `GET /api/detalle?...` | Detalle + players |
| `GET /api/episodios?...` | Episodios |
| `GET /api/capitulo?...` | Players de un capítulo |
| `GET /api/health` | Estado |
