# Quagenticus

Sistema de gestión de requerimientos orientado a agentes IA — una intersección entre Redmine y Marknote, con Markdown como formato nativo.

## Inicio rápido

### Requisitos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose v2

### Levantar todo con un comando

```bash
docker compose up --build
```

Esto construye y arranca los servicios en orden:

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| `db` | 5433 (host) | PostgreSQL 16 |
| `migrator` | — | Instala o actualiza el schema (migraciones + funciones) y, si es nuevo, los datos iniciales |
| `api` | 18080 | API REST en Go (incluye eventos en tiempo real por SSE) |
| `mcp` | 18081 | Servidor MCP para agentes (`POST /mcp`, API key del agente en `Authorization`) |
| `worker` | — | Expira reclamos de agentes, recordatorios de vencimiento, purga de subidas huérfanas, correo opcional |
| `web` | 3000 | SPA React (servida por nginx) |

Una vez arrancado, abre **http://localhost:3000** en el navegador.

### Credenciales de acceso (datos de demo)

| Campo | Valor |
|-------|-------|
| Email | `admin@demo.local` |
| Contraseña | `admin123` |

> El seed crea automáticamente una cuenta demo con un espacio "Espacio Demo", un tablero Kanban con columnas, trackers (Bug, Feature, Task) y cuatro niveles de prioridad.

---

## Desarrollo local

### Backend (Go)

```bash
# Arrancar solo la base de datos
docker compose up db -d

# Variables de entorno mínimas
export QG_DATABASE_URL="postgresql://qg:qg@localhost:5433/quagenticus"
export QG_SECRET_KEY="dev-secret-key-cambiar-en-produccion"

# Instalar o actualizar el schema (idempotente: aplica migraciones pendientes y recarga funciones)
PGPASSWORD=qg QG_DB_PORT=5433 ./db/install_database.sh

# Ejecutar el API
go run ./cmd/quagenticus-api
# API disponible en http://localhost:8080
```

### Frontend (React)

```bash
cd web
npm install
npm run dev
# SPA disponible en http://localhost:5173
# El proxy /api → http://localhost:8080 está preconfigurado (VITE_API_PROXY lo cambia)
```

### Pruebas

```bash
# SQL (sobre una BD instalada)
psql -h localhost -p 5433 -U qg -d quagenticus -v ON_ERROR_STOP=1 -f db/tests/smoke_test.sql
# Go (las de integración se saltan sin QG_TEST_DATABASE_URL)
QG_TEST_DATABASE_URL=postgresql://qg:qg@localhost:5433/quagenticus go test ./...
# Frontend
cd web && npm test && npm run lint
```

### Base de datos: migraciones

- `db/*/…_data_structure.sql` es el esquema base (solo en instalaciones nuevas).
- `db/migrations/NNNN_*.sql` son cambios de esquema versionados; se aplican una sola vez y quedan registrados en `schema_migration`.
- `*_functions.sql`, `*_triggers.sql` y `*_views.sql` se recargan en cada instalación.

Todo cambio de tablas debe llegar como una migración nueva.

---

## Estructura del proyecto

```
quagenticus/
├── cmd/
│   ├── quagenticus-api/    # Servidor HTTP REST (Go)
│   ├── quagenticus-mcp/    # Servidor MCP para agentes
│   ├── quagenticus-worker/ # Tareas periódicas
│   └── qgctl/              # CLI de administración (en desarrollo)
├── internal/
│   ├── auth/               # JWT, refresh tokens, API keys de agentes, rate limiting
│   ├── authz/              # Aislamiento por cuenta y roles por espacio
│   ├── events/             # LISTEN/NOTIFY → Server-Sent Events
│   ├── handlers/           # Handlers HTTP
│   ├── httpx/              # Errores, CORS, cabeceras de seguridad
│   ├── storage/            # Almacenamiento de adjuntos y URLs firmadas
│   └── db/                 # Pool PostgreSQL y helpers JSON
├── db/                     # Schema SQL y funciones PL/pgSQL
│   ├── file_order.conf     # Orden de instalación
│   ├── install_database.sh # Script de instalación
│   └── */                  # DDL y funciones por entidad
├── web/                    # SPA React + TypeScript
│   ├── src/
│   │   ├── lib/            # Cliente API, auth store (Zustand)
│   │   ├── hooks/          # TanStack Query hooks
│   │   ├── pages/          # Login, Board, Requisitos, Editor, Agentes
│   │   └── components/     # Layout del espacio
│   └── nginx.conf          # Config nginx para producción
└── docs/
    ├── quagenticus.md      # Especificación funcional
    ├── TECHNICAL-SPEC.md   # Diseño técnico
    └── ARCHITECTURE.md     # Principios de arquitectura
```

---

## Variables de entorno (API)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `QG_DATABASE_URL` | requerida | URL de conexión PostgreSQL |
| `QG_SECRET_KEY` | requerida | Clave para firmar JWT |
| `QG_DB_SCHEMA` | `quagenticus` | Schema PostgreSQL |
| `QG_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | CORS — lista separada por comas |
| `PORT` | `8080` | Puerto del servidor |
| `QG_DB_MIN_CONNS` | `5` | Mínimo de conexiones al pool |
| `QG_DB_MAX_CONNS` | `20` | Máximo de conexiones al pool |
| `QG_COOKIE_SECURE` | `false` | Marca `Secure` en la cookie de sesión (activar tras HTTPS) |
| `QG_STORAGE_PATH` | `./data/attachments` | Carpeta de adjuntos |
| `QG_UPLOAD_MAX_MB` | `25` | Tamaño máximo por archivo |
| `QG_UPLOAD_MAX_FILES` | `10` | Archivos por envío |
| `QG_PUBLIC_URL` | `http://localhost:3000` | URL pública (enlaces en correos, worker) |
| `QG_SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` | — | Correo de notificaciones (worker; opcional) |
| `QG_API_BASE_URL` | `http://localhost:8080/api/v1` | API a la que llama el servidor MCP |

---

## API — Resumen

Todas las rutas viven bajo `/api/v1`. Salvo login, refresh, health y descargas firmadas, requieren `Authorization: Bearer <token de sesión | API key de agente>`. Los recursos de otra cuenta o de espacios sin acceso responden 404; los roles (`viewer < contributor < maintainer < admin`) se validan en cada ruta.

```
POST  /auth/login · /auth/refresh · /auth/logout      Sesión (access token 15 min + cookie httpOnly)
GET   /auth/me · PATCH /auth/me · PATCH /auth/password
GET   /events                                         SSE de cambios y notificaciones
GET   /search?q= · /me/work · /notifications(/count)

GET   /spaces · POST /spaces · GET|PATCH /spaces/:id · /spaces/:id/members
GET   /spaces/:id/boards/:boardId                     Una columna por estado, tarjetas enriquecidas
GET   /spaces/:id/requirements?status_id=&assignee=me&sort=&limit=&offset=
POST  /spaces/:id/requirements                        Creación completa en una transacción
GET   /spaces/:id/suggest?q=&types= · /refs/resolve   Autocompletado y resolución de #123, [[doc]], @persona
POST  /spaces/:id/uploads                             Subidas en staging (comentarios / nuevos requerimientos)

GET|PATCH /requirements/:id                           PATCH con null vacía el campo; version = bloqueo optimista
POST  /requirements/:id/transition · PATCH /move      Reglas del flujo, resolución, reordenamiento
PUT   /requirements/:id/members · PATCH /lead
GET|POST /documents/:id/journals?kind=comment|history Comentarios en hilo / historial
GET|POST /documents/:id/attachments · /links · /backlinks · /labels · /history
POST  /documents/:id/promote · /archive · /restore · GET /export.md
GET   /requirements/:id/context.md                    Paquete de contexto para agentes
POST  /requirements/:id/claim · /claim/renew · /claim/release · /spaces/:id/agent-queue/claim-next

/admin/statuses · /admin/trackers(/:id/transitions) · /admin/priorities · /admin/agents   (admin de cuenta)
```

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Go 1.23 — Chi router, pgx v5, JWT |
| Base de datos | PostgreSQL 16 — lógica de negocio en PL/pgSQL |
| Frontend | React 19, TypeScript, Tailwind 4, TanStack Query, Zustand, CodeMirror 6 |
| Infraestructura | Docker Compose, Nginx |

## Licencia

MIT
