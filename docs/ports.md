# Galleo — Local Ports

Galleo claims the **86xx** block so it runs **simultaneously** with the other projects in
`~/Documents/code` (+ `~/PocketSuite`). Every host port below is unique across those projects
(verified 2026-06-26). Update this file when adding a service.

## Galleo — 8600–8606
| Port | Service | Maps to | Set in | Status |
|---|---|---|---|---|
| **8600** | Studio (Vite dev / preview) | — | `vite.config.ts` `server.port` (strictPort) | **active** |
| **8601** | Backend API | — | `services/api` | reserved |
| **8602** | Postgres | container `5432` | `services/data` · `DATABASE_URL` | reserved |
| **8603** | Redis / job queue | container `6379` | `services/queue` | reserved |
| **8604** | Object storage (MinIO — S3 API) | container `9000` | asset storage | reserved |
| **8605** | MinIO — console | container `9001` | — | reserved |
| **8606** | Preview / SSR (publish surface) | — | `surfaces/publish` | reserved |

*Container-internal ports stay conventional (5432/6379/9000); only host mappings use 86xx.*
Only **8600** is live today (frontend-only); the rest are reserved for when persistence (P9) lands.

## Sibling projects (observed 2026-06-26 — do not reuse)
| Project | Host ports in use |
|---|---|
| **clientbridge** | 8700 web · 8701 api · 8702 pg · 8703 redis · 8704 powersync · 8705/8706 minio · 8707 expo |
| **llamatrade** | 8800 web · 8810–8880 microservices · 8881 stripe-hook · 8990 agent · 5442/5443 pg · 6389 redis · 9090/9093 prom · 3001 grafana |
| **sourcewell** | 8900 web · 8901 api · 8902 pg · 8904 mailpit · 8905 smtp |
| **flowmaestro** | 3000 web · 3001 api · 4000 · 5173/5174 marketing · 5555 docs · 5432 pg · 6379 redis · 7233 temporal · 8080/8088 adminer/temporal-ui |
| **nbaghiro** | 3100 server · 5283 client |
| **branchpad** | 17600 renderer · 17601 hmr (Electron) |
| **PocketSuite** | 3000 · 8081 metro · 25000 · 6379 redis |

> Master cross-project registry: `clientbridge/.docs/ports.md`.
> ⚠️ Galleo previously defaulted to Vite **5173**, which collides with flowmaestro's marketing app —
> hence the move to the fixed 86xx block.
