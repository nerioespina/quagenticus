import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, GitBranch, Link2, Plus, Trash2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../ui/Modal';
import { Badge } from '../ui/misc';
import SuggestionList from '../editor/SuggestionList';
import { useBacklinks, useLinkMutations, useLinks } from '../../hooks/useLinks';
import { useSuggest } from '../../hooks/useSearch';
import { errorMessage } from '../../lib/api';
import type { DocumentLink, SuggestItem } from '../../lib/api';
import { DOC_TYPE_LABELS, LINK_TYPE_LABELS } from '../../lib/i18n';

const REQ_LINK_TYPES = ['relates', 'blocks', 'blocked_by', 'precedes', 'follows', 'duplicates', 'duplicated_by'];
const DOC_LINK_TYPES = ['relates', 'specifies', 'implements'];

function targetHref(l: DocumentLink) {
  if (!l.other_id || !l.target_space_id) return null;
  return l.target_type === 'requirement' ? `/spaces/${l.target_space_id}/requirements/${l.other_id}` : `/spaces/${l.target_space_id}/docs/${l.other_id}`;
}

function LinkRow({ l, onDelete }: { l: DocumentLink; onDelete?: () => void }) {
  const href = targetHref(l);
  const broken = l.target_type === 'broken';
  return (
    <li className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-surface-hover)] min-w-0">
      {broken ? <Unlink className="h-3.5 w-3.5 text-rose-500 shrink-0" /> : l.target_type === 'requirement' ? <GitBranch className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0" /> : <FileText className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-muted)] shrink-0">{LINK_TYPE_LABELS[l.link_type] ?? l.link_type}</span>
      {href ? (
        <Link to={href} className={`text-xs font-medium truncate hover:underline ${l.target_is_closed ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
          {l.target_ref_key && <span className="font-mono text-[var(--accent-text)] mr-1">{l.target_ref_key}</span>}
          {l.target_title}
        </Link>
      ) : (
        <span className="text-xs text-rose-500 truncate" title="El documento no existe todavía">{l.target_title}</span>
      )}
      {l.target_status_name && <Badge color={l.target_status_color} className="shrink-0">{l.target_status_name}</Badge>}
      {!l.target_ref_key && !broken && <span className="text-[10px] text-[var(--text-muted)] shrink-0">{DOC_TYPE_LABELS[l.target_type]}</span>}
      {l.note && <span className="text-[11px] text-[var(--text-muted)] italic truncate">{l.note}</span>}
      {l.is_derived && <span className="ml-auto text-[10px] text-[var(--text-muted)] shrink-0">{l.source_journal_id ? 'en comentario' : 'desde el texto'}</span>}
      {onDelete && !l.is_derived && (
        <button type="button" onClick={onDelete} aria-label="Eliminar enlace" className="icon-btn ml-auto hover:text-red-500 shrink-0">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

function AddLinkModal({ docId, spaceId, kind, onClose }: { docId: string; spaceId: string; kind: 'requirement' | 'document'; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<SuggestItem | null>(null);
  const [linkType, setLinkType] = useState('relates');
  const [note, setNote] = useState('');
  const { data = [], isFetching } = useSuggest(spaceId, q, [kind]);
  const { create } = useLinkMutations(docId);
  const types = kind === 'requirement' ? REQ_LINK_TYPES : DOC_LINK_TYPES;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={kind === 'requirement' ? 'Relacionar requerimiento' : 'Vincular documento'}
      className="max-w-lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!picked || create.isPending}
            onClick={() =>
              picked && create.mutate({ target_id: picked.id, link_type: linkType, note }, { onSuccess: onClose, onError: (e) => toast.error(errorMessage(e)) })
            }
          >
            Vincular
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="field-label">Tipo de relación</span>
          <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="input">
            {types.map((t) => <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número, clave o título…" className="input" />
        <div className="border border-[var(--border-color)] rounded-lg">
          <SuggestionList items={data.filter((d) => d.id !== docId)} active={picked ? data.findIndex((d) => d.id === picked.id) : -1} onHover={() => undefined} onPick={setPicked} loading={isFetching} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="input" />
      </div>
    </Modal>
  );
}

export default function LinksPanel({ docId, spaceId, canEdit }: { docId: string; spaceId: string; canEdit: boolean }) {
  const { data: links = [] } = useLinks(docId);
  const { data: backlinks = [] } = useBacklinks(docId);
  const { remove } = useLinkMutations(docId);
  const [adding, setAdding] = useState<'requirement' | 'document' | null>(null);

  const manualReq = links.filter((l) => !l.is_derived && l.target_type === 'requirement');
  const manualDocs = links.filter((l) => !l.is_derived && l.target_type !== 'requirement');
  const derived = links.filter((l) => l.is_derived);
  const del = (id: string) => remove.mutate(id, { onError: (e) => toast.error(errorMessage(e)) });

  const section = (title: string, icon: React.ReactNode, items: DocumentLink[], empty: string, action?: React.ReactNode, deletable = false) => (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{icon}{title}<span className="font-mono text-[10px]">{items.length}</span></h3>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--bg-surface)]">
          {items.map((l) => <LinkRow key={l.id} l={l} onDelete={deletable && canEdit ? () => del(l.id) : undefined} />)}
        </ul>
      )}
    </section>
  );

  const addBtn = (kind: 'requirement' | 'document', label: string) =>
    canEdit && (
      <button type="button" className="btn-ghost text-xs" onClick={() => setAdding(kind)}>
        <Plus className="h-3.5 w-3.5" /> {label}
      </button>
    );

  return (
    <div className="space-y-6">
      {section('Relaciones con requerimientos', <GitBranch className="h-3.5 w-3.5" />, manualReq, 'Sin relaciones.', addBtn('requirement', 'Relacionar'), true)}
      {section('Documentos vinculados', <FileText className="h-3.5 w-3.5" />, manualDocs, 'Sin documentos vinculados.', addBtn('document', 'Vincular'), true)}
      {section('Referencias en el texto', <Link2 className="h-3.5 w-3.5" />, derived, 'Usa #123 o [[Documento]] en la descripción o en comentarios.')}
      {section('Referenciado desde', <Link2 className="h-3.5 w-3.5 rotate-180" />, backlinks, 'Nadie referencia este elemento todavía.')}
      {adding && <AddLinkModal docId={docId} spaceId={spaceId} kind={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
