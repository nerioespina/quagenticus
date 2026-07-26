# Quagenticus

Sistema de gestión de requerimientos orientado a agentes IA — una intersección entre Redmine y Marknote, con Markdown como formato nativo.

## Inicio rápido

### Requisitos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose v2

### Levantar todo con un comando

```bash
docker compose up --build
```

Esto construye y arranca cuatro servicios en orden:

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| `db` | 5433 (host) | PostgreSQL 16 |
| `migrator` | — | Instala el schema y datos iniciales (se ejecuta una vez) |
| `api` | 18080 | API REST en Go |
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

# Instalar el schema (primera vez)
cd db && bash install_database.sh

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
# El proxy /api → http://localhost:8080 está preconfigurado en vite.config.ts
```

---

## Estructura del proyecto

```
quagenticus/
├── cmd/
│   ├── quagenticus-api/    # Servidor HTTP REST (Go)
│   ├── quagenticus-mcp/    # Servidor MCP para agentes (en desarrollo)
│   ├── quagenticus-worker/ # Tareas periódicas (en desarrollo)
│   └── qgctl/              # CLI de administración (en desarrollo)
├── internal/
│   ├── auth/               # JWT + middleware de autenticación
│   ├── handlers/           # Handlers HTTP (auth, docs, spaces, requirements, boards)
│   ├── httpx/              # Utilidades HTTP (errores, CORS)
│   ├── models/             # Structs de request/response
│   └── db/                 # Pool de conexiones PostgreSQL
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
| `QG_ALLOWED_ORIGINS` | `*` | CORS — lista separada por comas |
| `PORT` | `8080` | Puerto del servidor |
| `QG_DB_MIN_CONNS` | `5` | Mínimo de conexiones al pool |
| `QG_DB_MAX_CONNS` | `20` | Máximo de conexiones al pool |

---

## API — Endpoints principales

```
POST   /api/v1/auth/login                        Obtener JWT
GET    /api/v1/auth/me                           Usuario actual

GET    /api/v1/spaces                            Listar espacios
POST   /api/v1/spaces                            Crear espacio
GET    /api/v1/spaces/:id                        Detalle del espacio

GET    /api/v1/spaces/:id/documents              Listar documentos
POST   /api/v1/spaces/:id/documents              Crear documento
GET    /api/v1/documents/:id                     Leer documento
PATCH  /api/v1/documents/:id                     Editar documento
DELETE /api/v1/documents/:id                     Archivar documento
GET    /api/v1/documents/:id/history             Historial de versiones

GET    /api/v1/spaces/:id/requirements           Listar requisitos
POST   /api/v1/spaces/:id/requirements           Crear requisito
GET    /api/v1/requirements/:id                  Detalle del requisito
PATCH  /api/v1/requirements/:id                  Editar requisito
POST   /api/v1/requirements/:id/transition       Cambiar estado
POST   /api/v1/requirements/:id/members          Agregar miembro
PATCH  /api/v1/requirements/:id/position         Reordenar en tablero
GET    /api/v1/requirements/:id/readiness        Score DoR (0-100)

GET    /api/v1/spaces/:id/boards                 Listar tableros
GET    /api/v1/spaces/:id/boards/:boardId        Tablero con columnas y cards

GET    /api/v1/catalogs/trackers                 Tipos de tracker
GET    /api/v1/catalogs/priorities               Prioridades
GET    /api/v1/catalogs/labels                   Etiquetas
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

Apache 2.0
