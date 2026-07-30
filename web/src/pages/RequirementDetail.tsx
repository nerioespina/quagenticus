import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  MessageSquare,
  FileText,
  Link2,
  GitCommit,
} from 'lucide-react';
import { useRequirement } from '../hooks/useRequirements';
import MemberManager from '../components/MemberManager';
import CommentSection from '../components/CommentSection';
import RequirementAttachments from '../components/RequirementAttachments';
import RequirementSubreqs from '../components/RequirementSubreqs';
import RequirementSidebarExtras from '../components/RequirementSidebarExtras';

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

  const [activeTab, setActiveTab] = useState<'description' | 'comments' | 'attachments' | 'subrequirements'>('description');

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
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider border ${STATUS_COLORS[req.status_key] ?? STATUS_COLORS.new}`}>
              {req.status_name || req.status_key}
            </span>
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider border ${PRIORITY_COLORS[req.priority_key] ?? PRIORITY_COLORS.normal}`}>
              {req.priority_name || req.priority_key}
            </span>
          </div>
        </div>
      </div>

      {/* Content Area (Left: Tabs/Body, Right: Metadata Sidebar) */}
      <div className="flex-1 overflow-y-auto flex">
        {/* Main Panel */}
        <div className="flex-1 p-8 space-y-6 max-w-4xl">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] leading-snug">{req.title}</h1>
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
              <div className="p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                <MarkdownPreview content={req.body_md} />
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

          {/* Members / Lead Management (#8) */}
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
