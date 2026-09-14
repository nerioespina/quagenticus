import { Crown, MoreHorizontal, UserCheck, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import MemberPicker from './MemberPicker';
import Popover from '../ui/Popover';
import { Avatar } from '../ui/Avatar';
import {
  useAddRequirementMember, useRemoveRequirementMember, useRequirementMembers, useSetRequirementLead,
} from '../../hooks/useRequirements';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface Props {
  spaceId: string;
  reqId: string;
  leadUserId: string | null;
  disabled?: boolean;
  canInvite?: boolean;
}

export default function MemberManager({ spaceId, reqId, leadUserId, disabled, canInvite }: Props) {
  const me = useAuth((s) => s.user);
  const { data: members = [], isLoading } = useRequirementMembers(reqId);
  const add = useAddRequirementMember(reqId, spaceId);
  const remove = useRemoveRequirementMember(reqId, spaceId);
  const setLead = useSetRequirementLead(reqId, spaceId);
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const users = members.filter((m) => m.subject_type === 'user');
  const agents = members.filter((m) => m.subject_type === 'agent');
  const selected = users.map((m) => m.subject_id);
  const isMember = !!me && selected.includes(me.id);

  const toggle = (userId: string, on: boolean) => {
    if (on) add.mutate({ subject_id: userId }, { onError });
    else remove.mutate(userId, { onError });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="section-title">
          <UserCheck className="h-3.5 w-3.5 text-[var(--accent-text)]" />
          Miembros
          <span className="font-mono text-[10px] text-[var(--text-muted)]">{members.length}</span>
        </h4>
        <div className="flex items-center gap-1.5">
          {me && !disabled && !isMember && (
            <button type="button" onClick={() => toggle(me.id, true)} className="text-[11px] text-[var(--accent-text)] hover:underline">
              Unirme
            </button>
          )}
          <MemberPicker
            spaceId={spaceId}
            selected={selected}
            leadId={leadUserId}
            onToggle={toggle}
            onSetLead={(id) => setLead.mutate(id, { onError })}
            disabled={disabled}
            canInvite={canInvite}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-[var(--text-muted)]">Cargando…</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">Sin miembros. Los miembros reciben notificaciones de los cambios.</p>
      ) : (
        <ul className="space-y-1">
          {[...users, ...agents].map((m) => {
            const isLead = leadUserId === m.subject_id;
            return (
              <li key={m.subject_id} className="flex items-center gap-2 min-w-0 rounded-lg px-1.5 py-1 hover:bg-[var(--bg-surface-hover)]">
                <Avatar name={m.display_name} url={m.avatar_url} size={24} agent={m.subject_type === 'agent'} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] min-w-0">
                    <span className="truncate">{m.display_name || 'Usuario'}</span>
                    {isLead && <Crown className="h-3 w-3 text-amber-500 shrink-0" aria-label="Responsable" />}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">{m.subject_type === 'agent' ? 'Agente' : m.email}</p>
                </div>
                {!disabled && m.subject_type === 'user' && (
                  <Popover
                    align="end"
                    width={200}
                    trigger={({ toggle: t, ref }) => (
                      <button ref={ref} type="button" onClick={t} aria-label={`Acciones para ${m.display_name}`} className="icon-btn shrink-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    )}
                  >
                    {(close) => (
                      <div className="py-1">
                        <button
                          type="button"
                          className="menu-item"
                          onClick={() => {
                            setLead.mutate(isLead ? null : m.subject_id, { onError });
                            close();
                          }}
                        >
                          <Crown className="h-3.5 w-3.5" /> {isLead ? 'Quitar como responsable' : 'Hacer responsable'}
                        </button>
                        <button
                          type="button"
                          className="menu-item text-red-500"
                          onClick={() => {
                            remove.mutate(m.subject_id, { onError });
                            close();
                          }}
                        >
                          <UserMinus className="h-3.5 w-3.5" /> Quitar del requerimiento
                        </button>
                      </div>
                    )}
                  </Popover>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
