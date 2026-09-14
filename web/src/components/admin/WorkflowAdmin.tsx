import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, KeyRound, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Spinner } from '../ui/misc';
import { confirmDialog } from '../ui/Confirm';
import Modal from '../ui/Modal';
import { usePriorities, useStatuses, useTrackers } from '../../hooks/useCatalogs';
import { useAdminCatalogMutations, useAgentMutations, useAgents, useReplaceTransitions, useTransitions } from '../../hooks/useAdmin';
import { errorMessage } from '../../lib/api';
import type { Agent, Role, Transition } from '../../lib/api';
import { formatRelative } from '../../lib/dates';
import { ROLE_LABELS } from '../../lib/i18n';

const onErr = (e: unknown) => toast.error(errorMessage(e));

export function StatusesAdmin() {
  const { data: statuses = [], isLoading } = useStatuses();
  const { saveStatus, deleteStatus, reorderStatuses } = useAdminCatalogMutations();
  const [name, setName] = useState('');

  const move = (index: number, delta: number) => {
    const ids = statuses.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    reorderStatuses.mutate(ids, { onError: onErr });
  };

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">Cada estado es una columna en todos los tableros. El orden define el orden de las columnas.</p>
      <ul className="card divide-y divide-[var(--border-color)]">
        {statuses.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 p-2.5">
            <div className="flex flex-col">
              <button type="button" className="icon-btn p-0.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-3 w-3" /></button>
              <button type="button" className="icon-btn p-0.5" disabled={i === statuses.length - 1} onClick={() => move(i, 1)} aria-label="Bajar"><ArrowDown className="h-3 w-3" /></button>
            </div>
            <input type="color" value={s.color ?? '#64748b'} onChange={(e) => saveStatus.mutate({ id: s.id, color: e.target.value }, { onError: onErr })} className="h-7 w-7 rounded border border-[var(--border-color)] bg-transparent" aria-label="Color" />
            <input defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && saveStatus.mutate({ id: s.id, name: e.target.value.trim() }, { onError: onErr })} className="input py-1 text-xs w-40" aria-label="Nombre" />
            <span className="font-mono text-[10px] text-[var(--text-muted)]">{s.key}</span>
            {([
              ['is_default', 'Inicial'], ['is_closed', 'Cerrado'], ['is_agent_claimable', 'Agentes'], ['requires_resolution', 'Pide resolución'],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                <input type="checkbox" checked={s[k]} onChange={(e) => saveStatus.mutate({ id: s.id, [k]: e.target.checked }, { onError: onErr })} className="accent-[var(--accent-color)]" />
                {label}
              </label>
            ))}
            <button
              type="button"
              className="icon-btn ml-auto hover:text-red-500"
              aria-label={`Eliminar ${s.name}`}
              onClick={async () => {
                if ((await confirmDialog({ title: `Eliminar «${s.name}»`, message: 'Solo es posible si ningún requerimiento lo usa.', danger: true, confirmLabel: 'Eliminar' })) !== false) deleteStatus.mutate(s.id, { onError: onErr });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) saveStatus.mutate({ name: name.trim() }, { onSuccess: () => setName(''), onError: onErr }); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo estado" className="input py-1.5 text-xs flex-1" />
        <button type="submit" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Añadir</button>
      </form>
    </div>
  );
}

export function TrackersAdmin() {
  const { data: trackers = [], isLoading } = useTrackers(true);
  const { data: statuses = [] } = useStatuses();
  const { saveTracker } = useAdminCatalogMutations();
  const [name, setName] = useState('');
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-[var(--border-color)]">
        {trackers.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 p-2.5">
            <input defaultValue={t.icon ?? ''} onBlur={(e) => e.target.value !== (t.icon ?? '') && saveTracker.mutate({ id: t.id, icon: e.target.value }, { onError: onErr })} className="input py-1 text-center w-12" aria-label="Icono" />
            <input defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && saveTracker.mutate({ id: t.id, name: e.target.value.trim() }, { onError: onErr })} className="input py-1 text-xs w-40" aria-label="Nombre" />
            <label className="flex items-center gap-1 text-[11px]">
              Estado inicial
              <select value={t.default_status_id ?? ''} onChange={(e) => saveTracker.mutate({ id: t.id, default_status_id: e.target.value || null }, { onError: onErr })} className="input w-auto py-1 text-xs">
                <option value="">Por defecto</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={t.is_agent_enabled} onChange={(e) => saveTracker.mutate({ id: t.id, is_agent_enabled: e.target.checked }, { onError: onErr })} className="accent-[var(--accent-color)]" /> Agentes</label>
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={t.is_active} onChange={(e) => saveTracker.mutate({ id: t.id, is_active: e.target.checked }, { onError: onErr })} className="accent-[var(--accent-color)]" /> Activo</label>
            {t.template_id && <Badge color="#8b5cf6">con plantilla</Badge>}
            <input
              defaultValue={t.template_id ?? ''}
              placeholder="Id de documento plantilla"
              onBlur={(e) => e.target.value !== (t.template_id ?? '') && saveTracker.mutate({ id: t.id, template_id: e.target.value || null }, { onError: onErr })}
              className="input py-1 text-[11px] font-mono w-72"
              aria-label="Plantilla"
              title="Copia el id de un documento de tipo Plantilla (menú ⋯ del documento → Copiar referencia muestra su título; el id está en la URL)"
            />
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) saveTracker.mutate({ name: name.trim() }, { onSuccess: () => setName(''), onError: onErr }); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo tipo (p. ej. Consulta)" className="input py-1.5 text-xs flex-1" />
        <button type="submit" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Añadir</button>
      </form>
    </div>
  );
}

export function PrioritiesAdmin() {
  const { data: priorities = [], isLoading } = usePriorities();
  const { savePriority } = useAdminCatalogMutations();
  const [name, setName] = useState('');
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">El peso ordena la cola de agentes (mayor peso = más urgente).</p>
      <ul className="card divide-y divide-[var(--border-color)]">
        {priorities.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 p-2.5">
            <input type="color" value={p.color ?? '#64748b'} onChange={(e) => savePriority.mutate({ id: p.id, color: e.target.value }, { onError: onErr })} className="h-7 w-7 rounded border border-[var(--border-color)] bg-transparent" aria-label="Color" />
            <input defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && savePriority.mutate({ id: p.id, name: e.target.value.trim() }, { onError: onErr })} className="input py-1 text-xs w-40" aria-label="Nombre" />
            <label className="flex items-center gap-1 text-[11px]">Peso <input type="number" defaultValue={p.weight} onBlur={(e) => Number(e.target.value) !== p.weight && savePriority.mutate({ id: p.id, weight: Number(e.target.value) }, { onError: onErr })} className="input py-1 text-xs w-20" /></label>
            <label className="flex items-center gap-1 text-[11px]"><input type="radio" name="default-priority" checked={p.is_default} onChange={() => savePriority.mutate({ id: p.id, is_default: true }, { onError: onErr })} className="accent-[var(--accent-color)]" /> Por defecto</label>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) savePriority.mutate({ name: name.trim(), weight: 25 }, { onSuccess: () => setName(''), onError: onErr }); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva prioridad" className="input py-1.5 text-xs flex-1" />
        <button type="submit" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Añadir</button>
      </form>
    </div>
  );
}

type Rule = Omit<Transition, 'id' | 'tracker_id'>;
const ALL_ROLES: Role[] = ['viewer', 'contributor', 'maintainer', 'admin'];
const DEFAULT_ROLES: Role[] = ['contributor', 'maintainer', 'admin'];

export function TransitionsAdmin() {
  const { data: trackers = [] } = useTrackers(true);
  const { data: statuses = [] } = useStatuses();
  const [trackerId, setTrackerId] = useState('');
  const activeTracker = trackerId || trackers[0]?.id || '';
  const { data: transitions, isLoading } = useTransitions(activeTracker);
  const replace = useReplaceTransitions(activeTracker);
  const [rules, setRules] = useState<Rule[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (transitions) {
      setRules(transitions.map(({ id: _id, tracker_id: _t, ...r }) => r));
      setDirty(false);
    }
  }, [transitions]);

  const key = (from: string | null, to: string) => `${from ?? '*'}>${to}`;
  const byKey = useMemo(() => new Map(rules.map((r) => [key(r.from_status_id, r.to_status_id), r])), [rules]);
  const toggle = (from: string | null, to: string) => {
    setDirty(true);
    setRules((rs) => {
      const k = key(from, to);
      if (byKey.has(k)) return rs.filter((r) => key(r.from_status_id, r.to_status_id) !== k);
      return [...rs, { from_status_id: from, to_status_id: to, allowed_roles: DEFAULT_ROLES, allowed_actors: ['user', 'agent'], requires_comment: false, requires_assignee: false, requires_readiness: false }];
    });
  };
  const edit = (r: Rule, patch: Partial<Rule>) => {
    setDirty(true);
    setRules((rs) => rs.map((x) => (x === r ? { ...x, ...patch } : x)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={activeTracker} onChange={(e) => setTrackerId(e.target.value)} className="input w-auto py-1.5 text-xs" aria-label="Tipo">
          {trackers.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>
        <p className="text-xs text-[var(--text-muted)] flex-1">Marca qué movimientos están permitidos. La fila «Cualquiera» permite llegar a ese estado desde cualquier otro.</p>
        <button type="button" className="btn-primary text-xs" disabled={!dirty || replace.isPending} onClick={() => replace.mutate(rules, { onSuccess: () => { toast.success('Flujo guardado'); setDirty(false); }, onError: onErr })}>
          <Save className="h-3.5 w-3.5" /> Guardar flujo
        </button>
      </div>
      {isLoading ? <Spinner /> : (
        <>
          <div className="card overflow-x-auto">
            <table className="text-[11px]">
              <thead>
                <tr>
                  <th className="p-2 text-left text-[var(--text-muted)]">Desde \ Hacia</th>
                  {statuses.map((s) => <th key={s.id} className="p-2 font-semibold text-[var(--text-secondary)] whitespace-nowrap">{s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {[null, ...statuses.map((s) => s.id)].map((from) => (
                  <tr key={from ?? '*'} className="border-t border-[var(--border-color)]">
                    <td className="p-2 font-semibold whitespace-nowrap text-[var(--text-secondary)]">{from ? statuses.find((s) => s.id === from)?.name : 'Cualquiera'}</td>
                    {statuses.map((to) => (
                      <td key={to.id} className="p-2 text-center">
                        {from !== to.id && (
                          <input type="checkbox" checked={byKey.has(key(from, to.id))} onChange={() => toggle(from, to.id)} className="accent-[var(--accent-color)]" aria-label={`${from ? statuses.find((s) => s.id === from)?.name : 'Cualquiera'} a ${to.name}`} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rules.length > 0 && (
            <details className="card p-3">
              <summary className="text-xs font-semibold cursor-pointer text-[var(--text-secondary)]">Reglas avanzadas ({rules.length})</summary>
              <ul className="mt-2 space-y-2">
                {rules.map((r) => (
                  <li key={key(r.from_status_id, r.to_status_id)} className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-medium w-48 truncate">
                      {r.from_status_id ? statuses.find((s) => s.id === r.from_status_id)?.name : 'Cualquiera'} → {statuses.find((s) => s.id === r.to_status_id)?.name}
                    </span>
                    {ALL_ROLES.map((role) => (
                      <label key={role} className="flex items-center gap-0.5">
                        <input type="checkbox" checked={r.allowed_roles.includes(role)} onChange={(e) => edit(r, { allowed_roles: e.target.checked ? [...r.allowed_roles, role] : r.allowed_roles.filter((x) => x !== role) })} className="accent-[var(--accent-color)]" />
                        {ROLE_LABELS[role]}
                      </label>
                    ))}
                    <label className="flex items-center gap-0.5"><input type="checkbox" checked={r.allowed_actors.includes('agent')} onChange={(e) => edit(r, { allowed_actors: e.target.checked ? ['user', 'agent'] : ['user'] })} className="accent-[var(--accent-color)]" /> Agentes</label>
                    <label className="flex items-center gap-0.5"><input type="checkbox" checked={r.requires_comment} onChange={(e) => edit(r, { requires_comment: e.target.checked })} className="accent-[var(--accent-color)]" /> Pide comentario</label>
                    <label className="flex items-center gap-0.5"><input type="checkbox" checked={r.requires_assignee} onChange={(e) => edit(r, { requires_assignee: e.target.checked })} className="accent-[var(--accent-color)]" /> Pide responsable</label>
                    <label className="flex items-center gap-0.5"><input type="checkbox" checked={r.requires_readiness} onChange={(e) => edit(r, { requires_readiness: e.target.checked })} className="accent-[var(--accent-color)]" /> Pide DoR 100%</label>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function AgentsAdmin() {
  const { data: agents = [], isLoading } = useAgents();
  const { create, update, rotate } = useAgentMutations();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<Agent | null>(null);
  const mcpUrl = `${window.location.protocol}//${window.location.hostname}:18081/mcp`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        Los agentes se conectan por MCP (<code className="font-mono">{mcpUrl}</code>) o por la API REST con su API key en la cabecera <code>Authorization: Bearer</code>.
        Actúan con rol de colaborador y su actividad queda registrada por separado.
      </p>
      {isLoading ? <Spinner /> : (
        <ul className="card divide-y divide-[var(--border-color)]">
          {agents.length === 0 && <li className="p-4 text-xs text-[var(--text-muted)]">Aún no hay agentes.</li>}
          {agents.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)]">{a.name} {!a.is_active && <Badge color="#94a3b8">inactivo</Badge>}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  <span className="font-mono">qga_{a.api_key_prefix}_…</span> · {a.last_seen_at ? `visto ${formatRelative(a.last_seen_at)}` : 'nunca conectado'} · {a.active_claims ?? 0} reclamos activos
                </p>
              </div>
              <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={a.is_active} onChange={(e) => update.mutate({ id: a.id, is_active: e.target.checked }, { onError: onErr })} className="accent-[var(--accent-color)]" /> Activo</label>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={async () => {
                  if ((await confirmDialog({ title: `Rotar la API key de ${a.name}`, message: 'La key actual dejará de funcionar inmediatamente.', confirmLabel: 'Rotar', danger: true })) === false) return;
                  rotate.mutate(a.id, { onSuccess: setSecret, onError: onErr });
                }}
              >
                <KeyRound className="h-3.5 w-3.5" /> Rotar key
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate({ name: name.trim() }, { onSuccess: (a) => { setName(''); setSecret(a); }, onError: onErr }); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del agente (p. ej. Claude backend)" className="input py-1.5 text-xs flex-1" />
        <button type="submit" className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Crear agente</button>
      </form>
      {secret?.api_key && (
        <Modal isOpen onClose={() => setSecret(null)} title={`API key de ${secret.name}`} className="max-w-lg">
          <p className="text-xs text-[var(--text-secondary)] mb-2">Cópiala ahora: por seguridad no se volverá a mostrar.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 rounded-lg bg-[var(--bg-surface-hover)] font-mono text-xs break-all">{secret.api_key}</code>
            <button type="button" className="btn-secondary" onClick={() => { navigator.clipboard.writeText(secret.api_key!); toast.success('Copiada'); }}><Copy className="h-3.5 w-3.5" /></button>
          </div>
        </Modal>
      )}
    </div>
  );
}
