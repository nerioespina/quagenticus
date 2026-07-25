# Guía de Arquitectura de Software — API delgada + Base de Datos densa

Este documento describe los principios, patrones y convenciones de una arquitectura en la que **toda la lógica de negocio vive en la base de datos** y la API es un adaptador HTTP deliberadamente delgado.

Está pensado como **referencia técnica portable**: los conceptos aplican a cualquier proyecto nuevo que siga la misma arquitectura, con independencia del dominio de negocio y del lenguaje del servidor. Los ejemplos de la capa de API se muestran en **Go** y en **Python/FastAPI**; la capa de base de datos —que es donde reside el grueso del valor— es común a ambos.

A lo largo del documento, `entity` es un marcador de posición: sustitúyase por el nombre de la entidad de dominio real (`invoice`, `document`, `order`…).

---

## Índice

1. [Visión General](#1-visión-general)
   - 1.1 [Principio fundamental](#11-principio-fundamental)
   - 1.2 [Cuándo usar esta arquitectura, y cuándo no](#12-cuándo-usar-esta-arquitectura-y-cuándo-no)
2. [Estructura de Directorios](#2-estructura-de-directorios)
3. [Capa de API](#3-capa-de-api)
   - 3.1 [Configuración y Settings](#31-configuración-y-settings)
   - 3.2 [Conexión a Base de Datos](#32-conexión-a-base-de-datos)
   - 3.3 [Contexto de actor](#33-contexto-de-actor)
   - 3.4 [Modelos de entrada y salida](#34-modelos-de-entrada-y-salida)
   - 3.5 [Handlers / Rutas](#35-handlers--rutas)
   - 3.6 [Traducción de errores](#36-traducción-de-errores)
   - 3.7 [Autenticación y Autorización](#37-autenticación-y-autorización)
   - 3.8 [Paginación](#38-paginación)
   - 3.9 [Ciclo de vida de la aplicación](#39-ciclo-de-vida-de-la-aplicación)
   - 3.10 [Middleware](#310-middleware)
   - 3.11 [Servicios externos](#311-servicios-externos)
4. [Capa de Base de Datos — PostgreSQL](#4-capa-de-base-de-datos--postgresql)
   - 4.1 [Filosofía: lógica en la base de datos](#41-filosofía-lógica-en-la-base-de-datos)
   - 4.2 [Organización de archivos SQL](#42-organización-de-archivos-sql)
   - 4.3 [Estructura de tablas](#43-estructura-de-tablas)
   - 4.4 [Funciones almacenadas](#44-funciones-almacenadas)
   - 4.5 [Errores y códigos SQLSTATE](#45-errores-y-códigos-sqlstate)
   - 4.6 [Triggers](#46-triggers)
   - 4.7 [Auditoría](#47-auditoría)
   - 4.8 [Vistas](#48-vistas)
   - 4.9 [Instalación y migración](#49-instalación-y-migración)
5. [Multi-tenancy y Roles](#5-multi-tenancy-y-roles)
6. [Patrones de Diseño Recurrentes](#6-patrones-de-diseño-recurrentes)
7. [Herramientas y Dependencias](#7-herramientas-y-dependencias)
8. [Convenciones de Código](#8-convenciones-de-código)
9. [Seguridad](#9-seguridad)
10. [Pruebas](#10-pruebas)
11. [Despliegue](#11-despliegue)
- [Apéndice A: Flujo completo de una solicitud](#apéndice-a-flujo-completo-de-una-solicitud)
- [Apéndice B: Checklist de nueva entidad](#apéndice-b-checklist-de-nueva-entidad)

---

## 1. Visión General

La arquitectura se divide en dos capas perfectamente delimitadas:

```
┌──────────────────────────────────────────────────────┐
│                   API (Go | Python)                  │
│   Rutas → Auth → (Servicios) → Funciones de BD       │
│   Valida · Autentica · Serializa · Traduce errores   │
└───────────────────────────┬──────────────────────────┘
                            │ driver nativo + pool
                            │ (pgx | asyncpg)
┌───────────────────────────▼──────────────────────────┐
│              Base de Datos (PostgreSQL)              │
│   Tablas · Funciones · Triggers · Auditoría · Vistas │
│   Valida · Autoriza · Decide · Persiste · Audita     │
└──────────────────────────────────────────────────────┘
```

### 1.1 Principio fundamental

**Toda la lógica de negocio vive en la base de datos**, en funciones PL/pgSQL. La API valida la forma de la entrada, resuelve quién hace la petición, llama a una función almacenada y serializa la respuesta. No se escribe SQL suelto en las rutas: siempre se invoca una función.

Ventajas:

- **Atomicidad garantizada.** Validaciones, inserciones y actualizaciones ocurren en una única transacción implícita. No existe el estado intermedio inconsistente.
- **Un solo lugar para la verdad.** Cualquier cliente —la API HTTP, un servidor MCP, un proceso ETL, un script de mantenimiento— obtiene exactamente las mismas reglas sin duplicarlas.
- **Integridad real.** Las restricciones de negocio no dependen de que el cliente se acuerde de respetarlas.
- **Menos round-trips.** Una operación compleja es una llamada, no siete.
- **La API se vuelve intercambiable.** Reescribir el servidor de Python a Go no toca las reglas de negocio.

### 1.2 Cuándo usar esta arquitectura, y cuándo no

Ninguna arquitectura es gratis. Conviene adoptar esta con los ojos abiertos.

**Encaja bien cuando:**

- El dominio es transaccional y con muchas invariantes (facturación, inventario, flujos de aprobación, gestión documental).
- PostgreSQL es una decisión estable, no un detalle de implementación que podría cambiar.
- Varios clientes distintos consumen las mismas reglas.
- El equipo se siente cómodo con SQL, o está dispuesto a estarlo.

**Encaja mal cuando:**

- La lógica es intensiva en CPU (procesamiento de imágenes, cálculo numérico pesado). La base de datos es el recurso más caro de escalar horizontalmente; no conviene gastarla en trabajo que cualquier proceso sin estado haría igual de bien.
- El núcleo del producto es orquestación de servicios externos con reintentos, colas y latencias largas. Eso pertenece a la capa de aplicación.
- El dominio es un CRUD casi puro sin invariantes. La ceremonia de una función por operación no compensa.
- Se necesita portabilidad entre motores de base de datos.

**Costes que hay que aceptar:**

- El instrumental de PL/pgSQL es más pobre que el de un lenguaje de propósito general: depuración limitada, refactorización manual, autocompletado escaso.
- Las pruebas unitarias exigen una base de datos real. Se resuelve con pgTAP y contenedores efímeros (§10), pero no es un `go test` a secas.
- Revisar cambios de lógica implica leer SQL en los diffs. El equipo debe saber leerlo.

---

## 2. Estructura de Directorios

El directorio `db/` es idéntico en ambos stacks; solo cambia la capa de API.

### Go

```
proyecto/
├── cmd/
│   ├── <proyecto>-api/main.go       # Entry point del servidor HTTP
│   ├── <proyecto>-worker/main.go    # Tareas periódicas (opcional)
│   └── <proyecto>ctl/main.go        # CLI de administración (opcional)
├── internal/
│   ├── config/       config.go      # Settings desde entorno
│   ├── db/           db.go          # Pool pgx, helper de transacción y actor
│   ├── auth/         jwt.go · apikey.go · actor.go
│   ├── httpx/        errors.go · json.go · pagination.go · middleware.go
│   ├── models/       <entity>.go    # Structs request/response por entidad
│   ├── handlers/     <entity>.go    # Un handler por entidad de dominio
│   └── services/     <servicio>.go  # Integraciones externas
├── db/                              # ← ver más abajo, común a ambos stacks
├── deploy/           Dockerfile · docker-compose.yml
└── test/             integration/ · sql/
```

### Python / FastAPI

```
proyecto/
├── src/
│   ├── api/
│   │   ├── app.py                   # Entry point, lifespan, middlewares, routers
│   │   ├── config.py                # Settings vía pydantic-settings
│   │   ├── database.py              # Pool asyncpg, dependencia get_db
│   │   ├── auth.py                  # JWT, API keys, dependencias de autenticación
│   │   ├── errors.py                # Traducción SQLSTATE → HTTP
│   │   ├── pagination.py            # Helper de paginación por headers
│   │   ├── requirements.txt
│   │   ├── models/                  # Schemas Pydantic
│   │   │   ├── __init__.py          # Re-exporta todos los modelos
│   │   │   └── <entity>.py          # Un archivo por entidad de dominio
│   │   ├── routes/                  # Endpoints HTTP
│   │   │   ├── __init__.py          # Re-exporta todos los routers
│   │   │   └── <entity>.py          # Un router por entidad de dominio
│   │   └── services/                # Integraciones externas
│   └── db/                          # ← ver más abajo, común a ambos stacks
├── deploy/
└── test/
```

### Capa de base de datos (común)

```
db/
├── file_order.conf              # Orden de instalación de archivos SQL
├── install_database.sh          # Script de instalación automatizada
├── Makefile                     # Comandos de gestión de BD
├── common.sql                   # Extensiones y helpers globales
├── init_system.sql              # Datos iniciales del sistema (idempotente)
├── audit_data_structure.sql     # Tablas de auditoría (herencia)
├── triggers/                    # Triggers globales o entre entidades
├── migrations/                  # migration_<version>_<descripcion>.sql
└── <entity>/                    # Un directorio por entidad de dominio
    ├── <entity>_data_structure.sql
    └── <entity>_functions.sql
```

Una entidad con lógica extensa puede subdividir sus funciones en varios archivos, siempre con el prefijo de la entidad:

```
<entity>/
├── <entity>_data_structure.sql
├── <entity>_functions.sql
├── <entity>_permission_functions.sql
├── <entity>_attachment_structure.sql
├── <entity>_attachment_functions.sql
└── <entity>_access_validation.sql
```

---

## 3. Capa de API

Tres responsabilidades, y ninguna más:

1. **Validar la forma** de la entrada (tipos, formatos, rangos). No las reglas de negocio.
2. **Resolver el actor**: quién hace la petición y con qué credencial.
3. **Llamar a la función de BD** y serializar el resultado, traduciendo errores.

### 3.1 Configuración y Settings

Toda la configuración se centraliza en un único objeto, poblado desde variables de entorno con valores por defecto razonables. Nunca se hardcodean credenciales.

**Go**

```go
// internal/config/config.go
package config

type Config struct {
    // Base de datos
    DatabaseURL string `env:"DATABASE_URL"`
    DBHost      string `env:"DB_HOST"     envDefault:"localhost"`
    DBPort      int    `env:"DB_PORT"     envDefault:"5432"`
    DBName      string `env:"DB_NAME"`
    DBUser      string `env:"DB_USER"`
    DBPassword  string `env:"DB_PASSWORD"`
    DBSchema    string `env:"DB_SCHEMA"   envDefault:"public"`
    DBMinConns  int32  `env:"DB_MIN_CONNS" envDefault:"5"`
    DBMaxConns  int32  `env:"DB_MAX_CONNS" envDefault:"20"`

    // Tokens
    SecretKey          string        `env:"SECRET_KEY,required"`
    AccessTokenExpiry  time.Duration `env:"ACCESS_TOKEN_EXPIRY"  envDefault:"30m"`
    RefreshTokenExpiry time.Duration `env:"REFRESH_TOKEN_EXPIRY" envDefault:"168h"`

    // API
    Addr           string   `env:"ADDR"            envDefault:":8080"`
    APIPrefix      string   `env:"API_PREFIX"      envDefault:"/api/v1"`
    AllowedOrigins []string `env:"ALLOWED_ORIGINS" envSeparator:","`
}

func Load() (Config, error) {
    var c Config
    if err := env.Parse(&c); err != nil {
        return c, err
    }
    return c, nil
}

func (c Config) DSN() string {
    if c.DatabaseURL != "" {
        return c.DatabaseURL
    }
    return fmt.Sprintf("postgresql://%s:%s@%s:%d/%s",
        c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName)
}
```

**Python / FastAPI**

```python
# config.py
from pydantic_settings import BaseSettings
from typing import Optional, List

class Settings(BaseSettings):
    # Base de datos
    database_url: Optional[str] = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None
    db_schema: str = "public"

    # Tokens
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # API
    api_title: str = "API"
    api_version: str = "1.0.0"
    api_prefix: str = "/api/v1"
    allowed_origins: List[str] = ["*"]

    class Config:
        env_file = ".env"

    def get_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (f"postgresql://{self.db_user}:{self.db_password}"
                f"@{self.db_host}:{self.db_port}/{self.db_name}")

settings = Settings()
```

**Reglas:**

- Nunca hardcodear credenciales ni URLs.
- Todos los secretos se leen del entorno.
- Se soportan dos formas de configurar la BD: URL completa o parámetros sueltos.
- El objeto de configuración es un singleton, cargado una vez al arrancar.

---

### 3.2 Conexión a Base de Datos

Se usa el driver nativo de PostgreSQL con connection pool, sin ORM. El `search_path` se fija a nivel de pool para que las consultas operen en el esquema correcto sin prefijos.

**Go** — `pgx/v5` + `pgxpool`

```go
// internal/db/db.go
package db

type DB struct{ Pool *pgxpool.Pool }

func New(ctx context.Context, cfg config.Config) (*DB, error) {
    pc, err := pgxpool.ParseConfig(cfg.DSN())
    if err != nil {
        return nil, err
    }
    pc.MinConns = cfg.DBMinConns
    pc.MaxConns = cfg.DBMaxConns
    pc.MaxConnLifetime = time.Hour
    pc.ConnConfig.RuntimeParams["search_path"] = cfg.DBSchema
    pc.ConnConfig.RuntimeParams["application_name"] = "api"

    pool, err := pgxpool.NewWithConfig(ctx, pc)
    if err != nil {
        return nil, err
    }
    return &DB{Pool: pool}, pool.Ping(ctx)
}

func (d *DB) Close() { d.Pool.Close() }
```

**Python** — `asyncpg`

```python
# database.py
import asyncpg
from typing import Optional

class Database:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(
            dsn=settings.get_database_url(),
            min_size=5,
            max_size=20,
            command_timeout=60,
            server_settings={"search_path": settings.db_schema},
        )

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

db = Database()
```

**Reglas:**

- Un solo pool por proceso, creado al arrancar y cerrado al apagar.
- Nunca abrir conexiones sueltas fuera del pool.
- Dimensionar `max_size` por réplica, no en total. Con muchas réplicas, interponer PgBouncer en modo *transaction*.

---

### 3.3 Contexto de actor

Las funciones de negocio necesitan saber **quién** ejecuta la operación, para autorizar y para auditar. Ese dato viaja a la base de datos como variables de sesión, y se fija **al abrir la transacción de cada request**.

```sql
SELECT set_config('app.actor_type', 'user',   true),
       set_config('app.actor_id',   '<uuid>', true),
       set_config('app.account_id', '<uuid>', true),
       set_config('app.scopes',     'read write', true),
       set_config('app.request_id', '<uuid>', true);
```

> **El tercer argumento `true` es obligatorio.** Significa *local a la transacción*: el valor desaparece al terminar, sin limpieza explícita. Con `false` la variable persiste en la conexión, y como el pool la reutiliza para otra petición —posiblemente de otro usuario— se filtra el actor entre requests. Es un fallo de seguridad silencioso y difícil de reproducir. Además, `true` es lo único compatible con PgBouncer en modo *transaction*.

Helpers que leen el contexto, en `common.sql`:

```sql
CREATE OR REPLACE FUNCTION app_actor_id() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('app.actor_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_account_id() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('app.account_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_actor_type() RETURNS text AS $$
    SELECT COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'system');
$$ LANGUAGE sql STABLE;

-- Verificación de scope para credenciales de máquina.
-- Una sesión interactiva no lleva scopes: sus permisos se resuelven por rol.
CREATE OR REPLACE FUNCTION app_require_scope(p_scope text) RETURNS void AS $$
BEGIN
    IF COALESCE(current_setting('app.scopes', true), '') = '' THEN
        RETURN;
    END IF;
    IF NOT (p_scope = ANY (string_to_array(current_setting('app.scopes', true), ' '))) THEN
        RAISE EXCEPTION 'Falta el scope requerido: %', p_scope USING ERRCODE = 'AP403';
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Go**

```go
// internal/db/actor.go
type Actor struct {
    Type      string   // "user" | "service" | "system"
    ID        string
    AccountID string
    Scopes    []string
}

// WithActor abre una transacción, fija el contexto del actor con alcance
// local y ejecuta fn dentro de ella. Commit o rollback automáticos.
func (d *DB) WithActor(ctx context.Context, a Actor, fn func(pgx.Tx) error) error {
    return pgx.BeginFunc(ctx, d.Pool, func(tx pgx.Tx) error {
        if _, err := tx.Exec(ctx, `
            SELECT set_config('app.actor_type', $1, true),
                   set_config('app.actor_id',   $2, true),
                   set_config('app.account_id', $3, true),
                   set_config('app.scopes',     $4, true),
                   set_config('app.request_id', $5, true)`,
            a.Type, a.ID, a.AccountID,
            strings.Join(a.Scopes, " "), httpx.RequestIDFrom(ctx),
        ); err != nil {
            return fmt.Errorf("fijando contexto de actor: %w", err)
        }
        return fn(tx)
    })
}
```

**Python**

```python
# database.py
from contextlib import asynccontextmanager

@asynccontextmanager
async def acquire_tx(actor: "Actor", request_id: str = ""):
    """Transacción con contexto de actor de alcance local."""
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """SELECT set_config('app.actor_type', $1, true),
                          set_config('app.actor_id',   $2, true),
                          set_config('app.account_id', $3, true),
                          set_config('app.scopes',     $4, true),
                          set_config('app.request_id', $5, true)""",
                actor.type, str(actor.id), str(actor.account_id),
                " ".join(actor.scopes), request_id,
            )
            yield conn


# Dependencia FastAPI
async def get_tx(request: Request):
    actor = request.state.actor
    async with acquire_tx(actor, request.state.request_id) as conn:
        yield conn
```

---

### 3.4 Modelos de entrada y salida

Cada entidad define modelos separados para creación, actualización parcial y respuesta. Los modelos de respuesta **nunca** exponen contraseñas ni campos internos.

| Modelo | Propósito |
|--------|-----------|
| `<Entity>Create` | Payload de `POST` |
| `<Entity>Update` | Payload de `PATCH`, todos los campos opcionales |
| `<Entity>Response` | Salida hacia el cliente |

**Go**

```go
// internal/models/entity.go
package models

type EntityCreate struct {
    Name        string  `json:"name"        validate:"required,min=1,max=200"`
    Description *string `json:"description" validate:"omitempty,max=2000"`
    Email       *string `json:"email"       validate:"omitempty,email"`
}

type EntityUpdate struct {
    Name        *string `json:"name"        validate:"omitempty,min=1,max=200"`
    Description *string `json:"description" validate:"omitempty,max=2000"`
}

type EntityResponse struct {
    ID          uuid.UUID  `json:"id"          db:"id"`
    Name        string     `json:"name"        db:"name"`
    Description *string    `json:"description" db:"description"`
    Status      string     `json:"status"      db:"status"`
    CreatedAt   time.Time  `json:"created_at"  db:"created_at"`
    UpdatedAt   *time.Time `json:"updated_at"  db:"updated_at"`
}
```

**Python**

```python
# models/entity.py
from pydantic import BaseModel, EmailStr, UUID4
from datetime import datetime
from typing import Optional
from enum import Enum

class EntityStatus(str, Enum):
    active = "active"
    inactive = "inactive"

class EntityCreate(BaseModel):
    name: str
    description: Optional[str] = None
    email: Optional[EmailStr] = None

class EntityUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class EntityResponse(BaseModel):
    id: UUID4
    name: str
    description: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True   # permite construir desde filas de asyncpg
```

El `__init__.py` de `models/` re-exporta todo para que los routers importen desde `models` directamente.

**Reglas:**

- Los enums de estado se declaran como cadenas para serialización JSON directa.
- La validación aquí es **de forma**, no de negocio: longitudes, formatos, rangos. Que un nombre esté duplicado lo decide la base de datos.
- Nunca exponer `password`, hashes, claves ni columnas internas en los modelos de respuesta.

---

### 3.5 Handlers / Rutas

Un archivo por entidad. Sin lógica de negocio. Sin SQL que no sea la llamada a la función.

**Go**

```go
// internal/handlers/entity.go
func (h *Entities) Create(w http.ResponseWriter, r *http.Request) {
    var in models.EntityCreate
    if err := httpx.DecodeAndValidate(r, &in); err != nil {
        httpx.WriteError(w, r, err)
        return
    }

    var out models.EntityResponse
    err := h.db.WithActor(r.Context(), auth.ActorFrom(r.Context()), func(tx pgx.Tx) error {
        rows, err := tx.Query(r.Context(),
            `SELECT * FROM entity_create($1, $2, $3)`,
            in.Name, in.Description, in.Email)
        if err != nil {
            return err
        }
        out, err = pgx.CollectExactlyOneRow(rows,
            pgx.RowToStructByNameLax[models.EntityResponse])
        return err
    })
    if err != nil {
        httpx.WriteError(w, r, err)
        return
    }
    httpx.WriteJSON(w, http.StatusCreated, out)
}

func (h *Entities) List(w http.ResponseWriter, r *http.Request) {
    p := httpx.PageFrom(r)   // limit y offset validados

    var items []models.EntityResponse
    err := h.db.WithActor(r.Context(), auth.ActorFrom(r.Context()), func(tx pgx.Tx) error {
        rows, err := tx.Query(r.Context(),
            `SELECT * FROM entity_list($1, $2, $3)`,
            r.URL.Query().Get("status"), p.Limit, p.Offset)
        if err != nil {
            return err
        }
        items, err = pgx.CollectRows(rows,
            pgx.RowToStructByNameLax[models.EntityResponse])
        return err
    })
    if err != nil {
        httpx.WriteError(w, r, err)
        return
    }
    httpx.WritePaginated(w, items, p)
}
```

**Python / FastAPI**

```python
# routes/entities.py
from fastapi import APIRouter, Depends, status, Query
from asyncpg import Connection

from database import get_tx
from models import EntityCreate, EntityUpdate, EntityResponse
from pagination import paginated_response

router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("/", response_model=EntityResponse, status_code=status.HTTP_201_CREATED)
async def create_entity(payload: EntityCreate, db: Connection = Depends(get_tx)):
    """Create an entity."""
    result = await db.fetchrow(
        "SELECT * FROM entity_create($1, $2, $3)",
        payload.name, payload.description, payload.email,
    )
    return EntityResponse(**dict(result))


@router.get("/", response_model=list[EntityResponse])
async def list_entities(
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Connection = Depends(get_tx),
):
    """List entities visible to the current actor."""
    rows = await db.fetch(
        "SELECT * FROM entity_list($1, $2, $3)", status_filter, limit, offset
    )
    items = [EntityResponse(**dict(r)) for r in rows]
    return paginated_response(items, limit=limit, offset=offset)
```

En Python los errores de PostgreSQL se traducen en un **exception handler global** (§3.6), no con un `try/except` en cada ruta. Eso mantiene las rutas limpias y garantiza que ninguna se olvide.

**Reglas:**

- Un router/handler por entidad, un archivo por router.
- Siempre declarar el modelo de respuesta y el código de estado.
- Las rutas **no** contienen reglas de negocio: delegan por completo.
- Los identificadores de la URL se tipan como UUID; el framework valida el formato.
- Los parámetros de paginación llevan cotas explícitas.

---

### 3.6 Traducción de errores

Los mensajes de error de negocio se escriben **una sola vez**, en la función SQL. La API los transporta.

Para que el código HTTP sea correcto —y no un `400` genérico para todo— las funciones declaran un SQLSTATE propietario. PostgreSQL admite cualquier código de cinco caracteres alfanuméricos; se reserva una clase de dos letras para la aplicación (aquí `AP`).

| SQLSTATE | HTTP | Significado |
|----------|------|-------------|
| `AP400` | 400 | Entrada inválida o mal formada |
| `AP401` | 401 | No autenticado o credencial inválida |
| `AP403` | 403 | Autenticado, pero sin permiso o sin scope |
| `AP404` | 404 | No existe, o está fuera del ámbito del actor |
| `AP409` | 409 | Conflicto: versión obsoleta, duplicado, carrera perdida |
| `AP422` | 422 | Regla de negocio incumplida |
| `AP429` | 429 | Cuota o límite excedido |

```sql
RAISE EXCEPTION 'Ya existe una entidad con el nombre «%»', v_name
    USING ERRCODE = 'AP409',
          HINT    = 'Use un nombre distinto o recupere la existente';
```

**Go**

```go
// internal/httpx/errors.go
var sqlstateToStatus = map[string]int{
    "AP400": http.StatusBadRequest,
    "AP401": http.StatusUnauthorized,
    "AP403": http.StatusForbidden,
    "AP404": http.StatusNotFound,
    "AP409": http.StatusConflict,
    "AP422": http.StatusUnprocessableEntity,
    "AP429": http.StatusTooManyRequests,
    "23505": http.StatusConflict,      // unique_violation
    "23503": http.StatusConflict,      // foreign_key_violation
    "23514": http.StatusBadRequest,    // check_violation
    "22001": http.StatusBadRequest,    // string_data_right_truncation
}

func WriteError(w http.ResponseWriter, r *http.Request, err error) {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) {
        status, ok := sqlstateToStatus[pgErr.Code]
        if !ok {
            status = http.StatusInternalServerError
            slog.ErrorContext(r.Context(), "error de BD no mapeado",
                "sqlstate", pgErr.Code, "detail", pgErr.Message)
        }
        WriteJSON(w, status, Problem{
            Title:     http.StatusText(status),
            Detail:    pgErr.Message,
            Hint:      pgErr.Hint,
            RequestID: RequestIDFrom(r.Context()),
        })
        return
    }
    if errors.Is(err, pgx.ErrNoRows) {
        WriteJSON(w, http.StatusNotFound, Problem{Title: "Not Found"})
        return
    }
    slog.ErrorContext(r.Context(), "error interno", "err", err)
    WriteJSON(w, http.StatusInternalServerError, Problem{Title: "Internal Server Error"})
}
```

**Python**

```python
# errors.py
import asyncpg
from fastapi import Request
from fastapi.responses import JSONResponse

SQLSTATE_TO_STATUS = {
    "AP400": 400, "AP401": 401, "AP403": 403, "AP404": 404,
    "AP409": 409, "AP422": 422, "AP429": 429,
    "23505": 409, "23503": 409, "23514": 400, "22001": 400,
}

def register_error_handlers(app):
    @app.exception_handler(asyncpg.PostgresError)
    async def postgres_error_handler(request: Request, exc: asyncpg.PostgresError):
        code = getattr(exc, "sqlstate", None)
        status = SQLSTATE_TO_STATUS.get(code)
        if status is None:
            logger.error("Error de BD no mapeado sqlstate=%s: %s", code, exc)
            status = 500
        return JSONResponse(
            status_code=status,
            content={
                "title": HTTPStatus(status).phrase,
                "detail": getattr(exc, "message", str(exc)),
                "hint": getattr(exc, "hint", None),
                "request_id": getattr(request.state, "request_id", None),
            },
        )
```

Formato de error recomendado: **RFC 9457 (Problem Details)**, uniforme para todos los clientes.

**Regla de oro:** si un error llega a la API sin un SQLSTATE conocido, es un fallo del programa, no del usuario. Se registra con detalle y se devuelve `500` sin filtrar el mensaje interno.

---

### 3.7 Autenticación y Autorización

Conviene separar tajantemente los dos conceptos:

- **Autenticación** (quién eres): la resuelve la API. Valida el token, obtiene el sujeto y construye el actor.
- **Autorización** (qué puedes hacer): la resuelve la base de datos. Las funciones comprueban rol, pertenencia y scope.

La API solo distingue entre autenticado y anónimo, y entre plano de sistema y plano de aplicación. **Nunca compara roles en el código del servidor.**

#### Credenciales soportadas

| Tipo | Mecanismo | Uso típico |
|------|-----------|------------|
| **Sesión JWT** | Bearer token en `Authorization` | Usuarios interactivos |
| **API key** | Secreto con prefijo, almacenado hasheado | Integraciones máquina a máquina |
| **JWT de sistema** | Bearer token de plano administrativo | Panel de administración de la plataforma |

#### Actor unificado

Todas las credenciales se reducen a un mismo tipo, lo que evita duplicar cada endpoint:

```go
type Actor struct {
    Type      string   // "user" | "service" | "system"
    ID        string
    AccountID string
    Scopes    []string // vacío en sesiones interactivas
    Via       string   // "session" | "api_key" | "system"
}
```

#### Emisión de tokens

```go
func CreateAccessToken(sub string, extra map[string]any, ttl time.Duration) (string, error) {
    claims := jwt.MapClaims{
        "sub":  sub,
        "type": "access",          // discrimina access de refresh
        "exp":  time.Now().Add(ttl).Unix(),
        "iat":  time.Now().Unix(),
    }
    for k, v := range extra {
        claims[k] = v
    }
    return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}
```

**Reglas:**

- Los tokens siempre llevan `"type": "access"` o `"type": "refresh"`, y el tipo se verifica al decodificar. Sin esto, un refresh token sirve como access token.
- La validación de la sesión y del estado del usuario se delega a una función de BD (`user_login`, `user_get_api`).
- Las API keys se guardan **hasheadas**; el secreto se muestra una única vez al crearlas.
- Las contraseñas se verifican en SQL, no en el servidor (§9).

---

### 3.8 Paginación

La información de paginación viaja en **cabeceras HTTP**, de modo que el cuerpo sigue siendo un array JSON plano.

| Cabecera | Descripción |
|----------|-------------|
| `X-Has-More` | `true` / `false` |
| `X-Limit` | Límite aplicado |
| `X-Offset` | Desplazamiento aplicado |
| `X-Total-Count` | Total de registros (opcional) |

La heurística `has_more = len(items) == limit` evita un `COUNT(*)` adicional en la mayoría de los casos.

**Go**

```go
// internal/httpx/pagination.go
type Page struct{ Limit, Offset int }

func PageFrom(r *http.Request) Page {
    return Page{
        Limit:  clamp(intQuery(r, "limit", 50), 1, 200),
        Offset: max(intQuery(r, "offset", 0), 0),
    }
}

func WritePaginated[T any](w http.ResponseWriter, items []T, p Page) {
    w.Header().Set("X-Has-More", strconv.FormatBool(len(items) == p.Limit))
    w.Header().Set("X-Limit", strconv.Itoa(p.Limit))
    w.Header().Set("X-Offset", strconv.Itoa(p.Offset))
    WriteJSON(w, http.StatusOK, items)
}
```

**Python**

```python
# pagination.py
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder

def paginated_response(items, limit, offset, total=None):
    headers = {
        "X-Has-More": str(len(items) == limit).lower(),
        "X-Limit": str(limit),
        "X-Offset": str(offset),
    }
    if total is not None:
        headers["X-Total-Count"] = str(total)
    return JSONResponse(content=jsonable_encoder(items), headers=headers)
```

Para listados de crecimiento rápido (historiales, eventos), usar paginación **por cursor** en lugar de offset: con inserciones concurrentes el offset devuelve filas repetidas o saltadas.

---

### 3.9 Ciclo de vida de la aplicación

Arranque: conectar el pool, inicializar servicios que leen configuración de la BD, lanzar tareas periódicas. Apagado: cancelar tareas y cerrar el pool.

**Go**

```go
func main() {
    cfg, err := config.Load()
    if err != nil { log.Fatal(err) }

    ctx, stop := signal.NotifyContext(context.Background(),
        os.Interrupt, syscall.SIGTERM)
    defer stop()

    database, err := db.New(ctx, cfg)
    if err != nil { log.Fatal(err) }
    defer database.Close()

    // Tarea periódica de mantenimiento
    go func() {
        t := time.NewTicker(time.Hour)
        defer t.Stop()
        for {
            select {
            case <-ctx.Done():
                return
            case <-t.C:
                if _, err := database.Pool.Exec(ctx,
                    `SELECT maintenance_run()`); err != nil {
                    slog.Error("mantenimiento", "err", err)
                }
            }
        }
    }()

    srv := &http.Server{Addr: cfg.Addr, Handler: router(cfg, database)}
    go func() {
        if err := srv.ListenAndServe(); err != nil &&
           !errors.Is(err, http.ErrServerClosed) {
            slog.Error("servidor", "err", err)
        }
    }()

    <-ctx.Done()
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()
    _ = srv.Shutdown(shutdownCtx)
}
```

**Python**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    await db.connect()

    async with db.pool.acquire() as conn:
        await some_service.initialize_from_db(conn)

    async def _scheduler():
        while True:
            try:
                async with db.pool.acquire() as conn:
                    await conn.fetchval("SELECT maintenance_run()")
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
            await asyncio.sleep(3600)

    task = asyncio.create_task(_scheduler())
    yield                      # la app corre aquí
    # --- Shutdown ---
    task.cancel()
    await db.disconnect()

app = FastAPI(lifespan=lifespan)
```

**Reglas:**

- El pool se inicializa en el ciclo de vida, nunca en el ámbito del módulo ni en eventos deprecados.
- Las tareas periódicas deben ser cancelables y tolerar errores sin morir.
- El apagado es ordenado, con un plazo máximo.

---

### 3.10 Middleware

Orden recomendado de la cadena:

```
RequestID → RealIP → Recover → Logging → CORS → RateLimit → Authenticate → router
```

`Authenticate` **resuelve** la credencial y deposita el actor en el contexto de la petición; **no autoriza**. Rechazar por falta de permisos es trabajo de la función de BD.

**Go**

```go
r := chi.NewRouter()
r.Use(middleware.RequestID)
r.Use(middleware.RealIP)
r.Use(middleware.Recoverer)
r.Use(httpx.SlogLogger(logger))
r.Use(cors.Handler(cors.Options{
    AllowedOrigins:   cfg.AllowedOrigins,
    AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE"},
    AllowCredentials: true,
}))
r.Use(httpx.RateLimit(cfg))
r.Use(auth.Authenticate(database, cfg))
```

**Python**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def actor_middleware(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.actor = resolve_actor(request)   # None si es anónimo
    return await call_next(request)
```

**Reglas:**

- No hacer llamadas a la base de datos desde middlewares que se ejecuten en toda petición si puede evitarse; cachear la resolución del actor cuando el token lo permita.
- El middleware de autenticación no rechaza peticiones anónimas: lo hace el guard de la ruta.

---

### 3.11 Servicios externos

Los servicios encapsulan integraciones con sistemas de terceros que no pertenecen a la base de datos: pasarelas de pago, proveedores de correo, almacenamiento de objetos, mensajería, APIs de terceros.

```
services/
├── storage.go / storage.py        # almacenamiento de objetos
├── mailer.go / mailer.py          # envío de correo
├── notifier.go / notifier.py      # notificaciones push o mensajería
└── <proveedor>.go / <proveedor>.py
```

**Reglas:**

- Se instancian una vez y se inyectan; no se crean por petición.
- **Reciben la conexión o transacción como parámetro** cuando necesitan persistir; nunca la obtienen por su cuenta. Así participan de la transacción del request en lugar de abrir una paralela.
- Son ajenos al detalle HTTP: no conocen `Request` ni `ResponseWriter`.
- Toda llamada saliente lleva timeout y política de reintento explícitos.

---

## 4. Capa de Base de Datos — PostgreSQL

### 4.1 Filosofía: lógica en la base de datos

Toda operación de negocio se expone como una función. La convención de llamada es siempre la misma:

```sql
SELECT * FROM entity_create($1, $2, $3);
```

Y nunca:

```sql
-- ❌ SQL suelto en la capa de aplicación
INSERT INTO entity (name, email) VALUES ($1, $2);
```

La diferencia no es estética. En el primer caso las validaciones, la autorización, la auditoría y los efectos derivados ocurren dentro de una transacción y son imposibles de saltarse. En el segundo, cada cliente debe recordar hacerlos, y tarde o temprano uno no lo hará.

### 4.2 Organización de archivos SQL

Cada entidad tiene su directorio con dos archivos base: estructura y funciones.

`file_order.conf` define el orden exacto de instalación, respetando las dependencias:

```
common.sql
entity_a/entity_a_data_structure.sql
entity_a/entity_a_functions.sql
entity_b/entity_b_data_structure.sql     # depende de entity_a
entity_b/entity_b_functions.sql
...
views.sql
triggers/entity_a_triggers.sql
triggers/entity_b_triggers.sql
audit_data_structure.sql
init_system.sql
```

Los triggers van después de todas las tablas y funciones. `init_system.sql` siempre es el último.

### 4.3 Estructura de tablas

```sql
-- Estados como ENUM, nunca cadenas libres
CREATE TYPE entity_status AS ENUM ('active', 'inactive', 'deleted');

CREATE TABLE entity (
    -- UUID como PK, generado en la base de datos
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Aislamiento por tenant
    account_id   uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,

    -- Campos de negocio
    name         text NOT NULL,
    description  text,
    email        citext,
    amount       numeric(12,2),
    status       entity_status NOT NULL DEFAULT 'active',

    -- Datos flexibles que no merecen columna propia
    metadata     jsonb NOT NULL DEFAULT '{}',

    -- Timestamps en todas las tablas
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    -- Trazabilidad
    creator_id   uuid REFERENCES app_user(id) ON DELETE RESTRICT,
    updater_id   uuid,

    -- Restricciones de negocio, en la base de datos
    CONSTRAINT entity_name_not_empty CHECK (length(btrim(name)) > 0),
    CONSTRAINT entity_amount_positive CHECK (amount IS NULL OR amount >= 0),
    CONSTRAINT entity_email_format CHECK (
        email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    ),
    UNIQUE (account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_entity_account_status ON entity(account_id, status);
CREATE INDEX IF NOT EXISTS idx_entity_created_at ON entity(created_at DESC);
-- Índice parcial: solo lo que se consulta de verdad
CREATE INDEX IF NOT EXISTS idx_entity_active
    ON entity(account_id, name) WHERE status = 'active';
```

**Reglas:**

- **UUID** como PK siempre, con `gen_random_uuid()`.
- **`timestamptz`** en todos los timestamps, nunca `timestamp` sin zona.
- **ENUM** para categorías cerradas; tabla de catálogo si el conjunto lo administra el usuario.
- **`numeric`** para dinero, nunca `float`.
- **`updated_at`** mantenido por trigger, no por la aplicación.
- **`ON DELETE RESTRICT`** por defecto; `CASCADE` solo cuando la fila hija carece de sentido sin su padre.
- **`IF NOT EXISTS`** en índices para que el script sea reejecutable.
- Indexar toda columna usada en `WHERE`, `JOIN` u `ORDER BY` frecuentes; preferir índices parciales cuando la consulta siempre filtra.

### 4.4 Funciones almacenadas

Nomenclatura: `<entity>_<verbo>[_<calificador>]`.

| Función | Descripción |
|---------|-------------|
| `entity_create(...)` | Inserta y devuelve el registro completo |
| `entity_get(p_id)` | Obtiene por PK; lanza excepción si no existe |
| `entity_find_by_*(...)` | Búsqueda alternativa; devuelve `NULL` si no existe |
| `entity_list(...)` | Listado con filtros, `limit` y `offset` |
| `entity_update(...)` | Actualización parcial |
| `entity_delete(...)` | Borrado lógico o físico |

La distinción entre `get` (lanza) y `find_by` (devuelve `NULL`) es deliberada: permite comprobar existencia sin capturar excepciones.

#### Plantilla de creación

```sql
CREATE OR REPLACE FUNCTION entity_create(
    p_name        text,
    p_description text DEFAULT NULL,
    p_email       text DEFAULT NULL
) RETURNS entity AS $$
DECLARE
    v_name    text;
    v_actor   app_user;
    v_result  entity;
BEGIN
    -- 1. Scope (solo aplica a credenciales de máquina)
    PERFORM app_require_scope('entity:write');

    -- 2. Autorización
    v_actor := app_user_get(app_actor_id());
    IF NOT app_user_can(v_actor, 'entity.create') THEN
        RAISE EXCEPTION 'No autorizado para crear entidades' USING ERRCODE = 'AP403';
    END IF;

    -- 3. Normalización
    v_name := btrim(p_name);

    -- 4. Validaciones de negocio
    IF v_name IS NULL OR length(v_name) = 0 THEN
        RAISE EXCEPTION 'El nombre no puede estar vacío' USING ERRCODE = 'AP400';
    END IF;

    IF entity_find_by_name(v_actor.account_id, v_name) IS NOT NULL THEN
        RAISE EXCEPTION 'Ya existe una entidad con el nombre «%»', v_name
            USING ERRCODE = 'AP409';
    END IF;

    -- 5. Persistencia
    INSERT INTO entity (account_id, name, description, email, creator_id)
    VALUES (v_actor.account_id, v_name, p_description, p_email, v_actor.id)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

El orden —scope, autorización, normalización, validación, persistencia— es el mismo en todas las funciones de escritura. Facilita leerlas y revisar que no falte ningún paso.

#### Plantilla de listado

```sql
CREATE OR REPLACE FUNCTION entity_list(
    p_status_filter text DEFAULT NULL,
    p_limit         int  DEFAULT 50,
    p_offset        int  DEFAULT 0
) RETURNS SETOF entity AS $$
BEGIN
    PERFORM app_require_scope('entity:read');

    RETURN QUERY
    SELECT e.*
      FROM entity e
     WHERE e.account_id = app_account_id()          -- aislamiento de tenant
       AND (p_status_filter IS NULL OR e.status::text = p_status_filter)
     ORDER BY e.created_at DESC
     LIMIT LEAST(p_limit, 200)
    OFFSET GREATEST(p_offset, 0);
END;
$$ LANGUAGE plpgsql STABLE;
```

#### Plantilla de actualización parcial

`NULL` significa "no tocar este campo". Cuando hay que distinguir entre "no tocar" y "poner a NULL", se recibe un `jsonb` y se comprueba la presencia de la clave.

```sql
CREATE OR REPLACE FUNCTION entity_update(
    p_id     uuid,
    p_attrs  jsonb
) RETURNS entity AS $$
DECLARE
    v_old    entity;
    v_result entity;
BEGIN
    PERFORM app_require_scope('entity:write');
    v_old := entity_get_authorized(p_id, 'write');

    UPDATE entity
       SET name        = COALESCE(p_attrs->>'name', name),
           description = CASE WHEN p_attrs ? 'description'
                              THEN p_attrs->>'description' ELSE description END,
           status      = COALESCE((p_attrs->>'status')::entity_status, status),
           updater_id  = app_actor_id(),
           updated_at  = now()
     WHERE id = p_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

**Reglas:**

- Marcar con `STABLE` las funciones que solo leen: el planificador lo aprovecha.
- Usar `STRICT` **solo** cuando todos los parámetros son obligatorios. Con parámetros opcionales, `STRICT` hace que la función devuelva `NULL` en silencio ante cualquier argumento nulo, lo que enmascara errores.
- `RAISE EXCEPTION` con SQLSTATE y mensaje orientado a la persona que lo va a leer.
- Normalizar cadenas con `btrim()` antes de validarlas.
- Las funciones de escritura devuelven el registro completo con `RETURNING * INTO`.
- Las de listado devuelven `SETOF <tipo>`.
- Acotar `limit` dentro de la función, no confiar en que el cliente lo haga.

### 4.5 Errores y códigos SQLSTATE

Ya descritos en §3.6 desde la perspectiva de la API. Desde la base de datos, la disciplina es:

- **Todo `RAISE EXCEPTION` de negocio lleva `ERRCODE`.** Sin él, la API no puede distinguir "no encontrado" de "sin permiso" y devuelve `500` o `400` para todo.
- **El mensaje se escribe para quien lo va a leer**, sea una persona en una interfaz o un agente automatizado. Incluir el valor conflictivo ayuda: `'Ya existe una entidad con el nombre «%»'`.
- **`HINT` para la acción correctiva**, cuando la haya.
- **No filtrar detalles internos** en los mensajes: nada de nombres de tablas internas, rutas ni fragmentos de consulta.

### 4.6 Triggers

Automatizan comportamiento reactivo sin que la aplicación tenga que orquestarlo.

#### `updated_at` automático

Una sola función genérica, reutilizada por todas las tablas:

```sql
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_set_updated_at
    BEFORE UPDATE ON entity
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
```

#### Contadores desnormalizados

```sql
CREATE OR REPLACE FUNCTION trg_update_parent_counter() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE parent_table
           SET item_count = item_count + 1, updated_at = now()
         WHERE id = NEW.parent_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE parent_table
           SET item_count = item_count - 1, updated_at = now()
         WHERE id = OLD.parent_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER child_update_parent_counter
    AFTER INSERT OR DELETE ON child_table
    FOR EACH ROW EXECUTE FUNCTION trg_update_parent_counter();
```

#### Secuencias por padre

```sql
CREATE OR REPLACE FUNCTION trg_set_sequence_number() RETURNS trigger AS $$
BEGIN
    IF NEW.sequence_number IS NULL THEN
        SELECT COALESCE(MAX(sequence_number), 0) + 1
          INTO NEW.sequence_number
          FROM child_table
         WHERE parent_id = NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Reglas:**

- Los triggers viven en `triggers/` y se instalan al final.
- Una función de trigger genérica puede servir a muchas tablas; no duplicarla.
- Usar `COALESCE(NEW, OLD)` en triggers `AFTER ... OR DELETE`.
- **No poner reglas de negocio complejas en triggers.** Un trigger es invisible en la lectura del código que provoca el efecto; conviene reservarlos para automatismos mecánicos (timestamps, contadores, proyecciones derivadas). Las decisiones van en funciones, donde se leen.
- Cuidado con las cascadas: un trigger que escribe en otra tabla con trigger puede encadenar efectos difíciles de seguir.

### 4.7 Auditoría

Se usa **herencia de tablas** de PostgreSQL: una tabla base `audit_log` y una tabla por entidad auditada que hereda su estructura. Así se consulta el histórico global con un `SELECT` sobre la base, o el de una entidad concreta con índices propios.

```sql
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete');

CREATE TABLE audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    uuid,
    actor_type  text NOT NULL DEFAULT 'user',
    action      audit_action NOT NULL,
    record_id   uuid NOT NULL,
    old_values  jsonb,
    new_values  jsonb,
    request_id  uuid,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entity_audit (
    FOREIGN KEY (record_id) REFERENCES entity(id) ON DELETE CASCADE
) INHERITS (audit_log);

CREATE INDEX idx_entity_audit_record ON entity_audit(record_id, created_at DESC);
CREATE INDEX idx_entity_audit_actor  ON entity_audit(actor_id);
```

El actor se obtiene del contexto de sesión (§3.3), no se pasa como parámetro:

```sql
INSERT INTO entity_audit (actor_id, actor_type, action, record_id,
                          old_values, new_values, request_id)
VALUES (app_actor_id(),
        app_actor_type(),
        'update',
        p_id,
        to_jsonb(v_old),
        to_jsonb(v_new),
        NULLIF(current_setting('app.request_id', true), '')::uuid);
```

**Nota sobre volumen.** Las tablas de auditoría crecen sin límite. En entidades de alta escritura, particionar por rango mensual sobre `created_at` y establecer una política de retención desde el principio; hacerlo después es mucho más caro.

### 4.8 Vistas

Para datos combinados que se consultan con frecuencia y siempre igual.

```sql
CREATE OR REPLACE VIEW entity_summary AS
SELECT e.id,
       e.account_id,
       e.name,
       e.status,
       e.created_at,
       u.display_name AS creator_name,
       p.name         AS parent_name,
       (SELECT count(*) FROM child_table c WHERE c.parent_id = e.id) AS child_count
  FROM entity e
  JOIN app_user u    ON u.id = e.creator_id
  LEFT JOIN parent p ON p.id = e.parent_id;
```

**Reglas:**

- Las vistas se instalan después de las funciones.
- Una vista **no** sustituye a la autorización: si se consulta desde una función, el filtro por `account_id` sigue siendo obligatorio.
- Si una vista se vuelve pesada y sus datos toleran retraso, considerar `MATERIALIZED VIEW` con refresco programado.

### 4.9 Instalación y migración

#### Instalación inicial

```bash
cd db
./install_database.sh -d mi_base -u mi_usuario -s mi_schema
```

El script lee `file_order.conf`, concatena los SQL en orden y los ejecuta en una sola sesión. Es **idempotente**: `CREATE OR REPLACE`, `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`.

#### Makefile

```makefile
install:   # Instalación completa desde cero
reset:     # Drop + reinstalación (solo desarrollo)
validate:  # Verifica que los archivos de file_order.conf existen
combine:   # Genera un único .sql con todo el esquema
migrate:   # Aplica las migraciones pendientes
test:      # Ejecuta la suite pgTAP
```

#### Migraciones

Las funciones se actualizan con `CREATE OR REPLACE FUNCTION` y no necesitan migración. Los cambios de **estructura** sí.

```sql
-- migrations/migration_004_entity_add_priority.sql
ALTER TABLE entity ADD COLUMN IF NOT EXISTS priority int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_entity_priority ON entity(account_id, priority DESC);
```

Se registran en una tabla de control, para que el despliegue sea verificable:

```sql
CREATE TABLE IF NOT EXISTS schema_migration (
    version    text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);
```

**Reglas:**

- Cada migración es idempotente y se aplica una sola vez, verificando checksum.
- Las migraciones de estructura y las de datos van en archivos separados.
- Toda migración debe ser compatible hacia atrás durante un despliegue sin cortes: primero se añade la columna, luego se despliega el código que la usa, y solo después se elimina lo viejo.
- El endpoint de disponibilidad (`/readyz`) debe fallar si la versión del esquema no es la que el binario espera.

---

## 5. Multi-tenancy y Roles

Modelo de aislamiento basado en **cuentas**, con dos planos de identidad claramente separados:

```
Plataforma (sys_user — administradores del sistema)
│
├── Account A
│   ├── app_user  role=owner
│   ├── app_user  role=admin
│   └── app_user  role=user
│
└── Account B
    └── ...
```

| Entidad | Descripción | Autenticación |
|---------|-------------|---------------|
| `sys_user` | Administrador de la plataforma. Gestiona cuentas y configuración global. No pertenece a ninguna cuenta. | `POST /auth/sys/login` |
| `account` | Tenant. Unidad de aislamiento y, si aplica, de facturación. | — |
| `app_user` | Usuario de una cuenta. Accede a las funcionalidades del producto. | `POST /auth/login` |

Roles dentro de una cuenta: `owner`, `admin`, `billing-admin`, `user`. Se verifican **en las funciones de base de datos**. La API solo distingue entre `sys_user` y `app_user`.

**Aislamiento por tenant.** Toda función filtra por `app_account_id()`. Como defensa en profundidad, puede añadirse RLS sobre las tablas de negocio:

```sql
ALTER TABLE entity ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_tenant_isolation ON entity
    USING (account_id = app_account_id());
```

RLS es una red de seguridad, no la autorización principal: protege ante un olvido de filtro, pero no expresa reglas de negocio.

---

## 6. Patrones de Diseño Recurrentes

### Controlador delgado

La ruta hace tres cosas y ninguna más: validar la forma, resolver el actor, llamar y serializar. Si un handler tiene un `if` sobre datos de negocio, ese `if` está en el sitio equivocado.

### Los mensajes de error se escriben una vez

Los `RAISE EXCEPTION` de PL/pgSQL llegan a la API con su SQLSTATE y su texto, y se convierten directamente en la respuesta HTTP. No hay catálogo de mensajes duplicado en el servidor.

### `get` frente a `find_by`

`entity_get(id)` lanza `AP404` si no existe. `entity_find_by_name(name)` devuelve `NULL`. La primera se usa cuando la ausencia es un error; la segunda cuando es una pregunta legítima.

### Función de autorización reutilizable

En lugar de repetir la comprobación de permisos en cada función, se extrae:

```sql
CREATE OR REPLACE FUNCTION entity_get_authorized(p_id uuid, p_mode text)
RETURNS entity AS $$
DECLARE v_entity entity;
BEGIN
    SELECT * INTO v_entity FROM entity
     WHERE id = p_id AND account_id = app_account_id();

    IF NOT FOUND THEN
        -- Mismo error para "no existe" y "no es tuyo": no se filtra
        -- la existencia de recursos ajenos.
        RAISE EXCEPTION 'Entidad no encontrada' USING ERRCODE = 'AP404';
    END IF;

    IF p_mode = 'write' AND NOT app_user_can(app_actor_id(), 'entity.write') THEN
        RAISE EXCEPTION 'Sin permiso de escritura' USING ERRCODE = 'AP403';
    END IF;

    RETURN v_entity;
END;
$$ LANGUAGE plpgsql STABLE;
```

### Control optimista de concurrencia

Para recursos editables por varios actores, se versiona la fila y se exige la versión base:

```sql
IF p_base_version IS NOT NULL AND p_base_version <> v_old.version THEN
    RAISE EXCEPTION 'El recurso ha cambiado (versión % ≠ %)',
        p_base_version, v_old.version USING ERRCODE = 'AP409';
END IF;
```

En HTTP se expone como `ETag` + `If-Match`.

### Cola de trabajo sin contención

Para repartir trabajo entre varios consumidores concurrentes:

```sql
SELECT id INTO v_id
  FROM job
 WHERE status = 'pending'
 ORDER BY priority DESC, created_at
 LIMIT 1
   FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` hace que dos consumidores nunca reciban el mismo elemento sin que ninguno espere al otro.

### Singleton de servicio

Los servicios con estado se instancian una vez y se inicializan en el arranque, leyendo su configuración de la base de datos para que arranquen actualizados.

### Autenticación dual transparente

Los endpoints que aceptan tanto sesión como API key usan el mismo tipo `Actor`. La diferencia se resuelve al construirlo, no en cada handler.

---

## 7. Herramientas y Dependencias

### API — Go

| Módulo | Propósito |
|--------|-----------|
| `github.com/go-chi/chi/v5` | Router y middlewares |
| `github.com/jackc/pgx/v5` | Driver PostgreSQL nativo + `pgxpool` |
| `github.com/go-playground/validator/v10` | Validación de structs |
| `github.com/golang-jwt/jwt/v5` | JWT |
| `github.com/caarlos0/env/v11` | Configuración desde entorno |
| `golang.org/x/crypto` | Utilidades criptográficas |
| `github.com/google/uuid` | UUIDs |
| `log/slog`, `net/http`, `context` | Biblioteca estándar |

### API — Python

| Librería | Versión sugerida | Propósito |
|----------|-----------------|-----------|
| `fastapi` | ≥0.110 | Framework HTTP asíncrono |
| `uvicorn[standard]` | ≥0.29 | Servidor ASGI (desarrollo) |
| `gunicorn` | ≥21 | Gestor de procesos (producción) |
| `pydantic` | v2 | Validación y serialización |
| `pydantic-settings` | ≥2 | Configuración desde entorno |
| `asyncpg` | ≥0.29 | Driver PostgreSQL nativo asíncrono |
| `pyjwt` o `python-jose[cryptography]` | ≥2.8 / ≥3.3 | JWT |
| `passlib[bcrypt]` | ≥1.7 | Hashing (si se hace fuera de la BD) |
| `python-multipart` | ≥0.0.9 | Formularios y subida de ficheros |
| `httpx` | ≥0.27 | Cliente HTTP asíncrono |
| `slowapi` | ≥0.1 | Rate limiting |

### Base de datos

| Herramienta | Propósito |
|-------------|-----------|
| PostgreSQL ≥14 | Motor |
| `pgcrypto` | `gen_random_uuid()`, `crypt()`, `gen_salt()` |
| `citext` | Texto insensible a mayúsculas (correos, claves) |
| `pg_trgm` | Búsqueda difusa y autocompletado |
| `unaccent` | Normalización de acentos |
| `pgtap` | Pruebas de funciones SQL |

### Entorno

| Herramienta | Propósito |
|-------------|-----------|
| Go ≥1.22 · Python ≥3.11 | Runtime |
| Docker + Docker Compose | Contenedores |
| `.env` + `.env.example` | Variables de entorno |

---

## 8. Convenciones de Código

### SQL

- Palabras clave en **MAYÚSCULAS**; identificadores en **minúscula con guiones bajos**.
- Parámetros con prefijo `p_`; variables locales con prefijo `v_`.
- `CREATE OR REPLACE FUNCTION` siempre, nunca `CREATE FUNCTION` a secas.
- Cada archivo comienza con un comentario de sección que explica qué contiene.
- Nombres de función: `<entity>_<verbo>[_<calificador>]`.

```
entity_create
entity_get
entity_list
entity_update_status
entity_find_by_email
entity_permission_grant
user_login
user_get_api            -- variante para la API, omite campos internos
```

### Go

- `gofmt` y `go vet` obligatorios; `golangci-lint` en CI.
- Errores envueltos con contexto: `fmt.Errorf("creando entidad: %w", err)`.
- Un `logger := slog.With("component", "...")` por paquete.
- Nada de variables globales mutables: dependencias inyectadas en structs de handler.
- Los tipos exportados llevan comentario doc que empieza por su nombre.

### Python

- **PEP 8** con líneas de hasta 120 caracteres; `ruff` en CI.
- Todas las funciones de ruta y de servicio son `async def`.
- Importaciones agrupadas: estándar → terceros → local, separadas por línea en blanco.
- Nunca `import *`.
- Docstrings en inglés en los endpoints: aparecen en la documentación OpenAPI.
- `logger = logging.getLogger(__name__)` por módulo.

---

## 9. Seguridad

### Contraseñas

Se verifican **en la base de datos**, no en el servidor. Así el hash nunca sale de la BD y no hay dos implementaciones de la comparación.

```sql
CREATE OR REPLACE FUNCTION user_login(p_email citext, p_password text)
RETURNS app_user AS $$
DECLARE v_user app_user;
BEGIN
    SELECT * INTO v_user
      FROM app_user
     WHERE email = p_email
       AND status = 'active'
       AND password IS NOT NULL
       AND password = crypt(p_password, password);

    IF NOT FOUND THEN
        PERFORM pg_sleep(0.1);   -- atenúa el ataque por temporización
        RAISE EXCEPTION 'Credenciales inválidas' USING ERRCODE = 'AP401';
    END IF;

    UPDATE app_user SET last_login_at = now() WHERE id = v_user.id;
    RETURN v_user;
END;
$$ LANGUAGE plpgsql;
```

- **bcrypt** con coste ≥12: `crypt(p_password, gen_salt('bf', 12))`.
- Nunca texto plano, MD5 ni SHA1.
- El mensaje de error no distingue entre usuario inexistente y contraseña incorrecta.

### Tokens

- `SECRET_KEY` de al menos 32 caracteres aleatorios; 64 en producción.
- Access tokens de vida corta (30 min), refresh tokens rotativos.
- El campo `type` del token se verifica siempre al decodificar.
- Las API keys se almacenan hasheadas, con prefijo visible para identificarlas sin revelar el secreto.

### Inyección SQL

- **Siempre placeholders posicionales** (`$1`, `$2`), nunca concatenación de cadenas. Los drivers nativos garantizan el escapado.
- Dentro de PL/pgSQL, si hace falta SQL dinámico, usar `format()` con `%I` y `%L`, nunca interpolación directa.

### Superficie de datos

- Los modelos de respuesta se declaran explícitamente; nunca se serializa la fila entera de la base de datos.
- Los errores `500` no exponen el mensaje interno al cliente; se registran en el log con el `request_id`.
- "No existe" y "no es tuyo" devuelven el mismo `404`, para no revelar la existencia de recursos ajenos.

### CORS y límites

- En producción, `allowed_origins` es una lista explícita de dominios. Nunca `*`.
- Rate limiting por actor y por endpoint, más estricto en autenticación.

### Esquema

- La aplicación opera en un esquema dedicado, no en `public`, fijado como `search_path` del pool.
- El usuario de base de datos de la aplicación no debe ser superusuario ni propietario del esquema; basta con permisos de ejecución sobre las funciones y de lectura/escritura sobre las tablas.

---

## 10. Pruebas

La lógica vive en la base de datos, así que ahí debe estar el grueso de las pruebas.

| Nivel | Herramienta | Qué cubre |
|-------|-------------|-----------|
| **Funciones SQL** | **pgTAP** | Reglas de negocio, validaciones, autorización, triggers, concurrencia. Es la capa con más valor por prueba escrita. |
| **API** | `httptest` (Go) · `TestClient` (Python), con Postgres real en contenedor | Contratos HTTP, códigos de estado, serialización, traducción de errores |
| **Extremo a extremo** | Cliente HTTP contra un entorno efímero | Flujos completos entre entidades |

Ejemplo de prueba pgTAP:

```sql
BEGIN;
SELECT plan(4);

SELECT has_table('entity');
SELECT has_function('entity_create');

-- Fijar el actor igual que lo haría la API
SELECT set_config('app.actor_id', :'test_user_id', true);
SELECT set_config('app.account_id', :'test_account_id', true);

SELECT lives_ok(
    $$ SELECT entity_create('Entidad de prueba') $$,
    'crea una entidad con nombre válido');

SELECT throws_ok(
    $$ SELECT entity_create('Entidad de prueba') $$,
    'AP409',
    NULL,
    'rechaza un nombre duplicado');

SELECT * FROM finish();
ROLLBACK;
```

**Reglas:**

- Cada prueba se ejecuta dentro de una transacción con `ROLLBACK`: no deja rastro y permite paralelizar.
- Las pruebas de API usan una base de datos real y efímera, no dobles ni mocks del driver. Un mock del pool no prueba nada de lo que importa aquí.
- Toda regla de negocio nueva llega con su prueba pgTAP; toda corrección de fallo, con la prueba que lo reproduce.

---

## 11. Despliegue

### Desarrollo

**Go**

```bash
cp .env.example .env
go run ./cmd/<proyecto>-api
```

**Python**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app:app --reload --port 8000
```

### Producción

**Go** — binario único; el servidor HTTP de la biblioteca estándar es suficiente.

```bash
./api    # normalmente detrás de un proxy inverso que termina TLS
```

**Python**

```bash
gunicorn app:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 4 \
  --bind 0.0.0.0:8000
```

### Docker

```bash
docker compose up -d
```

Para Go, build multietapa terminando en una imagen mínima (`distroless/static` o `scratch`). Para Python, imagen `slim` con dependencias instaladas en una etapa previa.

### Instalación de la base de datos

```bash
cd db
./install_database.sh -d nombre_bd -u usuario_pg -s nombre_schema
```

Idempotente en desarrollo. En producción, los cambios se gestionan con migraciones incrementales verificadas por checksum.

### Variables de entorno en producción

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
DB_SCHEMA=mi_schema
SECRET_KEY=<cadena aleatoria de 64+ caracteres>
ALLOWED_ORIGINS=https://app.ejemplo.com,https://admin.ejemplo.com
```

### Observabilidad

- **Logs** estructurados en JSON, con `request_id`, `actor_id`, `account_id` y `sqlstate` cuando aplique. El `request_id` viaja hasta la base de datos por el contexto de actor y queda en la auditoría, lo que permite correlacionar un cambio de datos con la petición que lo causó.
- **Métricas**: latencia y códigos por ruta, uso del pool de conexiones, duración de las funciones más costosas.
- **Salud**: un endpoint de proceso vivo y otro de disponibilidad que verifique el pool y la versión del esquema.

---

## Apéndice A: Flujo completo de una solicitud

```
Cliente HTTP
    │  POST /api/v1/entities  { "name": "..." }
    │  Authorization: Bearer <token>
    ▼
Middleware
    ├─► RequestID  → genera o propaga X-Request-ID
    ├─► Logging    → registra inicio
    ├─► RateLimit  → 429 si excede
    └─► Authenticate
            ├─► decodifica el token, verifica type=access
            ├─► SELECT * FROM user_get_api($1)
            └─► deposita Actor en el contexto
    ▼
Handler / Ruta
    ├─► Valida la forma del payload  → 422 si no encaja
    │
    └─► WithActor(ctx, actor, fn)
            ├─► BEGIN
            ├─► set_config('app.actor_id',  ..., true)
            ├─► set_config('app.account_id',..., true)
            │
            └─► SELECT * FROM entity_create($1, $2, $3)
                    │
                    ▼
                PostgreSQL — entity_create(...)
                    ├─► app_require_scope('entity:write')
                    ├─► Autorización por rol            → AP403
                    ├─► btrim() de las entradas
                    ├─► Validaciones de negocio         → AP400 / AP409
                    ├─► INSERT ... RETURNING *
                    ├─► Triggers: updated_at, contadores
                    └─► INSERT INTO entity_audit
                    │
            ◄───────┘
            └─► COMMIT   (o ROLLBACK completo ante excepción)
    ▼
Serialización
    ├─► éxito  → 201 { "id": "...", "name": "...", ... }
    └─► PgError → SQLSTATE → código HTTP + Problem Details
```

Lo esencial: **si la función lanza una excepción, la transacción entera se deshace.** No hay estados a medias, y el handler no necesita compensar nada.

---

## Apéndice B: Checklist de nueva entidad

Añadir una entidad de dominio implica, en este orden:

**Base de datos**

- [ ] `db/<entity>/<entity>_data_structure.sql`: tipos, tabla, restricciones, índices
- [ ] `db/<entity>/<entity>_functions.sql`: `create`, `get`, `find_by_*`, `list`, `update`, `delete`
- [ ] Función `<entity>_get_authorized(p_id, p_mode)` si hay permisos por fila
- [ ] `db/triggers/<entity>_triggers.sql`: `updated_at` y contadores si aplica
- [ ] Tabla `<entity>_audit` heredada de `audit_log`, si la entidad es auditable
- [ ] Registrar todos los archivos en `file_order.conf`, en orden de dependencias
- [ ] Datos iniciales en `init_system.sql`, si los hay
- [ ] Pruebas pgTAP: camino feliz, cada validación, cada rechazo por permisos

**API**

- [ ] Modelos `Create` / `Update` / `Response`
- [ ] Handler o router con las rutas CRUD
- [ ] Registrar el router en el arranque
- [ ] Verificar que ningún SQLSTATE nuevo queda sin mapear
- [ ] Pruebas de contrato HTTP

**Comprobación final**

- [ ] Ninguna regla de negocio quedó en la capa de API
- [ ] Toda función filtra por `account_id`
- [ ] Todo `RAISE EXCEPTION` lleva `ERRCODE`
- [ ] Ningún modelo de respuesta expone campos internos
- [ ] El script de instalación sigue siendo reejecutable de principio a fin
