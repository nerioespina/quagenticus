import { useEffect, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Archive, ArrowLeft, Bell, BellOff, Bot, Copy, Download, Edit2, FileText, GitCommit, History, Link2, Loader2, Lock,
  MessageSquare, MoreHorizontal, MoveRight, Paperclip, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import StatusSelect from '../components/requirement/StatusSelect';
import PrioritySelect from '../components/requirement/PrioritySelect';
import ReadinessCard from '../components/requirement/ReadinessCard';
import RequirementFields from '../components/requirement/RequirementFields';
import LinksPanel from '../components/requirement/LinksPanel';
import RequirementSubreqs from '../components/requirement/RequirementSubreqs';
import MemberManager from '../components/members/MemberManager';
import CommentThread from '../components/comments/CommentThread';
import ActivityTimeline from '../components/comments/ActivityTimeline';
import AttachmentList from '../components/attachments/AttachmentList';
import AttachmentUploader from '../components/attachments/AttachmentUploader';
import Markdown from '../components/markdown/Markdown';
import MarkdownEditor from '../components/editor/MarkdownEditor';
import { CANONICAL_TEMPLATE } from '../components/requirement/CreateRequirementModal';
import Modal from '../components/ui/Modal';
import Popover from '../components/ui/Popover';
import { confirmDialog } from '../components/ui/Confirm';
import { Badge, EmptyState, Spinner, Tabs } from '../components/ui/misc';
import {
  useArchiveDocument, useCloneRequirement, useMoveRequirementToSpace, useRequirement, useRequirementChildren, useUpdateRequirement, useWatch,
} from '../hooks/useRequirements';
import { useAttachments, useDeleteAttachment } from '../hooks/useAttachments';
import { useJournals } from '../hooks/useJournals';
import { useLinks } from '../hooks/useLinks';
import { useSpace, useSpaces } from '../hooks/useSpaces';
import { useNotificationMutations } from '../hooks/useNotifications';
import { api, ApiError, errorMessage } from '../lib/api';
import type { Requirement } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { diffLines } from '../lib/diff';

type Tab = 'description' | 'comments' | 'history' | 'files' | 'children';

function ConflictModal({ mine, theirs, onKeepMine, onTakeTheirs, onClose }: { mine: string; theirs: Requirement; onKeepMine: () => void; onTakeTheirs: () => void; onClose: () => void }) {
  const diff = diffLines(theirs.body_md, mine);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Otra persona modificó la descripción"
      className="max-w-3xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onTakeTheirs}>Descartar mis cambios</button>
          <button type="button" className="btn-danger" onClick={onKeepMine}>Sobrescribir con mi versión</button>
        </>
      }
    >
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        La versión actual es la v{theirs.version}. Revisa las diferencias (en verde lo tuyo, en rojo lo que se perdería) antes de decidir.
      </p>
      <pre className="text-xs font-mono max-h-[50vh] overflow-auto rounded-lg border border-[var(--border-color)]">
        {diff.map((l, i) => (
          <div key={i} className={l.type === 'add' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : l.type === 'del' ? 'bg-rose-500/10 text-rose-600' : 'text-[var(--text-secondary)]'}>
            {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
            {l.text}
          </div>
        ))}
      </pre>
    </Modal>
  );
}

export default function RequirementDetail() {
  const { spaceId = '', reqId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: req, isLoading, error } = useRequirement(reqId);
  const update = useUpdateRequirement();
  const watch = useWatch(reqId);
  const archive = useArchiveDocument();
  const clone = useCloneRequirement();
  const moveSpace = useMoveRequirementToSpace();
  const { data: spaces = [] } = useSpaces();
  const { data: space } = useSpace(spaceId);
  const { readAll } = useNotificationMutations();
  const { data: comments = [] } = useJournals(reqId, 'comment');
  const { data: attachments = [] } = useAttachments(reqId);
  const { data: links = [] } = useLinks(reqId);
  const { data: children = [] } = useRequirementChildren(reqId);
  const deleteAttachment = useDeleteAttachment(reqId);

  const tab = (params.get('tab') as Tab) || 'description';
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Requirement | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const dirty = body !== null && body !== req?.body_md;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    confirmDialog({ title: 'Cambios sin guardar', message: 'La descripción tiene cambios sin guardar. ¿Salir de todos modos?', confirmLabel: 'Salir', danger: true }).then((v) =>
      v === false ? blocker.reset() : blocker.proceed(),
    );
  }, [blocker]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Opening a requirement clears its notifications.
  useEffect(() => {
    if (req?.id) readAll.mutate(req.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id]);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!req) {
    return (
      <div className="p-8">
        <EmptyState
          title={error instanceof ApiError && error.status === 404 ? 'Requerimiento no encontrado' : 'No se pudo cargar el requerimiento'}
          description="Puede haber sido archivado, movido a otro espacio o no tienes acceso."
          action={<Link to={`/spaces/${spaceId}/requirements`} className="btn-secondary">Volver al listado</Link>}
        />
      </div>
    );
  }

  const readOnly = req.status_is_closed || req.my_role === 'viewer';
  const canModerate = req.my_role === 'maintainer' || req.my_role === 'admin';
  const back = (location.state as { from?: string } | null)?.from ?? `/spaces/${spaceId}/requirements`;
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  const saveBody = (force = false) => {
    if (body === null) return;
    update.mutate(
      { id: req.id, body_md: body, ...(force ? {} : { version: req.version }) },
      {
        onSuccess: () => {
          setBody(null);
          toast.success('Descripción guardada');
        },
        onError: async (e) => {
          if (e instanceof ApiError && e.status === 409) {
            const fresh = await api.get<Requirement>(`/requirements/${req.id}`);
            setConflict(fresh);
          } else onErr(e);
        },
      },
    );
  };

  const saveTitle = () => {
    const t = title.trim();
    if (!t || t === req.title) {
      setEditingTitle(false);
      return;
    }
    update.mutate({ id: req.id, title: t }, { onSuccess: () => setEditingTitle(false), onError: onErr });
  };

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 md:px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-page)]/90 backdrop-blur">
        <button type="button" onClick={() => (location.key !== 'default' ? navigate(-1) : navigate(back))} aria-label="Volver" className="icon-btn">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-[var(--text-muted)] min-w-0">
          <Link to={`/spaces/${spaceId}/requirements`} className="hover:underline">Requerimientos</Link>
          {req.parent && (
            <>
              <span>/</span>
              <Link to={`/spaces/${spaceId}/requirements/${req.parent.id}`} className="hover:underline truncate max-w-[160px]">{req.parent.ref_key}</Link>
            </>
          )}
          <span>/</span>
        </nav>
        <span className="font-mono text-sm font-bold text-[var(--accent-text)]">{req.ref_key}</span>
        <span className="text-xs text-[var(--text-muted)]">{req.tracker_icon} {req.tracker_name}</span>
        <StatusSelect reqId={req.id} statusId={req.status_id} statusName={req.status_name} statusColor={req.status_color} disabled={req.my_role === 'viewer'} />
        <PrioritySelect reqId={req.id} priorityId={req.priority_id} priorityName={req.priority_name} priorityColor={req.priority_color} disabled={readOnly} />
        {req.claimed_by_agent_name && <Badge color="#7c3aed"><Bot className="h-3 w-3" /> {req.claimed_by_agent_name}</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => watch.mutate(!req.is_watching, { onError: onErr })} className="btn-ghost text-xs" aria-pressed={req.is_watching}>
            {req.is_watching ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {req.is_watching ? 'Dejar de seguir' : 'Seguir'}
          </button>
          <Popover
            align="end"
            width={240}
            trigger={({ toggle, ref }) => (
              <button ref={ref} type="button" onClick={toggle} className="icon-btn" aria-label="Más acciones">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          >
            {(close) => (
              <div className="py-1">
                <button type="button" className="menu-item" onClick={() => { navigator.clipboard.writeText(window.location.href.split('?')[0]); toast.success('Enlace copiado'); close(); }}>
                  <Link2 className="h-3.5 w-3.5" /> Copiar enlace
                </button>
                <button type="button" className="menu-item" onClick={() => { navigator.clipboard.writeText(`#${req.ref_key}`); toast.success(`#${req.ref_key} copiado`); close(); }}>
                  <Copy className="h-3.5 w-3.5" /> Copiar referencia
                </button>
                {req.my_role !== 'viewer' && (
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      close();
                      clone.mutate({ id: req.id }, { onSuccess: (c) => { toast.success(`Copia creada: ${c.ref_key}`); navigate(`/spaces/${spaceId}/requirements/${c.id}`); }, onError: onErr });
                    }}
                  >
                    <GitCommit className="h-3.5 w-3.5" /> Clonar
                  </button>
                )}
                {canModerate && (
                  <button type="button" className="menu-item" onClick={() => { close(); setMoveOpen(true); }}>
                    <MoveRight className="h-3.5 w-3.5" /> Mover a otro espacio
                  </button>
                )}
                <button
                  type="button"
                  className="menu-item"
                  onClick={async () => {
                    close();
                    const md = await api.get<string>(`/documents/${req.id}/export.md`);
                    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${req.ref_key}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Exportar markdown
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={async () => {
                    close();
                    const md = await api.get<string>(`/requirements/${req.id}/context.md`);
                    await navigator.clipboard.writeText(md);
                    toast.success('Contexto para agentes copiado al portapapeles');
                  }}
                >
                  <Bot className="h-3.5 w-3.5" /> Copiar contexto para agentes
                </button>
                {req.my_role !== 'viewer' && (
                  <button
                    type="button"
                    className="menu-item text-rose-500"
                    onClick={async () => {
                      close();
                      if ((await confirmDialog({ title: `Archivar ${req.ref_key}`, message: 'Desaparecerá del tablero y del listado. Podrás restaurarlo.', confirmLabel: 'Archivar', danger: true })) === false) return;
                      archive.mutate({ id: req.id, archived: true, spaceId }, {
                        onSuccess: () => {
                          toast.success(`${req.ref_key} archivado`, {
                            action: { label: 'Deshacer', onClick: () => archive.mutate({ id: req.id, archived: false, spaceId }) },
                          });
                          navigate(`/spaces/${spaceId}/requirements`);
                        },
                        onError: onErr,
                      });
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" /> Archivar
                  </button>
                )}
              </div>
            )}
          </Popover>
        </div>
      </div>

      {req.status_is_closed && (
        <div className="px-6 py-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border-b border-amber-500/20">
          <Lock className="h-3.5 w-3.5" />
          Requerimiento cerrado{req.resolution ? ` (resolución: ${req.resolution})` : ''}. Cambia su estado para volver a editarlo; los comentarios siguen abiertos.
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="flex-1 min-w-0 p-4 md:p-6 space-y-5 max-w-5xl">
          <div>
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="input text-2xl font-bold"
              />
            ) : (
              <h1
                className={`group text-2xl font-bold text-[var(--text-primary)] leading-snug ${readOnly ? '' : 'cursor-text'}`}
                onClick={() => {
                  if (readOnly) return;
                  setTitle(req.title);
                  setEditingTitle(true);
                }}
              >
                {req.title}
                {!readOnly && <Edit2 className="inline h-4 w-4 ml-2 opacity-0 group-hover:opacity-60" />}
              </h1>
            )}
          </div>

          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'description', label: 'Descripción', icon: <FileText className="h-3.5 w-3.5" /> },
              { id: 'comments', label: 'Comentarios', icon: <MessageSquare className="h-3.5 w-3.5" />, count: comments.filter((c) => !c.deleted_at).length },
              { id: 'history', label: 'Historial', icon: <History className="h-3.5 w-3.5" /> },
              { id: 'files', label: 'Documentos y archivos', icon: <Paperclip className="h-3.5 w-3.5" />, count: attachments.length + links.length },
              { id: 'children', label: 'Sub-requerimientos', icon: <GitCommit className="h-3.5 w-3.5" />, count: children.length },
            ]}
          />

          {tab === 'description' && (
            <section className="card p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="section-title">Detalle</span>
                {!readOnly && body === null && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => setBody(req.body_md)}>
                    <Edit2 className="h-3.5 w-3.5" /> Editar descripción
                  </button>
                )}
              </div>
              {body !== null ? (
                <div className="space-y-2">
                  <MarkdownEditor
                    value={body}
                    onChange={setBody}
                    spaceId={spaceId}
                    documentId={req.id}
                    uploadMode="direct"
                    rows={18}
                    autoFocus
                    excludeRefId={req.id}
                    onSubmit={() => saveBody()}
                    toolbarExtra={
                      !body.trim() && (
                        <button type="button" className="text-[11px] text-[var(--accent-text)] hover:underline" onClick={() => setBody(CANONICAL_TEMPLATE)}>
                          Plantilla
                        </button>
                      )
                    }
                  />
                  <div className="flex items-center justify-end gap-2">
                    {dirty && <span className="mr-auto text-[11px] text-amber-600">Cambios sin guardar</span>}
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={async () => {
                        if (dirty && (await confirmDialog({ title: 'Descartar cambios', danger: true, confirmLabel: 'Descartar' })) === false) return;
                        setBody(null);
                      }}
                    >
                      Cancelar
                    </button>
                    <button type="button" className="btn-primary text-xs" disabled={update.isPending || !dirty} onClick={() => saveBody()}>
                      {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <Markdown
                  content={req.body_md}
                  spaceId={spaceId}
                  empty={
                    <p className="text-sm text-[var(--text-muted)] italic">
                      Sin descripción. {!readOnly && <button type="button" className="underline" onClick={() => setBody(CANONICAL_TEMPLATE)}>Empieza con la plantilla de secciones</button>}
                    </p>
                  }
                />
              )}
            </section>
          )}

          {tab === 'comments' && (
            <section className="card p-5">
              <CommentThread docId={req.id} spaceId={spaceId} canComment={req.my_role !== 'viewer' || space?.settings?.viewers_can_comment !== false} canModerate={canModerate} />
            </section>
          )}

          {tab === 'history' && (
            <section className="card p-5">
              <ActivityTimeline docId={req.id} spaceId={spaceId} />
            </section>
          )}

          {tab === 'files' && (
            <section className="space-y-6">
              <div className="card p-5 space-y-3">
                <h3 className="section-title"><Paperclip className="h-3.5 w-3.5" /> Archivos adjuntos</h3>
                {!readOnly && <AttachmentUploader documentId={req.id} />}
                <AttachmentList
                  items={attachments}
                  onDelete={
                    readOnly
                      ? undefined
                      : async (id) => {
                          if ((await confirmDialog({ title: 'Eliminar archivo', danger: true, confirmLabel: 'Eliminar' })) !== false) deleteAttachment.mutate(id, { onError: onErr });
                        }
                  }
                  onGoToComment={(journalId) => navigate({ search: '?tab=comments', hash: `comment-${journalId}` }, { replace: true })}
                />
                {attachments.length === 0 && <p className="text-xs text-[var(--text-muted)] italic">Sin archivos. Los adjuntos de los comentarios también aparecen aquí.</p>}
              </div>
              <div className="card p-5">
                <LinksPanel docId={req.id} spaceId={spaceId} canEdit={!readOnly} />
              </div>
            </section>
          )}

          {tab === 'children' && (
            <section className="card p-5">
              <RequirementSubreqs spaceId={spaceId} reqId={req.id} canEdit={req.my_role !== 'viewer'} />
            </section>
          )}
        </div>

        <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--border-color)] p-4 space-y-4 lg:overflow-y-auto">
          <ReadinessCard req={req} />
          <div className="card p-4">
            <MemberManager spaceId={spaceId} reqId={req.id} leadUserId={req.lead_user_id} disabled={readOnly} canInvite={req.my_role === 'admin'} />
          </div>
          <RequirementFields req={req} />
        </aside>
      </div>

      {conflict && body !== null && (
        <ConflictModal
          mine={body}
          theirs={conflict}
          onClose={() => setConflict(null)}
          onTakeTheirs={() => {
            qc.setQueryData(qk.requirement(req.id).detail, conflict);
            setBody(null);
            setConflict(null);
          }}
          onKeepMine={() => {
            qc.setQueryData(qk.requirement(req.id).detail, conflict);
            setConflict(null);
            saveBody(true);
          }}
        />
      )}

      {moveOpen && (
        <Modal isOpen onClose={() => setMoveOpen(false)} title={`Mover ${req.ref_key} a otro espacio`} className="max-w-md">
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Recibirá una nueva clave. Se quitan categoría, hito, etiquetas propias del espacio, el padre y los miembros sin acceso al destino.
          </p>
          <ul className="space-y-1">
            {spaces.filter((s) => s.id !== spaceId && s.my_role !== 'viewer').map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="menu-item"
                  disabled={moveSpace.isPending}
                  onClick={() =>
                    moveSpace.mutate(
                      { id: req.id, space_id: s.id },
                      {
                        onSuccess: (r) => {
                          toast.success(`Movido como ${r.ref_key}`);
                          setMoveOpen(false);
                          navigate(`/spaces/${r.space_id}/requirements/${req.id}`);
                        },
                        onError: onErr,
                      },
                    )
                  }
                >
                  <span className="font-mono text-[var(--accent-text)] w-14">{s.key}</span> {s.name}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
