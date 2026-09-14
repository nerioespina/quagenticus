import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '../ui/misc';
import { confirmDialog } from '../ui/Confirm';
import {
  useCategories, useCreateSpaceLabel, useDeleteCategory, useDeleteLabel, useDeleteMilestone, useMilestones, useSaveCategory, useSaveMilestone, useSpaceLabels, useUpdateLabel,
} from '../../hooks/useCatalogs';
import { useBoard, useBoards, useCreateBoard, useUpdateBoardColumn } from '../../hooks/useBoard';
import { LABEL_COLORS, labelStyle } from '../../lib/colors';
import { errorMessage } from '../../lib/api';

const onErr = (e: unknown) => toast.error(errorMessage(e));
const confirmDelete = async (what: string) => (await confirmDialog({ title: `Eliminar ${what}`, danger: true, confirmLabel: 'Eliminar' })) !== false;

export function LabelsAdmin({ spaceId }: { spaceId: string }) {
  const { data: labels = [], isLoading } = useSpaceLabels(spaceId);
  const create = useCreateSpaceLabel(spaceId);
  const update = useUpdateLabel(spaceId);
  const del = useDeleteLabel(spaceId);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-[var(--border-color)]">
        {labels.map((l) => (
          <li key={l.id} className="flex items-center gap-2 p-2.5">
            <select value={l.color} onChange={(e) => update.mutate({ id: l.id, color: e.target.value }, { onError: onErr })} style={labelStyle(l.color)} className="rounded px-1 py-0.5 text-[11px]" aria-label="Color" disabled={!l.space_id}>
              {Object.keys(LABEL_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input defaultValue={l.name} disabled={!l.space_id} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && update.mutate({ id: l.id, name: e.target.value.trim() }, { onError: onErr })} className="input py-1 text-xs flex-1" aria-label="Nombre" />
            <span className="text-[10px] text-[var(--text-muted)]">{l.space_id ? `${l.usage_count ?? 0} usos` : 'global de la cuenta'}</span>
            {l.space_id && <button type="button" className="icon-btn hover:text-red-500" aria-label="Eliminar" onClick={async () => (await confirmDelete(`la etiqueta «${l.name}»`)) && del.mutate(l.id, { onError: onErr })}><Trash2 className="h-3.5 w-3.5" /></button>}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate({ name: name.trim(), color }, { onSuccess: () => setName(''), onError: onErr }); }}>
        <select value={color} onChange={(e) => setColor(e.target.value)} style={labelStyle(color)} className="rounded px-2 text-xs" aria-label="Color">
          {Object.keys(LABEL_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva etiqueta" className="input py-1.5 text-xs flex-1" />
        <button type="submit" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Añadir</button>
      </form>
    </div>
  );
}

export function CategoriesAdmin({ spaceId }: { spaceId: string }) {
  const { data: categories = [], isLoading } = useCategories(spaceId);
  const save = useSaveCategory(spaceId);
  const del = useDeleteCategory(spaceId);
  const [name, setName] = useState('');
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-[var(--border-color)]">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2 p-2.5">
            <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && save.mutate({ id: c.id, name: e.target.value.trim() }, { onError: onErr })} className="input py-1 text-xs w-48" aria-label="Nombre" />
            <input defaultValue={c.description ?? ''} placeholder="Descripción" onBlur={(e) => e.target.value !== (c.description ?? '') && save.mutate({ id: c.id, description: e.target.value }, { onError: onErr })} className="input py-1 text-xs flex-1" aria-label="Descripción" />
            <button type="button" className="icon-btn hover:text-red-500" aria-label="Eliminar" onClick={async () => (await confirmDelete(`la categoría «${c.name}»`)) && del.mutate(c.id, { onError: onErr })}><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
        {categories.length === 0 && <li className="p-3 text-xs text-[var(--text-muted)]">Sin categorías.</li>}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate({ name: name.trim() }, { onSuccess: () => setName(''), onError: onErr }); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" className="input py-1.5 text-xs flex-1" />
        <button type="submit" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Añadir</button>
      </form>
    </div>
  );
}

export function MilestonesAdmin({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const { data: milestones = [], isLoading } = useMilestones(spaceId);
  const save = useSaveMilestone(spaceId);
  const del = useDeleteMilestone(spaceId);
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-[var(--border-color)]">
        {milestones.map((m) => {
          const pct = m.total ? Math.round(((m.closed ?? 0) / m.total) * 100) : 0;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2 p-3">
              <input defaultValue={m.name} disabled={!canEdit} onBlur={(e) => e.target.value.trim() && e.target.value !== m.name && save.mutate({ id: m.id, name: e.target.value.trim() }, { onError: onErr })} className="input py-1 text-xs w-48" aria-label="Nombre" />
              <input type="date" disabled={!canEdit} value={m.due_date ?? ''} onChange={(e) => save.mutate({ id: m.id, due_date: e.target.value || null }, { onError: onErr })} className="input py-1 text-xs w-auto" aria-label="Fecha objetivo" />
              <select disabled={!canEdit} value={m.status} onChange={(e) => save.mutate({ id: m.id, status: e.target.value }, { onError: onErr })} className="input py-1 text-xs w-auto" aria-label="Estado">
                <option value="open">Abierto</option>
                <option value="locked">Bloqueado</option>
                <option value="closed">Cerrado</option>
              </select>
              <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                <div className="h-1.5 flex-1 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">{m.closed ?? 0}/{m.total ?? 0} · {pct}%</span>
              </div>
              {canEdit && <button type="button" className="icon-btn hover:text-red-500" aria-label="Eliminar" onClick={async () => (await confirmDelete(`el hito «${m.name}»`)) && del.mutate(m.id, { onError: onErr })}><Trash2 className="h-3.5 w-3.5" /></button>}
            </li>
          );
        })}
        {milestones.length === 0 && <li className="p-3 text-xs text-[var(--text-muted)]">Sin hitos.</li>}
      </ul>
      {canEdit && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate({ name: name.trim(), due_date: due || null }, { onSuccess: () => { setName(''); setDue(''); }, onError: onErr }); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo hito (p. ej. Versión 1.2)" className="input py-1.5 text-xs flex-1" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input py-1.5 text-xs w-auto" aria-label="Fecha objetivo" />
          <button type="submit" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Añadir</button>
        </form>
      )}
    </div>
  );
}

export function BoardsAdmin({ spaceId }: { spaceId: string }) {
  const { data: boards = [] } = useBoards(spaceId);
  const createBoard = useCreateBoard(spaceId);
  const [boardId, setBoardId] = useState('');
  const active = boardId || boards[0]?.id || '';
  const { data: board } = useBoard(spaceId, active, 0);
  const updateColumn = useUpdateBoardColumn(spaceId, active);
  const [name, setName] = useState('');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={active} onChange={(e) => setBoardId(e.target.value)} className="input w-auto py-1.5 text-xs" aria-label="Tablero">
          {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <form className="flex gap-2 ml-auto" onSubmit={(e) => { e.preventDefault(); if (name.trim()) createBoard.mutate({ name: name.trim() }, { onSuccess: (b) => { setName(''); setBoardId(b.id); }, onError: onErr }); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo tablero" className="input py-1.5 text-xs" />
          <button type="submit" className="btn-secondary text-xs"><Plus className="h-3.5 w-3.5" /> Crear</button>
        </form>
      </div>
      <p className="text-xs text-[var(--text-muted)]">Hay una columna por cada estado del flujo. Aquí puedes renombrarlas, fijar límites WIP, colapsarlas por defecto u ocultarlas en este tablero.</p>
      <ul className="card divide-y divide-[var(--border-color)]">
        {[...(board?.columns ?? []), ...(board?.hidden_columns ?? []).map((h) => ({ ...h, id: h.status_id, hidden: true }))].map((c) => {
          const col = c as (typeof c) & { hidden?: boolean; wip_limit?: number | null; is_collapsed?: boolean };
          return (
            <li key={col.status_id} className="flex flex-wrap items-center gap-2 p-2.5">
              <input defaultValue={col.name} onBlur={(e) => e.target.value.trim() && e.target.value !== col.name && updateColumn.mutate({ statusId: col.status_id, name: e.target.value.trim() }, { onError: onErr })} className="input py-1 text-xs w-44" aria-label="Nombre de columna" />
              <label className="flex items-center gap-1 text-[11px]">WIP <input type="number" min={0} defaultValue={col.wip_limit ?? ''} onBlur={(e) => updateColumn.mutate({ statusId: col.status_id, wip_limit: e.target.value ? Number(e.target.value) : null }, { onError: onErr })} className="input py-1 text-xs w-16" /></label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" defaultChecked={col.is_collapsed} onChange={(e) => updateColumn.mutate({ statusId: col.status_id, is_collapsed: e.target.checked }, { onError: onErr })} className="accent-[var(--accent-color)]" /> Colapsada</label>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" defaultChecked={!!col.hidden} onChange={(e) => updateColumn.mutate({ statusId: col.status_id, is_hidden: e.target.checked }, { onError: onErr })} className="accent-[var(--accent-color)]" /> Oculta</label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
