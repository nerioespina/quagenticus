import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowRightLeft, CalendarDays, Flag, ExternalLink, Tag, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import MemberPicker from '../members/MemberPicker';
import LabelPicker from '../requirement/LabelPicker';
import { askTransitionExtras } from '../requirement/StatusSelect';
import { confirmDialog } from '../ui/Confirm';
import {
  useAddRequirementMember, useArchiveDocument, useDocumentLabelsMutation, useRemoveRequirementMember, useTransitionRequirement, useUpdateRequirement,
} from '../../hooks/useRequirements';
import { usePriorities, useStatuses } from '../../hooks/useCatalogs';
import { errorMessage } from '../../lib/api';
import type { BoardCard } from '../../lib/api';

interface Props {
  card: BoardCard;
  anchor: HTMLElement;
  spaceId: string;
  onClose: () => void;
}

/** In-place quick editor (Trello "quick card editor"). */
export default function CardQuickEditor({ card, anchor, spaceId, onClose }: Props) {
  const [title, setTitle] = useState(card.title);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });
  const ref = useRef<HTMLDivElement>(null);
  const update = useUpdateRequirement();
  const transition = useTransitionRequirement();
  const archive = useArchiveDocument();
  const addMember = useAddRequirementMember(card.id, spaceId);
  const removeMember = useRemoveRequirementMember(card.id, spaceId);
  const labels = useDocumentLabelsMutation(card.id, spaceId);
  const { data: statuses = [] } = useStatuses();
  const { data: priorities = [] } = usePriorities();
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - r.width - 200);
    setPos({ top: Math.min(r.top, window.innerHeight - 320), left, width: r.width });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveTitle = () => {
    if (title.trim() && title.trim() !== card.title) update.mutate({ id: card.id, title: title.trim() }, { onError: onErr });
  };

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/50" onClick={() => { saveTitle(); onClose(); }} />
      <div ref={ref} style={{ top: pos.top, left: pos.left }} className="absolute flex gap-2 items-start">
        <div style={{ width: pos.width }} className="rounded-xl bg-[var(--bg-surface)] p-2 shadow-[var(--shadow-md)]">
          <textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveTitle();
                onClose();
              }
            }}
            rows={3}
            className="w-full resize-none bg-transparent text-sm font-medium text-[var(--text-primary)] outline-none"
          />
          <button type="button" className="btn-primary text-xs" onClick={() => { saveTitle(); onClose(); }}>Guardar</button>
        </div>
        <div className="flex flex-col gap-1.5 w-44">
          <Link to={`/spaces/${spaceId}/requirements/${card.id}`} className="quick-action"><ExternalLink className="h-3.5 w-3.5" /> Abrir completo</Link>
          <MemberPicker
            spaceId={spaceId}
            selected={card.members.filter((m) => m.type === 'user').map((m) => m.id)}
            leadId={card.lead_user_id}
            onToggle={(id, on) => (on ? addMember.mutate({ subject_id: id }, { onError: onErr }) : removeMember.mutate(id, { onError: onErr }))}
            trigger={({ toggle, ref: r }) => (
              <button ref={r} type="button" onClick={toggle} className="quick-action"><Users className="h-3.5 w-3.5" /> Miembros</button>
            )}
          />
          <div className="quick-action p-0">
            <LabelPicker
              spaceId={spaceId}
              assigned={card.labels}
              compactTrigger
              onToggle={(l, on) => (on ? labels.remove : labels.add).mutate(l.id, { onError: onErr })}
            />
            <Tag className="hidden" />
          </div>
          <label className="quick-action cursor-pointer">
            <CalendarDays className="h-3.5 w-3.5" />
            <input
              type="date"
              value={card.due_date ?? ''}
              aria-label="Fecha límite"
              onChange={(e) => update.mutate({ id: card.id, due_date: e.target.value || null }, { onError: onErr })}
              className="bg-transparent text-xs outline-none w-full"
            />
          </label>
          <label className="quick-action">
            <Flag className="h-3.5 w-3.5" />
            <select
              value={card.priority_id}
              aria-label="Prioridad"
              onChange={(e) => update.mutate({ id: card.id, priority_id: e.target.value }, { onError: onErr })}
              className="bg-transparent text-xs outline-none w-full"
            >
              {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="quick-action">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <select
              value={card.status_id}
              aria-label="Mover a"
              onChange={async (e) => {
                const target = statuses.find((s) => s.id === e.target.value);
                if (!target) return;
                const extras = await askTransitionExtras(target);
                if (!extras) return;
                transition.mutate({ id: card.id, to_status_id: target.id, ...extras }, { onError: onErr });
              }}
              className="bg-transparent text-xs outline-none w-full"
            >
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="quick-action text-rose-500"
            onClick={async () => {
              if ((await confirmDialog({ title: `Archivar ${card.ref_key}`, message: 'Podrás restaurarlo desde la lista de archivados.', confirmLabel: 'Archivar', danger: true })) === false) return;
              archive.mutate({ id: card.id, archived: true, spaceId }, { onSuccess: onClose, onError: onErr });
            }}
          >
            <Archive className="h-3.5 w-3.5" /> Archivar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
