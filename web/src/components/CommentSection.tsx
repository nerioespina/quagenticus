import { useState, useRef } from 'react';
import { MessageSquare, Send, Eye, Edit3, Loader2, ArrowRight } from 'lucide-react';
import { useRequirementJournals, useCreateRequirementJournal } from '../hooks/useJournals';
import type { ExtendedJournal } from '../hooks/useJournals';
import { useStatuses } from '../hooks/useCatalogs';
import type { WorkflowStatus } from '../lib/api';
import MarkdownToolbar from './MarkdownToolbar';

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="max-w-none text-sm space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold text-[var(--text-primary)]">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold text-[var(--text-primary)]">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold text-[var(--text-secondary)]">{line.slice(4)}</h3>;
        if (line.startsWith('- [ ] ')) return <div key={i} className="flex items-center gap-2"><input type="checkbox" disabled className="accent-[var(--accent-color)]" /><span className="text-[var(--text-secondary)]">{line.slice(6)}</span></div>;
        if (line.startsWith('- [x] ')) return <div key={i} className="flex items-center gap-2"><input type="checkbox" checked disabled className="accent-[var(--accent-color)]" /><span className="line-through text-[var(--text-muted)]">{line.slice(6)}</span></div>;
        if (line.startsWith('- ')) return <li key={i} className="text-[var(--text-secondary)] ml-4 list-disc">{line.slice(2)}</li>;
        if (line === '') return <div key={i} className="h-2" />;
        return <p key={i} className="text-[var(--text-secondary)] leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

function StatusChangeBadge({
  detail,
  statusById,
}: {
  detail: ExtendedJournal['details'][number];
  statusById: Record<string, WorkflowStatus>;
}) {
  const from = statusById[String(detail.from)];
  const to = statusById[String(detail.to)];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
      <ArrowRight className="h-3 w-3" />
      cambió el estado de <strong className="text-[var(--text-secondary)]">{from?.name ?? '—'}</strong>
      a <strong className="text-[var(--status-ready-text)]">{to?.name ?? '—'}</strong>
    </span>
  );
}

interface CommentSectionProps {
  reqId: string;
}

export default function CommentSection({ reqId }: CommentSectionProps) {
  const { data: journals = [], isLoading } = useRequirementJournals(reqId);
  const createJournal = useCreateRequirementJournal(reqId);
  const { data: statuses = [] } = useStatuses();
  const statusById = Object.fromEntries(statuses.map(s => [s.id, s]));

  const [comment, setComment] = useState('');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await createJournal.mutateAsync({ notes_md: comment });
    setComment('');
    setTab('write');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--accent-text)]" />
          Comentarios y Actividad ({journals.length})
        </h3>
      </div>

      {/* Formulario de nuevo comentario con MarkdownToolbar (#4, #5) */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Agregar un comentario (Markdown)
          </span>
          <div className="flex items-center gap-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setTab('write')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                tab === 'write' ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Edit3 className="h-3 w-3" />
              Escribir
            </button>
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                tab === 'preview' ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Eye className="h-3 w-3" />
              Vista previa
            </button>
          </div>
        </div>

        <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
          {tab === 'write' ? (
            <>
              <MarkdownToolbar
                textareaRef={textareaRef}
                onValueChange={setComment}
                className="border-0 border-b border-[var(--border-color)]"
              />
              <textarea
                ref={textareaRef}
                placeholder="Escribe tu comentario en formato Markdown... (**negrita**, # título, - lista)"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={4}
                className="w-full bg-[var(--bg-input)] p-3.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none font-mono resize-y min-h-[100px]"
              />
            </>
          ) : (
            <div className="p-4 min-h-[120px] bg-[var(--bg-surface)]">
              {comment ? (
                <MarkdownPreview content={comment} />
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">Nada que previsualizar. Escribe un comentario primero.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!comment.trim() || createJournal.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] disabled:bg-[var(--bg-surface-hover)] disabled:text-[var(--text-muted)] text-[var(--text-inverted)] text-xs font-semibold transition-colors shadow-[var(--shadow-sm)]"
          >
            {createJournal.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Comentar
          </button>
        </div>
      </form>

      {/* Lista de comentarios */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 text-[var(--text-muted)] animate-spin" />
        </div>
      ) : journals.length === 0 ? (
        <div className="p-6 text-center text-[var(--text-muted)] text-xs border border-dashed border-[var(--border-color)] rounded-xl">
          Aún no hay comentarios en este requerimiento. ¡Sé el primero en comentar!
        </div>
      ) : (
        <div className="space-y-3 pt-2">
          {journals.map(j => {
            const statusChanges = (j.details ?? []).filter(d => d.type === 'status_changed');
            return (
              <div key={j.id} className="space-y-1.5">
                {statusChanges.length > 0 && (
                  <div className="flex items-center gap-2 pl-1 text-xs">
                    <span className="font-medium text-[var(--text-secondary)]">{j.actor_name || 'Usuario'}</span>
                    {statusChanges.map((d, i) => (
                      <StatusChangeBadge key={i} detail={d} statusById={statusById} />
                    ))}
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {new Date(j.created_at).toLocaleString('es')}
                    </span>
                  </div>
                )}

                {j.notes_md && (
                  <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2.5 transition-colors hover:border-[var(--text-muted)]">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-[var(--accent-color)] flex items-center justify-center font-bold text-[10px] text-[var(--text-inverted)]">
                          {j.actor_name ? j.actor_name.slice(0, 2).toUpperCase() : 'US'}
                        </div>
                        <span className="font-semibold text-[var(--text-secondary)]">{j.actor_name || 'Usuario'}</span>
                      </div>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {new Date(j.created_at).toLocaleString('es')}
                      </span>
                    </div>

                    <div className="pl-8 pt-0.5">
                      <MarkdownPreview content={j.notes_md} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
