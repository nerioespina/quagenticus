import { useState } from 'react';
import Modal from './Modal';
import { useUsers, useCreateUser, useUpdateUser, useChangePassword } from '../hooks/useUsers';
import { UserPlus, Key, Shield, Loader2, Check, UserCheck, UserX } from 'lucide-react';
import type { SystemUser } from '../lib/api';

interface SystemUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SystemUsersModal({ isOpen, onClose }: SystemUsersModalProps) {
  const { data: users = [], isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const changePassword = useChangePassword();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    display_name: '',
    is_account_admin: false,
  });

  const [editingPasswordUser, setEditingPasswordUser] = useState<SystemUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.email || !createForm.password || !createForm.display_name) return;
    createUser.mutate(createForm, {
      onSuccess: () => {
        setCreateForm({ email: '', password: '', display_name: '', is_account_admin: false });
        setShowCreate(false);
      },
    });
  };

  const handleChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPasswordUser || !newPassword) return;
    changePassword.mutate(
      { id: editingPasswordUser.id, new_password: newPassword },
      {
        onSuccess: () => {
          setPasswordSuccess(true);
          setTimeout(() => {
            setPasswordSuccess(false);
            setEditingPasswordUser(null);
            setNewPassword('');
          }, 1500);
        },
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestión de Usuarios del Sistema">
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            Crea usuarios, asigna permisos de administración y restablece contraseñas.
          </p>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:bg-[var(--accent-color-hover)] transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Nuevo usuario
            </button>
          )}
        </div>

        {/* Create Form */}
        {showCreate && (
          <form onSubmit={handleCreateSubmit} className="p-4 bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-xl space-y-3">
            <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Crear Usuario</h4>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nombre completo"
                value={createForm.display_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                required
                className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
              />
              <input
                type="email"
                placeholder="Correo electrónico"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                required
                className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="password"
                placeholder="Contraseña (mín. 6 caracteres)"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
                className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
              />
              <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={createForm.is_account_admin}
                  onChange={(e) => setCreateForm((f) => ({ ...f, is_account_admin: e.target.checked }))}
                  className="accent-[var(--accent-color)]"
                />
                Administrador del Sistema
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createUser.isPending}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:bg-[var(--accent-color-hover)] disabled:opacity-50 flex items-center gap-1"
              >
                {createUser.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Guardar Usuario
              </button>
            </div>
          </form>
        )}

        {/* Change Password Modal / Box */}
        {editingPasswordUser && (
          <form onSubmit={handleChangePasswordSubmit} className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
            <h4 className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
              <Key className="h-4 w-4" />
              Cambiar Contraseña para {editingPasswordUser.display_name}
            </h4>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Nueva contraseña"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={changePassword.isPending}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold hover:bg-amber-400 disabled:opacity-50 flex items-center gap-1"
              >
                {changePassword.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : passwordSuccess ? <Check className="h-3 w-3" /> : 'Actualizar Clave'}
              </button>
              <button
                type="button"
                onClick={() => setEditingPasswordUser(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {/* Users Table */}
        <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)] flex justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando usuarios...
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface-hover)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Rol Sistema</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <td className="p-3 font-semibold text-[var(--text-primary)]">{u.display_name}</td>
                    <td className="p-3 font-mono text-[var(--text-secondary)]">{u.email}</td>
                    <td className="p-3">
                      <button
                        onClick={() =>
                          updateUser.mutate({
                            id: u.id,
                            is_account_admin: !u.is_account_admin,
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                          u.is_account_admin
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                            : 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)] border-[var(--border-color)]'
                        }`}
                        title="Haz clic para alternar rol de administrador"
                      >
                        <Shield className="h-3 w-3" />
                        {u.is_account_admin ? 'Admin' : 'Usuario'}
                      </button>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() =>
                          updateUser.mutate({
                            id: u.id,
                            status: u.status === 'active' ? 'suspended' : 'active',
                          })
                        }
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                          u.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                      >
                        {u.status === 'active' ? (
                          <>
                            <UserCheck className="h-3 w-3" /> Activo
                          </>
                        ) : (
                          <>
                            <UserX className="h-3 w-3" /> Suspendido
                          </>
                        )}
                      </button>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setEditingPasswordUser(u)}
                        className="p-1.5 rounded bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors inline-flex items-center gap-1 text-xs"
                        title="Cambiar clave"
                      >
                        <Key className="h-3.5 w-3.5 text-amber-400" />
                        Clave
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
