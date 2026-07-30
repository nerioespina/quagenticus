import { useState } from 'react';
import {
  Clock,
  Tag as TagIcon,
  Folder,
  Flag,
  Edit2,
  Save,
  X,
  Plus,
  Loader2,
} from 'lucide-react';
import {
  useUpdateRequirement,
  useRequirementLabels,
  useAddRequirementLabel,
  useRemoveRequirementLabel,
} from '../hooks/useRequirements';
import { useLabels, useCategories, useMilestones } from '../hooks/useCatalogs';
import type { Requirement } from '../lib/api';

interface RequirementSidebarExtrasProps {
  spaceId: string;
  req: Requirement;
}

export default function RequirementSidebarExtras({
  spaceId,
  req,
}: RequirementSidebarExtrasProps) {
  const updateReq = useUpdateRequirement();

  // Labels hooks
  const { data: assignedLabels = [], isLoading: loadingLabels } = useRequirementLabels(req.id);
  const addLabel = useAddRequirementLabel(req.id);
  const removeLabel = useRemoveRequirementLabel(req.id);
  const { data: allLabels = [] } = useLabels();

  // Classification catalogs
  const { data: categories = [] } = useCategories(spaceId);
  const { data: milestones = [] } = useMilestones(spaceId);

  // Estimation edit state
  const [isEditingEst, setIsEditingEst] = useState(false);
  const [doneRatio, setDoneRatio] = useState<number>(req.done_ratio || 0);
  const [estimatedHours, setEstimatedHours] = useState<number | ''>(
    req.estimated_hours != null ? req.estimated_hours : ''
  );
  const [spentHours, setSpentHours] = useState<number | ''>(
    req.spent_hours != null ? req.spent_hours : ''
  );
  const [startDate, setStartDate] = useState<string>(req.start_date || '');
  const [dueDate, setDueDate] = useState<string>(req.due_date || '');

  const [selectedLabelToAdd, setSelectedLabelToAdd] = useState('');

  const handleSaveEstimations = () => {
    updateReq.mutate(
      {
        id: req.id,
        done_ratio: doneRatio,
        estimated_hours: estimatedHours === '' ? undefined : Number(estimatedHours),
        spent_hours: spentHours === '' ? undefined : Number(spentHours),
        start_date: startDate ? startDate : undefined,
        due_date: dueDate ? dueDate : undefined,
      },
      {
        onSuccess: () => {
          setIsEditingEst(false);
        },
      }
    );
  };

  const handleAddLabel = () => {
    if (!selectedLabelToAdd) return;
    addLabel.mutate(selectedLabelToAdd, {
      onSuccess: () => {
        setSelectedLabelToAdd('');
      },
    });
  };

  const unassignedLabels = allLabels.filter(
    (l) => !assignedLabels.some((al) => al.id === l.id)
  );

  return (
    <div className="space-y-6">
      {/* 1. Classification Card (Milestone & Category) */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3.5">
        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5 text-[var(--accent-text)]" />
          Clasificación
        </h4>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
              Categoría
            </label>
            <select
              value={req.category_id || ''}
              onChange={(e) =>
                updateReq.mutate({
                  id: req.id,
                  category_id: e.target.value || undefined,
                })
              }
              className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
            >
              <option value="">(Sin categoría)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1 flex items-center gap-1">
              <Flag className="h-3 w-3 text-amber-500" />
              Hito (Milestone)
            </label>
            <select
              value={req.milestone_id || ''}
              onChange={(e) =>
                updateReq.mutate({
                  id: req.id,
                  milestone_id: e.target.value || undefined,
                })
              }
              className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
            >
              <option value="">(Sin hito)</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Labels Card */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3">
        <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          <TagIcon className="h-3.5 w-3.5 text-[var(--chip-pink-text)]" />
          Etiquetas
        </h4>

        {loadingLabels ? (
          <p className="text-xs text-[var(--text-muted)] italic">Cargando etiquetas...</p>
        ) : assignedLabels.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic">Sin etiquetas asignadas</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assignedLabels.map((lbl) => (
              <span
                key={lbl.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--chip-pink-bg)] text-[var(--chip-pink-text)] border border-[var(--chip-pink-text)]/20"
              >
                {lbl.name}
                <button
                  onClick={() => removeLabel.mutate(lbl.id)}
                  className="hover:text-red-500 transition-colors"
                  title="Remover etiqueta"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {unassignedLabels.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1">
            <select
              value={selectedLabelToAdd}
              onChange={(e) => setSelectedLabelToAdd(e.target.value)}
              className="flex-1 rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
            >
              <option value="">Añadir etiqueta...</option>
              {unassignedLabels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddLabel}
              disabled={!selectedLabelToAdd || addLabel.isPending}
              className="p-1 rounded-md bg-[var(--accent-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-color)]/20 disabled:opacity-50"
              title="Asignar etiqueta"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Estimations and Progress Card */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-3.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-[var(--accent-text)]" />
            Estimaciones y Progreso
          </h4>
          {!isEditingEst ? (
            <button
              onClick={() => setIsEditingEst(true)}
              className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              title="Editar estimaciones y progreso"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsEditingEst(false)}
                className="p-1 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleSaveEstimations}
                disabled={updateReq.isPending}
                className="p-1 rounded bg-[var(--accent-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-color)]/20 transition-colors"
                title="Guardar estimaciones"
              >
                {updateReq.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
        </div>

        {!isEditingEst ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">% Completado</span>
              <span className="font-mono font-semibold text-[var(--text-secondary)]">
                {req.done_ratio || 0}%
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">Horas Estimadas</span>
              <span className="font-mono font-semibold text-[var(--text-secondary)]">
                {req.estimated_hours != null ? `${req.estimated_hours}h` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">Horas Consumidas</span>
              <span className="font-mono font-semibold text-[var(--text-secondary)]">
                {req.spent_hours || 0}h
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[var(--border-color)]">
              <span className="text-[var(--text-muted)]">Fecha Inicio</span>
              <span className="font-mono text-[var(--text-secondary)]">
                {req.start_date ? new Date(req.start_date).toLocaleDateString('es') : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[var(--text-muted)]">Fecha Entrega</span>
              <span className="font-mono text-[var(--text-secondary)]">
                {req.due_date ? new Date(req.due_date).toLocaleDateString('es') : '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 text-xs pt-1">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                % Completado
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={doneRatio}
                onChange={(e) => setDoneRatio(Number(e.target.value))}
                className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Horas Estimadas
              </label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={estimatedHours}
                onChange={(e) =>
                  setEstimatedHours(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Horas Consumidas
              </label>
              <input
                type="number"
                min={0}
                step="0.5"
                value={spentHours}
                onChange={(e) =>
                  setSpentHours(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Fecha Inicio
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                Fecha Entrega
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-color)]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
