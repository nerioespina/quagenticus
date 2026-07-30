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
  new:          'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)] border-[var(--badge-neutral-text)]/30',
  triaged:      'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)] border-[var(--badge-neutral-text)]/30',
  ready:        'bg-[var(--status-ready-bg)] text-[var(--status-ready-text)] border-[var(--status-ready-text)]/30',
  in_analysis:  'bg-[var(--status-analysis-bg)] text-[var(--status-analysis-text)] border-[var(--status-analysis-text)]/30',
  in_progress:  'bg-[var(--status-progress-bg)] text-[var(--status-progress-text)] border-[var(--status-progress-text)]/30',
  in_review:    'bg-[var(--status-review-bg)] text-[var(--status-review-text)] border-[var(--status-review-text)]/30',
  resolved:     'bg-[var(--status-resolved-bg)] text-[var(--status-resolved-text)] border-[var(--status-resolved-text)]/30',
  closed:       'bg-[var(--badge-neutral-dim-bg)] text-[var(--badge-neutral-dim-text)] border-[var(--badge-neutral-dim-text)]/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent:    'bg-[var(--priority-urgent-bg)] text-[var(--priority-urgent-text)] border-[var(--priority-urgent-text)]/30',
  high:      'bg-[var(--priority-high-bg)] text-[var(--priority-high-text)] border-[var(--priority-high-text)]/30',
  normal:    'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)] border-[var(--badge-neutral-text)]/30',
  low:       'bg-[var(--badge-neutral-dim-bg)] text-[var(--badge-neutral-dim-text)] border-[var(--badge-neutral-dim-text)]/30',
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
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
        <div className="flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-[var(--accent-text)]" />
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Sub-requerimientos</h3>
          <span className="text-xs text-[var(--text-muted)] font-mono">({children.length})</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--accent-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-color)]/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo Sub-requerimiento
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3"
        >
          <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Crear Sub-requerimiento</h4>
          <div>
            <input
              type="text"
              placeholder="Título del sub-requerimiento..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-semibold text-[var(--text-muted)] mb-1">
                Tipo (Tracker)
              </label>
              <select
                value={trackerId}
                onChange={(e) => setTrackerId(e.target.value)}
                className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
              >
                {trackers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-[10px] uppercase font-semibold text-[var(--text-muted)] mb-1">
                Prioridad
              </label>
              <select
                value={priorityId}
                onChange={(e) => setPriorityId(e.target.value)}
                className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
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
              className="px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createChild.isPending || !title.trim()}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-[var(--accent-color)] text-[var(--text-inverted)] hover:bg-[var(--accent-color-hover)] disabled:opacity-50"
            >
              {createChild.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Crear Sub-requerimiento
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-xs text-[var(--text-muted)] italic">Cargando sub-requerimientos...</p>
      ) : children.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">
          No hay sub-requerimientos definidos para este ítem.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
          {children.map((child) => (
            <div
              key={child.id}
              onClick={() => navigate(`/spaces/${spaceId}/requirements/${child.id}`)}
              className="flex items-center justify-between p-3 hover:bg-[var(--bg-surface-hover)] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono font-bold text-[var(--accent-text)] px-1.5 py-0.5 rounded bg-[var(--accent-soft)] border border-[var(--accent-color)]/30 shrink-0">
                  {child.ref_key}
                </span>
                <span className="text-xs font-medium text-[var(--text-secondary)] truncate">{child.title}</span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-muted)]">
                  <div className="w-12 bg-[var(--bg-surface-hover)] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[var(--accent-color)] h-1.5 rounded-full"
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
