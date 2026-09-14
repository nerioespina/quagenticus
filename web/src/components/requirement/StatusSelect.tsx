import { ChevronDown, Lock } from 'lucide-react';
import { toast } from 'sonner';
import Popover from '../ui/Popover';
import { confirmDialog } from '../ui/Confirm';
import { useStatuses } from '../../hooks/useCatalogs';
import { useAllowedTransitions, useTransitionRequirement } from '../../hooks/useRequirements';
import { badgeStyle } from '../../lib/colors';
import { errorMessage } from '../../lib/api';
import type { WorkflowStatus } from '../../lib/api';

/** Asks for the resolution (and optional comment) when the target status requires it. */
export async function askTransitionExtras(target: WorkflowStatus): Promise<{ resolution?: string } | null> {
  if (!target.requires_resolution) return {};
  const v = await confirmDialog({
    title: `Mover a «${target.name}»`,
    message: 'Este estado requiere indicar la resolución.',
    confirmLabel: 'Mover',
    input: { label: 'Resolución', placeholder: 'Implementado, duplicado, no se reproduce…', required: true },
  });
  return v === false ? null : { resolution: v };
}

interface Props {
  reqId: string;
  statusId: string;
  statusName: string;
  statusColor: string | null;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export default function StatusSelect({ reqId, statusId, statusName, statusColor, disabled, size = 'md' }: Props) {
  const { data: statuses = [] } = useStatuses();
  const { data: allowed } = useAllowedTransitions(disabled ? null : reqId);
  const transition = useTransitionRequirement();
  const allowedSet = new Set(allowed ?? []);

  const choose = async (s: WorkflowStatus, close: () => void) => {
    close();
    if (s.id === statusId) return;
    const extras = await askTransitionExtras(s);
    if (!extras) return;
    transition.mutate(
      { id: reqId, to_status_id: s.id, ...extras },
      { onSuccess: () => toast.success(`Movido a «${s.name}»`), onError: (e) => toast.error(errorMessage(e)) },
    );
  };

  return (
    <Popover
      width={240}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          disabled={disabled || transition.isPending}
          aria-expanded={open}
          aria-label={`Estado: ${statusName}`}
          style={badgeStyle(statusColor)}
          className={`inline-flex items-center gap-1.5 rounded-md border font-semibold uppercase tracking-wide disabled:opacity-60 ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor ?? '#64748b' }} />
          {statusName}
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
    >
      {(close) => (
        <ul role="listbox" className="py-1 max-h-80 overflow-y-auto">
          {statuses.map((s) => {
            const ok = allowed === undefined || allowedSet.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={s.id === statusId}
                  disabled={!ok}
                  onClick={() => choose(s, close)}
                  title={ok ? undefined : 'Transición no permitida por el flujo de trabajo'}
                  className={`menu-item ${s.id === statusId ? 'bg-[var(--accent-soft)]' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color ?? '#64748b' }} />
                  <span className="flex-1 text-left">{s.name}</span>
                  {s.is_closed && <span className="text-[10px] text-[var(--text-muted)]">cerrado</span>}
                  {!ok && <Lock className="h-3 w-3" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}
