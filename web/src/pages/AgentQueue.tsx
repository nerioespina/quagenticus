import { Link, useOutletContext } from 'react-router-dom';
import { Bot, Clock } from 'lucide-react';
import { Badge, EmptyState, Skeleton } from '../components/ui/misc';
import { useAgentQueue } from '../hooks/useAdmin';
import { useAuth } from '../lib/auth';
import { formatRelative } from '../lib/dates';
import type { SpaceContext } from '../components/layout/AppLayout';

export default function AgentQueue() {
  const { spaceId } = useOutletContext<SpaceContext>();
  const { data: items = [], isLoading } = useAgentQueue(spaceId);
  const isAdmin = useAuth((s) => s.user?.is_account_admin);
  const claimed = items.filter((i) => i.is_claimed);
  const waiting = items.filter((i) => !i.is_claimed);

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Cola de agentes</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Requerimientos en estados que admiten agentes, ordenados por prioridad. Los agentes los reclaman por MCP con un lease renovable que expira automáticamente.
          {isAdmin && <> Gestiona agentes y API keys en <Link to="/admin?tab=agents" className="underline">Administración → Agentes</Link>.</>}
        </p>
      </div>
      {isLoading ? <Skeleton className="h-40" /> : items.length === 0 ? (
        <EmptyState icon={<Bot className="h-6 w-6" />} title="La cola está vacía" description="Mueve requerimientos a un estado marcado como «Agentes» (por defecto, Listo)." />
      ) : (
        <>
          {[['En curso', claimed], ['Esperando', waiting]].map(([title, list]) => (
            <section key={title as string} className="space-y-2">
              <h3 className="section-title">{title as string} <span className="font-mono text-[10px]">{(list as typeof items).length}</span></h3>
              <ul className="space-y-2">
                {(list as typeof items).map((r, i) => (
                  <li key={r.id}>
                    <Link to={`/spaces/${spaceId}/requirements/${r.id}`} className="card p-3 flex items-center gap-3 hover:border-[var(--accent-color)]/40">
                      <span className="text-xs font-mono text-[var(--text-muted)] w-6">{r.is_claimed ? <Bot className="h-4 w-4 text-violet-500" /> : i + 1}</span>
                      <span className="font-mono text-xs text-[var(--accent-text)]">{r.ref_key}</span>
                      <span className="text-sm text-[var(--text-primary)] truncate flex-1">{r.title}</span>
                      <Badge color={r.priority_color}>{r.priority_name}</Badge>
                      {r.readiness_score != null && <span className="text-[10px] font-mono text-[var(--text-muted)]">DoR {r.readiness_score}%</span>}
                      {r.is_claimed && r.claim_expires_at && (
                        <span className="text-[10px] text-violet-500 flex items-center gap-1"><Clock className="h-3 w-3" />{r.claimed_by_agent_name} · expira {formatRelative(r.claim_expires_at)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
