import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronsLeftRight, Plus } from 'lucide-react';
import { SortableCard } from './BoardCard';
import type { BoardCard, BoardColumn as Column } from '../../lib/api';

interface Props {
  column: Column;
  cards: BoardCard[];
  spaceId: string;
  collapsed: boolean;
  dragDisabled: boolean;
  canCreate: boolean;
  onToggleCollapsed: (statusId: string) => void;
  onAdd: (statusId: string) => void;
  onOpen: (id: string) => void;
  onOpenFull: (id: string) => void;
  onQuickEdit: (id: string, anchor: HTMLElement) => void;
  onHover: (id: string | null) => void;
  hiddenByFilter: number;
}

function BoardColumnImpl({
  column, cards, spaceId, collapsed, dragDisabled, canCreate, onToggleCollapsed, onAdd, onOpen, onOpenFull, onQuickEdit, onHover, hiddenByFilter,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.status_id}`, data: { type: 'column', statusId: column.status_id } });
  const overWip = column.wip_limit != null && cards.length > column.wip_limit;
  const hiddenClosed = column.is_closed ? column.total - cards.length - hiddenByFilter : 0;

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={`shrink-0 w-11 rounded-xl border flex flex-col items-center py-3 gap-3 cursor-pointer ${isOver ? 'border-[var(--accent-color)] bg-[var(--accent-soft)]' : 'border-[var(--border-color)] bg-[var(--bg-surface)]/60'}`}
        onClick={() => onToggleCollapsed(column.status_id)}
        title={`Expandir ${column.name}`}
      >
        <span className="text-[11px] font-mono text-[var(--text-muted)]">{column.total}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: column.color ?? '#64748b' }} />
        <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">{column.name}</span>
      </div>
    );
  }

  return (
    <section
      aria-label={column.name}
      className={`shrink-0 w-72 rounded-xl border flex flex-col max-h-full ${isOver ? 'border-[var(--accent-color)]/60 bg-[var(--bg-surface)]' : 'border-[var(--border-color)] bg-[var(--bg-surface)]/60'}`}
    >
      <header className={`flex items-center gap-2 px-3 py-2.5 border-b ${overWip ? 'border-rose-500/50 bg-rose-500/5' : 'border-[var(--border-color)]'}`}>
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: column.color ?? '#64748b' }} />
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] truncate">{column.name}</h3>
        <span
          className={`ml-auto text-[11px] font-mono px-1.5 rounded-full ${overWip ? 'bg-rose-500/15 text-rose-500' : 'bg-[var(--bg-surface-hover)] text-[var(--text-muted)]'}`}
          title={column.wip_limit ? `Límite WIP: ${column.wip_limit}` : undefined}
        >
          {cards.length}
          {column.wip_limit ? `/${column.wip_limit}` : ''}
        </span>
        <button type="button" onClick={() => onToggleCollapsed(column.status_id)} aria-label={`Colapsar ${column.name}`} className="icon-btn">
          <ChevronsLeftRight className="h-3.5 w-3.5" />
        </button>
      </header>
      <SortableContext id={column.status_id} items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              spaceId={spaceId}
              dragDisabled={dragDisabled}
              onOpen={onOpen}
              onOpenFull={onOpenFull}
              onQuickEdit={onQuickEdit}
              onHover={onHover}
            />
          ))}
          {cards.length === 0 && <div className="h-16 rounded-lg border border-dashed border-[var(--border-color)]" />}
          {hiddenClosed > 0 && (
            <p className="text-[10px] text-center text-[var(--text-muted)]">+{hiddenClosed} cerrados hace más tiempo (ver en la lista)</p>
          )}
        </div>
      </SortableContext>
      {canCreate && (
        <button
          type="button"
          onClick={() => onAdd(column.status_id)}
          className="m-2 mt-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir
        </button>
      )}
    </section>
  );
}

export const BoardColumn = memo(BoardColumnImpl);
