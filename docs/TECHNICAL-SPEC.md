# Quagenticus — Especificación Técnica

> Documento de diseño técnico. Complementa a [quagenticus.md](quagenticus.md) (especificación funcional) y sigue los principios de [ARCHITECTURE.md](ARCHITECTURE.md), transpuestos de Python/FastAPI a **Go**.

**Versión:** 0.1 (borrador de diseño)
**Estado:** en definición
**Ámbito:** backend, modelo de datos, API HTTP, capa MCP, frontend y despliegue.

---

## Índice

1. [Decisiones de arquitectura](#1-decisiones-de-arquitectura)
2. [Visión general del sistema](#2-visión-general-del-sistema)
3. [Modelo de contenido unificado](#3-modelo-de-contenido-unificado)
4. [Capa de base de datos](#4-capa-de-base-de-datos)
   - 4.1 [Convenciones](#41-convenciones)
   - 4.2 [Identidad y multi-tenancy](#42-identidad-y-multi-tenancy)
   - 4.3 [Espacios y documentos](#43-espacios-y-documentos)
   - 4.4 [Motor markdown en PL/pgSQL](#44-motor-markdown-en-plpgsql)
   - 4.5 [Requerimientos, workflow y tablero](#45-requerimientos-workflow-y-tablero)
   - 4.6 [Historial, comentarios y auditoría](#46-historial-comentarios-y-auditoría)
   - 4.7 [Capa de agentes](#47-capa-de-agentes)
   - 4.8 [Búsqueda](#48-búsqueda)
   - 4.9 [Adjuntos y notificaciones](#49-adjuntos-y-notificaciones)
   - 4.10 [Catálogo de funciones](#410-catálogo-de-funciones)
5. [Capa de API — Go](#5-capa-de-api--go)
6. [Autenticación y autorización](#6-autenticación-y-autorización)
7. [API HTTP](#7-api-http)
8. [Capa MCP](#8-capa-mcp)
9. [Frontend](#9-frontend)
10. [Seguridad](#10-seguridad)
11. [Rendimiento y escalabilidad](#11-rendimiento-y-escalabilidad)
12. [Observabilidad](#12-observabilidad)
13. [Despliegue](#13-despliegue)
14. [Estructura del repositorio](#14-estructura-del-repositorio)
15. [Roadmap por fases](#15-roadmap-por-fases)
16. [Decisiones abiertas](#16-decisiones-abiertas)

---

## 1. Decisiones de arquitectura

| # | Decisión | Elección | Justificación |
|---|----------|----------|---------------|
| AD-1 | Plataforma | Web self-hosted (API + SPA), desplegable con Docker Compose | Multiusuario real, permisos por espacio y superficie MCP remota con OAuth. Un cliente de escritorio puede añadirse después sobre la misma API. |
| AD-2 | Lenguaje backend | **Go 1.23+** | Binario único sin runtime, arranque instantáneo, concurrencia natural para SSE y sesiones MCP de larga duración, huella de memoria baja en self-hosting. |
| AD-3 | Filosofía | **Thick database**: toda la lógica de negocio en funciones PL/pgSQL | Heredado de [ARCHITECTURE.md §4.1](ARCHITECTURE.md). Atomicidad garantizada, y —crítico aquí— la API HTTP y el servidor MCP consumen **exactamente las mismas reglas** sin duplicarlas. |
| AD-4 | Modelo de contenido | **Unificado**: entidad base `document`; un requerimiento es un documento con workflow | Un solo motor de markdown, versionado, búsqueda, adjuntos, enlaces y permisos. Promover una nota a requerimiento es un cambio de tipo, no una copia. |
| AD-5 | Persistencia | **PostgreSQL 16 como única fuente de verdad** | Sin capa Git. Versionado propio en tablas de revisiones. Los agentes acceden vía API/MCP, nunca al sistema de ficheros. |
| AD-6 | Fuente de verdad del markdown | `document.body_md` (texto completo). Las secciones son una **proyección derivada** | Permite tanto pegar markdown completo como editar sección a sección, sin ambigüedad sobre cuál gana. |
| AD-7 | Renderizado markdown | Parsing estructural en BD, **renderizado a HTML fuera de la BD** | La BD solo necesita segmentar por encabezados (regex). Convertir a HTML es presentación: se hace en el cliente y, para exports, con `goldmark` en Go. |
| AD-8 | MCP | Servidor MCP como **proceso separado que consume la API REST** | Una única superficie de autorización, rate limiting y auditoría. Evita repartir credenciales de BD. |
| AD-9 | Errores | SQLSTATE propietarios (`QG4xx`) desde PL/pgSQL | Mejora sobre ARCHITECTURE.md: permite mapear a códigos HTTP correctos en vez de un `400` genérico. |
| AD-10 | Contexto de actor | `set_config(..., true)` **local a transacción** | Requisito para pooling seguro en Go (goroutines reutilizan conexiones) y compatibilidad con PgBouncer en modo transaction. |
| AD-11 | Responsables | **N miembros** por requerimiento (personas y agentes), con responsable principal opcional | El asignado único de Redmine no refleja cómo se trabaja. Modelo Trello, conservando un `lead` opcional para que la responsabilidad no se diluya. |
| AD-12 | Tablero | Columnas **derivadas de estados**; mover tarjeta = `requirement_transition` | Un tablero con su propio flujo paralelo al de estados produce dos verdades sobre en qué punto está el trabajo. Aquí solo hay una. |
| AD-13 | Orden del tablero | `board_position numeric` **único por requerimiento**, independiente de la prioridad | Permite subir al tope lo urgente sin falsear la prioridad. Indexación fraccionaria: arrastrar es un `UPDATE` de una fila. |
| AD-14 | Etiquetas | Catálogo de **paleta cerrada** colgando de `document`, no de `requirement` | Trello-like y transversal: la misma etiqueta clasifica una nota de análisis y el ticket que la implementa. Tokens en vez de hexadecimal libre garantizan contraste en ambos temas. |

---

## 2. Visión general del sistema

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  SPA Web     │  │ Servidor MCP │  │  CLI / CI    │  │  Webhooks    │
│ (React/TS)   │  │ (Go)         │  │              │  │  salientes   │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────▲───────┘
       │ JWT             │ OAuth 2.1       │ API Key         │
       └─────────────────┴────────┬────────┴─────────────────┘
                                  │ HTTPS  /api/v1
┌─────────────────────────────────▼──────────────────────────────────┐
│                        API Quagenticus (Go)                        │
│                                                                    │
│  chi router → middlewares → auth → handler delgado → función SQL   │
│  · markdown/  render y sanitizado para export                      │
│  · storage/   adjuntos (FS local o S3-compatible)                  │
│  · events/    LISTEN/NOTIFY → SSE hacia la SPA                     │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │ pgxpool
┌─────────────────────────────────▼──────────────────────────────────┐
│                       PostgreSQL 16                                │
│                                                                    │
│  Tablas · Funciones PL/pgSQL · Triggers · Auditoría · Vistas       │
│  Extensiones: pgcrypto · unaccent · pg_trgm · ltree · (pgvector)   │
│                                                                    │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ ┌───────────┐ │
│  │ document │ │ require- │ │  journal  │ │ agent  │ │  oauth /  │ │
│  │ (base)   │ │ ment     │ │ / audit   │ │ claims │ │  api_key  │ │
│  └──────────┘ └──────────┘ └───────────┘ └────────┘ └───────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

**Procesos desplegables**

| Binario | Responsabilidad |
|---------|-----------------|
| `quagenticus-api` | Servidor HTTP: REST, SSE, OAuth Authorization Server, servido de la SPA |
| `quagenticus-mcp` | Servidor MCP (Streamable HTTP y stdio). Cliente de la API REST |
| `quagenticus-worker` | Tareas periódicas: expiración de claims, reindexado, purga, envío de notificaciones |
| `qgctl` | CLI de administración: instalación de BD, import/export, gestión de cuentas |

---

## 3. Modelo de contenido unificado

El núcleo conceptual de Quagenticus es que **una nota, una página de wiki y un requerimiento son el mismo objeto** con distinto grado de estructura y workflow.

```
                        ┌───────────────────────────┐
                        │        document           │
                        │  id, space_id, parent_id  │
                        │  doc_type, title          │
                        │  body_md  ← fuente única  │
                        │  front_matter, version    │
                        └────────────┬──────────────┘
                                     │
        ┌────────────────┬───────────┼───────────┬─────────────────┐
        │                │           │           │                 │
   doc_type=            doc_type=  doc_type=  doc_type=       doc_type=
   'folder'             'note'     'wiki'     'template'      'requirement'
   (contenedor)         (Marknote) (espacio)  (plantilla)           │
                                                                    │ 1:1
                                                        ┌───────────▼──────────┐
                                                        │     requirement      │
                                                        │  tracker, status,    │
                                                        │  priority, category, │
                                                        │  board_position,     │
                                                        │  due_date, claim...  │
                                                        └───────────┬──────────┘
                                                                    │
                                                    ┌───────────────┴───────────┐
                                                    │   requirement_member      │
                                                    │  N personas y/o agentes,  │
                                                    │  uno opcionalmente lead   │
                                                    └───────────────────────────┘

   Proyecciones y satélites de `document` (comunes a todos los tipos):
   · document_section   (secciones derivadas de body_md)
   · document_version   (historial completo)
   · document_link      (relaciones tipadas + wikilinks)
   · document_label     (etiquetas de color, transversales)
   · attachment         (ficheros e imágenes)
   · journal            (comentarios + cambios + eventos de agente)

   Presentación (solo sobre requirement):
   · board · board_column   (columnas = estados; orden = board_position)
```

### 3.1 Consecuencias del modelo

1. **Un solo editor.** El mismo componente de edición markdown sirve para notas y requerimientos; el requerimiento solo añade un panel lateral de metadatos y un asistente de secciones.
2. **Promoción sin pérdida.** `document_promote_to_requirement(id, tracker, ...)` cambia `doc_type` y crea la fila en `requirement`. El `id`, los enlaces entrantes, los adjuntos y el historial se conservan.
3. **Wikilinks universales.** `[[Título del documento]]` funciona igual apuntando a una nota que a `[[QG-123]]`, y genera backlinks en ambos sentidos.
4. **Búsqueda única.** Un índice, una función `search()`, filtrable por `doc_type`.
5. **Superficie MCP mínima.** El agente aprende un modelo (`document` + `requirement`) en lugar de dos módulos desconectados.

### 3.2 Secciones: contrato de sincronización

`body_md` es canónico. `document_section` es una **proyección derivada** recalculada por trigger en cada escritura de `body_md`.

```
┌── Camino A: el usuario pega markdown completo ──────────────────┐
│  PUT /documents/{id}  { body_md: "# Título\n## Situación..." }  │
│      └─► document_update_body()                                 │
│              └─► trigger → document_sections_rebuild()          │
│                      └─► parsea encabezados, mapea a section_key│
└─────────────────────────────────────────────────────────────────┘

┌── Camino B: el usuario edita una sección aislada ───────────────┐
│  PUT /documents/{id}/sections/current_situation { body_md: ...} │
│      └─► document_section_update()                              │
│              └─► splice sobre body_md usando start/end_offset   │
│              └─► UPDATE document SET body_md = ...              │
│                      └─► trigger → document_sections_rebuild()  │
└─────────────────────────────────────────────────────────────────┘
```

Ambos caminos convergen en la misma función de reconstrucción, por lo que no puede existir divergencia entre el markdown y sus secciones.

**Reconocimiento de secciones.** El encabezado `## Situación actual` se normaliza a la clave estable `current_situation` mediante la tabla `section_schema`, que contiene etiquetas y alias (incluidos alias en inglés). Un encabezado no reconocido se conserva con `section_key = NULL`: el sistema nunca descarta contenido del usuario.

Claves canónicas por defecto para el tracker de requerimientos:

| `section_key` | Etiqueta | Alias reconocidos | Requerida |
|---------------|----------|-------------------|-----------|
| `current_situation` | Situación actual | contexto, situación, current situation, background | Sí |
| `problems` | Problemas a resolver | problemas, problem statement, problems | Sí |
| `proposed_solution` | Soluciones propuestas | solución propuesta, propuesta, proposed solution | No |
| `acceptance_criteria` | Criterios de aceptación | criterios, acceptance criteria, definition of done | Sí |
| `considerations` | Consideraciones | notas, consideraciones adicionales, considerations | No |

---

## 4. Capa de base de datos

### 4.1 Convenciones

Se mantienen íntegramente las de [ARCHITECTURE.md §4](ARCHITECTURE.md) y §8:

- `uuid` PK con `gen_random_uuid()`, `timestamptz` en todos los timestamps, ENUMs para categorías cerradas.
- Parámetros `p_`, variables `v_`, funciones `<entidad>_<verbo>`, `CREATE OR REPLACE` siempre.
- `ON DELETE RESTRICT` por defecto; `CASCADE` solo cuando la fila hija carece de sentido propio.
- Un directorio por entidad con `<entidad>_data_structure.sql` y `<entidad>_functions.sql`, orden en `file_order.conf`.

**Añadidos propios de Quagenticus:**

#### Extensiones requeridas

```sql
-- common.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS unaccent;    -- slugs y búsqueda sin acentos
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- búsqueda difusa y autocompletado
CREATE EXTENSION IF NOT EXISTS btree_gin;   -- índices compuestos con tsvector
-- Opcional (fase 5): CREATE EXTENSION IF NOT EXISTS vector;
```

`unaccent()` es `STABLE`, no `IMMUTABLE`, por lo que no puede usarse en columnas generadas ni en índices de expresión. Se envuelve:

```sql
CREATE OR REPLACE FUNCTION qg_unaccent(text) RETURNS text AS $$
    SELECT public.unaccent('public.unaccent'::regdictionary, $1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
```

#### Códigos de error propietarios

Toda `RAISE EXCEPTION` de negocio declara un SQLSTATE de la clase `QG`, que la API traduce a HTTP:

| SQLSTATE | HTTP | Significado |
|----------|------|-------------|
| `QG400` | 400 | Entrada inválida o mal formada |
| `QG401` | 401 | No autenticado / credencial inválida |
| `QG403` | 403 | Autenticado pero sin permiso o sin el scope requerido |
| `QG404` | 404 | Recurso inexistente o fuera del ámbito del actor |
| `QG409` | 409 | Conflicto: versión obsoleta, claim ya tomado, clave duplicada |
| `QG422` | 422 | Regla de negocio incumplida (transición inválida, DoR no satisfecha) |
| `QG429` | 429 | Cuota o límite de concurrencia excedido |

```sql
RAISE EXCEPTION 'Transición % → % no permitida para el tracker %', v_from, v_to, v_tracker
    USING ERRCODE = 'QG422',
          HINT    = 'Consulte GET /api/v1/requirements/{key}/transitions';
```

#### Contexto de actor

Sustituye a la variable `audit.user_id` de ARCHITECTURE.md por un contexto más rico, y **siempre local a la transacción**:

```sql
-- Establecido por la API al abrir la transacción de cada request
SELECT set_config('qg.actor_type', 'agent',            true),
       set_config('qg.actor_id',   '<uuid>',           true),
       set_config('qg.account_id', '<uuid>',           true),
       set_config('qg.scopes',     'req:read req:claim', true),
       set_config('qg.request_id', '<uuid>',           true);
```

Helpers leídos por las funciones de negocio:

```sql
CREATE OR REPLACE FUNCTION qg_actor_id() RETURNS uuid AS $$
    SELECT NULLIF(current_setting('qg.actor_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION qg_actor_type() RETURNS actor_type AS $$
    SELECT COALESCE(NULLIF(current_setting('qg.actor_type', true), ''), 'system')::actor_type;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION qg_require_scope(p_scope text) RETURNS void AS $$
BEGIN
    -- Una sesión de usuario interactiva no lleva scopes: los permisos se
    -- resuelven por rol. Los tokens de máquina (API key / OAuth) sí.
    IF current_setting('qg.scopes', true) IS NULL
       OR current_setting('qg.scopes', true) = '' THEN
        RETURN;
    END IF;
    IF NOT (p_scope = ANY (string_to_array(current_setting('qg.scopes', true), ' '))) THEN
        RAISE EXCEPTION 'Falta el scope requerido: %', p_scope USING ERRCODE = 'QG403';
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

### 4.2 Identidad y multi-tenancy

```
Plataforma (sys_user)
│
├── account "Acme"                       ← tenant, unidad de facturación y aislamiento
│   ├── app_user  (usuarios humanos)
│   ├── agent     (identidades de agente, cada una con un humano responsable)
│   ├── team
│   └── space "QG" · space "OPS" · ...   ← proyecto (Redmine) + cuaderno (Marknote)
│       └── space_member (user|team|agent → role)
│
└── account "Beta"
```

```sql
CREATE TYPE actor_type   AS ENUM ('user', 'agent', 'system');
CREATE TYPE user_status  AS ENUM ('pending', 'active', 'suspended', 'deleted');
CREATE TYPE member_role  AS ENUM ('viewer', 'contributor', 'maintainer', 'admin');

CREATE TABLE account (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key             text NOT NULL UNIQUE,
    name            text NOT NULL,
    settings        jsonb NOT NULL DEFAULT '{}',
    default_locale  text NOT NULL DEFAULT 'es',
    fts_config      regconfig NOT NULL DEFAULT 'spanish',
    status          user_status NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT account_key_format CHECK (key ~ '^[a-z][a-z0-9-]{1,30}$')
);

CREATE TABLE app_user (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    email           citext NOT NULL,
    password        text,                      -- bcrypt vía pgcrypto; NULL si solo SSO
    display_name    text NOT NULL,
    avatar_url      text,
    is_account_admin boolean NOT NULL DEFAULT false,
    locale          text NOT NULL DEFAULT 'es',
    timezone        text NOT NULL DEFAULT 'UTC',
    status          user_status NOT NULL DEFAULT 'pending',
    last_login_at   timestamptz,
    preferences     jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    creator_id      uuid,
    UNIQUE (account_id, email)
);

CREATE TABLE space_member (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id        uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE,
    subject_type    actor_type NOT NULL,
    subject_id      uuid NOT NULL,             -- app_user.id | agent.id | team.id
    role            member_role NOT NULL DEFAULT 'contributor',
    granted_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (space_id, subject_type, subject_id)
);
```

**Matriz de permisos por rol** (resuelta siempre en BD, nunca en Go):

| Acción | viewer | contributor | maintainer | admin |
|--------|:------:|:-----------:|:----------:|:-----:|
| Leer documentos y requerimientos | ✓ | ✓ | ✓ | ✓ |
| Comentar | — | ✓ | ✓ | ✓ |
| Crear / editar documentos | — | ✓ | ✓ | ✓ |
| Crear requerimientos | — | ✓ | ✓ | ✓ |
| Editar requerimientos de terceros | — | — | ✓ | ✓ |
| Transicionar estado | — | solo propios | ✓ | ✓ |
| Borrar / archivar | — | — | ✓ | ✓ |
| Gestionar miembros, trackers, workflow | — | — | — | ✓ |
| Habilitar agentes en el espacio | — | — | — | ✓ |

Un agente hereda como techo el rol que tenga en `space_member`, **intersecado** con los scopes de su token. El menor de los dos gana siempre.

---

### 4.3 Espacios y documentos

```sql
CREATE TYPE document_type       AS ENUM ('folder', 'note', 'wiki', 'requirement', 'template');
CREATE TYPE document_visibility AS ENUM ('space', 'private', 'public');

CREATE TABLE space (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    key             text NOT NULL,             -- 'QG' → referencias QG-123
    name            text NOT NULL,
    description_md  text,
    icon            text,
    color           text,
    modules         jsonb NOT NULL DEFAULT
                      '{"docs": true, "requirements": true, "agents": false}',
    settings        jsonb NOT NULL DEFAULT '{}',
    ref_counter     bigint NOT NULL DEFAULT 0, -- secuencia de QG-<n>
    is_archived     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    creator_id      uuid REFERENCES app_user(id) ON DELETE RESTRICT,
    updater_id      uuid,
    CONSTRAINT space_key_format CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    UNIQUE (account_id, key)
);

CREATE TABLE document (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    space_id          uuid NOT NULL REFERENCES space(id) ON DELETE RESTRICT,
    parent_id         uuid REFERENCES document(id) ON DELETE RESTRICT,

    doc_type          document_type NOT NULL DEFAULT 'note',
    ref_key           text,                    -- 'QG-123'; NULL salvo requirement
    slug              text NOT NULL,
    title             text NOT NULL,

    body_md           text NOT NULL DEFAULT '',
    front_matter      jsonb NOT NULL DEFAULT '{}',
    body_sha256       bytea,                   -- ETag y detección de cambios
    word_count        integer NOT NULL DEFAULT 0,

    visibility        document_visibility NOT NULL DEFAULT 'space',
    position          numeric NOT NULL DEFAULT 1000,  -- orden entre hermanos
    depth             integer NOT NULL DEFAULT 0,
    path              text NOT NULL DEFAULT '',       -- '/uuid/uuid/' materializado

    version           integer NOT NULL DEFAULT 1,
    is_archived       boolean NOT NULL DEFAULT false,
    archived_at       timestamptz,
    is_favorite_count integer NOT NULL DEFAULT 0,

    locked_by         uuid,                    -- edición exclusiva blanda
    lock_expires_at   timestamptz,

    search_tsv        tsvector GENERATED ALWAYS AS (
                          setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
                          setweight(to_tsvector('spanish', coalesce(body_md, '')), 'B')
                      ) STORED,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    creator_id        uuid REFERENCES app_user(id) ON DELETE RESTRICT,
    updater_id        uuid,
    creator_agent_id  uuid,                    -- si lo creó un agente

    CONSTRAINT document_title_not_empty CHECK (length(btrim(title)) > 0),
    CONSTRAINT document_no_self_parent  CHECK (parent_id IS DISTINCT FROM id),
    CONSTRAINT document_ref_only_req    CHECK (ref_key IS NULL OR doc_type = 'requirement')
);

CREATE UNIQUE INDEX idx_document_ref_key ON document(ref_key) WHERE ref_key IS NOT NULL;
CREATE UNIQUE INDEX idx_document_slug    ON document(space_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
    WHERE is_archived = false;
CREATE INDEX idx_document_space_type ON document(space_id, doc_type) WHERE is_archived = false;
CREATE INDEX idx_document_parent     ON document(parent_id, position);
CREATE INDEX idx_document_path       ON document(path text_pattern_ops);
CREATE INDEX idx_document_search     ON document USING gin(search_tsv);
CREATE INDEX idx_document_title_trgm ON document USING gin(qg_unaccent(title) gin_trgm_ops);
CREATE INDEX idx_document_updated    ON document(account_id, updated_at DESC);
```

> **Nota sobre `search_tsv`.** La columna generada fija la configuración `'spanish'` porque `to_tsvector(regconfig, text)` solo es `IMMUTABLE` con configuración literal. Si se requiere idioma por cuenta (`account.fts_config`), la columna se convierte en `tsvector` normal mantenida por trigger. Se documenta la alternativa; el valor por defecto cubre el caso mayoritario.

```sql
CREATE TABLE document_section (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    ord           integer NOT NULL,
    level         integer NOT NULL,
    section_key   text,                -- clave canónica; NULL si no reconocida
    heading       text NOT NULL,
    slug          text NOT NULL,
    body_md       text NOT NULL DEFAULT '',
    start_offset  integer NOT NULL,    -- offsets de caracteres sobre document.body_md
    end_offset    integer NOT NULL,
    UNIQUE (document_id, ord)
);
CREATE INDEX idx_document_section_key ON document_section(document_id, section_key);

CREATE TABLE section_schema (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    tracker_id    uuid REFERENCES tracker(id) ON DELETE CASCADE,  -- NULL = global
    section_key   text NOT NULL,
    label         text NOT NULL,
    aliases       text[] NOT NULL DEFAULT '{}',
    ord           integer NOT NULL,
    is_required   boolean NOT NULL DEFAULT false,
    min_chars     integer NOT NULL DEFAULT 0,
    help_md       text,
    placeholder_md text,
    UNIQUE (account_id, coalesce(tracker_id, '00000000-0000-0000-0000-000000000000'::uuid), section_key)
);

CREATE TABLE document_version (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    version        integer NOT NULL,
    title          text NOT NULL,
    body_md        text NOT NULL,
    front_matter   jsonb NOT NULL DEFAULT '{}',
    change_summary text,
    actor_type     actor_type NOT NULL,
    actor_id       uuid,
    agent_session_id uuid,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_id, version)
);
```

Se almacena **snapshot completo** por versión: `body_md` se comprime bien en TOAST y evita la complejidad de reconstruir cadenas de deltas. Los diffs se calculan bajo demanda en Go. Política de retención configurable por cuenta (por defecto: todas las versiones de los últimos 90 días + una por día anterior).

```sql
CREATE TYPE link_type AS ENUM (
    'relates', 'duplicates', 'duplicated_by', 'blocks', 'blocked_by',
    'precedes', 'follows', 'parent_of', 'child_of',
    'specifies', 'implements', 'wikilink', 'mentions'
);

CREATE TABLE document_link (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id    uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    target_id    uuid REFERENCES document(id) ON DELETE CASCADE,
    target_text  text,                -- wikilink no resuelto todavía
    link_type    link_type NOT NULL DEFAULT 'relates',
    is_derived   boolean NOT NULL DEFAULT false,  -- true = extraído de body_md
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    creator_id   uuid,
    CONSTRAINT document_link_target CHECK (target_id IS NOT NULL OR target_text IS NOT NULL)
);
CREATE UNIQUE INDEX idx_document_link_unique
    ON document_link(source_id, target_id, link_type) WHERE target_id IS NOT NULL;
CREATE INDEX idx_document_link_target ON document_link(target_id);   -- backlinks

-- Paleta cerrada de tokens, no colores libres. El tema mapea cada token a
-- {fondo, texto, borde} en claro y oscuro, garantizando contraste AA sin
-- depender del criterio de quien crea la etiqueta.
CREATE TYPE label_color AS ENUM (
    'gray', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal',
    'cyan', 'blue', 'indigo', 'violet', 'purple', 'pink', 'brown'
);

CREATE TABLE label (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    -- NULL = etiqueta global de la cuenta; con valor = exclusiva de un espacio
    space_id    uuid REFERENCES space(id) ON DELETE CASCADE,
    name        text NOT NULL,
    slug        text NOT NULL,
    color       label_color NOT NULL DEFAULT 'gray',
    description text,
    ord         integer NOT NULL DEFAULT 0,
    usage_count integer NOT NULL DEFAULT 0,
    is_archived boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    creator_id  uuid,
    CONSTRAINT label_name_not_empty CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX idx_label_slug_account
    ON label(account_id, slug) WHERE space_id IS NULL;
CREATE UNIQUE INDEX idx_label_slug_space
    ON label(space_id, slug) WHERE space_id IS NOT NULL;

CREATE TABLE document_label (
    document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    label_id    uuid NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    creator_id  uuid,
    PRIMARY KEY (document_id, label_id)
);
CREATE INDEX idx_document_label_label ON document_label(label_id);
```

**Por qué tokens y no hexadecimal libre.** Una etiqueta se ve sobre fondo claro y oscuro, en una tarjeta densa y junto a otras cinco. Dejar elegir `#f0f0a0` produce etiquetas ilegibles que nadie corrige después. La paleta de 15 tokens cubre cualquier necesidad real de clasificación visual y garantiza contraste en ambos temas. El color nunca es el único portador de información: la etiqueta siempre muestra su nombre, y el modo de alto contraste añade patrones de trama.

**Ámbito.** Una etiqueta con `space_id IS NULL` está disponible en toda la cuenta; con `space_id` poblado, solo en ese espacio. Las globales sirven para conceptos transversales (`deuda técnica`, `bloqueante`); las de espacio para vocabulario local (`cliente Acme`). Al resolver las etiquetas aplicables a un documento se unen ambos conjuntos.

**Transversalidad.** `document_label` cuelga de `document`, no de `requirement`: la misma etiqueta se aplica a una nota de análisis y al requerimiento que la implementa, y un filtro por `deuda técnica` devuelve ambos. Es una consecuencia directa del modelo unificado (AD-4).

**Distinción con categoría y prioridad.** Etiqueta, categoría y prioridad responden a preguntas distintas y no deben colapsarse:

| | Entidad | Cardinalidad | Ámbito | Efecto en el sistema |
|---|---|---|---|---|
| **Categoría** | `category` | Una | Espacio | Asignación por defecto, informes |
| **Prioridad** | `priority` | Una | Cuenta | Orden de la cola de agentes (`priority.weight`) |
| **Etiqueta** | `label` | Varias | Cuenta o espacio | Solo clasificación y filtrado; sin semántica de negocio |

Las etiquetas no participan en ninguna regla de negocio: no afectan al workflow, ni a la *Definition of Ready*, ni al orden de la cola de agentes. Es deliberado — en cuanto una etiqueta condiciona el comportamiento del sistema deja de ser un marcador libre y debe promoverse a campo estructurado.

**Wikilinks derivados.** Un trigger `AFTER INSERT OR UPDATE OF body_md ON document` borra los `document_link` con `is_derived = true` de ese origen y los reinserta a partir de `md_extract_wikilinks(NEW.body_md)`, resolviendo cada destino contra `ref_key`, `slug` y `title` dentro de la cuenta. Los no resueltos quedan con `target_text` poblado, lo que alimenta el panel de "enlaces rotos" al estilo de un gestor de notas.

---

### 4.4 Motor markdown en PL/pgSQL

La BD solo necesita **segmentar por encabezados**, no interpretar markdown completo. Es un problema de regex por líneas, con la única sutileza de ignorar encabezados dentro de bloques de código cercados.

```sql
-- db/md/md_functions.sql

CREATE OR REPLACE FUNCTION md_slugify(p_text text) RETURNS text AS $$
    SELECT btrim(
        regexp_replace(lower(qg_unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', '-', 'g'),
        '-'
    );
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;


-- Índice crudo de encabezados con offsets de carácter sobre el texto original.
CREATE OR REPLACE FUNCTION md_heading_index(p_body text)
RETURNS TABLE (ord int, level int, heading text, line_start int, body_start int)
AS $$
DECLARE
    v_lines    text[];
    v_line     text;
    v_offset   int := 1;         -- offset 1-based del inicio de la línea actual
    v_in_fence boolean := false;
    v_fence    text;
    v_m        text[];
    v_ord      int := 0;
BEGIN
    IF p_body IS NULL OR p_body = '' THEN
        RETURN;
    END IF;

    v_lines := string_to_array(replace(p_body, E'\r\n', E'\n'), E'\n');

    FOREACH v_line IN ARRAY v_lines LOOP
        -- Apertura/cierre de bloque de código cercado
        v_m := regexp_match(v_line, '^\s{0,3}(```+|~~~+)');
        IF v_m IS NOT NULL THEN
            IF NOT v_in_fence THEN
                v_in_fence := true;
                v_fence    := left(v_m[1], 3);
            ELSIF left(v_m[1], 3) = v_fence THEN
                v_in_fence := false;
            END IF;
        END IF;

        IF NOT v_in_fence THEN
            v_m := regexp_match(v_line, '^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$');
            IF v_m IS NOT NULL THEN
                v_ord      := v_ord + 1;
                ord        := v_ord;
                level      := length(v_m[1]);
                heading    := btrim(v_m[2]);
                line_start := v_offset;
                body_start := v_offset + length(v_line) + 1;
                RETURN NEXT;
            END IF;
        END IF;

        v_offset := v_offset + length(v_line) + 1;   -- +1 por el salto de línea
    END LOOP;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;


-- Secciones canónicas: bloques de nivel `p_level` (por defecto H2) que
-- incluyen sus subencabezados anidados hasta el siguiente encabezado de
-- nivel igual o superior.
CREATE OR REPLACE FUNCTION md_split_sections(p_body text, p_level int DEFAULT 2)
RETURNS TABLE (ord int, level int, heading text, slug text,
               body_md text, start_offset int, end_offset int)
AS $$
DECLARE
    v_total int := length(coalesce(p_body, ''));
BEGIN
    RETURN QUERY
    WITH h AS (
        SELECT * FROM md_heading_index(p_body)
    ),
    sec AS (
        SELECT
            h.ord, h.level, h.heading, h.line_start, h.body_start,
            -- fin = inicio del siguiente encabezado de nivel <= p_level
            COALESCE(
                (SELECT MIN(n.line_start) FROM h n
                  WHERE n.ord > h.ord AND n.level <= p_level),
                v_total + 1
            ) AS next_start
        FROM h
        WHERE h.level = p_level
    )
    SELECT
        row_number() OVER (ORDER BY s.line_start)::int,
        s.level,
        s.heading,
        md_slugify(s.heading),
        btrim(substr(p_body, s.body_start, s.next_start - s.body_start), E' \n\t'),
        s.line_start,
        (s.next_start - 1)::int
    FROM sec s
    ORDER BY s.line_start;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;


-- Título del documento: primer H1, o NULL si no hay.
CREATE OR REPLACE FUNCTION md_extract_title(p_body text) RETURNS text AS $$
    SELECT heading FROM md_heading_index(p_body) WHERE level = 1 ORDER BY ord LIMIT 1;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;


-- Wikilinks [[destino]] y [[destino|alias]], ignorando bloques de código.
CREATE OR REPLACE FUNCTION md_extract_wikilinks(p_body text) RETURNS text[] AS $$
    SELECT COALESCE(array_agg(DISTINCT btrim(m[1])), '{}')
    FROM regexp_matches(
             regexp_replace(coalesce(p_body, ''), '```.*?```', '', 'gs'),
             '\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]', 'g'
         ) AS m;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;


-- Referencias explícitas a requerimientos: QG-123
CREATE OR REPLACE FUNCTION md_extract_refs(p_body text) RETURNS text[] AS $$
    SELECT COALESCE(array_agg(DISTINCT m[1]), '{}')
    FROM regexp_matches(coalesce(p_body, ''), '\y([A-Z][A-Z0-9]{1,9}-[0-9]+)\y', 'g') AS m;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
```

#### Reconstrucción de secciones

```sql
CREATE OR REPLACE FUNCTION document_sections_rebuild(p_document_id uuid)
RETURNS void AS $$
DECLARE
    v_doc        document;
    v_tracker_id uuid;
BEGIN
    SELECT * INTO v_doc FROM document WHERE id = p_document_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento % no encontrado', p_document_id USING ERRCODE = 'QG404';
    END IF;

    SELECT r.tracker_id INTO v_tracker_id FROM requirement r WHERE r.document_id = p_document_id;

    DELETE FROM document_section WHERE document_id = p_document_id;

    INSERT INTO document_section
        (document_id, ord, level, section_key, heading, slug, body_md, start_offset, end_offset)
    SELECT
        p_document_id, s.ord, s.level,
        -- Resolución de la clave canónica por etiqueta o alias, sin acentos
        (SELECT ss.section_key
           FROM section_schema ss
          WHERE ss.account_id = v_doc.account_id
            AND (ss.tracker_id = v_tracker_id OR ss.tracker_id IS NULL)
            AND (md_slugify(ss.label) = s.slug
                 OR s.slug = ANY (SELECT md_slugify(a) FROM unnest(ss.aliases) a))
          ORDER BY ss.tracker_id NULLS LAST
          LIMIT 1),
        s.heading, s.slug, s.body_md, s.start_offset, s.end_offset
    FROM md_split_sections(v_doc.body_md, 2) s;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION trg_document_reproject() RETURNS trigger AS $$
BEGIN
    PERFORM document_sections_rebuild(NEW.id);
    PERFORM document_links_rebuild(NEW.id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_reproject_trigger
    AFTER INSERT OR UPDATE OF body_md ON document
    FOR EACH ROW EXECUTE FUNCTION trg_document_reproject();
```

#### Edición de una sección aislada

```sql
CREATE OR REPLACE FUNCTION document_section_update(
    p_document_id uuid,
    p_section_key text,
    p_body_md     text,
    p_base_version integer DEFAULT NULL   -- control optimista de concurrencia
) RETURNS document AS $$
DECLARE
    v_doc     document;
    v_sec     document_section;
    v_new_body text;
BEGIN
    PERFORM qg_require_scope('docs:write');
    v_doc := document_get_authorized(p_document_id, 'write');

    IF p_base_version IS NOT NULL AND p_base_version <> v_doc.version THEN
        RAISE EXCEPTION 'El documento ha cambiado (versión % ≠ %)', p_base_version, v_doc.version
            USING ERRCODE = 'QG409';
    END IF;

    SELECT * INTO v_sec
      FROM document_section
     WHERE document_id = p_document_id AND section_key = p_section_key;

    IF NOT FOUND THEN
        -- La sección no existe: se añade al final en el orden canónico
        RETURN document_section_insert(p_document_id, p_section_key, p_body_md);
    END IF;

    -- Splice: se preserva la línea del encabezado y se sustituye el cuerpo
    v_new_body :=
          substr(v_doc.body_md, 1, v_sec.start_offset - 1)
        || repeat('#', v_sec.level) || ' ' || v_sec.heading || E'\n\n'
        || btrim(p_body_md, E' \n\t') || E'\n\n'
        || substr(v_doc.body_md, v_sec.end_offset + 1);

    RETURN document_update_body(p_document_id, NULL, v_new_body,
                                format('Sección «%s» actualizada', v_sec.heading));
END;
$$ LANGUAGE plpgsql;
```

Al terminar, `document_update_body` incrementa `version`, inserta en `document_version` y dispara el trigger de reproyección, dejando `document_section` coherente con el nuevo `body_md`.

---

### 4.5 Requerimientos, workflow y tablero

```sql
CREATE TABLE tracker (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    key               text NOT NULL,            -- 'bug', 'feature', 'support', 'task'
    name              text NOT NULL,
    description       text,
    icon              text,
    color             text,
    default_status_id uuid REFERENCES workflow_status(id),
    template_id       uuid REFERENCES document(id),   -- doc_type = 'template'
    is_agent_enabled  boolean NOT NULL DEFAULT true,
    ord               integer NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    UNIQUE (account_id, key)
);

CREATE TABLE workflow_status (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    key                 text NOT NULL,          -- estable, expuesto vía MCP
    name                text NOT NULL,
    color               text,
    ord                 integer NOT NULL DEFAULT 0,
    is_default          boolean NOT NULL DEFAULT false,
    is_closed           boolean NOT NULL DEFAULT false,
    is_agent_claimable  boolean NOT NULL DEFAULT false,
    requires_resolution boolean NOT NULL DEFAULT false,
    UNIQUE (account_id, key)
);

CREATE TABLE workflow_transition (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tracker_id        uuid NOT NULL REFERENCES tracker(id) ON DELETE CASCADE,
    from_status_id    uuid REFERENCES workflow_status(id) ON DELETE CASCADE,  -- NULL = cualquiera
    to_status_id      uuid NOT NULL REFERENCES workflow_status(id) ON DELETE CASCADE,
    allowed_roles     member_role[] NOT NULL DEFAULT '{contributor,maintainer,admin}',
    allowed_actors    actor_type[] NOT NULL DEFAULT '{user,agent}',
    requires_comment  boolean NOT NULL DEFAULT false,
    requires_assignee boolean NOT NULL DEFAULT false,
    requires_readiness boolean NOT NULL DEFAULT false,
    UNIQUE (tracker_id, from_status_id, to_status_id)
);

CREATE TABLE priority (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    key        text NOT NULL,        -- 'low','normal','high','urgent','immediate'
    name       text NOT NULL,
    weight     integer NOT NULL,     -- orden de la cola de agentes
    color      text,
    is_default boolean NOT NULL DEFAULT false,
    UNIQUE (account_id, key)
);

CREATE TABLE milestone (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id    uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE,
    name        text NOT NULL,
    description text,
    due_date    date,
    status      text NOT NULL DEFAULT 'open',  -- open | locked | closed
    UNIQUE (space_id, name)
);

CREATE TABLE requirement (
    document_id        uuid PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
    account_id         uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    space_id           uuid NOT NULL REFERENCES space(id) ON DELETE RESTRICT,

    tracker_id         uuid NOT NULL REFERENCES tracker(id) ON DELETE RESTRICT,
    status_id          uuid NOT NULL REFERENCES workflow_status(id) ON DELETE RESTRICT,
    priority_id        uuid NOT NULL REFERENCES priority(id) ON DELETE RESTRICT,
    category_id        uuid REFERENCES category(id) ON DELETE SET NULL,
    milestone_id       uuid REFERENCES milestone(id) ON DELETE SET NULL,
    parent_id          uuid REFERENCES requirement(document_id) ON DELETE RESTRICT,

    reporter_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    -- Los responsables viven en requirement_member (N miembros, estilo Trello).
    -- Se desnormaliza solo el responsable principal, para ordenar y filtrar
    -- sin recorrer la tabla de miembros. Lo mantiene un trigger.
    lead_user_id       uuid REFERENCES app_user(id) ON DELETE SET NULL,
    lead_agent_id      uuid REFERENCES agent(id) ON DELETE SET NULL,
    member_count       integer NOT NULL DEFAULT 0,

    -- Orden manual en el tablero. Independiente de priority_id por diseño.
    board_position     numeric NOT NULL DEFAULT 0,

    start_date         date,
    due_date           date,
    estimated_hours    numeric(8,2),
    spent_hours        numeric(8,2) NOT NULL DEFAULT 0,
    done_ratio         integer NOT NULL DEFAULT 0,

    -- Preparación para agentes (Definition of Ready)
    readiness_score    integer,               -- 0..100
    readiness_report   jsonb,
    readiness_at       timestamptz,

    -- Reserva activa
    claim_id           uuid,
    claimed_by_agent_id uuid REFERENCES agent(id) ON DELETE SET NULL,
    claim_expires_at   timestamptz,

    resolution         text,
    closed_at          timestamptz,
    reopened_count     integer NOT NULL DEFAULT 0,

    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT requirement_done_ratio CHECK (done_ratio BETWEEN 0 AND 100),
    CONSTRAINT requirement_dates      CHECK (due_date IS NULL OR start_date IS NULL
                                             OR due_date >= start_date),
    CONSTRAINT requirement_no_self_parent CHECK (parent_id IS DISTINCT FROM document_id)
);

CREATE INDEX idx_requirement_queue
    ON requirement(space_id, status_id, priority_id, created_at)
    WHERE claimed_by_agent_id IS NULL;
CREATE INDEX idx_requirement_lead  ON requirement(lead_user_id) WHERE closed_at IS NULL;
CREATE INDEX idx_requirement_claim ON requirement(claim_expires_at)
    WHERE claim_expires_at IS NOT NULL;
-- Índice del tablero: barrido de una columna ya ordenada, sin sort en memoria
CREATE INDEX idx_requirement_board
    ON requirement(space_id, status_id, board_position, document_id)
    WHERE closed_at IS NULL;
CREATE INDEX idx_requirement_board_global
    ON requirement(account_id, status_id, board_position, document_id)
    WHERE closed_at IS NULL;
```

#### Categoría

Clasificación funcional dentro del espacio, de valor único. Es un atributo del requerimiento, no un marcador transversal (§4.3bis).

```sql
CREATE TABLE category (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id          uuid NOT NULL REFERENCES space(id) ON DELETE CASCADE,
    name              text NOT NULL,
    slug              text NOT NULL,
    description       text,
    -- Asignación por defecto al crear un requerimiento de esta categoría
    default_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
    default_agent_id  uuid REFERENCES agent(id) ON DELETE SET NULL,
    ord               integer NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    UNIQUE (space_id, slug)
);
```

#### Miembros

Un requerimiento tiene **N miembros**, personas o agentes, como una tarjeta de Trello. Sustituye al asignado único de Redmine.

```sql
CREATE TABLE requirement_member (
    document_id  uuid NOT NULL REFERENCES requirement(document_id) ON DELETE CASCADE,
    subject_type actor_type NOT NULL,            -- 'user' | 'agent'
    subject_id   uuid NOT NULL,
    is_lead      boolean NOT NULL DEFAULT false, -- responsable principal
    added_at     timestamptz NOT NULL DEFAULT now(),
    added_by     uuid,
    PRIMARY KEY (document_id, subject_type, subject_id),
    CONSTRAINT requirement_member_subject CHECK (subject_type IN ('user', 'agent'))
);

-- Como máximo un responsable principal por requerimiento
CREATE UNIQUE INDEX idx_requirement_member_lead
    ON requirement_member(document_id) WHERE is_lead;

CREATE INDEX idx_requirement_member_subject
    ON requirement_member(subject_type, subject_id);
```

`requirement.lead_user_id`, `lead_agent_id` y `member_count` son proyecciones mantenidas por un trigger `AFTER INSERT OR UPDATE OR DELETE ON requirement_member`. Existen porque los filtros "asignados a mí" y el orden por responsable son consultas calientes del tablero y del listado, y resolverlas con un `EXISTS` sobre la tabla de miembros en cada fila arruina el plan.

El filtro "asignados a mí" distingue dos grados, ambos disponibles en la API:

```sql
member=me        -- soy miembro, sea principal o no
lead=me          -- soy el responsable principal
```

Al reclamar un requerimiento, un agente se inserta como miembro (`subject_type = 'agent'`); al liberarlo, se elimina la fila. Su paso permanece en el journal aunque ya no figure como miembro.

#### Estados por defecto

Sembrados por `init_system.sql`. Las `key` son estables porque forman parte del contrato MCP.

| `key` | Nombre | `is_closed` | `is_agent_claimable` | Semántica |
|-------|--------|:-----------:|:--------------------:|-----------|
| `new` | Nuevo | — | — | Registrado, sin triar |
| `triaged` | Triado | — | — | Priorizado y asignado a un espacio/milestone |
| `ready` | Listo | — | **✓** | Cumple la Definition of Ready: elegible para que un agente lo reclame |
| `in_analysis` | En análisis | — | — | Análisis de impacto en curso |
| `in_progress` | En desarrollo | — | — | Implementación en curso |
| `needs_info` | Requiere información | — | — | Bloqueado por una pregunta al solicitante |
| `blocked` | Bloqueado | — | — | Bloqueado por dependencia externa o por otro requerimiento |
| `in_review` | En revisión | — | — | Cambios propuestos, pendientes de revisión humana |
| `testing` | En pruebas | — | — | Validación funcional / QA |
| `resolved` | Resuelto | — | — | Implementado y verificado; pendiente de aceptación |
| `deployed` | Desplegado | — | — | En producción |
| `closed` | Cerrado | ✓ | — | Aceptado por el solicitante |
| `rejected` | Rechazado | ✓ | — | No se llevará a cabo |

```
                    ┌───────┐
                    │  new  │
                    └───┬───┘
                        ▼
                  ┌──────────┐        ┌────────────┐
                  │ triaged  │───────▶│  rejected  │◀──── (desde casi cualquiera)
                  └────┬─────┘        └────────────┘
                       ▼
                  ┌──────────┐  ◀── DoR verificada
      ┌──────────▶│  ready   │───────────────┐  ← elegible para claim de agente
      │           └────┬─────┘               │
      │                ▼                     │
      │        ┌───────────────┐             │
      │        │  in_analysis  │             │
      │        └───────┬───────┘             │
      │                ▼                     │
      │        ┌───────────────┐   ┌──────────────┐
      │        │  in_progress  │◀─▶│  needs_info  │
      │        └───────┬───────┘   └──────────────┘
      │                │           ┌──────────────┐
      │                ├──────────▶│   blocked    │
      │                │           └──────┬───────┘
      │                ▼                  │
      │        ┌───────────────┐          │
      │        │   in_review   │◀─────────┘
      │        └───────┬───────┘
      │                ▼
      │        ┌───────────────┐
      │        │    testing    │
      │        └───────┬───────┘
      │                ▼
      │        ┌───────────────┐     ┌────────────┐     ┌──────────┐
      └────────│   resolved    │────▶│  deployed  │────▶│  closed  │
        reopen └───────────────┘     └────────────┘     └──────────┘
```

La liberación de un claim expirado devuelve el requerimiento al estado anterior a `in_progress` (normalmente `ready`) y registra el motivo en el journal.

#### Definition of Ready

Función central que decide si un requerimiento puede entregarse a un agente:

```sql
CREATE OR REPLACE FUNCTION requirement_readiness_check(p_document_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_req     requirement;
    v_doc     document;
    v_checks  jsonb := '[]'::jsonb;
    v_ss      record;
    v_len     integer;
    v_passed  integer := 0;
    v_total   integer := 0;
    v_blockers integer;
BEGIN
    SELECT * INTO v_req FROM requirement WHERE document_id = p_document_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento % no encontrado', p_document_id USING ERRCODE = 'QG404';
    END IF;
    SELECT * INTO v_doc FROM document WHERE id = p_document_id;

    -- 1. Secciones obligatorias con contenido suficiente
    FOR v_ss IN
        SELECT * FROM section_schema
         WHERE account_id = v_req.account_id
           AND (tracker_id = v_req.tracker_id OR tracker_id IS NULL)
           AND is_required
         ORDER BY ord
    LOOP
        v_total := v_total + 1;
        SELECT length(btrim(coalesce(ds.body_md, ''))) INTO v_len
          FROM document_section ds
         WHERE ds.document_id = p_document_id AND ds.section_key = v_ss.section_key;

        IF coalesce(v_len, 0) >= GREATEST(v_ss.min_chars, 1) THEN
            v_passed := v_passed + 1;
            v_checks := v_checks || jsonb_build_object(
                'check', 'section:' || v_ss.section_key, 'ok', true);
        ELSE
            v_checks := v_checks || jsonb_build_object(
                'check', 'section:' || v_ss.section_key, 'ok', false,
                'message', format('La sección «%s» falta o es demasiado breve (%s de %s caracteres)',
                                  v_ss.label, coalesce(v_len, 0), v_ss.min_chars));
        END IF;
    END LOOP;

    -- 2. Criterios de aceptación verificables (al menos una lista de tareas)
    v_total := v_total + 1;
    IF EXISTS (
        SELECT 1 FROM document_section
         WHERE document_id = p_document_id
           AND section_key = 'acceptance_criteria'
           AND body_md ~ '^\s*[-*]\s+\[[ xX]\]'
    ) THEN
        v_passed := v_passed + 1;
        v_checks := v_checks || jsonb_build_object('check', 'acceptance_checklist', 'ok', true);
    ELSE
        v_checks := v_checks || jsonb_build_object(
            'check', 'acceptance_checklist', 'ok', false,
            'message', 'Los criterios de aceptación deben expresarse como lista de tareas «- [ ] ...»');
    END IF;

    -- 3. Sin bloqueantes abiertos
    v_total := v_total + 1;
    SELECT count(*) INTO v_blockers
      FROM document_link dl
      JOIN requirement r  ON r.document_id = dl.target_id
      JOIN workflow_status s ON s.id = r.status_id
     WHERE dl.source_id = p_document_id
       AND dl.link_type = 'blocked_by'
       AND NOT s.is_closed;

    IF v_blockers = 0 THEN
        v_passed := v_passed + 1;
        v_checks := v_checks || jsonb_build_object('check', 'no_open_blockers', 'ok', true);
    ELSE
        v_checks := v_checks || jsonb_build_object(
            'check', 'no_open_blockers', 'ok', false,
            'message', format('%s requerimiento(s) bloqueante(s) siguen abiertos', v_blockers));
    END IF;

    -- 4. Tracker habilitado para agentes y módulo activo en el espacio
    v_total := v_total + 1;
    IF EXISTS (
        SELECT 1 FROM tracker t JOIN space sp ON sp.id = v_req.space_id
         WHERE t.id = v_req.tracker_id
           AND t.is_agent_enabled
           AND coalesce((sp.modules->>'agents')::boolean, false)
    ) THEN
        v_passed := v_passed + 1;
        v_checks := v_checks || jsonb_build_object('check', 'agents_enabled', 'ok', true);
    ELSE
        v_checks := v_checks || jsonb_build_object(
            'check', 'agents_enabled', 'ok', false,
            'message', 'Los agentes no están habilitados para este espacio o tracker');
    END IF;

    RETURN jsonb_build_object(
        'score',   (v_passed * 100) / GREATEST(v_total, 1),
        'ready',   v_passed = v_total,
        'checks',  v_checks,
        'checked_at', now()
    );
END;
$$ LANGUAGE plpgsql STABLE;
```

`requirement_readiness_refresh()` persiste el resultado en `readiness_score` / `readiness_report`, y se invoca desde el trigger de reproyección y desde el worker periódico.

#### Transición de estado

```sql
CREATE OR REPLACE FUNCTION requirement_transition(
    p_document_id uuid,
    p_to_status   text,           -- key del estado destino
    p_comment_md  text DEFAULT NULL,
    p_resolution  text DEFAULT NULL
) RETURNS requirement AS $$
DECLARE
    v_req   requirement;
    v_from  workflow_status;
    v_to    workflow_status;
    v_tr    workflow_transition;
    v_role  member_role;
    v_result requirement;
    v_journal_id uuid;
BEGIN
    PERFORM qg_require_scope('req:transition');

    SELECT * INTO v_req FROM requirement WHERE document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento % no encontrado', p_document_id USING ERRCODE = 'QG404';
    END IF;

    SELECT * INTO v_from FROM workflow_status WHERE id = v_req.status_id;
    SELECT * INTO v_to   FROM workflow_status
      WHERE account_id = v_req.account_id AND key = p_to_status;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Estado «%» desconocido', p_to_status USING ERRCODE = 'QG400';
    END IF;

    v_role := space_member_role(v_req.space_id, qg_actor_type(), qg_actor_id());
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Sin acceso al espacio' USING ERRCODE = 'QG403';
    END IF;

    SELECT * INTO v_tr FROM workflow_transition
     WHERE tracker_id = v_req.tracker_id
       AND (from_status_id = v_from.id OR from_status_id IS NULL)
       AND to_status_id = v_to.id
     ORDER BY from_status_id NULLS LAST
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transición %s → %s no permitida para este tracker', v_from.key, v_to.key
            USING ERRCODE = 'QG422';
    END IF;
    IF NOT (v_role = ANY (v_tr.allowed_roles)) THEN
        RAISE EXCEPTION 'El rol % no puede realizar esta transición', v_role USING ERRCODE = 'QG403';
    END IF;
    IF NOT (qg_actor_type() = ANY (v_tr.allowed_actors)) THEN
        RAISE EXCEPTION 'Los actores de tipo % no pueden realizar esta transición', qg_actor_type()
            USING ERRCODE = 'QG403';
    END IF;
    IF v_tr.requires_comment AND coalesce(btrim(p_comment_md), '') = '' THEN
        RAISE EXCEPTION 'Esta transición exige un comentario' USING ERRCODE = 'QG422';
    END IF;
    IF v_tr.requires_assignee AND v_req.member_count = 0 THEN
        RAISE EXCEPTION 'Esta transición exige al menos un miembro asignado'
            USING ERRCODE = 'QG422';
    END IF;
    IF v_tr.requires_readiness AND NOT (requirement_readiness_check(p_document_id)->>'ready')::boolean THEN
        RAISE EXCEPTION 'El requerimiento no cumple la Definition of Ready' USING ERRCODE = 'QG422';
    END IF;
    IF v_to.requires_resolution AND coalesce(btrim(p_resolution), '') = '' THEN
        RAISE EXCEPTION 'Este estado exige una resolución' USING ERRCODE = 'QG422';
    END IF;

    UPDATE requirement
       SET status_id  = v_to.id,
           resolution = COALESCE(p_resolution, resolution),
           closed_at  = CASE WHEN v_to.is_closed THEN now() ELSE NULL END,
           done_ratio = CASE WHEN v_to.is_closed THEN 100 ELSE done_ratio END,
           reopened_count = reopened_count + CASE WHEN v_from.is_closed AND NOT v_to.is_closed
                                                  THEN 1 ELSE 0 END,
           updated_at = now()
     WHERE document_id = p_document_id
    RETURNING * INTO v_result;

    v_journal_id := journal_add(p_document_id, 'change', p_comment_md);
    PERFORM journal_detail_add(v_journal_id, 'attr', 'status', v_from.key, v_to.key);
    PERFORM notification_fanout(p_document_id, 'status_changed',
                                jsonb_build_object('from', v_from.key, 'to', v_to.key));

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

#### Tablero

Un tablero es una **configuración de presentación** sobre los requerimientos, no un subsistema paralelo. Las columnas se derivan de estados y mover una tarjeta entre columnas ejecuta `requirement_transition`, con todas sus validaciones.

```sql
CREATE TABLE board (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    -- NULL = tablero general: abarca todos los espacios visibles para el actor
    space_id     uuid REFERENCES space(id) ON DELETE CASCADE,
    key          text NOT NULL,
    name         text NOT NULL,
    description  text,
    -- NULL = tablero compartido; con valor = vista personal de ese usuario
    owner_id     uuid REFERENCES app_user(id) ON DELETE CASCADE,
    is_default   boolean NOT NULL DEFAULT false,
    filters      jsonb NOT NULL DEFAULT '{}',   -- mismo formato que requirement_list
    group_by     text NOT NULL DEFAULT 'none',  -- carriles: none|milestone|category
                                                --           |lead|label|space|tracker
    card_fields  text[] NOT NULL DEFAULT
                   '{labels,priority,members,readiness,comments,attachments,due_date}',
    ord          integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    creator_id   uuid,
    UNIQUE (account_id, coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid),
            coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
);

CREATE TABLE board_column (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id     uuid NOT NULL REFERENCES board(id) ON DELETE CASCADE,
    name         text NOT NULL,
    ord          integer NOT NULL,
    -- Una columna puede agrupar varios estados: ['in_analysis','in_progress']
    status_keys  text[] NOT NULL,
    wip_limit    integer,                       -- NULL = sin límite
    color        label_color,
    is_collapsed boolean NOT NULL DEFAULT false,
    CONSTRAINT board_column_statuses CHECK (cardinality(status_keys) > 0),
    UNIQUE (board_id, ord)
);
```

##### Orden manual: indexación fraccionaria

`requirement.board_position` es un `numeric` único por requerimiento. Insertar entre dos tarjetas calcula el punto medio, lo que convierte un reordenamiento en un `UPDATE` de una sola fila en lugar de renumerar la columna entera.

```sql
CREATE OR REPLACE FUNCTION requirement_board_move(
    p_document_id uuid,
    p_to_status   text DEFAULT NULL,   -- NULL = reordenar sin cambiar de columna
    p_prev_id     uuid DEFAULT NULL,   -- tarjeta inmediatamente por encima
    p_next_id     uuid DEFAULT NULL,   -- tarjeta inmediatamente por debajo
    p_comment_md  text DEFAULT NULL
) RETURNS requirement AS $$
DECLARE
    v_req      requirement;
    v_prev_pos numeric;
    v_next_pos numeric;
    v_new_pos  numeric;
    v_old_pos  numeric;
    v_result   requirement;
BEGIN
    PERFORM qg_require_scope('req:write');

    SELECT * INTO v_req FROM requirement WHERE document_id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requerimiento % no encontrado', p_document_id USING ERRCODE = 'QG404';
    END IF;
    v_old_pos := v_req.board_position;

    -- 1. Cambio de columna = transición real, con todas sus validaciones.
    --    Se hace primero: si la transición es ilegal, no se reordena nada.
    IF p_to_status IS NOT NULL THEN
        SELECT key INTO p_to_status FROM workflow_status
         WHERE account_id = v_req.account_id AND key = p_to_status;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Estado «%» desconocido', p_to_status USING ERRCODE = 'QG400';
        END IF;
        IF p_to_status IS DISTINCT FROM
           (SELECT key FROM workflow_status WHERE id = v_req.status_id) THEN
            PERFORM requirement_transition(p_document_id, p_to_status, p_comment_md, NULL);
        END IF;
    END IF;

    -- 2. Posición: punto medio entre vecinos
    SELECT board_position INTO v_prev_pos FROM requirement WHERE document_id = p_prev_id;
    SELECT board_position INTO v_next_pos FROM requirement WHERE document_id = p_next_id;

    v_new_pos := CASE
        WHEN v_prev_pos IS NULL AND v_next_pos IS NULL THEN v_old_pos
        WHEN v_prev_pos IS NULL THEN v_next_pos - 1000          -- al tope
        WHEN v_next_pos IS NULL THEN v_prev_pos + 1000          -- al fondo
        ELSE (v_prev_pos + v_next_pos) / 2
    END;

    -- Si el hueco se ha agotado, renumerar la columna y recalcular
    IF v_prev_pos IS NOT NULL AND v_next_pos IS NOT NULL
       AND abs(v_next_pos - v_prev_pos) < 0.000001 THEN
        PERFORM board_reindex(v_req.space_id, v_req.status_id);
        SELECT board_position INTO v_prev_pos FROM requirement WHERE document_id = p_prev_id;
        SELECT board_position INTO v_next_pos FROM requirement WHERE document_id = p_next_id;
        v_new_pos := (v_prev_pos + v_next_pos) / 2;
    END IF;

    UPDATE requirement
       SET board_position = v_new_pos, updated_at = now()
     WHERE document_id = p_document_id
    RETURNING * INTO v_result;

    -- El reordenamiento puro no genera entrada de journal: sería ruido.
    -- El cambio de columna sí, porque lo registra requirement_transition.
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;


-- Renumera una columna en pasos de 1000. La ejecuta requirement_board_move
-- cuando se agota la precisión, y el worker periódicamente por mantenimiento.
CREATE OR REPLACE FUNCTION board_reindex(p_space_id uuid, p_status_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    WITH ordered AS (
        SELECT document_id,
               row_number() OVER (ORDER BY board_position, created_at) * 1000 AS pos
          FROM requirement
         WHERE space_id = p_space_id AND status_id = p_status_id AND closed_at IS NULL
         FOR UPDATE
    )
    UPDATE requirement r
       SET board_position = o.pos
      FROM ordered o
     WHERE r.document_id = o.document_id AND r.board_position IS DISTINCT FROM o.pos;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```

##### Decisiones de diseño del orden

| Decisión | Elección | Motivo |
|----------|----------|--------|
| ¿Posición por tablero o por requerimiento? | **Una sola por requerimiento** | Reordenar en el tablero general reordena también en el del espacio. Una sola respuesta a "¿qué va primero?" evita órdenes contradictorios que nadie sabe cuál manda. La alternativa (`board_card_position` por tablero) queda como Q10. |
| ¿La posición se conserva al cambiar de columna? | **Sí** | La posición expresa una decisión sobre el orden de trabajo, no recencia. Lo que estaba arriba en *Listo* sigue arriba en *En curso*. |
| ¿Actividad de agente reordena? | **No** | Una transición hecha por un agente mueve la tarjeta de columna conservando posición. Que el sistema reordene solo destruye la intención del equipo. |
| ¿Posición o prioridad? | **Ambas, separadas** | `priority.weight` ordena la cola de agentes; `board_position` ordena la vista humana. Fusionarlas obliga a inflar la prioridad para subir una tarjeta, y acaba con todo en "urgente". |
| Representación | `numeric` fraccionario | Coherente con `document.position`. Reordenar es un `UPDATE` de una fila. `numeric` es de precisión arbitraria: no desborda, solo crece la escala, y `board_reindex()` la recorta. |

##### Lectura del tablero

```sql
CREATE OR REPLACE FUNCTION board_cards(
    p_board_id uuid,
    p_limit_per_column integer DEFAULT 100
) RETURNS TABLE (
    column_id uuid, column_name text, column_ord integer, wip_limit integer,
    card jsonb, board_position numeric, column_total bigint
) AS $$
DECLARE
    v_board board;
BEGIN
    PERFORM qg_require_scope('req:read');
    SELECT * INTO v_board FROM board WHERE id = p_board_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tablero % no encontrado', p_board_id USING ERRCODE = 'QG404';
    END IF;

    RETURN QUERY
    WITH cols AS (
        SELECT bc.id, bc.name, bc.ord, bc.wip_limit, bc.status_keys
          FROM board_column bc WHERE bc.board_id = v_board.id
    ),
    cards AS (
        SELECT c.id AS col_id, c.name AS col_name, c.ord AS col_ord, c.wip_limit,
               r.document_id, r.board_position,
               row_number() OVER (PARTITION BY c.id
                                  ORDER BY r.board_position, r.created_at) AS rn,
               count(*)      OVER (PARTITION BY c.id) AS total
          FROM cols c
          JOIN workflow_status st ON st.key = ANY (c.status_keys)
                                 AND st.account_id = v_board.account_id
          JOIN requirement r ON r.status_id = st.id
          JOIN document d    ON d.id = r.document_id
         WHERE (v_board.space_id IS NULL OR r.space_id = v_board.space_id)
           AND r.account_id = v_board.account_id
           AND NOT d.is_archived
           AND document_is_readable(d.id)              -- permisos, en BD
           AND requirement_matches_filters(r.document_id, v_board.filters)
    )
    SELECT k.col_id, k.col_name, k.col_ord, k.wip_limit,
           requirement_card_json(k.document_id), k.board_position, k.total
      FROM cards k
     WHERE k.rn <= p_limit_per_column
     ORDER BY k.col_ord, k.board_position, k.rn;
END;
$$ LANGUAGE plpgsql STABLE;
```

`requirement_card_json()` devuelve la carga mínima de una tarjeta —referencia, título, prioridad, categoría, etiquetas con su color, miembros, contadores de comentarios y adjuntos, progreso de criterios de aceptación, *readiness* y reserva de agente activa— evitando traer `body_md`, que en un tablero de 200 tarjetas sería el grueso de la transferencia.

##### Columnas que agrupan varios estados

Al soltar una tarjeta en una columna con varios `status_keys`, el destino se resuelve así:

1. Si el estado actual ya pertenece a esa columna, no hay transición: solo reordenamiento.
2. Si no, se toma el **primer** estado de `status_keys` para el que exista una transición legal desde el estado actual, según el rol y el tipo de actor.
3. Si hay varios candidatos legales y ninguno es claramente preferente, la API responde `409` con la lista, y la interfaz pregunta.

```sql
CREATE OR REPLACE FUNCTION requirement_column_target_status(
    p_document_id uuid, p_status_keys text[]
) RETURNS SETOF workflow_status AS $$
    SELECT s.*
      FROM unnest(p_status_keys) WITH ORDINALITY AS k(key, ord)
      JOIN workflow_status s ON s.key = k.key
     WHERE requirement_transition_is_legal(p_document_id, s.key)
     ORDER BY k.ord;
$$ LANGUAGE sql STABLE;
```

---

### 4.6 Historial, comentarios y auditoría

Se adopta el modelo **journal** (unifica comentarios, cambios de atributo y eventos de agente en una única línea de tiempo), sobre la auditoría por herencia de [ARCHITECTURE.md §4.6](ARCHITECTURE.md).

```sql
CREATE TYPE journal_kind AS ENUM ('comment', 'change', 'agent_event', 'system');

CREATE TABLE journal (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id      uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    kind             journal_kind NOT NULL,
    actor_type       actor_type NOT NULL,
    actor_user_id    uuid REFERENCES app_user(id) ON DELETE SET NULL,
    actor_agent_id   uuid REFERENCES agent(id) ON DELETE SET NULL,
    agent_session_id uuid REFERENCES agent_session(id) ON DELETE SET NULL,
    body_md          text,
    reply_to_id      uuid REFERENCES journal(id) ON DELETE SET NULL,
    is_private       boolean NOT NULL DEFAULT false,
    edited_at        timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_journal_document ON journal(document_id, created_at DESC);

CREATE TABLE journal_detail (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id  uuid NOT NULL REFERENCES journal(id) ON DELETE CASCADE,
    property    text NOT NULL,       -- 'attr' | 'section' | 'link' | 'attachment'
                                     -- | 'label' | 'member'
    prop_key    text NOT NULL,       -- 'status' | 'priority' | 'category'
                                     -- | 'acceptance_criteria' | ...
    old_value   text,
    new_value   text
);
CREATE INDEX idx_journal_detail_journal ON journal_detail(journal_id);
```

**Auditoría.** Se mantiene la auditoría por herencia (`audit_log` + `<entidad>_audit`) para tablas sensibles: `app_user`, `api_key`, `oauth_token`, `space_member`, `workflow_*`. Para `document` y `requirement` el journal ya cubre la trazabilidad funcional, y `document_version` la del contenido; duplicarlo en auditoría sería redundante.

---

### 4.7 Capa de agentes

Esta es la capa diferencial. Su contrato debe ser **estable y explícito**, porque es la que consumirá el MCP.

```sql
CREATE TYPE agent_status  AS ENUM ('active', 'suspended', 'revoked');
CREATE TYPE claim_outcome AS ENUM ('released', 'completed', 'expired', 'failed', 'preempted');

CREATE TABLE agent (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id           uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    key                  text NOT NULL,
    name                 text NOT NULL,
    kind                 text NOT NULL DEFAULT 'generic',  -- 'claude-code','copilot',...
    -- Los agentes son human-driven: siempre hay un humano responsable
    owner_user_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    description_md       text,
    capabilities         jsonb NOT NULL DEFAULT '{}',
        -- {"languages":["go","sql","ts"],"can_deploy":false,"max_context_tokens":200000}
    max_concurrent_claims integer NOT NULL DEFAULT 1,
    default_lease_seconds integer NOT NULL DEFAULT 3600,
    status               agent_status NOT NULL DEFAULT 'active',
    last_seen_at         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (account_id, key)
);

CREATE TABLE agent_session (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    document_id   uuid REFERENCES document(id) ON DELETE SET NULL,
    external_ref  text,                -- id de sesión del agente, rama git, PR...
    started_at    timestamptz NOT NULL DEFAULT now(),
    ended_at      timestamptz,
    outcome       text,
    tokens_in     bigint,
    tokens_out    bigint,
    cost_usd      numeric(12,4),
    meta          jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE agent_claim (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        uuid NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
    document_id     uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    session_id      uuid REFERENCES agent_session(id) ON DELETE SET NULL,
    claimed_at      timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz NOT NULL,
    renewed_count   integer NOT NULL DEFAULT 0,
    released_at     timestamptz,
    outcome         claim_outcome,
    release_note    text,
    prev_status_id  uuid REFERENCES workflow_status(id)  -- para revertir al expirar
);
CREATE UNIQUE INDEX idx_agent_claim_active
    ON agent_claim(document_id) WHERE released_at IS NULL;
CREATE INDEX idx_agent_claim_lease
    ON agent_claim(lease_expires_at) WHERE released_at IS NULL;

CREATE TABLE agent_event (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   uuid NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    document_id  uuid REFERENCES document(id) ON DELETE CASCADE,
    seq          integer NOT NULL,
    event_type   text NOT NULL,
        -- 'analysis' | 'impact' | 'plan' | 'patch' | 'test_run'
        -- | 'deploy' | 'question' | 'answer' | 'error' | 'note'
    summary      text,
    payload      jsonb NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, seq)
);
```

#### Protocolo de reserva (claim/lease)

Un agente no "toma" un requerimiento indefinidamente: adquiere un **arrendamiento con caducidad** que debe renovar. Si el agente muere, el requerimiento vuelve solo a la cola. `FOR UPDATE SKIP LOCKED` garantiza que dos agentes concurrentes nunca reciban el mismo trabajo.

```sql
CREATE OR REPLACE FUNCTION requirement_claim_next(
    p_space_keys    text[] DEFAULT NULL,
    p_tracker_keys  text[] DEFAULT NULL,
    p_lease_seconds integer DEFAULT NULL,
    p_external_ref  text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_agent   agent;
    v_doc_id  uuid;
    v_req     requirement;
    v_lease   integer;
    v_active  integer;
    v_session uuid;
    v_claim   uuid;
BEGIN
    PERFORM qg_require_scope('req:claim');

    IF qg_actor_type() <> 'agent' THEN
        RAISE EXCEPTION 'Solo un agente puede reclamar requerimientos' USING ERRCODE = 'QG403';
    END IF;

    SELECT * INTO v_agent FROM agent WHERE id = qg_actor_id() AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agente no encontrado o inactivo' USING ERRCODE = 'QG403';
    END IF;

    SELECT count(*) INTO v_active
      FROM agent_claim WHERE agent_id = v_agent.id AND released_at IS NULL;
    IF v_active >= v_agent.max_concurrent_claims THEN
        RAISE EXCEPTION 'Límite de reservas concurrentes alcanzado (%)', v_agent.max_concurrent_claims
            USING ERRCODE = 'QG429';
    END IF;

    v_lease := COALESCE(p_lease_seconds, v_agent.default_lease_seconds);

    -- Selección atómica del siguiente trabajo disponible
    SELECT r.document_id INTO v_doc_id
      FROM requirement r
      JOIN workflow_status st ON st.id = r.status_id
      JOIN priority       pr ON pr.id = r.priority_id
      JOIN tracker        tk ON tk.id = r.tracker_id
      JOIN space          sp ON sp.id = r.space_id
      JOIN space_member   sm ON sm.space_id = sp.id
                            AND sm.subject_type = 'agent'
                            AND sm.subject_id = v_agent.id
     WHERE r.account_id = v_agent.account_id
       AND st.is_agent_claimable
       AND tk.is_agent_enabled
       AND coalesce((sp.modules->>'agents')::boolean, false)
       AND r.claimed_by_agent_id IS NULL
       -- Ningún otro agente figura ya como miembro
       AND NOT EXISTS (SELECT 1 FROM requirement_member rm
                        WHERE rm.document_id = r.document_id
                          AND rm.subject_type = 'agent')
       AND coalesce(r.readiness_score, 0) = 100
       AND (p_space_keys   IS NULL OR sp.key = ANY (p_space_keys))
       AND (p_tracker_keys IS NULL OR tk.key = ANY (p_tracker_keys))
       AND NOT EXISTS (
             SELECT 1 FROM document_link dl
               JOIN requirement br ON br.document_id = dl.target_id
               JOIN workflow_status bs ON bs.id = br.status_id
              WHERE dl.source_id = r.document_id
                AND dl.link_type = 'blocked_by'
                AND NOT bs.is_closed)
     ORDER BY pr.weight DESC,
              r.due_date ASC NULLS LAST,
              r.created_at ASC
     LIMIT 1
     FOR UPDATE OF r SKIP LOCKED;

    IF v_doc_id IS NULL THEN
        RETURN jsonb_build_object('claimed', false,
                                  'reason', 'No hay requerimientos disponibles');
    END IF;

    SELECT * INTO v_req FROM requirement WHERE document_id = v_doc_id;

    INSERT INTO agent_session (agent_id, document_id, external_ref)
    VALUES (v_agent.id, v_doc_id, p_external_ref)
    RETURNING id INTO v_session;

    INSERT INTO agent_claim (agent_id, document_id, session_id,
                             lease_expires_at, prev_status_id)
    VALUES (v_agent.id, v_doc_id, v_session,
            now() + make_interval(secs => v_lease), v_req.status_id)
    RETURNING id INTO v_claim;

    UPDATE requirement
       SET claim_id            = v_claim,
           claimed_by_agent_id = v_agent.id,
           claim_expires_at    = now() + make_interval(secs => v_lease),
           status_id           = (SELECT id FROM workflow_status
                                   WHERE account_id = v_agent.account_id AND key = 'in_progress'),
           updated_at          = now()
     WHERE document_id = v_doc_id;

    -- El agente se añade como miembro de la tarjeta; el trigger de
    -- requirement_member refresca member_count y lead_agent_id.
    INSERT INTO requirement_member (document_id, subject_type, subject_id, added_by)
    VALUES (v_doc_id, 'agent', v_agent.id, v_agent.id)
    ON CONFLICT DO NOTHING;

    UPDATE agent SET last_seen_at = now() WHERE id = v_agent.id;

    PERFORM journal_add(v_doc_id, 'agent_event',
        format('El agente **%s** ha reservado este requerimiento (arrendamiento de %s s).',
               v_agent.name, v_lease));

    RETURN jsonb_build_object(
        'claimed',    true,
        'claim_id',   v_claim,
        'session_id', v_session,
        'lease_expires_at', now() + make_interval(secs => v_lease),
        'requirement', requirement_get_json(v_doc_id)
    );
END;
$$ LANGUAGE plpgsql;
```

Funciones complementarias:

| Función | Descripción |
|---------|-------------|
| `requirement_claim(p_ref_key, ...)` | Reserva un requerimiento **concreto** (el usuario le pide al agente "coge QG-123") |
| `requirement_claim_renew(p_claim_id, p_seconds)` | Heartbeat: extiende el arrendamiento |
| `requirement_claim_release(p_claim_id, p_outcome, p_note)` | Libera voluntariamente; revierte a `prev_status_id` salvo que el agente haya transicionado |
| `agent_claims_reap()` | Ejecutada por el worker cada 60 s: libera arrendamientos vencidos con `outcome = 'expired'` y anota en el journal |
| `agent_queue_list(...)` | Lista de requerimientos disponibles sin reservarlos (para que el humano decida) |
| `agent_event_append(p_session_id, p_type, p_summary, p_payload)` | Registra un evento y publica el resumen en el journal |

---

### 4.8 Búsqueda

Tres capas complementarias, todas sobre PostgreSQL:

| Capa | Mecanismo | Uso |
|------|-----------|-----|
| Léxica | `tsvector` + GIN, `websearch_to_tsquery` | Búsqueda principal, con ranking y resaltado (`ts_headline`) |
| Difusa | `pg_trgm` sobre `qg_unaccent(title)` | Autocompletado, paleta de comandos, resolución de wikilinks |
| Semántica *(fase 5)* | `pgvector`, embeddings por sección | "Encuentra requerimientos parecidos a este" |

```sql
CREATE OR REPLACE FUNCTION search_documents(
    p_query       text,
    p_doc_types   document_type[] DEFAULT NULL,
    p_space_ids   uuid[] DEFAULT NULL,
    p_label_slugs text[] DEFAULT NULL,
    p_status_keys text[] DEFAULT NULL,
    p_limit       integer DEFAULT 25,
    p_offset      integer DEFAULT 0
) RETURNS TABLE (
    id uuid, ref_key text, doc_type document_type, title text,
    space_key text, snippet text, rank real, updated_at timestamptz
) AS $$
DECLARE
    v_tsq tsquery := websearch_to_tsquery('spanish', p_query);
BEGIN
    PERFORM qg_require_scope('docs:read');

    RETURN QUERY
    SELECT d.id, d.ref_key, d.doc_type, d.title, sp.key,
           ts_headline('spanish', d.body_md, v_tsq,
                       'MaxFragments=2, MinWords=8, MaxWords=28, StartSel=<mark>, StopSel=</mark>'),
           ts_rank_cd(d.search_tsv, v_tsq)
             * CASE WHEN d.doc_type = 'requirement' THEN 1.15 ELSE 1.0 END,
           d.updated_at
      FROM document d
      JOIN space sp ON sp.id = d.space_id
     WHERE d.search_tsv @@ v_tsq
       AND NOT d.is_archived
       AND document_is_readable(d.id)          -- filtro de permisos en BD
       AND (p_doc_types IS NULL OR d.doc_type = ANY (p_doc_types))
       AND (p_space_ids IS NULL OR d.space_id = ANY (p_space_ids))
       AND (p_label_slugs IS NULL OR EXISTS (
              SELECT 1 FROM document_label dl JOIN label l ON l.id = dl.label_id
               WHERE dl.document_id = d.id AND l.slug = ANY (p_label_slugs)))
       AND (p_status_keys IS NULL OR EXISTS (
              SELECT 1 FROM requirement r JOIN workflow_status s ON s.id = r.status_id
               WHERE r.document_id = d.id AND s.key = ANY (p_status_keys)))
     ORDER BY rank DESC, d.updated_at DESC
     LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

### 4.9 Adjuntos y notificaciones

```sql
CREATE TABLE attachment (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    document_id   uuid REFERENCES document(id) ON DELETE CASCADE,
    journal_id    uuid REFERENCES journal(id) ON DELETE CASCADE,
    filename      text NOT NULL,
    content_type  text NOT NULL,
    byte_size     bigint NOT NULL,
    sha256        bytea NOT NULL,
    storage_key   text NOT NULL,     -- ruta en FS o clave S3
    is_inline     boolean NOT NULL DEFAULT false,   -- imagen pegada en el markdown
    width         integer,
    height        integer,
    created_at    timestamptz NOT NULL DEFAULT now(),
    creator_id    uuid,
    CONSTRAINT attachment_owner CHECK (document_id IS NOT NULL OR journal_id IS NOT NULL)
);
CREATE INDEX idx_attachment_sha ON attachment(account_id, sha256);  -- deduplicación
```

La API almacena el binario (FS local o S3-compatible) y registra únicamente los metadatos. Las imágenes pegadas en el editor se suben primero y se insertan como `![alt](/api/v1/attachments/{id}/raw)`.

```sql
CREATE TABLE notification (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   uuid NOT NULL,
    user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    document_id  uuid REFERENCES document(id) ON DELETE CASCADE,
    event_type   text NOT NULL,
    payload      jsonb NOT NULL DEFAULT '{}',
    read_at      timestamptz,
    emailed_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_inbox ON notification(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE watcher (
    document_id  uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
    subject_type actor_type NOT NULL,
    subject_id   uuid NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, subject_type, subject_id)
);
```

`notification_fanout()` inserta las filas y emite `pg_notify('qg_events', <json>)`. Una goroutine dedicada de la API mantiene una conexión en `LISTEN` y reparte los eventos a los clientes SSE conectados.

---

### 4.10 Catálogo de funciones

Contrato público de la BD. Todo lo que la API o el MCP puedan hacer está aquí.

**Documentos**

| Función | Descripción |
|---------|-------------|
| `document_create(p_space_id, p_parent_id, p_doc_type, p_title, p_body_md, p_front_matter)` | Crea un documento; deriva `slug`, secciones y enlaces |
| `document_get(p_id)` / `document_get_by_ref(p_ref_key)` | Lectura con verificación de permisos |
| `document_get_json(p_id)` | Documento + secciones + tags + enlaces + metadatos en un solo `jsonb` (usado por el MCP) |
| `document_update_body(p_id, p_title, p_body_md, p_change_summary, p_base_version)` | Actualiza el markdown completo con control optimista |
| `document_section_update(p_id, p_section_key, p_body_md, p_base_version)` | Actualiza una sección con splice sobre `body_md` |
| `document_move(p_id, p_new_parent_id, p_position)` | Reubica en el árbol; recalcula `path` y `depth` |
| `document_tree(p_space_id, p_parent_id, p_depth)` | Árbol de navegación |
| `document_archive(p_id)` / `document_restore(p_id)` | Archivado lógico |
| `document_promote_to_requirement(p_id, p_tracker_key, p_priority_key, p_category_slug, p_member_ids)` | Convierte una nota en requerimiento |
| `document_versions(p_id, p_limit, p_offset)` / `document_version_restore(p_id, p_version)` | Historial |
| `document_backlinks(p_id)` | Documentos que enlazan a este |
| `document_is_readable(p_id)` / `document_get_authorized(p_id, p_mode)` | Comprobación de permisos reutilizable |

**Requerimientos**

| Función | Descripción |
|---------|-------------|
| `requirement_create(p_space_id, p_tracker_key, p_title, p_body_md, p_priority_key, p_category_slug, p_member_ids, p_due_date)` | Crea documento + fila `requirement` + `ref_key` + miembros |
| `requirement_get_json(p_document_id)` | Vista completa para agentes: markdown, secciones, estado, transiciones posibles, enlaces, readiness |
| `requirement_list(p_filters jsonb, p_sort, p_limit, p_offset)` | Listado con filtros compuestos |
| `requirement_update_attrs(p_id, p_attrs jsonb)` | Actualización parcial de metadatos; registra cada cambio en `journal_detail` |
| `requirement_transition(p_id, p_to_status, p_comment_md, p_resolution)` | Cambio de estado validado contra el workflow |
| `requirement_transitions_available(p_id)` | Transiciones legales para el actor actual |
| `requirement_readiness_check(p_id)` / `requirement_readiness_refresh(p_id)` | Definition of Ready |
| `requirement_link(p_source_id, p_target_ref, p_link_type)` | Relaciones tipadas |
| `requirement_watch(p_id)` / `requirement_unwatch(p_id)` | Seguimiento |
| `requirement_matches_filters(p_id, p_filters jsonb)` | Evaluación de filtros compartida entre listado, tablero y vistas guardadas |

**Miembros, etiquetas y tablero**

| Función | Descripción |
|---------|-------------|
| `requirement_member_add(p_id, p_subject_type, p_subject_id, p_is_lead)` | Añade una persona o agente a la tarjeta |
| `requirement_member_remove(p_id, p_subject_type, p_subject_id)` | Retira un miembro |
| `requirement_member_set_lead(p_id, p_subject_type, p_subject_id)` | Designa responsable principal (o lo elimina con `NULL`) |
| `requirement_members(p_id)` | Miembros con su perfil resuelto |
| `label_create(p_name, p_color, p_space_id)` / `label_update` / `label_delete` | Catálogo de etiquetas |
| `label_list(p_space_id)` | Globales de la cuenta + las del espacio, en un solo conjunto |
| `document_label_set(p_document_id, p_label_ids uuid[])` | Reemplazo completo del conjunto de etiquetas |
| `document_label_toggle(p_document_id, p_label_id)` | Alternancia individual |
| `board_create(...)` / `board_update(...)` / `board_delete(...)` | Configuración de tableros |
| `board_column_upsert(...)` / `board_column_delete(...)` | Columnas y sus estados agrupados |
| `board_cards(p_board_id, p_limit_per_column)` | Lectura del tablero, ya ordenada por columna |
| `requirement_board_move(p_id, p_to_status, p_prev_id, p_next_id, p_comment_md)` | Arrastrar y soltar: transición + reordenamiento, atómico |
| `requirement_column_target_status(p_id, p_status_keys)` | Estados legales dentro de una columna agrupada |
| `board_reindex(p_space_id, p_status_id)` | Renumeración de posiciones cuando se agota la precisión |
| `category_create/update/delete/list(p_space_id)` | Categorías del espacio |

**Agentes**

| Función | Descripción |
|---------|-------------|
| `agent_register(...)` / `agent_update(...)` / `agent_revoke(...)` | Ciclo de vida |
| `agent_queue_list(p_space_keys, p_tracker_keys, p_limit)` | Cola de trabajo disponible |
| `requirement_claim_next(...)` / `requirement_claim(...)` | Reserva |
| `requirement_claim_renew(...)` / `requirement_claim_release(...)` | Arrendamiento |
| `agent_claims_reap()` | Recolección de arrendamientos vencidos |
| `agent_session_end(p_session_id, p_outcome, p_tokens_in, p_tokens_out, p_cost_usd)` | Cierre de sesión con métricas |
| `agent_event_append(...)` | Registro estructurado de actividad |
| `agent_question_ask(p_document_id, p_question_md)` | Pregunta al solicitante; pasa a `needs_info` |
| `agent_stats(p_agent_id, p_from, p_to)` | Métricas: resueltos, tiempo medio, tasa de reapertura, coste |

**Comentarios, journal, búsqueda, admin**

`journal_add`, `journal_detail_add`, `journal_list`, `comment_edit`, `comment_delete`,
`search_documents`, `search_suggest`,
`space_create/update/archive`, `space_member_grant/revoke`, `space_member_role`,
`tracker_*`, `workflow_status_*`, `workflow_transition_*`, `priority_*`, `section_schema_*`,
`user_login`, `user_get_api`, `api_key_create/verify/revoke`,
`oauth_client_register`, `oauth_code_issue/redeem`, `oauth_token_issue/verify/revoke`.

---

## 5. Capa de API — Go

Transposición directa de [ARCHITECTURE.md §3](ARCHITECTURE.md).

| ARCHITECTURE.md (Python) | Quagenticus (Go) |
|--------------------------|------------------|
| FastAPI | `net/http` + `go-chi/chi/v5` |
| `asyncpg` pool | `jackc/pgx/v5` + `pgxpool` |
| Modelos Pydantic | structs + `go-playground/validator/v10` |
| `Depends(...)` | middlewares chi + valores en `context.Context` |
| `pydantic-settings` | `caarlos0/env/v11` sobre struct `Config` |
| `python-jose` | `golang-jwt/jwt/v5` |
| `slowapi` | `ulule/limiter/v3` |
| `uvicorn` / `gunicorn` | `http.Server` de la stdlib |
| Docstrings → Swagger | `swaggo/swag` o spec OpenAPI escrita a mano |
| `logging` | `log/slog` (stdlib) |

### 5.1 Pool y contexto de actor

```go
// internal/db/db.go
package db

type DB struct{ Pool *pgxpool.Pool }

func New(ctx context.Context, cfg config.Config) (*DB, error) {
    pc, err := pgxpool.ParseConfig(cfg.DatabaseURL())
    if err != nil {
        return nil, err
    }
    pc.MinConns = cfg.DBMinConns          // 5
    pc.MaxConns = cfg.DBMaxConns          // 20
    pc.MaxConnLifetime = time.Hour
    pc.ConnConfig.RuntimeParams["search_path"] = cfg.DBSchema
    pc.ConnConfig.RuntimeParams["application_name"] = "quagenticus-api"

    pool, err := pgxpool.NewWithConfig(ctx, pc)
    if err != nil {
        return nil, err
    }
    return &DB{Pool: pool}, pool.Ping(ctx)
}

// WithActor abre una transacción y fija el contexto del actor con alcance
// local a la transacción (set_config(..., true)). Es lo que hace seguro el
// pooling: la configuración desaparece al terminar, sin necesidad de limpieza
// explícita, y es compatible con PgBouncer en modo transaction.
func (d *DB) WithActor(ctx context.Context, a auth.Actor, fn func(pgx.Tx) error) error {
    return pgx.BeginFunc(ctx, d.Pool, func(tx pgx.Tx) error {
        if _, err := tx.Exec(ctx, `
            SELECT set_config('qg.actor_type', $1, true),
                   set_config('qg.actor_id',   $2, true),
                   set_config('qg.account_id', $3, true),
                   set_config('qg.scopes',     $4, true),
                   set_config('qg.request_id', $5, true)`,
            a.Type, a.ID, a.AccountID, strings.Join(a.Scopes, " "),
            httpx.RequestIDFrom(ctx),
        ); err != nil {
            return fmt.Errorf("fijando contexto de actor: %w", err)
        }
        return fn(tx)
    })
}
```

### 5.2 Handler delgado

```go
// internal/handlers/documents.go
func (h *Documents) Create(w http.ResponseWriter, r *http.Request) {
    var in models.DocumentCreate
    if err := httpx.DecodeAndValidate(r, &in); err != nil {
        httpx.WriteError(w, r, err)
        return
    }

    var out models.DocumentResponse
    err := h.db.WithActor(r.Context(), auth.ActorFrom(r.Context()), func(tx pgx.Tx) error {
        rows, err := tx.Query(r.Context(),
            `SELECT * FROM document_create($1, $2, $3, $4, $5, $6)`,
            in.SpaceID, in.ParentID, in.DocType, in.Title, in.BodyMD, in.FrontMatter)
        if err != nil {
            return err
        }
        out, err = pgx.CollectExactlyOneRow(rows, pgx.RowToStructByNameLax[models.DocumentResponse])
        return err
    })
    if err != nil {
        httpx.WriteError(w, r, err)   // traduce SQLSTATE → HTTP
        return
    }
    httpx.WriteJSON(w, http.StatusCreated, out)
}
```

Las reglas de [ARCHITECTURE.md §3.4](ARCHITECTURE.md) se mantienen palabra por palabra: **un handler por entidad, sin lógica de negocio, sin SQL inline fuera de la llamada a la función**.

### 5.3 Traducción de errores

```go
// internal/httpx/errors.go
var sqlstateToStatus = map[string]int{
    "QG400": http.StatusBadRequest,
    "QG401": http.StatusUnauthorized,
    "QG403": http.StatusForbidden,
    "QG404": http.StatusNotFound,
    "QG409": http.StatusConflict,
    "QG422": http.StatusUnprocessableEntity,
    "QG429": http.StatusTooManyRequests,
    "23505": http.StatusConflict,           // unique_violation
    "23503": http.StatusConflict,           // foreign_key_violation
    "23514": http.StatusBadRequest,         // check_violation
    "22001": http.StatusBadRequest,         // string_data_right_truncation
}

func WriteError(w http.ResponseWriter, r *http.Request, err error) {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) {
        status, ok := sqlstateToStatus[pgErr.Code]
        if !ok {
            status = http.StatusInternalServerError
            slog.ErrorContext(r.Context(), "error de base de datos no mapeado",
                "sqlstate", pgErr.Code, "detail", pgErr.Message)
        }
        WriteJSON(w, status, Problem{
            Type:      "https://quagenticus.dev/errors/" + strings.ToLower(pgErr.Code),
            Title:     http.StatusText(status),
            Detail:    pgErr.Message,     // el mensaje de negocio se escribe una sola vez: en la BD
            Hint:      pgErr.Hint,
            RequestID: RequestIDFrom(r.Context()),
        })
        return
    }
    // ... validación, no encontrado, error interno
}
```

Formato de error: **RFC 9457 (Problem Details)**, uniforme para la SPA y el MCP.

### 5.4 Middlewares

Orden de registro en `cmd/quagenticus-api/main.go`:

```
RequestID → RealIP → Recoverer → slog structured logging → CORS
→ RateLimit → Authenticate (JWT | API key | OAuth) → router
```

`Authenticate` resuelve la credencial y deposita un `auth.Actor` en el contexto; **no autoriza**. La autorización siempre ocurre en la función SQL, con el rol y los scopes que la BD lee del contexto de transacción.

### 5.5 Paginación

Igual que [ARCHITECTURE.md §3.7](ARCHITECTURE.md): cuerpo = array JSON plano, metadatos en cabeceras `X-Has-More`, `X-Limit`, `X-Offset`, `X-Total-Count`. Se añade paginación **por cursor** (`X-Next-Cursor`) en `/journal` y `/agents/events`, donde el offset es inestable ante inserciones concurrentes.

### 5.6 Dependencias

| Módulo | Propósito |
|--------|-----------|
| `github.com/go-chi/chi/v5` | Router y middlewares |
| `github.com/jackc/pgx/v5` | Driver PostgreSQL + pool |
| `github.com/golang-jwt/jwt/v5` | JWT (HS256 para sesión, EdDSA para OAuth) |
| `github.com/go-playground/validator/v10` | Validación de structs de entrada |
| `github.com/caarlos0/env/v11` | Configuración desde entorno |
| `github.com/yuin/goldmark` + `goldmark-meta`, `goldmark-highlighting` | Render markdown para exports |
| `github.com/microcosm-cc/bluemonday` | Sanitizado del HTML generado |
| `github.com/ulule/limiter/v3` | Rate limiting |
| `github.com/google/uuid` | UUIDs |
| `github.com/aws/aws-sdk-go-v2/service/s3` | Adjuntos en almacenamiento S3-compatible (opcional) |
| `github.com/modelcontextprotocol/go-sdk` | SDK MCP oficial |
| `log/slog`, `net/http`, `context` | Stdlib |

---

## 6. Autenticación y autorización

Cuatro credenciales, un único tipo `Actor` interno.

| Credencial | Portador | Emisión | Uso |
|------------|----------|---------|-----|
| **JWT de sesión** | Usuario humano en la SPA | `POST /auth/login` | Access 30 min + refresh 7 días, rotativo |
| **API key** | Integración M2M, CI | `POST /api-keys` | `qg_<prefix>_<secret>`; se almacena solo el hash bcrypt |
| **Token OAuth 2.1** | Cliente MCP | Flujo authorization_code + PKCE | Access 1 h + refresh; scopes acotados |
| **JWT de sistema** | Admin de plataforma | `POST /auth/sys/login` | Panel de administración |

```go
type Actor struct {
    Type      string   // "user" | "agent" | "system"
    ID        string   // app_user.id o agent.id
    AccountID string
    Scopes    []string // vacío en sesiones interactivas
    Via       string   // "session" | "api_key" | "oauth" | "system"
}
```

### 6.1 Scopes

| Scope | Concede |
|-------|---------|
| `docs:read` | Leer documentos, secciones, árbol, búsqueda |
| `docs:write` | Crear y editar documentos |
| `req:read` | Leer requerimientos, journal, cola |
| `req:write` | Crear y editar requerimientos y comentarios |
| `req:claim` | Reservar y liberar requerimientos |
| `req:transition` | Cambiar estado |
| `attachments:read` / `attachments:write` | Adjuntos |
| `agent:report` | Registrar eventos de agente y cerrar sesiones |
| `admin` | Administración de la cuenta |

Un token nunca puede superar el rol que su sujeto tiene en `space_member`. La intersección se calcula en BD:

```
permiso efectivo = rol en space_member  ∩  scopes del token  ∩  módulos del espacio
```

### 6.2 Contraseñas

Como en [ARCHITECTURE.md §9](ARCHITECTURE.md), **la verificación ocurre en SQL**, no en Go:

```sql
CREATE OR REPLACE FUNCTION user_login(p_email citext, p_password text)
RETURNS app_user AS $$
DECLARE v_user app_user;
BEGIN
    SELECT * INTO v_user FROM app_user
     WHERE email = p_email AND status = 'active'
       AND password IS NOT NULL
       AND password = crypt(p_password, password);
    IF NOT FOUND THEN
        PERFORM pg_sleep(0.1);   -- mitigación básica de temporización
        RAISE EXCEPTION 'Credenciales inválidas' USING ERRCODE = 'QG401';
    END IF;
    UPDATE app_user SET last_login_at = now() WHERE id = v_user.id;
    RETURN v_user;
END;
$$ LANGUAGE plpgsql;
```

`bcrypt` con coste ≥ 12 vía `crypt(p_password, gen_salt('bf', 12))`.

---

## 7. API HTTP

Base: `/api/v1`. JSON en cuerpo y respuesta. Errores en RFC 9457.

### Autenticación

```
POST   /auth/login                      → { access_token, refresh_token, user }
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me
POST   /auth/sys/login
GET    /api-keys                        · POST /api-keys · DELETE /api-keys/{id}
```

### OAuth 2.1 (Authorization Server para MCP)

```
GET    /.well-known/oauth-authorization-server
GET    /.well-known/oauth-protected-resource
POST   /oauth/register                  ← Dynamic Client Registration (RFC 7591)
GET    /oauth/authorize                 ← consentimiento del usuario
POST   /oauth/token                     ← authorization_code + PKCE, refresh_token
POST   /oauth/revoke
GET    /oauth/jwks.json
```

### Espacios y árbol

```
GET    /spaces                          · POST /spaces
GET    /spaces/{key}                    · PATCH /spaces/{key} · DELETE /spaces/{key}
GET    /spaces/{key}/tree?depth=2       ← árbol de navegación (estilo cuaderno)
GET    /spaces/{key}/members            · POST · DELETE
```

### Documentos

```
GET    /documents?space=QG&type=note&label=diseño&q=...&updated_since=...
POST   /documents
GET    /documents/{id}                  ← ETag: W/"<version>-<sha256>"
PATCH  /documents/{id}                  ← metadatos (título, tags, padre, visibilidad)
PUT    /documents/{id}/body             ← body_md completo; If-Match para concurrencia
DELETE /documents/{id}                  ← archivado lógico
POST   /documents/{id}/restore
POST   /documents/{id}/move
GET    /documents/{id}/sections
PUT    /documents/{id}/sections/{key}   ← edición de una sección aislada
GET    /documents/{id}/versions         · GET /versions/{n} · POST /versions/{n}/restore
GET    /documents/{id}/diff?from=3&to=7
GET    /documents/{id}/links            · POST · DELETE
GET    /documents/{id}/backlinks
GET    /documents/{id}/attachments      · POST (multipart)
POST   /documents/{id}/promote          ← nota → requerimiento
GET    /documents/{id}/export?format=md|html|pdf
POST   /documents/import                ← multipart: .md sueltos o .zip de un árbol
```

### Requerimientos

```
GET    /requirements?space=QG&status=ready,in_progress&tracker=bug&category=backend
                    &member=me&lead=me&priority=high&label=bloqueante,deuda-tecnica
                    &milestone=...&q=...&sort=-priority,board_position
POST   /requirements
GET    /requirements/{ref}              ← 'QG-123' o uuid
PATCH  /requirements/{ref}              ← metadatos
POST   /requirements/{ref}/transition   ← { to: "in_review", comment_md, resolution }
GET    /requirements/{ref}/transitions  ← transiciones legales para el actor
GET    /requirements/{ref}/readiness    ← informe de Definition of Ready
GET    /requirements/{ref}/journal      ← línea de tiempo (cursor)
POST   /requirements/{ref}/comments     · PATCH · DELETE
POST   /requirements/{ref}/watch        · DELETE
GET    /requirements/{ref}/time-entries · POST
GET    /requirements/{ref}/children
```

### Miembros de un requerimiento

```
GET    /requirements/{ref}/members
POST   /requirements/{ref}/members      ← { subject_type: "user", subject_id, is_lead }
DELETE /requirements/{ref}/members/{subject_type}/{subject_id}
PUT    /requirements/{ref}/members/lead ← { subject_type, subject_id } | null
```

### Etiquetas

```
GET    /labels?space=QG                 ← globales de la cuenta + las del espacio
POST   /labels                          ← { name, color, space_id? }
PATCH  /labels/{id}                     · DELETE /labels/{id}
PUT    /documents/{id}/labels           ← { label_ids: [...] } reemplazo completo
POST   /documents/{id}/labels/{labelId} · DELETE  ← alternancia individual
GET    /labels/palette                  ← tokens de color con sus valores por tema
```

### Tableros

```
GET    /boards?space=QG                 ← tableros del espacio + generales + personales
POST   /boards                          · PATCH /boards/{id} · DELETE /boards/{id}
GET    /boards/{id}                     ← definición: columnas, filtros, agrupación
GET    /boards/{id}/cards               ← tarjetas por columna, ya ordenadas
       ?limit_per_column=100&group_by=milestone
POST   /boards/{id}/columns             · PATCH /columns/{colId} · DELETE
POST   /requirements/{ref}/board-move   ← arrastrar y soltar:
                                          { to_status?, prev_id?, next_id?, comment_md? }
POST   /boards/{id}/reindex             ← renumeración manual de posiciones
```

`POST /requirements/{ref}/board-move` es la única escritura del tablero. Combina transición y reordenamiento en una llamada porque un arrastre es una sola intención del usuario y debe ser atómico: si la transición es ilegal, la tarjeta no se mueve ni cambia de posición.

Respuestas relevantes:

| Código | Situación |
|--------|-----------|
| `200` | Movimiento aplicado; devuelve el requerimiento con su nueva posición y estado |
| `409` | La columna destino agrupa varios estados y hay más de una transición legal. El cuerpo lista los candidatos para que la interfaz pregunte |
| `422` | La transición no es legal desde el estado actual, o falta un requisito (comentario, miembro, *readiness*) |

### Agentes

```
GET    /agents                          · POST · PATCH /agents/{key} · DELETE
GET    /agents/queue?space=QG&tracker=bug&limit=20
POST   /agents/claims                   ← reserva el siguiente disponible
POST   /agents/claims/by-ref/{ref}      ← reserva uno concreto
POST   /agents/claims/{id}/renew
POST   /agents/claims/{id}/release      ← { outcome, note }
GET    /agents/claims/mine
POST   /agents/sessions/{id}/events     ← evento estructurado
POST   /agents/sessions/{id}/end        ← { outcome, tokens_in, tokens_out, cost_usd }
GET    /agents/{key}/stats?from=...&to=...
```

### Búsqueda, actividad y administración

```
GET    /search?q=...&type=note,requirement&space=QG&limit=25
GET    /search/suggest?q=...            ← autocompletado trigram
GET    /activity?space=QG&since=...
GET    /notifications                   · POST /notifications/{id}/read
GET    /events                          ← SSE: cambios en documentos, claims, journal
GET    /admin/trackers · /statuses · /priorities · /transitions · /section-schemas
GET    /healthz · /readyz · /metrics
```

---

## 8. Capa MCP

> **Alcance.** Esta especificación cubre que el sistema *permita construir* el MCP: modelo de datos, scopes, servidor de autorización y funciones de negocio idempotentes. La lógica interna de los agentes queda fuera.

### 8.1 Topología

```
┌────────────────────┐   MCP Streamable HTTP    ┌─────────────────────┐
│  Claude Code       │◀────────────────────────▶│  quagenticus-mcp    │
│  Copilot, etc.     │   OAuth 2.1 Bearer       │  (servidor MCP, Go) │
└────────────────────┘                          └──────────┬──────────┘
         │                                                 │ REST + Bearer
         │  ①  401 + WWW-Authenticate:                     │  (mismo token)
         │       resource_metadata="…"                     ▼
         │  ②  descubre el AS                   ┌─────────────────────┐
         │  ③  DCR + authorization_code + PKCE  │  quagenticus-api    │
         └────────────────────────────────────▶ │  (OAuth AS + RS)    │
                                                └──────────┬──────────┘
                                                           ▼
                                                    PostgreSQL
```

El servidor MCP es un **cliente de la API REST**, no de la base de datos (AD-8). Ventajas: una única superficie de autorización, rate limiting y auditoría; sin credenciales de BD repartidas; el MCP puede desplegarse en otra máquina o incluso ejecutarse en local vía stdio contra una instancia remota.

**Transportes soportados**
- `streamable-http` en `/mcp` — modo servidor, autenticado con OAuth 2.1.
- `stdio` — modo local, autenticado con una API key en `QUAGENTICUS_API_KEY`. Es el camino más corto para empezar.

### 8.2 Herramientas

Las herramientas mapean 1:1 a funciones de BD, por lo que **no contienen lógica**. Los nombres llevan prefijo `qg_` para evitar colisiones en clientes con varios servidores MCP.

| Herramienta | Scope | Función SQL subyacente |
|-------------|-------|------------------------|
| `qg_search` | `docs:read` | `search_documents` |
| `qg_document_get` | `docs:read` | `document_get_json` |
| `qg_document_create` | `docs:write` | `document_create` |
| `qg_document_update` | `docs:write` | `document_update_body` |
| `qg_document_section_update` | `docs:write` | `document_section_update` |
| `qg_document_backlinks` | `docs:read` | `document_backlinks` |
| `qg_queue_list` | `req:read` | `agent_queue_list` |
| `qg_requirement_get` | `req:read` | `requirement_get_json` |
| `qg_requirement_list` | `req:read` | `requirement_list` |
| `qg_requirement_create` | `req:write` | `requirement_create` |
| `qg_requirement_update` | `req:write` | `requirement_update_attrs` |
| `qg_requirement_readiness` | `req:read` | `requirement_readiness_check` |
| `qg_member_add` / `qg_member_remove` | `req:write` | `requirement_member_add` / `_remove` |
| `qg_label_list` | `req:read` | `label_list` |
| `qg_label_set` | `req:write` | `document_label_set` |
| `qg_board_cards` | `req:read` | `board_cards` |
| `qg_board_move` | `req:transition` | `requirement_board_move` |
| `qg_claim_next` | `req:claim` | `requirement_claim_next` |
| `qg_claim_by_ref` | `req:claim` | `requirement_claim` |
| `qg_claim_renew` | `req:claim` | `requirement_claim_renew` |
| `qg_claim_release` | `req:claim` | `requirement_claim_release` |
| `qg_transition` | `req:transition` | `requirement_transition` |
| `qg_comment_add` | `req:write` | `journal_add` |
| `qg_event_report` | `agent:report` | `agent_event_append` |
| `qg_question_ask` | `req:write` | `agent_question_ask` |
| `qg_link_create` | `req:write` | `requirement_link` |
| `qg_attachment_add` | `attachments:write` | `attachment_create` |
| `qg_session_end` | `agent:report` | `agent_session_end` |

Cobertura de los diez objetivos del documento funcional:

| Objetivo funcional | Herramientas |
|--------------------|--------------|
| 1. Crear requerimientos | `qg_requirement_create` |
| 2. Ingerir para análisis | `qg_queue_list`, `qg_requirement_get`, `qg_search` |
| 3. Colaborar en la resolución | `qg_claim_*`, `qg_comment_add`, `qg_event_report` |
| 4. Responder preguntas | `qg_search`, `qg_document_get`, `qg_comment_add` |
| 5. Actualizar estado | `qg_transition` |
| 6. Análisis de impacto | `qg_event_report` (`type: "impact"`) + `qg_document_create` del informe, enlazado con `specifies` |
| 7. Desarrollar la solución | `qg_event_report` (`plan`, `patch`) + `qg_link_create` hacia el PR |
| 8. Testing | `qg_event_report` (`test_run`) + `qg_transition` → `testing` |
| 9. Despliegue | `qg_event_report` (`deploy`) + `qg_transition` → `deployed` |
| 10. Cierre | `qg_transition` → `resolved`; el cierre final lo hace un humano |

### 8.3 Recursos y prompts

**Recursos** (contexto de solo lectura, direccionable por URI):

```
quagenticus://space/{key}/tree              índice de navegación del espacio
quagenticus://document/{id}                 markdown completo del documento
quagenticus://requirement/{ref}             requerimiento con metadatos en front matter
quagenticus://requirement/{ref}/journal     historial completo
quagenticus://queue/{space}                 cola de trabajo disponible
quagenticus://board/{space}                 tablero: columnas y tarjetas ordenadas
```

**Sobre `qg_board_move` y los agentes.** Un agente puede mover su propia tarjeta de columna —es la forma natural de reflejar que ha pasado de análisis a desarrollo— pero **no debe reordenar tarjetas dentro de una columna**: el orden manual es una decisión humana de priorización. Por eso el servidor MCP expone `qg_board_move` únicamente con `to_status`, sin `prev_id` ni `next_id`. Un agente puede avanzar su trabajo; no puede colocarse el primero de la fila.

**Prompts** (plantillas de flujo reutilizables):

| Prompt | Argumentos | Propósito |
|--------|-----------|-----------|
| `analizar-requerimiento` | `ref` | Leer, verificar la DoR, producir análisis de impacto |
| `implementar-requerimiento` | `ref` | Reservar, planificar, implementar, reportar |
| `revisar-criterios` | `ref` | Contrastar la implementación con los criterios de aceptación |
| `redactar-requerimiento` | `space`, `idea` | Convertir una idea suelta en las cinco secciones canónicas |

### 8.4 Formato de respuesta y seguridad frente a inyección

El contenido de los documentos es **texto no confiable**: lo escriben usuarios y otros agentes. Las respuestas del MCP delimitan explícitamente el contenido y separan datos de instrucciones:

```markdown
## QG-142 — Exportar informes a PDF

| Campo | Valor |
|-------|-------|
| Estado | ready · Prioridad | high |
| Tracker | feature · Solicitante | María Ruiz |
| Vence | 2026-08-15 · DoR | 100/100 |

Transiciones disponibles: in_analysis, in_progress, blocked, rejected

<contenido-de-usuario ref="QG-142" fuente="no-confiable">
# Exportar informes a PDF
## Situación actual
…
</contenido-de-usuario>
```

Reglas del servidor MCP:
1. Todo texto procedente de la BD va dentro de `<contenido-de-usuario>`, nunca concatenado con instrucciones del sistema.
2. Las herramientas de escritura son idempotentes o llevan control optimista (`base_version`); un reintento no duplica trabajo.
3. Toda operación destructiva o de transición exige `req:transition` explícito y queda registrada con la identidad del agente.
4. El cierre definitivo (`closed`) no está disponible para actores de tipo `agent`: se controla en `workflow_transition.allowed_actors`.
5. El servidor no expone `admin` bajo ninguna herramienta.

---

## 9. Frontend

**Stack:** React 19 + TypeScript + Vite · TanStack Query · TanStack Router · Tailwind CSS · Zustand para estado de UI.

### 9.1 Editor de markdown

**Decisión: CodeMirror 6 con markdown como fuente de verdad**, no un WYSIWYG con round-trip.

Motivo: el markdown lo escriben y lo leen agentes. Un editor WYSIWYG que reserializa puede reordenar atributos, normalizar guiones o alterar bloques de código, produciendo diffs espurios en `document_version` y rompiendo los offsets de sección. CodeMirror preserva el texto exacto.

- Vista dividida (fuente ‖ previsualización) y vista de solo previsualización.
- Decoraciones en línea: encabezados, énfasis, enlaces y wikilinks resaltados sin ocultar la sintaxis.
- Autocompletado de `[[` (wikilinks), `@` (menciones), `#` (etiquetas), `QG-` (referencias).
- Pegado de imagen → subida automática → inserción de `![]()`.
- Tablas, listas de tareas, notas al pie, resaltado de código (Shiki), diagramas Mermaid, matemáticas (KaTeX).
- Modo "secciones": renderiza cada `document_section` como una tarjeta editable de forma independiente, alimentada por `PUT /documents/{id}/sections/{key}`.
- Modo enriquecido opcional (Milkdown) en fase posterior, siempre reversible a fuente.

Renderizado: `unified` + `remark-gfm` + `rehype-sanitize` en el cliente. En servidor, `goldmark` + `bluemonday` para exports HTML/PDF. Ambos pipelines comparten la misma lista blanca de etiquetas.

### 9.2 Vistas principales

| Vista | Descripción |
|-------|-------------|
| Espacio de trabajo | Panel de árbol (cuadernos/carpetas) + editor + panel de metadatos, al estilo de un gestor de notas |
| Bandeja de requerimientos | Tabla con filtros guardados, agrupación y edición en línea, al estilo Redmine |
| Tablero | Kanban al estilo Trello: columnas por estado, arrastrar y soltar, orden manual, carriles, límites WIP. Tablero por espacio y tablero general |
| Detalle de requerimiento | Markdown renderizado + metadatos + línea de tiempo unificada (comentarios, cambios, eventos de agente) |
| Cola de agentes | Requerimientos elegibles, con semáforo de Definition of Ready y reservas activas con su cuenta atrás |
| Actividad de agente | Sesiones, eventos, métricas de coste y tiempo |
| Búsqueda | Global, con facetas por tipo, espacio, estado y etiqueta |
| Grafo | Grafo de enlaces entre documentos y requerimientos |

### 9.3 Tablero

**Arrastrar y soltar:** `@dnd-kit` (accesible por teclado y compatible con lectores de pantalla; `react-beautiful-dnd` está sin mantenimiento). Cada tarjeta y cada columna es un destino con anuncio ARIA en vivo, y el movimiento es operable sin ratón: `espacio` para tomar, flechas para mover, `espacio` para soltar.

**Actualización optimista con reversión.** Al soltar, la interfaz reposiciona la tarjeta de inmediato y lanza `POST /requirements/{ref}/board-move`. Si la respuesta es `422` (transición ilegal) la tarjeta vuelve a su sitio con una explicación; si es `409` (columna con varios estados legales) se abre un selector.

**Cálculo de posición en cliente.** El navegador envía `prev_id` y `next_id` —los vecinos visibles tras el arrastre— y **no** un número de posición. El punto medio lo calcula la base de datos. Enviar la posición desde el cliente produce colisiones cuando dos personas arrastran a la vez sobre datos ligeramente distintos.

**Rendimiento.** Columnas virtualizadas (`@tanstack/react-virtual`) y carga incremental de 100 tarjetas por columna. La tarjeta se pinta desde `requirement_card_json()`, que no incluye `body_md`.

**Etiquetas.** Se muestran como franjas de color con nombre. Atajos `1`–`9` para alternar etiquetas sobre la tarjeta enfocada, como en Trello. Un conmutador global activa el modo de alto contraste, que añade patrones de trama al color.

**Miembros.** Avatares apilados en la tarjeta, con distintivo para los agentes y anillo de progreso en los que tienen una reserva activa. Añadir un miembro es un menú de un clic con búsqueda.

### 9.4 Tiempo real

`GET /events` (SSE) alimenta la invalidación de caché de TanStack Query. Eventos: `document.updated`, `requirement.transitioned`, `requirement.moved`, `requirement.members_changed`, `requirement.labels_changed`, `claim.acquired`, `claim.expired`, `journal.added`, `notification.created`.

`requirement.moved` lleva la nueva posición y columna, de modo que un tablero abierto en otra pantalla refleja el arrastre sin recargar. Los eventos originados por el propio cliente se descartan por `request_id` para no revertir su actualización optimista.

Concurrencia: bloqueo blando (`document.locked_by` con caducidad) + `If-Match` sobre la versión. Ante un 409 la UI ofrece un diff a tres vías. La edición colaborativa en tiempo real (CRDT) queda explícitamente fuera de alcance.

---

## 10. Seguridad

Se hereda [ARCHITECTURE.md §9](ARCHITECTURE.md) y se añade:

| Área | Medida |
|------|--------|
| **XSS en markdown** | El markdown lo escriben agentes y usuarios. Sanitizado obligatorio en **ambos** pipelines de render (cliente y servidor) con lista blanca. HTML embebido deshabilitado por defecto, activable por espacio. |
| **Inyección de prompt** | Delimitación de contenido no confiable en las respuestas MCP (§8.4). Los agentes no pueden cerrar requerimientos ni escalar permisos aunque el contenido se lo indique. |
| **SSRF** | El renderizado no resuelve recursos remotos. Las imágenes externas se proxifican o se bloquean según política del espacio. |
| **Adjuntos** | Detección de tipo por contenido (no por extensión), lista blanca configurable, `Content-Disposition: attachment`, servido desde un origen distinto o con `Content-Security-Policy: sandbox`. |
| **Alcance de tokens** | Scopes mínimos por defecto en DCR. Las API key muestran su secreto una sola vez y se almacenan hasheadas. |
| **Aislamiento de tenant** | Todas las funciones filtran por `qg.account_id`. Como defensa en profundidad, RLS sobre `document`, `requirement` y `journal` con política basada en `current_setting('qg.account_id')`. |
| **Rate limiting** | Por actor y por endpoint. Límites más estrictos en `/auth/login`, `/oauth/token` y las herramientas de escritura del MCP. |
| **Auditoría de agentes** | Toda escritura de un agente queda con `actor_type = 'agent'`, `actor_agent_id` y `agent_session_id`, y es visible en el journal. Nunca se atribuye a un humano. |
| **Secretos** | Solo desde entorno. `SECRET_KEY` ≥ 64 caracteres. Claves OAuth en par Ed25519 con JWKS publicado. |
| **CORS** | Lista explícita en producción, nunca `*`. |

---

## 11. Rendimiento y escalabilidad

**Objetivos** (self-hosting típico: 100 usuarios, 50 000 documentos, 10 agentes concurrentes)

| Operación | p95 |
|-----------|-----|
| `GET /documents/{id}` | < 50 ms |
| `GET /requirements` (25 filas, filtrada) | < 150 ms |
| `GET /search` | < 300 ms |
| `POST /agents/claims` | < 100 ms |
| `PUT /documents/{id}/body` (100 KB) | < 250 ms |

**Medidas**

- **API sin estado** → escalado horizontal detrás de un balanceador. La única goroutine con estado es el `LISTEN` de eventos: cada réplica mantiene la suya y sirve a sus propios clientes SSE.
- **Pool** `MinConns=5`, `MaxConns=20` por réplica. Con más de 4 réplicas, PgBouncer en modo *transaction* — compatible porque el contexto de actor es local a la transacción (AD-10).
- **Particionado** de `journal`, `agent_event` y `notification` por rango mensual sobre `created_at` cuando superen ~10 M de filas.
- **Retención** de `document_version` configurable; el worker consolida versiones antiguas.
- **Caché HTTP** con `ETag` = `W/"<version>-<sha256[0:8]>"` en documentos; `304` para lecturas repetidas de agentes, que releen mucho.
- **`ts_headline`** solo sobre las filas de la página devuelta, nunca sobre el conjunto filtrado.
- **`FOR UPDATE SKIP LOCKED`** en la cola de agentes: la contención no crece con el número de agentes.
- **Contadores desnormalizados** (`label.usage_count`, `space.ref_counter`, `requirement.spent_hours`, `requirement.member_count`, `requirement.lead_user_id`) mantenidos por trigger, siguiendo [ARCHITECTURE.md §4.5](ARCHITECTURE.md).
- **Tablero**: `idx_requirement_board` cubre `(space_id, status_id, board_position)`, de modo que pintar una columna es un barrido de índice ya ordenado, sin `sort` en memoria. Las columnas se paginan de forma independiente (100 tarjetas por columna) y `requirement_card_json()` excluye `body_md`.
- **Reordenamiento fraccionario**: arrastrar una tarjeta es un `UPDATE` de una fila, no una renumeración de la columna. `board_reindex()` solo se ejecuta cuando la precisión se agota.
- **Adjuntos** deduplicados por SHA-256 dentro de la cuenta.

---

## 12. Observabilidad

- **Logs**: `log/slog` en JSON, con `request_id`, `actor_type`, `actor_id`, `account_id` y `sqlstate` en cada línea relevante. El `request_id` viaja a la BD vía `qg.request_id` y se registra en el journal, permitiendo correlacionar un evento de negocio con su petición HTTP.
- **Métricas** Prometheus en `/metrics`: latencia y códigos por ruta, uso del pool, profundidad de la cola de agentes, reservas activas, reservas expiradas, tokens y coste por agente.
- **Trazas** OpenTelemetry opcional, con la llamada a la función SQL como span hijo.
- **Salud**: `/healthz` (proceso vivo), `/readyz` (pool conectado y esquema en la versión esperada).

---

## 13. Despliegue

```yaml
# deploy/docker-compose.yml (esquema)
services:
  db:
    image: postgres:16-alpine
    environment: [POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"] }

  api:
    image: quagenticus/api:latest
    depends_on: { db: { condition: service_healthy } }
    environment:
      QG_DATABASE_URL: postgresql://qg:***@db:5432/quagenticus
      QG_DB_SCHEMA: quagenticus
      QG_SECRET_KEY: ${QG_SECRET_KEY}
      QG_ALLOWED_ORIGINS: https://qg.ejemplo.com
      QG_STORAGE_BACKEND: fs           # fs | s3
      QG_STORAGE_PATH: /var/lib/quagenticus/attachments
    volumes: ["attachments:/var/lib/quagenticus/attachments"]
    ports: ["8080:8080"]

  mcp:
    image: quagenticus/mcp:latest
    environment:
      QG_API_BASE_URL: http://api:8080/api/v1
      QG_MCP_TRANSPORT: streamable-http
    ports: ["8081:8081"]

  worker:
    image: quagenticus/worker:latest
    environment: { QG_DATABASE_URL: ... }

volumes: { pgdata: {}, attachments: {} }
```

**Imágenes**: build multi-etapa con `golang:1.23-alpine` → `gcr.io/distroless/static`. La SPA se compila y se incrusta en el binario de la API con `embed.FS`, de modo que un despliegue mínimo son dos contenedores: `db` + `api`.

**Instalación del esquema**: se conserva el mecanismo de [ARCHITECTURE.md §4.8](ARCHITECTURE.md) — `file_order.conf` + `install_database.sh` + `Makefile`, idempotente. Se añade una tabla `schema_migration(version, applied_at, checksum)` y el comando `qgctl db migrate`, que aplica los `migration_*.sql` pendientes en orden y verifica checksums. `/readyz` falla si la versión del esquema no coincide con la que espera el binario.

**Variables de entorno mínimas en producción**

```env
QG_DATABASE_URL=postgresql://user:pass@host:5432/quagenticus
QG_DB_SCHEMA=quagenticus
QG_SECRET_KEY=<64+ caracteres aleatorios>
QG_OAUTH_PRIVATE_KEY=<Ed25519 PEM>
QG_ALLOWED_ORIGINS=https://qg.ejemplo.com
QG_PUBLIC_URL=https://qg.ejemplo.com
QG_STORAGE_BACKEND=fs
```

---

## 14. Estructura del repositorio

```
quagenticus/
├── cmd/
│   ├── quagenticus-api/main.go
│   ├── quagenticus-mcp/main.go
│   ├── quagenticus-worker/main.go
│   └── qgctl/main.go
├── internal/
│   ├── config/          config.go
│   ├── db/              db.go · actor.go
│   ├── auth/            jwt.go · apikey.go · oauth/ · actor.go
│   ├── httpx/           errors.go · json.go · pagination.go · middleware.go
│   ├── models/          document.go · requirement.go · agent.go · …
│   ├── handlers/        documents.go · requirements.go · agents.go · search.go · …
│   ├── markdown/        render.go · sanitize.go · export.go
│   ├── storage/         fs.go · s3.go
│   ├── events/          listener.go · sse.go
│   └── mcp/             server.go · tools.go · resources.go · prompts.go
├── db/                                  ← esquema PostgreSQL (ARCHITECTURE.md §4.2)
│   ├── file_order.conf
│   ├── install_database.sh
│   ├── Makefile
│   ├── common.sql
│   ├── md/              md_functions.sql
│   ├── account/         account_data_structure.sql · account_functions.sql
│   ├── app_user/
│   ├── space/
│   ├── document/        document_data_structure.sql · document_functions.sql
│   │                    document_section_functions.sql · document_link_functions.sql
│   ├── label/           label_data_structure.sql · label_functions.sql
│   ├── requirement/     requirement_data_structure.sql · requirement_functions.sql
│   │                    requirement_workflow_functions.sql
│   │                    requirement_readiness_functions.sql
│   │                    requirement_member_functions.sql
│   │                    category_data_structure.sql · category_functions.sql
│   ├── board/           board_data_structure.sql · board_functions.sql
│   │                    board_position_functions.sql
│   ├── journal/
│   ├── agent/           agent_data_structure.sql · agent_functions.sql
│   │                    agent_claim_functions.sql
│   ├── attachment/
│   ├── notification/
│   ├── search/          search_functions.sql
│   ├── auth/            api_key_*.sql · oauth_*.sql
│   ├── triggers/
│   ├── audit_data_structure.sql
│   ├── init_system.sql
│   └── migrations/
├── web/                                 ← SPA React
│   ├── src/{components,routes,api,editor,stores}
│   └── vite.config.ts
├── deploy/              docker-compose.yml · Dockerfile.* · nginx.conf
├── docs/                quagenticus.md · ARCHITECTURE.md · TECHNICAL-SPEC.md
│                        api/openapi.yaml · mcp/tools.md
└── test/                integration/ · sql/ (pgTAP)
```

**Pruebas**

| Nivel | Herramienta | Cobertura |
|-------|-------------|-----------|
| Funciones SQL | **pgTAP** | Reglas de negocio: transiciones, readiness, claims concurrentes, parseo de secciones. Es donde vive la lógica, así que es donde debe estar el grueso de las pruebas. |
| API | `net/http/httptest` + `testcontainers-go` (Postgres real) | Contratos HTTP, códigos de estado, permisos |
| MCP | Cliente MCP de pruebas contra API efímera | Esquemas de herramientas y flujos de reserva |
| Frontend | Vitest + Playwright | Editor, sincronización de secciones, tablero |

Caso de prueba obligatorio: **N agentes reclamando concurrentemente sobre M requerimientos disponibles** → cada requerimiento se entrega exactamente una vez, sin bloqueos ni duplicados.

---

## 15. Roadmap por fases

| Fase | Alcance | Entregable |
|------|---------|------------|
| **F0 — Cimientos** | `install_database.sh`, cuentas, usuarios, espacios, JWT, esqueleto Go, CI | API que autentica y sirve espacios |
| **F1 — Marknote** | `document`, secciones, versiones, enlaces, **etiquetas de color**, adjuntos, búsqueda FTS, editor CodeMirror, árbol, import/export | Gestor de documentos markdown usable de forma autónoma |
| **F2 — Redmine** | `requirement`, trackers, estados, workflow, prioridades, categorías, **miembros múltiples**, journal, seguidores, filtros guardados, notificaciones | Sistema de gestión de requerimientos completo |
| **F2b — Trello** | `board`, `board_column`, `board_position`, arrastrar y soltar, carriles, límites WIP, tablero general | Vista de tablero sobre lo construido en F2 |
| **F3 — Agentes** | `agent`, cola, claims con arrendamiento, `readiness`, eventos de agente, API keys con scopes, vista de cola | Requerimientos reservables por integraciones M2M |
| **F4 — MCP** | OAuth 2.1 + DCR, `quagenticus-mcp` con herramientas, recursos y prompts, documentación de integración | Un agente se conecta, reserva, resuelve y reporta |
| **F5 — Madurez** | Campos personalizados, imputación de horas, informes, `pgvector` para similitud, webhooks salientes, SSO/OIDC, cliente de escritorio | Producto completo |

F1 y F2 son independientes tras F0 y pueden desarrollarse en paralelo. F2b depende de F2. F3 depende de F2 (no de F2b). F4 depende de F3.

Las etiquetas de color se construyen en F1, no en F2, porque cuelgan de `document` y sirven igual a notas y requerimientos. Cuando llega el tablero ya existen.

---

## 16. Decisiones abiertas

| # | Cuestión | Opciones | Recomendación |
|---|----------|----------|---------------|
| Q1 | ¿Un usuario puede pertenecer a varias cuentas? | `app_user.account_id` fijo (como ARCHITECTURE.md) vs. tabla `account_member` | Empezar con `account_id` fijo; migrar a `account_member` es aditivo si aparece la necesidad |
| Q2 | Idioma de la configuración FTS | Fijo `'spanish'` en columna generada vs. `account.fts_config` por trigger | Fijo en F1; parametrizar en F5 si hay cuentas multilingües |
| Q3 | ¿Los agentes pueden cerrar requerimientos? | Sí / solo hasta `resolved` | Solo hasta `resolved`. La aceptación es del solicitante — coherente con "human driven" |
| Q4 | Integración con Git/PR | Enlaces manuales vs. webhooks entrantes de GitHub/GitLab | Enlaces manuales en F4 (`qg_link_create`); webhooks entrantes en F5 |
| Q5 | Edición colaborativa simultánea | Bloqueo blando + versiones vs. CRDT (Yjs) | Bloqueo blando. CRDT es un proyecto en sí mismo y choca con `document_version` |
| Q6 | `pgvector` para similitud semántica | F5 vs. nunca | F5, opcional. La FTS léxica cubre bien el caso base y evita la dependencia de un proveedor de embeddings |
| Q7 | ¿MCP contra la API o contra la BD? | REST (AD-8) vs. `pgxpool` directo | REST. Si la latencia resultara un problema real, el cambio queda confinado a `internal/mcp/` |
| Q8 | Nombre de la entidad de agrupación | `space` vs. `project` vs. `workspace` | `space`: neutral entre "proyecto" (Redmine) y "cuaderno" (Marknote), que es exactamente la ambigüedad que el modelo unificado busca |
| Q9 | Color de etiqueta: ¿paleta cerrada o hexadecimal libre? | 15 tokens vs. color arbitrario | Paleta cerrada. Garantiza contraste en tema claro y oscuro sin depender del criterio de quien crea la etiqueta. Si se pide libertad total, añadir `custom_hex` como excepción validada por contraste, no sustituir los tokens |
| Q10 | ¿Orden de tablero único o por tablero? | `requirement.board_position` vs. tabla `board_card_position` | Único. Dos órdenes distintos para la misma tarjeta obligan a decidir cuál manda al mirar el tablero general, y no hay respuesta buena. Si aparece la necesidad real, la tabla por tablero es aditiva: `COALESCE(bcp.position, r.board_position)` |
| Q11 | ¿Responsable principal obligatorio? | Sí vs. opcional vs. inexistente | Opcional. Trello no lo tiene y funciona; un gestor de requerimientos sin nadie señalado diluye la responsabilidad y deja las notificaciones de vencimiento sin destinatario. Opcional cubre ambos usos |
| Q12 | ¿Puede un agente reordenar el tablero? | Sí vs. solo cambiar de columna | Solo columna. El orden manual es priorización humana; un agente que se coloca primero en la fila invierte la relación de control |
