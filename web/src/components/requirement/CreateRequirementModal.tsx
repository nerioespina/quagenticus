import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import MarkdownEditor from '../editor/MarkdownEditor';
import MemberPicker from '../members/MemberPicker';
import LabelPicker from './LabelPicker';
import { useCategories, useMilestones, usePriorities, useStatuses, useTrackers } from '../../hooks/useCatalogs';
import { useCreateRequirement } from '../../hooks/useRequirements';
import { useSpaceMembers } from '../../hooks/useSpaces';
import { useSuggest } from '../../hooks/useSearch';
import { deleteStaged } from '../../hooks/useAttachments';
import { errorMessage } from '../../lib/api';
import type { LabelRef, UploadedFile } from '../../lib/api';
import { formatBytes } from '../../lib/colors';
import { confirmDialog } from '../ui/Confirm';
import { TERMS } from '../../lib/i18n';

export const CANONICAL_TEMPLATE = `## Situación actual

## Problemas a resolver

## Soluciones propuestas

## Criterios de aceptación
- [ ] 

## Consideraciones
`;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  defaultStatusId?: string | null;
  parentId?: string | null;
  onCreated?: (id: string) => void;
}

const empty = {
  tracker_id: '', title: '', body_md: '', priority_id: '', status_id: '', category_id: '', milestone_id: '',
  start_date: '', due_date: '', estimated_hours: '', parent_id: '',
};

export default function CreateRequirementModal({ isOpen, onClose, spaceId, defaultStatusId, parentId, onCreated }: Props) {
  const navigate = useNavigate();
  const { data: trackers = [] } = useTrackers();
  const { data: priorities = [] } = usePriorities();
  const { data: statuses = [] } = useStatuses();
  const { data: categories = [] } = useCategories(spaceId);
  const { data: milestones = [] } = useMilestones(spaceId);
  const { data: spaceMembers = [] } = useSpaceMembers(spaceId);
  const create = useCreateRequirement(spaceId);

  const [form, setForm] = useState(empty);
  const [members, setMembers] = useState<string[]>([]);
  const [lead, setLead] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelRef[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [another, setAnother] = useState(false);
  const [parentQuery, setParentQuery] = useState('');
  const { data: parentSuggestions = [] } = useSuggest(spaceId, parentQuery, ['requirement'], !!parentQuery);

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // defaults when opening
  useEffect(() => {
    if (!isOpen) return;
    setForm((f) => ({
      ...f,
      tracker_id: f.tracker_id || trackers[0]?.id || '',
      priority_id: f.priority_id || priorities.find((p) => p.is_default)?.id || '',
      status_id: defaultStatusId ?? f.status_id,
      parent_id: parentId ?? f.parent_id,
    }));
  }, [isOpen, trackers, priorities, defaultStatusId, parentId]);

  const tracker = trackers.find((t) => t.id === form.tracker_id);
  const dirty = !!(form.title || form.body_md || members.length || labels.length || files.length);
  const memberById = useMemo(() => Object.fromEntries(spaceMembers.map((m) => [m.id, m])), [spaceMembers]);

  const reset = (keepType: boolean) => {
    setForm((f) => ({ ...empty, tracker_id: keepType ? f.tracker_id : '', priority_id: keepType ? f.priority_id : '', status_id: defaultStatusId ?? '', parent_id: parentId ?? '' }));
    setMembers([]);
    setLead(null);
    setLabels([]);
    setFiles([]);
  };

  const close = async () => {
    if (dirty && (await confirmDialog({ title: 'Descartar requerimiento', message: 'Perderás lo que has escrito.', confirmLabel: 'Descartar', danger: true })) === false) return;
    files.forEach((f) => deleteStaged(f.id).catch(() => undefined));
    reset(false);
    onClose();
  };

  const submit = (open: boolean) => {
    if (!form.tracker_id || !form.title.trim()) return;
    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      toast.error('La fecha límite no puede ser anterior al inicio');
      return;
    }
    create.mutate(
      {
        tracker_id: form.tracker_id,
        title: form.title.trim(),
        body_md: form.body_md,
        priority_id: form.priority_id || undefined,
        status_id: form.status_id || null,
        category_id: form.category_id || null,
        milestone_id: form.milestone_id || null,
        parent_id: form.parent_id || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        member_ids: members,
        lead_user_id: lead,
        label_ids: labels.map((l) => l.id),
        attachment_ids: files.map((f) => f.id),
      },
      {
        onSuccess: (req) => {
          toast.success(`${req.ref_key} creado`);
          onCreated?.(req.id);
          if (open) {
            reset(false);
            onClose();
            navigate(`/spaces/${spaceId}/requirements/${req.id}`);
          } else if (another) {
            reset(true);
          } else {
            reset(false);
            onClose();
          }
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const applyTemplate = () => set('body_md', tracker?.template_body_md || CANONICAL_TEMPLATE);

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Nuevo requerimiento"
      className="max-w-5xl"
      dismissable={!create.isPending}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="accent-[var(--accent-color)]" />
            Crear otro
          </label>
          <button type="button" className="btn-secondary" onClick={close}>Cancelar</button>
          <button type="button" className="btn-secondary" disabled={!form.title.trim() || create.isPending} onClick={() => submit(true)}>
            Crear y abrir
          </button>
          <button type="button" className="btn-primary" disabled={!form.title.trim() || !form.tracker_id || create.isPending} onClick={() => submit(false)}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_280px] gap-5"
      >
        <div className="space-y-3 min-w-0">
          <label className="block space-y-1">
            <span className="field-label">Título *</span>
            <input autoFocus required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Qué se necesita, en una frase" className="input text-base" />
          </label>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="field-label">Descripción</span>
              {!form.body_md.trim() && (
                <button type="button" onClick={applyTemplate} className="text-[11px] text-[var(--accent-text)] hover:underline flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Usar plantilla {tracker?.template_body_md ? `de ${tracker.name}` : 'de secciones'}
                </button>
              )}
            </div>
            <MarkdownEditor
              value={form.body_md}
              onChange={(v) => set('body_md', v)}
              spaceId={spaceId}
              uploadMode="staged"
              onFilesUploaded={(up) => setFiles((f) => [...f, ...up])}
              rows={12}
              placeholder="Contexto, problema y criterios de aceptación. #123 referencia requerimientos, [[Documento]] enlaza documentos."
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {files.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] max-w-[240px]">
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate">{f.filename}</span>
                    <span className="text-[var(--text-muted)]">{formatBytes(f.byte_size)}</span>
                    <button
                      type="button"
                      className="icon-btn p-0.5"
                      aria-label={`Quitar ${f.filename}`}
                      onClick={() => {
                        setFiles((l) => l.filter((x) => x.id !== f.id));
                        set('body_md', form.body_md.replace(new RegExp(`!?\\[[^\\]]*\\]\\(attachment:${f.id}\\)\\n?`, 'g'), ''));
                        deleteStaged(f.id).catch(() => undefined);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3 min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="field-label">{TERMS.tracker} *</span>
              <select required value={form.tracker_id} onChange={(e) => set('tracker_id', e.target.value)} className="input py-1.5 text-xs">
                {trackers.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="field-label">Prioridad</span>
              <select value={form.priority_id} onChange={(e) => set('priority_id', e.target.value)} className="input py-1.5 text-xs">
                {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="field-label">Estado inicial</span>
            <select value={form.status_id} onChange={(e) => set('status_id', e.target.value)} className="input py-1.5 text-xs">
              <option value="">Por defecto del tipo</option>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="field-label">Miembros</span>
              <MemberPicker
                spaceId={spaceId}
                selected={members}
                leadId={lead}
                onToggle={(id, on) => {
                  setMembers((m) => (on ? [...m, id] : m.filter((x) => x !== id)));
                  if (!on && lead === id) setLead(null);
                }}
                onSetLead={setLead}
              />
            </div>
            {members.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">Nadie asignado. Los miembros reciben notificaciones.</p>
            ) : (
              <ul className="space-y-1">
                {members.map((id) => (
                  <li key={id} className="flex items-center gap-2 text-xs min-w-0">
                    <Avatar name={memberById[id]?.display_name} url={memberById[id]?.avatar_url} size={20} />
                    <span className="truncate flex-1">{memberById[id]?.display_name ?? '…'}</span>
                    <button
                      type="button"
                      onClick={() => setLead(lead === id ? null : id)}
                      aria-label="Responsable"
                      title={lead === id ? 'Responsable' : 'Hacer responsable'}
                      className={lead === id ? 'text-amber-500' : 'text-[var(--text-muted)] hover:text-amber-500'}
                    >
                      <Crown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="icon-btn p-0.5" aria-label="Quitar" onClick={() => { setMembers((m) => m.filter((x) => x !== id)); if (lead === id) setLead(null); }}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1">
            <span className="field-label">Etiquetas</span>
            <LabelPicker spaceId={spaceId} assigned={labels} onToggle={(l, on) => setLabels((ls) => (on ? ls.filter((x) => x.id !== l.id) : [...ls, l]))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="field-label">Categoría</span>
              <select value={form.category_id} onChange={(e) => set('category_id', e.target.value)} className="input py-1.5 text-xs">
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="field-label">{TERMS.milestone}</span>
              <select value={form.milestone_id} onChange={(e) => set('milestone_id', e.target.value)} className="input py-1.5 text-xs">
                <option value="">—</option>
                {milestones.filter((m) => m.status !== 'closed').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="field-label">Inicio</span>
              <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className="input py-1 text-xs" />
            </label>
            <label className="block space-y-1">
              <span className="field-label">Fecha límite</span>
              <input type="date" value={form.due_date} min={form.start_date || undefined} onChange={(e) => set('due_date', e.target.value)} className="input py-1 text-xs" />
            </label>
            <label className="block space-y-1 col-span-2">
              <span className="field-label">Estimación (horas)</span>
              <input type="number" min={0} step={0.5} value={form.estimated_hours} onChange={(e) => set('estimated_hours', e.target.value)} className="input py-1 text-xs" />
            </label>
          </div>

          <div className="space-y-1">
            <span className="field-label">Requerimiento padre</span>
            {form.parent_id ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="truncate flex-1">{parentSuggestions.find((p) => p.id === form.parent_id)?.ref_key ?? 'Seleccionado'}</span>
                <button type="button" className="icon-btn p-0.5" aria-label="Quitar padre" onClick={() => set('parent_id', '')}><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <>
                <input value={parentQuery} onChange={(e) => setParentQuery(e.target.value)} placeholder="Buscar…" className="input py-1 text-xs" />
                {parentQuery && (
                  <ul className="max-h-32 overflow-y-auto border border-[var(--border-color)] rounded-md">
                    {parentSuggestions.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="menu-item" onClick={() => { set('parent_id', p.id); setParentQuery(''); }}>
                          <span className="font-mono text-[var(--accent-text)]">{p.ref_key}</span> <span className="truncate">{p.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </aside>
      </form>
    </Modal>
  );
}
