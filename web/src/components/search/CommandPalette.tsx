import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { FileText, GitCommit, Kanban, LayoutDashboard, ListTodo, Moon, Plus, Search, Settings, Folder } from 'lucide-react';
import Modal from '../ui/Modal';
import { Kbd } from '../ui/misc';
import { useSearch } from '../../hooks/useSearch';
import { useSpaces } from '../../hooks/useSpaces';
import { useTheme } from '../../lib/theme';

export const usePalette = create<{ open: boolean; setOpen: (v: boolean) => void; onCreate?: () => void; setOnCreate: (f?: () => void) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  setOnCreate: (onCreate) => set({ onCreate }),
}));

interface Item {
  id: string;
  label: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Ctrl/⌘+K: jump to #refs, search everything and run common actions. */
export default function CommandPalette({ spaceId, spaceKey }: { spaceId?: string; spaceKey?: string }) {
  const { open, setOpen, onCreate } = usePalette();
  const navigate = useNavigate();
  const toggleTheme = useTheme((s) => s.toggleTheme);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const { data: spaces = [] } = useSpaces();
  const { data: results = [] } = useSearch(debounced.replace(/^#/, ''), undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!usePalette.getState().open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ('');
    setActive(0);
  }, [open, debounced]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const needle = q.trim().toLowerCase();
    const ref = /^#?(?:([A-Za-z][A-Za-z0-9]{1,9})-)?(\d+)$/.exec(q.trim());
    if (ref && results.length === 0 && spaceKey) {
      const key = `${(ref[1] ?? spaceKey).toUpperCase()}-${ref[2]}`;
      out.push({ id: 'jump', icon: <GitCommit className="h-4 w-4" />, label: <>Buscar <b>{key}</b></>, run: () => setDebounced(key) });
    }
    for (const r of results) {
      out.push({
        id: r.id,
        icon: r.doc_type === 'requirement' ? <GitCommit className="h-4 w-4 text-[var(--accent-text)]" /> : <FileText className="h-4 w-4 text-emerald-500" />,
        label: (
          <span className="truncate">
            {r.ref_key && <span className="font-mono text-[var(--accent-text)] mr-1.5">{r.ref_key}</span>}
            {r.title}
          </span>
        ),
        hint: r.status_name ?? r.space_key,
        run: () => go(r.doc_type === 'requirement' ? `/spaces/${r.space_id}/requirements/${r.id}` : `/spaces/${r.space_id}/docs/${r.id}`),
      });
    }
    const actions: Item[] = [];
    if (spaceId) {
      if (onCreate) actions.push({ id: 'new', icon: <Plus className="h-4 w-4" />, label: 'Crear requerimiento', hint: 'C', run: () => { setOpen(false); onCreate(); } });
      actions.push(
        { id: 'board', icon: <Kanban className="h-4 w-4" />, label: 'Ir al tablero', run: () => go(`/spaces/${spaceId}/board`) },
        { id: 'list', icon: <ListTodo className="h-4 w-4" />, label: 'Ir a requerimientos', run: () => go(`/spaces/${spaceId}/requirements`) },
        { id: 'docs', icon: <FileText className="h-4 w-4" />, label: 'Ir a documentos', run: () => go(`/spaces/${spaceId}/docs`) },
        { id: 'settings', icon: <Settings className="h-4 w-4" />, label: 'Configuración del espacio', run: () => go(`/spaces/${spaceId}/settings`) },
      );
    }
    actions.push(
      { id: 'work', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Mi trabajo', run: () => go('/my-work') },
      { id: 'search', icon: <Search className="h-4 w-4" />, label: q ? `Buscar «${q}» en todo` : 'Búsqueda avanzada', run: () => go(`/search?q=${encodeURIComponent(q)}`) },
      { id: 'theme', icon: <Moon className="h-4 w-4" />, label: 'Cambiar tema claro/oscuro', run: () => { toggleTheme(); setOpen(false); } },
      ...spaces.filter((s) => s.id !== spaceId).map((s) => ({ id: `space-${s.id}`, icon: <Folder className="h-4 w-4" />, label: `Cambiar a ${s.name}`, hint: s.key, run: () => go(`/spaces/${s.id}/board`) })),
    );
    out.push(...actions.filter((a) => !needle || String(a.label).toLowerCase().includes(needle) || a.id === 'search'));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, results, spaces, spaceId, spaceKey, onCreate]);

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Ir a…" className="max-w-xl">
      <div className="space-y-2 -m-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
            }}
            placeholder="#123, título, documento o acción…"
            className="input pl-9 text-sm"
          />
        </div>
        <ul role="listbox" className="max-h-[55vh] overflow-y-auto">
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={it.run}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left ${i === active ? 'bg-[var(--accent-soft)]' : ''}`}
              >
                <span className="text-[var(--text-muted)] shrink-0">{it.icon}</span>
                <span className="flex-1 min-w-0 truncate text-[var(--text-primary)]">{it.label}</span>
                {it.hint && <span className="text-[10px] text-[var(--text-muted)] shrink-0">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="px-3 text-[10px] text-[var(--text-muted)] flex gap-2"><Kbd>↑↓</Kbd> navegar <Kbd>Enter</Kbd> abrir <Kbd>Esc</Kbd> cerrar</p>
      </div>
    </Modal>
  );
}
