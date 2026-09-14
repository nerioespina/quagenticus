import { useEffect, useState } from 'react';
import { Clock, Flag, Folder, GitBranch, Tag as TagIcon, Timer, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import LabelPicker from './LabelPicker';
import { useCategories, useMilestones } from '../../hooks/useCatalogs';
import { useDocumentLabelsMutation, useTimeEntries, useTimeEntryMutations, useUpdateRequirement } from '../../hooks/useRequirements';
import type { RequirementPatch } from '../../hooks/useRequirements';
import { errorMessage } from '../../lib/api';
import type { Requirement } from '../../lib/api';
import { dueState, formatDate, formatRelative, todayISO } from '../../lib/dates';
import { useSuggest } from '../../hooks/useSearch';
import Popover from '../ui/Popover';

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1 min-w-0">
      <span className="field-label flex items-center gap-1">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function ClearButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="icon-btn">
      <X className="h-3 w-3" />
    </button>
  );
}

/** Parent picker using suggestions. */
function ParentPicker({ req, onChange, disabled }: { req: Requirement; onChange: (id: string | null) => void; disabled?: boolean }) {
  const [q, setQ] = useState('');
  const { data = [] } = useSuggest(req.space_id, q, ['requirement']);
  return (
    <div className="flex items-center gap-1 min-w-0">
      {req.parent ? (
        <Link to={`/spaces/${req.space_id}/requirements/${req.parent.id}`} className="text-xs text-[var(--accent-text)] truncate hover:underline">
          {req.parent.ref_key} · {req.parent.title}
        </Link>
      ) : (
        <span className="text-xs text-[var(--text-muted)]">Ninguno</span>
      )}
      {!disabled && (
        <Popover
          width={300}
          align="end"
          trigger={({ toggle, ref }) => (
            <button ref={ref} type="button" onClick={toggle} className="ml-auto text-[11px] text-[var(--accent-text)] hover:underline shrink-0">
              Cambiar
            </button>
          )}
        >
          {(close) => (
            <div className="p-2 space-y-1">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar requerimiento…" className="input py-1.5 text-xs" />
              <ul className="max-h-56 overflow-y-auto">
                {data.filter((d) => d.id !== req.id).map((d) => (
                  <li key={d.id}>
                    <button type="button" className="menu-item" onClick={() => { onChange(d.id); close(); }}>
                      <span className="font-mono text-[var(--accent-text)]">{d.ref_key}</span>
                      <span className="truncate">{d.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {req.parent && (
                <button type="button" className="menu-item text-red-500" onClick={() => { onChange(null); close(); }}>
                  Quitar padre
                </button>
              )}
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}

export default function RequirementFields({ req }: { req: Requirement }) {
  const disabled = req.status_is_closed || req.my_role === 'viewer';
  const update = useUpdateRequirement();
  const { data: categories = [] } = useCategories(req.space_id);
  const { data: milestones = [] } = useMilestones(req.space_id);
  const labels = useDocumentLabelsMutation(req.id, req.space_id);
  const { data: entries = [] } = useTimeEntries(req.id);
  const time = useTimeEntryMutations(req.id, req.space_id);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [estimate, setEstimate] = useState(req.estimated_hours?.toString() ?? '');
  const [done, setDone] = useState(req.done_ratio);

  useEffect(() => setEstimate(req.estimated_hours?.toString() ?? ''), [req.estimated_hours]);
  useEffect(() => setDone(req.done_ratio), [req.done_ratio]);

  const patch = (data: RequirementPatch) => update.mutate({ id: req.id, ...data }, { onError: (e) => toast.error(errorMessage(e)) });
  const due = dueState(req.due_date, req.status_is_closed);

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <h4 className="section-title"><Folder className="h-3.5 w-3.5 text-[var(--accent-text)]" /> Clasificación</h4>
        <Field label="Categoría">
          <select disabled={disabled} value={req.category_id ?? ''} onChange={(e) => patch({ category_id: e.target.value || null })} className="input py-1.5 text-xs">
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Hito" icon={<Flag className="h-3 w-3 text-amber-500" />}>
          <select disabled={disabled} value={req.milestone_id ?? ''} onChange={(e) => patch({ milestone_id: e.target.value || null })} className="input py-1.5 text-xs">
            <option value="">Sin hito</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}{m.status !== 'open' ? ` (${m.status})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Requerimiento padre" icon={<GitBranch className="h-3 w-3" />}>
          <ParentPicker req={req} disabled={disabled} onChange={(id) => patch({ parent_id: id })} />
        </Field>
      </div>

      <div className="card p-4 space-y-2">
        <h4 className="section-title"><TagIcon className="h-3.5 w-3.5 text-pink-500" /> Etiquetas</h4>
        <LabelPicker
          spaceId={req.space_id}
          assigned={req.labels}
          disabled={disabled}
          onToggle={(l, on) => (on ? labels.remove : labels.add).mutate(l.id, { onError: (e) => toast.error(errorMessage(e)) })}
        />
      </div>

      <div className="card p-4 space-y-3">
        <h4 className="section-title"><Clock className="h-3.5 w-3.5 text-[var(--accent-text)]" /> Planificación</h4>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Inicio">
            <div className="flex items-center gap-1">
              <input type="date" disabled={disabled} value={req.start_date ?? ''} onChange={(e) => patch({ start_date: e.target.value || null })} className="input py-1 text-xs" />
              {req.start_date && !disabled && <ClearButton label="Quitar fecha de inicio" onClick={() => patch({ start_date: null })} />}
            </div>
          </Field>
          <Field label="Fecha límite">
            <div className="flex items-center gap-1">
              <input
                type="date"
                disabled={disabled}
                value={req.due_date ?? ''}
                min={req.start_date ?? undefined}
                onChange={(e) => patch({ due_date: e.target.value || null })}
                className={`input py-1 text-xs ${due === 'overdue' ? 'border-rose-500 text-rose-500' : due === 'soon' ? 'border-amber-500' : ''}`}
              />
              {req.due_date && !disabled && <ClearButton label="Quitar fecha límite" onClick={() => patch({ due_date: null })} />}
            </div>
          </Field>
        </div>
        {req.due_date && (
          <p className={`text-[11px] ${due === 'overdue' ? 'text-rose-500' : 'text-[var(--text-muted)]'}`}>
            {due === 'overdue' ? 'Vencido · ' : ''}
            {formatDate(req.due_date, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        )}
        <Field label={`Avance · ${done}%`}>
          <input
            type="range" min={0} max={100} step={5} value={done} disabled={disabled}
            onChange={(e) => setDone(Number(e.target.value))}
            onPointerUp={() => done !== req.done_ratio && patch({ done_ratio: done })}
            onKeyUp={() => done !== req.done_ratio && patch({ done_ratio: done })}
            className="w-full accent-[var(--accent-color)]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Estimadas (h)">
            <input
              type="number" min={0} step={0.5} disabled={disabled} value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={() => {
                const v = estimate === '' ? null : Number(estimate);
                if (v !== req.estimated_hours) patch({ estimated_hours: v });
              }}
              className="input py-1 text-xs"
            />
          </Field>
          <Field label="Invertidas (h)">
            <p className="text-sm font-mono font-semibold text-[var(--text-primary)] py-1">
              {req.spent_hours}h
              {req.estimated_hours ? <span className="text-[10px] text-[var(--text-muted)] font-normal"> / {req.estimated_hours}h</span> : null}
            </p>
          </Field>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h4 className="section-title"><Timer className="h-3.5 w-3.5 text-[var(--accent-text)]" /> Registro de tiempo</h4>
        {!disabled && (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const h = Number(hours);
              if (!h) return;
              time.add.mutate(
                { hours: h, spent_on: todayISO(), note },
                { onSuccess: () => { setHours(''); setNote(''); }, onError: (err) => toast.error(errorMessage(err)) },
              );
            }}
          >
            <input type="number" min={0.25} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="h" aria-label="Horas" className="input py-1 text-xs w-16" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota" className="input py-1 text-xs flex-1 min-w-0" />
            <button type="submit" disabled={!hours || time.add.isPending} className="btn-secondary text-xs py-1">Registrar</button>
          </form>
        )}
        {entries.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)] italic">Sin registros.</p>
        ) : (
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {entries.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] group">
                <span className="font-mono font-semibold">{t.hours}h</span>
                <span className="truncate flex-1" title={t.note ?? ''}>{t.display_name}{t.note ? ` · ${t.note}` : ''}</span>
                <span className="text-[var(--text-muted)]">{formatDate(t.spent_on, { day: '2-digit', month: 'short' })}</span>
                {!disabled && (
                  <button type="button" aria-label="Eliminar registro" onClick={() => time.remove.mutate(t.id, { onError: (e) => toast.error(errorMessage(e)) })} className="icon-btn opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-4 space-y-1 text-[11px] text-[var(--text-muted)]">
        <p>Reportado por <span className="text-[var(--text-secondary)]">{req.reporter_name ?? '—'}</span> {req.creator_agent_id ? '(vía agente)' : ''}</p>
        <p>Creado {formatRelative(req.created_at)} · actualizado {formatRelative(req.updated_at)}</p>
        {req.closed_at && <p>Cerrado {formatRelative(req.closed_at)}{req.resolution ? ` · Resolución: ${req.resolution}` : ''}</p>}
        {req.claimed_by_agent_name && <p className="text-violet-500">🤖 Reclamado por {req.claimed_by_agent_name}</p>}
      </div>
    </div>
  );
}
