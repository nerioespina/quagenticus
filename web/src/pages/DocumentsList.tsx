import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, BookOpen, ChevronRight, File, FileText, Folder, FolderOpen, FolderPlus, LayoutTemplate, MoreHorizontal, MoveRight, Plus, Search, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import Popover from '../components/ui/Popover';
import Modal from '../components/ui/Modal';
import { EmptyState, LabelChip, Skeleton } from '../components/ui/misc';
import { confirmDialog } from '../components/ui/Confirm';
import { useCreateDocument, useDocuments, useFavorite, useMoveDocument } from '../hooks/useDocuments';
import { useArchiveDocument } from '../hooks/useRequirements';
import { errorMessage } from '../lib/api';
import type { DocType, DocumentSummary } from '../lib/api';
import { DOC_TYPE_LABELS } from '../lib/i18n';
import { formatRelative } from '../lib/dates';
import type { SpaceContext } from '../components/layout/AppLayout';

const TYPE_ICON: Record<string, React.ReactNode> = {
  folder: <Folder className="h-4 w-4 text-amber-500" />,
  note: <FileText className="h-4 w-4 text-[var(--text-muted)]" />,
  wiki: <BookOpen className="h-4 w-4 text-sky-500" />,
  template: <LayoutTemplate className="h-4 w-4 text-violet-500" />,
};

function FolderTree({ folders, parentId, current, onSelect, depth = 0 }: { folders: DocumentSummary[]; parentId: string | null; current: string; onSelect: (id: string) => void; depth?: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const children = folders.filter((f) => f.parent_id === parentId);
  if (!children.length) return null;
  return (
    <ul>
      {children.map((f) => {
        const hasChildren = folders.some((x) => x.parent_id === f.id);
        const isOpen = open[f.id] ?? current === f.id;
        return (
          <li key={f.id}>
            <div className={`flex items-center rounded-md ${current === f.id ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'hover:bg-[var(--bg-surface-hover)]'}`} style={{ paddingLeft: depth * 12 }}>
              <button type="button" aria-label={isOpen ? 'Contraer' : 'Expandir'} className={`p-1 ${hasChildren ? '' : 'invisible'}`} onClick={() => setOpen((o) => ({ ...o, [f.id]: !isOpen }))}>
                <ChevronRight className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              </button>
              <button type="button" onClick={() => onSelect(f.id)} className="flex-1 flex items-center gap-1.5 py-1 text-xs text-left truncate">
                {isOpen ? <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" /> : <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <span className="truncate">{f.title}</span>
              </button>
            </div>
            {isOpen && <FolderTree folders={folders} parentId={f.id} current={current} onSelect={onSelect} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

export default function DocumentsList() {
  const { spaceId, space } = useOutletContext<SpaceContext>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folder = params.get('folder') ?? '';
  const view = params.get('view') ?? 'folder'; // folder | favorites | archived | all
  const type = params.get('type') ?? '';
  const [q, setQ] = useState('');
  const [moving, setMoving] = useState<DocumentSummary | null>(null);
  const canEdit = space?.my_role !== 'viewer';

  const { data: folders = [] } = useDocuments(spaceId, { type: 'folder' });
  const { data: docs = [], isLoading } = useDocuments(spaceId, {
    parent_id: view === 'folder' && !q ? folder || 'root' : undefined,
    archived: view === 'archived' ? 'true' : undefined,
    favorites: view === 'favorites' ? 'true' : undefined,
    type: type || undefined,
    q: q || undefined,
  });
  const create = useCreateDocument(spaceId);
  const archive = useArchiveDocument();
  const move = useMoveDocument(spaceId);

  const currentFolder = folders.find((f) => f.id === folder);
  const breadcrumbs = useMemo(() => {
    const out: DocumentSummary[] = [];
    let f = currentFolder;
    while (f) {
      out.unshift(f);
      f = folders.find((x) => x.id === f!.parent_id);
    }
    return out;
  }, [currentFolder, folders]);

  const setView = (v: string, extra: Record<string, string> = {}) => setParams(new URLSearchParams({ view: v, ...extra }));

  const newDoc = async (docType: Exclude<DocType, 'requirement'>) => {
    const title = await confirmDialog({ title: `Nueva ${DOC_TYPE_LABELS[docType].toLowerCase()}`, input: { label: 'Título', required: true }, confirmLabel: 'Crear' });
    if (title === false) return;
    create.mutate(
      { doc_type: docType, title, parent_id: view === 'folder' ? folder || null : null },
      {
        onSuccess: (d) => (docType === 'folder' ? setView('folder', { folder: d.id }) : navigate(`/spaces/${spaceId}/docs/${d.id}`)),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const FavButton = ({ d }: { d: DocumentSummary }) => {
    const fav = useFavorite(d.id, spaceId);
    return (
      <button type="button" aria-label={d.is_favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onClick={(e) => { e.preventDefault(); fav.mutate(!d.is_favorite); }} className="icon-btn">
        <Star className={`h-3.5 w-3.5 ${d.is_favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
      </button>
    );
  };

  return (
    <div className="flex flex-col md:flex-row min-h-full">
      <aside className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-[var(--border-color)] p-3 space-y-3">
        <nav className="space-y-0.5 text-xs">
          {[
            ['folder', 'Todos los documentos', <Folder key="f" className="h-3.5 w-3.5" />],
            ['favorites', 'Favoritos', <Star key="s" className="h-3.5 w-3.5" />],
            ['archived', 'Archivados', <Archive key="a" className="h-3.5 w-3.5" />],
          ].map(([id, label, icon]) => (
            <button
              key={id as string}
              type="button"
              onClick={() => setView(id as string)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md ${view === id && !(id === 'folder' && folder) ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'}`}
            >
              {icon}
              {label}
            </button>
          ))}
        </nav>
        <div>
          <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Carpetas</p>
          <FolderTree folders={folders} parentId={null} current={folder} onSelect={(id) => setView('folder', { folder: id })} />
          {folders.length === 0 && <p className="px-2 text-[11px] text-[var(--text-muted)]">Sin carpetas.</p>}
        </div>
      </aside>

      <div className="flex-1 min-w-0 p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Ruta" className="flex items-center gap-1 text-sm min-w-0">
            <button type="button" className="font-bold text-[var(--text-primary)] hover:underline" onClick={() => setView('folder')}>
              {view === 'favorites' ? 'Favoritos' : view === 'archived' ? 'Archivados' : 'Documentos'}
            </button>
            {view === 'folder' && breadcrumbs.map((b) => (
              <span key={b.id} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <button type="button" className="truncate hover:underline text-[var(--text-secondary)]" onClick={() => setView('folder', { folder: b.id })}>{b.title}</button>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en documentos…" className="input py-1 pl-7 text-xs w-48" />
            </div>
            <select aria-label="Tipo" value={type} onChange={(e) => setParams((p) => { if (e.target.value) p.set('type', e.target.value); else p.delete('type'); return p; })} className="input w-auto py-1 text-xs">
              <option value="">Todos los tipos</option>
              {['note', 'wiki', 'template', 'folder'].map((t) => <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>)}
            </select>
            {canEdit && view !== 'archived' && (
              <Popover
                align="end"
                width={200}
                trigger={({ toggle, ref }) => (
                  <button ref={ref} type="button" onClick={toggle} className="btn-primary text-xs"><Plus className="h-3.5 w-3.5" /> Nuevo</button>
                )}
              >
                {(close) => (
                  <div className="py-1">
                    <button type="button" className="menu-item" onClick={() => { close(); newDoc('note'); }}><FileText className="h-3.5 w-3.5" /> Nota</button>
                    <button type="button" className="menu-item" onClick={() => { close(); newDoc('wiki'); }}><BookOpen className="h-3.5 w-3.5" /> Wiki</button>
                    <button type="button" className="menu-item" onClick={() => { close(); newDoc('template'); }}><LayoutTemplate className="h-3.5 w-3.5" /> Plantilla</button>
                    <button type="button" className="menu-item" onClick={() => { close(); newDoc('folder'); }}><FolderPlus className="h-3.5 w-3.5" /> Carpeta</button>
                  </div>
                )}
              </Popover>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : docs.length === 0 ? (
          <EmptyState
            icon={<File className="h-6 w-6" />}
            title={q ? 'Sin resultados' : view === 'archived' ? 'No hay documentos archivados' : view === 'favorites' ? 'Aún no tienes favoritos' : 'Esta carpeta está vacía'}
            description={view === 'folder' && !q ? 'Crea notas y wikis en markdown. Enlázalas con [[Título]] y referencia requerimientos con #123.' : undefined}
          />
        ) : (
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li key={d.id} className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-[var(--accent-color)]/40">
                <span className="h-9 w-9 rounded-lg bg-[var(--bg-surface-hover)] flex items-center justify-center shrink-0">{TYPE_ICON[d.doc_type] ?? <FileText className="h-4 w-4" />}</span>
                {d.doc_type === 'folder' && view !== 'archived' ? (
                  <button type="button" onClick={() => setView('folder', { folder: d.id })} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{d.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{d.children_count} elementos</p>
                  </button>
                ) : (
                  <Link to={`/spaces/${spaceId}/docs/${d.id}`} className="flex-1 min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                      <span className="truncate">{d.title}</span>
                      <span className="text-[10px] font-normal text-[var(--text-muted)] shrink-0">{DOC_TYPE_LABELS[d.doc_type]}</span>
                      {d.labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{d.excerpt || 'Sin contenido'}</p>
                  </Link>
                )}
                <span className="hidden sm:block text-[11px] text-[var(--text-muted)] shrink-0 text-right">
                  {d.updater_name ?? d.creator_name}
                  <br />
                  {formatRelative(d.updated_at)}
                </span>
                {view !== 'archived' && <FavButton d={d} />}
                {canEdit && (
                  <Popover
                    align="end"
                    width={200}
                    trigger={({ toggle, ref }) => (
                      <button ref={ref} type="button" onClick={toggle} aria-label={`Acciones para ${d.title}`} className="icon-btn"><MoreHorizontal className="h-4 w-4" /></button>
                    )}
                  >
                    {(close) => (
                      <div className="py-1">
                        {view === 'archived' ? (
                          <button type="button" className="menu-item" onClick={() => { close(); archive.mutate({ id: d.id, archived: false, spaceId }, { onSuccess: () => toast.success('Restaurado'), onError: (e) => toast.error(errorMessage(e)) }); }}>
                            <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
                          </button>
                        ) : (
                          <>
                            <button type="button" className="menu-item" onClick={() => { close(); setMoving(d); }}><MoveRight className="h-3.5 w-3.5" /> Mover a carpeta</button>
                            <button
                              type="button"
                              className="menu-item text-rose-500"
                              onClick={async () => {
                                close();
                                if ((await confirmDialog({ title: `Archivar «${d.title}»`, message: d.doc_type === 'folder' ? 'También se archivará su contenido.' : undefined, danger: true, confirmLabel: 'Archivar' })) === false) return;
                                archive.mutate({ id: d.id, archived: true, spaceId }, {
                                  onSuccess: () => toast.success('Archivado', { action: { label: 'Deshacer', onClick: () => archive.mutate({ id: d.id, archived: false, spaceId }) } }),
                                  onError: (e) => toast.error(errorMessage(e)),
                                });
                              }}
                            >
                              <Archive className="h-3.5 w-3.5" /> Archivar
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </Popover>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {moving && (
        <Modal isOpen onClose={() => setMoving(null)} title={`Mover «${moving.title}»`} className="max-w-sm">
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            <li><button type="button" className="menu-item" onClick={() => move.mutate({ id: moving.id, parent_id: null }, { onSuccess: () => setMoving(null), onError: (e) => toast.error(errorMessage(e)) })}><Folder className="h-3.5 w-3.5" /> Raíz del espacio</button></li>
            {folders.filter((f) => f.id !== moving.id).map((f) => (
              <li key={f.id}>
                <button type="button" className="menu-item" style={{ paddingLeft: 12 + f.depth * 12 }} onClick={() => move.mutate({ id: moving.id, parent_id: f.id }, { onSuccess: () => setMoving(null), onError: (e) => toast.error(errorMessage(e)) })}>
                  <Folder className="h-3.5 w-3.5 text-amber-500" /> {f.title}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
