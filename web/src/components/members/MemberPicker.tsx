import { useMemo, useState } from 'react';
import { Check, Crown, Search, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import Popover from '../ui/Popover';
import { Avatar } from '../ui/Avatar';
import { useSpaceMembers } from '../../hooks/useSpaces';

interface Props {
  spaceId: string;
  selected: string[];
  leadId?: string | null;
  onToggle: (userId: string, selected: boolean) => void;
  onSetLead?: (userId: string | null) => void;
  trigger?: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => React.ReactNode;
  canInvite?: boolean;
  disabled?: boolean;
}

/**
 * Trello-style member picker: searchable, toggles several people without
 * closing, marks the lead. Always renders its trigger, even when everyone is assigned.
 */
export default function MemberPicker({ spaceId, selected, leadId, onToggle, onSetLead, trigger, canInvite, disabled }: Props) {
  const { data: members = [], isLoading } = useSpaceMembers(spaceId);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members
      .filter((m) => !needle || m.display_name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle) || m.handle.includes(needle))
      .sort((a, b) => Number(selectedSet.has(b.id)) - Number(selectedSet.has(a.id)));
  }, [members, q, selectedSet]);

  return (
    <Popover
      width={300}
      trigger={
        trigger ??
        (({ toggle, ref, open }) => (
          <button
            ref={ref}
            type="button"
            disabled={disabled}
            onClick={toggle}
            aria-expanded={open}
            aria-label="Añadir miembros"
            className="h-7 w-7 inline-flex items-center justify-center rounded-full border border-dashed border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--accent-color)] hover:text-[var(--accent-text)] disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        ))
      }
    >
      <div className="p-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && filtered[active]) {
                e.preventDefault();
                onToggle(filtered[active].id, !selectedSet.has(filtered[active].id));
              }
            }}
            placeholder="Buscar miembros del espacio"
            className="input pl-7 py-1.5 text-xs"
          />
        </div>
        <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto">
          {isLoading && <li className="px-2 py-2 text-xs text-[var(--text-muted)]">Cargando…</li>}
          {!isLoading && filtered.length === 0 && (
            <li className="px-2 py-3 text-xs text-[var(--text-muted)] text-center">
              {members.length === 0 ? 'El espacio no tiene miembros.' : 'Nadie coincide con la búsqueda.'}
            </li>
          )}
          {filtered.map((m, i) => {
            const isSel = selectedSet.has(m.id);
            const isLead = leadId === m.id;
            return (
              <li
                key={m.id}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setActive(i)}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${i === active ? 'bg-[var(--bg-surface-hover)]' : ''}`}
                onClick={() => onToggle(m.id, !isSel)}
              >
                <Avatar name={m.display_name} url={m.avatar_url} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">{m.display_name}</p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">@{m.handle} · {m.email}</p>
                </div>
                {onSetLead && isSel && (
                  <button
                    type="button"
                    title={isLead ? 'Quitar como responsable' : 'Hacer responsable'}
                    aria-label={isLead ? 'Quitar como responsable' : 'Hacer responsable'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetLead(isLead ? null : m.id);
                    }}
                    className={`p-1 rounded ${isLead ? 'text-amber-500' : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-amber-500'}`}
                  >
                    <Crown className="h-3.5 w-3.5" />
                  </button>
                )}
                <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSel ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white' : 'border-[var(--border-color)]'}`}>
                  {isSel && <Check className="h-3 w-3" />}
                </span>
              </li>
            );
          })}
        </ul>
        {members.length > 0 && selected.length >= members.length && (
          <p className="px-2 text-[11px] text-[var(--text-muted)]">Todos los miembros del espacio ya están asignados.</p>
        )}
        {canInvite && (
          <Link to={`/spaces/${spaceId}/settings?tab=members`} className="block px-2 pb-1 text-[11px] text-[var(--accent-text)] hover:underline">
            Invitar personas al espacio
          </Link>
        )}
      </div>
    </Popover>
  );
}
