import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bot, CalendarDays, CheckSquare, MessageSquare, Paperclip, Pencil } from 'lucide-react';
import { AvatarStack } from '../ui/Avatar';
import { LabelChip } from '../ui/misc';
import type { BoardCard as Card } from '../../lib/api';
import { badgeStyle } from '../../lib/colors';
import { dueState, formatDate } from '../../lib/dates';

interface CardBodyProps {
  card: Card;
  overlay?: boolean;
}

export function CardBody({ card }: CardBodyProps) {
  const due = dueState(card.due_date, card.is_closed);
  return (
    <>
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {card.labels.slice(0, 5).map((l) => <LabelChip key={l.id} name={l.name} color={l.color} compact />)}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-[11px]">
        {card.tracker_icon && <span aria-hidden>{card.tracker_icon}</span>}
        <span className="font-mono font-semibold text-[var(--accent-text)]">{card.ref_key}</span>
        <span style={badgeStyle(card.priority_color)} className="ml-auto px-1.5 rounded border text-[10px] font-semibold uppercase">
          {card.priority_name}
        </span>
      </div>
      <p className={`mt-1 text-sm font-medium leading-snug break-words ${card.is_closed ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
        {card.title}
      </p>
      {card.claimed_by_agent_name && (
        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-violet-500">
          <Bot className="h-3 w-3" /> {card.claimed_by_agent_name}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
        {card.due_date && (
          <span
            className={`inline-flex items-center gap-0.5 px-1 rounded ${
              due === 'overdue' ? 'bg-rose-500/15 text-rose-500' : due === 'soon' ? 'bg-amber-500/15 text-amber-600' : due === 'done' ? 'bg-emerald-500/15 text-emerald-600' : ''
            }`}
            title="Fecha límite"
          >
            <CalendarDays className="h-3 w-3" />
            {formatDate(card.due_date, { day: 'numeric', month: 'short' })}
          </span>
        )}
        {card.comment_count > 0 && (
          <span className="inline-flex items-center gap-0.5" title={`${card.comment_count} comentarios`}>
            <MessageSquare className="h-3 w-3" />
            {card.comment_count}
          </span>
        )}
        {card.attachment_count > 0 && (
          <span className="inline-flex items-center gap-0.5" title={`${card.attachment_count} adjuntos`}>
            <Paperclip className="h-3 w-3" />
            {card.attachment_count}
          </span>
        )}
        {card.children_count > 0 && (
          <span className={`inline-flex items-center gap-0.5 ${card.children_done === card.children_count ? 'text-emerald-600' : ''}`} title="Sub-requerimientos cerrados">
            <CheckSquare className="h-3 w-3" />
            {card.children_done}/{card.children_count}
          </span>
        )}
        <span className="ml-auto">
          <AvatarStack members={card.members} max={3} size={20} />
        </span>
      </div>
    </>
  );
}

interface SortableCardProps {
  card: Card;
  spaceId: string;
  dragDisabled: boolean;
  onOpen: (id: string) => void;
  onQuickEdit: (id: string, anchor: HTMLElement) => void;
  onHover: (id: string | null) => void;
  onOpenFull: (id: string) => void;
}

function SortableCardImpl({ card, spaceId, dragDisabled, onOpen, onQuickEdit, onHover, onOpenFull }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', statusId: card.status_id },
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative [content-visibility:auto] [contain-intrinsic-size:auto_96px] ${isDragging ? 'opacity-30' : ''}`}
      onMouseEnter={() => onHover(card.id)}
      onMouseLeave={() => onHover(null)}
      {...attributes}
      {...listeners}
    >
      <Link
        to={`/spaces/${spaceId}/requirements/${card.id}`}
        data-card-id={card.id}
        draggable={false}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab / window
          e.preventDefault();
          onOpen(card.id);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          onOpenFull(card.id);
        }}
        className="block rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-sm)] hover:border-[var(--accent-color)]/50 transition-colors cursor-pointer"
      >
        <CardBody card={card} />
      </Link>
      <button
        type="button"
        aria-label={`Edición rápida de ${card.ref_key}`}
        title="Edición rápida (E)"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onQuickEdit(card.id, e.currentTarget.parentElement as HTMLElement);
        }}
        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

export const SortableCard = memo(SortableCardImpl);
