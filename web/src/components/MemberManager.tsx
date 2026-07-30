import { useState } from 'react';
import { UserPlus, Crown, Trash2, UserCheck } from 'lucide-react';
import {
  useSpaceMembers,
  useRequirementMembers,
  useAddRequirementMember,
  useRemoveRequirementMember,
  useSetRequirementLead,
} from '../hooks/useMembers';

interface MemberManagerProps {
  spaceId: string;
  reqId: string;
  currentLeadUserId: string | null;
}

export default function MemberManager({ spaceId, reqId, currentLeadUserId }: MemberManagerProps) {
  const { data: spaceMembers = [], isLoading: loadingSpace } = useSpaceMembers(spaceId);
  const { data: reqMembers = [], isLoading: loadingReq } = useRequirementMembers(reqId);
  const addMember = useAddRequirementMember(reqId);
  const removeMember = useRemoveRequirementMember(reqId);
  const setLead = useSetRequirementLead(reqId);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const assignedIds = new Set(reqMembers.map(m => m.subject_id));
  const availableMembers = spaceMembers.filter(sm => !assignedIds.has(sm.id));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    await addMember.mutateAsync({
      subject_type: 'user',
      subject_id: selectedUserId,
      is_lead: false,
    });
    setSelectedUserId('');
    setIsAdding(false);
  };

  const handleSetLead = async (userId: string) => {
    const newLead = currentLeadUserId === userId ? null : userId;
    await setLead.mutateAsync({ lead_user_id: newLead });
  };

  const handleRemove = async (subjectId: string) => {
    await removeMember.mutateAsync(subjectId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5 text-[var(--accent-text)]" />
          Miembros Asignados ({reqMembers.length})
        </h4>
        {!isAdding && availableMembers.length > 0 && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 text-xs text-[var(--accent-text)] hover:text-[var(--accent-color-hover)] font-medium transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Añadir
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="flex gap-2 p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)]">
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none"
            required
          >
            <option value="">Seleccionar usuario del espacio...</option>
            {availableMembers.map(sm => (
              <option key={sm.id} value={sm.id}>
                {sm.display_name} ({sm.email})
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!selectedUserId || addMember.isPending}
            className="px-3 py-1.5 rounded-md bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] disabled:bg-[var(--bg-surface-hover)] text-[var(--text-inverted)] text-xs font-semibold transition-colors"
          >
            Asignar
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            className="px-2.5 py-1.5 rounded-md bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-[var(--text-muted)] text-xs font-semibold transition-colors"
          >
            ×
          </button>
        </form>
      )}

      {loadingReq || loadingSpace ? (
        <div className="text-xs text-[var(--text-muted)] py-2">Cargando miembros…</div>
      ) : reqMembers.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">No hay miembros asignados. Cualquiera en el espacio puede participar.</p>
      ) : (
        <div className="space-y-1.5">
          {reqMembers.map(m => {
            const isLeadUser = currentLeadUserId === m.subject_id || m.is_lead;
            return (
              <div
                key={m.subject_id}
                className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--text-muted)] transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-6 w-6 rounded-full bg-[var(--accent-color)] flex items-center justify-center text-[10px] font-bold text-[var(--text-inverted)] shrink-0">
                    {m.display_name ? m.display_name.slice(0, 2).toUpperCase() : 'US'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[var(--text-secondary)] truncate">{m.display_name || m.subject_id}</span>
                      {isLeadUser && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--status-analysis-bg)] text-[var(--status-analysis-text)] border border-[var(--status-analysis-text)]/30">
                          <Crown className="h-2.5 w-2.5" />
                          Lead
                        </span>
                      )}
                    </div>
                    {m.email && <p className="text-[10px] text-[var(--text-muted)] truncate">{m.email}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleSetLead(m.subject_id)}
                    title={isLeadUser ? 'Quitar como Responsable Principal' : 'Establecer como Responsable Principal'}
                    className={`p-1 rounded hover:bg-[var(--bg-surface-hover)] transition-colors ${
                      isLeadUser ? 'text-[var(--status-analysis-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Crown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(m.subject_id)}
                    title="Desasignar miembro"
                    className="p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
