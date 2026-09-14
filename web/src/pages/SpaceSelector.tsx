import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderOpen, LayoutDashboard, Loader2, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, Skeleton } from '../components/ui/misc';
import { useCreateSpace, useSpaces } from '../hooks/useSpaces';
import { errorMessage } from '../lib/api';
import { ROLE_LABELS } from '../lib/i18n';

export default function SpaceSelector() {
  const navigate = useNavigate();
  const { data: spaces = [], isLoading } = useSpaces();
  const create = useCreateSpace();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ key: '', name: '' });

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Espacios de trabajo</h1>
          <p className="text-xs text-[var(--text-muted)]">Cada espacio agrupa requerimientos, documentos, tableros y personas.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link to="/my-work" className="btn-secondary text-xs"><LayoutDashboard className="h-3.5 w-3.5" /> Mi trabajo</Link>
          <button type="button" className="btn-primary text-xs" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> Nuevo espacio</button>
        </div>
      </div>

      {showCreate && (
        <form
          className="card p-4 grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form, {
              onSuccess: (s) => { toast.success(`Espacio ${s.key} creado`); navigate(`/spaces/${s.id}/board`); },
              onError: (err) => toast.error(errorMessage(err)),
            });
          }}
        >
          <label className="space-y-1">
            <span className="field-label">Clave</span>
            <input autoFocus required pattern="[A-Z][A-Z0-9]{1,9}" title="2-10 caracteres, empieza con letra" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} placeholder="PROJ" className="input font-mono" />
          </label>
          <label className="space-y-1">
            <span className="field-label">Nombre</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre del espacio" className="input" />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear</button>
          </div>
          <p className="sm:col-span-3 text-[11px] text-[var(--text-muted)]">La clave forma las referencias: {form.key || 'PROJ'}-1, {form.key || 'PROJ'}-2… Se crea un tablero con una columna por estado.</p>
        </form>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : spaces.length === 0 ? (
        <EmptyState icon={<FolderOpen className="h-6 w-6" />} title="No perteneces a ningún espacio" description="Crea uno o pide a un administrador que te añada." />
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {spaces.map((s) => (
            <li key={s.id} className="card p-4 flex items-start gap-3 hover:border-[var(--accent-color)]/40">
              <span className="h-10 w-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center shrink-0 font-mono text-xs font-bold text-[var(--accent-text)]">{s.key.slice(0, 3)}</span>
              <Link to={`/spaces/${s.id}/board`} className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--text-primary)] truncate">{s.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{s.key} · {ROLE_LABELS[s.my_role]} · {s.member_count ?? 0} miembros · {s.open_requirements ?? 0} abiertos</p>
              </Link>
              <Link to={`/spaces/${s.id}/settings`} className="icon-btn" aria-label={`Configuración de ${s.name}`}><Settings className="h-4 w-4" /></Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
