# Quagenticus — Plan de Ejecución

> **Fecha:** 2026-07-28  
> **Alcance:** 10 ítems solicitados + funcionalidades Redmine faltantes

---

## Convenciones del documento

- **[NUEVO]** — Archivo que se crea desde cero.
- **[MODIFICAR]** — Archivo existente que se edita.
- Cada tarea incluye los **archivos afectados en orden de ejecución** (primero backend/DB, después frontend).
- Los bloques de código muestran el cambio concreto, no el archivo completo.

---

## Índice de Fases

| Fase | Tareas | Foco |
|------|--------|------|
| **1** | Bug UUID (#7), Catálogo de statuses, Tema light (#2) | Fundamento visual y datos correctos |
| **2** | Modal de creación (#1), Toolbar Markdown (#4) | UX de edición |
| **3** | Vista de detalle, Comentarios (#5), Miembros (#8) | Página central de requerimiento |
| **4** | Drag & Drop (#3) | Tablero interactivo |
| **5** | Vincular documentos (#6), Adjuntar archivos (#9) | Contenido enriquecido |
| **6** | Funcionalidades Redmine adicionales (#10) | Completitud funcional |

---

# Fase 1 — Datos correctos y tema light

## Tarea 1.1 — Fix bug: estado y prioridad muestran UUID (#7)

### Diagnóstico

En [RequirementsList.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementsList.tsx) línea 164, `r.status_id` es un UUID porque el backend devuelve el UUID de `workflow_status`. El diccionario `STATUS_COLORS` (línea 18-27) usa keys como `'new'`, `'triaged'`, etc., que son los `key` de la tabla, no los UUIDs. Resultado: el color nunca matchea y se muestra el UUID crudo.

El mismo problema ocurre en [Board.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/Board.tsx) línea 25-26, donde `card.priority_id` se usa como label del badge y para lookup de color con keys como `'urgent'`, `'high'`, etc.

### Estrategia

Resolver en el backend: el API devuelve `status_key`, `status_name`, `priority_key`, `priority_name` ya resueltos vía JOIN. Esto evita que el frontend necesite un catálogo adicional y una búsqueda por UUID.

### Ejecución paso a paso

#### Paso 1 — [MODIFICAR] [requirement.go](file:///home/nespina/repos/quagenticus/internal/models/requirement.go)

Agregar 4 campos al struct `RequirementResponse` (después de la línea 48):

```go
type RequirementResponse struct {
    // ... campos existentes ...
    StatusID        string    `json:"status_id"`
    StatusKey       string    `json:"status_key"`       // NUEVO
    StatusName      string    `json:"status_name"`      // NUEVO
    PriorityID      string    `json:"priority_id"`
    PriorityKey     string    `json:"priority_key"`     // NUEVO
    PriorityName    string    `json:"priority_name"`    // NUEVO
    // ... resto ...
}
```

#### Paso 2 — [MODIFICAR] [requirements.go](file:///home/nespina/repos/quagenticus/internal/handlers/requirements.go)

Modificar las 3 queries (`List`, `Get`, `Create`) para hacer JOIN con `workflow_status` y `priority`. Cambio en la query de `List` (línea 30):

```sql
SELECT r.document_id, d.space_id, r.account_id, d.ref_key,
       d.title, d.body_md,
       r.tracker_id,
       r.status_id,  ws.key AS status_key,  ws.name AS status_name,
       r.priority_id, pr.key AS priority_key, pr.name AS priority_name,
       r.category_id, r.milestone_id, r.reporter_id,
       r.lead_user_id, r.board_position, r.readiness_score,
       r.created_at, r.updated_at
FROM requirement r
JOIN document d ON d.id = r.document_id
JOIN workflow_status ws ON ws.id = r.status_id
JOIN priority pr ON pr.id = r.priority_id
WHERE r.space_id = $1 AND d.is_archived = false
```

Actualizar todos los `Scan()` para incluir los campos nuevos (en `List`, `Get`, y el SELECT dentro de `Create`). Son 3 puntos de cambio en el archivo, todos con el mismo patrón.

#### Paso 3 — [MODIFICAR] [boards.go](file:///home/nespina/repos/quagenticus/internal/handlers/boards.go)

Modificar el struct `boardCard` (línea 30) para agregar `PriorityKey` y `PriorityName`:

```go
type boardCard struct {
    ID            string    `json:"id"`
    RefKey        *string   `json:"ref_key"`
    Title         string    `json:"title"`
    PriorityID    string    `json:"priority_id"`
    PriorityKey   string    `json:"priority_key"`   // NUEVO
    PriorityName  string    `json:"priority_name"`  // NUEVO
    LeadUserID    *string   `json:"lead_user_id"`
    BoardPosition float64   `json:"board_position"`
    UpdatedAt     time.Time `json:"updated_at"`
}
```

Modificar la query de cards (línea 121-127):

```sql
SELECT r.document_id, d.ref_key, d.title,
       r.priority_id, pr.key AS priority_key, pr.name AS priority_name,
       r.lead_user_id, r.board_position, r.updated_at
FROM requirement r
JOIN document d ON d.id = r.document_id
JOIN priority pr ON pr.id = r.priority_id
WHERE r.space_id = $1 AND r.status_id = $2 AND r.closed_at IS NULL
ORDER BY r.board_position, r.created_at
```

Actualizar el `Scan()` correspondiente (línea 136-138).

#### Paso 4 — [MODIFICAR] [api.ts](file:///home/nespina/repos/quagenticus/web/src/lib/api.ts)

Agregar campos al interface `Requirement` (línea 86):

```typescript
export interface Requirement {
  // ... existentes ...
  status_id: string;
  status_key: string;      // NUEVO
  status_name: string;     // NUEVO
  priority_id: string;
  priority_key: string;    // NUEVO
  priority_name: string;   // NUEVO
  // ...
}
```

Agregar campos al interface `BoardCard` (línea 117):

```typescript
export interface BoardCard {
  // ... existentes ...
  priority_id: string;
  priority_key: string;    // NUEVO
  priority_name: string;   // NUEVO
  // ...
}
```

#### Paso 5 — [MODIFICAR] [RequirementsList.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementsList.tsx)

Línea 164: cambiar `STATUS_COLORS[r.status_id]` → `STATUS_COLORS[r.status_key]`.  
Línea 165: cambiar `{r.status_id}` → `{r.status_name}`.  
Línea 169: ya no necesita `priority?.name ?? r.priority_id`, simplemente `{r.priority_name}`.

#### Paso 6 — [MODIFICAR] [Board.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/Board.tsx)

Línea 25: cambiar `PRIORITY_COLORS[card.priority_id]` → `PRIORITY_COLORS[card.priority_key]`.  
Línea 26: cambiar `{card.priority_id}` → `{card.priority_name}`.

### Verificación

- Compilar backend: `go build ./cmd/quagenticus-api/`.
- Compilar frontend: `cd web && npm run build`.
- Verificar que el listado muestre nombres legibles ("Nuevo", "En Progreso") en lugar de UUIDs.
- Verificar que los colores de los badges se apliquen correctamente.

---

## Tarea 1.2 — Endpoint de catálogo de statuses

### Justificación

Actualmente existe `/catalogs/trackers` y `/catalogs/priorities` pero no hay `/catalogs/statuses`. Se necesita para que el frontend conozca los estados disponibles (útil para filtros futuros, para el tablero, y para la creación de requerimientos).

### Ejecución

#### Paso 1 — [MODIFICAR] [documents.go](file:///home/nespina/repos/quagenticus/internal/handlers/documents.go)

Agregar método `Statuses` al handler de Documents (donde ya viven `Trackers`, `Priorities`, `Labels`):

```go
func (h *Documents) Statuses(w http.ResponseWriter, r *http.Request) {
    actor := auth.ActorFrom(r.Context())
    rows, err := h.db.Pool.Query(r.Context(), `
        SELECT id, key, name, color, ord, is_default, is_closed
        FROM workflow_status
        WHERE account_id = $1
        ORDER BY ord
    `, actor.AccountID)
    // ... scan y respond como en Trackers/Priorities ...
}
```

#### Paso 2 — [MODIFICAR] [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go)

Agregar ruta en línea 103 (junto a los otros catálogos):

```go
r.Get("/catalogs/statuses", docsH.Statuses)
```

#### Paso 3 — [MODIFICAR] [api.ts](file:///home/nespina/repos/quagenticus/web/src/lib/api.ts)

Agregar interface `WorkflowStatus`:

```typescript
export interface WorkflowStatus {
  id: string;
  key: string;
  name: string;
  color: string | null;
  ord: number;
  is_default: boolean;
  is_closed: boolean;
}
```

---

## Tarea 1.3 — Tema claro (light) (#2)

### Estrategia

Tailwind v4 (que ya se usa — ver `@import "tailwindcss"` en [index.css](file:///home/nespina/repos/quagenticus/web/src/index.css)) soporta **CSS custom properties** nativamente. La estrategia es:

1. Definir un sistema de tokens CSS con `:root` (light) y `.dark` (dark).
2. Migrar **cada componente** para usar estos tokens en lugar de clases Tailwind hardcodeadas.
3. Agregar toggle de tema con persistencia.

### Ejecución paso a paso

#### Paso 1 — [MODIFICAR] [index.css](file:///home/nespina/repos/quagenticus/web/src/index.css)

Reemplazar completamente el contenido con el sistema de tokens:

```css
@import "tailwindcss";

/* ───── Design Tokens ───── */
:root {
  /* Surfaces */
  --bg-app:       #ffffff;
  --bg-sidebar:   #f8fafc;
  --bg-surface:   #f1f5f9;
  --bg-elevated:  #ffffff;
  --bg-input:     #ffffff;
  --bg-hover:     #f1f5f9;

  /* Text */
  --text-primary:   #0f172a;
  --text-secondary: #475569;
  --text-muted:     #94a3b8;
  --text-inverted:  #ffffff;

  /* Borders */
  --border:        #e2e8f0;
  --border-subtle: #f1f5f9;

  /* Accent */
  --accent:        #6366f1;
  --accent-hover:  #4f46e5;
  --accent-soft:   rgba(99, 102, 241, 0.08);
  --accent-text:   #4f46e5;

  /* Status colors (para badges) */
  --status-new-bg:     rgba(100,116,139,0.1);  --status-new-text:     #64748b;
  --status-ready-bg:   rgba(99,102,241,0.1);   --status-ready-text:   #4f46e5;
  --status-progress-bg:rgba(139,92,246,0.1);   --status-progress-text:#7c3aed;
  --status-review-bg:  rgba(6,182,212,0.1);    --status-review-text:  #0891b2;
  --status-resolved-bg:rgba(16,185,129,0.1);   --status-resolved-text:#059669;
  --status-closed-bg:  rgba(148,163,184,0.08); --status-closed-text:  #94a3b8;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.06);

  /* Scrollbar */
  --scrollbar-track: rgba(241,245,249,0.6);
  --scrollbar-thumb: rgba(203,213,225,0.6);
  --scrollbar-thumb-hover: rgba(148,163,184,0.8);
}

.dark {
  --bg-app:       #020617;
  --bg-sidebar:   #0f172a;
  --bg-surface:   #1e293b;
  --bg-elevated:  #0f172a;
  --bg-input:     #1e293b;
  --bg-hover:     rgba(30,41,59,0.5);

  --text-primary:   #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-muted:     #64748b;
  --text-inverted:  #0f172a;

  --border:        #1e293b;
  --border-subtle: rgba(30,41,59,0.6);

  --accent:        #818cf8;
  --accent-hover:  #6366f1;
  --accent-soft:   rgba(129,140,248,0.15);
  --accent-text:   #a5b4fc;

  --status-new-bg:     rgba(100,116,139,0.2);  --status-new-text:     #94a3b8;
  --status-ready-bg:   rgba(99,102,241,0.2);   --status-ready-text:   #a5b4fc;
  --status-progress-bg:rgba(139,92,246,0.2);   --status-progress-text:#c4b5fd;
  --status-review-bg:  rgba(6,182,212,0.2);    --status-review-text:  #67e8f9;
  --status-resolved-bg:rgba(16,185,129,0.2);   --status-resolved-text:#6ee7b7;
  --status-closed-bg:  rgba(30,41,59,0.8);     --status-closed-text:  #64748b;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.4);

  --scrollbar-track: rgba(15,23,42,0.6);
  --scrollbar-thumb: rgba(71,85,105,0.6);
  --scrollbar-thumb-hover: rgba(100,116,139,0.8);
}

@layer base {
  body {
    background: var(--bg-app);
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }

  ::selection {
    background: var(--accent-soft);
    color: var(--accent-text);
  }
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--scrollbar-track); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
```

#### Paso 2 — [NUEVO] [theme.ts](file:///home/nespina/repos/quagenticus/web/src/lib/theme.ts)

Store Zustand para gestión de tema:

```typescript
import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

export const useTheme = create<ThemeState>((set) => {
  const stored = localStorage.getItem('qg_theme') as Theme | null;
  const initial: Theme = stored ?? 'light';  // Default: light

  // Aplicar al <html> inmediatamente
  document.documentElement.classList.toggle('dark', initial === 'dark');

  return {
    theme: initial,
    toggle: () => set((s) => {
      const next = s.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('qg_theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return { theme: next };
    }),
    set: (t) => {
      localStorage.setItem('qg_theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
      set({ theme: t });
    },
  };
});
```

#### Paso 3 — Migrar cada componente

La migración se hace componente por componente. El patrón es reemplazar clases Tailwind hardcodeadas con la sintaxis de variables CSS. A continuación el detalle de cada archivo.

##### [MODIFICAR] [SpaceLayout.tsx](file:///home/nespina/repos/quagenticus/web/src/components/SpaceLayout.tsx)

Este es el componente más grande de migrar. Importar `useTheme` y agregar botón de toggle. Reemplazar clases así:

| Línea | Antes | Después |
|-------|-------|---------|
| 31 | `bg-slate-950 text-slate-100` | `bg-[var(--bg-app)] text-[var(--text-primary)]` |
| 33 | `border-slate-800/80 bg-slate-950/60` | `border-[var(--border)] bg-[var(--bg-sidebar)]` |
| 18-22 | Active: `bg-gradient-to-r from-indigo-600/20...` Inactive: `text-slate-400 hover:text-slate-200 hover:bg-slate-900/50` | Active: `bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--accent)]/30` Inactive: `text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]` |
| 59 | `bg-slate-900/80 border border-slate-800` | `bg-[var(--bg-surface)] border border-[var(--border)]` |
| 103 | `from-slate-950 via-slate-900/40 to-slate-950` | `bg-[var(--bg-app)]` (quitar gradiente, usar superficie plana en light) |
| 104 | `border-slate-800/80 bg-slate-950/40` | `border-[var(--border)] bg-[var(--bg-elevated)]` |
| 119 | `bg-slate-900/80 border border-slate-800` | `bg-[var(--bg-input)] border border-[var(--border)]` |

Agregar botón de toggle de tema en la sección del status bar (antes del bloque del usuario, línea ~85):

```tsx
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../lib/theme';

// Dentro del componente:
const { theme, toggle } = useTheme();

// En el JSX, antes del bloque {user && ...}:
<button onClick={toggle} className="p-1.5 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
</button>
```

##### [MODIFICAR] [Login.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/Login.tsx)

| Línea | Antes | Después |
|-------|-------|---------|
| 31 | `bg-slate-950` | `bg-[var(--bg-app)]` |
| 38 | `text-white` | `text-[var(--text-primary)]` |
| 39 | `text-slate-400` | `text-[var(--text-muted)]` |
| 61 | `bg-slate-900 border border-slate-800` | `bg-[var(--bg-input)] border border-[var(--border)]` |
| Inputs | `text-slate-100 placeholder-slate-600` | `text-[var(--text-primary)] placeholder-[var(--text-muted)]` |

##### [MODIFICAR] [SpaceSelector.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/SpaceSelector.tsx)

Misma migración: `bg-slate-950` → `bg-[var(--bg-app)]`, botones `bg-slate-900 border-slate-800` → `bg-[var(--bg-elevated)] border-[var(--border)]`, textos `text-slate-200` → `text-[var(--text-primary)]`.

##### [MODIFICAR] [RequirementsList.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementsList.tsx)

Migrar colores de tabla, badges de estado (que ahora usarán variables CSS de status), formulario inline, etc. El diccionario `STATUS_COLORS` (línea 18-27) pasa a usar variables CSS:

```typescript
const STATUS_COLORS: Record<string, string> = {
  new:         'bg-[var(--status-new-bg)] text-[var(--status-new-text)]',
  triaged:     'bg-[var(--status-new-bg)] text-[var(--status-new-text)]',
  ready:       'bg-[var(--status-ready-bg)] text-[var(--status-ready-text)]',
  in_progress: 'bg-[var(--status-progress-bg)] text-[var(--status-progress-text)]',
  in_review:   'bg-[var(--status-review-bg)] text-[var(--status-review-text)]',
  resolved:    'bg-[var(--status-resolved-bg)] text-[var(--status-resolved-text)]',
  closed:      'bg-[var(--status-closed-bg)] text-[var(--status-closed-text)]',
};
```

##### [MODIFICAR] [Board.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/Board.tsx)

Migrar cards, columnas, header del tablero.

##### [MODIFICAR] [DocumentsList.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/DocumentsList.tsx)

Migrar cards de documentos, formulario de creación.

##### [MODIFICAR] [DocumentEditor.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/DocumentEditor.tsx)

Migrar toolbar, status bar. Para CodeMirror (línea 117), cambiar `theme="dark"` por tema dinámico:

```tsx
import { useTheme } from '../lib/theme';

// Dentro del componente:
const { theme } = useTheme();

// En el CodeMirror:
<CodeMirror
  theme={theme === 'dark' ? 'dark' : 'light'}
  // ...
/>
```

##### [MODIFICAR] [AgentQueue.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/AgentQueue.tsx)

Migrar colores según el mismo patrón.

### Verificación

- `npm run build` sin errores.
- Verificar visualmente que la aplicación se ve correctamente en modo light (default).
- Toggle a dark y verificar que todos los componentes cambien consistentemente.
- Verificar que CodeMirror cambie de tema.
- Verificar que la scrollbar custom funcione en ambos temas.

---

# Fase 2 — UX de edición

## Tarea 2.1 — Modal para creación de requerimientos (#1)

### Ejecución

#### Paso 1 — [NUEVO] [Modal.tsx](file:///home/nespina/repos/quagenticus/web/src/components/Modal.tsx)

Componente genérico reutilizable de modal (se usará también en otras tareas):

```tsx
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;  // default 'max-w-2xl'
}

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-2xl' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div ref={ref} className={`relative w-full ${maxWidth} bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
```

#### Paso 2 — [MODIFICAR] [RequirementsList.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementsList.tsx)

1. Importar `Modal`.
2. Eliminar el bloque inline `{showForm && (<form ...>)}` (líneas 78-131).
3. Reemplazar con:

```tsx
<Modal open={showForm} onClose={() => setShowForm(false)} title="Nuevo requerimiento">
  <form onSubmit={handleCreate} className="space-y-4">
    <input ... />  {/* Título — igual que antes */}
    <div className="grid grid-cols-2 gap-3">
      <select ... />  {/* Tracker — igual */}
      <select ... />  {/* Prioridad — igual */}
    </div>
    {/* Textarea GRANDE con toolbar markdown (Tarea 2.2) */}
    <div>
      <MarkdownToolbar target={textareaRef} />
      <textarea
        ref={textareaRef}
        placeholder="Descripción en Markdown (opcional)"
        value={form.body_md}
        onChange={e => setForm(f => ({ ...f, body_md: e.target.value }))}
        rows={10}  {/* ← Aumentado de 3 a 10 */}
        className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/60 font-mono resize-y min-h-[200px]"
      />
    </div>
    <div className="flex gap-2 pt-2">
      <button type="submit" ...>Crear requerimiento</button>
      <button type="button" onClick={() => setShowForm(false)} ...>Cancelar</button>
    </div>
  </form>
</Modal>
```

### Verificación

- Abrir modal con botón "Nuevo".
- Verificar que el textarea sea grande (10 filas mínimo, 200px min-height).
- Cerrar con Escape, clic en overlay, y botón X.
- Crear un requerimiento y verificar que el modal se cierra y la lista se actualiza.

---

## Tarea 2.2 — Barra de herramientas Markdown (#4)

### Ejecución

#### Paso 1 — [NUEVO] [MarkdownToolbar.tsx](file:///home/nespina/repos/quagenticus/web/src/components/MarkdownToolbar.tsx)

Componente que recibe un `ref` a un `<textarea>` o un callback para aplicar operaciones sobre un `EditorView` de CodeMirror:

```tsx
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, Heading4,
         List, ListOrdered, CheckSquare, Code, Quote, Minus, Link, Image } from 'lucide-react';

// Modo 1: textarea nativo
interface TextareaTarget {
  mode: 'textarea';
  ref: React.RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
}

// Modo 2: CodeMirror EditorView
interface CodeMirrorTarget {
  mode: 'codemirror';
  viewRef: React.RefObject<EditorView | null>;
}

type ToolbarTarget = TextareaTarget | CodeMirrorTarget;

interface Props {
  target: ToolbarTarget;
}
```

**Acciones implementadas** (cada una es una función que manipula el texto):

| Botón | Icono | Acción | Atajo |
|-------|-------|--------|-------|
| Negrita | `Bold` | Envolver selección en `**...**` | `Ctrl+B` |
| Cursiva | `Italic` | Envolver selección en `*...*` | `Ctrl+I` |
| Tachado | `Strikethrough` | Envolver selección en `~~...~~` | — |
| H1 | `Heading1` | Prefijar línea con `# ` | — |
| H2 | `Heading2` | Prefijar línea con `## ` | — |
| H3 | `Heading3` | Prefijar línea con `### ` | — |
| H4 | `Heading4` | Prefijar línea con `#### ` | — |
| Viñetas | `List` | Prefijar línea(s) con `- ` | — |
| Numerada | `ListOrdered` | Prefijar línea(s) con `1. ` (auto-incremento) | — |
| Checklist | `CheckSquare` | Prefijar línea(s) con `- [ ] ` | — |
| Código | `Code` | Envolver en `` ` `` (inline) o ` ``` ` (multi-línea) | `Ctrl+E` |
| Cita | `Quote` | Prefijar línea(s) con `> ` | — |
| Separador | `Minus` | Insertar `\n---\n` | — |
| Link | `Link` | Insertar `[texto](url)` | `Ctrl+K` |
| Imagen | `Image` | Insertar `![alt](url)` | — |

**Implementación interna:** Dos helpers dependiendo del modo:

- **textarea**: Leer `selectionStart`/`selectionEnd` del ref, manipular `value`, hacer `setSelectionRange` para re-posicionar el cursor, llamar `onChange`.
- **codemirror**: Usar `viewRef.current.dispatch({ changes: { from, to, insert } })` con la API de `@codemirror/state`.

El layout del componente es una barra horizontal con botones de 28×28px, separadores visuales entre grupos:

```
[B] [I] [S] | [H1] [H2] [H3] [H4] | [•] [1.] [☑] | [<>] [❝] [—] | [🔗] [🖼]
```

#### Paso 2 — [MODIFICAR] [DocumentEditor.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/DocumentEditor.tsx)

1. Importar `MarkdownToolbar`.
2. Obtener ref al `EditorView` de CodeMirror usando la prop `onCreateEditor`:

```tsx
import { EditorView } from '@codemirror/view';

const editorViewRef = useRef<EditorView | null>(null);

<CodeMirror
  onCreateEditor={(view) => { editorViewRef.current = view; }}
  // ...
/>
```

3. Insertar `<MarkdownToolbar>` entre el toolbar existente (línea 70) y el editor area (línea 110):

```tsx
{(mode === 'edit' || mode === 'split') && (
  <MarkdownToolbar target={{ mode: 'codemirror', viewRef: editorViewRef }} />
)}
```

#### Paso 3 — [MODIFICAR] [RequirementsList.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementsList.tsx)

Ya integrado en el modal de creación (Tarea 2.1, Paso 2):

```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);

<MarkdownToolbar target={{ mode: 'textarea', ref: textareaRef, onChange: (v) => setForm(f => ({ ...f, body_md: v })) }} />
<textarea ref={textareaRef} ... />
```

### Verificación

- En el editor de documentos: seleccionar texto, hacer clic en Bold → verificar que se envuelve en `**`.
- Probar cada botón de la toolbar.
- Verificar atajos `Ctrl+B`, `Ctrl+I`, `Ctrl+K`.
- En el modal de creación: mismas verificaciones con el textarea.

---

# Fase 3 — Página central de requerimiento

## Tarea 3.1 — Vista de detalle del requerimiento

### Justificación

Es requisito previo para comentarios (#5), miembros (#8), vincular documentos (#6), y adjuntar archivos (#9). Actualmente no existe una página de detalle — solo el listado en tabla.

### Ejecución

#### Paso 1 — [NUEVO] [RequirementDetail.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementDetail.tsx)

Layout de la página (dos columnas):

```
┌─────────────────────────────────────────────────┐
│ ← Volver    DEMO-42         🔧 Bug  ⬤ En Progreso │
├────────────────────────────────┬────────────────┤
│                                │  Estado        │
│  Título (editable)             │  Prioridad     │
│                                │  Tracker       │
│  Descripción (markdown         │  Asignado      │
│   renderizada/editable)        │  Reportero     │
│                                │  Miembros      │
│  ────────────────────          │  Milestone     │
│                                │  Categoría     │
│  Comentarios / Historial       │  Fechas        │
│  - Journal 1 (cambio estado)   │  % Completado  │
│  - Journal 2 (comentario)      │  DoR Score     │
│  - [Agregar comentario]        │                │
│                                │  Documentos    │
│                                │  vinculados    │
│                                │                │
│                                │  Archivos      │
│                                │  adjuntos      │
└────────────────────────────────┴────────────────┘
```

Estructura del componente:

```tsx
export default function RequirementDetail() {
  const { spaceId, reqId } = useParams();
  const { data: req } = useRequirement(reqId ?? '');
  const [editing, setEditing] = useState(false);
  // ...

  return (
    <div className="flex h-full">
      {/* Columna principal — 2/3 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header: ref_key + título editable + badges */}
        {/* Descripción: renderizada o editor con toolbar */}
        {/* Sección: Comentarios (Tarea 3.2) */}
      </div>

      {/* Sidebar derecho — 1/3 */}
      <aside className="w-80 border-l border-[var(--border)] p-5 overflow-y-auto space-y-5">
        {/* Campos de metadata */}
        {/* Miembros (Tarea 3.3) */}
        {/* Documentos vinculados (Fase 5) */}
        {/* Archivos adjuntos (Fase 5) */}
      </aside>
    </div>
  );
}
```

#### Paso 2 — [MODIFICAR] [App.tsx](file:///home/nespina/repos/quagenticus/web/src/App.tsx)

Agregar ruta anidada (después de línea 51):

```tsx
import RequirementDetail from './pages/RequirementDetail';

// Dentro de <Route path="/spaces/:spaceId" ...>:
<Route path="requirements/:reqId" element={<RequirementDetail />} />
```

#### Paso 3 — [MODIFICAR] [RequirementsList.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementsList.tsx)

Hacer las filas de la tabla clickeables. En la línea 159, agregar `onClick` al `<tr>`:

```tsx
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

<tr
  key={r.id}
  onClick={() => navigate(`/spaces/${spaceId}/requirements/${r.id}`)}
  className="hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
>
```

---

## Tarea 3.2 — Comentarios en requerimientos (#5)

### Ejecución

#### Paso 1 — [NUEVO] [journal.go](file:///home/nespina/repos/quagenticus/internal/models/journal.go)

```go
package models

import "time"

type JournalResponse struct {
    ID             string                 `json:"id"`
    DocumentID     string                 `json:"document_id"`
    ActorType      string                 `json:"actor_type"`
    ActorUserID    *string                `json:"actor_user_id"`
    ActorName      string                 `json:"actor_name"`    // resuelto vía JOIN
    NotesMD        *string                `json:"notes_md"`
    Details        []map[string]any       `json:"details"`
    CreatedAt      time.Time              `json:"created_at"`
}

type JournalCreate struct {
    NotesMD string `json:"notes_md" validate:"required,min=1"`
}
```

#### Paso 2 — [NUEVO] [journals.go](file:///home/nespina/repos/quagenticus/internal/handlers/journals.go)

Dos métodos:

**`List`** — `GET /requirements/:id/journals`

```go
func (h *Journals) List(w http.ResponseWriter, r *http.Request) {
    docID := chi.URLParam(r, "id")
    rows, err := h.db.Pool.Query(r.Context(), `
        SELECT j.id, j.document_id, j.actor_type,
               j.actor_user_id,
               COALESCE(u.display_name, 'Sistema') AS actor_name,
               j.notes_md, j.details, j.created_at
        FROM journal j
        LEFT JOIN app_user u ON u.id = j.actor_user_id
        WHERE j.document_id = $1
        ORDER BY j.created_at ASC
    `, docID)
    // ... scan loop ...
}
```

**`Create`** — `POST /requirements/:id/journals`

```go
func (h *Journals) Create(w http.ResponseWriter, r *http.Request) {
    docID := chi.URLParam(r, "id")
    actor := auth.ActorFrom(r.Context())
    var in models.JournalCreate
    // ... decode, validate ...
    
    var out models.JournalResponse
    err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
        return tx.QueryRow(r.Context(), `
            INSERT INTO journal (document_id, account_id, actor_type, actor_user_id, notes_md)
            VALUES ($1, current_setting('qg.account_id')::uuid, 'user', current_setting('qg.actor_id')::uuid, $2)
            RETURNING id, document_id, actor_type, actor_user_id, $2, '[]'::jsonb, created_at
        `, docID, in.NotesMD).Scan(&out.ID, &out.DocumentID, &out.ActorType, &out.ActorUserID, &out.NotesMD, &out.Details, &out.CreatedAt)
    })
    // ... respond ...
}
```

#### Paso 3 — [MODIFICAR] [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go)

Instanciar handler y registrar rutas:

```go
journalsH := handlers.NewJournals(database)

// Dentro del grupo protegido, junto a las rutas de requirements:
r.Get("/requirements/{id}/journals", journalsH.List)
r.Post("/requirements/{id}/journals", journalsH.Create)
```

#### Paso 4 — [MODIFICAR] [api.ts](file:///home/nespina/repos/quagenticus/web/src/lib/api.ts)

Agregar interface:

```typescript
export interface Journal {
  id: string;
  document_id: string;
  actor_type: 'user' | 'agent' | 'system';
  actor_user_id: string | null;
  actor_name: string;
  notes_md: string | null;
  details: Array<{ type: string; from?: string; to?: string; [key: string]: unknown }>;
  created_at: string;
}
```

#### Paso 5 — [NUEVO] [useJournals.ts](file:///home/nespina/repos/quagenticus/web/src/hooks/useJournals.ts)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Journal } from '../lib/api';

export function useJournals(requirementId: string) {
  return useQuery({
    queryKey: ['journals', requirementId],
    queryFn: () => api.get<Journal[]>(`/requirements/${requirementId}/journals`),
    enabled: !!requirementId,
  });
}

export function useCreateJournal(requirementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { notes_md: string }) =>
      api.post<Journal>(`/requirements/${requirementId}/journals`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journals', requirementId] }),
  });
}
```

#### Paso 6 — Integrar en [RequirementDetail.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementDetail.tsx)

En la columna principal, después de la descripción, agregar sección de comentarios:

```tsx
{/* Timeline de comentarios */}
<section className="space-y-4">
  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Actividad</h3>
  {journals.map(j => (
    <div key={j.id} className="flex gap-3">
      {/* Avatar */}
      <div className="h-8 w-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-xs font-bold text-[var(--accent-text)] shrink-0">
        {j.actor_name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-[var(--text-primary)]">{j.actor_name}</span>
          <span className="text-[var(--text-muted)]">{timeAgo(j.created_at)}</span>
        </div>
        {/* Si es cambio de estado (details) → badge de transición */}
        {j.details.some(d => d.type === 'status_changed') && (
          <StatusChangeBadge detail={j.details.find(d => d.type === 'status_changed')!} />
        )}
        {/* Si tiene notas → markdown renderizado */}
        {j.notes_md && <MarkdownPreview content={j.notes_md} />}
      </div>
    </div>
  ))}

  {/* Formulario nuevo comentario */}
  <form onSubmit={handleComment} className="space-y-2">
    <MarkdownToolbar target={{ mode: 'textarea', ref: commentRef, onChange: setCommentText }} />
    <textarea ref={commentRef} rows={4} ... />
    <button type="submit">Comentar</button>
  </form>
</section>
```

### Verificación

- Navegar a detalle de un requerimiento.
- Verificar que se muestra el historial (cambios de estado existentes del journal).
- Agregar un comentario → verificar que aparece en la timeline.
- Verificar que la toolbar Markdown funciona en el textarea de comentario.

---

## Tarea 3.3 — Miembros en requerimientos (#8)

### Ejecución

#### Paso 1 — [MODIFICAR] [requirements.go](file:///home/nespina/repos/quagenticus/internal/handlers/requirements.go)

Agregar método `ListMembers`. Después del método `RemoveMember` (línea 265):

```go
func (h *Requirements) ListMembers(w http.ResponseWriter, r *http.Request) {
    docID := chi.URLParam(r, "id")
    rows, err := h.db.Pool.Query(r.Context(), `
        SELECT rm.subject_type, rm.subject_id, rm.is_lead, rm.added_at,
               COALESCE(u.display_name, '') AS display_name,
               COALESCE(u.email, '') AS email
        FROM requirement_member rm
        LEFT JOIN app_user u ON u.id = rm.subject_id AND rm.subject_type = 'user'
        WHERE rm.document_id = $1
        ORDER BY rm.is_lead DESC, rm.added_at
    `, docID)
    // ... scan y respond ...
}
```

#### Paso 2 — [MODIFICAR] [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go)

Agregar ruta (junto a las rutas de members existentes, línea 92):

```go
r.Get("/requirements/{id}/members", reqsH.ListMembers)
```

#### Paso 3 — [NUEVO] [useMembers.ts](file:///home/nespina/repos/quagenticus/web/src/hooks/useMembers.ts)

```typescript
export function useRequirementMembers(requirementId: string) {
  return useQuery({
    queryKey: ['members', requirementId],
    queryFn: () => api.get<RequirementMember[]>(`/requirements/${requirementId}/members`),
    enabled: !!requirementId,
  });
}

export function useAddMember(requirementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { subject_type: 'user' | 'agent'; subject_id: string; is_lead: boolean }) =>
      api.post<void>(`/requirements/${requirementId}/members`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', requirementId] }),
  });
}

export function useRemoveMember(requirementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/requirements/${requirementId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', requirementId] }),
  });
}
```

#### Paso 4 — Endpoint para listar usuarios del espacio

Se necesita un endpoint para buscar usuarios al agregar miembros.

**[MODIFICAR]** [spaces.go](file:///home/nespina/repos/quagenticus/internal/handlers/spaces.go) — Agregar método `ListMembers`:

```go
func (h *Spaces) ListMembers(w http.ResponseWriter, r *http.Request) {
    spaceID := chi.URLParam(r, "spaceId")
    rows, err := h.db.Pool.Query(r.Context(), `
        SELECT sm.subject_id, u.display_name, u.email, sm.role
        FROM space_member sm
        JOIN app_user u ON u.id = sm.subject_id AND sm.subject_type = 'user'
        WHERE sm.space_id = $1
        ORDER BY u.display_name
    `, spaceID)
    // ...
}
```

**[MODIFICAR]** [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go):

```go
r.Get("/spaces/{spaceId}/members", spacesH.ListMembers)
```

#### Paso 5 — Integrar en [RequirementDetail.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/RequirementDetail.tsx)

En el sidebar derecho, sección "Miembros":

```tsx
<section>
  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">Miembros</h4>
  <div className="space-y-2">
    {members.map(m => (
      <div key={m.subject_id} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[var(--accent-soft)] ...">
            {m.display_name.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-sm text-[var(--text-primary)]">{m.display_name}</span>
          {m.is_lead && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-text)]">Lead</span>}
        </div>
        <button onClick={() => removeMember(m.subject_id)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    ))}
  </div>
  <button onClick={() => setShowAddMember(true)} className="...">
    <Plus /> Agregar miembro
  </button>
</section>
```

El botón "Agregar miembro" abre un modal (`Modal.tsx`) con un input de búsqueda que filtra los miembros del espacio y permite seleccionarlos.

---

# Fase 4 — Tablero interactivo

## Tarea 4.1 — Drag & Drop en el tablero Kanban (#3)

### Ejecución

#### Paso 1 — Instalar dependencia

```bash
cd web && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

#### Paso 2 — [NUEVO] Endpoint combinado de movimiento

**[NUEVO]** `PATCH /requirements/:id/move` que combine transición + reposicionamiento en una transacción.

**[MODIFICAR]** [requirement.go](file:///home/nespina/repos/quagenticus/internal/models/requirement.go) — Agregar struct:

```go
type MoveRequest struct {
    ToStatusID *string `json:"to_status_id" validate:"omitempty,uuid"`
    BeforeID   *string `json:"before_id"    validate:"omitempty,uuid"`
    AfterID    *string `json:"after_id"     validate:"omitempty,uuid"`
}
```

**[NUEVO]** SQL function en [requirement_functions.sql](file:///home/nespina/repos/quagenticus/db/requirement/requirement_functions.sql):

```sql
CREATE OR REPLACE FUNCTION requirement_move(
    p_id           uuid,
    p_to_status_id uuid DEFAULT NULL,
    p_before_id    uuid DEFAULT NULL,
    p_after_id     uuid DEFAULT NULL
) RETURNS void AS $$
BEGIN
    -- Transición de estado (si se solicita)
    IF p_to_status_id IS NOT NULL THEN
        PERFORM requirement_transition(p_id, p_to_status_id);
    END IF;
    -- Reordenar
    IF p_before_id IS NOT NULL OR p_after_id IS NOT NULL THEN
        PERFORM requirement_reorder(p_id, p_before_id, p_after_id);
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**[MODIFICAR]** [requirements.go](file:///home/nespina/repos/quagenticus/internal/handlers/requirements.go) — Agregar método `Move`:

```go
func (h *Requirements) Move(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    actor := auth.ActorFrom(r.Context())
    var in models.MoveRequest
    // ... decode ...
    err := h.db.WithActor(r.Context(), actor, func(tx pgx.Tx) error {
        _, err := tx.Exec(r.Context(),
            `SELECT requirement_move($1, $2, $3, $4)`,
            id, in.ToStatusID, in.BeforeID, in.AfterID)
        return err
    })
    // ...
    w.WriteHeader(http.StatusNoContent)
}
```

**[MODIFICAR]** [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go):

```go
r.Patch("/requirements/{id}/move", reqsH.Move)
```

#### Paso 3 — [MODIFICAR] [useBoard.ts](file:///home/nespina/repos/quagenticus/web/src/hooks/useBoard.ts) (o useRequirements.ts)

Agregar mutación:

```typescript
export function useMoveCardToColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to_status_id, before_id, after_id }: {
      id: string;
      to_status_id?: string;
      before_id?: string;
      after_id?: string;
    }) => api.patch<void>(`/requirements/${id}/move`, { to_status_id, before_id, after_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['requirements'] });
    },
  });
}
```

#### Paso 4 — [MODIFICAR] [Board.tsx](file:///home/nespina/repos/quagenticus/web/src/pages/Board.tsx) — Reescritura completa

La estructura cambia a:

```tsx
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableCard({ card }: { card: BoardCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { card },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card card={card} />
    </div>
  );
}

function DroppableColumn({ column, cards }: { column: BoardColumn; cards: BoardCard[] }) {
  return (
    <div className="... min-w-[280px] w-72 ...">
      {/* Header de columna */}
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2.5 min-h-[200px]">
          {cards.map(card => <SortableCard key={card.id} card={card} />)}
        </div>
      </SortableContext>
    </div>
  );
}

export default function Board() {
  const moveCard = useMoveCardToColumn();
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (event) => {
    setActiveCard(event.active.data.current?.card ?? null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Determinar columna destino y vecinos (before_id, after_id)
    // Si la columna destino tiene un status_id diferente → incluir to_status_id
    // Calcular before_id/after_id basado en la posición de drop

    moveCard.mutate({
      id: activeId,
      to_status_id: targetColumn.status_id !== sourceColumn.status_id ? targetColumn.status_id : undefined,
      before_id: neighborAbove?.id,
      after_id: neighborBelow?.id,
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {board.columns.map(col => (
          <DroppableColumn key={col.id} column={col} cards={col.cards} />
        ))}
      </div>
      <DragOverlay>
        {activeCard && <Card card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}
```

**Nota sobre actualización optimista:** Para evitar el "flash" de la card regresando a su posición original mientras el server responde, se debe:

1. Al `onDragEnd`, recalcular el estado local del board moviendo la card en el array inmediatamente.
2. Usar `onMutate` de React Query para actualizar el cache optimistamente.
3. En `onError`, revertir al estado anterior.

### Verificación

- Arrastrar card hacia arriba/abajo en la misma columna → verificar que se reordena y persiste al refrescar.
- Arrastrar card de una columna a otra → verificar que el estado del requerimiento cambia automáticamente.
- Verificar WIP limit warning si la columna destino está llena.
- Refrescar la página y verificar que el orden se mantiene.

---

# Fase 5 — Contenido enriquecido

## Tarea 5.1 — Vincular documentos a requerimientos (#6)

### Ejecución

#### Paso 1 — [MODIFICAR] [document_link_functions.sql](file:///home/nespina/repos/quagenticus/db/document/document_link_functions.sql)

Actualmente está vacío. Agregar funciones:

```sql
CREATE OR REPLACE FUNCTION document_link_create(
    p_source_id  uuid,
    p_target_id  uuid,
    p_link_type  link_type DEFAULT 'relates',
    p_note       text DEFAULT NULL
) RETURNS document_link AS $$
DECLARE
    v_link document_link;
BEGIN
    INSERT INTO document_link (source_id, target_id, link_type, note, creator_id)
    VALUES (p_source_id, p_target_id, p_link_type, p_note, qg_actor_id())
    ON CONFLICT (source_id, target_id, link_type) WHERE target_id IS NOT NULL
    DO UPDATE SET note = EXCLUDED.note
    RETURNING * INTO v_link;
    RETURN v_link;
END;
$$ LANGUAGE plpgsql;
```

#### Paso 2 — [NUEVO] [links.go](file:///home/nespina/repos/quagenticus/internal/handlers/links.go)

Tres endpoints:

- `GET /requirements/:id/links` — Listar links (outgoing + incoming) con título del documento target.
- `POST /requirements/:id/links` — Crear link. Body: `{ target_id, link_type, note }`.
- `DELETE /links/:linkId` — Eliminar un link.

Query de `List`:

```sql
-- Outgoing links
SELECT dl.id, dl.target_id, d.title AS target_title, d.doc_type AS target_doc_type,
       dl.link_type, dl.note, dl.created_at
FROM document_link dl
JOIN document d ON d.id = dl.target_id
WHERE dl.source_id = $1
UNION ALL
-- Incoming links (backlinks)
SELECT dl.id, dl.source_id, d.title, d.doc_type,
       dl.link_type, dl.note, dl.created_at
FROM document_link dl
JOIN document d ON d.id = dl.source_id
WHERE dl.target_id = $1
ORDER BY created_at DESC
```

#### Paso 3 — [MODIFICAR] [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go)

```go
linksH := handlers.NewLinks(database)

r.Get("/requirements/{id}/links", linksH.List)
r.Post("/requirements/{id}/links", linksH.Create)
r.Delete("/links/{linkId}", linksH.Delete)
```

#### Paso 4 — Frontend

**[NUEVO]** `web/src/hooks/useDocumentLinks.ts` — Hooks CRUD.

**[NUEVO]** `web/src/components/LinkDocumentModal.tsx` — Modal con buscador de documentos (usa `GET /spaces/:spaceId/documents` que ya existe). Muestra lista filtrable de documentos del espacio y dropdown de tipo de link (`relates`, `specifies`, `implements`, `blocks`).

**[MODIFICAR]** `RequirementDetail.tsx` — Agregar sección "Documentos vinculados" en el sidebar:

```tsx
<section>
  <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2">Documentos vinculados</h4>
  {links.map(link => (
    <div key={link.id} className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <Link to={`/spaces/${spaceId}/docs/${link.target_id}`} className="text-sm text-[var(--accent-text)] hover:underline">
          {link.target_title}
        </Link>
        <span className="text-[10px] text-[var(--text-muted)]">{link.link_type}</span>
      </div>
      <button onClick={() => removeLink(link.id)}>
        <X className="h-3 w-3" />
      </button>
    </div>
  ))}
  <button onClick={() => setShowLinkModal(true)}>
    <Plus /> Vincular documento
  </button>
</section>
```

---

## Tarea 5.2 — Adjuntar archivos a requerimientos (#9)

### Ejecución

#### Paso 1 — [NUEVO] [storage.go](file:///home/nespina/repos/quagenticus/internal/storage/storage.go)

```go
package storage

import "io"

type Storage interface {
    Put(key string, r io.Reader, contentType string) error
    Get(key string) (io.ReadCloser, error)
    Delete(key string) error
    URL(key string) string  // URL pública o path para download
}
```

#### Paso 2 — [NUEVO] [local.go](file:///home/nespina/repos/quagenticus/internal/storage/local.go)

Implementación que guarda en filesystem local (`./data/attachments/`):

```go
type Local struct {
    BasePath string
}

func NewLocal(basePath string) *Local {
    os.MkdirAll(basePath, 0755)
    return &Local{BasePath: basePath}
}

func (l *Local) Put(key string, r io.Reader, contentType string) error {
    path := filepath.Join(l.BasePath, key)
    os.MkdirAll(filepath.Dir(path), 0755)
    f, err := os.Create(path)
    if err != nil { return err }
    defer f.Close()
    _, err = io.Copy(f, r)
    return err
}

func (l *Local) Get(key string) (io.ReadCloser, error) {
    return os.Open(filepath.Join(l.BasePath, key))
}

func (l *Local) Delete(key string) error {
    return os.Remove(filepath.Join(l.BasePath, key))
}
```

#### Paso 3 — [NUEVO] [attachments.go](file:///home/nespina/repos/quagenticus/internal/handlers/attachments.go)

Cuatro endpoints:

**`POST /requirements/:id/attachments`** — Upload (multipart/form-data):

```go
func (h *Attachments) Upload(w http.ResponseWriter, r *http.Request) {
    docID := chi.URLParam(r, "id")
    // Limitar tamaño: r.Body = http.MaxBytesReader(w, r.Body, 25<<20)  // 25MB
    file, header, err := r.FormFile("file")
    // SHA-256 del contenido para deduplicación
    hasher := sha256.New()
    tee := io.TeeReader(file, hasher)
    // Generar storage_key: account_id/document_id/uuid.ext
    storageKey := fmt.Sprintf("%s/%s/%s%s", accountID, docID, uuid.New().String(), filepath.Ext(header.Filename))
    h.storage.Put(storageKey, tee, header.Header.Get("Content-Type"))
    // INSERT INTO attachment (...)
}
```

**`GET /requirements/:id/attachments`** — Listar.

**`GET /attachments/:id/download`** — Descargar archivo.

**`DELETE /attachments/:id`** — Eliminar.

#### Paso 4 — [MODIFICAR] [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go)

```go
store := storage.NewLocal("./data/attachments")
attachH := handlers.NewAttachments(database, store)

r.Post("/requirements/{id}/attachments", attachH.Upload)
r.Get("/requirements/{id}/attachments", attachH.List)
r.Get("/attachments/{id}/download", attachH.Download)
r.Delete("/attachments/{id}", attachH.Delete)
```

#### Paso 5 — [MODIFICAR] [api.ts](file:///home/nespina/repos/quagenticus/web/src/lib/api.ts)

Agregar método para upload con `FormData`:

```typescript
export const api = {
  // ... métodos existentes ...
  upload: async <T>(path: string, file: File): Promise<T> => {
    const token = localStorage.getItem('qg_token');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
    // ... error handling ...
    return await res.json();
  },
};
```

Agregar interface:

```typescript
export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  is_inline: boolean;
  width: number | null;
  height: number | null;
  created_at: string;
}
```

#### Paso 6 — Frontend

**[NUEVO]** `web/src/hooks/useAttachments.ts` — Hooks para listar, subir, eliminar.

**[NUEVO]** `web/src/components/FileDropZone.tsx` — Componente de drag-and-drop de archivos:

```tsx
// Usa dragenter/dragover/drop del DOM nativo
// Muestra zona visual "Arrastra archivos aquí" al entrar
// Muestra progreso de upload
// Permite click para abrir file picker
// Muestra thumbnails para imágenes (usando URL.createObjectURL)
```

**[MODIFICAR]** `RequirementDetail.tsx` — Sección "Archivos adjuntos" en el sidebar:

```tsx
<section>
  <h4>Archivos adjuntos</h4>
  {attachments.map(a => (
    <div key={a.id} className="flex items-center gap-2 py-1.5">
      {a.content_type.startsWith('image/') ? (
        <img src={`/api/v1/attachments/${a.id}/download`} className="h-10 w-10 rounded object-cover" />
      ) : (
        <Paperclip className="h-4 w-4" />
      )}
      <div>
        <a href={`/api/v1/attachments/${a.id}/download`} target="_blank" className="text-sm text-[var(--accent-text)]">
          {a.filename}
        </a>
        <span className="text-[10px] text-[var(--text-muted)]">{formatBytes(a.byte_size)}</span>
      </div>
      <button onClick={() => removeAttachment(a.id)}><X /></button>
    </div>
  ))}
  <FileDropZone onUpload={(file) => uploadAttachment.mutate(file)} />
</section>
```

---

# Fase 6 — Funcionalidades Redmine adicionales (#10)

## Tarea 6.1 — Campos ya existentes en DB que solo necesitan UI

Estos campos **ya existen** en la tabla `requirement` y en `RequirementUpdate` del modelo Go, pero no se exponen en el frontend:

| Campo | Tabla | Cambio necesario |
|-------|-------|-----------------|
| `done_ratio` | `requirement` | Agregar al response del API (JOIN no requerido, solo agregar campo al SELECT y Scan). En la UI: barra de progreso editable con dropdown 0-100% en RequirementDetail sidebar. |
| `estimated_hours` | `requirement` | Agregar al response. Campo numérico editable en sidebar. |
| `spent_hours` | `requirement` | Agregar al response. Solo lectura en sidebar (se incrementa vía time entries futuras). |
| `start_date` | `requirement` | Agregar al response. Date picker en sidebar. |
| `due_date` | `requirement` | Agregar al response. Date picker en sidebar. |

### Ejecución concreta

**[MODIFICAR]** [requirement.go](file:///home/nespina/repos/quagenticus/internal/models/requirement.go) — Agregar 5 campos a `RequirementResponse`:

```go
DoneRatio      int       `json:"done_ratio"`
EstimatedHours *float64  `json:"estimated_hours"`
SpentHours     float64   `json:"spent_hours"`
StartDate      *string   `json:"start_date"`
DueDate        *string   `json:"due_date"`
```

**[MODIFICAR]** [requirements.go](file:///home/nespina/repos/quagenticus/internal/handlers/requirements.go) — Agregar estos campos a los SELECT y Scan de las 3 queries.

**[MODIFICAR]** [api.ts](file:///home/nespina/repos/quagenticus/web/src/lib/api.ts) — Agregar campos al interface `Requirement`.

**[MODIFICAR]** RequirementDetail.tsx — Agregar controles editables en el sidebar.

---

## Tarea 6.2 — Etiquetas (Labels)

Las tablas `label` y `document_label` ya existen. El catálogo `GET /catalogs/labels` ya existe en el router.

### Ejecución

**[MODIFICAR]** [documents.go](file:///home/nespina/repos/quagenticus/internal/handlers/documents.go) — Agregar endpoints:
- `POST /requirements/:id/labels` — body: `{ label_id }` → INSERT INTO document_label.
- `DELETE /requirements/:id/labels/:labelId` — DELETE FROM document_label.

**[MODIFICAR]** [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go) — Registrar rutas.

**Frontend**: En RequirementDetail.tsx sidebar, sección "Etiquetas" con chips de colores. Botón "+" abre dropdown/combobox con las labels disponibles del catálogo.

---

## Tarea 6.3 — Sub-requerimientos

El campo `parent_id` ya existe en la tabla `requirement`. El modelo `RequirementCreate` ya acepta `parent_id`.

### Ejecución

**[MODIFICAR]** RequirementDetail.tsx — Agregar sección "Sub-requerimientos" en la columna principal:
- Listar requerimientos cuyo `parent_id` sea el actual (nuevo query).
- Botón "Agregar sub-requerimiento" → abre el mismo modal de creación pero con `parent_id` pre-llenado.

**[MODIFICAR]** [requirements.go](file:///home/nespina/repos/quagenticus/internal/handlers/requirements.go) — Agregar endpoint `GET /requirements/:id/children` para listar sub-requerimientos.

---

## Tarea 6.4 — Milestones

La tabla `milestone` existe pero no tiene endpoints.

### Ejecución

**[NUEVO]** [milestones.go](file:///home/nespina/repos/quagenticus/internal/handlers/milestones.go) — CRUD: List, Create, Update, Delete por espacio.

**[MODIFICAR]** [main.go](file:///home/nespina/repos/quagenticus/cmd/quagenticus-api/main.go):

```go
r.Get("/spaces/{spaceId}/milestones", milestonesH.List)
r.Post("/spaces/{spaceId}/milestones", milestonesH.Create)
r.Patch("/milestones/{id}", milestonesH.Update)
r.Delete("/milestones/{id}", milestonesH.Delete)
```

**Frontend**: Select de milestone en RequirementDetail sidebar. Página de milestones (futura, baja prioridad).

---

## Tarea 6.5 — Categorías

La tabla `category` existe pero no tiene endpoints.

### Ejecución

**[NUEVO]** Handler de categorías CRUD similar a milestones.

**[MODIFICAR]** main.go — Registrar rutas.

**Frontend**: Select de categoría en RequirementDetail sidebar y en modal de creación.

---

## Tarea 6.6 — Relaciones entre requerimientos

Usa la misma tabla `document_link` que la Tarea 5.1, pero entre requerimientos (en lugar de req → documento).

### Ejecución

Reutilizar el componente `LinkDocumentModal.tsx` pero filtrando por `doc_type = 'requirement'` y mostrando tipos de link relevantes: `blocks`, `blocked_by`, `duplicates`, `duplicated_by`, `precedes`, `follows`.

Agregar sección "Relaciones" en RequirementDetail.tsx columna principal.

---

## Tareas de prioridad baja (solo especificación)

| Tarea | Detalle resumido |
|-------|-----------------|
| **Watchers** | Nueva tabla `requirement_watcher(document_id, user_id)`. Endpoint CRUD. UI: botón "Observar" en detalle. |
| **Filtros avanzados** | Panel expandible en RequirementsList con selects para estado, prioridad, tracker, asignado, milestone, labels. Guardar filtros en `localStorage`. |
| **Notificaciones** | Crear tabla `notification` con triggers en journal para notificar a watchers y miembros. UI: icono campanita en header con badge. |
| **Campos personalizados** | Tablas `custom_field` y `custom_field_value`. Admin UI. Fase muy posterior. |
| **Exportación CSV/PDF** | CSV: generar desde el backend con `encoding/csv`. PDF: usar librería como `wkhtmltopdf` o generar en el frontend con `jsPDF`. |

---

## Resumen de archivos nuevos por fase

### Fase 1
| Archivo | Tipo |
|---------|------|
| `web/src/lib/theme.ts` | [NUEVO] |

### Fase 2
| Archivo | Tipo |
|---------|------|
| `web/src/components/Modal.tsx` | [NUEVO] |
| `web/src/components/MarkdownToolbar.tsx` | [NUEVO] |

### Fase 3
| Archivo | Tipo |
|---------|------|
| `web/src/pages/RequirementDetail.tsx` | [NUEVO] |
| `web/src/hooks/useJournals.ts` | [NUEVO] |
| `web/src/hooks/useMembers.ts` | [NUEVO] |
| `internal/models/journal.go` | [NUEVO] |
| `internal/handlers/journals.go` | [NUEVO] |

### Fase 4
| Archivo | Tipo |
|---------|------|
| `db/requirement/requirement_functions.sql` | [MODIFICAR] — agregar `requirement_move()` |

### Fase 5
| Archivo | Tipo |
|---------|------|
| `internal/storage/storage.go` | [NUEVO] |
| `internal/storage/local.go` | [NUEVO] |
| `internal/handlers/attachments.go` | [NUEVO] |
| `internal/handlers/links.go` | [NUEVO] |
| `internal/models/attachment.go` | [NUEVO] |
| `web/src/hooks/useAttachments.ts` | [NUEVO] |
| `web/src/hooks/useDocumentLinks.ts` | [NUEVO] |
| `web/src/components/FileDropZone.tsx` | [NUEVO] |
| `web/src/components/LinkDocumentModal.tsx` | [NUEVO] |

### Fase 6
| Archivo | Tipo |
|---------|------|
| `internal/handlers/milestones.go` | [NUEVO] |
| `internal/handlers/categories.go` | [NUEVO] |

---

## Verificación global al final de cada fase

1. `go build ./cmd/quagenticus-api/` — Backend compila sin errores.
2. `cd web && npm run build` — Frontend compila sin errores de TypeScript.
3. Pruebas manuales con la aplicación corriendo contra la base de datos demo.
4. Verificar que la migración de tema no rompe ninguna vista (ambos modos light/dark).
