import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import { useBoards, useBoard } from '../hooks/useBoard';
import type { BoardCard } from '../lib/api';

interface Context { spaceId: string; search: string }

const PRIORITY_COLORS: Record<string, string> = {
  urgent:    'bg-red-500/20 text-red-400 border-red-500/30',
  high:      'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal:    'bg-slate-700/50 text-slate-300 border-slate-600/50',
  low:       'bg-slate-800/50 text-slate-500 border-slate-700/50',
};

function Card({ card }: { card: BoardCard }) {
  return (
    <div className="bg-slate-900 border border-slate-800/80 hover:border-indigo-500/40 rounded-xl p-3.5 space-y-2.5 cursor-pointer transition-all shadow-sm hover:shadow-indigo-500/5 group">
      <div className="flex items-center justify-between gap-2">
        {card.ref_key && (
          <span className="text-xs font-mono font-semibold text-indigo-400 group-hover:text-indigo-300 shrink-0">
            {card.ref_key}
          </span>
        )}
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border uppercase tracking-wide ml-auto ${PRIORITY_COLORS[card.priority_id] ?? PRIORITY_COLORS.normal}`}>
          {card.priority_id}
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

export default function Board() {
  const { spaceId, search } = useOutletContext<Context>();
  const { data: boards = [], isLoading: loadingBoards } = useBoards(spaceId);
  const [boardId, setBoardId] = useState<string>('');

  const activeBoardId = boardId || boards[0]?.id || '';
  const { data: board, isLoading, refetch, isFetching } = useBoard(spaceId, activeBoardId);

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
            Posicionamiento fraccionario · Transiciones con validación DoR
          </p>
        </div>
        <div className="flex items-center gap-3">
          {boards.length > 1 && (
            <select
              value={activeBoardId}
              onChange={e => setBoardId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              {boards.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm">Cargando tablero…</div>
      ) : board ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {board.columns.map(col => {
            const cards = col.cards.filter(c =>
              !search || c.title.toLowerCase().includes(search.toLowerCase()) || (c.ref_key ?? '').toLowerCase().includes(search.toLowerCase())
            );
            return (
              <div
                key={col.id}
                className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4 flex flex-col gap-3 min-w-[280px] w-72 shrink-0"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    {col.color && (
                      <div className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                    )}
                    <span className="text-sm font-semibold text-slate-200">{col.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {cards.length}{col.wip_limit ? `/${col.wip_limit}` : ''}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 min-h-[200px]">
                  {cards.map(card => <Card key={card.id} card={card} />)}
                </div>

                <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-slate-800/50 text-xs transition-all w-full">
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-slate-500 text-sm">Selecciona un tablero.</div>
      )}
    </div>
  );
}
