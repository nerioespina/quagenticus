import { useState } from 'react';
import { Check, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';
import Popover from '../ui/Popover';
import { LabelChip } from '../ui/misc';
import { useCreateSpaceLabel, useSpaceLabels } from '../../hooks/useCatalogs';
import { LABEL_COLORS, labelStyle } from '../../lib/colors';
import { errorMessage } from '../../lib/api';
import type { LabelRef } from '../../lib/api';

interface Props {
  spaceId: string;
  assigned: LabelRef[];
  onToggle: (label: LabelRef, assigned: boolean) => void;
  disabled?: boolean;
  compactTrigger?: boolean;
}

export default function LabelPicker({ spaceId, assigned, onToggle, disabled, compactTrigger }: Props) {
  const { data: labels = [] } = useSpaceLabels(spaceId);
  const create = useCreateSpaceLabel(spaceId);
  const [q, setQ] = useState('');
  const [color, setColor] = useState('blue');
  const assignedIds = new Set(assigned.map((l) => l.id));
  const filtered = labels.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()));
  const exact = labels.some((l) => l.name.toLowerCase() === q.trim().toLowerCase());

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {!compactTrigger &&
        assigned.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} onRemove={disabled ? undefined : () => onToggle(l, true)} />)}
      {!disabled && (
        <Popover
          width={272}
          trigger={({ toggle, ref }) => (
            <button
              ref={ref}
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-[var(--border-color)] text-[11px] text-[var(--text-muted)] hover:border-[var(--accent-color)] hover:text-[var(--text-primary)]"
            >
              {compactTrigger ? <Tag className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {compactTrigger ? 'Etiquetas' : assigned.length === 0 ? 'Etiqueta' : ''}
            </button>
          )}
        >
          <div className="p-2 space-y-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar o crear etiqueta" className="input py-1.5 text-xs" />
            <ul className="max-h-56 overflow-y-auto space-y-1">
              {filtered.map((l) => {
                const on = assignedIds.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(l, on)}
                      style={labelStyle(l.color)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-semibold"
                    >
                      <span className="truncate">{l.name}</span>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="text-xs text-[var(--text-muted)] px-1">Sin etiquetas.</li>}
            </ul>
            {q.trim() && !exact && (
              <div className="border-t border-[var(--border-color)] pt-2 space-y-2">
                <div className="grid grid-cols-8 gap-1">
                  {Object.keys(LABEL_COLORS).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => setColor(c)}
                      style={labelStyle(c)}
                      className={`h-5 rounded ${color === c ? 'ring-2 ring-offset-1 ring-[var(--accent-color)]' : ''}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate(
                      { name: q.trim(), color },
                      {
                        onSuccess: (label) => {
                          onToggle(label, false);
                          setQ('');
                        },
                        onError: (e) => toast.error(errorMessage(e)),
                      },
                    )
                  }
                  className="btn-primary w-full justify-center text-xs"
                >
                  Crear «{q.trim()}»
                </button>
              </div>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}
