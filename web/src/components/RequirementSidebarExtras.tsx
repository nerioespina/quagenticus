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
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-3.5">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5 text-indigo-400" />
          Clasificación
        </h4>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
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
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
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
            <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
              <Flag className="h-3 w-3 text-amber-400" />
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
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
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
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <TagIcon className="h-3.5 w-3.5 text-pink-400" />
          Etiquetas
        </h4>

        {loadingLabels ? (
          <p className="text-xs text-slate-500 italic">Cargando etiquetas...</p>
        ) : assignedLabels.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Sin etiquetas asignadas</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assignedLabels.map((lbl) => (
              <span
                key={lbl.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-pink-500/10 text-pink-300 border border-pink-500/20"
              >
                {lbl.name}
                <button
                  onClick={() => removeLabel.mutate(lbl.id)}
                  className="hover:text-red-400 transition-colors"
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
              className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
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
              className="p-1 rounded-md bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 disabled:opacity-50"
              title="Asignar etiqueta"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Estimations and Progress Card */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-3.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-indigo-400" />
            Estimaciones y Progreso
          </h4>
          {!isEditingEst ? (
            <button
              onClick={() => setIsEditingEst(true)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title="Editar estimaciones y progreso"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsEditingEst(false)}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleSaveEstimations}
                disabled={updateReq.isPending}
                className="p-1 rounded bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 transition-colors"
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
            <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">% Completado</span>
              <span className="font-mono font-semibold text-slate-200">
                {req.done_ratio || 0}%
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Horas Estimadas</span>
              <span className="font-mono font-semibold text-slate-200">
                {req.estimated_hours != null ? `${req.estimated_hours}h` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Horas Consumidas</span>
              <span className="font-mono font-semibold text-slate-200">
                {req.spent_hours || 0}h
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
              <span className="text-slate-400">Fecha Inicio</span>
              <span className="font-mono text-slate-300">
                {req.start_date ? new Date(req.start_date).toLocaleDateString('es') : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Fecha Entrega</span>
              <span className="font-mono text-slate-300">
                {req.due_date ? new Date(req.due_date).toLocaleDateString('es') : '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 text-xs pt-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                % Completado
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={doneRatio}
                onChange={(e) => setDoneRatio(Number(e.target.value))}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
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
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
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
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Fecha Inicio
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Fecha Entrega
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
