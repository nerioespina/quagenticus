import { useState } from 'react';
import { KeyRound, Loader2, Shield, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '../ui/Avatar';
import { Badge, Spinner } from '../ui/misc';
import { confirmDialog } from '../ui/Confirm';
import { useChangePassword, useCreateUser, useUpdateUser, useUsers } from '../../hooks/useUsers';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/api';
import { formatRelative } from '../../lib/dates';

export default function UsersAdmin() {
  const me = useAuth((s) => s.user);
  const { data: users = [], isLoading } = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const reset = useChangePassword();
  const [form, setForm] = useState({ email: '', display_name: '', handle: '', password: '', is_account_admin: false });
  const [showForm, setShowForm] = useState(false);
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">Personas de la cuenta. Después, añádelas a los espacios donde colaboran.</p>
        <button type="button" className="btn-primary text-xs" onClick={() => setShowForm((v) => !v)}><UserPlus className="h-3.5 w-3.5" /> Nuevo usuario</button>
      </div>
      {showForm && (
        <form
          className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(form, {
              onSuccess: (u) => {
                toast.success(`${u.display_name} creado (@${u.handle})`);
                setForm({ email: '', display_name: '', handle: '', password: '', is_account_admin: false });
                setShowForm(false);
              },
              onError: onErr,
            });
          }}
        >
          <label className="space-y-1"><span className="field-label">Nombre</span><input required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="input" /></label>
          <label className="space-y-1"><span className="field-label">Correo</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></label>
          <label className="space-y-1"><span className="field-label">Usuario para @menciones (opcional)</span><input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })} pattern="[a-z][a-z0-9._-]{0,39}" className="input" /></label>
          <label className="space-y-1"><span className="field-label">Contraseña inicial</span><input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" /></label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={form.is_account_admin} onChange={(e) => setForm({ ...form, is_account_admin: e.target.checked })} className="accent-[var(--accent-color)]" /> Administrador de la cuenta</label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>{create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear</button>
          </div>
        </form>
      )}
      {isLoading ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--bg-surface-hover)] text-[var(--text-muted)] uppercase tracking-wider">
              <tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Estado</th><th className="p-3">Último acceso</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={u.display_name} url={u.avatar_url} size={28} />
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--text-primary)] truncate">{u.display_name} {u.id === me?.id && <span className="text-[var(--text-muted)]">(tú)</span>}</p>
                        <p className="text-[var(--text-muted)] truncate">@{u.handle} · {u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={u.is_account_admin}
                        disabled={u.id === me?.id}
                        onChange={(e) => update.mutate({ id: u.id, is_account_admin: e.target.checked }, { onError: onErr })}
                        className="accent-[var(--accent-color)]"
                      />
                      <Shield className="h-3 w-3" /> Admin
                    </label>
                  </td>
                  <td className="p-3">
                    <select
                      value={u.status}
                      disabled={u.id === me?.id}
                      onChange={(e) => update.mutate({ id: u.id, status: e.target.value }, { onError: onErr })}
                      className="input w-auto py-1 text-xs"
                    >
                      <option value="active">Activo</option>
                      <option value="suspended">Suspendido</option>
                      <option value="pending">Pendiente</option>
                    </select>
                  </td>
                  <td className="p-3 text-[var(--text-muted)]">{u.last_login_at ? formatRelative(u.last_login_at) : <Badge color="#94a3b8">nunca</Badge>}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={async () => {
                        const pw = await confirmDialog({ title: `Restablecer contraseña de ${u.display_name}`, message: 'Se cerrarán sus sesiones abiertas.', input: { label: 'Nueva contraseña (mín. 8)', required: true }, confirmLabel: 'Restablecer' });
                        if (pw === false) return;
                        reset.mutate({ id: u.id, new_password: pw }, { onSuccess: () => toast.success('Contraseña restablecida'), onError: onErr });
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Contraseña
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
