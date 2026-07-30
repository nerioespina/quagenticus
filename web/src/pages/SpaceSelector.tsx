import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, FolderOpen, Users, Key, LogOut } from 'lucide-react';
import { useSpaces, useCreateSpace } from '../hooks/useSpaces';
import { useAuth } from '../lib/auth';
import SystemUsersModal from '../components/SystemUsersModal';
import SpaceMembersModal from '../components/SpaceMembersModal';
import ChangePasswordModal from '../components/ChangePasswordModal';

export default function SpaceSelector() {
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const user = useAuth((s) => s.user);

  const { data: spaces = [], isLoading } = useSpaces();
  const createSpace = useCreateSpace();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ key: '', name: '' });

  // System management modals
  const [isSystemUsersOpen, setIsSystemUsersOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [activeSpaceMembers, setActiveSpaceMembers] = useState<{ id: string; name: string } | null>(null);

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
    <div className="min-h-screen bg-[var(--bg-page)] flex flex-col">
      {/* Top Header Navigation */}
      <header className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-surface)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-[var(--accent-color)] flex items-center justify-center">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--text-primary)]">Quagenticus</h1>
            <p className="text-[11px] text-[var(--text-muted)]">Gestión de Requerimientos & Espacios</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSystemUsersOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-xs text-[var(--text-secondary)] font-semibold transition-colors border border-[var(--border-color)]"
          >
            <Users className="h-4 w-4 text-[var(--accent-text)]" />
            Usuarios del Sistema
          </button>

          <button
            onClick={() => setIsChangePasswordOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-xs text-[var(--text-secondary)] font-semibold transition-colors border border-[var(--border-color)]"
          >
            <Key className="h-4 w-4 text-amber-400" />
            Cambiar Mi Clave
          </button>

          <div className="h-4 w-[1px] bg-[var(--border-color)] mx-1" />

          <span className="text-xs font-medium text-[var(--text-muted)] font-mono">
            {user?.display_name || user?.email}
          </span>

          <button
            onClick={logout}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Seleccionar Espacio de Trabajo</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Elige un espacio para colaborar o gestiona los usuarios y roles asignados.
            </p>
          </div>

          <div className="space-y-3">
            {spaces.map((s) => (
              <div
                key={s.id}
                className="w-full flex items-center justify-between p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--accent-color)]/40 rounded-xl transition-all group"
              >
                <button
                  onClick={() => navigate(`/spaces/${s.id}`)}
                  className="flex items-center gap-4 flex-1 text-left"
                >
                  <div className="h-10 w-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                    <FolderOpen className="h-5 w-5 text-[var(--accent-text)]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                      {s.name}
                    </p>
                    <p className="text-xs font-mono text-[var(--text-muted)]">{s.key}</p>
                  </div>
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSpaceMembers({ id: s.id, name: s.name });
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-color)] ml-2 shrink-0"
                  title="Gestionar miembros y roles del espacio"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Miembros</span>
                </button>
              </div>
            ))}

            {spaces.length === 0 && (
              <p className="text-center text-[var(--text-muted)] text-sm py-6 border border-dashed border-[var(--border-color)] rounded-xl">
                No hay espacios todavía. Crea uno para comenzar.
              </p>
            )}
          </div>

          {showCreate ? (
            <form
              onSubmit={handleCreate}
              className="p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl space-y-3 shadow-lg"
            >
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Nuevo espacio</h3>
              <input
                placeholder="Clave (ej: PROJ)"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))}
                required
                pattern="[A-Z][A-Z0-9]{1,9}"
                title="2-10 caracteres, empieza con letra mayúscula"
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]/60 font-mono"
              />
              <input
                placeholder="Nombre del espacio"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]/60"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createSpace.isPending}
                  className="flex-1 py-2 rounded-lg bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
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
      </main>

      {/* System Users Modal */}
      {isSystemUsersOpen && (
        <SystemUsersModal
          isOpen={isSystemUsersOpen}
          onClose={() => setIsSystemUsersOpen(false)}
        />
      )}

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <ChangePasswordModal
          isOpen={isChangePasswordOpen}
          onClose={() => setIsChangePasswordOpen(false)}
        />
      )}

      {/* Space Members Modal */}
      {activeSpaceMembers && (
        <SpaceMembersModal
          isOpen={!!activeSpaceMembers}
          onClose={() => setActiveSpaceMembers(null)}
          spaceId={activeSpaceMembers.id}
          spaceName={activeSpaceMembers.name}
        />
      )}
    </div>
  );
}
