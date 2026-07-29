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
  new:          'bg-slate-700/50 text-slate-400 border-slate-600/50',
  triaged:      'bg-slate-700/50 text-slate-300 border-slate-600/50',
  ready:        'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  in_analysis:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  in_progress:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  in_review:    'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  resolved:     'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  closed:       'bg-slate-800 text-slate-500 border-slate-700/50',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent:    'bg-red-500/20 text-red-400 border-red-500/30',
  high:      'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal:    'bg-slate-700/50 text-slate-300 border-slate-600/50',
  low:       'bg-slate-800/50 text-slate-500 border-slate-700/50',
};

function MarkdownPreview({ content }: { content: string }) {
  if (!content) {
    return <p className="text-sm text-slate-500 italic">No se ha especificado una descripción para este requerimiento.</p>;
  }
  const lines = content.split('\n');
  return (
    <div className="prose prose-invert max-w-none text-sm space-y-3">
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

export default function RequirementDetail() {
  const { spaceId = '', reqId = '' } = useParams<{ spaceId: string; reqId: string }>();
  const navigate = useNavigate();
  const { data: req, isLoading } = useRequirement(reqId);

  const [activeTab, setActiveTab] = useState<'description' | 'comments' | 'attachments' | 'subrequirements'>('description');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p className="text-base">Requerimiento no encontrado.</p>
        <button
          onClick={() => navigate(`/spaces/${spaceId}/requirements`)}
          className="mt-4 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
        >
          Volver al listado
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/spaces/${spaceId}/requirements`)}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30">
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
            <h1 className="text-2xl font-bold text-slate-100 leading-snug">{req.title}</h1>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Creado el {new Date(req.created_at).toLocaleDateString('es')} · Última actualización el {new Date(req.updated_at).toLocaleDateString('es')}
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-800/80">
            <button
              onClick={() => setActiveTab('description')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'description'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="h-4 w-4" />
              Descripción
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'comments'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Comentarios
            </button>
            <button
              onClick={() => setActiveTab('attachments')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'attachments'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Link2 className="h-4 w-4" />
              Documentos & Archivos
            </button>
            <button
              onClick={() => setActiveTab('subrequirements')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'subrequirements'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitCommit className="h-4 w-4" />
              Sub-requerimientos
            </button>
          </div>

          {/* Tab Content */}
          <div className="py-2">
            {activeTab === 'description' && (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80">
                <MarkdownPreview content={req.body_md} />
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80">
                <CommentSection reqId={reqId} />
              </div>
            )}

            {activeTab === 'attachments' && (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80">
                <RequirementAttachments spaceId={spaceId} reqId={reqId} />
              </div>
            )}

            {activeTab === 'subrequirements' && (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80">
                <RequirementSubreqs spaceId={spaceId} reqId={reqId} />
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="w-80 border-l border-slate-800/80 bg-slate-950/40 p-6 space-y-6 shrink-0 overflow-y-auto">
          {/* Readiness Score / Definition of Ready */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Definition of Ready
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {req.readiness_score != null ? `${req.readiness_score}%` : '—'}
              </span>
            </div>
            {req.readiness_score != null && (
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${req.readiness_score}%` }}
                />
              </div>
            )}
            <p className="text-[11px] text-slate-500 leading-normal">
              Puntuación DoR calculada por criterios de completitud técnica y de negocio.
            </p>
          </div>

          {/* Members / Lead Management (#8) */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80">
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
