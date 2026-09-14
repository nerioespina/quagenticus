import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import {
  Archive, ArrowLeft, Bell, BellOff, BookOpen, ChevronRight, Columns2, Download, Edit3, Eye, FileText, GitCommit, History, Link2, List,
  Loader2, MoreHorizontal, Paperclip, PanelRightClose, PanelRightOpen, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import Markdown from '../components/markdown/Markdown';
import MarkdownToolbar, { applyAction } from '../components/editor/MarkdownToolbar';
import InsertReferenceModal from '../components/editor/InsertReferenceModal';
import { refCompletion, uploadOnPaste } from '../components/editor/codemirrorExtensions';
import LinksPanel from '../components/requirement/LinksPanel';
import LabelPicker from '../components/requirement/LabelPicker';
import AttachmentList from '../components/attachments/AttachmentList';
import AttachmentUploader from '../components/attachments/AttachmentUploader';
import VersionHistory from '../components/documents/VersionHistory';
import Popover from '../components/ui/Popover';
import Modal from '../components/ui/Modal';
import { Spinner, Tabs, EmptyState } from '../components/ui/misc';
import { confirmDialog } from '../components/ui/Confirm';
import { useDocument, useFavorite, usePromoteDocument, useUpdateDocument } from '../hooks/useDocuments';
import { useArchiveDocument, useDocumentLabelsMutation, useWatch } from '../hooks/useRequirements';
import { useAttachments, useDeleteAttachment } from '../hooks/useAttachments';
import { usePriorities, useTrackers } from '../hooks/useCatalogs';
import { useTheme } from '../lib/theme';
import { api, ApiError, errorMessage } from '../lib/api';
import type { Document } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { DOC_TYPE_LABELS } from '../lib/i18n';
import { formatRelative } from '../lib/dates';
import { diffLines } from '../lib/diff';

type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';
type PanelTab = 'outline' | 'links' | 'files' | 'history';

export default function DocumentEditor() {
  const { spaceId = '', docId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme } = useTheme();
  const { data: doc, isLoading, error } = useDocument(docId);
  const update = useUpdateDocument();
  const favorite = useFavorite(docId, spaceId);
  const watch = useWatch(docId);
  const archive = useArchiveDocument();
  const promote = usePromoteDocument(spaceId);
  const labels = useDocumentLabelsMutation(docId, spaceId);
  const { data: attachments = [] } = useAttachments(docId);
  const deleteAttachment = useDeleteAttachment(docId);
  const { data: trackers = [] } = useTrackers();
  const { data: priorities = [] } = usePriorities();

  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>(() => (localStorage.getItem('qg_doc_mode') as 'edit' | 'split' | 'preview') ?? 'split');
  const [panel, setPanel] = useState<PanelTab | null>(() => (localStorage.getItem('qg_doc_panel') as PanelTab | null) ?? 'outline');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [baseVersion, setBaseVersion] = useState(0);
  const [state, setState] = useState<SaveState>('saved');
  const [conflict, setConflict] = useState<Document | null>(null);
  const [refModal, setRefModal] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteTracker, setPromoteTracker] = useState('');
  const editor = useRef<ReactCodeMirrorRef>(null);
  const saving = useRef(false);
  const readOnly = !doc || doc.my_role === 'viewer' || doc.is_archived;

  useEffect(() => {
    if (!doc) return;
    // adopt server content only when there are no local edits
    if (state === 'saved' || doc.id !== docId) {
      setContent(doc.body_md);
      setTitle(doc.title);
      setBaseVersion(doc.version);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.version]);

  useEffect(() => localStorage.setItem('qg_doc_mode', mode), [mode]);
  useEffect(() => {
    if (panel) localStorage.setItem('qg_doc_panel', panel);
    else localStorage.removeItem('qg_doc_panel');
  }, [panel]);

  const save = useCallback(
    (force = false) => {
      if (!doc || readOnly || saving.current) return;
      saving.current = true;
      setState('saving');
      update.mutate(
        { id: doc.id, title: title.trim() || doc.title, body_md: content, ...(force ? {} : { version: baseVersion }) },
        {
          onSuccess: (saved) => {
            setBaseVersion(saved.version);
            setState((s) => (s === 'saving' ? 'saved' : s));
          },
          onError: async (e) => {
            if (e instanceof ApiError && e.status === 409) {
              setConflict(await api.get<Document>(`/documents/${doc.id}`));
              setState('conflict');
            } else {
              setState('error');
              toast.error(errorMessage(e));
            }
          },
          onSettled: () => (saving.current = false),
        },
      );
    },
    [doc, readOnly, title, content, baseVersion, update],
  );

  // Autosave 2 s after the last keystroke.
  useEffect(() => {
    if (state !== 'dirty') return;
    const t = setTimeout(() => save(), 2000);
    return () => clearTimeout(t);
  }, [state, content, title, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const unsaved = state === 'dirty' || state === 'saving' || state === 'conflict' || state === 'error';
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    confirmDialog({ title: 'Cambios sin guardar', message: 'Hay cambios que aún no se han guardado.', confirmLabel: 'Salir sin guardar', danger: true }).then((v) =>
      v === false ? blocker.reset() : blocker.proceed(),
    );
  }, [blocker]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => unsaved && e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsaved]);

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      refCompletion(spaceId, docId),
      uploadOnPaste(docId, (m) => toast.error(m)),
      EditorView.editable.of(!readOnly),
    ],
    [spaceId, docId, readOnly],
  );

  const insert = (text: string) => {
    const view = editor.current?.view;
    if (!view) {
      setContent((c) => c + text);
      return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
    view.focus();
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!doc) {
    return (
      <div className="p-8">
        <EmptyState title={error instanceof ApiError && error.status === 404 ? 'Documento no encontrado' : 'No se pudo cargar'} action={<Link className="btn-secondary" to={`/spaces/${spaceId}/docs`}>Volver</Link>} />
      </div>
    );
  }
  if (doc.doc_type === 'requirement') {
    navigate(`/spaces/${spaceId}/requirements/${doc.id}`, { replace: true });
    return null;
  }

  const stateLabel: Record<SaveState, React.ReactNode> = {
    saved: <span className="text-[var(--text-muted)]">Guardado · v{baseVersion}</span>,
    dirty: <span className="text-amber-600">Sin guardar</span>,
    saving: <span className="text-[var(--text-muted)] flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</span>,
    conflict: <span className="text-rose-500">Conflicto de versión</span>,
    error: <button type="button" className="text-rose-500 underline" onClick={() => save()}>Error al guardar · reintentar</button>,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[var(--border-color)] shrink-0">
        <button type="button" onClick={() => navigate(doc.parent_id ? `/spaces/${spaceId}/docs?view=folder&folder=${doc.parent_id}` : `/spaces/${spaceId}/docs`)} aria-label="Volver" className="icon-btn">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <nav className="hidden md:flex items-center gap-1 text-xs text-[var(--text-muted)]" aria-label="Ruta">
          <Link to={`/spaces/${spaceId}/docs`} className="hover:underline">Documentos</Link>
          {doc.breadcrumbs.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <Link to={`/spaces/${spaceId}/docs?view=folder&folder=${b.id}`} className="hover:underline">{b.title}</Link>
            </span>
          ))}
          <ChevronRight className="h-3 w-3" />
        </nav>
        <input
          value={title}
          readOnly={readOnly}
          onChange={(e) => { setTitle(e.target.value); setState('dirty'); }}
          aria-label="Título"
          className="flex-1 min-w-[160px] bg-transparent text-lg font-semibold text-[var(--text-primary)] outline-none"
        />
        <span className="text-[11px]">{stateLabel[state]}</span>
        <div className="flex items-center rounded-lg border border-[var(--border-color)] p-0.5">
          {([['edit', <Edit3 key="e" className="h-3.5 w-3.5" />, 'Editar'], ['split', <Columns2 key="s" className="h-3.5 w-3.5" />, 'Dividido'], ['preview', <Eye key="p" className="h-3.5 w-3.5" />, 'Vista previa']] as const).map(([m, icon, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} title={label} className={`tab-pill ${mode === m ? 'tab-pill--active' : ''}`}>{icon}</button>
          ))}
        </div>
        <button type="button" onClick={() => favorite.mutate(!doc.is_favorite)} aria-label={doc.is_favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} className="icon-btn">
          <Star className={`h-4 w-4 ${doc.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>
        <button type="button" onClick={() => watch.mutate(!doc.is_watching)} aria-label={doc.is_watching ? 'Dejar de seguir' : 'Seguir'} className="icon-btn">
          {doc.is_watching ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => setPanel((p) => (p ? null : 'outline'))} aria-label="Panel lateral" className="icon-btn">
          {panel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </button>
        <Popover
          align="end"
          width={230}
          trigger={({ toggle, ref }) => <button ref={ref} type="button" onClick={toggle} aria-label="Más acciones" className="icon-btn"><MoreHorizontal className="h-4 w-4" /></button>}
        >
          {(close) => (
            <div className="py-1">
              {!readOnly && (
                <label className="menu-item">
                  <BookOpen className="h-3.5 w-3.5" /> Tipo
                  <select
                    value={doc.doc_type}
                    onChange={(e) => update.mutate({ id: doc.id, doc_type: e.target.value as Document['doc_type'] }, { onError: (err) => toast.error(errorMessage(err)) })}
                    className="ml-auto bg-transparent text-xs outline-none"
                  >
                    {['note', 'wiki', 'template'].map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
              )}
              {!readOnly && ['note', 'wiki'].includes(doc.doc_type) && (
                <button type="button" className="menu-item" onClick={() => { close(); setPromoteTracker(trackers[0]?.id ?? ''); setPromoteOpen(true); }}>
                  <GitCommit className="h-3.5 w-3.5" /> Convertir en requerimiento
                </button>
              )}
              <button
                type="button"
                className="menu-item"
                onClick={async () => {
                  close();
                  const md = await api.get<string>(`/documents/${doc.id}/export.md`);
                  const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
                  const a = Object.assign(document.createElement('a'), { href: url, download: `${doc.slug}.md` });
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-3.5 w-3.5" /> Exportar markdown
              </button>
              <button type="button" className="menu-item" onClick={() => { navigator.clipboard.writeText(`[[${doc.title}]]`); toast.success('Referencia copiada'); close(); }}>
                <Link2 className="h-3.5 w-3.5" /> Copiar [[referencia]]
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="menu-item text-rose-500"
                  onClick={async () => {
                    close();
                    if ((await confirmDialog({ title: `Archivar «${doc.title}»`, confirmLabel: 'Archivar', danger: true })) === false) return;
                    archive.mutate({ id: doc.id, archived: true, spaceId }, { onSuccess: () => { toast.success('Documento archivado'); navigate(`/spaces/${spaceId}/docs`); }, onError: (e) => toast.error(errorMessage(e)) });
                  }}
                >
                  <Archive className="h-3.5 w-3.5" /> Archivar
                </button>
              )}
            </div>
          )}
        </Popover>
      </div>

      {doc.is_archived && <div className="px-4 py-1.5 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400">Documento archivado (solo lectura). Restáuralo desde «Archivados».</div>}

      <div className="flex-1 flex min-h-0">
        {(mode === 'edit' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2 border-r border-[var(--border-color)]' : 'flex-1'} flex flex-col min-w-0`}>
            {!readOnly && (
              <MarkdownToolbar
                onAction={(a) => {
                  const view = editor.current?.view;
                  if (!view) return;
                  const { from, to } = view.state.selection.main;
                  const r = applyAction(view.state.doc.toString(), from, to, a);
                  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: r.value }, selection: { anchor: r.selStart, head: r.selEnd } });
                  view.focus();
                }}
                onInsertReference={() => setRefModal(true)}
              />
            )}
            <div className="flex-1 overflow-auto">
              <CodeMirror
                ref={editor}
                value={content}
                onChange={(v) => { setContent(v); setState('dirty'); }}
                extensions={extensions}
                theme={theme === 'dark' ? 'dark' : 'light'}
                height="100%"
                style={{ height: '100%', fontSize: 13 }}
                basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
                placeholder="Escribe en markdown… [[ enlaza documentos, # referencia requerimientos, @ menciona personas; pega imágenes directamente."
              />
            </div>
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2' : 'flex-1'} overflow-auto`}>
            <div className="max-w-3xl mx-auto px-6 py-5">
              <Markdown content={content} spaceId={spaceId} empty={<p className="text-sm italic text-[var(--text-muted)]">Documento vacío.</p>} />
            </div>
          </div>
        )}
        {panel && (
          <aside className="hidden lg:flex w-80 shrink-0 border-l border-[var(--border-color)] flex-col min-h-0">
            <div className="px-2 shrink-0">
              <Tabs<PanelTab>
                value={panel}
                onChange={setPanel}
                tabs={[
                  { id: 'outline', label: <List className="h-3.5 w-3.5" aria-label="Índice" /> },
                  { id: 'links', label: <Link2 className="h-3.5 w-3.5" aria-label="Enlaces" /> },
                  { id: 'files', label: <Paperclip className="h-3.5 w-3.5" aria-label="Archivos" />, count: attachments.length },
                  { id: 'history', label: <History className="h-3.5 w-3.5" aria-label="Historial" /> },
                ]}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {panel === 'outline' && (
                <>
                  <div className="space-y-1">
                    <span className="field-label">Etiquetas</span>
                    <LabelPicker spaceId={spaceId} assigned={doc.labels} disabled={readOnly} onToggle={(l, on) => (on ? labels.remove : labels.add).mutate(l.id)} />
                  </div>
                  <div>
                    <span className="field-label">Índice</span>
                    {doc.sections.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">Usa encabezados «## » para generar el índice.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5">
                        {doc.sections.map((s) => (
                          <li key={s.ord} style={{ paddingLeft: (s.level - 2) * 10 }}>
                            <button
                              type="button"
                              className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-text)] text-left"
                              onClick={() => {
                                const view = editor.current?.view;
                                const idx = content.indexOf(`${'#'.repeat(s.level)} ${s.heading}`);
                                if (view && idx >= 0) {
                                  view.dispatch({ selection: { anchor: idx }, scrollIntoView: true });
                                  view.focus();
                                }
                              }}
                            >
                              {s.heading}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    <FileText className="inline h-3 w-3" /> {content.split(/\s+/).filter(Boolean).length} palabras · editado {formatRelative(doc.updated_at)} por {doc.updater_name ?? doc.creator_name}
                  </p>
                </>
              )}
              {panel === 'links' && <LinksPanel docId={doc.id} spaceId={spaceId} canEdit={!readOnly} />}
              {panel === 'files' && (
                <>
                  {!readOnly && <AttachmentUploader documentId={doc.id} />}
                  <AttachmentList items={attachments} onDelete={readOnly ? undefined : (id) => deleteAttachment.mutate(id)} />
                  {attachments.length > 0 && !readOnly && (
                    <p className="text-[11px] text-[var(--text-muted)]">Tip: arrastra un archivo al editor para insertarlo en el texto.</p>
                  )}
                </>
              )}
              {panel === 'history' && <VersionHistory docId={doc.id} current={content} canRestore={!readOnly} />}
            </div>
          </aside>
        )}
      </div>

      <InsertReferenceModal isOpen={refModal} onClose={() => setRefModal(false)} spaceId={spaceId} excludeId={doc.id} onInsert={insert} />

      {conflict && (
        <Modal
          isOpen
          onClose={() => setConflict(null)}
          title="El documento cambió mientras editabas"
          className="max-w-3xl"
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => { qc.setQueryData(qk.document(doc.id).detail, conflict); setContent(conflict.body_md); setTitle(conflict.title); setBaseVersion(conflict.version); setState('saved'); setConflict(null); }}>
                Usar la versión del servidor
              </button>
              <button type="button" className="btn-danger" onClick={() => { setBaseVersion(conflict.version); setConflict(null); save(true); }}>
                Sobrescribir con mis cambios
              </button>
            </>
          }
        >
          <p className="text-xs text-[var(--text-secondary)] mb-2">{conflict.updater_name ?? 'Alguien'} guardó la versión {conflict.version}. En verde tus cambios, en rojo lo que se perdería.</p>
          <pre className="text-xs font-mono max-h-[50vh] overflow-auto rounded-lg border border-[var(--border-color)]">
            {diffLines(conflict.body_md, content).map((l, i) => (
              <div key={i} className={l.type === 'add' ? 'bg-emerald-500/10' : l.type === 'del' ? 'bg-rose-500/10 text-rose-600' : ''}>
                {l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}
                {l.text}
              </div>
            ))}
          </pre>
        </Modal>
      )}

      {promoteOpen && (
        <Modal
          isOpen
          onClose={() => setPromoteOpen(false)}
          title="Convertir en requerimiento"
          className="max-w-md"
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => setPromoteOpen(false)}>Cancelar</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!promoteTracker || promote.isPending}
                onClick={() => {
                  if (unsaved) save();
                  promote.mutate(
                    { id: doc.id, tracker_id: promoteTracker, priority_id: priorities.find((p) => p.is_default)?.id },
                    { onSuccess: (r) => { toast.success(`Ahora es ${r.ref_key}`); navigate(`/spaces/${spaceId}/requirements/${r.id}`); }, onError: (e) => toast.error(errorMessage(e)) },
                  );
                }}
              >
                Convertir
              </button>
            </>
          }
        >
          <p className="text-xs text-[var(--text-secondary)] mb-3">Conserva el historial, los adjuntos y los enlaces. Aparecerá en el tablero con su nueva clave.</p>
          <label className="block space-y-1">
            <span className="field-label">Tipo</span>
            <select value={promoteTracker} onChange={(e) => setPromoteTracker(e.target.value)} className="input">
              {trackers.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
            </select>
          </label>
        </Modal>
      )}
    </div>
  );
}
