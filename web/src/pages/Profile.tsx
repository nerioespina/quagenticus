import { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '../components/ui/Avatar';
import { useChangeOwnPassword, useUpdateMe } from '../hooks/useUsers';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { errorMessage } from '../lib/api';

const TIMEZONES = ['UTC', 'America/Bogota', 'America/Caracas', 'America/Mexico_City', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'America/New_York', 'Europe/Madrid'];

export default function Profile() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const { theme, setTheme } = useTheme();
  const update = useUpdateMe();
  const password = useChangeOwnPassword();
  const [form, setForm] = useState({ display_name: '', handle: '', avatar_url: '', locale: 'es', timezone: 'UTC', email_notifications: true });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });

  useEffect(() => {
    if (user) {
      setForm({
        display_name: user.display_name, handle: user.handle, avatar_url: user.avatar_url ?? '', locale: user.locale, timezone: user.timezone,
        email_notifications: user.preferences?.notifications?.email !== false,
      });
    }
  }, [user]);

  if (!user) return null;
  return (
    <div className="p-4 md:p-6 max-w-2xl space-y-6">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Mi perfil</h2>
      <form
        className="card p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            {
              display_name: form.display_name, handle: form.handle, avatar_url: form.avatar_url || null, locale: form.locale, timezone: form.timezone,
              preferences: { ...user.preferences, notifications: { email: form.email_notifications } },
            },
            { onSuccess: (me) => { setUser(me); toast.success('Perfil actualizado'); }, onError: (err) => toast.error(errorMessage(err)) },
          );
        }}
      >
        <div className="flex items-center gap-3">
          <Avatar name={form.display_name} url={form.avatar_url || null} size={48} />
          <div className="text-xs text-[var(--text-muted)]">{user.email}</div>
        </div>
        <label className="block space-y-1"><span className="field-label">Nombre</span><input required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="input" /></label>
        <label className="block space-y-1">
          <span className="field-label">Usuario para menciones</span>
          <div className="flex items-center gap-1"><span className="text-[var(--text-muted)]">@</span><input required pattern="[a-z][a-z0-9._-]{0,39}" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })} className="input" /></div>
        </label>
        <label className="block space-y-1"><span className="field-label">URL de avatar</span><input type="url" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} className="input" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="field-label">Idioma y formato</span>
            <select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className="input">
              <option value="es">Español</option><option value="es-CO">Español (Colombia)</option><option value="es-MX">Español (México)</option><option value="en">English</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="field-label">Zona horaria</span>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="input">
              {[...new Set([form.timezone, ...TIMEZONES])].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={form.email_notifications} onChange={(e) => setForm({ ...form, email_notifications: e.target.checked })} className="accent-[var(--accent-color)]" />
          Recibir resumen de notificaciones por correo
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          Tema
          <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')} className="input w-auto py-1 text-xs"><option value="light">Claro</option><option value="dark">Oscuro</option></select>
        </label>
        <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={update.isPending}><Save className="h-3.5 w-3.5" /> Guardar</button></div>
      </form>

      <form
        className="card p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw.new_password !== pw.confirm) {
            toast.error('Las contraseñas no coinciden');
            return;
          }
          password.mutate(
            { current_password: pw.current_password, new_password: pw.new_password },
            { onSuccess: () => { toast.success('Contraseña actualizada; las demás sesiones se cerraron'); setPw({ current_password: '', new_password: '', confirm: '' }); }, onError: (err) => toast.error(errorMessage(err)) },
          );
        }}
      >
        <h3 className="section-title"><KeyRound className="h-3.5 w-3.5" /> Cambiar contraseña</h3>
        <input required type="password" autoComplete="current-password" placeholder="Contraseña actual" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className="input" />
        <input required minLength={8} type="password" autoComplete="new-password" placeholder="Nueva contraseña (mín. 8)" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className="input" />
        <input required minLength={8} type="password" autoComplete="new-password" placeholder="Repite la nueva contraseña" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="input" />
        <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={password.isPending}>Actualizar contraseña</button></div>
      </form>
    </div>
  );
}
