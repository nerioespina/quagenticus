import { useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '../ui/Avatar';
import { Spinner } from '../ui/misc';
import { confirmDialog } from '../ui/Confirm';
import { useAddSpaceMember, useRemoveSpaceMember, useSpaceMembers, useUpdateSpaceMember } from '../../hooks/useSpaces';
import { useUsers } from '../../hooks/useUsers';
import { errorMessage } from '../../lib/api';
import type { Role } from '../../lib/api';
import { ROLE_LABELS } from '../../lib/i18n';

const ROLES: Role[] = ['admin', 'maintainer', 'contributor', 'viewer'];
const ROLE_HELP: Record<Role, string> = {
  viewer: 'Lee y comenta (si el espacio lo permite).',
  contributor: 'Crea y edita requerimientos y documentos.',
  maintainer: 'Además gestiona hitos, categorías, tableros y modera.',
  admin: 'Además gestiona miembros y la configuración del espacio.',
};

export default function SpaceMembersPanel({ spaceId, canManage }: { spaceId: string; canManage: boolean }) {
  const { data: members = [], isLoading } = useSpaceMembers(spaceId);
  const { data: users = [] } = useUsers();
  const add = useAddSpaceMember(spaceId);
  const update = useUpdateSpaceMember(spaceId);
  const remove = useRemoveSpaceMember(spaceId);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Role>('contributor');
  const candidates = users.filter((u) => u.status === 'active' && !members.some((m) => m.id === u.id));
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  return (
    <div className="space-y-4">
      {canManage && (
        <form
          className="card p-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!userId) return;
            add.mutate({ user_id: userId, role }, { onSuccess: () => { setUserId(''); toast.success('Miembro añadido'); }, onError: onErr });
          }}
        >
          <label className="flex-1 min-w-[200px] space-y-1">
            <span className="field-label">Persona</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input py-1.5 text-xs">
              <option value="">{candidates.length ? 'Seleccionar…' : 'Todos los usuarios ya son miembros'}</option>
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.display_name} · {u.email}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="field-label">Rol</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input py-1.5 text-xs w-auto">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </label>
          <button type="submit" className="btn-primary text-xs" disabled={!userId || add.isPending}><UserPlus className="h-3.5 w-3.5" /> Añadir</button>
          <p className="basis-full text-[11px] text-[var(--text-muted)]">{ROLE_HELP[role]}</p>
        </form>
      )}
      {isLoading ? <Spinner /> : (
        <ul className="card divide-y divide-[var(--border-color)]">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-3 min-w-0">
              <Avatar name={m.display_name} url={m.avatar_url} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--text-primary)] truncate">{m.display_name}</p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">@{m.handle} · {m.email}</p>
              </div>
              {canManage ? (
                <>
                  <select value={m.role} onChange={(e) => update.mutate({ userId: m.id, role: e.target.value as Role }, { onError: onErr })} className="input w-auto py-1 text-xs" aria-label={`Rol de ${m.display_name}`}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button
                    type="button"
                    className="icon-btn hover:text-red-500"
                    aria-label={`Quitar a ${m.display_name}`}
                    onClick={async () => {
                      if ((await confirmDialog({ title: `Quitar a ${m.display_name}`, message: 'Perderá el acceso al espacio.', danger: true, confirmLabel: 'Quitar' })) !== false) remove.mutate(m.id, { onError: onErr });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">{ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
