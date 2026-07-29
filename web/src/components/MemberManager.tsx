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
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5 text-indigo-400" />
          Miembros Asignados ({reqMembers.length})
        </h4>
        {!isAdding && availableMembers.length > 0 && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Añadir
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="flex gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
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
            className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-semibold transition-colors"
          >
            Asignar
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(false)}
            className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-semibold transition-colors"
          >
            ×
          </button>
        </form>
      )}

      {loadingReq || loadingSpace ? (
        <div className="text-xs text-slate-500 py-2">Cargando miembros…</div>
      ) : reqMembers.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No hay miembros asignados. Cualquiera en el espacio puede participar.</p>
      ) : (
        <div className="space-y-1.5">
          {reqMembers.map(m => {
            const isLeadUser = currentLeadUserId === m.subject_id || m.is_lead;
            return (
              <div
                key={m.subject_id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {m.display_name ? m.display_name.slice(0, 2).toUpperCase() : 'US'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-slate-200 truncate">{m.display_name || m.subject_id}</span>
                      {isLeadUser && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          <Crown className="h-2.5 w-2.5" />
                          Lead
                        </span>
                      )}
                    </div>
                    {m.email && <p className="text-[10px] text-slate-500 truncate">{m.email}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleSetLead(m.subject_id)}
                    title={isLeadUser ? 'Quitar como Responsable Principal' : 'Establecer como Responsable Principal'}
                    className={`p-1 rounded hover:bg-slate-800 transition-colors ${
                      isLeadUser ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Crown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(m.subject_id)}
                    title="Desasignar miembro"
                    className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
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
