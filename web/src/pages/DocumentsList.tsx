import { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Plus, FileText, Loader2, Clock } from 'lucide-react';
import { useDocuments, useCreateDocument } from '../hooks/useDocuments';

interface Context { spaceId: string; search: string }

export default function DocumentsList() {
  const { spaceId, search } = useOutletContext<Context>();
  const navigate = useNavigate();
  const { data: docs = [], isLoading } = useDocuments(spaceId, 'note');
  const createDoc = useCreateDocument(spaceId);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');

  const filtered = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const doc = await createDoc.mutateAsync({ doc_type: 'note', title });
    setShowForm(false);
    setTitle('');
    navigate(`/spaces/${spaceId}/docs/${doc.id}`);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Documentos Marknote</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Notas y wikis · Wikilinks · Historial inmutable</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-[var(--text-inverted)] text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva nota
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Nueva nota</h3>
          <input
            placeholder="Título del documento"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            autoFocus
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]/60"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createDoc.isPending}
              className="flex-1 py-2 rounded-lg bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] disabled:opacity-60 text-[var(--text-inverted)] text-sm font-semibold transition-colors"
            >
              {createDoc.isPending ? 'Creando…' : 'Crear y editar'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-[var(--text-muted)] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[var(--text-muted)] text-sm border border-dashed border-[var(--border-color)] rounded-xl">
          {search ? 'Sin resultados.' : 'No hay documentos todavía. Crea una nota para comenzar.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filtered.map(d => (
            <button
              key={d.id}
              onClick={() => navigate(`/spaces/${spaceId}/docs/${d.id}`)}
              className="flex items-center gap-4 p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--accent-color)]/30 rounded-xl text-left transition-all group"
            >
              <div className="h-9 w-9 rounded-lg bg-[var(--bg-surface-hover)] flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--accent-text)] transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors truncate">{d.title}</p>
                <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5 truncate">
                  {d.body_md ? d.body_md.slice(0, 80) + (d.body_md.length > 80 ? '…' : '') : 'Sin contenido'}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] shrink-0">
                <Clock className="h-3 w-3" />
                {new Date(d.updated_at).toLocaleDateString('es')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
