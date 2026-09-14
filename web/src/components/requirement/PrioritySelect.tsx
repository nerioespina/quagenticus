import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import Popover from '../ui/Popover';
import { usePriorities } from '../../hooks/useCatalogs';
import { useUpdateRequirement } from '../../hooks/useRequirements';
import { badgeStyle } from '../../lib/colors';
import { errorMessage } from '../../lib/api';

interface Props {
  reqId: string;
  priorityId: string;
  priorityName: string;
  priorityColor: string | null;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export default function PrioritySelect({ reqId, priorityId, priorityName, priorityColor, disabled, size = 'md' }: Props) {
  const { data: priorities = [] } = usePriorities();
  const update = useUpdateRequirement();
  return (
    <Popover
      width={200}
      trigger={({ toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          disabled={disabled || update.isPending}
          aria-label={`Prioridad: ${priorityName}`}
          style={badgeStyle(priorityColor)}
          className={`inline-flex items-center gap-1 rounded-md border font-semibold uppercase tracking-wide disabled:opacity-60 ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
        >
          {priorityName}
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
    >
      {(close) => (
        <ul className="py-1">
          {priorities.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`menu-item ${p.id === priorityId ? 'bg-[var(--accent-soft)]' : ''}`}
                onClick={() => {
                  close();
                  if (p.id !== priorityId) update.mutate({ id: reqId, priority_id: p.id }, { onError: (e) => toast.error(errorMessage(e)) });
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? '#64748b' }} />
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}
