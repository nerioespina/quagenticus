import { useOutletContext } from 'react-router-dom';
import { Bot, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { useRequirements } from '../hooks/useRequirements';

interface Context { spaceId: string; search: string }

export default function AgentQueue() {
  const { spaceId, search } = useOutletContext<Context>();
  // Show requirements that are ready for an agent
  const { data: ready = [], isLoading } = useRequirements(spaceId);

  const readyReqs = ready.filter(r => r.status_id === 'ready' || r.claimed_by_agent_id != null);
  const filtered = readyReqs.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) || (r.ref_key ?? '').includes(search)
  );

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Cola de Agentes</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          FOR UPDATE SKIP LOCKED · Leases con expiración automática · MCP en desarrollo
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-3 p-4 bg-slate-900/60 border border-amber-500/20 rounded-xl text-xs text-amber-400 font-mono">
          MCP Server — Próximamente. Los requisitos en estado <strong>ready</strong> aparecen en cola para ser tomados por agentes.
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
          No hay requerimientos en estado <strong className="text-slate-400">ready</strong> para este espacio.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="flex items-start gap-4 p-4 bg-slate-900 border border-slate-800 hover:border-indigo-500/30 rounded-xl transition-all">
              <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4.5 w-4.5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-indigo-400">{r.ref_key}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    ready
                  </span>
                </div>
                <p className="font-medium text-slate-200 text-sm">{r.title}</p>
                {r.readiness_score != null && (
                  <div className="flex items-center gap-2 mt-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${r.readiness_score}%` }} />
                    </div>
                    <span className="text-xs font-mono text-slate-400">DoR {r.readiness_score}%</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-600 shrink-0">
                <Clock className="h-3 w-3" />
                {new Date(r.updated_at).toLocaleDateString('es')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
