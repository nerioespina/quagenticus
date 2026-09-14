import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, Edit2, Link2, Loader2, MessageSquare, Reply, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import CommentComposer from './CommentComposer';
import Markdown from '../markdown/Markdown';
import MarkdownEditor from '../editor/MarkdownEditor';
import AttachmentList from '../attachments/AttachmentList';
import { Avatar } from '../ui/Avatar';
import { EmptyState, Spinner } from '../ui/misc';
import { confirmDialog } from '../ui/Confirm';
import { useCommentMutations, useJournals } from '../../hooks/useJournals';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/api';
import type { Journal } from '../../lib/api';
import { formatDateTime, formatRelative } from '../../lib/dates';

interface ItemProps {
  c: Journal;
  spaceId: string;
  docId: string;
  canModerate: boolean;
  onReply?: () => void;
  highlighted: boolean;
}

function CommentItem({ c, spaceId, docId, canModerate, onReply, highlighted }: ItemProps) {
  const me = useAuth((s) => s.user);
  const { update, remove } = useCommentMutations(docId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.notes_md);
  const mine = me?.id === c.actor_id;

  if (c.deleted_at) {
    return (
      <div id={`comment-${c.id}`} className="px-3 py-2 rounded-xl border border-dashed border-[var(--border-color)] text-xs text-[var(--text-muted)] italic">
        Comentario eliminado
      </div>
    );
  }

  return (
    <article
      id={`comment-${c.id}`}
      className={`group rounded-xl border bg-[var(--bg-surface)] transition-colors ${highlighted ? 'border-[var(--accent-color)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-color)]'}`}
    >
      <header className="flex items-center gap-2 px-3 pt-2.5 text-xs">
        <Avatar name={c.actor_name} url={c.actor_avatar_url} size={24} agent={c.actor_type === 'agent'} />
        <span className="font-semibold text-[var(--text-primary)]">{c.actor_name}</span>
        {c.actor_type === 'agent' && (
          <span className="inline-flex items-center gap-0.5 px-1 rounded bg-violet-500/10 text-violet-500 text-[10px]"><Bot className="h-3 w-3" />agente</span>
        )}
        <time dateTime={c.created_at} title={formatDateTime(c.created_at)} className="text-[var(--text-muted)]">
          {formatRelative(c.created_at)}
        </time>
        {c.edited_at && <span className="text-[10px] text-[var(--text-muted)]" title={formatDateTime(c.edited_at)}>(editado)</span>}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            className="icon-btn"
            title="Copiar enlace"
            aria-label="Copiar enlace al comentario"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?tab=comments#comment-${c.id}`);
              toast.success('Enlace copiado');
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          {onReply && (
            <button type="button" className="icon-btn" title="Responder" aria-label="Responder" onClick={onReply}>
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {mine && (
            <button type="button" className="icon-btn" title="Editar" aria-label="Editar comentario" onClick={() => { setText(c.notes_md); setEditing(true); }}>
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
          {(mine || canModerate) && (
            <button
              type="button"
              className="icon-btn hover:text-red-500"
              title="Eliminar"
              aria-label="Eliminar comentario"
              onClick={async () => {
                if (await confirmDialog({ title: 'Eliminar comentario', message: 'El comentario quedará marcado como eliminado.', danger: true, confirmLabel: 'Eliminar' }) !== false)
                  remove.mutate(c.id, { onError: (e) => toast.error(errorMessage(e)) });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>
      <div className="px-3 pb-3 pt-1.5 pl-11 space-y-2">
        {editing ? (
          <div className="space-y-2">
            <MarkdownEditor value={text} onChange={setText} spaceId={spaceId} documentId={docId} uploadMode="none" rows={4} autoFocus />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => setEditing(false)}>Cancelar</button>
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={!text.trim() || update.isPending}
                onClick={() => update.mutate({ id: c.id, notes_md: text }, { onSuccess: () => setEditing(false), onError: (e) => toast.error(errorMessage(e)) })}
              >
                {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        ) : (
          <Markdown content={c.notes_md} spaceId={spaceId} className="text-sm" />
        )}
        {c.attachments.length > 0 && <AttachmentList items={c.attachments} compact />}
      </div>
    </article>
  );
}

interface Props {
  docId: string;
  spaceId: string;
  canComment: boolean;
  canModerate: boolean;
}

/** Comments only (no history), threaded one level deep, newest thread activity last. */
export default function CommentThread({ docId, spaceId, canComment, canModerate }: Props) {
  const { data: journals = [], isLoading } = useJournals(docId, 'comment');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const { hash } = useLocation();

  const threads = useMemo(() => {
    const roots = journals.filter((j) => !j.reply_to_id);
    const replies = new Map<string, Journal[]>();
    for (const j of journals) {
      if (j.reply_to_id) replies.set(j.reply_to_id, [...(replies.get(j.reply_to_id) ?? []), j]);
    }
    return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
  }, [journals]);

  useEffect(() => {
    const id = hash.startsWith('#comment-') ? hash.slice('#comment-'.length) : null;
    if (!id || isLoading) return;
    const el = document.getElementById(`comment-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight(id);
      const t = setTimeout(() => setHighlight(null), 2500);
      return () => clearTimeout(t);
    }
  }, [isLoading, journals.length, hash]);

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="space-y-4">
      {threads.length === 0 ? (
        <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Aún no hay comentarios" description="Comenta, adjunta evidencias y referencia otros requerimientos con #123." />
      ) : (
        <ol className="space-y-4">
          {threads.map(({ root, replies }) => (
            <li key={root.id} className="space-y-2">
              <CommentItem c={root} spaceId={spaceId} docId={docId} canModerate={canModerate} highlighted={highlight === root.id} onReply={canComment ? () => setReplyTo(root.id) : undefined} />
              {(replies.length > 0 || replyTo === root.id) && (
                <ol className="ml-8 pl-3 border-l-2 border-[var(--border-color)] space-y-2">
                  {replies.map((r) => (
                    <li key={r.id}>
                      <CommentItem c={r} spaceId={spaceId} docId={docId} canModerate={canModerate} highlighted={highlight === r.id} onReply={canComment ? () => setReplyTo(root.id) : undefined} />
                    </li>
                  ))}
                  {replyTo === root.id && (
                    <li>
                      <CommentComposer docId={docId} spaceId={spaceId} replyToId={root.id} onDone={() => setReplyTo(null)} autoFocus compact placeholder={`Responder a ${root.actor_name}…`} />
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
      {canComment ? (
        <div className="pt-2 border-t border-[var(--border-color)]">
          <CommentComposer docId={docId} spaceId={spaceId} />
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)] italic">No tienes permiso para comentar en este espacio.</p>
      )}
    </div>
  );
}
