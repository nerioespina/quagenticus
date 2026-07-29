import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCommit, Plus, Loader2 } from 'lucide-react';
import { useRequirementChildren, useCreateRequirement } from '../hooks/useRequirements';
import { useTrackers, usePriorities } from '../hooks/useCatalogs';

interface RequirementSubreqsProps {
  spaceId: string;
  reqId: string;
}

const STATUS_COLORS: Record<string, string> = {
  new:          'bg-slate-700/50 text-slate-400 border-slate-600/50',
  triaged:      'bg-slate-700/50 text-slate-300 border-slate-600/50',
  ready:        'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  in_analysis:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  in_progress:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  in_review:    'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  resolved:     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  closed:       'bg-slate-800 text-slate-500 border-slate-700/50',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent:    'bg-red-500/20 text-red-400 border-red-500/30',
  high:      'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal:    'bg-slate-700/50 text-slate-300 border-slate-600/50',
  low:       'bg-slate-800/50 text-slate-500 border-slate-700/50',
};

export default function RequirementSubreqs({ spaceId, reqId }: RequirementSubreqsProps) {
  const navigate = useNavigate();
  const { data: children = [], isLoading } = useRequirementChildren(reqId);
  const createChild = useCreateRequirement(spaceId);

  const { data: trackers = [] } = useTrackers();
  const { data: priorities = [] } = usePriorities();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [trackerId, setTrackerId] = useState('');
  const [priorityId, setPriorityId] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const selectedTracker = trackerId || (trackers.length > 0 ? trackers[0].id : '');
    const selectedPriority = priorityId || (priorities.length > 0 ? priorities[0].id : '');
    if (!selectedTracker || !selectedPriority) return;

    createChild.mutate(
      {
        tracker_id: selectedTracker,
        title: title.trim(),
        priority_id: selectedPriority,
        parent_id: reqId,
      },
      {
        onSuccess: () => {
          setTitle('');
          setShowForm(false);
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Sub-requerimientos</h3>
          <span className="text-xs text-slate-500 font-mono">({children.length})</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo Sub-requerimiento
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3"
        >
          <h4 className="text-xs font-semibold text-slate-300">Crear Sub-requerimiento</h4>
          <div>
            <input
              type="text"
              placeholder="Título del sub-requerimiento..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                Tipo (Tracker)
              </label>
              <select
                value={trackerId}
                onChange={(e) => setTrackerId(e.target.value)}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {trackers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                Prioridad
              </label>
              <select
                value={priorityId}
                onChange={(e) => setPriorityId(e.target.value)}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createChild.isPending || !title.trim()}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {createChild.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Crear Sub-requerimiento
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-xs text-slate-500 italic">Cargando sub-requerimientos...</p>
      ) : children.length === 0 ? (
        <p className="text-xs text-slate-500 italic">
          No hay sub-requerimientos definidos para este ítem.
        </p>
      ) : (
        <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/40">
          {children.map((child) => (
            <div
              key={child.id}
              onClick={() => navigate(`/spaces/${spaceId}/requirements/${child.id}`)}
              className="flex items-center justify-between p-3 hover:bg-slate-800/40 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono font-bold text-indigo-400 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 shrink-0">
                  {child.ref_key}
                </span>
                <span className="text-xs font-medium text-slate-200 truncate">{child.title}</span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                  <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${child.done_ratio || 0}%` }}
                    />
                  </div>
                  <span>{child.done_ratio || 0}%</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                    STATUS_COLORS[child.status_key] ?? STATUS_COLORS.new
                  }`}
                >
                  {child.status_name || child.status_key}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                    PRIORITY_COLORS[child.priority_key] ?? PRIORITY_COLORS.normal
                  }`}
                >
                  {child.priority_name || child.priority_key}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
