import { useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { useCreateCategory } from '../hooks/useCatalogs';

interface CreateCategoryInlineProps {
  spaceId: string;
  onCreated: (categoryId: string) => void;
}

export default function CreateCategoryInline({ spaceId, onCreated }: CreateCategoryInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createCategory = useCreateCategory(spaceId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createCategory.mutate(
      { name: name.trim(), description: description.trim() || undefined },
      {
        onSuccess: (cat) => {
          setName('');
          setDescription('');
          setIsOpen(false);
          onCreated(cat.id);
        },
      }
    );
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-1 rounded bg-[var(--accent-soft)] text-[var(--accent-text)] hover:bg-[var(--accent-color)] hover:text-white transition-colors"
        title="Crear nueva categoría"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg space-y-2.5 shadow-lg relative z-20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Nueva Categoría</span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="Nombre de categoría"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
        />
        <input
          type="text"
          placeholder="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
        />
        <div className="flex justify-end gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createCategory.isPending}
            className="px-2.5 py-1 rounded bg-[var(--accent-color)] text-white text-xs font-semibold hover:bg-[var(--accent-color-hover)] disabled:opacity-50 flex items-center gap-1"
          >
            {createCategory.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
