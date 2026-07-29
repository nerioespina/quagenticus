import { useState, useRef } from 'react';
import { MessageSquare, Send, Eye, Edit3, Loader2 } from 'lucide-react';
import { useRequirementJournals, useCreateRequirementJournal } from '../hooks/useJournals';
import MarkdownToolbar from './MarkdownToolbar';

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="prose prose-invert max-w-none text-sm space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold text-slate-100">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold text-slate-200">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold text-slate-300">{line.slice(4)}</h3>;
        if (line.startsWith('- [ ] ')) return <div key={i} className="flex items-center gap-2"><input type="checkbox" disabled className="accent-indigo-500" /><span className="text-slate-300">{line.slice(6)}</span></div>;
        if (line.startsWith('- [x] ')) return <div key={i} className="flex items-center gap-2"><input type="checkbox" checked disabled className="accent-indigo-500" /><span className="line-through text-slate-500">{line.slice(6)}</span></div>;
        if (line.startsWith('- ')) return <li key={i} className="text-slate-300 ml-4 list-disc">{line.slice(2)}</li>;
        if (line === '') return <div key={i} className="h-2" />;
        return <p key={i} className="text-slate-300 leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

interface CommentSectionProps {
  reqId: string;
}

export default function CommentSection({ reqId }: CommentSectionProps) {
  const { data: journals = [], isLoading } = useRequirementJournals(reqId);
  const createJournal = useCreateRequirementJournal(reqId);

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
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-indigo-400" />
          Comentarios y Actividad ({journals.length})
        </h3>
      </div>

      {/* Formulario de nuevo comentario con MarkdownToolbar (#4, #5) */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Agregar un comentario (Markdown)
          </span>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setTab('write')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                tab === 'write' ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Edit3 className="h-3 w-3" />
              Escribir
            </button>
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                tab === 'preview' ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Eye className="h-3 w-3" />
              Vista previa
            </button>
          </div>
        </div>

        <div className="border border-slate-700/80 rounded-xl overflow-hidden bg-slate-900/60">
          {tab === 'write' ? (
            <>
              <MarkdownToolbar
                textareaRef={textareaRef}
                onValueChange={setComment}
                className="border-0 border-b border-slate-700/70"
              />
              <textarea
                ref={textareaRef}
                placeholder="Escribe tu comentario en formato Markdown... (**negrita**, # título, - lista)"
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={4}
                className="w-full bg-slate-900/80 p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono resize-y min-h-[100px]"
              />
            </>
          ) : (
            <div className="p-4 min-h-[120px] bg-slate-900">
              {comment ? (
                <MarkdownPreview content={comment} />
              ) : (
                <p className="text-xs text-slate-500 italic">Nada que previsualizar. Escribe un comentario primero.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!comment.trim() || createJournal.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold transition-colors shadow-sm"
          >
            {createJournal.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Comentar
          </button>
        </div>
      </form>

      {/* Lista de comentarios */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
        </div>
      ) : journals.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
          Aún no hay comentarios en este requerimiento. ¡Sé el primero en comentar!
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          {journals.map(j => (
            <div
              key={j.id}
              className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2.5 transition-colors hover:border-slate-700"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-bold text-[10px] text-white">
                    {j.actor_name ? j.actor_name.slice(0, 2).toUpperCase() : 'US'}
                  </div>
                  <span className="font-semibold text-slate-200">{j.actor_name || 'Usuario'}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {new Date(j.created_at).toLocaleString('es')}
                </span>
              </div>

              {j.notes_md && (
                <div className="pl-8 pt-0.5">
                  <MarkdownPreview content={j.notes_md} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
