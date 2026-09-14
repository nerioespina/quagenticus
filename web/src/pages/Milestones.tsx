import { Link, useOutletContext } from 'react-router-dom';
import { MilestonesAdmin } from '../components/admin/TaxonomyAdmin';
import { useMilestones } from '../hooks/useCatalogs';
import { formatDate } from '../lib/dates';
import type { SpaceContext } from '../components/layout/AppLayout';

export default function Milestones() {
  const { spaceId, space } = useOutletContext<SpaceContext>();
  const { data: milestones = [] } = useMilestones(spaceId);
  const canEdit = space?.my_role === 'maintainer' || space?.my_role === 'admin';
  const open = milestones.filter((m) => m.status !== 'closed');
  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-5">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Hitos</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {open.map((m) => {
          const pct = m.total ? Math.round(((m.closed ?? 0) / m.total) * 100) : 0;
          return (
            <Link key={m.id} to={`/spaces/${spaceId}/requirements?milestone_id=${m.id}&open=all`} className="card p-4 space-y-2 hover:border-[var(--accent-color)]/40">
              <p className="font-semibold text-sm text-[var(--text-primary)]">{m.name}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{m.due_date ? `Objetivo: ${formatDate(m.due_date)}` : 'Sin fecha objetivo'} · {m.avg_done_ratio ?? 0}% avance medio</p>
              <div className="h-2 rounded-full bg-[var(--bg-surface-hover)] overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
              <p className="text-[11px] text-[var(--text-secondary)]">{m.closed ?? 0} de {m.total ?? 0} cerrados</p>
            </Link>
          );
        })}
      </div>
      <MilestonesAdmin spaceId={spaceId} canEdit={canEdit} />
    </div>
  );
}
