import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, FolderOpen } from 'lucide-react';
import { useSpaces, useCreateSpace } from '../hooks/useSpaces';

export default function SpaceSelector() {
  const navigate = useNavigate();
  const { data: spaces = [], isLoading } = useSpaces();
  const createSpace = useCreateSpace();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ key: '', name: '' });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSpace.mutateAsync(form);
    setShowCreate(false);
    setForm({ key: '', name: '' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
        <div className="text-[var(--text-muted)] text-sm">Cargando espacios…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-[var(--accent-color)] flex items-center justify-center">
            <Layers className="h-6 w-6 text-[var(--text-inverted)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Seleccionar espacio</h1>
        </div>

        <div className="space-y-2">
          {spaces.map(s => (
            <button
              key={s.id}
              onClick={() => navigate(`/spaces/${s.id}`)}
              className="w-full flex items-center gap-4 p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--accent-color)]/40 rounded-xl text-left transition-all group"
            >
              <div className="h-10 w-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                <FolderOpen className="h-5 w-5 text-[var(--accent-text)]" />
              </div>
              <div>
                <p className="font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">{s.name}</p>
                <p className="text-xs font-mono text-[var(--text-muted)]">{s.key}</p>
              </div>
            </button>
          ))}

          {spaces.length === 0 && (
            <p className="text-center text-[var(--text-muted)] text-sm py-4">No hay espacios todavía. Crea uno para comenzar.</p>
          )}
        </div>

        {showCreate ? (
          <form onSubmit={handleCreate} className="p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Nuevo espacio</h3>
            <input
              placeholder="Clave (ej: PROJ)"
              value={form.key}
              onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase() }))}
              required
              pattern="[A-Z][A-Z0-9]{1,9}"
              title="2-10 caracteres, empieza con letra mayúscula"
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]/60 font-mono"
            />
            <input
              placeholder="Nombre del espacio"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]/60"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createSpace.isPending}
                className="flex-1 py-2 rounded-lg bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] disabled:opacity-60 text-[var(--text-inverted)] text-sm font-semibold transition-colors"
              >
                {createSpace.isPending ? 'Creando…' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center justify-center gap-2 p-3 border border-dashed border-[var(--border-color)] hover:border-[var(--accent-color)]/40 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            Nuevo espacio
          </button>
        )}
      </div>
    </div>
  );
}
