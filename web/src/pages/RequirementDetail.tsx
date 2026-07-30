import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  MessageSquare,
  FileText,
  Link2,
  GitCommit,
  Edit2,
  Save,
  X,
  Lock,
} from 'lucide-react';
import { useRequirement, useTransitionRequirement, useUpdateRequirement } from '../hooks/useRequirements';
import { useStatuses, usePriorities } from '../hooks/useCatalogs';
import MemberManager from '../components/MemberManager';
import CommentSection from '../components/CommentSection';
import RequirementAttachments from '../components/RequirementAttachments';
import RequirementSubreqs from '../components/RequirementSubreqs';
import RequirementSidebarExtras from '../components/RequirementSidebarExtras';
import MarkdownToolbar from '../components/MarkdownToolbar';

const STATUS_COLORS: Record<string, string> = {
  new:          'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)] border-[var(--badge-neutral-text)]/30',
  triaged:      'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)] border-[var(--badge-neutral-text)]/30',
  ready:        'bg-[var(--status-ready-bg)] text-[var(--status-ready-text)] border-[var(--status-ready-text)]/30',
  in_analysis:  'bg-[var(--status-analysis-bg)] text-[var(--status-analysis-text)] border-[var(--status-analysis-text)]/30',
  in_progress:  'bg-[var(--status-progress-bg)] text-[var(--status-progress-text)] border-[var(--status-progress-text)]/30',
  in_review:    'bg-[var(--status-review-bg)] text-[var(--status-review-text)] border-[var(--status-review-text)]/30',
  resolved:     'bg-[var(--status-resolved-bg)] text-[var(--status-resolved-text)] border-[var(--status-resolved-text)]/30',
  closed:       'bg-[var(--badge-neutral-dim-bg)] text-[var(--badge-neutral-dim-text)] border-[var(--badge-neutral-dim-text)]/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent:    'bg-[var(--priority-urgent-bg)] text-[var(--priority-urgent-text)] border-[var(--priority-urgent-text)]/30',
  high:      'bg-[var(--priority-high-bg)] text-[var(--priority-high-text)] border-[var(--priority-high-text)]/30',
  normal:    'bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)] border-[var(--badge-neutral-text)]/30',
  low:       'bg-[var(--badge-neutral-dim-bg)] text-[var(--badge-neutral-dim-text)] border-[var(--badge-neutral-dim-text)]/30',
};

function MarkdownPreview({ content }: { content: string }) {
  if (!content) {
    return <p className="text-sm text-[var(--text-muted)] italic">No se ha especificado una descripción para este requerimiento.</p>;
  }
  const lines = content.split('\n');
  return (
    <div className="max-w-none text-sm space-y-3">
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

export default function RequirementDetail() {
  const { spaceId = '', reqId = '' } = useParams<{ spaceId: string; reqId: string }>();
  const navigate = useNavigate();
  const { data: req, isLoading } = useRequirement(reqId);
  const { data: statuses = [] } = useStatuses();
  const { data: priorities = [] } = usePriorities();

  const transitionReq = useTransitionRequirement();
  const updateReq = useUpdateRequirement();

  const [activeTab, setActiveTab] = useState<'description' | 'comments' | 'attachments' | 'subrequirements'>('description');

  // Edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');

  const [isEditingBody, setIsEditingBody] = useState(false);
  const [bodyValue, setBodyValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (req) {
      setTitleValue(req.title);
      setBodyValue(req.body_md);
    }
  }, [req]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-[var(--text-muted)] animate-spin" />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="p-8 text-center text-[var(--text-muted)]">
        <p className="text-base">Requerimiento no encontrado.</p>
        <button
          onClick={() => navigate(`/spaces/${spaceId}/requirements`)}
          className="mt-4 px-4 py-2 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] text-sm font-semibold transition-colors"
        >
          Volver al listado
        </button>
      </div>
    );
  }

  const isClosed =
    req.status_key === 'closed' ||
    req.status_key === 'resolved' ||
    req.status_key === 'discarded';

  const handleSaveTitle = () => {
    if (!titleValue.trim() || titleValue.trim() === req.title) {
      setIsEditingTitle(false);
      return;
    }
    updateReq.mutate(
      { id: req.id, title: titleValue.trim() },
      { onSuccess: () => setIsEditingTitle(false) }
    );
  };

  const handleSaveBody = () => {
    updateReq.mutate(
      { id: req.id, body_md: bodyValue },
      { onSuccess: () => setIsEditingBody(false) }
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-page)]/70 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/spaces/${spaceId}/requirements`)}
            className="p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-mono font-bold text-[var(--accent-text)] px-2 py-0.5 rounded bg-[var(--accent-soft)] border border-[var(--accent-color)]/30">
              {req.ref_key}
            </span>

            {/* Status Transition Selector (Punto 1) */}
            <div className="flex items-center gap-1">
              <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider hidden sm:inline">
                Estado:
              </label>
              <select
                value={req.status_id}
                onChange={(e) =>
                  transitionReq.mutate({ id: req.id, to_status_id: e.target.value })
                }
                disabled={transitionReq.isPending}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border cursor-pointer focus:outline-none ${
                  STATUS_COLORS[req.status_key] ?? STATUS_COLORS.new
                }`}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-normal uppercase">
                    {s.name} {s.is_closed ? '(Cerrado)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Selector (Punto 2) */}
            <div className="flex items-center gap-1">
              <select
                value={req.priority_id}
                disabled={isClosed || updateReq.isPending}
                onChange={(e) =>
                  updateReq.mutate({ id: req.id, priority_id: e.target.value })
                }
                className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border cursor-pointer focus:outline-none ${
                  PRIORITY_COLORS[req.priority_key] ?? PRIORITY_COLORS.normal
                } disabled:opacity-60`}
              >
                {priorities.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[var(--bg-surface)] text-[var(--text-primary)] font-normal uppercase">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Closed Banner Notice */}
      {isClosed && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-2 text-xs text-amber-500 font-medium">
          <Lock className="h-3.5 w-3.5" />
          Requerimiento en estado cerrado. Cambia su estado en el menú superior para modificar título, descripción o detalles.
        </div>
      )}

      {/* Content Area (Left: Tabs/Body, Right: Metadata Sidebar) */}
      <div className="flex-1 overflow-y-auto flex">
        {/* Main Panel */}
        <div className="flex-1 p-8 space-y-6 max-w-4xl">
          {/* Title Section (Editable) */}
          <div>
            {!isEditingTitle ? (
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl font-bold text-[var(--text-primary)] leading-snug">{req.title}</h1>
                {!isClosed && (
                  <button
                    onClick={() => setIsEditingTitle(true)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                    title="Editar título"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  autoFocus
                  className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-1.5 text-xl font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                />
                <button
                  onClick={handleSaveTitle}
                  disabled={updateReq.isPending}
                  className="p-2 rounded-lg bg-[var(--accent-color)] text-white hover:bg-[var(--accent-color-hover)] transition-colors"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setTitleValue(req.title);
                    setIsEditingTitle(false);
                  }}
                  className="p-2 rounded-lg bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">
              Creado el {new Date(req.created_at).toLocaleDateString('es')} · Última actualización el {new Date(req.updated_at).toLocaleDateString('es')}
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 border-b border-[var(--border-color)]">
            <button
              onClick={() => setActiveTab('description')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'description'
                  ? 'border-[var(--accent-color)] text-[var(--accent-text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileText className="h-4 w-4" />
              Descripción
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'comments'
                  ? 'border-[var(--accent-color)] text-[var(--accent-text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Comentarios
            </button>
            <button
              onClick={() => setActiveTab('attachments')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'attachments'
                  ? 'border-[var(--accent-color)] text-[var(--accent-text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Link2 className="h-4 w-4" />
              Documentos & Archivos
            </button>
            <button
              onClick={() => setActiveTab('subrequirements')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'subrequirements'
                  ? 'border-[var(--accent-color)] text-[var(--accent-text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <GitCommit className="h-4 w-4" />
              Sub-requerimientos
            </button>
          </div>

          {/* Tab Content */}
          <div className="py-2">
            {activeTab === 'description' && (
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Detalle del requerimiento</span>
                  {!isClosed && !isEditingBody && (
                    <button
                      onClick={() => setIsEditingBody(true)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--bg-surface-hover)] hover:bg-[var(--border-color)] text-xs text-[var(--text-secondary)] font-semibold transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Editar Descripción
                    </button>
                  )}
                </div>

                {!isEditingBody ? (
                  <MarkdownPreview content={req.body_md} />
                ) : (
                  <div className="space-y-3">
                    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden bg-[var(--bg-surface-hover)]">
                      <MarkdownToolbar
                        textareaRef={textareaRef}
                        onValueChange={(val) => setBodyValue(val)}
                      />
                      <textarea
                        ref={textareaRef}
                        value={bodyValue}
                        onChange={(e) => setBodyValue(e.target.value)}
                        rows={12}
                        className="w-full bg-[var(--bg-input)] border-t border-[var(--border-color)] p-3 text-sm text-[var(--text-primary)] focus:outline-none font-mono resize-y"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setBodyValue(req.body_md);
                          setIsEditingBody(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] text-xs font-semibold text-[var(--text-secondary)]"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveBody}
                        disabled={updateReq.isPending}
                        className="px-4 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:bg-[var(--accent-color-hover)] disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {updateReq.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Guardar Descripción
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <CommentSection reqId={reqId} />
              </div>
            )}

            {activeTab === 'attachments' && (
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <RequirementAttachments spaceId={spaceId} reqId={reqId} />
              </div>
            )}

            {activeTab === 'subrequirements' && (
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <RequirementSubreqs spaceId={spaceId} reqId={reqId} />
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="w-80 border-l border-[var(--border-color)] bg-[var(--bg-page)] p-6 space-y-6 shrink-0 overflow-y-auto">
          {/* Readiness Score / Definition of Ready */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Definition of Ready
              </span>
              <span className="text-xs font-mono font-bold text-emerald-500">
                {req.readiness_score != null ? `${req.readiness_score}%` : '—'}
              </span>
            </div>
            {req.readiness_score != null && (
              <div className="w-full bg-[var(--bg-surface-hover)] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${req.readiness_score}%` }}
                />
              </div>
            )}
            <p className="text-[11px] text-[var(--text-muted)] leading-normal">
              Puntuación DoR calculada por criterios de completitud técnica y de negocio.
            </p>
          </div>

          {/* Members / Lead Management */}
          <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
            <MemberManager
              spaceId={spaceId}
              reqId={reqId}
              currentLeadUserId={req.lead_user_id}
            />
          </div>

          {/* Sidebar Extras: Classification, Labels, Estimations & Progress */}
          <RequirementSidebarExtras spaceId={spaceId} req={req} />
        </aside>
      </div>
    </div>
  );
}
