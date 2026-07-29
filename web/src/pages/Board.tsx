import { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { CheckCircle2, Plus, RefreshCw, GripVertical, Loader2 } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoards, useBoard } from '../hooks/useBoard';
import { useMoveRequirement } from '../hooks/useRequirements';
import type { BoardCard, BoardColumn } from '../lib/api';

interface Context {
  spaceId: string;
  search: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high:   'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal: 'bg-slate-700/50 text-slate-300 border-slate-600/50',
  low:    'bg-slate-800/50 text-slate-500 border-slate-700/50',
};

function SortableCard({
  card,
  spaceId,
}: {
  card: BoardCard;
  spaceId: string;
}) {
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => navigate(`/spaces/${spaceId}/requirements/${card.id}`)}
      className={`bg-slate-900 border border-slate-800/80 hover:border-indigo-500/40 rounded-xl p-3.5 space-y-2.5 cursor-pointer transition-all shadow-sm hover:shadow-indigo-500/5 group ${
        isDragging ? 'opacity-40 border-indigo-500 border-dashed bg-slate-800/50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-slate-600 hover:text-slate-400"
            title="Arrastrar tarjeta"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          {card.ref_key && (
            <span className="text-xs font-mono font-semibold text-indigo-400 group-hover:text-indigo-300 shrink-0">
              {card.ref_key}
            </span>
          )}
        </div>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wide ml-auto ${
            PRIORITY_COLORS[card.priority_key] ?? PRIORITY_COLORS.normal
          }`}
        >
          {card.priority_name || card.priority_id}
        </span>
      </div>
      <p className="text-sm text-slate-200 font-medium leading-snug">{card.title}</p>
      <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60 text-xs text-slate-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-slate-600" />
        <span className="font-mono">{new Date(card.updated_at).toLocaleDateString('es')}</span>
      </div>
    </div>
  );
}

function DroppableColumn({
  column,
  cards,
  spaceId,
}: {
  column: BoardColumn;
  cards: BoardCard[];
  spaceId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', column },
  });

  return (
    <div
      ref={setNodeRef}
      className={`bg-slate-900/50 border rounded-xl p-4 flex flex-col gap-3 min-w-[280px] w-72 shrink-0 transition-colors ${
        isOver ? 'border-indigo-500/60 bg-slate-900/80' : 'border-slate-800/60'
      }`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {column.color && (
            <div className="h-2 w-2 rounded-full" style={{ background: column.color }} />
          )}
          <span className="text-sm font-semibold text-slate-200">{column.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
            {cards.length}
            {column.wip_limit ? `/${column.wip_limit}` : ''}
          </span>
        </div>
      </div>

      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2.5 min-h-[160px] flex-1">
          {cards.map(card => (
            <SortableCard key={card.id} card={card} spaceId={spaceId} />
          ))}
        </div>
      </SortableContext>

      <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-800/50 text-xs transition-all w-full">
        <Plus className="h-3.5 w-3.5" />
        Agregar
      </button>
    </div>
  );
}

export default function Board() {
  const { spaceId, search } = useOutletContext<Context>();
  const { data: boards = [], isLoading: loadingBoards } = useBoards(spaceId);
  const [boardId, setBoardId] = useState<string>('');
  const [activeDragCard, setActiveDragCard] = useState<BoardCard | null>(null);

  const activeBoardId = boardId || boards[0]?.id || '';
  const { data: board, isLoading, refetch, isFetching } = useBoard(spaceId, activeBoardId);
  const moveReq = useMoveRequirement();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Evita disparar drag con simple clic
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const card = event.active.data.current?.card as BoardCard | undefined;
    if (card) {
      setActiveDragCard(card);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragCard(null);
    const { active, over } = event;
    if (!over || !board) return;

    const activeCardId = active.id as string;
    const overId = over.id as string;

    // Encontrar en qué columna estaba la tarjeta
    let sourceCol: BoardColumn | undefined;
    let draggedCard: BoardCard | undefined;

    for (const col of board.columns) {
      const c = col.cards.find(item => item.id === activeCardId);
      if (c) {
        sourceCol = col;
        draggedCard = c;
        break;
      }
    }

    if (!draggedCard || !sourceCol) return;

    // Encontrar la columna destino
    let targetCol: BoardColumn | undefined;
    let targetCard: BoardCard | undefined;

    if (over.data.current?.type === 'column') {
      targetCol = over.data.current.column as BoardColumn;
    } else {
      for (const col of board.columns) {
        const c = col.cards.find(item => item.id === overId);
        if (c) {
          targetCol = col;
          targetCard = c;
          break;
        }
      }
    }

    if (!targetCol) return;

    const newStatusId = targetCol.status_id || sourceCol.status_id || '';

    // Calcular before_id o after_id
    let beforeId: string | undefined;
    let afterId: string | undefined;

    if (targetCard && targetCard.id !== activeCardId) {
      const idx = targetCol.cards.findIndex(c => c.id === targetCard?.id);
      if (idx >= 0) {
        afterId = targetCard.id;
      }
    } else if (targetCol.cards.length > 0) {
      const last = targetCol.cards[targetCol.cards.length - 1];
      if (last.id !== activeCardId) {
        afterId = last.id;
      }
    }

    await moveReq.mutateAsync({
      id: draggedCard.id,
      new_status_id: newStatusId,
      before_id: beforeId,
      after_id: afterId,
    });
  };

  if (loadingBoards) {
    return <div className="p-6 text-slate-500 text-sm">Cargando tableros…</div>;
  }

  if (boards.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-100">Tablero Kanban</h2>
        <div className="p-8 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
          <p>No hay tableros en este espacio.</p>
          <p className="mt-1 text-xs text-slate-600">Crea uno desde la configuración del espacio.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Tablero Kanban</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Arrastra tarjetas para priorizar en columna o cambiar de estado (#3)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {moveReq.isPending && (
            <span className="text-xs text-indigo-400 flex items-center gap-1.5 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
              <Loader2 className="h-3 w-3 animate-spin" />
              Actualizando posición...
            </span>
          )}
          {boards.length > 1 && (
            <select
              value={activeBoardId}
              onChange={e => setBoardId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50"
            title="Refrescar tablero"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm">Cargando tablero…</div>
      ) : board ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {board.columns.map(col => {
              const filteredCards = col.cards.filter(
                c =>
                  !search ||
                  c.title.toLowerCase().includes(search.toLowerCase()) ||
                  (c.ref_key ?? '').toLowerCase().includes(search.toLowerCase())
              );

              return (
                <DroppableColumn
                  key={col.id}
                  column={col}
                  cards={filteredCards}
                  spaceId={spaceId}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeDragCard ? (
              <div className="bg-slate-900 border border-indigo-500/60 rounded-xl p-3.5 space-y-2.5 shadow-xl w-72 rotate-2 opacity-95">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold text-indigo-400">
                    {activeDragCard.ref_key}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wide ml-auto ${
                      PRIORITY_COLORS[activeDragCard.priority_key] ?? PRIORITY_COLORS.normal
                    }`}
                  >
                    {activeDragCard.priority_name || activeDragCard.priority_id}
                  </span>
                </div>
                <p className="text-sm text-slate-200 font-medium leading-snug">
                  {activeDragCard.title}
                </p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="text-slate-500 text-sm">Selecciona un tablero.</div>
      )}
    </div>
  );
}
