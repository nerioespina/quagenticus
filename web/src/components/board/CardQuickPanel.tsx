import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Edit2, ExternalLink, Loader2, MessageSquare, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import Drawer from '../ui/Drawer';
import { Spinner } from '../ui/misc';
import StatusSelect from '../requirement/StatusSelect';
import PrioritySelect from '../requirement/PrioritySelect';
import LabelPicker from '../requirement/LabelPicker';
import MemberManager from '../members/MemberManager';
import Markdown from '../markdown/Markdown';
import MarkdownEditor from '../editor/MarkdownEditor';
import CommentThread from '../comments/CommentThread';
import AttachmentUploader from '../attachments/AttachmentUploader';
import AttachmentList from '../attachments/AttachmentList';
import { useDocumentLabelsMutation, useRequirement, useUpdateRequirement, useWatch } from '../../hooks/useRequirements';
import { useAttachments, useDeleteAttachment } from '../../hooks/useAttachments';
import { useSpace } from '../../hooks/useSpaces';
import { ApiError, errorMessage } from '../../lib/api';
import { dueState } from '../../lib/dates';

interface Props {
  reqId: string | null;
  spaceId: string;
  onClose: () => void;
}

/** Trello-like quick panel over the board: edit the essentials without leaving it. */
export default function CardQuickPanel({ reqId, spaceId, onClose }: Props) {
  const { data: req, isLoading } = useRequirement(reqId);
  const update = useUpdateRequirement();
  const labels = useDocumentLabelsMutation(reqId ?? '', spaceId);
  const watch = useWatch(reqId ?? '');
  const { data: attachments = [] } = useAttachments(reqId ?? '', 'document');
  const delAttachment = useDeleteAttachment(reqId ?? '');
  const { data: space } = useSpace(spaceId);
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);

  const readOnly = !req || req.status_is_closed || req.my_role === 'viewer';
  const onErr = (e: unknown) => toast.error(e instanceof ApiError && e.status === 409 ? 'Alguien modificó el requerimiento; recarga para ver los cambios.' : errorMessage(e));

  return (
    <Drawer
      isOpen={!!reqId}
      onClose={onClose}
      label="Edición rápida de requerimiento"
      header={
        req && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-bold text-[var(--accent-text)]">{req.ref_key}</span>
            <StatusSelect reqId={req.id} statusId={req.status_id} statusName={req.status_name} statusColor={req.status_color} size="sm" disabled={req.my_role === 'viewer'} />
            <PrioritySelect reqId={req.id} priorityId={req.priority_id} priorityName={req.priority_name} priorityColor={req.priority_color} size="sm" disabled={readOnly} />
            <button
              type="button"
              className="icon-btn ml-auto"
              title={req.is_watching ? 'Dejar de seguir' : 'Seguir'}
              aria-label={req.is_watching ? 'Dejar de seguir' : 'Seguir'}
              onClick={() => watch.mutate(!req.is_watching)}
            >
              {req.is_watching ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </button>
            <Link to={`/spaces/${spaceId}/requirements/${req.id}`} className="btn-primary text-xs py-1" title="Abrir requerimiento completo (Shift+Enter)">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir completo
            </Link>
          </div>
        )
      }
    >
      {isLoading || !req ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <div className="p-5 space-y-5">
          {title !== null ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!title.trim()) return;
                update.mutate({ id: req.id, title: title.trim() }, { onSuccess: () => setTitle(null), onError: onErr });
              }}
            >
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setTitle(null))} className="input text-lg font-semibold" />
            </form>
          ) : (
            <h2
              className={`text-lg font-semibold text-[var(--text-primary)] ${readOnly ? '' : 'cursor-text hover:bg-[var(--bg-surface-hover)] rounded-md -mx-1 px-1'}`}
              onClick={() => !readOnly && setTitle(req.title)}
              title={readOnly ? undefined : 'Clic para editar'}
            >
              {req.title}
            </h2>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-3">
              <MemberManager spaceId={spaceId} reqId={req.id} leadUserId={req.lead_user_id} disabled={readOnly} />
            </div>
            <div className="card p-3 space-y-3">
              <div className="space-y-1">
                <span className="field-label">Etiquetas</span>
                <LabelPicker spaceId={spaceId} assigned={req.labels} disabled={readOnly} onToggle={(l, on) => (on ? labels.remove : labels.add).mutate(l.id, { onError: onErr })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="field-label">Fecha límite</span>
                  <input
                    type="date"
                    disabled={readOnly}
                    value={req.due_date ?? ''}
                    onChange={(e) => update.mutate({ id: req.id, due_date: e.target.value || null }, { onError: onErr })}
                    className={`input py-1 text-xs ${dueState(req.due_date, req.status_is_closed) === 'overdue' ? 'border-rose-500 text-rose-500' : ''}`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="field-label">Avance</span>
                  <select disabled={readOnly} value={req.done_ratio} onChange={(e) => update.mutate({ id: req.id, done_ratio: Number(e.target.value) }, { onError: onErr })} className="input py-1 text-xs">
                    {Array.from({ length: 11 }, (_, i) => i * 10).map((v) => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="section-title">Descripción</h3>
              {!readOnly && body === null && (
                <button type="button" className="btn-ghost text-xs" onClick={() => setBody(req.body_md)}>
                  <Edit2 className="h-3.5 w-3.5" /> Editar
                </button>
              )}
            </div>
            {body !== null ? (
              <div className="space-y-2">
                <MarkdownEditor value={body} onChange={setBody} spaceId={spaceId} documentId={req.id} uploadMode="direct" rows={10} autoFocus excludeRefId={req.id} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setBody(null)}>Cancelar</button>
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: req.id, body_md: body, version: req.version }, { onSuccess: () => setBody(null), onError: onErr })}
                  >
                    {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
                  </button>
                </div>
              </div>
            ) : (
              <div className="card p-4 max-h-80 overflow-y-auto">
                <Markdown content={req.body_md} spaceId={spaceId} empty={<p className="text-xs italic text-[var(--text-muted)]">Sin descripción.</p>} />
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="section-title"><Paperclip className="h-3.5 w-3.5" /> Adjuntos</h3>
            <AttachmentList items={attachments} onDelete={readOnly ? undefined : (id) => delAttachment.mutate(id, { onError: onErr })} />
            {!readOnly && <AttachmentUploader documentId={req.id} />}
          </section>

          <section className="space-y-2">
            <h3 className="section-title"><MessageSquare className="h-3.5 w-3.5" /> Comentarios</h3>
            <CommentThread docId={req.id} spaceId={spaceId} canComment={req.my_role !== 'viewer' || space?.settings?.viewers_can_comment !== false} canModerate={req.my_role === 'maintainer' || req.my_role === 'admin'} />
          </section>
        </div>
      )}
    </Drawer>
  );
}
