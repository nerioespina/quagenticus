# Quagenticus — Plan de afinamiento de la aplicación

> **Qué es este documento.** Es el backlog priorizado para afinar la aplicación después de las fases 1–5 del [ROADMAP](ROADMAP.md). La **Parte A** atiende los 10 puntos solicitados. La **Parte B** reúne los hallazgos de una revisión completa del proyecto (backend Go, base de datos y SPA React). La **Parte C** propone un orden de ejecución.
>
> **Fecha de la revisión:** 2026-09-13 · **Commit base:** `5e11483`

## Estado de implementación (2026-09-13)

Implementado sobre el commit base `5e11483` y verificado con: instalación limpia y actualización de un esquema anterior con datos (`db/install_database.sh`), pruebas SQL (`db/tests/smoke_test.sql`), pruebas Go de integración (`cmd/quagenticus-api/main_test.go`), pruebas unitarias del frontend (Vitest), `tsc`, `oxlint`, `vite build` y un recorrido real en Chrome (login, tablero, creación, panel rápido, comentarios con referencias y menciones, arrastre, historial, documentos, paleta, notificaciones, administración).

| Punto | Estado | Notas |
|---|---|---|
| F-1 Markdown único | ✅ | `components/markdown/Markdown.tsx` (GFM, sanitizado, chips de referencias, imágenes firmadas). |
| F-2 Referencias y autocompletado | ✅ | Gramática espejo en `md_functions.sql` y `lib/refs.ts`; `#`, `@123`, `[[`, `@persona` en textarea y CodeMirror; modal «Insertar referencia». |
| F-3 Adjuntos | ✅ | Staging, streaming con límite, detección de tipo, URLs firmadas, descarga forzada de tipos peligrosos, purga en worker. |
| F-4 Journal tipado | ✅ | `kind`, hilos, edición/borrado lógico; todos los cambios quedan en el historial. |
| F-5 Notificaciones | ✅ | Tablas, fan-out, campana, SSE, recordatorios de vencimiento y correo opcional (SMTP sin probar contra un servidor real). |
| F-6 React Query y errores | ✅ | `lib/queryKeys.ts`, toasts, refresh automático de sesión, ErrorBoundary. |
| A-1 … A-10 | ✅ | Todos implementados como se describe en cada punto. |
| B-1 Seguridad | ✅ | Guarda de rol por ruta (alternativa a RLS prevista en el plan), admin de cuenta, `ref_key` por cuenta, JWT HS256 + refresh httpOnly, rate limit, CORS explícito, cabeceras. |
| B-2 Bugs | ✅ | Todos los listados corregidos; además `md_split_sections` fallaba con un encabezado al final sin salto de línea. |
| B-3 Requerimientos | 🟡 | Hecho: filtros, orden, paginación, vistas guardadas, columnas, acciones masivas, Mi trabajo, plantilla, DoR real, bloqueo por versión, clonar/mover/archivar, resolución, registro de tiempo, recordatorios. Pendiente: avance automático desde sub-requerimientos y badge de bloqueos en tarjeta. |
| B-4 Documentos | 🟡 | Hecho: carpetas, tipos, versiones con diff y restauración, autoguardado, conflictos, archivado, etiquetas, índice, promover a requerimiento, favoritos, exportar `.md`. Pendiente: exportar/importar espacio completo y reescribir wikilinks entrantes al renombrar. |
| B-5 Búsqueda y navegación | ✅ | Búsqueda FTS con resaltado, paleta Ctrl/⌘+K, selector de espacio, sidebar colapsable y móvil, rutas diferidas, ayuda de atajos. |
| B-6 Administración | 🟡 | Hecho: configuración de espacio, usuarios, estados, tipos, prioridades, matriz de transiciones, agentes, perfil, hitos con progreso. Pendiente: auditoría de acciones administrativas e invitación por correo; la plantilla de un tipo se asigna por id. |
| B-7 Tiempo real | 🟡 | Hecho: SSE con invalidación de cachés. Pendiente: presencia («Ana está editando») y bloqueo blando. |
| B-8 Rendimiento/arquitectura | 🟡 | Hecho: vista `v_requirement`, proyección JSON en BD, timeouts, límite de cuerpo, code-splitting. Pendiente: métricas Prometheus y logging estructurado de peticiones. |
| B-9 Accesibilidad e idioma | 🟡 | Hecho: modales accesibles, foco visible, `aria-label`, confirmaciones con deshacer, fechas con `Intl`, etiquetas centralizadas en `lib/i18n.ts`. Pendiente: traducción completa de la UI. |
| B-10 Agentes | ✅ | API keys, cola real con `SKIP LOCKED`, leases, expiración en worker, `context.md`, servidor MCP con 14 herramientas. |
| B-11 Calidad | 🟡 | Hecho: pruebas SQL, Go e integración, Vitest, CI, migraciones versionadas, binario fuera del repositorio. Pendiente: suite E2E versionada en el repositorio (se ejecutó ad hoc con Playwright). |

## Convenciones

- **Prioridad:** `P0` bloquea el uso real o expone datos · `P1` afecta a la experiencia central · `P2` mejora relevante · `P3` deseable.
- **Esfuerzo:** `S` ≤ 1 día · `M` 2–4 días · `L` 1–2 semanas.
- Cada punto trae **Diagnóstico** (lo que hay hoy, con enlaces al código), **Propuesta**, **TODO** (casillas marcables) y **Criterios de aceptación**.
- Las rutas son relativas a este archivo (`docs/`).
- **Sintaxis de referencias** usada en todo el documento (se define en [F-2](#f-2-parser-de-referencias-y-autocompletado)):
  - `#123` o `#DEMO-123` → requerimiento (también `@123`, tal como se pidió).
  - `[[Título del documento]]` o `[[slug|alias]]` → documento del espacio (wikilink, ya previsto en la especificación técnica).
  - `@usuario` → mención a una persona (genera notificación).

---

## Índice

- [Fundamentos transversales (prerrequisitos)](#fundamentos-transversales-prerrequisitos)
  - [F-1 Renderizador Markdown único](#f-1-renderizador-markdown-único)
  - [F-2 Parser de referencias y autocompletado](#f-2-parser-de-referencias-y-autocompletado)
  - [F-3 Servicio de adjuntos genérico](#f-3-servicio-de-adjuntos-genérico)
  - [F-4 Journal tipado (comentarios, cambios, eventos)](#f-4-journal-tipado-comentarios-cambios-eventos)
  - [F-5 Notificaciones y seguidores](#f-5-notificaciones-y-seguidores)
  - [F-6 Higiene de React Query y feedback de errores](#f-6-higiene-de-react-query-y-feedback-de-errores)
- [Parte A — Los 10 puntos solicitados](#parte-a--los-10-puntos-solicitados)
- [Parte B — Hallazgos de la revisión completa](#parte-b--hallazgos-de-la-revisión-completa)
- [Parte C — Orden de ejecución sugerido](#parte-c--orden-de-ejecución-sugerido)

## Resumen

| # | Punto | Prioridad | Esfuerzo | Depende de |
|---|---|---|---|---|
| A-1 | Comentarios separados del historial | P1 | M | F-1, F-4 |
| A-2 | Adjuntos en comentarios | P1 | M | F-3, F-4 |
| A-3 | Referencias `#123` / `[[doc]]` en comentarios | P1 | M | F-1, F-2 |
| A-4 | Tablero con una columna por estado | P0 | S–M | — |
| A-5 | Rendimiento del tablero y del drag & drop | P1 | M | A-4 |
| A-6 | Control de miembros (desbordamiento, multiasignación, notificaciones) | P0 | M | F-5 |
| A-7 | Diálogo de creación completo | P1 | M | F-2, F-3, A-6 |
| A-8 | Referencias en documentos | P1 | M | F-1, F-2 |
| A-9 | Adjuntos en documentos | P1 | S | F-3 |
| A-10 | Edición rápida desde el tablero | P1 | M | A-5, A-6 |
| B-1 | Autorización y aislamiento entre cuentas | **P0** | L | — |
| B-2 | Bugs funcionales detectados | **P0/P1** | M | — |
| B-3…B-10 | UX, documentos, administración, rendimiento, a11y, agentes, calidad | P1–P3 | — | — |

---

# Fundamentos transversales (prerrequisitos)

Varios de los 10 puntos comparten piezas. Construirlas primero evita implementar tres veces lo mismo.

## F-1 Renderizador Markdown único

**Diagnóstico.** Existen **tres copias** de un `MarkdownPreview` que interpreta línea a línea solo `#`, `-` y `- [ ]`: [RequirementDetail.tsx:43](../web/src/pages/RequirementDetail.tsx#L43), [CommentSection.tsx:9](../web/src/components/CommentSection.tsx#L9) y [DocumentEditor.tsx:11](../web/src/pages/DocumentEditor.tsx#L11). No se muestran negritas, enlaces, código, tablas, citas ni imágenes, aunque la barra de herramientas ([MarkdownToolbar.tsx](../web/src/components/MarkdownToolbar.tsx)) sí los inserta. Para un producto cuyo principio nº 1 es *"el markdown es la fuente de verdad"*, este es el hueco más visible.

**Propuesta.** Un componente `<Markdown>` compartido basado en `react-markdown` + `remark-gfm` + `rehype-sanitize`, con un plugin remark propio que convierta referencias (F-2) en enlaces enriquecidos.

**TODO**
- [ ] Añadir dependencias `react-markdown`, `remark-gfm`, `rehype-sanitize` (y `rehype-highlight` o `shiki` para código, opcional).
- [ ] Crear `web/src/components/markdown/Markdown.tsx` con estilos tipográficos en tokens CSS (`--text-*`), en tema claro y oscuro.
- [ ] Plugin `remarkQuagenticusRefs`: transforma `#123`, `#DEMO-123`, `@123`, `[[...]]` y `@usuario` en nodos `link` con `data-ref-type`.
- [ ] Componente `<RefLink>` que muestra *chip* con ref, título y estado (tooltip/hover card con datos cacheados por React Query).
- [ ] Las imágenes con `src` interno (`/api/v1/attachments/...`) usan URL firmada (ver F-3).
- [ ] Checkboxes GFM interactivos opcionales (clic → `PATCH` del cuerpo) — P3.
- [ ] Reemplazar las tres copias de `MarkdownPreview` y eliminarlas.

**Criterios de aceptación.** Negrita, cursiva, enlaces, listas anidadas, tablas, bloques de código, citas e imágenes se ven igual en requerimiento, comentario y documento. HTML crudo en el markdown no se ejecuta (XSS).

## F-2 Parser de referencias y autocompletado

**Diagnóstico.** Ya existen `md_extract_wikilinks` y `md_extract_refs` en [md_functions.sql](../db/md/md_functions.sql#L96), pero nadie los usa. `md_extract_refs` exige el formato `DEMO-123`; no reconoce `#123` relativo al espacio. No hay autocompletado en ningún editor.

**Propuesta.**
1. **Gramática única** compartida por backend y frontend:
   - Requerimiento: `#<n>` (espacio actual), `#<KEY>-<n>` (cualquier espacio de la cuenta), `@<n>` (alias pedido; los nombres de usuario no pueden empezar por dígito, así que no hay ambigüedad).
   - Documento: `[[título]]`, `[[slug]]`, `[[título|alias]]`.
   - Usuario: `@<handle>` (añadir `app_user.handle` único por cuenta, derivado del correo).
   - Se ignoran bloques de código y código inline.
2. **Resolución en BD** (fuente de verdad para agentes): función `md_resolve_refs(space_id, body)` → filas `(kind, raw, target_id)`.
3. **Endpoint de sugerencias** `GET /spaces/{id}/suggest?q=&types=requirement,document,user` con trigram (`idx_document_title_trgm` ya existe) + coincidencia exacta por número.
4. **Componente de autocompletado** reutilizable para `<textarea>` y para CodeMirror.

**TODO**
- [ ] DB: ampliar `md_extract_refs` para `#n`, `@n` y `#KEY-n`; crear `md_extract_mentions` (usuarios).
- [ ] DB: `app_user.handle citext` + índice único `(account_id, handle)` + backfill desde el correo.
- [ ] DB: función `search_suggest(p_space_id, p_query, p_types text[], p_limit int)`.
- [ ] API: `GET /spaces/{spaceId}/suggest` y `GET /spaces/{spaceId}/refs/resolve?keys=12,15,DEMO-7` (resolución en lote para renderizar chips).
- [ ] Web: `lib/refs.ts` con la gramática (mismas expresiones regulares que en SQL, con tests).
- [ ] Web: `components/editor/RefAutocomplete.tsx` para textarea (disparadores `#`, `@`, `[[`), navegable con teclado (↑ ↓ Enter Esc), con ref, título, tipo y estado.
- [ ] Web: extensión `@codemirror/autocomplete` con la misma fuente de datos para [DocumentEditor.tsx](../web/src/pages/DocumentEditor.tsx).
- [ ] Web: botón **"Insertar referencia"** en `MarkdownToolbar` que abre un buscador modal (tipo paleta) con pestañas *Requerimientos / Documentos* — responde al "insertar un documento del panel de documentos con buscador".

**Criterios de aceptación.** Escribir `#1` muestra sugerencias en menos de 150 ms (debounce 120 ms); Enter inserta `#DEMO-12`; el texto guardado se renderiza como enlace navegable; una referencia a un elemento inexistente se muestra tachada con tooltip "no encontrado".

## F-3 Servicio de adjuntos genérico

**Diagnóstico.**
- La tabla `attachment` ya es genérica (`document_id` o `journal_id`) — [attachment_data_structure.sql](../db/attachment/attachment_data_structure.sql) — pero las rutas solo existen bajo `/requirements/{id}/attachments` ([main.go:130](../cmd/quagenticus-api/main.go#L130)) y `journal_id` no tiene FK.
- **La descarga no funciona desde la UI:** el enlace es un `<a href>` plano ([RequirementAttachments.tsx:222](../web/src/components/RequirementAttachments.tsx#L222)) que no envía el `Authorization: Bearer`, y `RequireAuth` responde 401. Además ignora `VITE_API_URL`.
- La subida lee el archivo entero en memoria (`io.ReadAll`), no usa `http.MaxBytesReader`, confía en el `Content-Type` del cliente y sirve todo `inline` desde el mismo origen → un `.html` o `.svg` subido es **XSS almacenado** ([attachments.go:70-175](../internal/handlers/attachments.go#L70)).
- `Content-Disposition` interpola el nombre sin escapar; `Download` y `Delete` no validan cuenta ni permisos.
- `FileDropZone` solo acepta el primer archivo ([FileDropZone.tsx:31](../web/src/components/FileDropZone.tsx#L31)).

**Propuesta.** Un único módulo de adjuntos con subida en *staging*, límites configurables, descarga con URL firmada de corta duración y componentes de UI reutilizables.

**TODO — backend**
- [ ] Config: `QG_UPLOAD_MAX_MB` (p. ej. 25), `QG_UPLOAD_MAX_FILES` (p. ej. 10 por comentario), `QG_UPLOAD_ALLOWED_MIME` (lista blanca opcional).
- [ ] DB: FK `attachment.journal_id → journal(id) ON DELETE CASCADE`; columnas `status text CHECK (status IN ('staged','attached'))` y `staged_by uuid`.
- [ ] API: `POST /spaces/{spaceId}/uploads` (multipart, varios archivos) → crea adjuntos `staged` ligados al documento destino; devuelve ids.
- [ ] API: rutas genéricas `GET/POST/DELETE /documents/{id}/attachments` (los requerimientos son documentos: mantener las rutas `/requirements/...` como alias).
- [ ] Streaming a disco con `io.TeeReader` + SHA-256 incremental, `http.MaxBytesReader`, detección real de tipo con `http.DetectContentType`.
- [ ] Descarga: `GET /attachments/{id}/url` → URL firmada HMAC con expiración (5–15 min) `GET /files/{id}?exp=&sig=` que no requiere cabecera (sirve para `<img src>` en markdown).
- [ ] Servir con `X-Content-Type-Options: nosniff`; `inline` solo para imágenes rasterizadas y PDF; resto `attachment`. Nombre con `mime.FormatMediaType`.
- [ ] Worker: purga de adjuntos `staged` con más de 24 h.
- [ ] Deduplicación opcional por `sha256` (el índice ya existe).

**TODO — frontend**
- [ ] `hooks/useAttachments.ts` parametrizado por `documentId`/`journalId`.
- [ ] `components/attachments/AttachmentUploader.tsx`: multiarchivo, barra de progreso (`XMLHttpRequest` o `fetch` + `ReadableStream`), validación previa de tamaño con mensaje claro, cancelar.
- [ ] `components/attachments/AttachmentList.tsx`: miniaturas de imágenes, icono por tipo, tamaño legible (KB/MB), autor y fecha, confirmación al borrar.
- [ ] Visor (lightbox) para imágenes y PDF.
- [ ] Pegar imagen desde el portapapeles y soltar archivos sobre textareas/CodeMirror → sube e inserta `![nombre](attachment:ID)`.

**Criterios de aceptación.** Un archivo de 30 MB se rechaza con mensaje antes de enviarse; un `.html` se descarga en lugar de renderizarse; descargar funciona con un clic; una imagen pegada en un comentario aparece en la vista previa.

## F-4 Journal tipado (comentarios, cambios, eventos)

**Diagnóstico.**
- La especificación define `journal.kind` (`comment | change | agent_event | system`) y `reply_to_id` ([TECHNICAL-SPEC.md:1493](TECHNICAL-SPEC.md)), pero la tabla real no los tiene ([journal_data_structure.sql](../db/journal/journal_data_structure.sql)).
- Solo se registran cambios de estado ([requirement_functions.sql:144](../db/requirement/requirement_functions.sql#L144)). Cambios de título, descripción, prioridad, categoría, hito, fechas, miembros, etiquetas, adjuntos y enlaces **no dejan rastro**, lo que contradice el principio *"Nada se pierde"*.
- Los comentarios no se pueden editar ni borrar.

**TODO**
- [ ] DB: `CREATE TYPE journal_kind`; columnas `kind`, `reply_to_id`, `edited_at`, `deleted_at`; migrar filas existentes (`notes_md` no vacío y `details = '[]'` → `comment`, resto → `change`).
- [ ] DB: funciones `journal_add(document_id, kind, notes_md, reply_to_id)` y `journal_detail_add(...)` (ya previstas en la spec) y usarlas desde `requirement_update`, `requirement_transition`, miembros, etiquetas, adjuntos y enlaces. Registrar `from`/`to` por atributo.
- [ ] API: `GET /requirements/{id}/journals?kind=comment|change` con paginación por cursor (`before=<created_at,id>`).
- [ ] API: `PATCH /journals/{id}` (solo autor, ventana de edición configurable) y `DELETE /journals/{id}` (borrado lógico que conserva "comentario eliminado").
- [ ] API: `Create` dentro de `WithActor`, validando que el actor pertenece al espacio ([journals.go:63](../internal/handlers/journals.go#L63) hoy no lo hace).

## F-5 Notificaciones y seguidores

**Diagnóstico.** La spec define `notification`, `watcher` y `notification_fanout()` ([TECHNICAL-SPEC.md:1821](TECHNICAL-SPEC.md)); nada está implementado. Es condición para el punto 6 ("los miembros reciben notificaciones como en Trello") y para las menciones.

**TODO**
- [ ] DB: tablas `notification` y `watcher` según la spec; `notification_fanout(document_id, event_type, payload, exclude_actor)`.
- [ ] Reglas de destinatarios: miembros + lead + reporter + seguidores + mencionados (`@usuario`), sin notificar al propio actor.
- [ ] Eventos: `member_added`, `mentioned`, `commented`, `status_changed`, `due_soon`, `due_overdue`, `attachment_added`, `assigned_lead`.
- [ ] Al añadir un miembro, se convierte en seguidor automáticamente; botón "Seguir / Dejar de seguir" en el detalle.
- [ ] API: `GET /notifications?unread=true`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `GET /notifications/count`.
- [ ] Web: campana con contador en `SpaceLayout`, panel desplegable agrupado por requerimiento, enlace directo al comentario (`#comment-<id>`).
- [ ] Tiempo real: `LISTEN qg_events` → SSE `GET /events` (spec §AD-2); mientras tanto, *polling* del contador cada 60 s.
- [ ] Worker: correo diario/inmediato según `app_user.preferences.notifications` (P2).

## F-6 Higiene de React Query y feedback de errores

**Diagnóstico.**
- Las claves colisionan: el listado usa `['requirements', spaceId, filters]` y los sub-recursos `['requirements', reqId, 'members' | 'labels' | 'journals' | 'attachments' | 'children']`. Cada `invalidateQueries({ queryKey: ['requirements'] })` ([useRequirements.ts:75](../web/src/hooks/useRequirements.ts#L75)) **refetchea todos los sub-recursos de todos los requerimientos en caché**.
- `useSpaceMembers` está duplicado con claves distintas: [useMembers.ts:12](../web/src/hooks/useMembers.ts#L12) (`['spaces', id, 'members']`) y [useSpaceMembers.ts:5](../web/src/hooks/useSpaceMembers.ts#L5) (`['space-members', id]`); añadir un miembro al espacio no refresca el selector del requerimiento.
- Ninguna mutación tiene `onError`: los fallos son silenciosos o producen promesas rechazadas sin capturar (`await mutateAsync` en [Board.tsx:251](../web/src/pages/Board.tsx#L251)).

**TODO**
- [ ] `lib/queryKeys.ts` con fábrica jerárquica: `qk.space(id).requirements(filters)`, `qk.requirement(id).members()`, `qk.board(spaceId, boardId)`, etc.
- [ ] Unificar `useSpaceMembers` en un solo hook.
- [ ] Sistema de *toasts* (p. ej. `sonner`) + `MutationCache.onError` global que muestre `ApiError.message`.
- [ ] Interceptar 401 en `lib/api.ts` → logout y redirección a `/login?next=`.
- [ ] `ErrorBoundary` por ruta con opción de reintentar.

---

# Parte A — Los 10 puntos solicitados

## A-1 Comentarios separados del historial

`P1 · M · depende de F-1, F-4`

**Diagnóstico.** [CommentSection.tsx:157](../web/src/components/CommentSection.tsx#L157) mezcla en una sola lista los cambios de estado (`details.type = 'status_changed'`) y los comentarios; el encabezado dice "Comentarios y Actividad". Como el backend no distingue tipos ([journals.go:30](../internal/handlers/journals.go#L30)), el frontend lo infiere por la presencia de `notes_md`, y un cambio de estado con comentario aparece duplicado en ambos sentidos. No hay hilos, ni edición, ni enlace permanente a un comentario. El formulario está **encima** de la lista ordenada ascendentemente, así que el último comentario queda lejos del cuadro de respuesta.

**Propuesta.**
- Pestaña **Comentarios**: solo `kind = comment`, con hilos de un nivel (respuestas a un comentario raíz, como GitHub/Jira), orden cronológico, formulario al final (o arriba con orden inverso, configurable) y contador en la pestaña.
- Pestaña **Historial**: `kind IN (change, agent_event, system)` como línea de tiempo compacta: "Ana cambió la prioridad de *Normal* a *Alta* · hace 2 h". Cambios consecutivos del mismo actor en < 2 min se agrupan.
- Filtro opcional "Todo" para quien quiera ver ambas cosas intercaladas.

**TODO**
- [ ] Backend según F-4 (`kind`, `reply_to_id`, filtros, edición/borrado).
- [ ] Web: dividir `CommentSection.tsx` en `comments/CommentThread.tsx`, `comments/CommentItem.tsx`, `comments/CommentComposer.tsx` y `history/ActivityTimeline.tsx`.
- [ ] Web: `RequirementDetail` con pestañas *Descripción · Comentarios (n) · Historial · Documentos y archivos (n) · Sub-requerimientos (n)*.
- [ ] Web: botón "Responder" que abre el compositor anidado; "Editar" y "Eliminar" para el autor; marca "(editado)".
- [ ] Web: ancla `#comment-<id>` con scroll y resaltado temporal; "Copiar enlace".
- [ ] Web: línea de tiempo con verbos legibles por atributo (`title`, `body_md` con "ver diferencias", `priority_id`, `category_id`, `milestone_id`, `due_date`, miembros, etiquetas, adjuntos, enlaces) resolviendo ids con los catálogos cacheados.
- [ ] Web: fechas relativas ("hace 5 min") con fecha absoluta en tooltip.
- [ ] Web: distinguir visualmente actor humano, agente (icono de bot) y sistema.
- [ ] Web: `Ctrl/⌘ + Enter` envía el comentario; borrador persistido en `sessionStorage` por requerimiento.

**Criterios de aceptación.** Un cambio de estado nunca aparece en la pestaña Comentarios; una respuesta queda visualmente anidada bajo su comentario; el historial muestra también cambios de prioridad, miembros y etiquetas.

## A-2 Adjuntos en comentarios

`P1 · M · depende de F-3, F-4`

**Diagnóstico.** El compositor de comentarios solo tiene textarea. `attachment.journal_id` existe pero no se usa.

**Propuesta.** El compositor tiene un botón de clip y acepta arrastrar/pegar. Los archivos se suben en *staging* mientras se escribe; al publicar, el comentario los adopta en la misma transacción. Las imágenes pueden quedar incrustadas en el texto; el resto se muestra como lista de adjuntos bajo el comentario.

**TODO**
- [ ] API: `POST /requirements/{id}/journals` acepta `attachment_ids: uuid[]`; en la transacción, `UPDATE attachment SET journal_id = $j, status = 'attached' WHERE id = ANY($ids) AND staged_by = actor AND status = 'staged'`.
- [ ] API: validar el límite de archivos por comentario y el tamaño total (p. ej. 50 MB).
- [ ] API: incluir `attachments[]` en la respuesta de `GET /journals`.
- [ ] Web: `CommentComposer` integra `AttachmentUploader` en modo compacto (chips con progreso y ✕).
- [ ] Web: pegar imagen → sube e inserta `![captura](attachment:ID)` en el cursor.
- [ ] Web: `CommentItem` muestra miniaturas y lista de archivos; clic abre el visor.
- [ ] Web: la pestaña *Documentos y archivos* lista también los adjuntos de comentarios, con filtro "Del requerimiento / De comentarios" y enlace al comentario de origen.
- [ ] Web: mostrar el límite ("Máx. 25 MB por archivo, 10 archivos") junto al botón.
- [ ] Borrar un comentario → borrado lógico; los adjuntos quedan ocultos pero auditables (o se eliminan si así se configura).

**Criterios de aceptación.** Se puede publicar un comentario con 3 capturas y un PDF; si un archivo supera el límite, el resto se sube y el comentario puede publicarse; al recargar, los adjuntos siguen asociados al comentario correcto.

## A-3 Referencias en comentarios (`#123`, `@123`, `[[documento]]`)

`P1 · M · depende de F-1, F-2`

**Diagnóstico.** No existe detección ni renderizado de referencias; tampoco un buscador para insertar documentos desde el compositor. Los `document_link` solo se crean a mano desde [LinkDocumentModal.tsx](../web/src/components/LinkDocumentModal.tsx).

**Propuesta.**
- Al escribir `#`/`@`+dígito o `[[`, aparece el autocompletado de F-2.
- Botón **"Insertar referencia"** en la barra: modal con buscador, pestañas *Requerimientos / Documentos* y vista previa; al elegir inserta `#DEMO-123` o `[[Título]]`.
- Al guardar un comentario, el backend resuelve las referencias y crea enlaces derivados `mentions` desde el requerimiento hacia el destino. Así el destino muestra *"Mencionado en DEMO-45 (comentario de Ana)"* en su panel de backlinks.
- Menciones `@usuario` notifican (F-5).

**TODO**
- [ ] DB: `document_link.source_journal_id uuid NULL REFERENCES journal(id) ON DELETE CASCADE` para saber que la mención vino de un comentario.
- [ ] DB: trigger `AFTER INSERT OR UPDATE OF notes_md ON journal` → reconstruye enlaces `is_derived = true, link_type = 'mentions'` de ese comentario.
- [ ] Web: `CommentComposer` usa `RefAutocomplete` y el botón "Insertar referencia".
- [ ] Web: `CommentItem` renderiza con `<Markdown>` (chips `RefLink` con estado del requerimiento y hover card).
- [ ] Web: panel **"Referenciado desde"** (backlinks) en la pestaña *Documentos y archivos* del destino, separando enlaces manuales y menciones.
- [ ] Tests: gramática en SQL (pgTAP) y en TS con los mismos casos (código inline, bloques de código, `email@dominio`, `#123abc`, URLs con `#ancla`).

**Criterios de aceptación.** Escribir "ver #12" y publicar produce un enlace a DEMO-12; en DEMO-12 aparece el backlink; `[[Glosario]]` abre el documento; un `#12` dentro de un bloque de código no se convierte.

## A-4 Tablero: tantas columnas como estados

`P0 · S–M`

**Diagnóstico.**
- Las columnas son filas estáticas de `board_column`; el seed solo crea 5 de los 7 estados (faltan **Triado** y **Cerrado**) — [init_system.sql:102](../db/init_system.sql#L102).
- El selector del detalle ofrece todos los estados del catálogo ([RequirementDetail.tsx:167](../web/src/pages/RequirementDetail.tsx#L167)), así que un requerimiento movido a *Triado* **desaparece del tablero**.
- El handler ignora columnas sin `status_id` y filtra `closed_at IS NULL` ([boards.go:120-130](../internal/handlers/boards.go#L120)), pero `closed_at` nunca se asigna en ninguna función, así que el filtro no significa nada.
- No hay UI ni API para crear, ordenar u ocultar columnas.

**Propuesta.** El tablero se **deriva de `workflow_status`**: cada estado de la cuenta es una columna, ordenada por `workflow_status.ord`. `board_column` pasa a ser una capa de **personalización opcional** (nombre visible, color, límite WIP, colapsada, orden propio). Nunca puede existir un estado sin columna. Los estados cerrados se muestran como columnas colapsables con los últimos N días para no saturar.

**TODO — backend/DB**
- [ ] Reescribir `Boards.Get` con una sola consulta: `workflow_status ws LEFT JOIN board_column bc ON bc.status_id = ws.id AND bc.board_id = $1`, ordenando por `COALESCE(bc.ord, ws.ord)`.
- [ ] Añadir a `board_column` las columnas `is_collapsed boolean`, `is_hidden boolean` (ocultar solo desde configuración y con aviso).
- [ ] En `requirement_transition`: asignar `closed_at = now()` al entrar en un estado `is_closed`, limpiarlo e incrementar `reopened_count` al salir.
- [ ] Parámetro `?closed_days=14` para limitar las tarjetas de columnas cerradas; contador total en la cabecera.
- [ ] Trigger `AFTER INSERT ON workflow_status` que cree `board_column` en todos los tableros de la cuenta (si se mantiene la tabla como fuente).
- [ ] Migración de datos: insertar columnas faltantes en tableros existentes.
- [ ] API de configuración: `PATCH /boards/{id}/columns/{statusId}` (nombre, color, WIP, colapsada, orden).

**TODO — frontend**
- [ ] Mostrar columna colapsada como franja vertical con nombre y contador; clic para expandir (preferencia persistida por usuario).
- [ ] Aviso visual cuando `cards.length > wip_limit` (cabecera en ámbar/rojo).
- [ ] El selector de estado del detalle y el del tablero consumen la misma lista; mostrar solo transiciones permitidas por `workflow_transition` para el tracker del requerimiento (endpoint `GET /requirements/{id}/transitions`).
- [ ] Salvaguarda: si llega una tarjeta con un estado sin columna, se muestra una columna "Sin columna" en lugar de ocultarla.

**Criterios de aceptación.** Con 7 estados hay 7 columnas; crear un estado nuevo añade su columna sin tocar SQL; cambiar un requerimiento a cualquier estado desde el detalle lo deja visible en el tablero.

## A-5 Rendimiento del tablero y del drag & drop

`P1 · M · depende de A-4`

**Diagnóstico.**

| Problema | Dónde | Efecto |
|---|---|---|
| Consulta N+1: una query de tarjetas por columna | [boards.go:119](../internal/handlers/boards.go#L119) | Latencia proporcional al nº de columnas |
| Sin actualización optimista: al soltar, la tarjeta **vuelve a su origen** hasta que termina el refetch | [Board.tsx:251](../web/src/pages/Board.tsx#L251), [useRequirements.ts:122](../web/src/hooks/useRequirements.ts#L122) | Parpadeo y sensación de lentitud |
| Tras mover se invalidan `['board']` **y** `['requirements']` (que por F-6 arrastra todos los sub-recursos) | [useRequirements.ts:123](../web/src/hooks/useRequirements.ts#L123) | Ráfaga de peticiones por cada arrastre |
| Sin `onDragOver`: no hay vista previa al cruzar de columna; solo se reordena dentro de la de origen | [Board.tsx:323](../web/src/pages/Board.tsx#L323) | El destino no "abre hueco" |
| **Bug de posición**: al bajar una tarjeta, se envía `before_id` = la propia tarjeta; bajar una posición no hace nada y bajar varias queda un puesto arriba | [Board.tsx:237-242](../web/src/pages/Board.tsx#L237) | Reordenamiento errático |
| Posiciones calculadas con la lista **sin filtrar** mientras se muestra la filtrada por búsqueda | [Board.tsx:238](../web/src/pages/Board.tsx#L238) vs [331](../web/src/pages/Board.tsx#L331) | Destino incorrecto al arrastrar con búsqueda activa |
| `SortableCard` no memoizado, `useNavigate` por tarjeta, filtro con `toLowerCase()` por render y columna | [Board.tsx:37](../web/src/pages/Board.tsx#L37), [330](../web/src/pages/Board.tsx#L330) | Re-render de todo el tablero en cada evento de arrastre |
| Clase `transition-all` en la tarjeta compite con los `transform` de dnd-kit | [Board.tsx:67](../web/src/pages/Board.tsx#L67) | Movimiento con retraso ("gomoso") |
| `closestCorners` con columnas altas y vacías | [Board.tsx:325](../web/src/pages/Board.tsx#L325) | Detección imprecisa del destino |
| Sin `KeyboardSensor` | [Board.tsx:177](../web/src/pages/Board.tsx#L177) | No accesible por teclado |
| `requirement_move` no bloquea la fila ni rebalancea posiciones fraccionales | [requirement_functions.sql:198](../db/requirement/requirement_functions.sql#L198) | Precisión creciente y carreras entre usuarios |

**TODO — backend/DB**
- [ ] Una sola consulta para todas las tarjetas del tablero (`WHERE r.space_id = $1 AND r.status_id = ANY($statuses)`), agrupadas en Go.
- [ ] Enriquecer la tarjeta en esa misma consulta: tracker, avatares de miembros (máx. 3 + contador), etiquetas, `due_date`, conteo de comentarios/adjuntos/sub-requerimientos (subconsultas agregadas o `LATERAL`).
- [ ] `requirement_move`: `SELECT ... FOR UPDATE` de la fila, validar que `before`/`after` pertenecen al mismo estado destino, devolver la posición calculada.
- [ ] Rebalanceo cuando la diferencia entre vecinos < `1e-6` (renumerar la columna a múltiplos de 1000).
- [ ] Índice `(space_id, status_id, board_position)` sin la condición `closed_at IS NULL` (o ajustar la condición cuando se asigne `closed_at`).
- [ ] `PATCH /requirements/{id}/move` devuelve la tarjeta, no el requerimiento completo con `body_md`.

**TODO — frontend**
- [ ] Estado local de columnas (`useState` sembrado desde la query) y `onDragOver` que mueva la tarjeta entre contenedores en vivo (patrón *multiple containers* de dnd-kit).
- [ ] Mutación optimista: `onMutate` actualiza `qc.setQueryData(qk.board(...))`, `onError` revierte y muestra toast, `onSettled` invalida **solo** esa clave del tablero.
- [ ] Calcular `before_id`/`after_id` a partir del **orden final** (`arrayMove`) y no del índice del destino, sobre la lista completa.
- [ ] Deshabilitar el arrastre mientras hay búsqueda activa, o calcular vecinos sobre la lista completa.
- [ ] `React.memo` en `SortableCard` y `DroppableColumn` con `props` estables; `useCallback` para manejadores; `navigate` en el padre.
- [ ] Filtrar una vez con `useMemo` (`search` normalizado) y usar `useDeferredValue(search)`.
- [ ] Quitar `transition-all` de la tarjeta (usar `transition-colors`) y aplicar `will-change: transform` solo mientras se arrastra.
- [ ] Detección de colisiones: `pointerWithin` con fallback a `rectIntersection` (receta oficial para Kanban).
- [ ] Añadir `KeyboardSensor` con `sortableKeyboardCoordinates` y anuncios accesibles en español.
- [ ] Autoscroll horizontal al arrastrar cerca del borde (configurar `autoScroll`).
- [ ] Para columnas con > 100 tarjetas: `content-visibility: auto` en tarjetas o virtualización (`@tanstack/react-virtual`) — P2.
- [ ] Medir antes y después con React Profiler y documentar (objetivo: < 16 ms por frame durante el arrastre con 200 tarjetas).

**Criterios de aceptación.** Al soltar, la tarjeta queda en su sitio sin parpadeo; bajar una posición funciona; cruzar columnas muestra hueco en el destino; un error de red devuelve la tarjeta a su origen con aviso; un arrastre genera 1 petición de escritura y como máximo 1 de lectura.

## A-6 Control de miembros del requerimiento

`P0 · M · depende de F-5`

**Diagnóstico.**
- **Desbordamiento.** El panel lateral mide `w-80` con `p-6` y la tarjeta `p-4`, lo que deja unos 240 px útiles ([RequirementDetail.tsx:383](../web/src/pages/RequirementDetail.tsx#L383)). Dentro:
  - El formulario de alta pone en una fila un `<select>` cuyas opciones son `Nombre (correo)` más dos botones ([MemberManager.tsx:71](../web/src/components/MemberManager.tsx#L71)). El `select` toma el ancho de la opción más larga y no tiene `min-w-0`.
  - En cada fila de miembro, el contenedor izquierdo no tiene `min-w-0 flex-1`, así que el `truncate` de nombre y correo **no funciona** ([MemberManager.tsx:115](../web/src/components/MemberManager.tsx#L115)).
  - La cabecera "MIEMBROS ASIGNADOS (n)" en mayúsculas con `tracking-wider` más el botón "Añadir" no cabe en 240 px y empuja el botón fuera del área visible.
- **"No deja agregar más de uno".** El botón se oculta con `!isAdding && availableMembers.length > 0` ([MemberManager.tsx:58](../web/src/components/MemberManager.tsx#L58)):
  - desaparece **sin explicación** cuando no quedan miembros del espacio sin asignar (habitual: los usuarios creados en "Usuarios del Sistema" no se añaden al espacio);
  - la lista de candidatos usa una clave de caché distinta a la del modal de miembros del espacio (F-6), así que un usuario recién añadido al espacio no aparece hasta 30 s después o hasta recargar;
  - el desbordamiento de la cabecera puede dejarlo fuera de la vista.
  - El flujo exige abrir el formulario, elegir, pulsar "Asignar" y volver a abrir: una persona por ciclo.
- **Responsable principal roto.** `SetLead` ejecuta `UPDATE requirement ... WHERE id = $1`, pero `requirement` no tiene columna `id` (la PK es `document_id`), así que **siempre falla con 500** ([requirements.go:434](../internal/handlers/requirements.go#L434)). Además hay dos fuentes de verdad del lead: `requirement.lead_user_id` y `requirement_member.is_lead`.
- `requirement.member_count` nunca se actualiza. Añadir o quitar miembros no deja rastro en el journal ni notifica.

**Propuesta (estilo Trello).**
- Cabecera compacta: "Miembros" + **pila de avatares** + botón `+` siempre visible.
- El `+` abre un **popover con buscador** (combobox) que lista miembros del espacio con avatar, nombre y correo en dos líneas truncadas; clic en una persona la **alterna** (✓) sin cerrar el popover, lo que permite asignar varias seguidas.
- Si no quedan candidatos: mensaje "Todos los miembros del espacio ya están asignados" y enlace "Invitar al espacio" (solo para admin/maintainer).
- Lista de asignados: avatar, nombre truncado, corona para el lead y menú `⋯` (*Hacer responsable*, *Quitar*).
- Asignarme: atajo "Unirme" (tecla `Espacio` en el tablero, como Trello).

**TODO — backend/DB**
- [ ] Corregir `SetLead`: `WHERE document_id = $1`, dentro de `WithActor` y con validación de pertenencia al espacio.
- [ ] Unificar el lead: `requirement.lead_user_id` como fuente y `requirement_member.is_lead` mantenido por trigger (o eliminar uno de los dos). Hacer lead a alguien lo añade como miembro si no lo es.
- [ ] Validar en `AddMember` que `subject_id` es miembro del espacio (hoy acepta cualquier UUID) y responder 422 con mensaje claro.
- [ ] `PUT /requirements/{id}/members` con la lista completa (`{ user_ids: [], lead_user_id }`) para asignación múltiple atómica; conservar POST/DELETE individuales.
- [ ] Trigger que mantenga `requirement.member_count`.
- [ ] Journal `member_added` / `member_removed` / `lead_changed` (F-4).
- [ ] Notificación `member_added` al asignado y alta automática como seguidor (F-5).
- [ ] Filtro `?assignee=me|<userId>` en listado y tablero.

**TODO — frontend**
- [ ] Nuevo `components/members/MemberPicker.tsx` (popover + combobox con búsqueda, navegación por teclado, selección múltiple con alternancia, estado de carga por fila).
- [ ] Nuevo `components/members/AvatarStack.tsx` (reutilizable en tarjetas del tablero, listado y detalle).
- [ ] Reescribir `MemberManager.tsx` con `min-w-0`/`truncate` correctos; nada de `<select>` nativo.
- [ ] Usar el hook unificado de miembros del espacio (F-6).
- [ ] Actualización optimista al alternar un miembro.
- [ ] Toast de error si falla (hoy es silencioso).

**Criterios de aceptación.** A 1280 px de ancho, con nombres y correos de 40 caracteres, nada sobresale de la tarjeta; se pueden asignar 5 personas sin cerrar el popover; marcar un lead funciona y persiste; el asignado recibe una notificación.

## A-7 Diálogo de creación de requerimientos completo

`P1 · M · depende de F-2, F-3, A-6`

**Diagnóstico.** [CreateRequirementModal.tsx](../web/src/components/CreateRequirementModal.tsx):
- Faltan **miembros/lead**, **adjuntos**, **referencias**, **fechas** y **requerimiento padre**.
- **Bug en etiquetas:** al marcar una etiqueta se guarda `{ id, name: '', color: 'blue' }` ([línea 53](../web/src/components/CreateRequirementModal.tsx#L53)), así que los chips seleccionados aparecen **vacíos y azules**.
- La creación son N peticiones sueltas (crear → transicionar → una por etiqueta) con errores ignorados (`catch {}`); si falla a medias queda un requerimiento incompleto. La transición al estado de la columna genera además una entrada de historial espuria.
- No preselecciona tracker ni prioridad por defecto (`is_default`); no resetea el formulario al cancelar.
- La descripción no ofrece la plantilla de secciones canónicas definida en [quagenticus.md](quagenticus.md) (*Situación actual, Problemas a resolver, Soluciones propuestas, Criterios de aceptación, Consideraciones*), a pesar de que `tracker.template_id` existe.
- No hay vista previa del markdown.

**Propuesta.** Un diálogo en dos columnas (ancho `max-w-4xl`): a la izquierda título y descripción con pestañas *Escribir / Vista previa*, autocompletado de referencias y zona de adjuntos; a la derecha tracker, prioridad, estado inicial, miembros, lead, etiquetas, categoría, hito, fechas y padre. Todo se envía en **una sola petición transaccional**. Extras: "Crear y abrir" y "Crear otro" (mantiene tracker/prioridad).

**TODO — backend**
- [ ] Ampliar `RequirementCreate`: `status_id`, `member_ids[]`, `lead_user_id`, `label_ids[]`, `attachment_ids[]` (staged), `start_date`, `due_date`, `estimated_hours`, `parent_id`, `links[] {target_id, link_type}`.
- [ ] Nueva función `requirement_create_full(...)` o ampliar `requirement_create` para hacer todo en una transacción; el estado inicial se asigna directamente (sin journal de transición) y se registra un único journal `created`.
- [ ] Resolver referencias del cuerpo como enlaces derivados (A-8) al crear.
- [ ] Notificar a los miembros asignados (F-5).
- [ ] `GET /trackers/{id}/template` o incluir `template_body_md` en el catálogo de trackers.

**TODO — frontend**
- [ ] Rediseñar el diálogo en dos columnas, colapsando a una sola columna por debajo de 768 px.
- [ ] Preseleccionar tracker y prioridad por defecto; al cambiar el tracker, ofrecer "Aplicar plantilla" si la descripción está vacía.
- [ ] Integrar `MemberPicker` (A-6), `RefAutocomplete` + "Insertar referencia" (F-2) y `AttachmentUploader` (F-3).
- [ ] Corregir el estado de etiquetas guardando el objeto `Label` completo del catálogo.
- [ ] Pestaña de vista previa con `<Markdown>`.
- [ ] Validación inline (título obligatorio, fechas coherentes) y aviso si se cierra con cambios sin guardar.
- [ ] Botones "Crear", "Crear y abrir", casilla "Crear otro".
- [ ] Atajo global `C` para crear (fuera de campos de texto).
- [ ] Al crear desde una columna del tablero, fijar ese estado (visible y editable en el diálogo) e insertar la tarjeta de forma optimista.

**Criterios de aceptación.** Un requerimiento creado con 2 miembros, 3 etiquetas, 2 adjuntos y una referencia `#12` aparece completo tras **una** petición; si la petición falla, no se crea nada; las etiquetas seleccionadas muestran nombre y color.

## A-8 Referencias entre documentos y requerimientos

`P1 · M · depende de F-1, F-2`

**Diagnóstico.** La spec prevé wikilinks derivados por trigger ([TECHNICAL-SPEC.md:584](TECHNICAL-SPEC.md)); no existe tal trigger. El editor de documentos ([DocumentEditor.tsx](../web/src/pages/DocumentEditor.tsx)) no tiene autocompletado, la vista previa no renderiza enlaces y no hay panel de enlaces ni backlinks. Las rutas de enlaces solo existen para requerimientos (`/requirements/{id}/links`). La barra de herramientas del editor **añade al final del documento** en lugar de en el cursor ([DocumentEditor.tsx:118](../web/src/pages/DocumentEditor.tsx#L118)).

**TODO — backend/DB**
- [ ] Trigger `AFTER INSERT OR UPDATE OF body_md ON document` → `document_links_rebuild(document_id)`: borra enlaces `is_derived` del origen y los recrea desde wikilinks (`link_type = 'wikilink'`) y referencias `#n` (`link_type = 'mentions'`), resolviendo contra `ref_key`, `slug` y `title` **dentro del mismo espacio** (y `#KEY-n` dentro de la cuenta).
- [ ] Wikilinks no resueltos → `target_text` poblado (alimenta "enlaces rotos"); al crear un documento con ese título, resolverlos.
- [ ] Rutas genéricas `GET/POST/DELETE /documents/{id}/links` y `GET /documents/{id}/backlinks` (mantener las de requerimientos como alias).
- [ ] Corregir `Links.ListByRequirement`: cuando el documento actual es el **destino**, invertir el tipo mostrado (`blocks` → `blocked_by`, `precedes` → `follows`, `duplicates` → `duplicated_by`) ([links.go:39](../internal/handlers/links.go#L39)).
- [ ] Al renombrar un documento, ofrecer reescritura de wikilinks entrantes (P2).

**TODO — frontend**
- [ ] CodeMirror: extensión de autocompletado (F-2) para `[[`, `#` y `@`.
- [ ] CodeMirror: `Ctrl/⌘ + clic` sobre una referencia navega al destino; decoración visual de referencias en el editor.
- [ ] Barra de herramientas: insertar en la posición del cursor usando la API de `EditorView` (`view.dispatch({ changes, selection })`).
- [ ] Botón "Insertar referencia" (modal buscador) también en el editor de documentos.
- [ ] Vista previa con `<Markdown>` (F-1).
- [ ] Panel lateral colapsable en el editor con pestañas *Enlaces salientes · Backlinks · Enlaces rotos*.
- [ ] En el detalle del requerimiento, los enlaces listados deben ser **clicables** (hoy son texto) y navegar al documento o requerimiento.
- [ ] `LinkDocumentModal`: buscar también por `ref_key`, mostrar estado del requerimiento y excluir los ya enlazados.

**Criterios de aceptación.** Escribir `[[Arquitectura]]` en una nota y guardar crea el enlace y un backlink visible en "Arquitectura"; `#12` en una nota aparece como "Mencionado en" dentro de DEMO-12; un wikilink a un título inexistente aparece en "Enlaces rotos".

## A-9 Adjuntos en documentos

`P1 · S · depende de F-3`

**Diagnóstico.** El editor de documentos no tiene adjuntos, aunque la tabla y el almacenamiento ya son genéricos por `document_id`.

**TODO**
- [ ] Exponer las rutas genéricas `/documents/{id}/attachments` (F-3).
- [ ] Panel lateral "Archivos" en `DocumentEditor` (junto a enlaces/backlinks) con `AttachmentUploader` + `AttachmentList`.
- [ ] Pegar o soltar imágenes en CodeMirror → subir e insertar `![nombre](attachment:ID)` en el cursor, con marcador "Subiendo…" que se sustituye al terminar.
- [ ] Vista previa resuelve `attachment:ID` a URL firmada.
- [ ] Al archivar un documento, sus adjuntos quedan conservados; al restaurar, reaparecen.
- [ ] Mostrar el uso de almacenamiento por espacio en la configuración (P3).

**Criterios de aceptación.** Pegar una captura en una nota la muestra en la vista previa en menos de 2 s; el archivo aparece en el panel "Archivos" y se descarga con un clic.

## A-10 Edición rápida desde el tablero

`P1 · M · depende de A-5, A-6`

**Diagnóstico.** Hoy cualquier clic en la tarjeta navega al detalle y saca al usuario del tablero ([Board.tsx:66](../web/src/pages/Board.tsx#L66)); la tarjeta es un `div` sin `href`, así que tampoco se puede abrir en otra pestaña. El botón "Volver" del detalle siempre lleva al **listado**, no al tablero ([RequirementDetail.tsx:142](../web/src/pages/RequirementDetail.tsx#L142)). La tarjeta muestra poca información (ref, prioridad, título, fecha de actualización).

**Propuesta (patrón Trello/Linear).**
1. **Clic** en la tarjeta → abre un **panel lateral (drawer)** sobre el tablero, con URL propia `/spaces/:spaceId/board?card=<id>` (compartible; Atrás o `Esc` lo cierran). Contenido:
   - título editable inline, estado, prioridad, miembros (`MemberPicker`), etiquetas, fecha límite, avance;
   - descripción con vista previa y botón "Editar";
   - últimos 3 comentarios + compositor rápido;
   - adjuntos (conteo + subir);
   - botón destacado **"Abrir requerimiento completo"** (y `Shift + Enter`).
2. **Hover** sobre la tarjeta → icono ✏️ que abre un **editor rápido** en su sitio (título + botones *Mover a*, *Miembros*, *Etiquetas*, *Fecha*, *Prioridad*, *Archivar*), como el *quick card editor* de Trello.
3. **Doble clic, `Ctrl/⌘ + clic` o clic central** → requerimiento completo (la tarjeta pasa a ser un `<a href>` real con `preventDefault` en clic simple).
4. **Atajos con la tarjeta enfocada/hover:** `Enter` abre el panel, `E` edición rápida, `M` miembros, `L` etiquetas, `D` fecha, `Espacio` asignarme, `←/→` mover de columna.

**TODO**
- [ ] Web: `components/board/CardQuickPanel.tsx` (drawer, `role="dialog"`, foco atrapado, cierre con `Esc`), controlado por `useSearchParams`.
- [ ] Web: `components/board/CardQuickEditor.tsx` (popover anclado a la tarjeta).
- [ ] Web: extraer del detalle componentes reutilizables (`StatusSelect`, `PrioritySelect`, `DueDatePicker`, `LabelPicker`, `MemberPicker`, `CommentComposer`) para usarlos en detalle, panel y editor rápido.
- [ ] Web: la tarjeta como `<a href>` accesible; distinguir clic, doble clic y arrastre (el `activationConstraint.distance` ya evita conflictos).
- [ ] Web: enriquecer la tarjeta (tracker con icono, etiquetas como barras de color, avatares, fecha límite con color si vence/venció, iconos con conteo de comentarios/adjuntos, progreso de sub-requerimientos) con los datos de A-5.
- [ ] Web: "Volver" del detalle respeta el origen (`location.state.from` o `navigate(-1)` con fallback) y conserva el tablero y el scroll.
- [ ] Web: todas las ediciones del panel actualizan de forma optimista la tarjeta en `qk.board(...)` sin refetch completo.
- [ ] Backend: `GET /requirements/{id}/summary` ligero para el panel (sin sub-recursos pesados) o reutilizar los endpoints existentes con carga diferida por sección.

**Criterios de aceptación.** Desde el tablero se puede cambiar título, estado, miembros, etiquetas y fecha y añadir un comentario sin salir de él; la URL del panel abierta en otra pestaña muestra el mismo panel; `Ctrl + clic` abre el detalle en pestaña nueva; "Volver" desde el detalle regresa al tablero.

---

# Parte B — Hallazgos de la revisión completa

## B-1 Autorización, seguridad y aislamiento entre cuentas — `P0`

La aplicación es multi-cuenta (`account_id` en todas las tablas), pero la mayoría de endpoints **no comprueban ni la cuenta ni la pertenencia al espacio**. Cualquier usuario autenticado que conozca (o enumere) un UUID puede leer o modificar datos de otra cuenta. Esto bloquea cualquier despliegue compartido.

| Hallazgo | Dónde |
|---|---|
| `document_is_readable` devuelve siempre `true` (TODO) | [document_functions.sql:1](../db/document/document_functions.sql#L1) |
| `GET /requirements/{id}`, `/documents/{id}`, `/spaces/{id}`, boards, journals, links, labels, members, attachments sin comprobación de espacio/cuenta | [requirements.go](../internal/handlers/requirements.go), [documents.go](../internal/handlers/documents.go), [spaces.go:104](../internal/handlers/spaces.go#L104), [boards.go](../internal/handlers/boards.go) |
| `GET /catalogs/labels` devuelve etiquetas **de todas las cuentas** (sin filtro) | [documents.go:286](../internal/handlers/documents.go#L286) |
| `POST /users` y `PATCH /users/{id}` sin exigir `is_account_admin`; `Update` y `ChangePassword` **sin filtro de cuenta** → cualquiera puede ascenderse a admin o cambiar la clave de otro usuario | [users.go:71-175](../internal/handlers/users.go#L71) |
| Gestión de miembros del espacio sin comprobación de rol | [spaces.go:162-233](../internal/handlers/spaces.go#L162) |
| `SetLead`, `AddLabel`, `RemoveLabel`, `Journals.Create`, adjuntos y enlaces fuera de `WithActor` | varios |
| Adjuntos servidos inline con tipo del cliente (XSS almacenado) y enlace de descarga sin token | ver F-3 |
| `idx_document_ref_key` es único **global**, no por cuenta: dos cuentas con un espacio `DEMO` chocan en `DEMO-1` | [document_data_structure.sql:54](../db/document/document_data_structure.sql#L54) |
| JWT sin `jwt.WithValidMethods([]string{"HS256"})`, sin refresh, token en `localStorage`, sin revocación | [jwt.go:37](../internal/auth/jwt.go#L37) |
| CORS por defecto `*` | [config.go](../internal/config/config.go) |
| Sin límite de intentos en `/auth/login` | [auth.go](../internal/handlers/auth.go) |

**TODO**
- [ ] DB: implementar `space_member_role(space_id, actor_type, actor_id)` y `qg_require_space_role(space_id, min_role)` (previstas en la spec §1187).
- [ ] DB: habilitar **Row Level Security** en `document`, `requirement`, `journal`, `attachment`, `document_link`, `label`, `board` basada en `qg.account_id` y membresía (la API ya fija `qg.*` en `WithActor`). Alternativa mínima: middleware Go `RequireSpaceRole(min)` que resuelva el espacio desde el recurso.
- [ ] Todas las lecturas y escrituras dentro de `WithActor` (o un `WithActorRead` de solo lectura).
- [ ] Matriz de permisos por rol: `viewer` lee y comenta (configurable) · `contributor` crea/edita requerimientos y documentos · `maintainer` gestiona etiquetas, hitos, categorías y tablero · `admin` gestiona miembros y configuración. Documentarla en la spec.
- [ ] `users.go`: exigir admin de cuenta y filtrar `account_id` en todas las consultas; impedir que un admin se quite a sí mismo el último rol admin.
- [ ] Índice único de `ref_key` por `(account_id, ref_key)`.
- [ ] JWT: validar algoritmo; access token corto (15 min) + refresh token en cookie `HttpOnly; Secure; SameSite=Strict`; endpoint `/auth/refresh` y `/auth/logout`.
- [ ] Rate limiting en login (por IP y por correo) y bloqueo progresivo.
- [ ] CORS explícito en producción; cabeceras de seguridad (CSP, `X-Frame-Options`, `Referrer-Policy`) en nginx.
- [ ] Ocultar en la UI acciones no permitidas según el rol (p. ej. "Usuarios del Sistema" solo para admins) — [SpaceSelector.tsx:55](../web/src/pages/SpaceSelector.tsx#L55).
- [ ] Tests de autorización: por cada endpoint, un caso con usuario de otra cuenta (espera 404) y con `viewer` en escrituras (espera 403).

## B-2 Bugs funcionales detectados — `P0/P1`

- [ ] **Cola de agentes siempre vacía:** filtra `r.status_id === 'ready'`, pero `status_id` es un UUID; debe usar `status_key` o, mejor, `is_agent_claimable` desde el backend — [AgentQueue.tsx:12](../web/src/pages/AgentQueue.tsx#L12).
- [ ] **No se pueden vaciar campos:** `requirement_update` y el `UPDATE` del handler usan `COALESCE`, y la UI envía `undefined` al elegir "(Sin categoría)", "(Sin hito)" o borrar fechas y horas; el valor anterior persiste. Usar semántica PATCH con campos presentes (`json.RawMessage` o tipo `Optional[T]`) — [requirements.go:216](../internal/handlers/requirements.go#L216), [RequirementSidebarExtras.tsx:118](../web/src/components/RequirementSidebarExtras.tsx#L118).
- [ ] **Fechas desplazadas un día** en zonas horarias negativas (toda Latinoamérica): `new Date('2026-09-13')` se interpreta como UTC — [RequirementSidebarExtras.tsx:308](../web/src/components/RequirementSidebarExtras.tsx#L308). Formatear las fechas sin hora como cadenas locales.
- [ ] **Registros inexistentes → 500:** `pgx.ErrNoRows` y UUID mal formado no se mapean a 404/400 en `RespondError` — [errors.go](../internal/httpx/errors.go).
- [ ] **Sobrescritura silenciosa de la descripción:** `PATCH /requirements/{id}` no envía ni valida `version`; dos personas editando pierden cambios. `DocumentEditor` sí envía `version`, pero ante un 409 no hay UI de resolución.
- [ ] **"Cerrado" codificado a mano:** `isClosed` compara claves (`closed`, `resolved`, `discarded`) en lugar de `workflow_status.is_closed`; con el seed, *Resuelto* bloquea la edición aunque no es un estado cerrado — [RequirementDetail.tsx:113](../web/src/pages/RequirementDetail.tsx#L113), [RequirementSidebarExtras.tsx:44](../web/src/components/RequirementSidebarExtras.tsx#L44).
- [ ] **Workflow sin efecto:** `requirement_transition` permite cualquier estado de la cuenta si no hay transición definida (fallback "flexible"), e ignora `allowed_roles`, `requires_comment`, `requires_assignee`, `requires_readiness` y `requires_resolution` — [requirement_functions.sql:128](../db/requirement/requirement_functions.sql#L128).
- [ ] **DoR nunca se calcula:** `readiness_score` siempre es `null` (no hay función que lo asigne); la tarjeta "Definition of Ready" muestra "—" permanentemente.
- [ ] **Colores de estado/prioridad codificados** a las claves del seed en 4 archivos; un estado nuevo se ve gris. Usar `workflow_status.color` y `priority.color` del catálogo.
- [ ] `DocumentsList` solo muestra `doc_type = 'note'`; wikis, carpetas y plantillas creadas por API quedan invisibles — [DocumentsList.tsx:11](../web/src/pages/DocumentsList.tsx#L11).
- [ ] El listado de requerimientos devuelve `body_md` completo de cada fila (payload innecesario) — [requirements.go:32](../internal/handlers/requirements.go#L32).
- [ ] Barra de estado del sidebar con datos **ficticios** ("PostgreSQL 16 Online", ":8080") — [SpaceLayout.tsx:61](../web/src/components/SpaceLayout.tsx#L61). Sustituir por `/healthz` real o eliminar.
- [ ] `AuthGuard` llama `loadUser` en cada montaje y no gestiona token expirado durante la sesión.
- [ ] `Spaces.Create` ignora el error al insertar al creador como admin; si falla, el espacio queda huérfano e invisible — [spaces.go:95](../internal/handlers/spaces.go#L95). Hacerlo en la misma transacción.
- [ ] `Spaces.Create` no crea un tablero por defecto: un espacio nuevo muestra "No hay tableros" sin forma de crearlo desde la UI.
- [ ] La primera línea de `init_system.sql` empieza con `e--` (carácter sobrante) — [init_system.sql:1](../db/init_system.sql#L1).

## B-3 Experiencia en requerimientos — `P1/P2`

- [ ] **Listado con filtros reales:** estado, tracker, prioridad, miembro ("Asignados a mí"), etiqueta, categoría, hito, vencidos; orden por columna; paginación por cursor en el backend; filtros en la URL (compartibles).
- [ ] **Vistas guardadas** por usuario y por espacio (p. ej. "Mis abiertos", "Bugs urgentes").
- [ ] **Columnas configurables** en el listado: miembros, fecha límite, hito, actualizado, avance.
- [ ] **Acciones masivas:** cambiar estado, prioridad, miembros, etiquetas o hito a varios requerimientos.
- [ ] **Página "Mi trabajo"** (inicio por usuario): asignados a mí, mencionado, vencen esta semana, seguidos con actividad nueva.
- [ ] **Plantilla de secciones canónicas** y editor por secciones opcional (spec de [quagenticus.md](quagenticus.md)); indicador de secciones faltantes vinculado a la DoR.
- [ ] **DoR real:** función `readiness_evaluate(document_id)` (spec §1075) ejecutada al guardar; checklist visible de criterios cumplidos/pendientes en lugar de solo un porcentaje.
- [ ] **Editor de descripción** con vista previa lado a lado, autoguardado de borrador y aviso de cambios sin guardar al navegar.
- [ ] **Breadcrumbs** en el detalle (Espacio › Padre › Requerimiento) y selector para cambiar/quitar padre.
- [ ] **Relaciones de bloqueo visibles:** badge "Bloqueado por DEMO-7" en detalle y tarjeta; aviso al pasar a *En progreso* con bloqueos abiertos.
- [ ] **Clonar**, **mover a otro espacio**, **archivar/restaurar** requerimientos (hoy no hay borrado ni archivado desde la UI).
- [ ] **Resolución obligatoria** al pasar a estados con `requires_resolution` (diálogo con motivo + comentario).
- [ ] **Registro de tiempo** como entradas (quién, cuánto, cuándo, nota) en lugar de un único número editable de horas invertidas (P2).
- [ ] **Avance automático** opcional desde sub-requerimientos cerrados o checklist del cuerpo.
- [ ] **Recordatorios** de fecha límite (F-5, eventos `due_soon`/`due_overdue` desde el worker).
- [ ] Mostrar reporter, creado por agente/humano y fechas absolutas/relativas en la cabecera.

## B-4 Gestión documental — `P1/P2`

La doble naturaleza (Redmine + Marknote) es la propuesta de valor del producto; hoy el módulo de documentos es una lista plana de notas.

- [ ] **Árbol de documentos** con carpetas (`parent_id`, `path`, `position` ya existen): panel lateral navegable, arrastrar para mover/reordenar, crear dentro de una carpeta.
- [ ] **Tipos de documento** visibles y filtrables (nota, wiki, plantilla, carpeta).
- [ ] **Historial de versiones con diff y restauración** (el endpoint `GET /documents/{id}/history` ya existe, sin UI).
- [ ] **Autoguardado** con debounce y estado "Guardando… / Guardado" + resolución de conflictos 409 (ver diferencias, sobrescribir, fusionar manualmente).
- [ ] **Archivar/restaurar** documentos desde la UI y papelera por espacio.
- [ ] **Etiquetas en documentos** (la tabla `document_label` ya es genérica).
- [ ] **Índice (TOC)** generado desde `document_section` y navegación por encabezados.
- [ ] **Promover nota a requerimiento** conservando id, historial, adjuntos y enlaces (spec).
- [ ] **Plantillas** de documento y de requerimiento gestionables desde la UI.
- [ ] **Favoritos y recientes** (`is_favorite_count` existe).
- [ ] **Exportar** documento/espacio a `.md` o `.zip` con adjuntos; **importar** carpeta de markdown.
- [ ] Mostrar autor y última edición en el listado; vista previa con extracto renderizado en lugar de markdown crudo truncado.
- [ ] Modo lectura/enfoque y ancho de lectura cómodo en la vista previa.

## B-5 Búsqueda y navegación — `P1`

- [ ] **Búsqueda global real:** hoy el buscador del encabezado solo filtra en cliente la página actual ([SpaceLayout.tsx:125](../web/src/components/SpaceLayout.tsx#L125)) y no existe en el detalle. Implementar `search_documents` (spec §4.8) con `websearch_to_tsquery`, ranking y `ts_headline`, sobre `search_tsv` e `idx_document_search` que ya existen.
- [ ] **Paleta de comandos** `Ctrl/⌘ + K`: saltar a `#123`, buscar documentos, crear requerimiento, cambiar de espacio, acciones rápidas.
- [ ] Página de resultados con filtros por tipo, espacio, estado y fecha.
- [ ] **Selector de espacio** en el sidebar (hoy hay que volver a `/`).
- [ ] Sidebar colapsable y navegación adaptable a pantallas pequeñas (hoy `w-64` fijo y el detalle tiene un aside `w-80` fijo; en < 1024 px no es usable).
- [ ] Carga diferida de rutas con `React.lazy` (CodeMirror se carga en el bundle inicial).
- [ ] Hoja de atajos de teclado (`?`).

## B-6 Administración y configuración — `P1/P2`

Hoy estados, trackers, prioridades, columnas del tablero y transiciones solo se pueden cambiar por SQL.

- [ ] **Página de configuración del espacio** (`/spaces/:id/settings`): general (nombre, clave, icono, color, descripción), miembros y roles (mover aquí `SpaceMembersModal`), etiquetas, categorías, hitos, tableros y columnas, módulos (`space.modules`).
- [ ] **Administración de cuenta** (solo admins): usuarios (alta, suspensión, reset de clave, invitación por correo con enlace), estados del workflow (crear, ordenar, color, `is_closed`, `is_agent_claimable`), trackers (icono, color, estado inicial, plantilla), prioridades, matriz de transiciones por tracker y rol.
- [ ] **Perfil de usuario:** nombre, avatar, handle para menciones, idioma, zona horaria (ya en `app_user`), preferencias de notificación, tema.
- [ ] **Gestión de hitos** con vista de progreso (abiertos/cerrados, fecha objetivo, burndown simple).
- [ ] **Registro de auditoría** de acciones administrativas.
- [ ] **Crear tablero** desde la UI y tableros con filtros (p. ej. por tracker o hito).

## B-7 Colaboración en tiempo real — `P2`

- [ ] SSE `GET /events` alimentado por `LISTEN/NOTIFY` (spec AD-2): tablero, detalle y comentarios se actualizan en vivo invalidando las claves de React Query afectadas.
- [ ] Indicador de presencia ("Ana está viendo / editando") en detalle y documentos, con bloqueo blando (`document.locked_by` ya existe).
- [ ] Aviso "Este requerimiento cambió desde que lo abriste — recargar" cuando llega un evento sobre el recurso abierto con cambios locales.

## B-8 Rendimiento y arquitectura del frontend — `P2`

- [ ] Fábrica de claves de React Query (F-6) y revisión de invalidaciones: preferir `setQueryData` con la respuesta de la mutación.
- [ ] Extraer componentes duplicados: selects de estado/prioridad, mapas de colores, `MarkdownPreview`, filas de enlace.
- [ ] Code-splitting por ruta; análisis de bundle (`rollup-plugin-visualizer`).
- [ ] `staleTime` por tipo de dato: catálogos (`statuses`, `priorities`, `trackers`) con `Infinity` hasta evento de cambio.
- [ ] Backend: reutilizar un único `SELECT` de requerimiento (hoy copiado 4 veces en [requirements.go](../internal/handlers/requirements.go)) mediante una vista `v_requirement` o una función `scanRequirement`.
- [ ] Backend: logging estructurado con `slog` en lugar de `middleware.Logger`, `request_id` en errores 500, métricas Prometheus básicas.
- [ ] Backend: timeouts de lectura/escritura en `http.Server` (hoy sin `ReadHeaderTimeout`), límite global de tamaño de cuerpo JSON.

## B-9 Accesibilidad, consistencia e internacionalización — `P2`

- [ ] Elementos clicables como `button`/`a` reales (tarjetas, filas del listado y de sub-requerimientos son `div`/`tr` con `onClick`).
- [ ] `Modal` con foco atrapado, `role="dialog"`, `aria-labelledby`, devolución de foco al cerrar ([Modal.tsx](../web/src/components/Modal.tsx)).
- [ ] Botones solo con icono con `aria-label` (tema, logout, borrar).
- [ ] Estados de foco visibles (`focus:outline-none` elimina el anillo en todos los inputs).
- [ ] No transmitir estado solo por color (añadir texto o icono).
- [ ] Confirmación y **deshacer** en acciones destructivas (quitar miembro, borrar adjunto o enlace).
- [ ] Unificar idioma: mezcla de "Tracker", "Lead", "Definition of Ready", "Split" con español. Centralizar textos (`i18n` ligero) para permitir `app_user.locale`.
- [ ] Formatos de fecha y número con `Intl` según locale y zona horaria del usuario.
- [ ] Estados vacíos con acción principal (p. ej. "Crea tu primer requerimiento") y *skeletons* en lugar de "Cargando…".
- [ ] Revisión de contraste en tema claro (tokens `--text-muted` sobre `--bg-surface`).

## B-10 Agentes (propósito central del producto) — `P2`

La cola de agentes es hoy una página informativa. Para cumplir el propósito descrito en [quagenticus.md](quagenticus.md):

- [ ] **Gestión de agentes** en la UI: alta, descripción, modelo, capacidades, generación/rotación de API key (se muestra una sola vez), estado y última actividad (tabla `agent` ya existe).
- [ ] **Autenticación de agentes** por API key en `Authenticate` (`actor.Type = 'agent'`) con scopes (`qg_require_scope` ya existe).
- [ ] **Cola real**: `GET /spaces/{id}/agent-queue` con requerimientos en estados `is_agent_claimable`, ordenados por prioridad; `POST /requirements/{id}/claim` y `/release` con `FOR UPDATE SKIP LOCKED` y lease con expiración; renovación.
- [ ] **Worker** de expiración de claims que devuelve el requerimiento al estado previo y registra en el journal.
- [ ] **Visualización de actividad de agentes** en el historial (A-1) y en la tarjeta (badge "🤖 reclamado por X, expira en 12 min").
- [ ] **Servidor MCP** (`cmd/quagenticus-mcp`) con herramientas: crear requerimiento, leer requerimiento con contexto enlazado (documentos `[[...]]` resueltos), comentar, transicionar, adjuntar, buscar.
- [ ] **Paquete de contexto para agentes**: `GET /requirements/{id}/context.md` que concatene cuerpo, secciones, documentos enlazados, comentarios relevantes y criterios de aceptación.
- [ ] Controles humanos: aprobación requerida para ciertas transiciones hechas por agentes (principio "no autónomos").

## B-11 Calidad, pruebas y operación — `P1`

- [ ] **Tests Go** (`httptest`) de handlers críticos: autorización (B-1), creación completa (A-7), movimiento en tablero (A-5), adjuntos (F-3).
- [ ] **pgTAP** para funciones SQL: transiciones, reordenamiento, parser de referencias, resolución de wikilinks.
- [ ] **Tests de frontend** (Vitest + Testing Library) para `lib/refs.ts`, `MemberPicker`, cálculo de vecinos del tablero.
- [ ] **E2E** (Playwright): crear requerimiento completo, arrastrar entre columnas, comentar con adjunto y referencia, edición rápida.
- [ ] **CI** (GitHub Actions): `go vet`, `staticcheck`, tests Go con Postgres de servicio, `tsc -b`, `oxlint`, build del frontend.
- [ ] **Migraciones versionadas** (p. ej. `goose` o `tern`) en lugar de recrear el esquema con `install_database.sh`; cada TODO de este plan que toque BD debe llegar como migración.
- [ ] Copias de seguridad documentadas (BD + carpeta de adjuntos) y guía de actualización.
- [ ] Eliminar el binario `quagenticus-api` versionado en la raíz del repositorio y añadirlo a `.gitignore`.

---

# Parte C — Orden de ejecución sugerido

Cada bloque se puede entregar y probar de forma independiente.

| Iteración | Contenido | Resultado visible |
|---|---|---|
| **1. Estabilizar** | B-1 (mínimo: pertenencia al espacio, users admin, labels por cuenta, `ref_key` por cuenta), B-2 (SetLead, AgentQueue, vaciar campos, fechas, 404), F-6, A-4 | Datos aislados, tablero con todos los estados, errores visibles |
| **2. Tablero fluido** | A-5, tarjeta enriquecida (parte de A-10), A-6 | Arrastre sin parpadeo, miembros múltiples sin desbordes |
| **3. Contenido rico** | F-1, F-3, A-9 | Markdown completo, adjuntos seguros y descargables, imágenes pegadas |
| **4. Conversación** | F-4, A-1, A-2 | Comentarios en hilo con adjuntos; historial completo aparte |
| **5. Conocimiento enlazado** | F-2, A-3, A-8 | `#123`, `@123` y `[[doc]]` con autocompletado y backlinks |
| **6. Flujo diario** | A-7, A-10, F-5 (sin tiempo real) | Creación completa, edición rápida, notificaciones |
| **7. Escala y equipo** | B-3, B-5, B-6 | Filtros, búsqueda global, configuración sin SQL |
| **8. Documentos** | B-4 | Árbol, versiones, autoguardado, promover a requerimiento |
| **9. Tiempo real y agentes** | B-7, B-10 | SSE, cola real, MCP |
| **Continuo** | B-8, B-9, B-11 | Tests y CI desde la iteración 1 |
