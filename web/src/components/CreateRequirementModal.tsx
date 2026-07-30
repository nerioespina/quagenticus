import { useState, useRef } from 'react';
import Modal from './Modal';
import MarkdownToolbar from './MarkdownToolbar';
import CreateCategoryInline from './CreateCategoryInline';
import CreateMilestoneInline from './CreateMilestoneInline';
import TrelloLabelPicker from './TrelloLabelPicker';
import { useTrackers, usePriorities, useCategories, useMilestones } from '../hooks/useCatalogs';
import { useCreateRequirement, useTransitionRequirement } from '../hooks/useRequirements';
import { api } from '../lib/api';
import type { Label } from '../lib/api';

interface CreateRequirementModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  defaultStatusId?: string | null;
  onSuccess?: () => void;
}

export default function CreateRequirementModal({
  isOpen,
  onClose,
  spaceId,
  defaultStatusId,
  onSuccess,
}: CreateRequirementModalProps) {
  const { data: trackers = [] } = useTrackers();
  const { data: priorities = [] } = usePriorities();
  const { data: categories = [] } = useCategories(spaceId);
  const { data: milestones = [] } = useMilestones(spaceId);

  const createReq = useCreateRequirement(spaceId);
  const transitionReq = useTransitionRequirement();

  const [form, setForm] = useState({
    tracker_id: '',
    title: '',
    body_md: '',
    priority_id: '',
    category_id: '',
    milestone_id: '',
  });

  const [selectedLabels, setSelectedLabels] = useState<Label[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleToggleLabel = (labelId: string, isAssigned: boolean) => {
    if (isAssigned) {
      setSelectedLabels((prev) => prev.filter((l) => l.id !== labelId));
    } else {
      // Find label details from catalog
      // We will handle assigned labels in array state
      setSelectedLabels((prev) => [...prev, { id: labelId, name: '', color: 'blue' }]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tracker_id || !form.priority_id || !form.title.trim()) return;

    const created = await createReq.mutateAsync({
      tracker_id: form.tracker_id,
      title: form.title.trim(),
      body_md: form.body_md,
      priority_id: form.priority_id,
      category_id: form.category_id || undefined,
      milestone_id: form.milestone_id || undefined,
    });

    if (created && created.id) {
      // Transition if defaultStatusId specified (e.g. from board column)
      if (defaultStatusId && defaultStatusId !== created.status_id) {
        await transitionReq.mutateAsync({
          id: created.id,
          to_status_id: defaultStatusId,
        });
      }

      // Assign labels if selected
      for (const lbl of selectedLabels) {
        try {
          await api.post(`/requirements/${created.id}/labels`, { label_id: lbl.id });
        } catch (err) {
          // ignore error
        }
      }
    }

    setForm({
      tracker_id: '',
      title: '',
      body_md: '',
      priority_id: '',
      category_id: '',
      milestone_id: '',
    });
    setSelectedLabels([]);
    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Requerimiento">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Título
          </label>
          <input
            type="text"
            placeholder="Título del requerimiento"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            autoFocus
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Tracker
            </label>
            <select
              value={form.tracker_id}
              onChange={(e) => setForm((f) => ({ ...f, tracker_id: e.target.value }))}
              required
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] focus:outline-none"
            >
              <option value="">Seleccionar Tracker…</option>
              {trackers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Prioridad
            </label>
            <select
              value={form.priority_id}
              onChange={(e) => setForm((f) => ({ ...f, priority_id: e.target.value }))}
              required
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] focus:outline-none"
            >
              <option value="">Seleccionar Prioridad…</option>
              {priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Categoría
              </label>
              <CreateCategoryInline
                spaceId={spaceId}
                onCreated={(catId) => setForm((f) => ({ ...f, category_id: catId }))}
              />
            </div>
            <select
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] focus:outline-none"
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Hito
              </label>
              <CreateMilestoneInline
                spaceId={spaceId}
                onCreated={(milestoneId) => setForm((f) => ({ ...f, milestone_id: milestoneId }))}
              />
            </div>
            <select
              value={form.milestone_id}
              onChange={(e) => setForm((f) => ({ ...f, milestone_id: e.target.value }))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] focus:outline-none"
            >
              <option value="">(Sin hito)</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Labels Picker */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Etiquetas
          </label>
          <TrelloLabelPicker
            spaceId={spaceId}
            assignedLabels={selectedLabels}
            onToggleLabel={handleToggleLabel}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Descripción (Markdown)
          </label>
          <div className="border border-[var(--border-color)] rounded-lg overflow-hidden bg-[var(--bg-surface-hover)]">
            <MarkdownToolbar
              textareaRef={textareaRef}
              onValueChange={(val) => setForm((f) => ({ ...f, body_md: val }))}
            />
            <textarea
              ref={textareaRef}
              placeholder="Escribe la descripción en formato Markdown..."
              value={form.body_md}
              onChange={(e) => setForm((f) => ({ ...f, body_md: e.target.value }))}
              rows={8}
              className="w-full bg-[var(--bg-input)] border-t border-[var(--border-color)] p-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-mono resize-y min-h-[160px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] text-sm font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createReq.isPending}
            className="px-5 py-2 rounded-lg bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {createReq.isPending ? 'Creando…' : 'Crear requerimiento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
