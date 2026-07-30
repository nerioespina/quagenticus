import { useState } from 'react';
import { Tag, Plus, Check, X, Loader2 } from 'lucide-react';
import { useSpaceLabels, useCreateSpaceLabel } from '../hooks/useCatalogs';
import type { Label } from '../lib/api';

const COLOR_SWATCHES: Record<string, { bg: string; text: string; border: string }> = {
  gray:   { bg: 'bg-gray-700/80', text: 'text-gray-100', border: 'border-gray-500' },
  red:    { bg: 'bg-red-500/80', text: 'text-white', border: 'border-red-400' },
  orange: { bg: 'bg-orange-500/80', text: 'text-white', border: 'border-orange-400' },
  amber:  { bg: 'bg-amber-500/80', text: 'text-white', border: 'border-amber-400' },
  yellow: { bg: 'bg-yellow-500/80', text: 'text-black', border: 'border-yellow-400' },
  lime:   { bg: 'bg-lime-500/80', text: 'text-black', border: 'border-lime-400' },
  green:  { bg: 'bg-emerald-500/80', text: 'text-white', border: 'border-emerald-400' },
  teal:   { bg: 'bg-teal-500/80', text: 'text-white', border: 'border-teal-400' },
  cyan:   { bg: 'bg-cyan-500/80', text: 'text-black', border: 'border-cyan-400' },
  blue:   { bg: 'bg-blue-500/80', text: 'text-white', border: 'border-blue-400' },
  indigo: { bg: 'bg-indigo-500/80', text: 'text-white', border: 'border-indigo-400' },
  violet: { bg: 'bg-violet-500/80', text: 'text-white', border: 'border-violet-400' },
  purple: { bg: 'bg-purple-500/80', text: 'text-white', border: 'border-purple-400' },
  pink:   { bg: 'bg-pink-500/80', text: 'text-white', border: 'border-pink-400' },
  brown:  { bg: 'bg-amber-900/80', text: 'text-white', border: 'border-amber-700' },
};

interface TrelloLabelPickerProps {
  spaceId: string;
  assignedLabels: Label[];
  onToggleLabel: (labelId: string, isAssigned: boolean) => void;
  disabled?: boolean;
}

export default function TrelloLabelPicker({
  spaceId,
  assignedLabels,
  onToggleLabel,
  disabled = false,
}: TrelloLabelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue');

  const { data: spaceLabels = [], isLoading } = useSpaceLabels(spaceId);
  const createLabel = useCreateSpaceLabel(spaceId);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    createLabel.mutate(
      { name: newLabelName.trim(), color: selectedColor },
      {
        onSuccess: (created) => {
          setNewLabelName('');
          setIsCreating(false);
          onToggleLabel(created.id, false); // Auto-assign new label
        },
      }
    );
  };

  return (
    <div className="relative inline-block text-left w-full">
      {/* Label chips display */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {assignedLabels.map((l) => {
          const style = COLOR_SWATCHES[l.color] ?? COLOR_SWATCHES.blue;
          return (
            <span
              key={l.id}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm border ${style.bg} ${style.text} ${style.border}`}
            >
              {l.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onToggleLabel(l.id, true)}
                  className="hover:opacity-75 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        {!disabled && (
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-dashed border-[var(--border-color)] hover:border-[var(--accent-color)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all bg-[var(--bg-surface)]"
          >
            <Plus className="h-3.5 w-3.5" />
            {assignedLabels.length === 0 ? 'Agregar etiqueta' : ''}
          </button>
        )}
      </div>

      {/* Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 p-3 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl z-30 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-[var(--accent-text)]" />
              Etiquetas
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {!isCreating ? (
            <>
              {isLoading ? (
                <div className="py-4 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando...
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {spaceLabels.map((label) => {
                    const isAssigned = assignedLabels.some((al) => al.id === label.id);
                    const style = COLOR_SWATCHES[label.color] ?? COLOR_SWATCHES.blue;
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => onToggleLabel(label.id, isAssigned)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${style.bg} ${style.text} ${style.border} hover:scale-[1.01]`}
                      >
                        <span>{label.name}</span>
                        {isAssigned && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                  {spaceLabels.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] text-center py-2">
                      No hay etiquetas aún.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-xs font-semibold text-[var(--text-secondary)] transition-colors mt-2"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear nueva etiqueta
              </button>
            </>
          ) : (
            <form onSubmit={handleCreate} className="space-y-3">
              <input
                type="text"
                placeholder="Nombre de la etiqueta"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                required
                autoFocus
                className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
              />

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Color
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {Object.keys(COLOR_SWATCHES).map((colorKey) => {
                    const style = COLOR_SWATCHES[colorKey];
                    return (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => setSelectedColor(colorKey)}
                        className={`h-6 rounded border flex items-center justify-center transition-all ${style.bg} ${style.border} ${
                          selectedColor === colorKey ? 'ring-2 ring-white scale-105' : 'opacity-80'
                        }`}
                      >
                        {selectedColor === colorKey && <Check className="h-3 w-3 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={createLabel.isPending}
                  className="px-3 py-1 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:bg-[var(--accent-color-hover)] disabled:opacity-50 flex items-center gap-1"
                >
                  {createLabel.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Crear
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
