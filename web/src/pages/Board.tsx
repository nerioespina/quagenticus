import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { Filter, Kanban, Loader2, RefreshCw, Search, User } from 'lucide-react';
import { toast } from 'sonner';
import { useBoard, useBoards } from '../hooks/useBoard';
import { useMoveCard, useTransitionRequirement } from '../hooks/useRequirements';
import { useStatuses } from '../hooks/useCatalogs';
import { BoardColumn } from '../components/board/BoardColumn';
import { CardBody } from '../components/board/BoardCard';
import CardQuickPanel from '../components/board/CardQuickPanel';
import CardQuickEditor from '../components/board/CardQuickEditor';
import CreateRequirementModal from '../components/requirement/CreateRequirementModal';
import { askTransitionExtras } from '../components/requirement/StatusSelect';
import { EmptyState, Kbd, Skeleton } from '../components/ui/misc';
import { api, errorMessage } from '../lib/api';
import type { Board as BoardData, BoardCard } from '../lib/api';
import { arrayMove, neighbours } from '../lib/boardOrder';
import { qk } from '../lib/queryKeys';
import { useAuth } from '../lib/auth';
import type { SpaceContext } from '../components/layout/AppLayout';

type Columns = Record<string, BoardCard[]>;

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

function toColumns(board: BoardData | undefined): Columns {
  const out: Columns = {};
  board?.columns.forEach((c) => (out[c.status_id] = c.cards));
  return out;
}

function loadCollapsed(boardId: string): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(`qg_board_collapsed_${boardId}`) ?? '{}');
  } catch {
    return {};
  }
}

export default function Board() {
  const { spaceId, space } = useOutletContext<SpaceContext>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [params, setParams] = useSearchParams();
  const { data: boards = [], isLoading: loadingBoards } = useBoards(spaceId);
  const boardId = params.get('board') || boards[0]?.id || '';
  const [closedDays, setClosedDays] = useState(14);
  const { data: board, isLoading, isFetching, refetch } = useBoard(spaceId, boardId, closedDays);
  const boardKey = useMemo(() => [...qk.space(spaceId).board(boardId), closedDays], [spaceId, boardId, closedDays]);
  const { data: statuses = [] } = useStatuses();
  const move = useMoveCard();
  const transition = useTransitionRequirement();

  const [columns, setColumns] = useState<Columns>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const originStatus = useRef<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [createStatus, setCreateStatus] = useState<string | null | undefined>(undefined);
  const [quick, setQuick] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const hovered = useRef<string | null>(null);
  const panelId = params.get('card');
  const canCreate = space?.my_role !== 'viewer';

  // Server state → local columns, except while dragging (keeps the drag stable).
  useEffect(() => {
    if (!activeId) setColumns(toColumns(board));
  }, [board, activeId]);
  useEffect(() => setCollapsed(loadCollapsed(boardId)), [boardId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtering = !!search.trim() || onlyMine;
  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!filtering) return columns;
    const out: Columns = {};
    for (const [k, cards] of Object.entries(columns)) {
      out[k] = cards.filter(
        (c) =>
          (!needle || c.title.toLowerCase().includes(needle) || (c.ref_key ?? '').toLowerCase().includes(needle) || c.labels.some((l) => l.name.toLowerCase().includes(needle))) &&
          (!onlyMine || c.members.some((m) => m.id === me?.id)),
      );
    }
    return out;
  }, [columns, filtering, needle, onlyMine, me?.id]);

  const cardById = useMemo(() => {
    const m = new Map<string, BoardCard>();
    Object.values(columns).forEach((cards) => cards.forEach((c) => m.set(c.id, c)));
    return m;
  }, [columns]);

  const findStatus = useCallback(
    (id: string): string | null => {
      if (id.startsWith('col:')) return id.slice(4);
      for (const [status, cards] of Object.entries(columns)) if (cards.some((c) => c.id === id)) return status;
      return null;
    },
    [columns],
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    originStatus.current = findStatus(String(e.active.id));
  };

  // Cross-column preview: move the card into the hovered column while dragging.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findStatus(String(active.id));
    const to = findStatus(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const card = prev[from].find((c) => c.id === active.id);
      if (!card) return prev;
      const target = prev[to] ?? [];
      const overIndex = target.findIndex((c) => c.id === over.id);
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...prev,
        [from]: prev[from].filter((c) => c.id !== active.id),
        [to]: [...target.slice(0, index), { ...card, status_id: to }, ...target.slice(index)],
      };
    });
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const origin = originStatus.current;
    setActiveId(null);
    if (!over || !origin) {
      setColumns(toColumns(board));
      return;
    }
    const status = findStatus(id);
    if (!status) return;
    let ordered = columns[status].map((c) => c.id);
    const overIndex = ordered.indexOf(String(over.id));
    const fromIndex = ordered.indexOf(id);
    if (overIndex >= 0 && fromIndex !== overIndex) ordered = arrayMove(ordered, fromIndex, overIndex);
    const changedStatus = status !== origin;
    if (!changedStatus && ordered.indexOf(id) === (board?.columns.find((c) => c.status_id === status)?.cards.findIndex((c) => c.id === id) ?? -1)) {
      setColumns(toColumns(board));
      return;
    }

    let extras: { resolution?: string } | null = {};
    if (changedStatus) {
      const target = statuses.find((s) => s.id === status);
      extras = target ? await askTransitionExtras(target) : {};
      if (!extras) {
        setColumns(toColumns(board));
        return;
      }
    }

    // Optimistic update of the cached board.
    const byId = new Map(Object.values(columns).flat().map((c) => [c.id, c]));
    const optimistic: Columns = { ...columns, [status]: ordered.map((cid) => byId.get(cid)!).filter(Boolean) };
    setColumns(optimistic);
    const previous = qc.getQueryData<BoardData>(boardKey);
    if (previous) {
      qc.setQueryData<BoardData>(boardKey, {
        ...previous,
        columns: previous.columns.map((c) => ({ ...c, cards: optimistic[c.status_id] ?? c.cards })),
      });
    }

    move.mutate(
      { id, to_status_id: changedStatus ? status : undefined, ...neighbours(ordered, id), ...extras },
      {
        onSuccess: (card) => {
          qc.setQueryData<BoardData>(boardKey, (b) =>
            b && { ...b, columns: b.columns.map((c) => ({ ...c, cards: c.cards.map((x) => (x.id === card.id ? card : x)) })) },
          );
          if (changedStatus) {
            qc.invalidateQueries({ queryKey: qk.requirement(id).all });
            qc.invalidateQueries({ queryKey: [...qk.space(spaceId).all, 'requirements'] });
          }
        },
        onError: (err) => {
          if (previous) qc.setQueryData(boardKey, previous);
          setColumns(toColumns(previous));
          toast.error(errorMessage(err));
        },
        onSettled: () => qc.invalidateQueries({ queryKey: boardKey }),
      },
    );
  };

  const toggleCollapsed = useCallback(
    (statusId: string) =>
      setCollapsed((c) => {
        const col = board?.columns.find((x) => x.status_id === statusId);
        const current = c[statusId] ?? col?.is_collapsed ?? false;
        const next = { ...c, [statusId]: !current };
        try {
          localStorage.setItem(`qg_board_collapsed_${boardId}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      }),
    [board, boardId],
  );

  const openPanel = useCallback((id: string) => setParams((p) => { p.set('card', id); return p; }), [setParams]);
  const closePanel = useCallback(() => setParams((p) => { p.delete('card'); return p; }), [setParams]);
  const openFull = useCallback((id: string) => navigate(`/spaces/${spaceId}/requirements/${id}`, { state: { from: `/spaces/${spaceId}/board` } }), [navigate, spaceId]);
  const openQuick = useCallback((id: string, anchor: HTMLElement) => setQuick({ id, anchor }), []);
  const onHover = useCallback((id: string | null) => (hovered.current = id), []);
  const onAdd = useCallback((statusId: string) => setCreateStatus(statusId), []);

  // Keyboard shortcuts on the hovered card.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const id = hovered.current;
      if (!id) return;
      const card = cardById.get(id);
      if (!card) return;
      const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.parentElement;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) openFull(id);
        else openPanel(id);
      } else if (e.key === 'e' && el) {
        e.preventDefault();
        openQuick(id, el);
      } else if (e.key === ' ' && me) {
        e.preventDefault();
        const mine = card.members.some((m) => m.id === me.id);
        (mine ? api.delete(`/requirements/${id}/members/${me.id}`) : api.post(`/requirements/${id}/members`, { subject_id: me.id }))
          .then(() => {
            toast.success(mine ? `Saliste de ${card.ref_key}` : `Te uniste a ${card.ref_key}`);
            qc.invalidateQueries({ queryKey: boardKey });
            qc.invalidateQueries({ queryKey: qk.requirement(id).all });
          })
          .catch((err) => toast.error(errorMessage(err)));
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && board) {
        e.preventDefault();
        const idx = board.columns.findIndex((c) => c.status_id === card.status_id);
        const next = board.columns[idx + (e.key === 'ArrowRight' ? 1 : -1)];
        const target = next && statuses.find((s) => s.id === next.status_id);
        if (!target) return;
        const extras = await askTransitionExtras(target);
        if (extras) transition.mutate({ id, to_status_id: target.id, ...extras }, { onError: (err) => toast.error(errorMessage(err)) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cardById, board, statuses, me, openFull, openPanel, openQuick, transition, qc, boardKey]);

  if (loadingBoards) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (boards.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon={<Kanban className="h-6 w-6" />} title="No hay tableros en este espacio" description="Un mantenedor puede crear uno desde la configuración del espacio." />
      </div>
    );
  }

  const activeCard = activeId ? cardById.get(activeId) : undefined;
  const quickCard = quick ? cardById.get(quick.id) : undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 px-6 pt-5 pb-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mr-2">{board?.name ?? 'Tablero'}</h2>
        {boards.length > 1 && (
          <select
            value={boardId}
            onChange={(e) => setParams((p) => { p.set('board', e.target.value); return p; })}
            aria-label="Tablero"
            className="input w-auto py-1 text-xs"
          >
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar tarjetas…" className="input py-1 pl-7 text-xs w-48" />
        </div>
        <button type="button" onClick={() => setOnlyMine((v) => !v)} aria-pressed={onlyMine} className={`btn-ghost text-xs ${onlyMine ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : ''}`}>
          <User className="h-3.5 w-3.5" /> Mis tarjetas
        </button>
        <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          Cerrados de los últimos
          <select value={closedDays} onChange={(e) => setClosedDays(Number(e.target.value))} className="input w-auto py-0.5 text-xs">
            {[7, 14, 30, 90, 365].map((d) => <option key={d} value={d}>{d} días</option>)}
          </select>
        </label>
        {filtering && <span className="text-[11px] text-amber-600">Arrastre desactivado mientras filtras</span>}
        <div className="ml-auto flex items-center gap-2">
          {move.isPending && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-text)]" aria-label="Guardando posición" />}
          <span className="hidden lg:flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
            Sobre una tarjeta: <Kbd>Enter</Kbd> panel <Kbd>E</Kbd> edición <Kbd>Espacio</Kbd> unirme <Kbd>←</Kbd><Kbd>→</Kbd> mover
          </span>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="icon-btn" aria-label="Refrescar tablero">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading || !board ? (
        <div className="flex gap-3 px-6">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-72 w-72" />)}</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => { setActiveId(null); setColumns(toColumns(board)); }}
          accessibility={{
            screenReaderInstructions: { draggable: 'Pulsa espacio para tomar la tarjeta, usa las flechas para moverla y espacio de nuevo para soltarla.' },
          }}
        >
          <div className="flex-1 flex gap-3 overflow-x-auto px-6 pb-4 items-stretch min-h-0">
            {board.columns.map((col) => {
              const cards = visible[col.status_id] ?? [];
              return (
                <BoardColumn
                  key={col.status_id}
                  column={col}
                  cards={cards}
                  spaceId={spaceId}
                  collapsed={collapsed[col.status_id] ?? col.is_collapsed}
                  dragDisabled={filtering}
                  canCreate={canCreate}
                  onToggleCollapsed={toggleCollapsed}
                  onAdd={onAdd}
                  onOpen={openPanel}
                  onOpenFull={openFull}
                  onQuickEdit={openQuick}
                  onHover={onHover}
                  hiddenByFilter={(columns[col.status_id]?.length ?? 0) - cards.length}
                />
              );
            })}
          </div>
          <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
            {activeCard && (
              <div className="w-72 rotate-2 rounded-xl border border-[var(--accent-color)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-md)]">
                <CardBody card={activeCard} overlay />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <CardQuickPanel reqId={panelId} spaceId={spaceId} onClose={closePanel} />
      {quick && quickCard && <CardQuickEditor card={quickCard} anchor={quick.anchor} spaceId={spaceId} onClose={() => setQuick(null)} />}
      {createStatus !== undefined && (
        <CreateRequirementModal isOpen onClose={() => setCreateStatus(undefined)} spaceId={spaceId} defaultStatusId={createStatus} />
      )}
    </div>
  );
}
