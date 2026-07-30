import { useState } from 'react';
import Modal from './Modal';
import { useSpaceMembers, useAddSpaceMember, useUpdateSpaceMember, useRemoveSpaceMember } from '../hooks/useSpaceMembers';
import { useUsers } from '../hooks/useUsers';
import { UserPlus, Trash2, Loader2 } from 'lucide-react';

interface SpaceMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
}

const ROLES = [
  { key: 'admin', label: 'Administrador' },
  { key: 'maintainer', label: 'Mantenedor' },
  { key: 'contributor', label: 'Colaborador' },
  { key: 'viewer', label: 'Lector' },
];

export default function SpaceMembersModal({ isOpen, onClose, spaceId, spaceName }: SpaceMembersModalProps) {
  const { data: members = [], isLoading: loadingMembers } = useSpaceMembers(spaceId);
  const { data: allUsers = [] } = useUsers();

  const addMember = useAddSpaceMember(spaceId);
  const updateMember = useUpdateSpaceMember(spaceId);
  const removeMember = useRemoveSpaceMember(spaceId);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('contributor');

  const unassignedUsers = allUsers.filter(
    (u) => !members.some((m) => m.id === u.id)
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    addMember.mutate(
      { user_id: selectedUserId, role: selectedRole },
      {
        onSuccess: () => {
          setSelectedUserId('');
          setSelectedRole('contributor');
        },
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Miembros y Roles · ${spaceName}`}>
      <div className="space-y-4 max-w-xl">
        <p className="text-xs text-[var(--text-muted)]">
          Asigna usuarios a este espacio y define sus niveles de acceso y permisos.
        </p>

        {/* Add Member Form */}
        <form onSubmit={handleAddSubmit} className="p-3 bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-xl space-y-2">
          <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
            Agregar Usuario al Espacio
          </label>
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              required
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
            >
              <option value="">Seleccionar Usuario...</option>
              {unassignedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} ({u.email})
                </option>
              ))}
            </select>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={addMember.isPending || !selectedUserId}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:bg-[var(--accent-color-hover)] disabled:opacity-50 flex items-center gap-1 shrink-0"
            >
              {addMember.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Agregar
            </button>
          </div>
        </form>

        {/* Members List */}
        <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
          {loadingMembers ? (
            <div className="p-6 text-center text-xs text-[var(--text-muted)] flex justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando miembros...
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface-hover)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                  <th className="p-3">Miembro</th>
                  <th className="p-3">Rol en Espacio</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                    <td className="p-3 font-medium text-[var(--text-primary)]">
                      <div>{m.display_name}</div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">{m.email}</div>
                    </td>
                    <td className="p-3">
                      <select
                        value={m.role}
                        onChange={(e) => updateMember.mutate({ userId: m.id, role: e.target.value })}
                        className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none"
                      >
                        {ROLES.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => removeMember.mutate(m.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                        title="Remover miembro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-xs text-[var(--text-muted)]">
                      No hay miembros asignados a este espacio.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
