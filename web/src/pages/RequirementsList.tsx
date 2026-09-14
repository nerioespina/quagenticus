import { useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bookmark, CalendarDays, Columns3, ListTodo, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import CreateRequirementModal from '../components/requirement/CreateRequirementModal';
import Popover from '../components/ui/Popover';
import { AvatarStack } from '../components/ui/Avatar';
import { Badge, EmptyState, LabelChip, Skeleton } from '../components/ui/misc';
import { confirmDialog } from '../components/ui/Confirm';
import { useBulkUpdate, useRequirementPage } from '../hooks/useRequirements';
import { useMilestones, usePriorities, useSpaceLabels, useStatuses, useTrackers } from '../hooks/useCatalogs';
import { useSpaceMembers } from '../hooks/useSpaces';
import { useSavedViewMutations, useSavedViews } from '../hooks/useViews';
import { errorMessage } from '../lib/api';
import { dueState, formatDate, formatRelative } from '../lib/dates';
import type { SpaceContext } from '../components/layout/AppLayout';

const FILTER_KEYS = ['q', 'status_id', 'tracker_id', 'priority_id', 'assignee', 'label_id', 'milestone_id', 'open', 'overdue', 'sort', 'dir'] as const;
const PAGE = 50;
const OPTIONAL_COLUMNS = { members: 'Miembros', due: 'Fecha límite', milestone: 'Hito', updated: 'Actualizado', done: 'Avance', dor: 'DoR' } as const;
type OptionalColumn = keyof typeof OPTIONAL_COLUMNS;

function loadColumns(): OptionalColumn[] {
  try {
    return JSON.parse(localStorage.getItem('qg_list_columns') ?? '') as OptionalColumn[];
  } catch {
    return ['members', 'due', 'updated'];
  }
}

export default function RequirementsList() {
  const { spaceId, space } = useOutletContext<SpaceContext>();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<OptionalColumn[]>(loadColumns);
  const { data: statuses = [] } = useStatuses();
  const { data: trackers = [] } = useTrackers();
  const { data: priorities = [] } = usePriorities();
  const { data: labels = [] } = useSpaceLabels(spaceId);
  const { data: milestones = [] } = useMilestones(spaceId);
  const { data: members = [] } = useSpaceMembers(spaceId);
  const { data: views = [] } = useSavedViews(spaceId);
  const viewMutations = useSavedViewMutations(spaceId);
  const bulk = useBulkUpdate(spaceId);

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    FILTER_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) f[k] = v;
    });
    if (!params.has('open') && !params.has('status_id')) f.open = 'true';
    return f;
  }, [params]);
  const offset = Number(params.get('offset') ?? 0);
  const { data, isLoading, isFetching } = useRequirementPage(spaceId, { ...filters, limit: String(PAGE), offset: String(offset) });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const setFilter = (key: string, value: string | null) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      p.delete('offset');
      return p;
    });

  const sortBy = (key: string) => {
    const current = params.get('sort') ?? 'updated';
    const dir = current === key && params.get('dir') !== 'asc' ? 'asc' : 'desc';
    setParams((p) => { p.set('sort', key); p.set('dir', dir); return p; });
  };

  const SortHeader = ({ k, children, className = '' }: { k: string; children: React.ReactNode; className?: string }) => {
    const active = (params.get('sort') ?? 'updated') === k;
    return (
      <th className={`py-2.5 px-3 ${className}`} aria-sort={active ? (params.get('dir') === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]">
          {children}
          {active && (params.get('dir') === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      </th>
    );
  };

  const toggleColumn = (c: OptionalColumn) => {
    setColumns((cols) => {
      const next = cols.includes(c) ? cols.filter((x) => x !== c) : [...cols, c];
      localStorage.setItem('qg_list_columns', JSON.stringify(next));
      return next;
    });
  };

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const runBulk = (data: Parameters<typeof bulk.mutate>[0], label: string) =>
    bulk.mutate(data, {
      onSuccess: () => {
        toast.success(`${label} aplicado a ${data.ids.length} requerimientos`);
        setSelected(new Set());
      },
      onError: (e) => toast.error(errorMessage(e)),
    });

  const select = (label: string, key: string, options: { value: string; label: string }[], allLabel = 'Todos') => (
    <select aria-label={label} value={params.get(key) ?? ''} onChange={(e) => setFilter(key, e.target.value || null)} className="input w-auto py-1 text-xs max-w-[160px]">
      <option value="">{label}: {allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const activeFilters = FILTER_KEYS.filter((k) => params.get(k) && k !== 'sort' && k !== 'dir');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Requerimientos</h2>
        <span className="text-xs text-[var(--text-muted)]">{total} resultados</span>
        <div className="ml-auto flex items-center gap-2">
          <Popover
            align="end"
            width={260}
            trigger={({ toggle, ref }) => (
              <button ref={ref} type="button" onClick={toggle} className="btn-ghost text-xs"><Bookmark className="h-3.5 w-3.5" /> Vistas</button>
            )}
          >
            {(close) => (
              <div className="py-1">
                {views.length === 0 && <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Sin vistas guardadas.</p>}
                {views.map((v) => (
                  <div key={v.id} className="flex items-center group">
                    <button type="button" className="menu-item flex-1" onClick={() => { setParams(new URLSearchParams(v.filters)); close(); }}>
                      {v.name}
                      {v.is_shared && <span className="ml-auto text-[10px] text-[var(--text-muted)]">compartida</span>}
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar vista ${v.name}`}
                      className="icon-btn opacity-0 group-hover:opacity-100 mr-1"
                      onClick={() => viewMutations.remove.mutate(v.id, { onError: (e) => toast.error(errorMessage(e)) })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="border-t border-[var(--border-color)] mt-1 pt-1">
                  <button
                    type="button"
                    className="menu-item"
                    onClick={async () => {
                      close();
                      const name = await confirmDialog({ title: 'Guardar vista', message: 'Guarda los filtros y el orden actuales.', input: { label: 'Nombre', required: true }, confirmLabel: 'Guardar' });
                      if (name === false) return;
                      const f: Record<string, string> = {};
                      params.forEach((v, k) => k !== 'offset' && (f[k] = v));
                      viewMutations.create.mutate({ name, filters: f, shared: false }, { onSuccess: () => toast.success('Vista guardada'), onError: (e) => toast.error(errorMessage(e)) });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Guardar vista actual
                  </button>
                </div>
              </div>
            )}
          </Popover>
          <Popover
            align="end"
            width={200}
            trigger={({ toggle, ref }) => (
              <button ref={ref} type="button" onClick={toggle} className="btn-ghost text-xs"><Columns3 className="h-3.5 w-3.5" /> Columnas</button>
            )}
          >
            <div className="py-1">
              {(Object.keys(OPTIONAL_COLUMNS) as OptionalColumn[]).map((c) => (
                <label key={c} className="menu-item cursor-pointer">
                  <input type="checkbox" checked={columns.includes(c)} onChange={() => toggleColumn(c)} className="accent-[var(--accent-color)]" />
                  {OPTIONAL_COLUMNS[c]}
                </label>
              ))}
            </div>
          </Popover>
          {space?.my_role !== 'viewer' && (
            <button type="button" onClick={() => setCreating(true)} className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Nuevo</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            defaultValue={params.get('q') ?? ''}
            key={params.get('q') ?? ''}
            onKeyDown={(e) => e.key === 'Enter' && setFilter('q', (e.target as HTMLInputElement).value.trim() || null)}
            onBlur={(e) => e.target.value.trim() !== (params.get('q') ?? '') && setFilter('q', e.target.value.trim() || null)}
            placeholder="Clave o título…"
            className="input py-1 pl-7 text-xs w-44"
          />
        </div>
        <select aria-label="Abiertos o cerrados" value={params.get('open') ?? (params.has('status_id') ? '' : 'true')} onChange={(e) => setFilter('open', e.target.value || 'all')} className="input w-auto py-1 text-xs">
          <option value="true">Abiertos</option>
          <option value="false">Cerrados</option>
          <option value="all">Todos</option>
        </select>
        {select('Estado', 'status_id', statuses.map((s) => ({ value: s.id, label: s.name })))}
        {select('Tipo', 'tracker_id', trackers.map((t) => ({ value: t.id, label: `${t.icon ?? ''} ${t.name}` })))}
        {select('Prioridad', 'priority_id', priorities.map((p) => ({ value: p.id, label: p.name })))}
        {select('Asignado', 'assignee', [{ value: 'me', label: 'A mí' }, { value: 'none', label: 'Sin asignar' }, ...members.map((m) => ({ value: m.id, label: m.display_name }))], 'Cualquiera')}
        {select('Etiqueta', 'label_id', labels.map((l) => ({ value: l.id, label: l.name })))}
        {select('Hito', 'milestone_id', milestones.map((m) => ({ value: m.id, label: m.name })))}
        <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={params.get('overdue') === 'true'} onChange={(e) => setFilter('overdue', e.target.checked ? 'true' : null)} className="accent-[var(--accent-color)]" />
          Vencidos
        </label>
        {activeFilters.length > 0 && (
          <button type="button" className="btn-ghost text-xs" onClick={() => setParams(new URLSearchParams())}>
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 p-2 rounded-xl border border-[var(--accent-color)]/40 bg-[var(--accent-soft)] text-xs">
          <span className="font-semibold text-[var(--accent-text)]">{selected.size} seleccionados</span>
          <select aria-label="Cambiar estado" value="" onChange={(e) => e.target.value && runBulk({ ids: [...selected], to_status_id: e.target.value }, 'Estado')} className="input w-auto py-1 text-xs">
            <option value="">Mover a estado…</option>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select aria-label="Cambiar prioridad" value="" onChange={(e) => e.target.value && runBulk({ ids: [...selected], patch: { priority_id: e.target.value } }, 'Prioridad')} className="input w-auto py-1 text-xs">
            <option value="">Prioridad…</option>
            {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Asignar hito" value="" onChange={(e) => e.target.value && runBulk({ ids: [...selected], patch: { milestone_id: e.target.value === 'none' ? null : e.target.value } }, 'Hito')} className="input w-auto py-1 text-xs">
            <option value="">Hito…</option>
            <option value="none">Quitar hito</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select aria-label="Añadir etiqueta" value="" onChange={(e) => e.target.value && runBulk({ ids: [...selected], add_label_id: e.target.value }, 'Etiqueta')} className="input w-auto py-1 text-xs">
            <option value="">Añadir etiqueta…</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select aria-label="Añadir miembro" value="" onChange={(e) => e.target.value && runBulk({ ids: [...selected], add_member_id: e.target.value }, 'Miembro')} className="input w-auto py-1 text-xs">
            <option value="">Añadir miembro…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
          <button type="button" className="btn-ghost text-xs ml-auto" onClick={() => setSelected(new Set())}>Cancelar</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ListTodo className="h-6 w-6" />}
            title={activeFilters.length ? 'Ningún requerimiento coincide con los filtros' : 'Aún no hay requerimientos'}
            action={space?.my_role !== 'viewer' && !activeFilters.length ? <button type="button" className="btn-primary" onClick={() => setCreating(true)}>Crear el primero</button> : undefined}
          />
        ) : (
          <table className={`w-full text-left text-sm ${isFetching ? 'opacity-70' : ''}`}>
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface-hover)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                <th className="py-2.5 px-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
                    className="accent-[var(--accent-color)]"
                  />
                </th>
                <SortHeader k="ref">Ref</SortHeader>
                <SortHeader k="title">Título</SortHeader>
                <SortHeader k="status">Estado</SortHeader>
                <SortHeader k="priority">Prioridad</SortHeader>
                {columns.includes('members') && <th className="py-2.5 px-3">Miembros</th>}
                {columns.includes('due') && <SortHeader k="due">Límite</SortHeader>}
                {columns.includes('milestone') && <th className="py-2.5 px-3">Hito</th>}
                {columns.includes('done') && <SortHeader k="done">Avance</SortHeader>}
                {columns.includes('dor') && <th className="py-2.5 px-3">DoR</th>}
                {columns.includes('updated') && <SortHeader k="updated">Actualizado</SortHeader>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {items.map((r) => {
                const due = dueState(r.due_date, r.status_is_closed);
                return (
                  <tr key={r.id} className={`hover:bg-[var(--bg-surface-hover)] ${selected.has(r.id) ? 'bg-[var(--accent-soft)]' : ''}`}>
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${r.ref_key}`}
                        checked={selected.has(r.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                        className="accent-[var(--accent-color)]"
                      />
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <Link to={`/spaces/${spaceId}/requirements/${r.id}`} state={{ from: `/spaces/${spaceId}/requirements?${params}` }} className="font-mono text-xs font-semibold text-[var(--accent-text)] hover:underline">
                        {r.tracker_icon} {r.ref_key}
                      </Link>
                    </td>
                    <td className="py-2 px-3 min-w-[240px]">
                      <Link to={`/spaces/${spaceId}/requirements/${r.id}`} state={{ from: `/spaces/${spaceId}/requirements?${params}` }} className="font-medium text-[var(--text-primary)] hover:underline">
                        {r.title}
                      </Link>
                      {r.labels.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{r.labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}</div>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap"><Badge color={r.status_color}>{r.status_name}</Badge></td>
                    <td className="py-2 px-3 whitespace-nowrap"><Badge color={r.priority_color}>{r.priority_name}</Badge></td>
                    {columns.includes('members') && <td className="py-2 px-3"><AvatarStack members={r.members} size={22} /></td>}
                    {columns.includes('due') && (
                      <td className={`py-2 px-3 whitespace-nowrap text-xs ${due === 'overdue' ? 'text-rose-500 font-semibold' : due === 'soon' ? 'text-amber-600' : 'text-[var(--text-muted)]'}`}>
                        {r.due_date ? <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(r.due_date, { day: 'numeric', month: 'short' })}</span> : '—'}
                      </td>
                    )}
                    {columns.includes('milestone') && <td className="py-2 px-3 text-xs text-[var(--text-muted)]">{milestones.find((m) => m.id === r.milestone_id)?.name ?? '—'}</td>}
                    {columns.includes('done') && (
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-14 h-1.5 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden"><div className="h-full bg-[var(--accent-color)]" style={{ width: `${r.done_ratio}%` }} /></div>
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">{r.done_ratio}%</span>
                        </div>
                      </td>
                    )}
                    {columns.includes('dor') && <td className="py-2 px-3 text-xs font-mono text-[var(--text-muted)]">{r.readiness_score != null ? `${r.readiness_score}%` : '—'}</td>}
                    {columns.includes('updated') && <td className="py-2 px-3 whitespace-nowrap text-xs text-[var(--text-muted)]">{formatRelative(r.updated_at)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{offset + 1}–{Math.min(offset + PAGE, total)} de {total}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-xs" disabled={offset === 0} onClick={() => setParams((p) => { p.set('offset', String(Math.max(0, offset - PAGE))); return p; })}>Anterior</button>
            <button type="button" className="btn-secondary text-xs" disabled={offset + PAGE >= total} onClick={() => setParams((p) => { p.set('offset', String(offset + PAGE)); return p; })}>Siguiente</button>
          </div>
        </div>
      )}

      {creating && <CreateRequirementModal isOpen onClose={() => setCreating(false)} spaceId={spaceId} />}
    </div>
  );
}
